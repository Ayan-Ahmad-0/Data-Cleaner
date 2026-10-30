"""Unit and integration tests for automated storage retention, TTL, and cleanup."""

import os
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import JobMetadata, JobStatus
from app.orchestrator import JobOrchestrator
from app.storage import JobStorage
from core.retention import RetentionConfig, StorageRetentionManager


@pytest.fixture
def temp_retention_env(tmp_path: Path):
    """Isolated test environment with sandboxed data directory and orchestrator."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("jobs", "convert_jobs", "query_jobs", "modeling", "demo", "benchmarks", "evaluation"):
        (data_dir / sub).mkdir(parents=True, exist_ok=True)

    config = RetentionConfig(
        ttl_hours=1.0,  # 1 hour for testing
        cleanup_interval_minutes=5,
        enabled=True,
        max_disk_usage_percent=90,
        base_data_dir=data_dir,
    )
    storage = JobStorage(base_dir=str(data_dir / "jobs"))
    orchestrator = JobOrchestrator(storage=storage)
    manager = StorageRetentionManager(config=config)

    return {
        "data_dir": data_dir,
        "config": config,
        "storage": storage,
        "orchestrator": orchestrator,
        "manager": manager,
    }


def test_retention_inventory_and_disk_usage(temp_retention_env):
    manager: StorageRetentionManager = temp_retention_env["manager"]
    data_dir: Path = temp_retention_env["data_dir"]

    # Create dummy directories in dynamic folders
    (data_dir / "jobs" / "job_test1").mkdir()
    (data_dir / "jobs" / "job_test1" / "file.txt").write_text("hello")

    (data_dir / "convert_jobs" / "conv_test1").mkdir()
    (data_dir / "convert_jobs" / "conv_test1" / "file.bin").write_bytes(b"0" * 2048)

    inventory = manager.get_storage_inventory()
    assert inventory["jobs"]["count"] == 1
    assert inventory["convert_jobs"]["count"] == 1
    assert inventory["total_dynamic_bytes"] > 2000
    assert "disk" in inventory
    assert inventory["disk"]["total_bytes"] > 0


def test_retention_purges_expired_completed_jobs(temp_retention_env):
    manager: StorageRetentionManager = temp_retention_env["manager"]
    orchestrator: JobOrchestrator = temp_retention_env["orchestrator"]
    storage: JobStorage = temp_retention_env["storage"]
    data_dir: Path = temp_retention_env["data_dir"]

    # Create an expired completed job (created 3 hours ago, TTL is 1 hour)
    old_job = orchestrator.create_job("expired.csv", file_size=100)
    old_time = datetime.now(timezone.utc) - timedelta(hours=3)
    old_job.created_at = old_time
    old_job.status = JobStatus.DONE
    # Write file to storage
    raw_path = storage.raw_file_path(old_job.id, "expired.csv")
    raw_path.write_text("a,b,c\n1,2,3")
    old_timestamp = time.time() - (3 * 3600)
    os.utime(storage.job_dir(old_job.id), (old_timestamp, old_timestamp))

    # Create a fresh active job (created 5 minutes ago)
    fresh_job = orchestrator.create_job("fresh.csv", file_size=100)
    fresh_job.status = JobStatus.DONE
    fresh_raw = storage.raw_file_path(fresh_job.id, "fresh.csv")
    fresh_raw.write_text("x,y,z")

    # Run retention sweep
    result = manager.purge_expired_data(orchestrator=orchestrator)

    assert result.jobs_purged >= 1
    assert result.bytes_freed > 0

    # Old job should be evicted from orchestrator and disk
    assert old_job.id not in orchestrator.jobs
    assert not storage.job_dir(old_job.id, user_id=old_job.user_id).exists()

    # Fresh job should remain intact
    assert fresh_job.id in orchestrator.jobs
    assert storage.job_dir(fresh_job.id, user_id=fresh_job.user_id).exists()


def test_retention_protects_in_progress_jobs(temp_retention_env):
    manager: StorageRetentionManager = temp_retention_env["manager"]
    orchestrator: JobOrchestrator = temp_retention_env["orchestrator"]
    storage: JobStorage = temp_retention_env["storage"]

    # Create a job created 5 hours ago but still in CLEANING status
    active_job = orchestrator.create_job("long_cleaning.csv", file_size=500)
    active_job.created_at = datetime.now(timezone.utc) - timedelta(hours=5)
    active_job.status = JobStatus.CLEANING
    storage.raw_file_path(active_job.id, "long_cleaning.csv").write_text("data")
    old_timestamp = time.time() - (5 * 3600)
    os.utime(storage.job_dir(active_job.id), (old_timestamp, old_timestamp))

    # Run retention sweep
    result = manager.purge_expired_data(orchestrator=orchestrator)

    # In-progress job MUST NOT be purged
    assert active_job.id in orchestrator.jobs
    assert storage.job_dir(active_job.id).exists()


def test_retention_sweeps_all_categories_and_protects_static(temp_retention_env):
    manager: StorageRetentionManager = temp_retention_env["manager"]
    data_dir: Path = temp_retention_env["data_dir"]

    # 1. Create expired convert job directory
    old_conv = data_dir / "convert_jobs" / "conv_old"
    old_conv.mkdir()
    (old_conv / "out.parquet").write_bytes(b"parquet data")
    old_timestamp = time.time() - (2 * 3600)
    os.utime(old_conv, (old_timestamp, old_timestamp))

    # 2. Create expired query job directory
    old_query = data_dir / "query_jobs" / "query_old"
    old_query.mkdir()
    (old_query / "sandbox.parquet").write_bytes(b"query data")
    os.utime(old_query, (old_timestamp, old_timestamp))

    # 3. Create expired modeling session directory
    old_model = data_dir / "modeling" / "model_old"
    old_model.mkdir()
    (old_model / "tables").mkdir()
    (old_model / "tables" / "users.parquet").write_bytes(b"model table")
    os.utime(old_model, (old_timestamp, old_timestamp))

    # 4. Create protected static files
    demo_file = data_dir / "demo" / "sample.csv"
    demo_file.write_text("demo content")
    os.utime(data_dir / "demo", (old_timestamp, old_timestamp))

    eval_file = data_dir / "evaluation" / "eval.csv"
    eval_file.write_text("eval content")
    os.utime(data_dir / "evaluation", (old_timestamp, old_timestamp))

    convert_jobs_map = {
        "conv_old": {"id": "conv_old", "work_dir": old_conv},
        "query_old": {"id": "query_old", "work_dir": old_query},
    }

    # Run sweep
    result = manager.purge_expired_data(convert_jobs=convert_jobs_map)

    assert result.convert_jobs_purged == 1
    assert result.query_jobs_purged == 1
    assert result.modeling_sessions_purged == 1
    assert not old_conv.exists()
    assert not old_query.exists()
    assert not old_model.exists()
    assert "conv_old" not in convert_jobs_map
    assert "query_old" not in convert_jobs_map

    # Strictly verify protected directories were untouched
    assert demo_file.exists()
    assert eval_file.exists()


def test_api_maintenance_endpoints():
    client = TestClient(app)

    # 1. Test storage inventory status endpoint
    res_storage = client.get("/api/maintenance/storage")
    assert res_storage.status_code == 200
    data = res_storage.json()
    assert "jobs" in data
    assert "convert_jobs" in data
    assert "disk" in data
    assert "retention_policy" in data
    assert data["retention_policy"]["ttl_hours"] >= 1

    # 2. Test manual cleanup trigger endpoint
    res_cleanup = client.post("/api/maintenance/cleanup", params={"max_age_hours": 0.0001})
    assert res_cleanup.status_code == 200
    cleanup_data = res_cleanup.json()
    assert "total_purged" in cleanup_data
    assert "bytes_freed" in cleanup_data
    assert "elapsed_seconds" in cleanup_data
