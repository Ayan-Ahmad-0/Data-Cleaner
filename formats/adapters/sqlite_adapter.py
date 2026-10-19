"""SQLite database format adapter using DuckDB sqlite extension."""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ConversionError, ConversionReport, FormatAdapter


class SqliteAdapter(FormatAdapter):
    """Adapter for SQLite database files (.db, .sqlite, .sqlite3)."""

    format_id = "sqlite"
    extensions = (".db", ".sqlite", ".sqlite3")

    def sniff(self, path: Path) -> float:
        """Check for SQLite header string 'SQLite format 3\x00'."""
        if not path.exists() or path.stat().st_size < 16:
            return 0.0

        try:
            with open(path, "rb") as f:
                header = f.read(16)
            if header == b"SQLite format 3\x00":
                return 1.0
            return 0.0
        except Exception:
            return 0.0

    def list_tables(self, path: Path) -> List[str]:
        """List user tables in SQLite database via sqlite3 standard library."""
        import sqlite3
        try:
            conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()
            return tables or ["main"]
        except Exception:
            return ["main"]

    def preview(
        self,
        path: Path,
        options: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], ConversionReport]:
        options = options or {}
        sql_path = str(path.resolve()).replace("\\", "/")
        tables = self.list_tables(path)
        selected_table = options.get("table") or (tables[0] if tables else "main")

        conn = duckdb.connect(":memory:")
        self._load_extension(conn)

        try:
            conn.execute(f"ATTACH '{sql_path}' AS sqlite_db (READ_ONLY, TYPE sqlite);")
            safe_table = selected_table.replace('"', '""')
            query_table = f'sqlite_db."{safe_table}"'

            col_info = conn.execute(f"DESCRIBE {query_table}").fetchall()
            columns = [c[0] for c in col_info]
            column_types = {c[0]: c[1] for c in col_info}

            cursor = conn.execute(f"SELECT * FROM {query_table} LIMIT {int(limit)}")
            col_names = [desc[0] for desc in cursor.description]
            raw_tuples = cursor.fetchall()
            clean_rows = [dict(zip(col_names, row)) for row in raw_tuples]

            count_res = conn.execute(f"SELECT COUNT(*) FROM {query_table}").fetchone()
            total_rows = count_res[0] if count_res else len(clean_rows)

            report_options = dict(options)
            report_options["tables"] = tables
            report_options["selected_table"] = selected_table

            warnings: List[str] = []
            if len(tables) > 1 and not options.get("table"):
                warnings.append(f"Multiple tables found ({', '.join(tables)}). Defaulting to '{selected_table}'.")

            report = ConversionReport(
                source_format="sqlite",
                rows=total_rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=report_options,
                flattened=False,
            )
            return clean_rows, report
        except Exception as e:
            raise ConversionError(f"Failed to preview SQLite file '{path.name}': {e}") from e
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
        tables = self.list_tables(path)
        selected_table = options.get("table") or (tables[0] if tables else "main")

        conn = duckdb.connect(":memory:")
        self._load_extension(conn)

        try:
            conn.execute(f"ATTACH '{sql_in}' AS sqlite_db (READ_ONLY, TYPE sqlite);")
            safe_table = selected_table.replace('"', '""')
            query_table = f'sqlite_db."{safe_table}"'

            col_info = conn.execute(f"DESCRIBE {query_table}").fetchall()
            columns = [c[0] for c in col_info]
            column_types = {c[0]: c[1] for c in col_info}

            # Select and cast columns to VARCHAR for initial staging
            escaped_cols = [c[0].replace('"', '""') for c in col_info]
            select_cols = ", ".join(f'CAST("{col}" AS VARCHAR) AS "{col}"' for col in escaped_cols)

            conn.execute(f"""
                COPY (SELECT {select_cols} FROM {query_table})
                TO '{sql_out}'
                (FORMAT PARQUET, COMPRESSION ZSTD);
            """)

            count_res = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{sql_out}')").fetchone()
            rows = count_res[0] if count_res else 0

            report_options = dict(options)
            report_options["tables"] = tables
            report_options["selected_table"] = selected_table

            warnings: List[str] = []
            if len(tables) > 1 and not options.get("table"):
                warnings.append(f"Multiple tables found ({', '.join(tables)}). Converted '{selected_table}'.")

            return ConversionReport(
                source_format="sqlite",
                rows=rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=report_options,
                flattened=False,
            )
        except Exception as e:
            raise ConversionError(f"Failed to convert SQLite file '{path.name}' to Parquet: {e}") from e
        finally:
            conn.close()

    def _load_extension(self, conn: duckdb.DuckDBPyConnection) -> None:
        try:
            conn.execute("LOAD sqlite;")
        except Exception:
            try:
                conn.execute("INSTALL sqlite; LOAD sqlite;")
            except Exception as e:
                raise ConversionError(f"DuckDB sqlite extension could not be loaded: {e}") from e
