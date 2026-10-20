"""FastAPI application providing REST endpoints for the AI Data Cleaner."""

from __future__ import annotations
import json
import logging
import shutil
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.models import JobDetailResponse, JobMetadata
from app.orchestrator import JobOrchestrator
from app.storage import JobStorage

logger = logging.getLogger(__name__)

app = FastAPI(
    title="One-Click AI Data Cleaner API",
    description="DuckDB-powered profile-guided AI data cleaning pipeline",
    version="1.0.0",
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = JobStorage()
orchestrator = JobOrchestrator(storage=storage)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "engine": "DuckDB", "service": "data-cleaner-api"}


@app.post("/api/formats/detect")
async def detect_uploaded_format(file: UploadFile = File(...)):
    """Sniff and detect the format of an uploaded file without saving permanently."""
    import tempfile
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        from formats import detect_format, AdapterRegistry
        format_id, confidence = detect_format(tmp_path)
        adapter = AdapterRegistry.get(format_id) or AdapterRegistry.find_by_extension(suffix)
        
        extra_info: Dict[str, Any] = {}
        if adapter:
            if hasattr(adapter, "list_sheets"):
                extra_info["sheets"] = adapter.list_sheets(tmp_path)
            if hasattr(adapter, "list_tables"):
                extra_info["tables"] = adapter.list_tables(tmp_path)
        
        return {
            "format": format_id,
            "confidence": confidence,
            "filename": file.filename,
            **extra_info,
        }
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


