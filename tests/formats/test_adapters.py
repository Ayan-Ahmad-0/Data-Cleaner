"""Unit tests for all format adapters."""

from pathlib import Path
import pytest
import duckdb

from formats.adapters.csv_adapter import CsvAdapter
from formats.adapters.parquet_adapter import ParquetAdapter
from formats.adapters.json_adapter import JsonAdapter
from formats.adapters.excel_adapter import ExcelAdapter
from formats.adapters.sqlite_adapter import SqliteAdapter

FIXTURES = Path(__file__).parent / "fixtures"


def test_csv_adapter_preview_and_convert(tmp_path):
    adapter = CsvAdapter()
    preview_rows, report = adapter.preview(FIXTURES / "sample.csv", limit=2)
    assert len(preview_rows) == 2
    assert report.rows == 3
    assert "city" in report.columns

    # Test conversion to Parquet
    out_pq = tmp_path / "staged.parquet"
    conv_rep = adapter.to_parquet(FIXTURES / "sample.csv", out_pq)
    assert conv_rep.rows == 3
    assert out_pq.exists()

    # Verify Parquet content via DuckDB
    conn = duckdb.connect(":memory:")
    count = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{str(out_pq).replace('\\', '/')}')").fetchone()[0]
    assert count == 3
    conn.close()


def test_csv_adapter_semicolon_options(tmp_path):
    adapter = CsvAdapter()
    preview_rows, report = adapter.preview(FIXTURES / "semicolon.csv", options={"delimiter": ";"})
    assert report.rows == 2
    assert "amount" in report.columns


def test_parquet_adapter_preview_and_convert(tmp_path):
    adapter = ParquetAdapter()
    rows, report = adapter.preview(FIXTURES / "sample.parquet")
    assert report.rows == 2
    assert "product" in report.columns

    out_pq = tmp_path / "parquet_staged.parquet"
    conv_rep = adapter.to_parquet(FIXTURES / "sample.parquet", out_pq)
    assert conv_rep.rows == 2
    assert out_pq.exists()


def test_json_adapter_ndjson(tmp_path):
    adapter = JsonAdapter()
    rows, report = adapter.preview(FIXTURES / "sample.ndjson")
    assert report.rows == 3
    assert "missing_field" in report.columns

    out_pq = tmp_path / "ndjson_staged.parquet"
    conv_rep = adapter.to_parquet(FIXTURES / "sample.ndjson", out_pq)
    assert conv_rep.rows == 3
    assert conv_rep.source_format == "ndjson"


def test_json_adapter_nested_flattening(tmp_path):
    adapter = JsonAdapter()
    rows, report = adapter.preview(FIXTURES / "nested.json")
    assert report.rows == 2
    assert report.flattened is True
    assert "user.address.city" in report.columns

    out_pq = tmp_path / "nested_staged.parquet"
    conv_rep = adapter.to_parquet(FIXTURES / "nested.json", out_pq)
    assert conv_rep.flattened is True
    assert "user.address.zip" in conv_rep.columns


def test_excel_adapter(tmp_path):
    adapter = ExcelAdapter()
    sheets = adapter.list_sheets(FIXTURES / "sample.xlsx")
    assert len(sheets) >= 1

    rows, report = adapter.preview(FIXTURES / "sample.xlsx")
    assert report.rows >= 1
    assert "customer_id" in report.columns or "Acme Corp" in str(rows)

    out_pq = tmp_path / "excel_staged.parquet"
    conv_rep = adapter.to_parquet(FIXTURES / "sample.xlsx", out_pq)
    assert out_pq.exists()
    assert conv_rep.source_format == "xlsx"


def test_sqlite_adapter(tmp_path):
    adapter = SqliteAdapter()
    tables = adapter.list_tables(FIXTURES / "sample.db")
    assert "users" in tables
    assert "products" in tables

    rows, report = adapter.preview(FIXTURES / "sample.db", options={"table": "users"})
    assert report.rows == 2
    assert "username" in report.columns

    out_pq = tmp_path / "sqlite_staged.parquet"
    conv_rep = adapter.to_parquet(FIXTURES / "sample.db", out_pq, options={"table": "users"})
    assert conv_rep.rows == 2
    assert out_pq.exists()
