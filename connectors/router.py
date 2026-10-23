"""FastAPI router providing REST endpoints for cloud storage and database connectors."""

from __future__ import annotations
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.storage import JobStorage
from connectors.base import ConnectionTestResult, ConnectorMetadata, SyncResult
from connectors.registry import ConnectorRegistry
from explore.service import resolve_job_parquet_paths

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/connectors", tags=["Connectors"])


class TestConnectorRequest(BaseModel):
    """Payload to test connector credentials and connectivity."""
    connector_type: str = Field(..., description="Connector ID, e.g. 's3' or 'postgres'")
    config: Dict[str, Any] = Field(..., description="Connector-specific configuration parameters")


class ExportDatasetRequest(BaseModel):
    """Payload to export a job's cleaned dataset to a cloud or database destination."""
    connector_type: str = Field(..., description="Connector ID, e.g. 's3' or 'postgres'")
    config: Dict[str, Any] = Field(..., description="Connector-specific configuration parameters")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional export options")


@router.get("", response_model=List[ConnectorMetadata])
def list_available_connectors() -> List[ConnectorMetadata]:
    """List all available cloud storage and database connectors."""
    return ConnectorRegistry.list_all()


@router.post("/test", response_model=ConnectionTestResult)
def test_connector_connection(payload: TestConnectorRequest) -> ConnectionTestResult:
    """Validate credentials and test reachability for a target connector."""
    connector = ConnectorRegistry.get(payload.connector_type)
    if not connector:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown connector type '{payload.connector_type}'. Available: {[c.id for c in ConnectorRegistry.list_all()]}",
        )

    try:
        return connector.test_connection(payload.config)
    except Exception as e:
        logger.exception("Connector test failed: %s", e)
        return ConnectionTestResult(
            success=False,
            message=f"Connection test failed: {str(e)}",
        )


@router.post("/export/{job_id}", response_model=SyncResult)
def export_dataset_to_destination(
    job_id: str,
    payload: ExportDatasetRequest,
) -> SyncResult:
    """Export a job's Parquet dataset (cleaned or staged) directly to an external destination."""
    connector = ConnectorRegistry.get(payload.connector_type)
    if not connector:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown connector type '{payload.connector_type}'.",
        )

    storage = JobStorage()
    try:
        clean_pq, staged_pq = resolve_job_parquet_paths(job_id=job_id, storage=storage)
        source_path = clean_pq if clean_pq and clean_pq.exists() else staged_pq
        if not source_path or not source_path.exists():
            raise HTTPException(status_code=404, detail=f"No dataset found for job '{job_id}'.")
    except Exception as e:
        logger.warning("Could not resolve dataset for job %s: %s", job_id, e)
        raise HTTPException(status_code=404, detail=f"Dataset for job '{job_id}' not found or expired.")

    try:
        result = connector.export_dataset(
            source_parquet_path=source_path,
            config=payload.config,
            options=payload.options,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Export to %s failed for job %s: %s", payload.connector_type, job_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to export dataset: {str(e)}")
