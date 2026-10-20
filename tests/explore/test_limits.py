"""Tests for concurrency controls, timeouts, and resource limits."""

from pathlib import Path
import threading
import time
import pytest
import duckdb

from app.storage import JobStorage
from explore.errors import QueryTimeoutError, ServerBusyError
from explore.limits import ConcurrencyController, QueryLimits
from explore.service import run_query


@pytest.fixture
def mock_storage(tmp_path: Path) -> JobStorage:
    """Fixture providing a job storage with sample data."""
    storage = JobStorage(base_dir=str(tmp_path / "jobs"))
    clean_pq = storage.clean_parquet_path("timeout_job")

    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE t (id INT, v INT)")
    con.execute("INSERT INTO t SELECT range, range * 2 FROM range(1000)")
    con.execute(f"COPY t TO '{clean_pq.as_posix()}' (FORMAT PARQUET)")
    con.close()
    return storage


def test_query_timeout_interrupt(mock_storage: JobStorage):
    """Verify that a deliberately slow query is terminated by connection.interrupt() at timeout."""
    short_limits = QueryLimits(query_timeout_seconds=0.5)
    # Forced grouping across 1 billion rows cannot be early-terminated by LIMIT
    slow_sql = """
        SELECT a.id, max(b.id)
        FROM data a, data b, data c
        GROUP BY a.id, b.id, c.id
        ORDER BY max(b.id) DESC
    """

    t_start = time.perf_counter()
    with pytest.raises(QueryTimeoutError) as exc_info:
        run_query("timeout_job", sql=slow_sql, limits=short_limits, storage=mock_storage)
    elapsed = time.perf_counter() - t_start

    assert elapsed < 5.0
    assert "timed out after" in str(exc_info.value).lower()


def test_concurrency_controller_per_user_limit():
    """Verify that a user cannot run more than their per-user concurrent query limit."""
    limits = QueryLimits(max_concurrent_queries_per_user=1, max_concurrent_queries_global=4)
    controller = ConcurrencyController(limits)

    # First query for user alice succeeds
    controller.acquire("user_alice")

    # Second query for user alice should immediately raise ServerBusyError
    with pytest.raises(ServerBusyError) as exc_info:
        controller.acquire("user_alice")
    assert "already have a query running" in str(exc_info.value).lower()

    # Query for user bob should succeed (different user)
    controller.acquire("user_bob")
    controller.release("user_bob")

    # Release user alice
    controller.release("user_alice")

    # Now user alice can acquire again
    controller.acquire("user_alice")
    controller.release("user_alice")


def test_concurrency_controller_global_limit():
    """Verify that global concurrency cap rejects queries once exhausted."""
    limits = QueryLimits(max_concurrent_queries_per_user=2, max_concurrent_queries_global=2)
    controller = ConcurrencyController(limits)

    controller.acquire("user_1")
    controller.acquire("user_2")

    # Third query regardless of user should be rejected because global limit is 2
    with pytest.raises(ServerBusyError) as exc_info:
        controller.acquire("user_3")
    assert "server is currently busy" in str(exc_info.value).lower()

    controller.release("user_1")
    # Now user_3 can acquire
    controller.acquire("user_3")
    controller.release("user_3")
    controller.release("user_2")
