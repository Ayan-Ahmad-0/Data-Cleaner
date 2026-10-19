"""Unit tests for format detection."""

from pathlib import Path
import pytest
from formats.detect import detect_format

FIXTURES = Path(__file__).parent / "fixtures"


def test_detect_standard_csv():
    fmt, score = detect_format(FIXTURES / "sample.csv")
    assert fmt == "csv"
    assert score >= 0.8


def test_detect_semicolon_csv():
    fmt, score = detect_format(FIXTURES / "semicolon.csv")
    assert fmt == "csv"
    assert score >= 0.7


def test_detect_tsv():
    fmt, score = detect_format(FIXTURES / "sample.tsv")
    assert fmt == "csv"
    assert score >= 0.7


def test_detect_parquet():
    fmt, score = detect_format(FIXTURES / "sample.parquet")
    assert fmt == "parquet"
    assert score == 1.0


def test_detect_ndjson():
    fmt, score = detect_format(FIXTURES / "sample.ndjson")
    assert fmt == "json"
    assert score >= 0.85


def test_detect_nested_json():
    fmt, score = detect_format(FIXTURES / "nested.json")
    assert fmt == "json"
    assert score >= 0.85


def test_detect_excel():
    fmt, score = detect_format(FIXTURES / "sample.xlsx")
    assert fmt == "xlsx"
    assert score >= 0.90


def test_detect_sqlite():
    fmt, score = detect_format(FIXTURES / "sample.db")
    assert fmt == "sqlite"
    assert score == 1.0


def test_detect_wrong_extension_csv_in_txt():
    """Content sniffing should identify CSV even when extension is .txt."""
    fmt, score = detect_format(FIXTURES / "wrong_ext_csv_as_txt.txt")
    assert fmt == "csv"
    assert score >= 0.80


def test_detect_wrong_extension_json_in_csv():
    """Content sniffing should identify JSON even when extension is .csv."""
    fmt, score = detect_format(FIXTURES / "wrong_ext_json_as_csv.csv")
    assert fmt == "json"
    assert score >= 0.80


def test_detect_empty_file():
    fmt, score = detect_format(FIXTURES / "empty.csv")
    assert fmt == "unknown"
    assert score < 0.5
