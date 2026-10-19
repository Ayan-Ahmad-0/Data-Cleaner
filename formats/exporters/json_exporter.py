"""JSON and NDJSON format exporters."""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ExportError, FormatExporter
from formats.exporters.base import atomic_output_file


class NdjsonExporter(FormatExporter):
    """Exports cleaned Parquet to newline-delimited JSON (one JSON object per line)."""

    format_id = "ndjson"
    extension = ".ndjson"
    mime_type = "application/x-ndjson"

    def export(
        self,
        cleaned_parquet: Path,
        out_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> List[Path]:
        options = options or {}
        cleaned_parquet = Path(cleaned_parquet).resolve()
        out_path = Path(out_path).resolve()

        if not cleaned_parquet.exists():
            raise ExportError(f"Cleaned parquet file not found: {cleaned_parquet}")

        sql_pq = str(cleaned_parquet).replace("\\", "/")

        try:
            with atomic_output_file(out_path) as temp_target:
                sql_out = str(temp_target).replace("\\", "/")
                conn = duckdb.connect(":memory:")
                try:
                    conn.execute(f"""
                        COPY (SELECT * FROM read_parquet('{sql_pq}'))
                        TO '{sql_out}'
                        (FORMAT JSON, ARRAY false);
                    """)
                finally:
                    conn.close()
            return [out_path]
        except Exception as e:
            raise ExportError(f"Failed to export NDJSON to '{out_path.name}': {e}") from e


class JsonArrayExporter(FormatExporter):
    """Exports cleaned Parquet to a standard JSON array of objects ([{...}, {...}])."""

    format_id = "json"
    extension = ".json"
    mime_type = "application/json"

    def export(
        self,
        cleaned_parquet: Path,
        out_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> List[Path]:
        options = options or {}
        cleaned_parquet = Path(cleaned_parquet).resolve()
        out_path = Path(out_path).resolve()

        if not cleaned_parquet.exists():
            raise ExportError(f"Cleaned parquet file not found: {cleaned_parquet}")

        sql_pq = str(cleaned_parquet).replace("\\", "/")

        try:
            with atomic_output_file(out_path) as temp_target:
                sql_out = str(temp_target).replace("\\", "/")
                conn = duckdb.connect(":memory:")
                try:
                    conn.execute(f"""
                        COPY (SELECT * FROM read_parquet('{sql_pq}'))
                        TO '{sql_out}'
                        (FORMAT JSON, ARRAY true);
                    """)
                finally:
                    conn.close()
            return [out_path]
        except Exception as e:
            raise ExportError(f"Failed to export JSON to '{out_path.name}': {e}") from e

    def available_for(self, source_format: str, row_count: int) -> Tuple[bool, Optional[str]]:
        if row_count > 50000:
            return True, f"Large dataset ({row_count:,} rows): NDJSON format is recommended for better client streaming."
        return True, None
