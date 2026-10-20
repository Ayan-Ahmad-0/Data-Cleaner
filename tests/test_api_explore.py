"""Integration tests for Explore Data REST endpoints in FastAPI."""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient
import duckdb

from app.main import app, storage


@pytest.fixture
def test_client(tmp_path: Path):
    """Provide a TestClient with a sample job Parquet file ready for explore queries."""
    job_id = "test_explore_api_job"
    clean_pq = storage.clean_parquet_path(job_id)

    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE sample (
            id INT,
            city VARCHAR,
            population INT,
            area_sq_km DOUBLE
        )
    """)
    con.execute("INSERT INTO sample VALUES (1, 'Tokyo', 13960000, 2194.0), (2, 'Delhi', 16787941, 1484.0), (3, 'Shanghai', 24870895, 6340.5)")
    con.execute(f"COPY sample TO '{clean_pq.as_posix()}' (FORMAT PARQUET)")
    con.close()

    client = TestClient(app)
    return client, job_id


def test_api_get_explore_schema(test_client):
    """Verify GET /api/explore/{job_id}/schema returns schema metadata and columns."""
    client, job_id = test_client
    resp = client.get(f"/api/explore/{job_id}/schema")
    assert resp.status_code == 200
    data = resp.json()

    assert data["table"] == "data"
    assert data["row_count"] == 3
    assert len(data["columns"]) == 4

    col_names = [c["name"] for c in data["columns"]]
    assert "city" in col_names
    assert "population" in col_names

    # Test querying with explicit table query parameter
    resp_table = client.get(f"/api/explore/{job_id}/schema?table=data")
    assert resp_table.status_code == 200
    assert resp_table.json()["table"] == "data"


def test_api_execute_explore_query(test_client):
    """Verify POST /api/explore/{job_id}/query executes and returns rows and metadata."""
    client, job_id = test_client
    payload = {
        "sql": "SELECT city, population FROM data WHERE population > 15000000 ORDER BY population DESC",
        "row_limit": 10,
    }
    resp = client.post(f"/api/explore/{job_id}/query", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["row_count_returned"] == 2
    assert data["truncated"] is False
    assert data["rows"][0][0] == "Shanghai"
    assert data["rows"][1][0] == "Delhi"


def test_api_execute_query_validation_rejection(test_client):
    """Verify hostile queries are rejected with 400 Bad Request."""
    client, job_id = test_client
    payload = {"sql": "DROP TABLE data"}
    resp = client.post(f"/api/explore/{job_id}/query", json=payload)
    assert resp.status_code == 400
    assert "only select queries are permitted" in resp.json()["detail"].lower()


def test_api_export_explore_query(test_client):
    """Verify POST /api/explore/{job_id}/export returns CSV file download."""
    client, job_id = test_client
    payload = {"sql": "SELECT city, population FROM data ORDER BY id"}
    resp = client.post(f"/api/explore/{job_id}/export", json=payload)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    content = resp.text.strip().splitlines()
    assert len(content) == 4
    assert content[0] == "city,population"
    assert content[1] == "Tokyo,13960000"
