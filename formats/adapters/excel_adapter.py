"""Excel (.xlsx) format adapter powered by DuckDB excel extension."""

from __future__ import annotations
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ConversionError, ConversionReport, FormatAdapter


class ExcelAdapter(FormatAdapter):
    """Adapter for Excel (.xlsx, .xlsm) workbooks."""

    format_id = "xlsx"
    extensions = (".xlsx", ".xlsm")

    def sniff(self, path: Path) -> float:
        """Inspect zip archive structure for Excel workbook signatures."""
        if not path.exists() or path.stat().st_size < 30:
            return 0.0

        try:
            with open(path, "rb") as f:
                magic = f.read(4)
            if magic != b"PK\x03\x04":
                return 0.0

            # Verify it is an xlsx by inspecting zip entries
            with zipfile.ZipFile(path, "r") as z:
                namelist = z.namelist()
                if any("xl/workbook.xml" in n for n in namelist) or any("[Content_Types].xml" in n for n in namelist):
                    return 0.95
            return 0.0
        except Exception:
            return 0.0

    def list_sheets(self, path: Path) -> List[str]:
        """Extract sheet names from workbook zip metadata."""
        sheets: List[str] = []
        try:
            with zipfile.ZipFile(path, "r") as z:
                if "xl/workbook.xml" in z.namelist():
                    xml_content = z.read("xl/workbook.xml").decode("utf-8", errors="ignore")
                    import re
                    # Look for <sheet name="..."
                    matches = re.findall(r'<sheet[^>]+name="([^"]+)"', xml_content)
                    if matches:
                        return matches
        except Exception:
            pass
        return ["Sheet1"]

    def preview(
        self,
        path: Path,
        options: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], ConversionReport]:
        options = options or {}
        sql_path = str(path.resolve()).replace("\\", "/")
        sheets = self.list_sheets(path)

        conn = duckdb.connect(":memory:")
        self._load_extension(conn)

        try:
            read_sql = self._build_read_sql(sql_path, options, sheets)
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW _preview_v AS SELECT * FROM {read_sql}")
            preview_query = f"SELECT * FROM _preview_v LIMIT {int(limit)}"
            cursor = conn.execute(preview_query)
            col_names = [desc[0] for desc in cursor.description]
            raw_tuples = cursor.fetchall()
            clean_rows = [dict(zip(col_names, row)) for row in raw_tuples]

            col_info = conn.execute("DESCRIBE _preview_v").fetchall()
            columns = [c[0] for c in col_info]
            column_types = {c[0]: c[1] for c in col_info}

            count_res = conn.execute("SELECT COUNT(*) FROM _preview_v").fetchone()
            total_rows = count_res[0] if count_res else len(clean_rows)

            selected_sheet = options.get("sheet") or (sheets[0] if sheets else "Sheet1")
            report_options = dict(options)
            report_options["sheets"] = sheets
            report_options["selected_sheet"] = selected_sheet

            warnings = ["Formulas are read as cached values and not re-evaluated."]
            if len(sheets) > 1 and not options.get("sheet"):
                warnings.append(f"Multiple sheets found ({', '.join(sheets)}). Defaulting to first sheet '{selected_sheet}'.")

            report = ConversionReport(
                source_format="xlsx",
                rows=total_rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=report_options,
                flattened=False,
            )
            return clean_rows, report
        except Exception as e:
            raise ConversionError(f"Failed to preview Excel workbook '{path.name}': {e}") from e
        finally:
            conn.close()

    def to_parquet(
        self,
        path: Path,
        out_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> ConversionReport:
        options = options or {}
        out_path = Path(out_path).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)

        sql_in = str(path.resolve()).replace("\\", "/")
        sql_out = str(out_path).replace("\\", "/")
        sheets = self.list_sheets(path)

        conn = duckdb.connect(":memory:")
        self._load_extension(conn)

        try:
            read_sql = self._build_read_sql(sql_in, options, sheets, all_varchar=True)
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW staged_excel AS SELECT * FROM {read_sql}")

            col_info = conn.execute("DESCRIBE staged_excel").fetchall()
            columns = [c[0] for c in col_info]
            column_types = {c[0]: c[1] for c in col_info}

            count_res = conn.execute("SELECT COUNT(*) FROM staged_excel").fetchone()
            rows = count_res[0] if count_res else 0

            conn.execute(f"""
                COPY staged_excel
                TO '{sql_out}'
                (FORMAT PARQUET, COMPRESSION ZSTD);
            """)

            selected_sheet = options.get("sheet") or (sheets[0] if sheets else "Sheet1")
            report_options = dict(options)
            report_options["sheets"] = sheets
            report_options["selected_sheet"] = selected_sheet

            warnings = ["Formulas are read as cached values and not re-evaluated."]
            if len(sheets) > 1 and not options.get("sheet"):
                warnings.append(f"Multiple sheets found ({', '.join(sheets)}). Converted first sheet '{selected_sheet}'.")

            return ConversionReport(
                source_format="xlsx",
                rows=rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=report_options,
                flattened=False,
            )
        except Exception as e:
            raise ConversionError(f"Failed to convert Excel workbook '{path.name}' to Parquet: {e}") from e
        finally:
            conn.close()

    def _load_extension(self, conn: duckdb.DuckDBPyConnection) -> None:
        try:
            conn.execute("LOAD excel;")
        except Exception:
            try:
                conn.execute("INSTALL excel; LOAD excel;")
            except Exception as e:
                raise ConversionError(f"DuckDB excel extension could not be loaded: {e}") from e

    def _build_read_sql(
        self,
        sql_path: str,
        options: Dict[str, Any],
        sheets: List[str],
        all_varchar: bool = False,
    ) -> str:
        params: List[str] = [f"'{sql_path}'"]

        sheet = options.get("sheet")
        if not sheet and sheets:
            sheet = sheets[0]
        if sheet:
            sheet_esc = str(sheet).replace("'", "''")
            params.append(f"sheet='{sheet_esc}'")

        if all_varchar:
            params.append("all_varchar=true")

        return f"read_xlsx({', '.join(params)})"
