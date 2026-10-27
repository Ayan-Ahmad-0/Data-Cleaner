"""FastAPI router providing REST endpoints for cloud storage and database connectors."""

from __future__ import annotations
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from app.orchestrator import get_orchestrator
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


class ImportDatasetRequest(BaseModel):
    """Payload to import a dataset from a cloud storage or database connector into a new cleaning job."""
    connector_type: str = Field(..., description="Connector ID, e.g. 's3' or 'postgres'")
    config: Dict[str, Any] = Field(..., description="Connector-specific configuration parameters")
    filename: Optional[str] = Field(None, description="Optional custom dataset name for the job")
    privacy_mode: bool = Field(False, description="Whether to mask sensitive PII during AI profiling")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional import options")


class ImportDatasetResponse(BaseModel):
    """Response returned upon successfully importing a dataset from an external connector."""
    job_id: str
    filename: str
    status: str
    rows_imported: int
    sync_result: SyncResult



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

    temp_masked_pq: Optional[Path] = None
    export_source = source_path

    try:
        # Enforce GDPR/HIPAA PII masking on outbound destination export if requested
        if payload.options and (payload.options.get("mask_pii") or payload.options.get("enforce_privacy")):
            from core.privacy.detector import PiiDetector
            from core.recipe_schema import Recipe, ColumnRule, MaskPiiConfig
            from core.compiler import RecipeCompiler

            detected_pii = PiiDetector.scan_dataset(source_path)
            if detected_pii:
                temp_masked_pq = source_path.parent / f".export_masked_{uuid.uuid4().hex[:8]}.parquet"
                mask_rules = {
                    res.column_name: ColumnRule(
                        mask_pii=MaskPiiConfig(strategy=res.suggested_strategy, entity_type=res.entity_type)
                    )
                    for res in detected_pii
                }
                RecipeCompiler().execute_clean(Recipe(columns=mask_rules), source_path, temp_masked_pq)
                export_source = temp_masked_pq

        result = connector.export_dataset(
            source_parquet_path=export_source,
            config=payload.config,
            options=payload.options,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Export to %s failed for job %s: %s", payload.connector_type, job_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to export dataset: {str(e)}")
    finally:
        if temp_masked_pq and temp_masked_pq.exists():
            try:
                temp_masked_pq.unlink(missing_ok=True)
            except Exception:
                pass


@router.post("/import", response_model=ImportDatasetResponse)
def import_dataset_from_connector(
    payload: ImportDatasetRequest,
    background_tasks: BackgroundTasks,
) -> ImportDatasetResponse:
    """Import a dataset from a cloud storage or database connector directly into a new cleaning job."""
    connector = ConnectorRegistry.get(payload.connector_type)
    if not connector:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown connector type '{payload.connector_type}'. Available: {[c.id for c in ConnectorRegistry.list_all()]}",
        )

    # Determine a descriptive dataset filename
    if payload.filename:
        ds_name = payload.filename.strip()
    elif payload.config.get("filename"):
        ds_name = str(payload.config["filename"]).strip()
    elif payload.config.get("table_name"):
        ds_name = f"{payload.config['table_name']}.parquet"
    elif payload.config.get("key"):
        ds_name = Path(payload.config["key"]).name
    elif payload.config.get("source_uri"):
        ds_name = Path(payload.config["source_uri"]).name
    else:
        ds_name = f"imported_{payload.connector_type}_dataset.parquet"

    if not ds_name.lower().endswith(".parquet"):
        stem = Path(ds_name).stem
        ds_name = f"{stem}.parquet"

    orch = get_orchestrator()
    job = orch.create_job(
        filename=ds_name,
        file_size=0,
        privacy_mode=payload.privacy_mode,
        format_id="parquet",
    )
    target_staged_pq = orch.storage.staged_parquet_path(job.id)

    try:
        sync_result = connector.import_dataset(
            config=payload.config,
            target_parquet_path=target_staged_pq,
            options=payload.options,
        )
        if target_staged_pq.exists():
            job.file_size_bytes = target_staged_pq.stat().st_size
        job.row_count = sync_result.rows_transferred

        # Queue background profiling and AI recipe draft
        background_tasks.add_task(orch.run_profile_and_ai_draft, job.id)

        return ImportDatasetResponse(
            job_id=job.id,
            filename=ds_name,
            status=job.status.value,
            rows_imported=sync_result.rows_transferred,
            sync_result=sync_result,
        )
    except ValueError as e:
        orch.storage.cleanup_job(job.id)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        orch.storage.cleanup_job(job.id)
        logger.exception("Connector import failed for %s: %s", payload.connector_type, e)
        raise HTTPException(status_code=500, detail=f"Failed to import dataset: {str(e)}")

