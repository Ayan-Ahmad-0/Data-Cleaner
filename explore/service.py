"""Public service API for sandboxed data exploration and query execution."""

from __future__ import annotations
from dataclasses import dataclass, field
import datetime
import decimal
import logging
from pathlib import Path
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import uuid

import duckdb

from app.storage import JobStorage
from explore.errors import (
    DataNotFoundError,
    ExploreError,
    QueryNotAllowedError,
    QuerySyntaxError,
    QueryTimeoutError,
    QueryTooLargeError,
)
from explore.limits import QueryLimits, concurrency_guard
from explore.sandbox import create_sandboxed_connection
from explore.validate import validate_sql

logger = logging.getLogger(__name__)


@dataclass
class ColumnInfo:
    """Metadata for an individual column."""
    name: str
    type: str
    sample_values: List[Any] = field(default_factory=list)


@dataclass
class SchemaInfo:
    """Schema overview for the queryable dataset."""
    table: str
    row_count: int
    columns: List[ColumnInfo]
    tables_available: List[str]


@dataclass
class QueryResult:
    """Result of a sandboxed query execution."""
    columns: List[ColumnInfo]
    rows: List[List[Any]]
    row_count_returned: int
    truncated: bool
    elapsed_seconds: float
    warnings: List[str] = field(default_factory=list)


def resolve_job_parquet_paths(
    job_id: str,
    user_id: str = "anonymous",
    storage: Optional[JobStorage] = None,
) -> Tuple[Path, Optional[Path]]:
    """Resolve the physical Parquet file paths for a job.
    
    Returns:
        (clean_parquet_path, staged_or_original_parquet_path)
    
    Raises:
        DataNotFoundError: If job files do not exist or have expired.
    """
    if not job_id or not job_id.strip():
        raise DataNotFoundError("Invalid or empty job identifier.")

    store = storage or JobStorage()
    clean_pq = store.clean_parquet_path(job_id)
    staged_pq = store.staged_parquet_path(job_id)

    if clean_pq.exists():
        return clean_pq, staged_pq if staged_pq.exists() else None

    # Check convert-only, query-only, or modeling directory
    for folder_name in ("convert_jobs", "query_jobs", "modeling"):
        q_dir = Path(f"data/{folder_name}").resolve() / job_id
        if q_dir.exists() and q_dir.is_dir():
            merged_pq = q_dir / "merged.parquet"
            if merged_pq.exists():
                return merged_pq, None
            parquet_files = list(q_dir.glob("**/*.parquet"))
            if parquet_files:
                return parquet_files[0], None

    # Check direct staged parquet if clean has not been run
    if staged_pq.exists():
        return staged_pq, None

    raise DataNotFoundError(f"Dataset for job '{job_id}' was not found or has expired.")


def serialize_cell_value(val: Any) -> Tuple[Any, bool]:
    """Convert non-JSON native values (dates, decimals, UUIDs, bytes) into JSON-compatible primitives.
    
    Returns (serialized_value, was_converted).
    """
    if val is None:
        return None, False

    if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
        return val.isoformat(), True

    if isinstance(val, decimal.Decimal):
        return float(val), True

    if isinstance(val, (bytes, bytearray, memoryview)):
        return bytes(val).decode("utf-8", errors="replace"), True

    if isinstance(val, uuid.UUID):
        return str(val), True

    if isinstance(val, (list, tuple)):
        items = []
        any_conv = False
        for item in val:
            v, c = serialize_cell_value(item)
            items.append(v)
            if c:
                any_conv = True
        return items, any_conv

    if isinstance(val, dict):
        mapped = {}
        any_conv = False
        for k, v in val.items():
            sv, sc = serialize_cell_value(v)
            mapped[str(k)] = sv
            if sc:
                any_conv = True
        return mapped, any_conv

    return val, False


