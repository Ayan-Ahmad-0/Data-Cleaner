"""Tests for the Explore Data public query service."""

from datetime import date, datetime
import decimal
from pathlib import Path
import pytest
import duckdb

from app.storage import JobStorage
from explore.errors import DataNotFoundError, QueryNotAllowedError, QuerySyntaxError
from explore.limits import QueryLimits
from explore.service import export_query, get_schema, run_query, serialize_cell_value


@pytest.fixture
def mock_storage(tmp_path: Path) -> JobStorage:
    """Create a temporary JobStorage for testing service functions."""
    storage = JobStorage(base_dir=str(tmp_path / "jobs"))
    job_id = "test_job_123"
    clean_pq = storage.clean_parquet_path(job_id)

    # Populate parquet dataset
    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE sample (
            id INT,
            item_name VARCHAR,
            amount DECIMAL(10, 2),
            created_date DATE,
            created_at TIMESTAMP
        )
    """)
    for i in range(1, 15):
        con.execute(f"""
            INSERT INTO sample VALUES (
                {i},
                'Item_{i}',
                {i * 10.5},
                DATE '2026-01-{i:02d}',
                TIMESTAMP '2026-01-{i:02d} 10:00:00'
            )
        """)
    con.execute(f"COPY sample TO '{clean_pq.as_posix()}' (FORMAT PARQUET)")
    con.close()

    return storage


def test_get_schema(mock_storage: JobStorage):
    """Verify get_schema extracts column info, types, row count and samples."""
    schema = get_schema("test_job_123", storage=mock_storage)
    assert schema.table == "data"
    assert schema.row_count == 14
    assert len(schema.columns) == 5

    col_names = [c.name for c in schema.columns]
    assert "id" in col_names
    assert "item_name" in col_names
    assert "amount" in col_names

    # Check sample values exist
    id_col = next(c for c in schema.columns if c.name == "id")
    assert len(id_col.sample_values) == 3
    assert id_col.sample_values[0] == 1


def test_run_query_success_and_serialization(mock_storage: JobStorage):
    """Verify run_query executes, serializes dates/decimals, and computes elapsed time."""
    sql = "SELECT id, item_name, amount, created_date FROM data WHERE id <= 3 ORDER BY id"
    result = run_query("test_job_123", sql=sql, storage=mock_storage)

    assert result.row_count_returned == 3
    assert not result.truncated
    assert result.elapsed_seconds >= 0.0

    # Ensure decimals and dates are converted to JSON friendly types
    row0 = result.rows[0]
    assert row0[0] == 1
    assert row0[1] == "Item_1"
    assert isinstance(row0[2], float)
    assert row0[3] == "2026-01-01"


def test_run_query_with_trailing_semicolon(mock_storage: JobStorage):
    """Verify queries with trailing semicolons (e.g. LIMIT 100;) execute cleanly without subquery syntax error."""
    sql = "SELECT id, item_name FROM data WHERE id <= 2 LIMIT 10;"
    result = run_query("test_job_123", sql=sql, storage=mock_storage)
    assert result.row_count_returned == 2
    assert result.rows[0][0] == 1



def test_run_query_truncation_cap(mock_storage: JobStorage):
    """Verify row cap behavior at boundary limit."""
    sql = "SELECT * FROM data ORDER BY id"
    # Request cap at 5 rows
    result = run_query("test_job_123", sql=sql, row_limit=5, storage=mock_storage)

    assert result.row_count_returned == 5
    assert result.truncated is True
    assert len(result.rows) == 5
    assert any("truncated to 5" in w.lower() for w in result.warnings)


def test_run_query_syntax_error_sanitization(mock_storage: JobStorage):
    """Verify syntax or unknown column errors return friendly message without server paths."""
    sql = "SELECT non_existent_column FROM data"
    with pytest.raises(QuerySyntaxError) as exc_info:
        run_query("test_job_123", sql=sql, storage=mock_storage)

    msg = str(exc_info.value)
    assert "non_existent_column" in msg.lower()
    # Ensure raw server path is not exposed
    assert "jobs" not in msg
    assert "cleaned.parquet" not in msg


def test_unknown_or_expired_job(mock_storage: JobStorage):
    """Verify querying an unknown or expired job raises DataNotFoundError."""
    with pytest.raises(DataNotFoundError) as exc_info:
        run_query("non_existent_job_999", sql="SELECT * FROM data", storage=mock_storage)
    assert "not found or has expired" in str(exc_info.value).lower()


def test_export_query(mock_storage: JobStorage, tmp_path: Path):
    """Verify export_query exports full result to CSV."""
    sql = "SELECT id, item_name, amount FROM data WHERE id <= 10 ORDER BY id"
    out_dir = tmp_path / "exports"
    out_file = export_query("test_job_123", sql=sql, out_dir=out_dir, storage=mock_storage)

    assert out_file.exists()
    lines = out_file.read_text(encoding="utf-8").strip().splitlines()
    # 1 header line + 10 data rows
    assert len(lines) == 11
    assert "id,item_name,amount" in lines[0]
    assert "1,Item_1,10.5" in lines[1]


def test_serialize_cell_value():
    """Unit test cell serialization for various non-primitive Python types."""
    d = date(2026, 10, 20)
    dt = datetime(2026, 10, 20, 15, 30, 0)
    dec = decimal.Decimal("123.45")

    val_d, conv_d = serialize_cell_value(d)
    assert val_d == "2026-10-20"
    assert conv_d is True

    val_dt, conv_dt = serialize_cell_value(dt)
    assert val_dt == "2026-10-20T15:30:00"
    assert conv_dt is True

    val_dec, conv_dec = serialize_cell_value(dec)
    assert val_dec == 123.45
    assert conv_dec is True
