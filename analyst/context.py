"""Context builder extracting schema, profile statistics, and safe samples for AI Analyst."""

from __future__ import annotations
from dataclasses import dataclass, field
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from analyst.limits import AnalystLimits
from app.storage import JobStorage
from explore.service import ColumnInfo, SchemaInfo, get_schema, resolve_job_parquet_paths

logger = logging.getLogger(__name__)


@dataclass
class ColumnContext:
    """Statistical summary and sample values for a single column."""
    name: str
    duckdb_type: str
    null_pct: Optional[float] = None
    min_val: Optional[Any] = None
    max_val: Optional[Any] = None
    distinct_count: Optional[int] = None
    sample_values: List[str] = field(default_factory=list)
    samples_hidden: bool = False


@dataclass
class AnalystContext:
    """Complete context package supplied to the prompt builder."""
    tables_available: List[str]
    primary_table: str
    row_count: int
    columns: List[ColumnContext]
    cleaning_notes: List[str] = field(default_factory=list)
    schema_truncated: bool = False
    total_columns_count: int = 0

    def format_table_context(self) -> str:
        """Format the context into structured plain text for the model prompt."""
        lines: List[str] = []
        lines.append(f"Tables available: {', '.join(self.tables_available)}")
        lines.append(f"Primary table: '{self.primary_table}' ({self.row_count:,} rows)")

        if self.schema_truncated:
            lines.append(
                f"Note: Table has {self.total_columns_count} columns; schema truncated to {len(self.columns)} most relevant columns."
            )

        if self.cleaning_notes:
            lines.append("Data cleaning notes:")
            for note in self.cleaning_notes:
                lines.append(f"- {note}")

        lines.append("\nColumns and Statistics:")
        for col in self.columns:
            parts = [f"- {col.name} ({col.duckdb_type})"]
            stats: List[str] = []
            if col.null_pct is not None:
                stats.append(f"nulls: {col.null_pct:.1f}%")
            if col.distinct_count is not None:
                stats.append(f"approx_distinct: {col.distinct_count:,}")
            if col.min_val is not None and col.max_val is not None:
                stats.append(f"min: {col.min_val}, max: {col.max_val}")
            elif col.min_val is not None:
                stats.append(f"min: {col.min_val}")

            if stats:
                parts.append(f"[{'; '.join(stats)}]")

            if col.samples_hidden:
                parts.append("samples: (sample hidden)")
            elif col.sample_values:
                quoted = [f'"{s}"' if " " in str(s) else str(s) for s in col.sample_values]
                parts.append(f"samples: [{', '.join(quoted)}]")

            lines.append(" ".join(parts))

        return "\n".join(lines)


# In-memory context cache: job_id -> AnalystContext
_context_cache: Dict[str, AnalystContext] = {}


def clear_context_cache(job_id: Optional[str] = None) -> None:
    """Clear cached analyst context for a specific job or all jobs."""
    if job_id:
        _context_cache.pop(job_id, None)
    else:
        _context_cache.clear()


def is_sensitive_column(column_name: str, pattern: str) -> bool:
    """Check if column name matches known sensitive data patterns."""
    return bool(re.search(pattern, column_name, re.IGNORECASE))


def is_sensitive_value(value_str: str, patterns: List[str]) -> bool:
    """Check if a sample value matches sensitive data patterns (e.g. emails, phone numbers)."""
    val_clean = value_str.strip()
    for pat in patterns:
        if re.search(pat, val_clean, re.IGNORECASE):
            return True
    return False


