"""FastAPI application providing REST endpoints for the AI Data Cleaner."""

from __future__ import annotations
import shutil
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.models import JobDetailResponse, JobMetadata
from app.orchestrator import JobOrchestrator
from app.storage import JobStorage

app = FastAPI(
    title="One-Click AI Data Cleaner API",
    description="DuckDB-powered profile-guided AI data cleaning pipeline",
    version="1.0.0",
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    """Preview or test conversion of an input dataset returning preview rows and ConversionReport."""
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


# Mount built frontend assets if present
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

