"""CSV, TSV, and delimited text format adapter."""

from __future__ import annotations
import gzip
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import duckdb

from formats.base import ConversionError, ConversionReport, FormatAdapter


class CsvAdapter(FormatAdapter):
    """Adapter for delimited text formats (.csv, .tsv, .txt, .tab, .gz)."""

    format_id = "csv"
    extensions = (".csv", ".tsv", ".txt", ".tab", ".csv.gz", ".tsv.gz")

    def sniff(self, path: Path) -> float:
        """Analyze initial 64 KB of file to estimate CSV/TSV confidence."""
        if not path.exists() or path.stat().st_size == 0:
            return 0.0

        try:
            sample_bytes = self._read_head_bytes(path, 65536)
            if not sample_bytes:
                return 0.0

            # Decode to text
            try:
                sample_text = sample_bytes.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    sample_text = sample_bytes.decode("latin-1")
                except Exception:
                    return 0.0

            # Check if clearly JSON, XML, or binary
            stripped = sample_text.strip()
            if stripped.startswith(("{", "[", "<?xml", "<")):
                return 0.0
            if b"\x00" in sample_bytes[:1024]:
                return 0.0  # Binary

            # Count potential delimiters across lines
            lines = [l for l in sample_text.splitlines() if l.strip()][:10]
            if not lines:
                return 0.0

            commas = sum(l.count(",") for l in lines)
            tabs = sum(l.count("\t") for l in lines)
            semis = sum(l.count(";") for l in lines)
            pipes = sum(l.count("|") for l in lines)

            max_delim_count = max(commas, tabs, semis, pipes)
            if max_delim_count > len(lines):
                # Strong signal of delimited tabular text
                ext = path.name.lower()
                if ext.endswith((".csv", ".tsv", ".csv.gz", ".tsv.gz")):
                    return 0.95
                return 0.80

            # Single column or text with few delimiters
            if path.suffix.lower() in self.extensions:
                return 0.60
            return 0.30

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
            read_sql = self._build_read_sql(sql_path, options)
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW _preview_v AS SELECT * FROM {read_sql}")
            preview_query = f"SELECT * FROM _preview_v LIMIT {int(limit)}"
            cursor = conn.execute(preview_query)
            col_names = [desc[0] for desc in cursor.description]
            raw_tuples = cursor.fetchall()
            clean_rows = [dict(zip(col_names, row)) for row in raw_tuples]

            # Metadata from relation
            col_info = conn.execute("DESCRIBE _preview_v").fetchall()
            columns = [c[0] for c in col_info]
            column_types = {c[0]: c[1] for c in col_info}

            count_res = conn.execute("SELECT COUNT(*) FROM _preview_v").fetchone()
            total_rows = count_res[0] if count_res else len(clean_rows)

            warnings: List[str] = []
            if options.get("delimiter") is None:
                warnings.append("Delimiter auto-detected by DuckDB engine.")

            report = ConversionReport(
                source_format="tsv" if options.get("delimiter") == "\t" or path.name.endswith(".tsv") else "csv",
                rows=total_rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=options,
                flattened=False,
            )
            return clean_rows, report
        except Exception as e:
            raise ConversionError(f"Failed to preview CSV file '{path.name}': {e}") from e
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
            read_sql = self._build_read_sql(sql_in, options, all_varchar=True)
            conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW staged_csv AS SELECT * FROM {read_sql}")

            col_info = conn.execute("DESCRIBE staged_csv").fetchall()
            columns = [c[0] for c in col_info]
            column_types = {c[0]: c[1] for c in col_info}

            count_res = conn.execute("SELECT COUNT(*) FROM staged_csv").fetchone()
            rows = count_res[0] if count_res else 0

            # Write out to Parquet with ZSTD
            conn.execute(f"""
                COPY staged_csv
                TO '{sql_out}'
                (FORMAT PARQUET, COMPRESSION ZSTD);
            """)

            warnings: List[str] = []
            if options.get("header") is None:
                warnings.append("CSV header auto-detected.")

            return ConversionReport(
                source_format="tsv" if options.get("delimiter") == "\t" or path.name.endswith(".tsv") else "csv",
                rows=rows,
                columns=columns,
                column_types=column_types,
                warnings=warnings,
                options_used=options,
                flattened=False,
            )
        except Exception as e:
            raise ConversionError(f"Failed to convert CSV file '{path.name}' to Parquet: {e}") from e
        finally:
            conn.close()

    def _build_read_sql(
        self,
        sql_path: str,
        options: Dict[str, Any],
        all_varchar: bool = False,
    ) -> str:
        params: List[str] = [f"'{sql_path}'"]

        delim = options.get("delimiter")
        if delim:
            delim_escaped = delim.replace("'", "''")
            params.append(f"delim='{delim_escaped}'")

        header = options.get("header")
        if header is not None:
            params.append(f"header={str(header).lower()}")
        else:
            params.append("header=true")

        if all_varchar:
            params.append("all_varchar=true")

        encoding = options.get("encoding")
        if encoding:
            enc_escaped = encoding.replace("'", "''")
            params.append(f"encoding='{enc_escaped}'")

        params.append("ignore_errors=true")
        return f"read_csv({', '.join(params)})"

    def _read_head_bytes(self, path: Path, max_bytes: int = 65536) -> bytes:
        if path.name.lower().endswith(".gz"):
            try:
                with gzip.open(path, "rb") as gz:
                    return gz.read(max_bytes)
            except Exception:
                return b""
        with open(path, "rb") as f:
            return f.read(max_bytes)
