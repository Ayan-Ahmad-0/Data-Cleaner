"""Resource limits configuration and concurrency control for Explore Data."""

from __future__ import annotations
from contextlib import contextmanager
from dataclasses import dataclass
import threading
from typing import Dict, Generator

from explore.errors import ServerBusyError


@dataclass
class QueryLimits:
    """Configurable resource limits for interactive queries and exports."""

    max_sql_length: int = 20_000
    display_row_limit: int = 1_000
    max_display_row_limit: int = 10_000
    query_timeout_seconds: float = 60.0
    export_timeout_seconds: float = 300.0
    memory_limit_per_query: str = "2GB"
    threads_per_query: int = 2
    max_concurrent_queries_global: int = 4
    max_concurrent_queries_per_user: int = 1
    max_export_rows: int = 50_000_000
    max_export_bytes: int = 2 * 1024 * 1024 * 1024  # 2 GB


class ConcurrencyController:
    """Coordinates global and per-user query execution concurrency."""

    def __init__(self, limits: QueryLimits) -> None:
        self.limits = limits
        self._lock = threading.Lock()
        self._global_semaphore = threading.Semaphore(limits.max_concurrent_queries_global)
        self._user_active_counts: Dict[str, int] = {}

    def acquire(self, user_id: str) -> None:
        """Attempt to acquire a query execution slot under global and per-user limits.
        
        Raises ServerBusyError immediately if concurrency limits are exceeded.
        """
        user_key = user_id or "anonymous"

        with self._lock:
            active_for_user = self._user_active_counts.get(user_key, 0)
            if active_for_user >= self.limits.max_concurrent_queries_per_user:
                raise ServerBusyError("You already have a query running. Please wait for it to complete.")

        acquired_global = self._global_semaphore.acquire(blocking=False)
        if not acquired_global:
            raise ServerBusyError("Server is currently busy running queries. Please try again in a moment.")

        with self._lock:
            self._user_active_counts[user_key] = self._user_active_counts.get(user_key, 0) + 1

    def release(self, user_id: str) -> None:
        """Release a previously acquired execution slot."""
        user_key = user_id or "anonymous"
        with self._lock:
            count = self._user_active_counts.get(user_key, 1)
            if count <= 1:
                self._user_active_counts.pop(user_key, None)
            else:
                self._user_active_counts[user_key] = count - 1

        self._global_semaphore.release()


_default_limits = QueryLimits()
_default_controller = ConcurrencyController(_default_limits)


@contextmanager
def concurrency_guard(user_id: str, limits: QueryLimits | None = None) -> Generator[None, None, None]:
    """Context manager ensuring concurrency slots are cleanly acquired and released."""
    controller = _default_controller if (limits is None or limits == _default_limits) else ConcurrencyController(limits)
    controller.acquire(user_id)
    try:
        yield
    finally:
        controller.release(user_id)
