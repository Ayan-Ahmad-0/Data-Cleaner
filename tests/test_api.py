"""Integration tests for FastAPI endpoints and job lifecycle."""

import io
import time
from fastapi.testclient import TestClient
import pytest

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["engine"] == "DuckDB"


def test_full_api_workflow_end_to_end():
    # 1. Upload sample CSV
    csv_content = (
        "id,name,age\n"
        "usr_1,Alice,25\n"
        "usr_2,Bob,N/A\n"
        "usr_2,Bob,N/A\n"
        "usr_3,Charlie,-5\n"
    )
    files = {"file": ("test_users.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    upload_res = client.post("/api/jobs/upload", files=files, data={"privacy_mode": "false"})
    assert upload_res.status_code == 200
    job_id = upload_res.json()["id"]

    # In TestClient, background tasks run synchronously
    # 2. Check job status - should be AWAITING_APPROVAL after conversion and AI draft
    detail_res = client.get(f"/api/jobs/{job_id}")
    assert detail_res.status_code == 200
    data = detail_res.json()
    assert data["job"]["status"] == "AWAITING_APPROVAL"
    assert data["profile"] is not None
    assert data["recipe"] is not None
    assert len(data["recipe_plain_english"]) > 0

    # 3. Approve and trigger cleaning
    clean_trigger = client.post(f"/api/jobs/{job_id}/clean")
    assert clean_trigger.status_code == 200

    # 4. Check status after cleaning & verification
    after_clean = client.get(f"/api/jobs/{job_id}")
    assert after_clean.status_code == 200
    clean_data = after_clean.json()
    assert clean_data["job"]["status"] in ("DONE", "DONE_WITH_WARNINGS")
    assert clean_data["verification"] is not None

    # 5. Download cleaned CSV
    download_res = client.get(f"/api/jobs/{job_id}/download/csv")
    assert download_res.status_code == 200
    assert "usr_1" in download_res.text
    # Exact duplicate was dropped
    assert download_res.text.count("usr_2") == 1