def get_schema(
    job_id: str,
    user_id: str = "anonymous",
    limits: Optional[QueryLimits] = None,
    storage: Optional[JobStorage] = None,
    table: str = "data",
) -> SchemaInfo:
    """Retrieve schema metadata, column types, row counts, and sample values for the dataset."""
    lim = limits or QueryLimits()
    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id, storage=storage)

    con = create_sandboxed_connection(clean_pq, limits=lim, original_parquet_path=orig_pq)
    try:
        tables_avail = ["data"]
        if orig_pq and orig_pq.exists():
            tables_avail.append("original")

        target_table = "data"
        if table in ("data", "original"):
            if table == "original" and "original" in tables_avail:
                target_table = "original"
            else:
                target_table = "data"

        # Fast metadata row count
        count_row = con.execute(f"SELECT count(*) FROM {target_table}").fetchone()
        row_count = int(count_row[0]) if count_row else 0

        # Column names and types via DESCRIBE
        desc_rows = con.execute(f"DESCRIBE {target_table}").fetchall()
        columns_meta: List[ColumnInfo] = []

        # Get sample values (first 3 rows)
        sample_rows = con.execute(f"SELECT * FROM {target_table} LIMIT 3").fetchall()

        for col_idx, row in enumerate(desc_rows):
            col_name = str(row[0])
            col_type = str(row[1])
            samples = []
            for sample_row in sample_rows:
                if col_idx < len(sample_row) and sample_row[col_idx] is not None:
                    serialized, _ = serialize_cell_value(sample_row[col_idx])
                    samples.append(serialized)
            columns_meta.append(
                ColumnInfo(name=col_name, type=col_type, sample_values=samples[:3])
            )

        return SchemaInfo(
            table=target_table,
            row_count=row_count,
            columns=columns_meta,
            tables_available=tables_avail,
        )
    except Exception as e:
        logger.exception("Failed to retrieve schema for job %s: %s", job_id, e)
        raise QuerySyntaxError(str(e))
    finally:
        con.close()


def run_query(
    job_id: str,
    user_id: str = "anonymous",
    sql: str = "",
    row_limit: Optional[int] = None,
    limits: Optional[QueryLimits] = None,
    storage: Optional[JobStorage] = None,
) -> QueryResult:
    """Execute a validated read-only SQL query in a sandboxed DuckDB connection."""
    lim = limits or QueryLimits()

    # Step 1: SQL validation
    validated = validate_sql(sql, limits=lim)

    # Step 2: Authorization & path resolution
    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id, storage=storage)

    # Step 3: Compute row limit
    requested_limit = row_limit if row_limit is not None else lim.display_row_limit
    effective_limit = max(1, min(requested_limit, lim.max_display_row_limit))

    # Wrap query to prevent unbounded memory fetch (ensure no trailing semicolon in subquery)
    clean_sql = validated.sql.strip().rstrip(";").strip()
    wrapped_sql = f"SELECT * FROM ({clean_sql}) LIMIT {effective_limit + 1}"

    # Step 4: Concurrency control and sandboxed execution
    with concurrency_guard(user_id, limits=lim):
        temp_dir = clean_pq.parent / ".query_tmp"
        con = create_sandboxed_connection(
            clean_pq,
            limits=lim,
            original_parquet_path=orig_pq,
            temp_dir=temp_dir,
        )

        query_exception: List[Exception] = []
        raw_result_container: List[Tuple[List[Tuple[str, str]], List[Tuple[Any, ...]]]] = []
        is_interrupted = threading.Event()

        def _execute():
            try:
                rel = con.execute(wrapped_sql)
                # Capture column names and DuckDB types as strings
                cols = [(str(desc[0]), str(desc[1])) for desc in rel.description]
                data = rel.fetchall()
                raw_result_container.append((cols, data))
            except Exception as ex:
                if is_interrupted.is_set():
                    query_exception.append(QueryTimeoutError(lim.query_timeout_seconds))
                else:
                    query_exception.append(ex)

        exec_thread = threading.Thread(target=_execute, daemon=True)
        t_start = time.perf_counter()
        exec_thread.start()

        # Join with timeout
        exec_thread.join(timeout=lim.query_timeout_seconds)

        if exec_thread.is_alive():
            is_interrupted.set()
            try:
                con.interrupt()
            except Exception:
                pass
            exec_thread.join(timeout=3.0)
            con.close()
            raise QueryTimeoutError(lim.query_timeout_seconds)

        elapsed = time.perf_counter() - t_start
        con.close()

        if query_exception:
            exc = query_exception[0]
            if isinstance(exc, ExploreError):
                raise exc
            logger.warning("Query execution failed for job %s: %s", job_id, exc)
            raise QuerySyntaxError(str(exc))

        if not raw_result_container:
            raise QuerySyntaxError("Query returned no result set.")

        col_defs, fetched_rows = raw_result_container[0]

        # Check truncation
        truncated = len(fetched_rows) > effective_limit
        display_rows = fetched_rows[:effective_limit] if truncated else fetched_rows

        # Serialize rows
        converted_any = False
        serialized_rows: List[List[Any]] = []
        for r in display_rows:
            row_items = []
            for cell in r:
                sc, was_conv = serialize_cell_value(cell)
                row_items.append(sc)
                if was_conv:
                    converted_any = True
            serialized_rows.append(row_items)

        warnings: List[str] = []
        if truncated:
            warnings.append(
                f"Result truncated to {effective_limit:,} rows. Use the 'Download CSV' button to export the full result."
            )
        if converted_any:
            warnings.append("Certain non-JSON data types (dates, decimals, or structs) were converted to display strings.")

        cols_info = [ColumnInfo(name=c[0], type=str(c[1])) for c in col_defs]

        return QueryResult(
            columns=cols_info,
            rows=serialized_rows,
            row_count_returned=len(serialized_rows),
            truncated=truncated,
            elapsed_seconds=round(elapsed, 3),
            warnings=warnings,
        )


