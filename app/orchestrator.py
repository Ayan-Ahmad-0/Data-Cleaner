"""Job state machine and pipeline execution orchestrator."""

from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import duckdb

from app.models import JobDetailResponse, JobMetadata, JobStatus
from app.storage import JobStorage
from core.ai.gemini_client import get_gemini_callable
from core.ai.generator import AIRecipeGenerator, AIReportResult
from core.compiler import RecipeCompiler
from core.converter import Converter
from core.profiler import Profiler
from core.recipe_schema import Recipe
from core.validator import RecipeValidator
from core.verifier import Verifier
from formats import (
    convert_to_parquet,
    detect_format,
    export_cleaned,
    list_export_options,
)

logger = logging.getLogger(__name__)


class JobOrchestrator:
    """Manages job state transitions and pipeline execution."""

    def __init__(self, storage: Optional[JobStorage] = None) -> None:
        self.storage = storage or JobStorage()
        self.jobs: Dict[str, JobMetadata] = {}
        self.job_profiles: Dict[str, Dict[str, Any]] = {}
        self.job_reports: Dict[str, str] = {}
        self.job_recipes: Dict[str, Recipe] = {}
        self.job_plain_english: Dict[str, list[str]] = {}
        self.job_questions: Dict[str, list[str]] = {}
        self.job_verifications: Dict[str, Dict[str, Any]] = {}
        self.job_adapter_options: Dict[str, Dict[str, Any]] = {}
        self.job_conversion_reports: Dict[str, Dict[str, Any]] = {}

        self.converter = Converter()
        self.profiler = Profiler()
        self.compiler = RecipeCompiler()
        self.verifier = Verifier()

    def create_job(
        self,
        filename: str,
        file_size: int,
        privacy_mode: bool = False,
        format_id: Optional[str] = None,
        adapter_options: Optional[Dict[str, Any]] = None,
    ) -> JobMetadata:
        import uuid
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        job = JobMetadata(
            id=job_id,
            filename=filename,
            file_size_bytes=file_size,
            privacy_mode=privacy_mode,
            detected_format=format_id,
            status=JobStatus.UPLOADED,
            progress_pct=10.0,
            current_stage="File Uploaded",
        )
        self.jobs[job_id] = job
        if adapter_options:
            self.job_adapter_options[job_id] = adapter_options
        return job

    def run_profile_and_ai_draft(self, job_id: str) -> None:
        """Stage 1: Convert raw dataset to canonical Parquet, single-pass profile, and generate AI recipe."""
        job = self.jobs.get(job_id)
        if not job:
            return

        try:
            # 1. Convert to text Parquet staging
            job.status = JobStatus.CONVERTING
            job.current_stage = "Converting input dataset to canonical Parquet staging"
            job.progress_pct = 25.0

            raw_file = self.storage.raw_file_path(job_id, job.filename)
            staged_pq = self.storage.staged_parquet_path(job_id)

            # Auto-detect format if not explicitly specified
            if not job.detected_format:
                det_fmt, confidence = detect_format(raw_file)
                job.detected_format = det_fmt
                job.detected_confidence = confidence

            # Convert to canonical Parquet
            conv_res = convert_to_parquet(
                raw_file,
                staged_pq,
                format_id=job.detected_format if job.detected_format != "unknown" else None,
                options=self.job_adapter_options.get(job_id),
            )
            job.row_count = conv_res.rows
            job.conversion_report = conv_res.to_dict()
            self.job_conversion_reports[job_id] = conv_res.to_dict()

            # 2. Single-pass Profiling
            job.status = JobStatus.PROFILING
            job.current_stage = "Computing statistical profile and data anomalies"
            job.progress_pct = 50.0

            profile = self.profiler.profile_parquet(staged_pq, source_csv_path=raw_file)
            p_dict = profile.to_dict()
            self.job_profiles[job_id] = p_dict

            # 3. AI Recipe & Report Generation (Gemini with safe fallback)
            job.status = JobStatus.DRAFTING_RECIPE
            job.current_stage = "Drafting plain-English quality report and cleaning recipe with AI"
            job.progress_pct = 75.0

            gemini_fn = get_gemini_callable()
            ai_gen = AIRecipeGenerator(llm_client=gemini_fn, privacy_mode=job.privacy_mode)
            ai_res = ai_gen.generate_report_and_recipe(p_dict)

            self.job_reports[job_id] = ai_res.report_markdown
            self.job_recipes[job_id] = ai_res.recipe
            self.job_plain_english[job_id] = ai_res.recipe_plain_english
            self.job_questions[job_id] = ai_res.open_questions

            # Ready for human review
            job.status = JobStatus.AWAITING_APPROVAL
            job.current_stage = "Awaiting user approval of cleaning plan"
            job.progress_pct = 100.0

        except Exception as e:
            logger.exception("Error during profile and AI drafting: %s", e)
            job.status = JobStatus.FAILED
            job.error = str(e)

    def execute_cleaning_and_verification(self, job_id: str, approved_recipe_dict: Optional[Dict[str, Any]] = None) -> None:
        """Stage 2: Execute compiled cleaning SQL and verify output."""
        job = self.jobs.get(job_id)
        if not job:
            return

        try:
            # 1. Update recipe if edited by user
            if approved_recipe_dict:
                profile_dict = self.job_profiles.get(job_id)
                recipe = RecipeValidator.validate_recipe(approved_recipe_dict, profile_dict)
                self.job_recipes[job_id] = recipe
                self.job_plain_english[job_id] = RecipeValidator.render_plain_english(recipe)
            else:
                recipe = self.job_recipes[job_id]

            # 2. Execute Cleaning
            job.status = JobStatus.CLEANING
            job.current_stage = "Executing DuckDB macro CTE compilation"
            job.progress_pct = 40.0

            staged_pq = self.storage.staged_parquet_path(job_id)
            clean_pq = self.storage.clean_parquet_path(job_id)
            clean_res = self.compiler.execute_clean(recipe, staged_pq, clean_pq)

            # Export default cleaned CSV for backwards compatibility
            clean_csv = self.storage.clean_csv_path(job_id)
            clean_pq_sql = str(clean_pq).replace("\\", "/")
            clean_csv_sql = str(clean_csv).replace("\\", "/")
            conn = duckdb.connect(":memory:")
            conn.execute(f"COPY (SELECT * FROM read_parquet('{clean_pq_sql}')) TO '{clean_csv_sql}' (HEADER, DELIMITER ',');")
            conn.close()

            # 3. Verification & Delta Comparison
            job.status = JobStatus.VERIFYING
            job.current_stage = "Running reconciliation and verification tests"
            job.progress_pct = 80.0

            before_profile = self.job_profiles[job_id]
            v_json_path = self.storage.verification_json_path(job_id)
            v_result = self.verifier.verify(clean_pq, before_profile, recipe, output_verification_json=v_json_path)

            self.job_verifications[job_id] = v_result.to_dict()

            # 4. Final state
            job.status = JobStatus.DONE if v_result.status == "PASS" else JobStatus.DONE_WITH_WARNINGS
            job.current_stage = "Completed successfully" if job.status == JobStatus.DONE else "Completed with warnings"
            job.progress_pct = 100.0
            job.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.exception("Error during cleaning and verification: %s", e)
            job.status = JobStatus.FAILED
            job.error = str(e)

    def export_dataset(self, job_id: str, format_id: str, options: Optional[Dict[str, Any]] = None) -> List[Path]:
        """Export cleaned dataset into any supported format (reusing pre-generated artifacts when available)."""
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        # Fast path 1: If CSV requested and cleaned.csv already generated in clean stage, return it immediately
        if format_id.lower() == "csv":
            clean_csv = self.storage.clean_csv_path(job_id)
            if clean_csv.exists() and clean_csv.stat().st_size > 0:
                return [clean_csv]

        clean_pq = self.storage.clean_parquet_path(job_id)
        if not clean_pq.exists():
            raise FileNotFoundError(f"Cleaned parquet not found for job {job_id}")

        export_dir = self.storage.job_dir(job_id) / "exports"

        # Fast path 2: If exported file already exists in export_dir and has size, return it
        from formats import ExporterRegistry
        exporter = ExporterRegistry.get(format_id.lower())
        if exporter:
            base_name = clean_pq.stem.replace("cleaned_", "").replace(".parquet", "")
            expected_file = export_dir / f"cleaned_{base_name}{exporter.extension}"
            if expected_file.exists() and expected_file.stat().st_size > 0:
                return [expected_file]

        return export_cleaned(clean_pq, export_dir, format_id=format_id, options=options)

    def get_job_detail(self, job_id: str) -> Optional[JobDetailResponse]:
        job = self.jobs.get(job_id)
        if not job:
            return None

        recipe_dict = self.job_recipes[job_id].model_dump() if job_id in self.job_recipes else None
        download_urls = {}
        export_opts = []

        if job.status in (JobStatus.DONE, JobStatus.DONE_WITH_WARNINGS):
            download_urls = {
                "parquet": f"/api/jobs/{job_id}/download/parquet",
                "csv": f"/api/jobs/{job_id}/download/csv",
                "tsv": f"/api/jobs/{job_id}/download/tsv",
                "ndjson": f"/api/jobs/{job_id}/download/ndjson",
                "json": f"/api/jobs/{job_id}/download/json",
                "xlsx": f"/api/jobs/{job_id}/download/xlsx",
                "report": f"/api/jobs/{job_id}/download/report",
            }
            export_opts = list_export_options(job.detected_format or "csv", job.row_count)

        return JobDetailResponse(
            job=job,
            profile=self.job_profiles.get(job_id),
            report_markdown=self.job_reports.get(job_id),
            recipe=recipe_dict,
            recipe_plain_english=self.job_plain_english.get(job_id, []),
            open_questions=self.job_questions.get(job_id, []),
            verification=self.job_verifications.get(job_id),
            conversion_report=self.job_conversion_reports.get(job_id),
            export_options=export_opts,
            download_urls=download_urls,
        )
