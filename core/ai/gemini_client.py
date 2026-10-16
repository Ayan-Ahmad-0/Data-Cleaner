"""Google Gemini API client integration for structured recipe and report generation."""

from __future__ import annotations
import os
from typing import Optional
from dotenv import load_dotenv

# Load local environment variables from .env
load_dotenv()


def get_gemini_callable(api_key: Optional[str] = None, model_name: str = "gemini-2.5-flash"):
    """
    Returns a callable `(system_prompt: str, user_prompt: str) -> str`
    powered by the Google GenAI SDK.
    """
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        return None

    try:
        from google import genai
        client = genai.Client(api_key=key)

        def gemini_call(system_prompt: str, user_prompt: str) -> str:
            response = client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config={
                    "system_instruction": system_prompt,
                    "response_mime_type": "application/json",
                },
            )
            return response.text

        return gemini_call
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to initialize Google GenAI client: %s", e)
        return None