def export_query(
    job_id: str,
    user_id: str = "anonymous",
    sql: str = "",
    out_dir: Optional[Path] = None,
    limits: Optional[QueryLimits] = None,
    storage: Optional[JobStorage] = None,
) -> Path:
    """Run validated query and export the full result set to a CSV file."""
    lim = limits or QueryLimits()

    # Step 1: SQL validation
    validated = validate_sql(sql, limits=lim)

    # Step 2: Authorization & path resolution
    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id, storage=storage)

    # Output directory
    export_dir = out_dir or (clean_pq.parent / "exports")
    export_dir.mkdir(parents=True, exist_ok=True)
    export_filename = f"query_export_{uuid.uuid4().hex[:8]}.csv"
    out_file = (export_dir / export_filename).resolve()

    # Step 3: Concurrency control and isolated export connection
    with concurrency_guard(user_id, limits=lim):
        con = create_sandboxed_connection(
            clean_pq,
            limits=lim,
            original_parquet_path=orig_pq,
            allow_write_path=out_file,
        )

        clean_sql = validated.sql.strip().rstrip(";").strip()
        copy_sql = f"COPY ({clean_sql}) TO '{out_file.as_posix()}' (HEADER, DELIMITER ',')"
        query_exception: List[Exception] = []
        is_interrupted = threading.Event()

        def _execute_export():
            try:
                con.execute(copy_sql)
            except Exception as ex:
                if is_interrupted.is_set():
                    query_exception.append(QueryTimeoutError(lim.export_timeout_seconds))
                else:
                    query_exception.append(ex)

        exec_thread = threading.Thread(target=_execute_export, daemon=True)
        exec_thread.start()
        exec_thread.join(timeout=lim.export_timeout_seconds)

        if exec_thread.is_alive():
            is_interrupted.set()
            try:
                con.interrupt()
            except Exception:
                pass
            exec_thread.join(timeout=3.0)
            con.close()
            if out_file.exists():
                out_file.unlink(missing_ok=True)
            raise QueryTimeoutError(lim.export_timeout_seconds)

        con.close()

        if query_exception:
            if out_file.exists():
                out_file.unlink(missing_ok=True)
            exc = query_exception[0]
            if isinstance(exc, ExploreError):
                raise exc
            raise QuerySyntaxError(str(exc))

        # Check export file size
        if not out_file.exists():
            raise QuerySyntaxError("Export failed to produce an output file.")

        file_size = out_file.stat().st_size
        if file_size > lim.max_export_bytes:
            out_file.unlink(missing_ok=True)
            raise QueryTooLargeError(
                f"Export file size ({file_size / (1024*1024):.1f} MB) exceeds maximum allowed limit of {lim.max_export_bytes / (1024*1024):.0f} MB."
            )

        return out_file