@app.post("/api/convert")
async def preview_and_convert(
    file: UploadFile = File(...),
    format: Optional[str] = Form(None),
    options: Optional[str] = Form(None),
):
    """Preview an input dataset returning preview rows and ConversionReport."""
    import tempfile
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        from formats import AdapterRegistry, detect_format
        parsed_options = json.loads(options) if options else {}
        fmt = format
        if not fmt or fmt == "auto":
            fmt, _ = detect_format(tmp_path)

        adapter = AdapterRegistry.get(fmt) or AdapterRegistry.find_by_extension(suffix)
        if not adapter:
            raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'.")

        preview_rows, report = adapter.preview(tmp_path, options=parsed_options, limit=100)
        return {
            "preview": preview_rows,
            "report": report.to_dict(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


# Active convert-only jobs registry for downloads & handoff
convert_jobs: Dict[str, Any] = {}


@app.post("/api/convert/execute")
async def execute_convert_only(
    file: UploadFile = File(...),
    target_format: str = Form(...),
    source_format: Optional[str] = Form(None),
    source_options: Optional[str] = Form(None),
    target_options: Optional[str] = Form(None),
):
    """Execute Convert-Only mode: direct conversion between formats without profiling or cleaning."""
    import uuid
    import tempfile
    from formats import convert_file

    convert_id = f"conv_{uuid.uuid4().hex[:8]}"
    work_dir = Path("data/convert_jobs").resolve() / convert_id
    work_dir.mkdir(parents=True, exist_ok=True)

    input_file_path = work_dir / file.filename
    with open(input_file_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    parsed_src_opts = json.loads(source_options) if source_options else None
    parsed_tgt_opts = json.loads(target_options) if target_options else None

    try:
        result = convert_file(
            input_path=input_file_path,
            target_format=target_format,
            work_dir=work_dir,
            source_format=source_format if source_format and source_format != "auto" else None,
            source_options=parsed_src_opts,
            target_options=parsed_tgt_opts,
            keep_intermediate=True,  # keep for potential handoff to cleaning
        )

        convert_jobs[convert_id] = {
            "id": convert_id,
            "result": result,
            "filename": file.filename,
            "work_dir": work_dir,
            "intermediate_parquet": result.intermediate_parquet,
        }

        return {
            "convert_id": convert_id,
            "result": result.to_dict(),
        }
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.exception("Convert-only execution failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/convert/download/{convert_id}")
def download_converted_file(convert_id: str):
    """Download converted output file(s). Zips if multiple parts were generated."""
    job = convert_jobs.get(convert_id)
    if not job:
        raise HTTPException(status_code=404, detail="Convert job not found or expired.")

    result: ConvertResult = job["result"]
    output_files = result.output_files

    if not output_files:
        raise HTTPException(status_code=404, detail="No output files available.")

    from formats import ExporterRegistry
    if len(output_files) == 1:
        fpath = output_files[0]
        exporter = ExporterRegistry.get(result.target_format)
        media_type = exporter.mime_type if exporter else "application/octet-stream"
        return FileResponse(path=fpath, media_type=media_type, filename=fpath.name)
    else:
        # Multi-file output (e.g. split Excel) -> return ZIP
        import zipfile
        zip_path = job["work_dir"] / f"converted_{Path(job['filename']).stem}_{result.target_format}_parts.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in output_files:
                zf.write(p, arcname=p.name)
        return FileResponse(path=zip_path, media_type="application/zip", filename=zip_path.name)


@app.post("/api/convert/{convert_id}/handoff-to-clean")
def handoff_to_cleaning(convert_id: str, background_tasks: BackgroundTasks):
    """Handoff converted intermediate Parquet directly to the cleaning pipeline without re-converting."""
    job = convert_jobs.get(convert_id)
    if not job:
        raise HTTPException(status_code=404, detail="Convert job not found or expired.")

    intermediate_pq = job.get("intermediate_parquet")
    if not intermediate_pq or not Path(intermediate_pq).exists():
        raise HTTPException(status_code=400, detail="Intermediate Parquet not available for handoff.")

    # Create cleaning job
    clean_job = orchestrator.create_job(
        filename=job["filename"],
        file_size=Path(intermediate_pq).stat().st_size,
        format_id="parquet",
    )

    # Copy intermediate Parquet into orchestrator staged_parquet_path
    target_staged_pq = storage.staged_parquet_path(clean_job.id)
    shutil.copy2(intermediate_pq, target_staged_pq)

    # Launch background profiling & AI drafting on staged parquet
    background_tasks.add_task(orchestrator.run_profile_and_ai_draft, clean_job.id)

    return clean_job


@app.post("/api/jobs/upload", response_model=JobMetadata)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    privacy_mode: bool = Form(False),
    format: Optional[str] = Form(None),
    options: Optional[str] = Form(None),
):
    """Upload a dataset (CSV, TSV, Parquet, JSON, NDJSON, Excel, SQLite) and schedule pipeline."""
    from formats import AdapterRegistry, detect_format
    ext = Path(file.filename).suffix.lower()
    
    # Check if supported
    supported_adapter = (
        (format and AdapterRegistry.get(format))
        or AdapterRegistry.find_by_extension(ext)
    )
    if not supported_adapter and ext not in (".csv", ".tsv", ".parquet", ".json", ".ndjson", ".jsonl", ".xlsx", ".db", ".sqlite"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported formats: CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), SQLite (.db).",
        )

    parsed_options = None
    if options:
        try:
            parsed_options = json.loads(options)
        except Exception:
            pass

    # Create job
    job = orchestrator.create_job(
        filename=file.filename,
        file_size=0,
        privacy_mode=privacy_mode,
        format_id=format,
        adapter_options=parsed_options,
    )

    # Save to storage
    dest_path = storage.raw_file_path(job.id, file.filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    job.file_size_bytes = dest_path.stat().st_size

    # Launch background conversion and AI drafting
    background_tasks.add_task(orchestrator.run_profile_and_ai_draft, job.id)

    return job


@app.get("/api/jobs/{job_id}", response_model=JobDetailResponse)
def get_job_status(job_id: str):
    """Fetch current progress, profile, AI report, or verification results."""
    detail = orchestrator.get_job_detail(job_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Job not found")
    return detail


@app.get("/api/jobs/{job_id}/export-options")
def get_job_export_options(job_id: str):
    """Get all export formats available for this job."""
    job = orchestrator.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from formats import list_export_options
    return list_export_options(job.detected_format or "csv", job.row_count)


@app.put("/api/jobs/{job_id}/recipe")
def update_recipe(job_id: str, recipe: Dict[str, Any]):
    """Update recipe choices or confirmation responses."""
    job = orchestrator.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    orchestrator.job_recipes[job_id] = recipe
    return {"status": "updated", "job_id": job_id}


@app.post("/api/jobs/{job_id}/clean")
def approve_and_clean(
    job_id: str,
    background_tasks: BackgroundTasks,
    recipe: Optional[Dict[str, Any]] = None,
):
    """Approve recipe and start DuckDB CTE cleaning and verification."""
    job = orchestrator.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    background_tasks.add_task(orchestrator.execute_cleaning_and_verification, job_id, recipe)
    return {"status": "started", "job_id": job_id}


@app.get("/api/jobs/{job_id}/download/{format}")
def download_artifact(job_id: str, format: str):
    """Download cleaned dataset in any supported format (CSV, Parquet, TSV, NDJSON, JSON, XLSX) or verification report."""
    job = orchestrator.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    format_lower = format.lower()

    if format_lower == "report":
        file_path = storage.verification_json_path(job_id)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Verification report not yet generated.")
        return FileResponse(path=file_path, media_type="application/json", filename=f"verification_{job.id}.json")

    from formats import ExporterRegistry
    if not ExporterRegistry.get(format_lower):
        raise HTTPException(status_code=400, detail=f"Invalid format '{format}'. Supported: csv, tsv, parquet, ndjson, json, xlsx, report.")

    try:
        created_paths = orchestrator.export_dataset(job_id, format_lower)
        if not created_paths:
            raise HTTPException(status_code=500, detail="Export failed to generate files.")

        if len(created_paths) == 1:
            file_path = created_paths[0]
            exporter = ExporterRegistry.get(format_lower)
            media_type = exporter.mime_type if exporter else "application/octet-stream"
            base_name = Path(job.filename).stem
            filename = f"cleaned_{base_name}{exporter.extension if exporter else ''}"
            return FileResponse(path=file_path, media_type=media_type, filename=filename)
        else:
            # Multi-part split files (e.g. large Excel) -> package in zip
            import zipfile
            zip_path = storage.job_dir(job_id) / f"cleaned_{Path(job.filename).stem}_{format_lower}_parts.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for p in created_paths:
                    zf.write(p, arcname=p.name)
            return FileResponse(
                path=zip_path,
                media_type="application/zip",
                filename=zip_path.name,
            )
    except Exception as e:
        logger.exception("Export failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Export error: {e}")


# =========================================================================
# Explore Data (Read-Only Sandboxed SQL Query Box) Endpoints
# =========================================================================

from pydantic import BaseModel, Field
from explore import (
    DataNotFoundError,
    ExploreError,
    QueryNotAllowedError,
    QuerySyntaxError,
    QueryTimeoutError,
    QueryTooLargeError,
    ServerBusyError,
    export_query,
    get_schema,
    run_query,
)


class ExploreQueryRequest(BaseModel):
    sql: str = Field(..., description="Read-only SELECT query")
    row_limit: Optional[int] = Field(None, description="Maximum number of rows to return (capped at 10,000)")


class ExploreExportRequest(BaseModel):
    sql: str = Field(..., description="Query to export to CSV")


@app.get("/api/explore/{job_id}/schema")
def get_explore_schema(job_id: str):
    """Retrieve schema, column types, row counts, and sample values for the dataset."""
    try:
        schema = get_schema(job_id=job_id, storage=storage)
        return {
            "table": schema.table,
            "row_count": schema.row_count,
            "columns": [{"name": c.name, "type": c.type, "sample_values": c.sample_values} for c in schema.columns],
            "tables_available": schema.tables_available,
        }
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (QueryNotAllowedError, QuerySyntaxError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to get explore schema for job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail="Failed to retrieve dataset schema.")


@app.post("/api/explore/{job_id}/query")
def execute_explore_query(job_id: str, payload: ExploreQueryRequest):
    """Execute a validated, read-only SQL query on the job's Parquet dataset."""
    try:
        result = run_query(
            job_id=job_id,
            sql=payload.sql,
            row_limit=payload.row_limit,
            storage=storage,
        )
        return {
            "columns": [{"name": c.name, "type": c.type} for c in result.columns],
            "rows": result.rows,
            "row_count_returned": result.row_count_returned,
            "truncated": result.truncated,
            "elapsed_seconds": result.elapsed_seconds,
            "warnings": result.warnings,
        }
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (QueryNotAllowedError, QuerySyntaxError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except QueryTimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except ServerBusyError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except QueryTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        logger.exception("Explore query failed for job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/explore/{job_id}/export")
def export_explore_query(job_id: str, payload: ExploreExportRequest):
    """Export the full result of a SQL query to a downloadable CSV file."""
    try:
        csv_path = export_query(job_id=job_id, sql=payload.sql, storage=storage)
        return FileResponse(
            path=csv_path,
            media_type="text/csv",
            filename=f"query_result_{job_id[:8]}.csv",
        )
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (QueryNotAllowedError, QuerySyntaxError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except QueryTimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except ServerBusyError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except QueryTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        logger.exception("Explore export failed for job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail=str(e))


# Mount built frontend assets if present
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

