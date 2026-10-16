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


@app.post("/api/jobs/upload", response_model=JobMetadata)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    privacy_mode: bool = Form(False),
):
    """Upload a raw CSV dataset and schedule conversion, profiling, and AI drafting."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    # Create job
    job = orchestrator.create_job(
        filename=file.filename,
        file_size=0,
        privacy_mode=privacy_mode,
    )

    # Save to storage
    dest_path = storage.raw_csv_path(job.id, file.filename)
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
    """Download cleaned Parquet, cleaned CSV, or verification report."""
    job = orchestrator.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if format == "parquet":
        file_path = storage.clean_parquet_path(job_id)
        media_type = "application/octet-stream"
        filename = f"cleaned_{job.filename.replace('.csv', '')}.parquet"
    elif format == "csv":
        file_path = storage.clean_csv_path(job_id)
        media_type = "text/csv"
        filename = f"cleaned_{job.filename}"
    elif format == "report":
        file_path = storage.verification_json_path(job_id)
        media_type = "application/json"
        filename = f"verification_{job.id}.json"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'parquet', 'csv', or 'report'.")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Artifact not ready or not found.")

    return FileResponse(path=file_path, media_type=media_type, filename=filename)
