"""Unit tests for format exporters."""

from pathlib import Path
import pytest
import duckdb

from formats.exporters.csv_exporter import CsvExporter, TsvExporter
from formats.exporters.parquet_exporter import ParquetExporter
from formats.exporters.json_exporter import NdjsonExporter, JsonArrayExporter
from formats.exporters.excel_exporter import ExcelExporter

FIXTURES = Path(__file__).parent / "fixtures"
SOURCE_PQ = FIXTURES / "sample.parquet"


def test_csv_exporter(tmp_path):
    exporter = CsvExporter()
    out_csv = tmp_path / "out.csv"
    res = exporter.export(SOURCE_PQ, out_csv)
    assert len(res) == 1
    assert out_csv.exists()
    content = out_csv.read_text(encoding="utf-8")
    assert "Widget" in content
    assert "Gadget" in content


def test_tsv_exporter(tmp_path):
    exporter = TsvExporter()
    out_tsv = tmp_path / "out.tsv"
    res = exporter.export(SOURCE_PQ, out_tsv)
    assert len(res) == 1
    assert out_tsv.exists()
    content = out_tsv.read_text(encoding="utf-8")
    assert "\t" in content


def test_parquet_exporter(tmp_path):
    exporter = ParquetExporter()
    out_pq = tmp_path / "out.parquet"
    res = exporter.export(SOURCE_PQ, out_pq)
    assert len(res) == 1
    assert out_pq.exists()

    conn = duckdb.connect(":memory:")
    out_pq_sql = str(out_pq).replace("\\", "/")
    count = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{out_pq_sql}')").fetchone()[0]
    assert count == 2
    conn.close()


def test_ndjson_exporter(tmp_path):
    exporter = NdjsonExporter()
    out_ndjson = tmp_path / "out.ndjson"
    res = exporter.export(SOURCE_PQ, out_ndjson)
    assert len(res) == 1
    lines = out_ndjson.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert "Widget" in lines[0]


def test_json_array_exporter(tmp_path):
    exporter = JsonArrayExporter()
    out_json = tmp_path / "out.json"
    res = exporter.export(SOURCE_PQ, out_json)
    assert len(res) == 1
    content = out_json.read_text(encoding="utf-8").strip()
    assert content.startswith("[") and content.endswith("]")


def test_excel_exporter(tmp_path):
    exporter = ExcelExporter()
    out_xlsx = tmp_path / "out.xlsx"
    res = exporter.export(SOURCE_PQ, out_xlsx)
    assert len(res) == 1
    assert out_xlsx.exists()


def test_excel_exporter_splitting_logic():
    exporter = ExcelExporter()
    available, note = exporter.available_for("csv", 2000000)
    assert available is True
    assert "split into 2" in (note or "")
