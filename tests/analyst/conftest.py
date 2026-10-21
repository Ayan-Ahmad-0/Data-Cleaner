"""Test fixtures and mock helpers for AI Analyst test suite."""

import duckdb
from pathlib import Path
import pytest
from app.storage import JobStorage


@pytest.fixture
def mock_analyst_storage(tmp_path: Path):
    """Create a temporary storage containing a valid Parquet dataset for testing."""
    storage = JobStorage(base_dir=str(tmp_path / "data_jobs"))
    job_id = "test_analyst_job_101"

    clean_pq = storage.clean_parquet_path(job_id)
    clean_pq.parent.mkdir(parents=True, exist_ok=True)

    # Populate Parquet with realistic dataset including timestamps, numerics, text, nulls, and sensitive fields
    con = duckdb.connect()
    con.execute("""
        CREATE TABLE sample_data (
            trip_id INTEGER,
            passenger_count INTEGER,
            trip_distance DOUBLE,
            fare_amount DOUBLE,
            pickup_datetime TIMESTAMP,
            payment_type VARCHAR,
            passenger_email VARCHAR,
            driver_phone VARCHAR,
            notes VARCHAR
        );
        INSERT INTO sample_data VALUES
            (1, 1, 2.5, 12.50, TIMESTAMP '2026-05-01 08:30:00', 'Credit', 'alice@example.com', '+1-555-0199', 'Morning commute to downtown center'),
            (2, 2, 8.1, 35.00, TIMESTAMP '2026-05-01 14:15:00', 'Cash', 'bob@work.org', '555-0123', 'Airport run'),
            (3, 1, 0.9, 6.00,  TIMESTAMP '2026-05-02 09:00:00', 'Credit', 'carol@test.com', '555-0144', NULL),
            (4, NULL, 4.3, 18.25, TIMESTAMP '2026-05-02 20:45:00', 'Credit', NULL, NULL, 'Evening trip'),
            (5, 3, 15.0, 52.00, TIMESTAMP '2026-05-03 11:30:00', 'Dispute', 'dave@corp.net', '+1-555-0188', 'Long trip with very long notes field exceeding forty characters easily for truncation test');
    """)

    pq_path_str = str(clean_pq).replace("\\", "/")
    con.execute(f"COPY sample_data TO '{pq_path_str}' (FORMAT PARQUET);")
    con.close()

    return storage, job_id


@pytest.fixture
def sample_analyst_profile():
    """Profile matching the dataset above."""
    return {
        "file_info": {"rows": 5},
        "duplicates": {"exact_rows": 0, "exact_pct": 0.0},
        "columns": {
            "trip_id": {"inferred_type": "INTEGER", "nulls": 0, "null_pct": 0.0, "distinct": 5, "min": 1, "max": 5},
            "passenger_count": {"inferred_type": "INTEGER", "nulls": 1, "null_pct": 20.0, "distinct": 3, "min": 1, "max": 3},
            "trip_distance": {"inferred_type": "DOUBLE", "nulls": 0, "null_pct": 0.0, "distinct": 5, "min": 0.9, "max": 15.0},
            "fare_amount": {"inferred_type": "DOUBLE", "nulls": 0, "null_pct": 0.0, "distinct": 5, "min": 6.0, "max": 52.0},
            "pickup_datetime": {"inferred_type": "TIMESTAMP", "nulls": 0, "null_pct": 0.0, "distinct": 5},
            "payment_type": {"inferred_type": "VARCHAR", "nulls": 0, "null_pct": 0.0, "distinct": 3},
            "passenger_email": {"inferred_type": "VARCHAR", "nulls": 1, "null_pct": 20.0, "distinct": 4},
            "driver_phone": {"inferred_type": "VARCHAR", "nulls": 1, "null_pct": 20.0, "distinct": 4},
            "notes": {"inferred_type": "VARCHAR", "nulls": 1, "null_pct": 20.0, "distinct": 4},
        },
    }
