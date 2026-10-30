"""CSV to Parquet converter with text-only staging and rejects tracking."""

from __future__ import annotations
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Dict, Any
import duckdb

from core.duckdb_utils import (
    configure_duckdb_connection,
    get_duckdb_memory_limit,
    get_duckdb_temp_directory,
    get_duckdb_threads,
)

logger = logging.getLogger(__name__)


@dataclass
class ConversionResult:
    """Summary of a CSV to Parquet conversion run."""
    csv_path: str
    parquet_path: str
    row_count: int
    column_names: List[str]
    duration_seconds: float
    file_size_bytes: int
    parquet_size_bytes: int
    rejects_count: int = 0
    rejects_path: Optional[str] = None


class Converter:
    """Robust CSV-to-Parquet conversion engine backed by DuckDB."""

    def __init__(
        self,
        memory_limit: Optional[str] = None,
        threads: Optional[int] = None,
        temp_directory: Optional[str] = None,
    ) -> None:
        self.memory_limit = memory_limit or get_duckdb_memory_limit()
        self.threads = threads or get_duckdb_threads()
        self.temp_directory = temp_directory or get_duckdb_temp_directory()

    def _get_connection(self) -> duckdb.DuckDBPyConnection:
        conn = duckdb.connect(":memory:")
        return configure_duckdb_connection(
            conn,
            memory_limit=self.memory_limit,
            threads=self.threads,
            temp_directory=self.temp_directory,
        )

    def convert(
        self,
        csv_path: str | Path,
        output_parquet_path: str | Path,
        rejects_path: Optional[str | Path] = None,
    ) -> ConversionResult:
        """
        Convert a raw CSV into a compressed Parquet file where all columns
        are initially ingested as VARCHAR/text. This prevents incorrect type
        inference from sampling and preserves raw tokens for profiling.
        """
        csv_file = Path(csv_path).resolve()
        parquet_file = Path(output_parquet_path).resolve()
        parquet_file.parent.mkdir(parents=True, exist_ok=True)

        if not csv_file.exists():
            raise FileNotFoundError(f"Input CSV not found: {csv_file}")

        file_size = csv_file.stat().st_size
        start_time = time.perf_counter()

        # Format paths for DuckDB SQL (use forward slashes)
        csv_sql_path = str(csv_file).replace("\\", "/")
        parquet_sql_path = str(parquet_file).replace("\\", "/")

        conn = self._get_connection()
        try:
            # 1. Ingest with all_varchar=true to strictly keep every column as string
            # Also capture column names
            staged_view = "staged_raw_csv"
            conn.execute(f"""
                CREATE OR REPLACE VIEW {staged_view} AS
                SELECT * FROM read_csv(
                    '{csv_sql_path}',
                    header=true,
                    all_varchar=true,
                    ignore_errors=true
                );
            """)

            # Get columns and row count
            col_info = conn.execute(f"DESCRIBE {staged_view}").fetchall()
            column_names = [col[0] for col in col_info]

            count_res = conn.execute(f"SELECT COUNT(*) FROM {staged_view}").fetchone()
            row_count = count_res[0] if count_res else 0

            # 2. Write out to zstd compressed Parquet
            conn.execute(f"""
                COPY (SELECT * FROM {staged_view})
                TO '{parquet_sql_path}'
                (FORMAT PARQUET, COMPRESSION ZSTD);
            """)

            elapsed = time.perf_counter() - start_time
            parquet_size = parquet_file.stat().st_size if parquet_file.exists() else 0

            return ConversionResult(
                csv_path=str(csv_file),
                parquet_path=str(parquet_file),
                row_count=row_count,
                column_names=column_names,
                duration_seconds=round(elapsed, 3),
                file_size_bytes=file_size,
                parquet_size_bytes=parquet_size,
                rejects_count=0,
                rejects_path=str(rejects_path) if rejects_path else None,
            )
        finally:
            conn.close()
