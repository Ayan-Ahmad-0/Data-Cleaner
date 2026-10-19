"""Parquet format adapter."""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ConversionError, ConversionReport, FormatAdapter
from formats.flatten import generate_flattening_expressions


class ParquetAdapter(FormatAdapter):
    """Adapter for Parquet files (.parquet, .pq)."""

    format_id = "parquet"
    extensions = (".parquet", ".pq")

    def sniff(self, path: Path) -> float:
        """Check for Parquet magic bytes 'PAR1' at head or tail of the file."""
        if not path.exists() or path.stat().st_size < 8:
            return 0.0

        try:
            with open(path, "rb") as f:
                header = f.read(4)
                if header == b"PAR1":
                    return 1.0
                # Also check trailer
                f.seek(-4, 2)
                trailer = f.read(4)
                if trailer == b"PAR1":
                    return 1.0
            return 0.0
        except Exception:
            return 0.0

    def preview(
        self,
        path: Path,
        options: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], ConversionReport]:
        options = options or {}
        sql_path = str(path.resolve()).replace("\\", "/")
        conn = duckdb.connect(":memory:")

        try:
            read_sql = f"read_parquet('{sql_path}')"
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW _pq_v AS SELECT * FROM {read_sql}")
            col_info = conn.execute("DESCRIBE _pq_v").fetchall()
            cols_with_types = [(c[0], c[1]) for c in col_info]

            select_exprs, flattened, flat_warnings = generate_flattening_expressions(cols_with_types)
            select_clause = ", ".join(select_exprs) if select_exprs else "*"

            query = f"SELECT {select_clause} FROM _pq_v LIMIT {int(limit)}"
            cursor = conn.execute(query)
            col_names = [desc[0] for desc in cursor.description]
            raw_tuples = cursor.fetchall()
            clean_rows = [dict(zip(col_names, row)) for row in raw_tuples]

            final_cols = list(clean_rows[0].keys()) if clean_rows else [c[0] for c in cols_with_types]
            col_types_dict = {c[0]: c[1] for c in cols_with_types}

            count_res = conn.execute("SELECT COUNT(*) FROM _pq_v").fetchone()
            total_rows = count_res[0] if count_res else len(clean_rows)

            warnings = list(flat_warnings)
            if flattened:
                warnings.append("Nested struct columns were flattened with dot notation.")

            report = ConversionReport(
                source_format="parquet",
                rows=total_rows,
                columns=final_cols,
                column_types=col_types_dict,
                warnings=warnings,
                options_used=options,
                flattened=flattened,
            )
            return clean_rows, report
        except Exception as e:
            raise ConversionError(f"Failed to preview Parquet file '{path.name}': {e}") from e
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
        conn = duckdb.connect(":memory:")

        try:
            read_sql = f"read_parquet('{sql_in}')"
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW _pq_v AS SELECT * FROM {read_sql}")
            col_info = conn.execute("DESCRIBE _pq_v").fetchall()
            cols_with_types = [(c[0], c[1]) for c in col_info]

            select_exprs, flattened, flat_warnings = generate_flattening_expressions(cols_with_types)
            select_clause = ", ".join(select_exprs) if select_exprs else "*"

            conn.execute(f"""
                COPY (SELECT {select_clause} FROM _pq_v)
                TO '{sql_out}'
                (FORMAT PARQUET, COMPRESSION ZSTD);
            """)

            # Get resulting schema from destination
            dest_info = conn.execute(f"DESCRIBE (SELECT * FROM read_parquet('{sql_out}'))").fetchall()
            columns = [c[0] for c in dest_info]
            column_types = {c[0]: c[1] for c in dest_info}

            count_res = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{sql_out}')").fetchone()
            rows = count_res[0] if count_res else 0

            warnings = list(flat_warnings)
            if flattened:
                warnings.append("Nested struct columns were flattened with dot notation.")

            return ConversionReport(
                source_format="parquet",
                rows=rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=options,
                flattened=flattened,
            )
        except Exception as e:
            raise ConversionError(f"Failed to convert Parquet file '{path.name}': {e}") from e
        finally:
            conn.close()
