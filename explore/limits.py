"""Resource limits configuration and concurrency control for Explore Data."""

from __future__ import annotations
from contextlib import contextmanager
from dataclasses import dataclass
import threading
import time
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
        self._condition = threading.Condition(self._lock)
        self._global_semaphore = threading.Semaphore(limits.max_concurrent_queries_global)
        self._user_active_counts: Dict[str, int] = {}

    def acquire(self, user_id: str, timeout: float = 0.0) -> None:
        """Attempt to acquire a query execution slot under global and per-user limits.
        
        If timeout is 0.0, raises ServerBusyError immediately if concurrency limits are exceeded.
        If timeout > 0.0, waits up to timeout seconds for a slot to become available.
        """
        user_key = user_id or "anonymous"
        deadline = time.time() + timeout

        # 1. Acquire global semaphore slot
        if timeout > 0:
            rem_global = max(0.01, deadline - time.time())
            acquired_global = self._global_semaphore.acquire(blocking=True, timeout=rem_global)
        else:
            acquired_global = self._global_semaphore.acquire(blocking=False)

        if not acquired_global:
            raise ServerBusyError("Server is currently busy running queries. Please try again in a moment.")

        # 2. Acquire per-user slot under lock
        with self._condition:
            while True:
                active_for_user = self._user_active_counts.get(user_key, 0)
                if active_for_user < self.limits.max_concurrent_queries_per_user:
                    self._user_active_counts[user_key] = active_for_user + 1
                    return

                remaining = deadline - time.time()
                if remaining <= 0:
                    self._global_semaphore.release()
                    raise ServerBusyError("You already have a query running. Please wait for it to complete.")

                self._condition.wait(timeout=min(remaining, 0.25))

    def release(self, user_id: str) -> None:
        """Release a previously acquired execution slot."""
        user_key = user_id or "anonymous"
        with self._condition:
            count = self._user_active_counts.get(user_key, 1)
            if count <= 1:
                self._user_active_counts.pop(user_key, None)
            else:
                self._user_active_counts[user_key] = count - 1
            self._condition.notify_all()

        self._global_semaphore.release()


_default_limits = QueryLimits()
_default_controller = ConcurrencyController(_default_limits)
_controllers: Dict[tuple[int, int], ConcurrencyController] = {
    (_default_limits.max_concurrent_queries_global, _default_limits.max_concurrent_queries_per_user): _default_controller
}
_ctrl_lock = threading.Lock()


def get_concurrency_controller(limits: QueryLimits | None = None) -> ConcurrencyController:
    """Return a shared ConcurrencyController matching the given limits' concurrency settings."""
    if limits is None or limits == _default_limits:
        return _default_controller
    key = (limits.max_concurrent_queries_global, limits.max_concurrent_queries_per_user)
    with _ctrl_lock:
        if key not in _controllers:
            _controllers[key] = ConcurrencyController(limits)
        return _controllers[key]


@contextmanager
def concurrency_guard(
    user_id: str,
    limits: QueryLimits | None = None,
    timeout: float = 10.0,
    controller: ConcurrencyController | None = None,
) -> Generator[None, None, None]:
    """Context manager ensuring concurrency slots are cleanly acquired and released."""
    active_ctrl = controller or get_concurrency_controller(limits)
    active_ctrl.acquire(user_id, timeout=timeout)
    try:
        yield
    finally:
        active_ctrl.release(user_id)
