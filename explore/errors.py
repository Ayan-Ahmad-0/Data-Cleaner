"""Custom typed exceptions for the Explore Data SQL Query service."""

from __future__ import annotations
import re
from typing import Optional


def sanitize_error_message(msg: str) -> str:
    """Strip server file paths, internal directory structures, and sensitive keywords from error messages."""
    if not msg:
        return "An error occurred while executing the query."

    # Strip Windows or Unix absolute file paths (e.g. D:\data-cleaner\... or /var/...)
    cleaned = re.sub(r"[a-zA-Z]:\\[^\s\"'<>]+", "<file>", msg)
    cleaned = re.sub(r"/(?:[a-zA-Z0-9_\-\.]+/)+[a-zA-Z0-9_\-\.]+", "<file>", cleaned)

    # Clean redundant DuckDB prefix markers
    cleaned = re.sub(r"^(?:Catalog|Parser|Binder|Invalid Input|Permission|Conversion|Syntax)\s*Error:\s*", "", cleaned, flags=re.IGNORECASE)

    # Truncate internal line dump if present
    if "LINE 1:" in cleaned:
        cleaned = cleaned.split("LINE 1:")[0].strip()

    return cleaned.strip() or "Query execution error."


class ExploreError(Exception):
    """Base exception for all explore service operations."""

    def __init__(self, message: str, detail: Optional[str] = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or message

    def __str__(self) -> str:
        return self.message


class QueryNotAllowedError(ExploreError):
    """Raised when SQL validation fails (disallowed statement, function, table, etc.)."""

    def __init__(self, message: str = "Query not allowed", detail: Optional[str] = None) -> None:
        super().__init__(message, detail)


class QuerySyntaxError(ExploreError):
    """Raised when DuckDB cannot parse or bind the SQL query."""

    def __init__(self, message: str, detail: Optional[str] = None) -> None:
        sanitized = sanitize_error_message(message)
        super().__init__(sanitized, detail or message)


class QueryTimeoutError(ExploreError):
    """Raised when query execution exceeds the configured timeout."""

    def __init__(self, timeout_seconds: float, detail: Optional[str] = None) -> None:
        message = f"Query timed out after {timeout_seconds:g} seconds. Try adding a LIMIT or narrowing your filter."
        super().__init__(message, detail or message)


class QueryTooLargeError(ExploreError):
    """Raised when an export or result exceeds the maximum allowed rows or bytes."""

    def __init__(self, message: str = "Query result exceeds maximum allowed size", detail: Optional[str] = None) -> None:
        super().__init__(message, detail)


class ServerBusyError(ExploreError):
    """Raised when global or per-user concurrency limits are reached."""

    def __init__(self, message: str = "Too many queries are currently running. Please try again in a moment.", detail: Optional[str] = None) -> None:
        super().__init__(message, detail)


class DataNotFoundError(ExploreError):
    """Raised when a job does not exist, has expired, or is not accessible."""

    def __init__(self, message: str = "Dataset not found or has expired.", detail: Optional[str] = None) -> None:
        super().__init__(message, detail)
