"""Parquet format exporter."""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import duckdb

from formats.base import ExportError, FormatExporter
from formats.exporters.base import atomic_output_file


class ParquetExporter(FormatExporter):
    """Exports cleaned Parquet with ZSTD compression."""

    format_id = "parquet"
    extension = ".parquet"
    mime_type = "application/octet-stream"

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

        compression = options.get("compression", "ZSTD").upper()
        sql_pq = str(cleaned_parquet).replace("\\", "/")

        try:
            with atomic_output_file(out_path) as temp_target:
                sql_out = str(temp_target).replace("\\", "/")
                conn = duckdb.connect(":memory:")
                try:
                    conn.execute(f"""
                        COPY (SELECT * FROM read_parquet('{sql_pq}'))
                        TO '{sql_out}'
                        (FORMAT PARQUET, COMPRESSION {compression});
                    """)
                finally:
                    conn.close()
            return [out_path]
        except Exception as e:
            raise ExportError(f"Failed to export Parquet to '{out_path.name}': {e}") from e
