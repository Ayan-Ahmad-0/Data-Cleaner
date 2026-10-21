"""AI Analyst module providing natural language question answering with sandboxed DuckDB execution."""

from analyst.errors import (
    AnalystError,
    LLMBadResponseError,
    LLMTimeoutError,
    LLMUnavailableError,
    QuestionNotAllowedError,
    RateLimitError,
)
from analyst.limits import AnalystLimits, AnalystRateLimiter
from analyst.llm.base import LLMClient
from analyst.llm.fake import FakeLLMClient
from analyst.llm.gemini import GeminiClient
from analyst.schemas import AnalystResult, LLMResponse
from analyst.service import ask

__all__ = [
    "ask",
    "AnalystResult",
    "LLMResponse",
    "LLMClient",
    "GeminiClient",
    "FakeLLMClient",
    "AnalystLimits",
    "AnalystRateLimiter",
    "AnalystError",
    "RateLimitError",
    "LLMUnavailableError",
    "LLMTimeoutError",
    "LLMBadResponseError",
    "QuestionNotAllowedError",
]