def build_context(
    job_id: str,
    user_id: str = "anonymous",
    question: str = "",
    limits: Optional[AnalystLimits] = None,
    storage: Optional[JobStorage] = None,
    profile_data: Optional[Dict[str, Any]] = None,
    cleaning_notes: Optional[List[str]] = None,
) -> AnalystContext:
    """Extract schema, profile statistics, and safe samples for a dataset.
    
    Guarantees:
    - Never includes bulk rows.
    - At most 3 short sample values per column (truncated to 40 chars).
    - Sensitive columns and values are masked with "(sample hidden)".
    - Respects ANALYST_SEND_SAMPLES=false.
    - Capped to max_columns_in_context.
    """
    lim = limits or AnalystLimits()

    # Return cached context if present and no profile override
    if not profile_data and job_id in _context_cache:
        cached = _context_cache[job_id]
        return cached

    # 1. Retrieve authorized schema
    schema = get_schema(job_id, user_id=user_id, storage=storage)
    store = storage or JobStorage()

    # 2. Extract profile stats if available
    prof = profile_data
    if not prof:
        try:
            # Check app orchestrator in-memory profile if running in server
            from app.main import orchestrator
            prof = orchestrator.job_profiles.get(job_id)
        except Exception:
            pass

    notes: List[str] = list(cleaning_notes or [])
    if prof and "file_info" in prof:
        fi = prof.get("file_info", {})
        if "rows" in fi:
            notes.append(f"Ingested {fi['rows']:,} rows from source dataset.")
    if prof and "duplicates" in prof:
        dups = prof.get("duplicates", {})
        exact = dups.get("exact_rows", 0)
        if exact > 0:
            notes.append(f"{exact:,} duplicate rows identified and handled.")

    columns_context: List[ColumnContext] = []
    total_cols = len(schema.columns)

    # 3. Process each column with sensitivity checks and stats
    for col in schema.columns:
        col_prof = {}
        if prof and "columns" in prof and col.name in prof["columns"]:
            col_prof = prof["columns"][col.name]

        null_pct = col_prof.get("null_pct")
        distinct_count = col_prof.get("distinct")
        min_val = col_prof.get("min")
        max_val = col_prof.get("max")

        # Check sensitivity
        is_sensitive = is_sensitive_column(col.name, lim.sensitive_column_pattern)

        # Process sample values
        processed_samples: List[str] = []
        samples_hidden = is_sensitive

        if lim.send_samples and not is_sensitive:
            for s in col.sample_values[:lim.max_samples_per_column]:
                s_str = str(s)
                if is_sensitive_value(s_str, lim.sensitive_value_patterns):
                    samples_hidden = True
                    processed_samples = []
                    break

                # Truncate length
                if len(s_str) > lim.max_sample_chars:
                    s_str = s_str[:lim.max_sample_chars] + "..."
                processed_samples.append(s_str)
        elif is_sensitive:
            samples_hidden = True
            processed_samples = []
        else:
            # send_samples is False
            processed_samples = []
            samples_hidden = False

        columns_context.append(
            ColumnContext(
                name=col.name,
                duckdb_type=col.type,
                null_pct=null_pct,
                min_val=min_val,
                max_val=max_val,
                distinct_count=distinct_count,
                sample_values=processed_samples,
                samples_hidden=samples_hidden,
            )
        )

    # 4. Handle very wide tables (> max_columns_in_context)
    schema_truncated = False
    if len(columns_context) > lim.max_columns_in_context:
        schema_truncated = True
        q_words = set(re.findall(r"\w+", question.lower()))

        def column_relevance(c: ColumnContext) -> Tuple[int, int]:
            # Priority: name mentioned in question > has stats > appearance order
            word_match = 1 if any(w in c.name.lower() for w in q_words if len(w) > 2) else 0
            has_stats = 1 if c.distinct_count or c.min_val is not None else 0
            return (word_match, has_stats)

        # Sort relevant columns first, take top max_columns_in_context
        columns_context.sort(key=column_relevance, reverse=True)
        columns_context = columns_context[:lim.max_columns_in_context]

    context = AnalystContext(
        tables_available=schema.tables_available,
        primary_table=schema.table,
        row_count=schema.row_count,
        columns=columns_context,
        cleaning_notes=notes,
        schema_truncated=schema_truncated,
        total_columns_count=total_cols,
    )

    # Cache for job
    _context_cache[job_id] = context
    return context
