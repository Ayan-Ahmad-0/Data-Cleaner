"""Fixtures for charts_ai tests."""

from pathlib import Path
import duckdb
import pytest
from app.storage import JobStorage


@pytest.fixture
def mock_charts_storage(tmp_path: Path):
    """Create a temporary storage containing a valid Parquet dataset for charts testing."""
    storage = JobStorage(base_dir=str(tmp_path / "charts_jobs"))
    job_id = "test_chart_job_101"

    clean_pq = storage.clean_parquet_path(job_id)
    clean_pq.parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute("""
        CREATE TABLE sales_data (
            order_id INTEGER,
            category VARCHAR,
            revenue DOUBLE,
            quantity INTEGER,
            order_date TIMESTAMP,
            customer_email VARCHAR
        );
        INSERT INTO sales_data VALUES
            (1, 'Electronics', 250.0, 1, TIMESTAMP '2026-01-01 10:00:00', 'a@test.com'),
            (2, 'Furniture', 450.0, 2, TIMESTAMP '2026-01-02 11:00:00', 'b@test.com'),
            (3, 'Electronics', 120.0, 1, TIMESTAMP '2026-01-03 12:00:00', 'c@test.com'),
            (4, 'Clothing', 80.0, 3, TIMESTAMP '2026-01-04 13:00:00', 'd@test.com'),
            (5, 'Furniture', 300.0, 1, TIMESTAMP '2026-01-05 14:00:00', 'e@test.com'),
            (6, 'Clothing', 150.0, 2, TIMESTAMP '2026-01-06 15:00:00', 'f@test.com');
    """)

    pq_str = str(clean_pq).replace("\\", "/")
    con.execute(f"COPY sales_data TO '{pq_str}' (FORMAT PARQUET);")
    con.close()

    return storage, job_id
