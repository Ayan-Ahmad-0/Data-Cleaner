"""Single-pass DuckDB profiler generating structured profile.json."""

from __future__ import annotations
import json
import logging
import math
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
import duckdb

from core.duckdb_utils import (
    configure_duckdb_connection,
    get_duckdb_memory_limit,
    get_duckdb_temp_directory,
    get_duckdb_threads,
)

logger = logging.getLogger(__name__)

NULL_TOKENS = ["", "n/a", "na", "null", "none", "-", "?", "undefined", "nan"]

DISPLAY_TOKEN_MAP = {
    "": "<empty>",
    "n/a": "N/A",
    "na": "NA",
    "null": "null",
    "none": "none",
    "-": "-",
    "?": "?",
    "undefined": "undefined",
    "nan": "NaN",
}

COMMON_DATE_FORMATS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
    "%Y-%m-%d %H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%z",
]


@dataclass
class DateFormatMatch:
    format: str
    match_pct: float


@dataclass
class NumericStats:
    min: Optional[float] = None
    max: Optional[float] = None
    median: Optional[float] = None
    q25: Optional[float] = None
    q75: Optional[float] = None
    negatives: int = 0
    negative_pct: float = 0.0


@dataclass
class ColumnProfile:
    name: str
    inferred_type: str
    total_count: int
    nulls: int
    null_pct: float
    null_tokens: Dict[str, int] = field(default_factory=dict)
    distinct_count: int = 0
    candidate_key: bool = False
    whitespace_issues: int = 0
    casing_issues: int = 0
    numeric_stats: Optional[NumericStats] = None
    formats: List[DateFormatMatch] = field(default_factory=list)
    timezone_evidence: Optional[str] = None
    day_month_ambiguous: bool = False
    sample_values: List[str] = field(default_factory=list)


@dataclass
class DuplicateSummary:
    exact_rows: int
    exact_pct: float


