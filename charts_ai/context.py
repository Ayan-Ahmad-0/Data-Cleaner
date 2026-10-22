"""Context builder extracting schema, column stats, parse hints, and safe samples for Chart AI (Section 9)."""

from __future__ import annotations
import logging
import re
from typing import Any, Dict, List, Optional

import duckdb

from app.storage import JobStorage
from charts.page_options import PageDataOptions
from charts.service import get_column_stats
from charts.stats import ColumnStats
from charts_ai.limits import ChartsAILimits
from explore.service import resolve_job_parquet_paths

logger = logging.getLogger(__name__)

SENSITIVE_COLUMN_PATTERN = r"(password|secret|token|api[_-]?key|ssn|social[_-]?security|credit[_-]?card|cvv|pin|email|phone)"


def is_sensitive(col_name: str) -> bool:
    return bool(re.search(SENSITIVE_COLUMN_PATTERN, col_name, re.IGNORECASE))


def extract_safe_samples(
    parquet_path,
    columns: List[str],
    send_samples: bool = True,
    max_samples: int = 3,
    max_len: int = 40,
) -> Dict[str, List[str]]:
    """Fetch up to max_samples safe values per column."""
    if not send_samples:
        return {}

    samples_map: Dict[str, List[str]] = {}
    safe_cols = [c for c in columns if not is_sensitive(c)]
    if not safe_cols:
        return {}

    try:
        con = duckdb.connect(":memory:")
        # Read small sample
        quoted_cols = [f'"{c}"' for c in safe_cols]
        query = f"""
        SELECT {', '.join(quoted_cols)}
        FROM read_parquet('{parquet_path.as_posix()}')
        LIMIT 25
        """
        rows = con.execute(query).fetchall()
        con.close()

        for idx, col_name in enumerate(safe_cols):
            seen = set()
            col_samples = []
            for r in rows:
                val = r[idx]
                if val is not None and str(val).strip() != "":
                    s_str = str(val).strip()
                    if len(s_str) > max_len:
                        s_str = s_str[:max_len] + "..."
                    if s_str not in seen:
                        seen.add(s_str)
                        col_samples.append(s_str)
                    if len(col_samples) >= max_samples:
                        break
            samples_map[col_name] = col_samples
    except Exception as e:
        logger.warning("Could not extract column samples for Chart AI: %s", e)

    return samples_map


def build_chart_ai_context(
    job_id: str,
    user_id: str = "anonymous",
    storage: Optional[JobStorage] = None,
    page_options: Optional[PageDataOptions] = None,
    limits: Optional[ChartsAILimits] = None,
) -> str:
    """Build structured context string describing the dataset schema, stats, parse hints, and samples."""
    lim = limits or ChartsAILimits()
    stats = get_column_stats(job_id=job_id, user_id=user_id, storage=storage)

    clean_pq, orig_pq = resolve_job_parquet_paths(job_id, user_id=user_id, storage=storage)
    target_pq = orig_pq if orig_pq and orig_pq.exists() else clean_pq
    is_raw = bool(orig_pq and orig_pq.exists())

    # Get row count
    row_count = 0
    try:
        con = duckdb.connect(":memory:")
        row_count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{target_pq.as_posix()}')").fetchone()[0]
        con.close()
    except Exception:
        pass

    # Extract sample values if enabled
    samples = extract_safe_samples(
        parquet_path=target_pq,
        columns=[s.name for s in stats],
        send_samples=lim.send_samples,
    )

    lines: List[str] = []
    lines.append("<dataset_context>")
    data_mode_desc = "raw uploaded data, not cleaned" if is_raw else "cleaned data"
    lines.append(f"Data mode: {data_mode_desc}")
    lines.append(f"Total rows: {row_count:,}")
    lines.append(f"Total columns: {len(stats)}")

    # Active page data options
    if page_options:
        opts_desc = []
        if page_options.exclude_missing:
            opts_desc.append("exclude_missing: ON")
        if page_options.hide_outliers:
            opts_desc.append("hide_outliers: ON")
        if page_options.cast_overrides:
            casts = [f"{col}->{c_type}" for col, c_type in page_options.cast_overrides.items()]
            opts_desc.append(f"active_casts: [{', '.join(casts)}]")
        if opts_desc:
            lines.append(f"Active page-wide data options: {', '.join(opts_desc)}")

    lines.append("\nColumns, Statistics & Parse Hints:")

    # Wide schema truncation if > 200
    display_stats = stats
    if len(stats) > 200:
        lines.append(f"Note: Dataset has {len(stats)} columns; displaying first 200.")
        display_stats = stats[:200]

    for col in display_stats:
        parts = [f"- {col.name} ({col.type}, kind: {col.kind})"]
        st = []
        if col.null_pct > 0:
            st.append(f"nulls: {col.null_pct:.1f}%")
        if col.distinct_approx is not None:
            st.append(f"approx_distinct: {col.distinct_approx:,}")
        if col.min is not None and col.max is not None:
            st.append(f"min: {col.min}, max: {col.max}")

        if col.parse_hints:
            num_pct = col.parse_hints.get("as_number_success_pct", 0)
            date_pct = col.parse_hints.get("as_date_success_pct", 0)
            hints = []
            if date_pct > 0:
                hints.append(f"{date_pct}% parse as dates")
            if num_pct > 0:
                hints.append(f"{num_pct}% parse as numbers")
            if hints:
                st.append(f"parse_hints: ({', '.join(hints)})")

        if st:
            parts.append(f"[{'; '.join(st)}]")

        if is_sensitive(col.name):
            parts.append("(sample hidden for privacy)")
        elif col.name in samples and samples[col.name]:
            quoted = [f'"{s}"' for s in samples[col.name]]
            parts.append(f"samples: [{', '.join(quoted)}]")

        lines.append(" ".join(parts))

    lines.append("</dataset_context>")
    return "\n".join(lines)
