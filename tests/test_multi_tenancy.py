import io
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pathlib import Path

from app.main import app
from core.tenant import validate_tenant_id


@pytest.fixture
def client():
    return TestClient(app)


def test_tenant_id_validation_valid():
    """Ensure safe alphanumeric tenant IDs pass validation."""
    assert validate_tenant_id("default") == "default"
    assert validate_tenant_id("user_123") == "user_123"
    assert validate_tenant_id("user-abc-XYZ-99") == "user-abc-XYZ-99"
    assert validate_tenant_id("a") == "a"


def test_tenant_id_validation_path_traversal():
    """Reject directory traversal and dangerous characters in tenant ID."""
    dangerous_ids = [
        "../bad",
        "../../root",
        "user/slash",
        "user\\backslash",
        "user space",
        "user;drop",
        "user\x00null",
        "a" * 65,  # Exceeds max length
    ]
    for bad_id in dangerous_ids:
        with pytest.raises((HTTPException, ValueError)):
            validate_tenant_id(bad_id)


def test_tenant_path_traversal_api_rejection(client):
    """API returns 400 Bad Request when path traversal is attempted in X-User-Id header or query."""
    res = client.get("/api/jobs/test-job-id", headers={"X-User-Id": "../../evil"})
    assert res.status_code == 400
    assert "Invalid user_id" in res.json()["detail"]

    res2 = client.get("/api/jobs/test-job-id?user_id=../bad")
    assert res2.status_code == 400
    assert "Invalid user_id" in res2.json()["detail"]


def test_job_upload_and_cross_tenant_isolation(client):
    """
    User A uploads and cleans a dataset. User B must receive 404 Not Found on all endpoints
    (never leaking dataset presence or data).
    """
    csv_data = b"id,name,val\n1,Alice,100\n2,Bob,200\n3,Charlie,300\n"

    # User A creates a job
    res_a = client.post(
        "/api/jobs/upload",
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
        data={"privacy_mode": "false"},
        headers={"X-User-Id": "tenant_alice"},
    )
    assert res_a.status_code == 200
    job_a = res_a.json()
    job_id_a = job_a["id"]
    assert job_a["user_id"] == "tenant_alice"

    # User A approves and cleans the dataset
    res_clean = client.post(f"/api/jobs/{job_id_a}/clean", headers={"X-User-Id": "tenant_alice"})
    assert res_clean.status_code == 200

    # User A can view the job detail
    res_owner = client.get(f"/api/jobs/{job_id_a}", headers={"X-User-Id": "tenant_alice"})
    assert res_owner.status_code == 200
    detail = res_owner.json()
    assert detail["job"]["user_id"] == "tenant_alice"
    assert "user_id=tenant_alice" in detail["download_urls"]["parquet"]

    # User B attempts to access User A's job -> MUST return 404
    res_b = client.get(f"/api/jobs/{job_id_a}", headers={"X-User-Id": "tenant_bob"})
    assert res_b.status_code == 404
    assert "not found" in res_b.json()["detail"].lower()

    # User B attempts to download User A's Parquet -> MUST return 404
    res_b_dl = client.get(f"/api/jobs/{job_id_a}/download/parquet", headers={"X-User-Id": "tenant_bob"})
    assert res_b_dl.status_code == 404

    # User B attempts to execute SQL exploration on User A's dataset -> MUST return 404
    res_b_query = client.post(
        f"/api/explore/{job_id_a}/query",
        json={"sql": "SELECT * FROM data;"},
        headers={"X-User-Id": "tenant_bob"},
    )
    assert res_b_query.status_code == 404

    # User B attempts to query AI Analyst on User A's dataset -> MUST return 404
    res_b_ask = client.post(
        f"/api/explore/{job_id_a}/ask",
        json={"question": "What is the average val?"},
        headers={"X-User-Id": "tenant_bob"},
    )
    assert res_b_ask.status_code == 404

    # User B attempts to view chart stats for User A's dataset -> MUST return 404
    res_b_stats = client.get(
        f"/api/charts/{job_id_a}/stats",
        headers={"X-User-Id": "tenant_bob"},
    )
    assert res_b_stats.status_code == 404

    # User B attempts to detect PII on User A's dataset -> MUST return 404
    res_b_pii = client.get(
        f"/api/jobs/{job_id_a}/pii/detect",
        headers={"X-User-Id": "tenant_bob"},
    )
    assert res_b_pii.status_code == 404


def test_modeling_session_isolation(client):
    """
    Ensure multi-table ERD modeling sessions are strictly partitioned per user.
    """
    # Tenant 1 creates a modeling session
    res1 = client.post("/api/modeling/sessions", headers={"X-User-Id": "tenant_one"})
    assert res1.status_code == 200
    session_id = res1.json()["session_id"]
    assert res1.json()["user_id"] == "tenant_one"

    # Tenant 1 can view session
    res_view = client.get(f"/api/modeling/sessions/{session_id}", headers={"X-User-Id": "tenant_one"})
    assert res_view.status_code == 200

    # Tenant 2 attempts to view Tenant 1's session -> MUST return 404
    res_t2 = client.get(f"/api/modeling/sessions/{session_id}", headers={"X-User-Id": "tenant_two"})
    assert res_t2.status_code == 404

    # Tenant 2 attempts to upload a table to Tenant 1's session -> MUST return 404
    dummy_csv = b"colA,colB\n1,2\n"
    res_t2_upload = client.post(
        f"/api/modeling/sessions/{session_id}/tables",
        files={"file": ("tab.csv", io.BytesIO(dummy_csv), "text/csv")},
        headers={"X-User-Id": "tenant_two"},
    )
    assert res_t2_upload.status_code == 404

    # Tenant 2 attempts to trigger detect -> MUST return 404
    res_t2_detect = client.post(
        f"/api/modeling/sessions/{session_id}/detect",
        headers={"X-User-Id": "tenant_two"},
    )
    assert res_t2_detect.status_code == 404


def test_retention_service_prunes_tenant_partition(tmp_path):
    """
    Verify retention cleanup sweeps across tenant partitions and prunes empty tenant folders.
    """
    from core.retention import StorageRetentionManager, RetentionConfig
    import json
    from datetime import datetime, timezone, timedelta

    config = RetentionConfig(
        ttl_hours=1.0,
        base_data_dir=tmp_path,
    )
    manager = StorageRetentionManager(config=config)

    jobs_base = tmp_path / "jobs"
    tenant_dir = jobs_base / "tenant_x" / "job_expired"
    tenant_dir.mkdir(parents=True, exist_ok=True)
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    meta = {
        "id": "job_expired",
        "filename": "test.csv",
        "status": "ready",
        "progress_pct": 100,
        "current_stage": "done",
        "file_size_bytes": 10,
        "row_count": 1,
        "privacy_mode": False,
        "user_id": "tenant_x",
        "expires_at": past_iso,
    }
    with open(tenant_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f)
    with open(tenant_dir / "clean.parquet", "w", encoding="utf-8") as f:
        f.write("fake parquet data")

    # Run sweep
    result = manager.purge_expired_data(max_age_hours=1.0)
    assert result.jobs_purged >= 1
    # Expired job should be removed
    assert not (jobs_base / "tenant_x" / "job_expired").exists()
    # Empty tenant directory should be cleaned up
    assert not (jobs_base / "tenant_x").exists()
