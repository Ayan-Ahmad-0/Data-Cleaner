"""Excel (.xlsx) format exporter with automatic row-limit splitting."""

from __future__ import annotations
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ExportError, FormatExporter
from formats.exporters.base import atomic_output_file

# Excel worksheet row limit is 1,048,576 rows (1 row reserved for header)
EXCEL_MAX_DATA_ROWS = 1048575


class ExcelExporter(FormatExporter):
    """Exports cleaned Parquet to Excel (.xlsx), splitting across multiple files if row count exceeds 1,048,575."""

    format_id = "xlsx"
    extension = ".xlsx"
    mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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
        conn = duckdb.connect(":memory:")
        self._load_extension(conn)

        try:
            count_res = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{sql_pq}')").fetchone()
            total_rows = count_res[0] if count_res else 0

            # Single file case
            if total_rows <= EXCEL_MAX_DATA_ROWS:
                with atomic_output_file(out_path) as temp_target:
                    sql_out = str(temp_target).replace("\\", "/")
                    conn.execute(f"""
                        COPY (SELECT * FROM read_parquet('{sql_pq}'))
                        TO '{sql_out}'
                        (FORMAT XLSX);
                    """)
                return [out_path]

            # Multi-file splitting case
            num_parts = math.ceil(total_rows / EXCEL_MAX_DATA_ROWS)
            created_files: List[Path] = []

            for part_idx in range(num_parts):
                offset = part_idx * EXCEL_MAX_DATA_ROWS
                part_filename = f"{out_path.stem}_part{part_idx + 1}{out_path.suffix}"
                part_path = out_path.parent / part_filename

                with atomic_output_file(part_path) as temp_target:
                    sql_out = str(temp_target).replace("\\", "/")
                    conn.execute(f"""
                        COPY (
                            SELECT * FROM read_parquet('{sql_pq}')
                            LIMIT {EXCEL_MAX_DATA_ROWS} OFFSET {offset}
                        )
                        TO '{sql_out}'
                        (FORMAT XLSX);
                    """)
                created_files.append(part_path)

            return created_files

        except Exception as e:
            raise ExportError(f"Failed to export Excel workbook to '{out_path.name}': {e}") from e
        finally:
            conn.close()

    def available_for(self, source_format: str, row_count: int) -> Tuple[bool, Optional[str]]:
        if row_count > EXCEL_MAX_DATA_ROWS:
            num_parts = math.ceil(row_count / EXCEL_MAX_DATA_ROWS)
            return True, f"Dataset exceeds 1,048,576 rows and will be split into {num_parts} Excel workbooks."
        return True, None

    def _load_extension(self, conn: duckdb.DuckDBPyConnection) -> None:
        try:
            conn.execute("LOAD excel;")
        except Exception:
            try:
                conn.execute("INSTALL excel; LOAD excel;")
            except Exception as e:
                raise ExportError(f"DuckDB excel extension could not be loaded: {e}") from e
