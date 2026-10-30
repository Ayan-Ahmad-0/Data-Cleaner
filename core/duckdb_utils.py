"""DuckDB resource allocation, configuration, and connection utilities."""

from __future__ import annotations
import os
import tempfile
from pathlib import Path
from typing import Optional
import duckdb


def get_duckdb_memory_limit() -> str:
    """Return configured memory limit or sensible high-performance default (8GB)."""
    return os.getenv("DUCKDB_MEMORY_LIMIT", "8GB")


def get_duckdb_threads() -> int:
    """Return configured thread count or default to 4."""
    try:
        return int(os.getenv("DUCKDB_THREADS", "4"))
    except ValueError:
        return 4


def get_duckdb_temp_directory() -> str:
    """
    Return a safe, cross-platform temporary directory for DuckDB spilling.
    Translates invalid Unix paths like '/tmp/duckdb' to native OS temp paths on Windows.
    """
    custom = os.getenv("DUCKDB_TEMP_DIRECTORY") or os.getenv("DUCKDB_TEMP_DIR")
    if custom:
        if os.name == "nt" and custom.startswith("/tmp"):
            base_name = Path(custom).name or "duckdb_temp"
            custom = str(Path(tempfile.gettempdir()) / base_name)
    else:
        custom = str(Path(tempfile.gettempdir()) / "duckdb_temp")

    os.makedirs(custom, exist_ok=True)
    return custom.replace("\\", "/")


def configure_duckdb_connection(
    conn: duckdb.DuckDBPyConnection,
    memory_limit: Optional[str] = None,
    threads: Optional[int] = None,
    temp_directory: Optional[str] = None,
) -> duckdb.DuckDBPyConnection:
    """Apply consistent high-throughput resource settings to a DuckDB connection."""
    conn.execute("SET preserve_insertion_order = false;")

    t_dir = temp_directory or get_duckdb_temp_directory()
    if t_dir:
        conn.execute(f"SET temp_directory = '{t_dir}';")

    mem = memory_limit or get_duckdb_memory_limit()
    if mem:
        conn.execute(f"SET memory_limit = '{mem}';")

    th = threads or get_duckdb_threads()
    if th:
        conn.execute(f"SET threads = {th};")

    return conn
