"""Google Gemini API client integration for structured recipe and report generation."""

from __future__ import annotations
import concurrent.futures
import logging
import os
import time
from typing import Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load local environment variables from .env
load_dotenv()

# Circuit breaker state: skip API calls if quota was recently exhausted
_circuit_broken_until: float = 0.0
_circuit_breaker_reason: str = ""


def get_gemini_callable(api_key: Optional[str] = None, model_name: str = "gemini-3.8-flash"):
    """
    Returns a callable `(system_prompt: str, user_prompt: str) -> str`
    powered by the Google GenAI SDK.
    Includes fast failover and a circuit breaker for quota/rate limit errors.
    """
    global _circuit_broken_until, _circuit_breaker_reason

    # If circuit breaker is active, skip remote call immediately (< 0.1ms)
    if time.time() < _circuit_broken_until:
        logger.info(
            "Gemini API circuit breaker active (for next %ds): %s. Using instant engine.",
            int(_circuit_broken_until - time.time()),
            _circuit_breaker_reason,
        )
        return None

    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key or not key.strip():
        return None

    try:
        from google import genai
        client = genai.Client(api_key=key.strip())

        def gemini_call(system_prompt: str, user_prompt: str) -> str:
            global _circuit_broken_until, _circuit_breaker_reason

            candidate_models = [model_name, "gemini-2.5-flash"]
            last_err = None

            for m in candidate_models:
                try:
                    def do_call():
                        return client.models.generate_content(
                            model=m,
                            contents=user_prompt,
                            config={
                                "system_instruction": system_prompt,
                                "response_mime_type": "application/json",
                            },
                        )

                    # Hard 5.0 second deadline per call
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                        future = ex.submit(do_call)
                        response = future.result(timeout=5.0)
                        return response.text

                except concurrent.futures.TimeoutError:
                    logger.warning("Gemini model %s timed out after 5.0s. Falling back to local engine.", m)
                    last_err = TimeoutError(f"Gemini call to {m} timed out after 5.0s")
                    break

                except Exception as e:
                    err_str = str(e).lower()
                    last_err = e

                    # If quota exhausted (429), trip circuit breaker for 3 minutes and break immediately
                    if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                        _circuit_broken_until = time.time() + 180.0
                        _circuit_breaker_reason = "Free tier quota exhausted (429)"
                        logger.warning("Gemini quota exhausted (429). Tripping circuit breaker for 3m: %s", e)
                        break
                    elif "401" in err_str or "403" in err_str or "unauthenticated" in err_str or "permission" in err_str:
                        _circuit_broken_until = time.time() + 300.0
                        _circuit_breaker_reason = "API authentication or permission error"
                        logger.warning("Gemini auth error. Tripping circuit breaker for 5m: %s", e)
                        break
                    else:
                        logger.warning("Gemini model %s failed: %s", m, e)
                        continue

            raise last_err

        return gemini_call
    except Exception as e:
        logger.warning("Failed to initialize Google GenAI client: %s", e)
        return None
