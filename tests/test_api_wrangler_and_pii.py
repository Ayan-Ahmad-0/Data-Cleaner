"""Integration tests for PII detection and Data Wrangler FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient
import duckdb

from app.main import app, storage


@pytest.fixture
def api_client():
    return TestClient(app)


@pytest.fixture
def populated_job():
    job_id = "test_api_pii_job"
    clean_pq = storage.clean_parquet_path(job_id)

    con = duckdb.connect(":memory:")
    con.execute(f"""
        COPY (
            SELECT 
                1 AS id, 
                'Alice Wonderland' AS full_name, 
                'alice@wonderland.org' AS email, 
                '123-45-6789' AS ssn,
                'Pending' AS status,
                100.0 AS score
            UNION ALL
            SELECT 
                2 AS id, 
                'Bob Builder' AS full_name, 
                'bob@builder.com' AS email, 
                '234-56-7890' AS ssn,
                NULL AS status,
                NULL AS score
        ) TO '{clean_pq.as_posix()}' (FORMAT PARQUET);
    """)
    con.close()
    return job_id


def test_api_pii_detect(api_client, populated_job):
    res = api_client.get(f"/api/jobs/{populated_job}/pii/detect")
    assert res.status_code == 200
    data = res.json()
    assert data["job_id"] == populated_job
    assert data["detected_count"] >= 2
    detected_cols = [f["column_name"] for f in data["findings"]]
    assert "email" in detected_cols
    assert "ssn" in detected_cols


def test_api_pii_apply(api_client, populated_job):
    payload = {
        "columns": {
            "email": {"strategy": "partial_mask", "entity_type": "email"},
            "ssn": {"strategy": "sha256_hash", "entity_type": "ssn"},
        }
    }
    res = api_client.post(f"/api/jobs/{populated_job}/pii/apply", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True

    # Check preview values
    col_names = [c["name"] for c in data["columns"]]
    email_idx = col_names.index("email")
    ssn_idx = col_names.index("ssn")
    assert data["preview_rows"][0][email_idx] == "a***@wonderland.org"
    assert len(data["preview_rows"][0][ssn_idx]) == 16


def test_api_wrangle_flow(api_client, populated_job):
    # 1. Action: Casing
    res1 = api_client.post(
        f"/api/jobs/{populated_job}/wrangle",
        json={"action": "change_casing", "column": "full_name", "params": {"case": "upper"}},
    )
    assert res1.status_code == 200
    data1 = res1.json()
    name_idx = [c["name"] for c in data1["columns"]].index("full_name")
    assert data1["preview_rows"][0][name_idx] == "ALICE WONDERLAND"
    assert len(data1["history"]) >= 1

    # 2. History
    h_res = api_client.get(f"/api/jobs/{populated_job}/wrangle/history")
    assert h_res.status_code == 200
    assert h_res.json()["can_undo"] is True

    # 3. Undo
    undo_res = api_client.post(f"/api/jobs/{populated_job}/wrangle/undo")
    assert undo_res.status_code == 200
    undo_data = undo_res.json()
    assert undo_data["preview_rows"][0][name_idx] == "Alice Wonderland"
