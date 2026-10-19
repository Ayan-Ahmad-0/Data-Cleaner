"""Integration tests for multi-format API endpoints, format detection, preview, and exports."""

import io
from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from app.main import app

client = TestClient(app)
FIXTURES_DIR = Path(__file__).parent / "formats" / "fixtures"


def test_detect_format_endpoint():
    ndjson_path = FIXTURES_DIR / "sample.ndjson"
    with open(ndjson_path, "rb") as f:
        res = client.post("/api/formats/detect", files={"file": ("sample.ndjson", f, "application/x-ndjson")})
    assert res.status_code == 200
    data = res.json()
    assert data["format"] in ("json", "ndjson")
    assert data["confidence"] >= 0.80


def test_convert_preview_endpoint():
    csv_content = "id,name,val\n1,Alpha,100\n2,Beta,200\n"
    res = client.post(
        "/api/convert",
        files={"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["preview"]) == 2
    assert data["report"]["rows"] == 2
    assert "name" in data["preview"][0]


def test_end_to_end_ndjson_pipeline_and_multi_export():
    # 1. Upload NDJSON
    ndjson_content = (
        '{"id": "1", "name": "Alice", "city": "NY"}\n'
        '{"id": "2", "name": "Bob", "city": "SF"}\n'
        '{"id": "2", "name": "Bob", "city": "SF"}\n'
    )
    res = client.post(
        "/api/jobs/upload",
        files={"file": ("users.ndjson", io.BytesIO(ndjson_content.encode()), "application/x-ndjson")},
        data={"privacy_mode": "false"},
    )
    assert res.status_code == 200
    job_id = res.json()["id"]

    # 2. Check detail & conversion report
    detail = client.get(f"/api/jobs/{job_id}").json()
    assert detail["job"]["status"] == "AWAITING_APPROVAL"
    assert detail["job"]["detected_format"] in ("json", "ndjson")
    assert detail["conversion_report"]["rows"] == 3

    # 3. Approve cleaning
    clean_res = client.post(f"/api/jobs/{job_id}/clean")
    assert clean_res.status_code == 200

    # 4. Check status & export options
    done_detail = client.get(f"/api/jobs/{job_id}").json()
    assert done_detail["job"]["status"] in ("DONE", "DONE_WITH_WARNINGS")

    export_opts_res = client.get(f"/api/jobs/{job_id}/export-options")
    assert export_opts_res.status_code == 200
    export_opts = export_opts_res.json()
    format_ids = [opt["format_id"] for opt in export_opts]
    assert "csv" in format_ids
    assert "parquet" in format_ids
    assert "ndjson" in format_ids
    assert "json" in format_ids

    # 5. Download in various formats
    # Parquet
    pq_res = client.get(f"/api/jobs/{job_id}/download/parquet")
    assert pq_res.status_code == 200
    assert pq_res.content.startswith(b"PAR1")

    # NDJSON
    ndjson_res = client.get(f"/api/jobs/{job_id}/download/ndjson")
    assert ndjson_res.status_code == 200
    assert "Alice" in ndjson_res.text

    # JSON Array
    json_res = client.get(f"/api/jobs/{job_id}/download/json")
    assert json_res.status_code == 200
    assert json_res.text.strip().startswith("[")
    assert "Alice" in json_res.text

    # TSV
    tsv_res = client.get(f"/api/jobs/{job_id}/download/tsv")
    assert tsv_res.status_code == 200
    assert "\t" in tsv_res.text

    # CSV
    csv_res = client.get(f"/api/jobs/{job_id}/download/csv")
    assert csv_res.status_code == 200
    assert "Alice" in csv_res.text


def test_convert_only_api_workflow_and_handoff():
    ndjson_content = '{"id": 1, "product": "Widget", "price": 29.99}\n{"id": 2, "product": "Gadget", "price": 49.99}\n'
    
    # 1. Execute convert-only NDJSON -> CSV
    res = client.post(
        "/api/convert/execute",
        files={"file": ("items.ndjson", io.BytesIO(ndjson_content.encode()), "application/x-ndjson")},
        data={"target_format": "csv"},
    )
    assert res.status_code == 200
    data = res.json()
    convert_id = data["convert_id"]
    result = data["result"]
    assert result["rows"] == 2
    assert result["target_format"] == "csv"

    # 2. Download converted CSV
    dl_res = client.get(f"/api/convert/download/{convert_id}")
    assert dl_res.status_code == 200
    assert "Widget" in dl_res.text
    assert "price" in dl_res.text

    # 3. Handoff to cleaning ("Clean this file too")
    handoff_res = client.post(f"/api/convert/{convert_id}/handoff-to-clean")
    assert handoff_res.status_code == 200
    clean_job = handoff_res.json()
    assert clean_job["status"] == "UPLOADED"
    assert clean_job["filename"] == "items.ndjson"

