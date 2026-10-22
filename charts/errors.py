"""Custom exceptions for chart specification and execution."""

from explore.errors import ExploreError, DataNotFoundError, ServerBusyError


class ChartError(ExploreError):
    """Base exception for chart processing."""
    pass


class InvalidChartSpecError(ChartError):
    """Raised when a ChartSpec violates structural or semantic schema validation."""
    pass


class ChartTooLargeError(ChartError):
    """Raised when the resulting chart data exceeds maximum permissible caps."""
    pass


class ChartTimeoutError(ChartError):
    """Raised when chart query execution exceeds the configured timeout."""
    def __init__(self, timeout_seconds: float) -> None:
        super().__init__(
            f"Chart query timed out after {timeout_seconds:.1f} seconds. "
            "Try adding filters or selecting a coarser time bucket or higher aggregation."
        )
        self.timeout_seconds = timeout_seconds


__all__ = [
    "ChartError",
    "InvalidChartSpecError",
    "ChartTooLargeError",
    "ChartTimeoutError",
    "DataNotFoundError",
    "ServerBusyError",
]
