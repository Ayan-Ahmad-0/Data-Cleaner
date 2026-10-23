"""Public service API for charts (Section 5 of spec)."""

from __future__ import annotations
import csv
from dataclasses import dataclass, field
import hashlib
import json
import logging
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple

from app.storage import JobStorage
from charts.compile import compile_spec, quote_identifier
from charts.errors import ChartError, ChartTimeoutError, ChartTooLargeError, DataNotFoundError, InvalidChartSpecError, ServerBusyError
from charts.limits import ChartLimits
from charts.shape import ChartSuggestion, chart_from_result
from charts.spec import ChartSpec, validate_spec
from charts.stats import ColumnStats, compute_column_stats
from charts.suggest import suggest_charts_from_stats
from explore.limits import ConcurrencyController, QueryLimits
from explore.sandbox import create_sandboxed_connection
from explore.service import concurrency_guard, resolve_job_parquet_paths, serialize_cell_value

logger = logging.getLogger(__name__)

# Dedicated concurrency controller for dashboard chart execution
# Allows up to 10 concurrent chart renders per user and 20 globally with a 15s wait queue
_chart_limits = QueryLimits(
    query_timeout_seconds=60.0,
    memory_limit_per_query="2GB",
    max_concurrent_queries_global=20,
    max_concurrent_queries_per_user=10,
)
_chart_controller = ConcurrencyController(_chart_limits)


@dataclass
class ChartData:
    spec: ChartSpec
    columns: List[str]
    rows: List[List[Any]]
    row_count: int
    notes: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    elapsed_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "spec": self.spec.model_dump(),
            "columns": self.columns,
            "rows": self.rows,
            "row_count": self.row_count,
            "notes": self.notes,
            "warnings": self.warnings,
            "elapsed_seconds": self.elapsed_seconds,
        }


# In-memory caches with simple TTL
_stats_cache: Dict[str, Tuple[float, List[ColumnStats]]] = {}
_chart_cache: Dict[str, Tuple[float, ChartData]] = {}


def _get_spec_hash(job_id: str, spec: ChartSpec) -> str:
    serialized = spec.model_dump_json(exclude_none=True)
    return hashlib.sha256(f"{job_id}:{serialized}".encode("utf-8")).hexdigest()


def get_column_stats(
    job_id: str,
    user_id: str = "anonymous",
    storage: Optional[JobStorage] = None,
    limits: Optional[ChartLimits] = None,
) -> List[ColumnStats]:
    """Retrieve or compute column stats for a dataset."""
    lim = limits or ChartLimits()
    now = time.time()

    # Check cache
    if job_id in _stats_cache:
        cached_time, cached_stats = _stats_cache[job_id]
        if now - cached_time < lim.chart_cache_ttl_seconds:
            return cached_stats

    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id=user_id, storage=storage)
    # Prefer cleaned Parquet if available (e.g. post-cleaning), else staged/raw Parquet
    target_pq = clean_pq if clean_pq and clean_pq.exists() else (orig_pq or clean_pq)

    stats = compute_column_stats(target_pq, limits=lim)
    _stats_cache[job_id] = (now, stats)
    return stats


def suggest_charts(
    job_id: str,
    user_id: str = "anonymous",
    max_suggestions: int = 8,
    storage: Optional[JobStorage] = None,
    limits: Optional[ChartLimits] = None,
) -> List[ChartSpec]:
    """Suggest charts deterministically based on dataset statistics."""
    stats = get_column_stats(job_id, user_id=user_id, storage=storage, limits=limits)
    
    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id=user_id, storage=storage)
    target_pq = clean_pq if clean_pq and clean_pq.exists() else (orig_pq or clean_pq)

    # Quick row count
    import duckdb
    con = duckdb.connect(":memory:")
    try:
        row_count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{target_pq.as_posix()}')").fetchone()[0]
    finally:
        con.close()

    return suggest_charts_from_stats(stats, row_count=row_count, max_suggestions=max_suggestions)


from charts.page_options import PageDataOptions, apply_page_options

