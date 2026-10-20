"""DuckDB sandboxed connection creation and engine lockdown."""

from __future__ import annotations
import json
from pathlib import Path
from typing import List, Optional
import duckdb

from explore.limits import QueryLimits


def create_sandboxed_connection(
    parquet_path: Path,
    limits: QueryLimits,
    original_parquet_path: Optional[Path] = None,
    temp_dir: Optional[Path] = None,
    allow_write_path: Optional[Path] = None,
) -> duckdb.DuckDBPyConnection:
    """Create an isolated, locked-down in-memory DuckDB connection bound to the specified Parquet dataset.

    Security configuration order:
    1. Open fresh in-memory database.
    2. Register logical views ('data', and optionally 'original').
    3. Configure memory limits, threads, and temporary directories.
    4. Restrict allowed filesystem paths and disable external access.
    5. Disable auto-install and auto-load of extensions.
    6. Lock configuration to prevent any runtime modification.

    Args:
        parquet_path: Absolute path to the cleaned Parquet file (view 'data').
        limits: Resource limits to enforce on this connection.
        original_parquet_path: Optional path to staged/raw Parquet file (view 'original').
        temp_dir: Optional job-scoped directory for temporary disk spill.
        allow_write_path: Optional file path permitted for export writes (used ONLY by export_query).

    Returns:
        A locked DuckDBPyConnection instance.
    """
    parquet_resolved = Path(parquet_path).resolve()
    if not parquet_resolved.exists():
        raise FileNotFoundError(f"Parquet dataset '{parquet_resolved}' does not exist.")

    # 1. New in-memory database
    con = duckdb.connect(":memory:")

    # 2. Expose Parquet file as view `data`
    # Use parameter substitution or safely quoted posix path
    con.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{parquet_resolved.as_posix()}')")

    # Optionally expose pre-cleaning Parquet as `original`
    if original_parquet_path:
        orig_resolved = Path(original_parquet_path).resolve()
        if orig_resolved.exists():
            con.execute(f"CREATE VIEW original AS SELECT * FROM read_parquet('{orig_resolved.as_posix()}')")

    # 3. Configure resource limits
    con.execute(f"SET memory_limit = '{limits.memory_limit_per_query}'")
    con.execute(f"SET threads = {int(limits.threads_per_query)}")

    if temp_dir:
        temp_resolved = Path(temp_dir).resolve()
        temp_resolved.mkdir(parents=True, exist_ok=True)
        con.execute(f"SET temp_directory = '{temp_resolved.as_posix()}'")
        con.execute("SET max_temp_directory_size = '1GB'")

    # 4. Filesystem restrictions
    allowed_paths: List[str] = [parquet_resolved.as_posix()]
    if original_parquet_path and Path(original_parquet_path).exists():
        allowed_paths.append(Path(original_parquet_path).resolve().as_posix())
    if temp_dir:
        allowed_paths.append(Path(temp_dir).resolve().as_posix())
    if allow_write_path:
        allowed_paths.append(Path(allow_write_path).resolve().as_posix())

    # Format paths list as DuckDB single-quoted list literal
    paths_sql = "[" + ", ".join(f"'{p.replace('\'', '\'\'')}'" for p in allowed_paths) + "]"
    con.execute(f"SET allowed_paths = {paths_sql}")
    con.execute("SET enable_external_access = false")

    # 5. Disable extension loading and auto-install
    con.execute("SET autoinstall_known_extensions = false")
    con.execute("SET autoload_known_extensions = false")

    # 6. Lock the configuration (must be final setup step)
    con.execute("SET lock_configuration = true")

    return con
