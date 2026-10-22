"""API endpoint tests for Chart AI and Tweak routes."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def api_client():
    return TestClient(app)


def test_chart_ai_status_endpoint(api_client):
    res = api_client.get("/api/charts/test_job_1/ai/status")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "model" in data


def test_starter_spec_endpoint(api_client, mock_charts_storage):
    storage, job_id = mock_charts_storage
    # Mount storage temporarily for app storage lookup
    import app.main
    original_storage = app.main.storage
    app.main.storage = storage
    try:
        res = api_client.get(f"/api/charts/{job_id}/starter-spec")
        assert res.status_code == 200
        data = res.json()
        assert "spec" in data
        assert data["spec"]["chart_type"] in ("bar", "hbar", "histogram", "big_number")
    finally:
        app.main.storage = original_storage


def test_tweak_options_endpoint(api_client, mock_charts_storage):
    storage, job_id = mock_charts_storage
    import app.main
    original_storage = app.main.storage
    app.main.storage = storage
    try:
        res = api_client.post(f"/api/charts/{job_id}/tweak-options", json={})
        assert res.status_code == 200
        data = res.json()
        assert "allowed_chart_types" in data
        assert "columns" in data
        assert len(data["columns"]) > 0
    finally:
        app.main.storage = original_storage
