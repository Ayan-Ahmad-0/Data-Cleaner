"""Local disk storage adapter for job data files and intermediate artifacts."""

from __future__ import annotations
import shutil
from pathlib import Path
from typing import Optional


class JobStorage:
    """Manages workspace storage directories for each job."""

    def __init__(self, base_dir: str = "data/jobs") -> None:
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def job_dir(self, job_id: str) -> Path:
        d = self.base_dir / job_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def raw_file_path(self, job_id: str, filename: str) -> Path:
        p = self.job_dir(job_id) / "raw"
        p.mkdir(parents=True, exist_ok=True)
        return p / filename

    def raw_csv_path(self, job_id: str, filename: str = "input.csv") -> Path:
        return self.raw_file_path(job_id, filename)

    def staged_parquet_path(self, job_id: str) -> Path:
        p = self.job_dir(job_id) / "parquet"
        p.mkdir(parents=True, exist_ok=True)
        return p / "staged.parquet"

    def clean_parquet_path(self, job_id: str) -> Path:
        p = self.job_dir(job_id) / "clean"
        p.mkdir(parents=True, exist_ok=True)
        return p / "cleaned.parquet"

    def clean_csv_path(self, job_id: str) -> Path:
        p = self.job_dir(job_id) / "clean"
        p.mkdir(parents=True, exist_ok=True)
        return p / "cleaned.csv"

    def clean_export_path(self, job_id: str, filename: str) -> Path:
        p = self.job_dir(job_id) / "exports"
        p.mkdir(parents=True, exist_ok=True)
        return p / filename

    def verification_json_path(self, job_id: str) -> Path:
        p = self.job_dir(job_id) / "reports"
        p.mkdir(parents=True, exist_ok=True)
        return p / "verification.json"

    def cleanup_job(self, job_id: str) -> None:
        d = self.base_dir / job_id
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
