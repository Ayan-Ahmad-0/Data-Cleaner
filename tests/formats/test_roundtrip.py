"""Round-trip end-to-end tests for the 4-function Public API."""

from pathlib import Path
import pytest
import duckdb

from formats import (
    convert_to_parquet,
    detect_format,
    export_cleaned,
    list_export_options,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("fixture_name, expected_fmt", [
    ("sample.csv", "csv"),
    ("sample.tsv", "csv"),
    ("sample.parquet", "parquet"),
    ("sample.ndjson", "json"),
    ("nested.json", "json"),
    ("sample.xlsx", "xlsx"),
    ("sample.db", "sqlite"),
])
def test_public_api_roundtrip(fixture_name, expected_fmt, tmp_path):
    source_file = FIXTURES / fixture_name

    # 1. detect_format
    detected_fmt, score = detect_format(source_file)
    assert detected_fmt == expected_fmt
    assert score >= 0.70

    # 2. convert_to_parquet
    staged_pq = tmp_path / f"{source_file.stem}_staged.parquet"
    report = convert_to_parquet(source_file, staged_pq)
    assert staged_pq.exists()
    assert report.rows > 0

    # 3. list_export_options
    export_options = list_export_options(report.source_format, report.rows)
    assert len(export_options) >= 5
    export_format_ids = [opt["format_id"] for opt in export_options]
    assert "csv" in export_format_ids
    assert "parquet" in export_format_ids
    assert "ndjson" in export_format_ids

    # 4. export_cleaned to multiple formats
    for target_fmt in ["csv", "parquet", "ndjson"]:
        out_dir = tmp_path / "exports"
        exported_files = export_cleaned(staged_pq, out_dir, target_fmt)
        assert len(exported_files) >= 1
        assert exported_files[0].exists()

        # Verify exported content can be read back with matching row count
        conn = duckdb.connect(":memory:")
        exp_path = str(exported_files[0]).replace("\\", "/")
        if target_fmt == "csv":
            count = conn.execute(f"SELECT COUNT(*) FROM read_csv_auto('{exp_path}')").fetchone()[0]
        elif target_fmt == "parquet":
            count = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{exp_path}')").fetchone()[0]
        elif target_fmt == "ndjson":
            count = conn.execute(f"SELECT COUNT(*) FROM read_json_auto('{exp_path}')").fetchone()[0]
        conn.close()

        assert count == report.rows
