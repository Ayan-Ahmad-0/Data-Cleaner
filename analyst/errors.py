"""Typed exceptions for AI Analyst operations."""

from __future__ import annotations
from typing import Optional

from explore.errors import (
    DataNotFoundError,
    ExploreError,
    QueryNotAllowedError,
    QuerySyntaxError,
    QueryTimeoutError,
    QueryTooLargeError,
    ServerBusyError,
)


class AnalystError(ExploreError):
    """Base class for all AI Analyst errors."""
    def __init__(self, message: str, technical_detail: Optional[str] = None):
        super().__init__(message)
        self.user_message = message
        self.technical_detail = technical_detail or message


class RateLimitError(AnalystError):
    """Raised when a user or global rate limit / daily quota is exceeded."""
    def __init__(self, message: str = "Rate limit exceeded. Please wait a moment before asking another question.", technical_detail: Optional[str] = None):
        super().__init__(message, technical_detail)


class LLMUnavailableError(AnalystError):
    """Raised when the LLM service is offline, unreachable, or returns a 5xx error."""
    def __init__(self, message: str = "Ask AI is currently unavailable or busy. Please try again soon, or use the SQL box.", technical_detail: Optional[str] = None):
        super().__init__(message, technical_detail)


class LLMTimeoutError(AnalystError):
    """Raised when an LLM call exceeds the configured request timeout."""
    def __init__(self, timeout_seconds: float = 30.0, technical_detail: Optional[str] = None):
        msg = f"AI analysis timed out after {timeout_seconds:.1f} seconds. Try asking a simpler or more specific question."
        super().__init__(msg, technical_detail or f"Timeout after {timeout_seconds}s")
        self.timeout_seconds = timeout_seconds


class LLMBadResponseError(AnalystError):
    """Raised when the LLM returns empty, malformed, or invalid output."""
    def __init__(self, message: str = "The AI model returned an unparseable response. Please rephrase your question.", technical_detail: Optional[str] = None):
        super().__init__(message, technical_detail)


class QuestionNotAllowedError(AnalystError):
    """Raised when the input question violates constraints (e.g. empty, too long)."""
    def __init__(self, message: str = "The question submitted is invalid or exceeds character limits.", technical_detail: Optional[str] = None):
        super().__init__(message, technical_detail)