def build_chart(
    job_id: str,
    user_id: str = "anonymous",
    spec: Optional[ChartSpec] = None,
    page_options: Optional[PageDataOptions] = None,
    storage: Optional[JobStorage] = None,
    limits: Optional[ChartLimits] = None,
) -> ChartData:
    """Compile and execute a ChartSpec on the sandboxed DuckDB engine."""
    if spec is None:
        raise InvalidChartSpecError("No ChartSpec provided.")

    lim = limits or ChartLimits()
    if spec.chart_type == "pie":
        if spec.top_n and spec.top_n > lim.max_pie_slices:
            spec.top_n = lim.max_pie_slices
        elif not spec.top_n:
            spec.top_n = lim.max_pie_slices
        if spec.aggregation == "none":
            spec.aggregation = "count"

    # Resolve dataset paths
    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id=user_id, storage=storage)
    target_pq = clean_pq if clean_pq and clean_pq.exists() else (orig_pq or clean_pq)

    # 1. Fetch schema
    import duckdb
    con_meta = duckdb.connect(":memory:")
    try:
        desc = con_meta.execute(f"DESCRIBE SELECT * FROM read_parquet('{target_pq.as_posix()}')").fetchall()
        schema = {str(row[0]): str(row[1]) for row in desc}
    finally:
        con_meta.close()

    # Apply page options if provided
    if page_options:
        spec = apply_page_options(spec, page_options, schema)

    cache_key = _get_spec_hash(job_id, spec)
    now = time.time()

    if cache_key in _chart_cache:
        cached_time, cached_chart = _chart_cache[cache_key]
        if now - cached_time < lim.chart_cache_ttl_seconds:
            return cached_chart

    # 2. Compile to SQL
    sql, params, notes = compile_spec(spec, schema, limits=lim)
    warnings: List[str] = []

    if page_options:
        if page_options.exclude_missing:
            notes.append("Exclude missing values: on")
        if page_options.hide_outliers:
            notes.append("Hide outliers: on (1st-99th percentile)")
        for col, cast_t in page_options.cast_overrides.items():
            if (spec.x and spec.x.column == col) or (spec.y and spec.y.column == col):
                notes.append(f"'{col}' read as {cast_t}")

    # 3. Check for cast failure warnings if cast_as is used
    cast_fields = [f for f in (spec.x, spec.y) if f and f.cast_as in ("number", "date", "timestamp")]
    if cast_fields:
        cast_con = duckdb.connect(":memory:")
        try:
            for f in cast_fields:
                col_q = quote_identifier(f.column)
                cast_type = "DOUBLE" if f.cast_as == "number" else ("DATE" if f.cast_as == "date" else "TIMESTAMP")
                chk_sql = f"""
                SELECT 
                    COUNT(*) AS total_non_null,
                    SUM(CASE WHEN TRY_CAST({col_q} AS {cast_type}) IS NULL THEN 1 ELSE 0 END) AS failed_casts
                FROM read_parquet('{target_pq.as_posix()}')
                WHERE {col_q} IS NOT NULL
                """
                res = cast_con.execute(chk_sql).fetchone()
                total_nn = res[0] or 0
                failed_c = res[1] or 0
                if total_nn > 0 and failed_c > 0:
                    pct = round((failed_c / total_nn) * 100.0, 1)
                    warnings.append(
                        f"{pct}% of '{f.column}' values could not be read as {f.cast_as} and were ignored."
                    )
        except Exception as e:
            logger.warning("Failed to calculate cast warnings: %s", e)
        finally:
            cast_con.close()

    # 4. Execute query with limits & concurrency
    q_lim = QueryLimits(
        query_timeout_seconds=lim.chart_query_timeout_seconds,
        memory_limit_per_query="2GB",
    )

    t0 = time.perf_counter()
    with concurrency_guard(user_id, controller=_chart_controller, timeout=15.0):
        con = create_sandboxed_connection(target_pq, limits=q_lim)
        try:
            rel = con.execute(sql, params)
            col_names = [str(d[0]) for d in rel.description]
            raw_rows = rel.fetchall()
        except (duckdb.InterruptException, duckdb.OutOfMemoryException) as e:
            if isinstance(e, duckdb.InterruptException):
                raise ChartTimeoutError(lim.chart_query_timeout_seconds)
            raise ChartTooLargeError(f"Query memory limit exceeded: {e}")
        except Exception as e:
            err_msg = str(e).lower()
            if "timeout" in err_msg or "interrupted" in err_msg:
                raise ChartTimeoutError(lim.chart_query_timeout_seconds)
            logger.exception("Error executing chart query for job %s: %s", job_id, e)
            raise ChartError(f"Chart query execution failed: {e}")
        finally:
            con.close()

    elapsed = round(time.perf_counter() - t0, 3)

    # Serialize rows
    serialized_rows: List[List[Any]] = []
    for r in raw_rows:
        row_vals = []
        for val in r:
            s_val, _ = serialize_cell_value(val)
            row_vals.append(s_val)
        serialized_rows.append(row_vals)

    chart_data = ChartData(
        spec=spec,
        columns=col_names,
        rows=serialized_rows,
        row_count=len(serialized_rows),
        notes=notes,
        warnings=warnings,
        elapsed_seconds=elapsed,
    )

    _chart_cache[cache_key] = (now, chart_data)
    return chart_data


def export_chart_data(
    job_id: str,
    user_id: str = "anonymous",
    spec: Optional[ChartSpec] = None,
    out_dir: Optional[Path] = None,
    storage: Optional[JobStorage] = None,
    limits: Optional[ChartLimits] = None,
) -> Path:
    """Execute chart query and export aggregated rows to CSV."""
    data = build_chart(job_id, user_id=user_id, spec=spec, storage=storage, limits=limits)
    
    target_dir = out_dir or (Path("data/exports").resolve() / job_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    out_file = target_dir / f"chart_data_{int(time.time())}.csv"

    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(data.columns)
        for row in data.rows:
            writer.writerow(row)

    return out_file
