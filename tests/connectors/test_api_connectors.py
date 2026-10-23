"""Tests for REST API connector endpoints."""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import pytest

from app.main import app
from connectors.base import SyncResult, TestConnectionResult

client = TestClient(app)


def test_api_list_connectors():
    res = client.get("/api/connectors")
    assert res.status_code == 200
    connectors = res.json()
    assert isinstance(connectors, list)
    assert len(connectors) >= 2
    ids = [c["id"] for c in connectors]
    assert "s3" in ids
    assert "postgres" in ids


def test_api_test_connector_unknown():
    res = client.post(
        "/api/connectors/test",
        json={"connector_type": "unknown_db", "config": {}},
    )
    assert res.status_code == 400
    assert "Unknown connector type" in res.json()["detail"]


def test_api_test_connector_s3_validation():
    res = client.post(
        "/api/connectors/test",
        json={
            "connector_type": "s3",
            "config": {"bucket": "valid-test-bucket", "region": "us-east-1"},
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "success" in data
    assert data["success"] is True


def test_api_export_job_not_found():
    res = client.post(
        "/api/connectors/export/non_existent_job_123",
        json={
            "connector_type": "s3",
            "config": {"bucket": "my-bucket"},
        },
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_api_export_success_flow(tmp_path):
    job_id = "test_export_job"
    from app.storage import JobStorage
    storage = JobStorage()
    clean_pq = storage.clean_parquet_path(job_id)
    clean_pq.write_bytes(b"dummy parquet bytes")

    mock_sync = SyncResult(
        success=True,
        rows_transferred=850,
        destination_uri="s3://target-bucket/output.parquet",
        elapsed_seconds=0.45,
        message="Exported 850 rows",
    )

    try:
        with patch("connectors.s3.S3Connector.export_dataset", return_value=mock_sync):
            res = client.post(
                f"/api/connectors/export/{job_id}",
                json={
                    "connector_type": "s3",
                    "config": {"bucket": "target-bucket"},
                },
            )
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True
            assert data["rows_transferred"] == 850
            assert "s3://target-bucket/output.parquet" in data["destination_uri"]
    finally:
        storage.cleanup_job(job_id)


def test_api_import_unknown_connector():
    res = client.post(
        "/api/connectors/import",
        json={
            "connector_type": "invalid_engine",
            "config": {},
        },
    )
    assert res.status_code == 400
    assert "Unknown connector type" in res.json()["detail"]


def test_api_import_s3_success():
    from app.orchestrator import get_orchestrator

    mock_sync = SyncResult(
        success=True,
        rows_transferred=2500,
        destination_uri="s3://lake/events.parquet",
        elapsed_seconds=0.6,
        message="Imported 2,500 rows",
    )

    with patch("connectors.s3.S3Connector.import_dataset", return_value=mock_sync), \
         patch("app.orchestrator.JobOrchestrator.run_profile_and_ai_draft"):
        res = client.post(
            "/api/connectors/import",
            json={
                "connector_type": "s3",
                "config": {"source_uri": "s3://lake/events.parquet"},
                "filename": "imported_events.parquet",
                "privacy_mode": True,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "job_id" in data
        assert data["filename"] == "imported_events.parquet"
        assert data["rows_imported"] == 2500
        assert data["status"] == "UPLOADED"
        assert data["sync_result"]["success"] is True

        # Clean up created job
        orch = get_orchestrator()
        orch.storage.cleanup_job(data["job_id"])


def test_api_import_postgres_success():
    from app.orchestrator import get_orchestrator

    mock_sync = SyncResult(
        success=True,
        rows_transferred=1800,
        destination_uri="postgresql://localhost:5432/analytics/public.customers",
        elapsed_seconds=0.35,
        message="Imported 1,800 rows",
    )

    with patch("connectors.postgres.PostgresConnector.import_dataset", return_value=mock_sync), \
         patch("app.orchestrator.JobOrchestrator.run_profile_and_ai_draft"):
        res = client.post(
            "/api/connectors/import",
            json={
                "connector_type": "postgres",
                "config": {
                    "host": "localhost",
                    "database": "analytics",
                    "username": "pguser",
                    "password": "secret",
                    "table_name": "customers",
                },
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "job_id" in data
        assert data["filename"] == "customers.parquet"
        assert data["rows_imported"] == 1800
        assert data["status"] == "UPLOADED"

        # Clean up created job
        orch = get_orchestrator()
        orch.storage.cleanup_job(data["job_id"])

