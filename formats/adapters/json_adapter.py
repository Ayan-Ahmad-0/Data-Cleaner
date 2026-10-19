"""JSON array and NDJSON (newline-delimited JSON) format adapter."""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ConversionError, ConversionReport, FormatAdapter
from formats.flatten import generate_flattening_expressions


class JsonAdapter(FormatAdapter):
    """Adapter for JSON (array of objects) and NDJSON (newline-delimited JSON) files."""

    format_id = "json"
    extensions = (".json", ".ndjson", ".jsonl", ".json.gz", ".ndjson.gz")

    def sniff(self, path: Path) -> float:
        """Analyze first chunk to determine if file is JSON array or NDJSON."""
        if not path.exists() or path.stat().st_size == 0:
            return 0.0

        try:
            with open(path, "rb") as f:
                head_bytes = f.read(65536)

            text = head_bytes.decode("utf-8", errors="ignore").strip()
            if not text:
                return 0.0

            # 1. Check for JSON array of objects: starts with '['
            if text.startswith("["):
                # verify it contains object structure
                if "{" in text:
                    return 0.95
                return 0.85

            # 2. Check for NDJSON: starts with '{' and has multiple lines with '{'
            if text.startswith("{"):
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                if len(lines) >= 1:
                    # Test if first line is valid json
                    try:
                        parsed = json.loads(lines[0])
                        if isinstance(parsed, dict):
                            if len(lines) > 1 and lines[1].startswith("{"):
                                return 0.95  # Strong NDJSON signal
                            if path.suffix.lower() in (".ndjson", ".jsonl"):
                                return 0.95
                            return 0.85
                    except Exception:
                        pass

            if path.suffix.lower() in self.extensions:
                return 0.40
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
            read_sql = f"read_json_auto('{sql_path}', union_by_name=true)"
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW _json_v AS SELECT * FROM {read_sql}")
            col_info = conn.execute("DESCRIBE _json_v").fetchall()
            cols_with_types = [(c[0], c[1]) for c in col_info]

            array_mode = options.get("array_mode", "json_string")
            select_exprs, flattened, flat_warnings = generate_flattening_expressions(
                cols_with_types,
                array_mode=array_mode,
            )
            select_clause = ", ".join(select_exprs) if select_exprs else "*"

            query = f"SELECT {select_clause} FROM _json_v LIMIT {int(limit)}"
            cursor = conn.execute(query)
            col_names = [desc[0] for desc in cursor.description]
            raw_tuples = cursor.fetchall()
            clean_rows = [dict(zip(col_names, row)) for row in raw_tuples]

            final_cols = list(clean_rows[0].keys()) if clean_rows else [c[0] for c in cols_with_types]
            col_types_dict = {c[0]: c[1] for c in cols_with_types}

            count_res = conn.execute("SELECT COUNT(*) FROM _json_v").fetchone()
            total_rows = count_res[0] if count_res else len(clean_rows)

            sub_format = self._detect_sub_format(path)
            warnings = list(flat_warnings)
            if flattened:
                warnings.append("Nested JSON structures were flattened to dot notation.")

            # Check for mixed type indicators (columns typed as VARCHAR or JSON containing varied structures)
            for col_name, col_type in cols_with_types:
                if col_type.upper() in ("JSON", "VARCHAR") and ("struct" in col_name.lower() or "mixed" in col_name.lower()):
                    warnings.append(f"Column '{col_name}' contains mixed types; normalized to text representation.")

            report = ConversionReport(
                source_format=sub_format,
                rows=total_rows,
                columns=final_cols,
                column_types=col_types_dict,
                warnings=warnings,
                options_used=options,
                flattened=flattened,
            )
            return clean_rows, report
        except Exception as e:
            raise ConversionError(f"Failed to preview JSON file '{path.name}': {e}") from e
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
            read_sql = f"read_json_auto('{sql_in}', union_by_name=true)"
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW _json_v AS SELECT * FROM {read_sql}")
            col_info = conn.execute("DESCRIBE _json_v").fetchall()
            cols_with_types = [(c[0], c[1]) for c in col_info]

            array_mode = options.get("array_mode", "json_string")
            select_exprs, flattened, flat_warnings = generate_flattening_expressions(
                cols_with_types,
                array_mode=array_mode,
            )
            select_clause = ", ".join(select_exprs) if select_exprs else "*"

            conn.execute(f"""
                COPY (SELECT {select_clause} FROM _json_v)
                TO '{sql_out}'
                (FORMAT PARQUET, COMPRESSION ZSTD);
            """)

            dest_info = conn.execute(f"DESCRIBE (SELECT * FROM read_parquet('{sql_out}'))").fetchall()
            columns = [c[0] for c in dest_info]
            column_types = {c[0]: c[1] for c in dest_info}

            count_res = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{sql_out}')").fetchone()
            rows = count_res[0] if count_res else 0

            sub_format = self._detect_sub_format(path)
            warnings = list(flat_warnings)
            if flattened:
                warnings.append("Nested JSON structures were flattened to dot notation.")

            return ConversionReport(
                source_format=sub_format,
                rows=rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=options,
                flattened=flattened,
            )
        except Exception as e:
            raise ConversionError(f"Failed to convert JSON file '{path.name}' to Parquet: {e}") from e
        finally:
            conn.close()

    def _detect_sub_format(self, path: Path) -> str:
        """Return 'ndjson' or 'json'."""
        ext = path.suffix.lower()
        if ext in (".ndjson", ".jsonl"):
            return "ndjson"
        try:
            with open(path, "rb") as f:
                head = f.read(1024).decode("utf-8", errors="ignore").strip()
            if head.startswith("{"):
                return "ndjson"
        except Exception:
            pass
        return "json"
