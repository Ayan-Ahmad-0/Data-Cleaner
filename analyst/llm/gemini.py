"""Google Gemini API client integration using official google-genai SDK."""

from __future__ import annotations
import concurrent.futures
import json
import logging
import os
import time
from typing import Optional, Type, TypeVar
from pydantic import BaseModel, ValidationError

from analyst.errors import (
    LLMBadResponseError,
    LLMTimeoutError,
    LLMUnavailableError,
    RateLimitError,
)
from analyst.limits import AnalystLimits
from analyst.llm.base import LLMClient

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class GeminiClient(LLMClient):
    """Production LLM client calling Google Gemini via the official google-genai SDK."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        limits: Optional[AnalystLimits] = None,
    ) -> None:
        self.limits = limits or AnalystLimits()
        self.api_key = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
        self.model_name = model_name or self.limits.model_name

        if not self.api_key:
            logger.warning("GeminiClient initialized without GEMINI_API_KEY.")

        self._client = None
        if self.api_key:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.error("Failed to initialize google.genai Client: %s", e)

    def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
    ) -> T:
        if not self.api_key or self._client is None:
            raise LLMUnavailableError(
                "Gemini API key is not configured on the server. Please set GEMINI_API_KEY.",
                technical_detail="Missing GEMINI_API_KEY or genai.Client failure",
            )

        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=response_model,
            temperature=self.limits.temperature,
            max_output_tokens=self.limits.max_output_tokens,
        )

        max_network_attempts = 2
        last_exception = None

        for attempt in range(1, max_network_attempts + 1):
            try:
                def _invoke():
                    return self._client.models.generate_content(
                        model=self.model_name,
                        contents=user_prompt,
                        config=config,
                    )

                # Enforce configured timeout
                timeout_sec = self.limits.llm_timeout_seconds
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(_invoke)
                    response = future.result(timeout=timeout_sec)

                # Inspect candidates and finish reason
                if not response.candidates:
                    raise LLMBadResponseError("Gemini returned no candidates.")

                candidate = response.candidates[0]
                finish_reason = getattr(candidate, "finish_reason", None)
                finish_str = str(finish_reason).upper() if finish_reason else ""
                if "SAFETY" in finish_str or "BLOCKED" in finish_str:
                    logger.warning("Gemini response was blocked by safety filters.")
                    raise LLMBadResponseError("The response was filtered by safety policies.")

                raw_text = response.text
                if not raw_text or not raw_text.strip():
                    raise LLMBadResponseError("Gemini returned an empty response.")

                # Validate with Pydantic
                try:
                    return response_model.model_validate_json(raw_text)
                except ValidationError as ve:
                    # Attempt cleanup if fenced inside markdown ```json ... ```
                    cleaned = raw_text.strip()
                    if cleaned.startswith("```json"):
                        cleaned = cleaned[7:]
                    elif cleaned.startswith("```"):
                        cleaned = cleaned[3:]
                    if cleaned.endswith("```"):
                        cleaned = cleaned[:-3]
                    cleaned = cleaned.strip()

                    try:
                        return response_model.model_validate_json(cleaned)
                    except Exception:
                        logger.error("Failed to parse structured JSON from Gemini: %s", ve)
                        raise LLMBadResponseError(f"Malformed JSON returned by model: {ve}")

            except concurrent.futures.TimeoutError:
                logger.warning("Gemini API call timed out after %ss (attempt %d/%d)", timeout_sec, attempt, max_network_attempts)
                last_exception = LLMTimeoutError(timeout_sec)
                break  # Don't retry timeouts

            except Exception as e:
                err_text = str(e).lower()
                last_exception = e

                # Rate limit / Quota check
                if "429" in err_text or "resource_exhausted" in err_text or "quota" in err_text:
                    logger.warning("Gemini API rate limit or quota exceeded: %s", e)
                    raise RateLimitError(
                        "Ask AI rate limit reached. Please wait a moment or try again later.",
                        technical_detail=f"Gemini quota/429: {e}",
                    )

                if "401" in err_text or "403" in err_text or "unauthenticated" in err_text or "permission" in err_text:
                    logger.error("Gemini API key authentication error: %s", e)
                    raise LLMUnavailableError(
                        "AI service authentication failed. Please check server configuration.",
                        technical_detail="401/403 Auth error",
                    )

                # Transient network or 5xx error: exponential backoff retry
                if attempt < max_network_attempts:
                    sleep_time = 0.5 * (2 ** (attempt - 1))
                    logger.info("Transient error calling Gemini (%s). Retrying in %.1fs...", e, sleep_time)
                    time.sleep(sleep_time)
                    continue

        if isinstance(last_exception, (LLMTimeoutError, RateLimitError, LLMBadResponseError, LLMUnavailableError)):
            raise last_exception

        raise LLMUnavailableError(
            "Ask AI is temporarily unavailable. Please try again or use the SQL box.",
            technical_detail=str(last_exception),
        )
