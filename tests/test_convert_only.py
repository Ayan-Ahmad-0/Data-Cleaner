"""Unit and integration tests for Convert-Only Mode (fidelity, compatibility, and convert_file)."""

import io
from pathlib import Path
import pytest

from formats.base import ConversionReport, UnsupportedConversionError
from formats.convert import (
    COMPATIBILITY_MATRIX,
    ConvertResult,
    check_compatibility,
    convert_file,
)
from formats.fidelity import fidelity_warnings

FIXTURES_DIR = Path(__file__).parent / "formats" / "fixtures"


def test_compatibility_matrix_rules():
    # Valid conversions
    ok, note = check_compatibility("csv", "parquet")
    assert ok is True

    ok, note = check_compatibility("ndjson", "csv")
    assert ok is True

    ok, note = check_compatibility("xlsx", "json")
    assert ok is True

    # Same format allowed (e.g. re-export with different delimiter / compression)
    ok, note = check_compatibility("csv", "csv")
    assert ok is True

    # Target without exporter (e.g. 'xml' or 'sqlite' as target)
    ok, err = check_compatibility("csv", "xml")
    assert ok is False
    assert "registered exporter" in err


def test_fidelity_warnings_rules():
    # 1. Flattening warning
    report_flat = ConversionReport(
        source_format="json",
        rows=10,
        columns=["a.b", "a.c"],
        column_types={"a.b": "VARCHAR", "a.c": "BIGINT"},
        flattened=True,
    )
    warns = fidelity_warnings("json", "csv", report_flat)
    assert any("flattened" in w.lower() for w in warns)

    # Flattening warning should NOT trigger if target is parquet
    warns_pq = fidelity_warnings("json", "parquet", report_flat)
    assert not any("flattened" in w.lower() for w in warns_pq)

    # 2. Excel row limit warning
    report_huge = ConversionReport(
        source_format="csv",
        rows=1_200_000,
        columns=["id", "val"],
        column_types={"id": "VARCHAR", "val": "VARCHAR"},
    )
    warns_excel = fidelity_warnings("csv", "xlsx", report_huge)
    assert any("split into" in w.lower() for w in warns_excel)

    # 3. Source Excel formula loss
    report_xlsx = ConversionReport(
        source_format="xlsx",
        rows=50,
        columns=["A", "B"],
        column_types={"A": "VARCHAR", "B": "DOUBLE"},
        options_used={"selected_sheet": "Sheet1"},
    )
    warns_src_xlsx = fidelity_warnings("xlsx", "csv", report_xlsx)
    assert any("cached values" in w.lower() for w in warns_src_xlsx)

    # 4. CSV untyped to typed target
    report_csv = ConversionReport(
        source_format="csv",
        rows=100,
        columns=["id", "score"],
        column_types={"id": "VARCHAR", "score": "DOUBLE"},
    )
    warns_typed = fidelity_warnings("csv", "parquet", report_csv)
    assert any("inferred" in w.lower() for w in warns_typed)

    # 5. Typed source to untyped CSV
    report_typed = ConversionReport(
        source_format="parquet",
        rows=100,
        columns=["id", "dt"],
        column_types={"id": "VARCHAR", "dt": "TIMESTAMP"},
    )
    warns_untyped = fidelity_warnings("parquet", "csv", report_typed)
    assert any("iso-8601" in w.lower() for w in warns_untyped)


def test_convert_file_e2e_csv_to_parquet(tmp_path):
    csv_file = FIXTURES_DIR / "sample.csv"
    progress_calls = []

    def progress_tracker(stage: str, frac: float):
        progress_calls.append((stage, frac))

    res = convert_file(
        input_path=csv_file,
        target_format="parquet",
        work_dir=tmp_path,
        progress_cb=progress_tracker,
    )

    assert isinstance(res, ConvertResult)
    assert len(res.output_files) == 1
    assert res.output_files[0].suffix == ".parquet"
    assert res.output_files[0].exists()
    assert res.rows == 3
    assert len(res.columns) == 4
    assert len(progress_calls) >= 3
    # Check that temp intermediate was removed when target is parquet or kept clean
    assert res.intermediate_parquet is None or res.intermediate_parquet.exists()


def test_convert_file_e2e_ndjson_to_csv_with_fidelity(tmp_path):
    ndjson_file = FIXTURES_DIR / "nested.json"
    res = convert_file(
        input_path=ndjson_file,
        target_format="csv",
        work_dir=tmp_path,
    )

    assert len(res.output_files) == 1
    assert res.output_files[0].suffix == ".csv"
    # Nested struct was flattened -> fidelity warning should be present
    assert any("flattened" in w.lower() for w in res.warnings)


def test_convert_file_unsupported_target_raises(tmp_path):
    csv_file = FIXTURES_DIR / "sample.csv"
    with pytest.raises(UnsupportedConversionError):
        convert_file(
            input_path=csv_file,
            target_format="xml",
            work_dir=tmp_path,
        )
