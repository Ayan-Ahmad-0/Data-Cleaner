"""Errors for chart AI module."""

from analyst.errors import (
    AnalystError,
    LLMBadResponseError,
    LLMTimeoutError,
    LLMUnavailableError,
    RateLimitError,
)


class AIChartsDisabledError(AnalystError):
    """Raised when chart AI features are disabled via flag or missing API key."""
    def __init__(self, message: str = "AI chart features are currently disabled.") -> None:
        super().__init__(message)


__all__ = [
    "AIChartsDisabledError",
    "LLMUnavailableError",
    "LLMTimeoutError",
    "LLMBadResponseError",
    "RateLimitError",
]