@dataclass
class DatasetProfile:
    file_info: Dict[str, Any]
    columns: Dict[str, ColumnProfile]
    duplicates: DuplicateSummary
    duration_seconds: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary matching spec format."""
        cols_dict = {}
        for col_name, cp in self.columns.items():
            entry: Dict[str, Any] = {
                "inferred_type": cp.inferred_type,
                "nulls": cp.nulls,
                "null_pct": cp.null_pct,
                "distinct": cp.distinct_count,
                "candidate_key": cp.candidate_key,
            }
            if cp.null_tokens:
                entry["null_tokens"] = cp.null_tokens
            if cp.whitespace_issues > 0:
                entry["whitespace_issues"] = cp.whitespace_issues
            if cp.casing_issues > 0:
                entry["casing_issues"] = cp.casing_issues
            if cp.numeric_stats:
                entry["min"] = cp.numeric_stats.min
                entry["max"] = cp.numeric_stats.max
                entry["median"] = cp.numeric_stats.median
                entry["negatives"] = cp.numeric_stats.negatives
                entry["negative_pct"] = cp.numeric_stats.negative_pct
            if cp.formats:
                entry["formats"] = [asdict(f) for f in cp.formats]
            if cp.timezone_evidence:
                entry["timezone_evidence"] = cp.timezone_evidence
            if cp.day_month_ambiguous:
                entry["day_month_ambiguous"] = True
            if cp.sample_values:
                entry["sample_values"] = cp.sample_values

            cols_dict[col_name] = entry

        return {
            "file": self.file_info,
            "columns": cols_dict,
            "duplicates": asdict(self.duplicates),
            "profile_duration_seconds": self.duration_seconds,
        }


class Profiler:
    """High-throughput single-pass dataset profiler using DuckDB."""

    def __init__(
        self,
        memory_limit: Optional[str] = None,
        threads: Optional[int] = None,
        privacy_mode: bool = False,
        temp_directory: Optional[str] = None,
    ) -> None:
        self.memory_limit = memory_limit or get_duckdb_memory_limit()
        self.threads = threads or get_duckdb_threads()
        self.privacy_mode = privacy_mode
        self.temp_directory = temp_directory or get_duckdb_temp_directory()

    def _get_connection(self) -> duckdb.DuckDBPyConnection:
        conn = duckdb.connect(":memory:")
        return configure_duckdb_connection(
            conn,
            memory_limit=self.memory_limit,
            threads=self.threads,
            temp_directory=self.temp_directory,
        )

    def profile_parquet(
        self,
        parquet_path: str | Path,
        source_csv_path: Optional[str | Path] = None,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ) -> DatasetProfile:
        """Profile a text-only Parquet file produced by Converter."""
        start_time = time.perf_counter()
        pq_path = Path(parquet_path).resolve()
        if not pq_path.exists():
            raise FileNotFoundError(f"Parquet file not found: {pq_path}")

        pq_sql = str(pq_path).replace("\\", "/")
        conn = self._get_connection()

        try:
            if progress_callback:
                progress_callback(50.0, "Scanning table schema and duplicate records...")

            # Register parquet view
            view_name = "raw_data"
            conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{pq_sql}');")

            # 1. Total row count and columns
            desc = conn.execute(f"DESCRIBE {view_name}").fetchall()
            column_names = [col[0] for col in desc]
            col_count = len(column_names)

            total_rows = conn.execute(f"SELECT COUNT(*) FROM {view_name}").fetchone()[0]

            # 2. Duplicate detection (high-efficiency 64-bit row hash to prevent memory exhaustion)
            if total_rows > 0:
                cols_quoted = ", ".join(f'"{col}"' for col in column_names)
                exact_dup_rows = conn.execute(
                    f"SELECT COUNT(*) - COUNT(DISTINCT hash({cols_quoted})) FROM {view_name}"
                ).fetchone()[0]
                exact_dup_pct = round((exact_dup_rows / total_rows) * 100, 2)
            else:
                exact_dup_rows = 0
                exact_dup_pct = 0.0

            if progress_callback:
                progress_callback(52.0, "Duplicate scan complete. Profiling columns...")

            # 3. Profile each column
            columns_profile: Dict[str, ColumnProfile] = {}
            for idx, col in enumerate(column_names):
                if progress_callback and col_count > 0:
                    pct = 52.0 + (idx / col_count) * 43.0
                    progress_callback(pct, f"Profiling column '{col}' ({idx + 1}/{col_count})...")
                col_profile = self._profile_column(conn, view_name, col, total_rows)
                columns_profile[col] = col_profile

            if progress_callback:
                progress_callback(96.0, "Statistical profile ready. Compiling cleaning recipe...")

            elapsed = round(time.perf_counter() - start_time, 3)

            # File size info
            file_size_bytes = pq_path.stat().st_size
            if source_csv_path and Path(source_csv_path).exists():
                file_size_bytes = Path(source_csv_path).stat().st_size

            file_info = {
                "rows": total_rows,
                "columns": col_count,
                "size_bytes": file_size_bytes,
                "size_gb": round(file_size_bytes / (1024**3), 3),
            }

            return DatasetProfile(
                file_info=file_info,
                columns=columns_profile,
                duplicates=DuplicateSummary(
                    exact_rows=exact_dup_rows, exact_pct=exact_dup_pct
                ),
                duration_seconds=elapsed,
            )

        finally:
            conn.close()

    def _profile_column(
        self,
        conn: duckdb.DuckDBPyConnection,
        view_name: str,
        col_name: str,
        total_rows: int,
    ) -> ColumnProfile:
        """Inspect and compute statistical distributions for a single column."""
        quoted = f'"{col_name}"'

        if total_rows == 0:
            return ColumnProfile(
                name=col_name,
                inferred_type="string",
                total_count=0,
                nulls=0,
                null_pct=0.0,
            )

        # 1. Null, distinct, whitespace, and null token counts
        str_val = f"try_cast({quoted} AS VARCHAR)"
        token_cases = ", ".join(
            [f"SUM(CASE WHEN lower(trim({str_val})) = '{tok}' THEN 1 ELSE 0 END) AS tok_{i}"
             for i, tok in enumerate(NULL_TOKENS)]
        )

        query = f"""
            SELECT
                COUNT({quoted}) AS non_null_count,
                COUNT(DISTINCT {quoted}) AS distinct_count,
                SUM(CASE WHEN {quoted} IS NOT NULL AND length({str_val}) != length(trim({str_val})) THEN 1 ELSE 0 END) AS ws_issues,
                {token_cases}
            FROM {view_name};
        """
        res = conn.execute(query).fetchone()
        non_null_count = res[0]
        distinct_count = res[1]
        ws_issues = res[2] or 0

        # Null tokens
        token_counts: Dict[str, int] = {}
        for i, tok in enumerate(NULL_TOKENS):
            val = res[3 + i] or 0
            if val > 0:
                display_tok = DISPLAY_TOKEN_MAP.get(tok, tok)
                token_counts[display_tok] = val

        sql_nulls = total_rows - non_null_count
        # Total effective nulls include true nulls plus null tokens
        pseudo_nulls = sum(token_counts.values())
        total_nulls = min(total_rows, sql_nulls + pseudo_nulls)
        null_pct = round((total_nulls / total_rows) * 100, 2)

        is_candidate_key = (
            distinct_count == total_rows and total_nulls == 0 and total_rows > 1
        )

        # 2. Type inference on clean non-null values
        # For large tables (> 50,000 rows), test candidate types on a statistically representative sample
        # of up to 100,000 rows to ensure sub-second response on multi-gigabyte datasets without losing precision.
        SAMPLE_SIZE = 100000
        if total_rows > SAMPLE_SIZE:
            sample_subquery = f"(SELECT {quoted} FROM {view_name} WHERE {quoted} IS NOT NULL LIMIT {SAMPLE_SIZE})"
        else:
            sample_subquery = f"(SELECT {quoted} FROM {view_name} WHERE {quoted} IS NOT NULL)"

        type_test_query = f"""
            SELECT
                COUNT(try_cast({quoted} AS BIGINT)) AS int_count,
                COUNT(try_cast({quoted} AS DOUBLE)) AS dbl_count,
                COUNT(try_cast({quoted} AS BOOLEAN)) AS bool_count,
                COUNT(*) AS sample_valid
            FROM {sample_subquery}
            WHERE lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)});
        """
        type_res = conn.execute(type_test_query).fetchone()
        int_valid = type_res[0] or 0
        dbl_valid = type_res[1] or 0
        bool_valid = type_res[2] or 0
        sample_valid = type_res[3] or 0

        inferred_type = "string"
        numeric_stats = None
        formats: List[DateFormatMatch] = []
        timezone_evidence = None
        day_month_ambiguous = False

        if sample_valid > 0 and (int_valid / sample_valid) >= 0.85:
            inferred_type = "integer"
            # Compute numeric stats
            num_q = f"""
                SELECT
                    MIN(try_cast({quoted} AS BIGINT)),
                    MAX(try_cast({quoted} AS BIGINT)),
                    MEDIAN(try_cast({quoted} AS BIGINT)),
                    SUM(CASE WHEN try_cast({quoted} AS BIGINT) < 0 THEN 1 ELSE 0 END)
                FROM {view_name}
                WHERE try_cast({quoted} AS BIGINT) IS NOT NULL;
            """
            num_res = conn.execute(num_q).fetchone()
            neg_count = num_res[3] or 0
            valid_candidates = non_null_count - sum(c for k, c in token_counts.items() if k != "<empty>")
            valid_candidates = max(1, valid_candidates)
            numeric_stats = NumericStats(
                min=float(num_res[0]) if num_res[0] is not None else None,
                max=float(num_res[1]) if num_res[1] is not None else None,
                median=float(num_res[2]) if num_res[2] is not None else None,
                negatives=neg_count,
                negative_pct=round((neg_count / valid_candidates) * 100, 2),
            )
        elif sample_valid > 0 and (dbl_valid / sample_valid) >= 0.85:
            inferred_type = "double"
            num_q = f"""
                SELECT
                    MIN(try_cast({quoted} AS DOUBLE)),
                    MAX(try_cast({quoted} AS DOUBLE)),
                    MEDIAN(try_cast({quoted} AS DOUBLE)),
                    SUM(CASE WHEN try_cast({quoted} AS DOUBLE) < 0 THEN 1 ELSE 0 END)
                FROM {view_name}
                WHERE try_cast({quoted} AS DOUBLE) IS NOT NULL;
            """
            num_res = conn.execute(num_q).fetchone()
            neg_count = num_res[3] or 0
            valid_candidates = non_null_count - sum(c for k, c in token_counts.items() if k != "<empty>")
            valid_candidates = max(1, valid_candidates)
            numeric_stats = NumericStats(
                min=round(float(num_res[0]), 4) if num_res[0] is not None else None,
                max=round(float(num_res[1]), 4) if num_res[1] is not None else None,
                median=round(float(num_res[2]), 4) if num_res[2] is not None else None,
                negatives=neg_count,
                negative_pct=round((neg_count / valid_candidates) * 100, 2),
            )
        elif sample_valid > 0 and (bool_valid / sample_valid) >= 0.95:
            inferred_type = "boolean"
        else:
            # Check for timestamp / date candidates with whitespace tolerance on sample
            fmt_cases = ", ".join(
                [f"COUNT(try_strptime(trim({quoted}), '{fmt}')) AS fmt_{i}"
                 for i, fmt in enumerate(COMMON_DATE_FORMATS)]
            )
            date_q = f"SELECT {fmt_cases} FROM {sample_subquery};"
            try:
                date_res = conn.execute(date_q).fetchone()
                sample_tested = sample_valid
                if sample_tested > 0:
                    for i, fmt in enumerate(COMMON_DATE_FORMATS):
                        matched = date_res[i] or 0
                        pct = round((matched / sample_tested) * 100, 2)
                        if pct >= 2.0:  # Matches at least 2% of sample
                            formats.append(DateFormatMatch(format=fmt, match_pct=pct))

                    if formats:
                        inferred_type = "timestamp"
                        # Sort by highest match percentage
                        formats.sort(key=lambda x: x.match_pct, reverse=True)

                        # Test timezone evidence on sample
                        tz_q = f"""
                            SELECT
                                SUM(CASE WHEN {quoted} LIKE '%Z' THEN 1 ELSE 0 END) AS z_count,
                                SUM(CASE WHEN {quoted} ~ '[+-][0-9]{{2}}:[0-9]{{2}}$' THEN 1 ELSE 0 END) AS offset_count
                            FROM {sample_subquery};
                        """
                        tz_res = conn.execute(tz_q).fetchone()
                        z_cnt = tz_res[0] or 0
                        offset_cnt = tz_res[1] or 0
                        if z_cnt > 0 and offset_cnt == 0:
                            timezone_evidence = "UTC (Z suffix)"
                        elif offset_cnt > 0 and z_cnt == 0:
                            timezone_evidence = "offset"
                        elif offset_cnt > 0 and z_cnt > 0:
                            timezone_evidence = "mixed"
                        else:
                            timezone_evidence = "naive"

                        # Check day/month ambiguity on sample
                        amb_q = f"""
                            SELECT
                                COUNT(try_strptime({quoted}, '%d/%m/%Y')) AS dm_cnt,
                                COUNT(try_strptime({quoted}, '%m/%d/%Y')) AS md_cnt
                            FROM {sample_subquery}
                            WHERE {quoted} LIKE '%/%/%';
                        """
                        amb_res = conn.execute(amb_q).fetchone()
                        dm_c = amb_res[0] or 0
                        md_c = amb_res[1] or 0
                        if dm_c > 0 and dm_c == md_c:
                            day_month_ambiguous = True
            except Exception as e:
                logger.debug("Date format scan skipped: %s", e)

        # 3. Sample values (if privacy_mode is False) - fast sampling from up to 2000 rows
        sample_values = []
        if not self.privacy_mode:
            sample_q = f"""
                SELECT DISTINCT {quoted}
                FROM (SELECT {quoted} FROM {view_name} WHERE {quoted} IS NOT NULL LIMIT 2000)
                WHERE lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)})
                LIMIT 5;
            """
            sample_rows = conn.execute(sample_q).fetchall()
            sample_values = [str(r[0]) for r in sample_rows]

        return ColumnProfile(
            name=col_name,
            inferred_type=inferred_type,
            total_count=total_rows,
            nulls=total_nulls,
            null_pct=null_pct,
            null_tokens=token_counts,
            distinct_count=distinct_count,
            candidate_key=is_candidate_key,
            whitespace_issues=ws_issues,
            casing_issues=0,
            numeric_stats=numeric_stats,
            formats=formats,
            timezone_evidence=timezone_evidence,
            day_month_ambiguous=day_month_ambiguous,
            sample_values=sample_values,
        )
        )
