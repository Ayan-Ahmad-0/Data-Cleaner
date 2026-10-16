"""Unit tests for Phase 1: Converter and Profiler."""

import csv
import json
from pathlib import Path
import pytest
from core.converter import Converter
from core.profiler import Profiler


@pytest.fixture
def sample_messy_csv(tmp_path: Path) -> Path:
    """Create a controlled CSV with known data-quality issues."""
    csv_file = tmp_path / "messy_sample.csv"
    rows = [
        ["id", "name", "age", "signup_date", "score"],
        ["usr_1", "Alice  ", "25", "2025-01-10", "98.5"],
        ["usr_2", "Bob", "N/A", "2025-01-12", "76.0"],
        ["usr_3", "Charlie", "-5", "15/02/2025", "none"],
        ["usr_4", "David", "30", "2025-02-20", "88.0"],
        ["usr_4", "David", "30", "2025-02-20", "88.0"],  # Exact duplicate
        ["usr_5", "Eve", "42", "2025-03-01 14:30:00", "-"],
    ]
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    return csv_file


def test_converter_creates_text_parquet(sample_messy_csv: Path, tmp_path: Path):
    """Verify Converter in-gests CSV as text and outputs valid Parquet."""
    out_parquet = tmp_path / "output.parquet"
    converter = Converter()
    result = converter.convert(sample_messy_csv, out_parquet)

    assert Path(result.parquet_path).exists()
    assert result.row_count == 6  # 6 data rows
    assert "id" in result.column_names
    assert "age" in result.column_names
    assert result.duration_seconds >= 0


def test_profiler_detects_issues(sample_messy_csv: Path, tmp_path: Path):
    """Verify Profiler identifies duplicates, null tokens, whitespace, and formats."""
    out_parquet = tmp_path / "output.parquet"
    converter = Converter()
    conv_result = converter.convert(sample_messy_csv, out_parquet)

    profiler = Profiler()
    profile = profiler.profile_parquet(conv_result.parquet_path, sample_messy_csv)
    p_dict = profile.to_dict()

    # 1. Check duplicate detection (1 duplicate row out of 6 rows)
    assert p_dict["duplicates"]["exact_rows"] == 1
    assert p_dict["duplicates"]["exact_pct"] > 0

    # 2. Check whitespace issue detection on 'name' ("Alice  ")
    assert p_dict["columns"]["name"]["whitespace_issues"] >= 1

    # 3. Check null token detection in 'age' ('N/A') and 'score' ('none', '-')
    assert "N/A" in p_dict["columns"]["age"]["null_tokens"]
    assert "none" in p_dict["columns"]["score"]["null_tokens"]
    assert "-" in p_dict["columns"]["score"]["null_tokens"]

    # 4. Check negative age detection (-5)
    age_col = p_dict["columns"]["age"]
    assert age_col["inferred_type"] == "integer"
    assert age_col["negatives"] == 1
    assert age_col["min"] == -5.0

    # 5. Check date format detection on signup_date
    date_col = p_dict["columns"]["signup_date"]
    assert date_col["inferred_type"] == "timestamp"
    assert len(date_col["formats"]) >= 1

    # 6. Check JSON serialization validity
    json_str = json.dumps(p_dict)
    assert len(json_str) > 0
