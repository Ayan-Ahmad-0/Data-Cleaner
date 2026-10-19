"""CSV and TSV format exporters."""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import duckdb

from formats.base import ExportError, FormatExporter
from formats.exporters.base import atomic_output_file


class CsvExporter(FormatExporter):
    """Exports cleaned Parquet to delimited text (.csv or .tsv)."""

    format_id = "csv"
    extension = ".csv"
    mime_type = "text/csv"

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

        delimiter = options.get("delimiter", ",")
        delim_escaped = delimiter.replace("'", "''")
        include_header = options.get("header", True)
        header_sql = "HEADER" if include_header else ""

        sql_pq = str(cleaned_parquet).replace("\\", "/")

        try:
            with atomic_output_file(out_path) as temp_target:
                sql_out = str(temp_target).replace("\\", "/")
                conn = duckdb.connect(":memory:")
                try:
                    conn.execute(f"""
                        COPY (SELECT * FROM read_parquet('{sql_pq}'))
                        TO '{sql_out}'
                        ({header_sql}, DELIMITER '{delim_escaped}');
                    """)
                finally:
                    conn.close()
            return [out_path]
        except Exception as e:
            raise ExportError(f"Failed to export CSV to '{out_path.name}': {e}") from e


class TsvExporter(CsvExporter):
    """Convenience exporter for tab-delimited text (.tsv)."""

    format_id = "tsv"
    extension = ".tsv"
    mime_type = "text/tab-separated-values"

    def export(
        self,
        cleaned_parquet: Path,
        out_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> List[Path]:
        options = dict(options or {})
        options["delimiter"] = "\t"
        return super().export(cleaned_parquet, out_path, options)
