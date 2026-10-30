"""Job state machine and pipeline execution orchestrator."""

from __future__ import annotations
import json
import logging
import os
from datetime import datetime, timedelta, timezone
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
        user_id: str = "default",
    ) -> JobMetadata:
        import uuid
        ttl_hours = float(os.getenv("STORAGE_TTL_HOURS", "24"))
        now_utc = datetime.now(timezone.utc)
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        job = JobMetadata(
            id=job_id,
            user_id=user_id,
            filename=filename,
            file_size_bytes=file_size,
            privacy_mode=privacy_mode,
            detected_format=format_id,
            status=JobStatus.UPLOADED,
            progress_pct=10.0,
            current_stage="File Uploaded",
            created_at=now_utc,
            expires_at=now_utc + timedelta(hours=ttl_hours),
            ttl_seconds_remaining=int(ttl_hours * 3600),
        )
        self.jobs[job_id] = job
        if adapter_options:
            self.job_adapter_options[job_id] = adapter_options
        return job

    def get_job(self, job_id: str, user_id: Optional[str] = None) -> Optional[JobMetadata]:
        """Fetch job metadata, strictly enforcing tenant ownership if user_id is provided."""
        job = self.jobs.get(job_id)
        if not job:
            return None
        if user_id is not None and job.user_id != user_id:
            logger.warning(
                "Tenant access violation: user '%s' attempted to access job '%s' owned by '%s'",
                user_id,
                job_id,
                job.user_id,
            )
            return None
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

            raw_file = self.storage.raw_file_path(job_id, job.filename, user_id=job.user_id)
            staged_pq = self.storage.staged_parquet_path(job_id, user_id=job.user_id)

            if not raw_file.exists() and staged_pq.exists():
                # Direct Parquet staging (e.g. from cloud/warehouse connector import or convert handoff)
                con = duckdb.connect(":memory:")
                res = con.execute("SELECT count(*) FROM read_parquet(?)", [str(staged_pq.resolve())]).fetchone()
                row_cnt = int(res[0]) if res else 0
                con.close()
                job.row_count = row_cnt
                job.detected_format = "parquet"
                conv_report = {"format": "parquet", "rows": row_cnt, "flattened": False}
                job.conversion_report = conv_report
                self.job_conversion_reports[job_id] = conv_report
            else:
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

            profile = self.profiler.profile_parquet(staged_pq, source_csv_path=raw_file if raw_file.exists() else None)
            p_dict = profile.to_dict()
            self.job_profiles[job_id] = p_dict

            # 3. Fast baseline recipe generation (< 1ms)
            from core.ai.fallback import MinimalSafeRecipeGenerator
            base_recipe, base_report, base_questions = MinimalSafeRecipeGenerator.generate(p_dict)
            self.job_recipes[job_id] = base_recipe
            self.job_reports[job_id] = base_report
            self.job_plain_english[job_id] = RecipeValidator.render_plain_english(base_recipe)
            self.job_questions[job_id] = base_questions

            # Ready for human review immediately (zero-wait approval loading)
            job.status = JobStatus.AWAITING_APPROVAL
            job.current_stage = "Awaiting user approval of cleaning plan"
            job.progress_pct = 100.0
            job.error = None

            # Asynchronous background AI enhancement (never blocks user review)
            gemini_fn = get_gemini_callable()
            if gemini_fn:
                import threading

                def _bg_enhance():
                    try:
                        ai_gen = AIRecipeGenerator(llm_client=gemini_fn, privacy_mode=job.privacy_mode)
                        ai_res = ai_gen.generate_report_and_recipe(p_dict)
                        current_job = self.jobs.get(job_id)
                        if current_job and current_job.status == JobStatus.AWAITING_APPROVAL:
                            self.job_reports[job_id] = ai_res.report_markdown
                            self.job_recipes[job_id] = ai_res.recipe
                            self.job_plain_english[job_id] = ai_res.recipe_plain_english
                            if ai_res.open_questions:
                                self.job_questions[job_id] = ai_res.open_questions
                    except Exception as ai_err:
                        logger.debug("Background AI enhancement bypassed: %s", ai_err)

                threading.Thread(target=_bg_enhance, daemon=True).start()

        except Exception as e:
            logger.exception("Error during profile and AI drafting: %s", e)
            job.status = JobStatus.FAILED
            job.current_stage = f"Profiling failed: {e}"
            job.error = str(e)

    def execute_cleaning_and_verification(self, job_id: str, approved_recipe_dict: Optional[Dict[str, Any]] = None) -> None:
        """Stage 2: Execute compiled cleaning SQL and verify output."""
        job = self.jobs.get(job_id)
        if not job:
            return

        try:
            job.error = None
            staged_pq = self.storage.staged_parquet_path(job_id)
            raw_file = self.storage.raw_file_path(job_id, job.filename)

            # 1. Update recipe if edited by user
            if approved_recipe_dict:
                profile_dict = self.job_profiles.get(job_id)
                if not profile_dict and staged_pq.exists():
                    p = self.profiler.profile_parquet(staged_pq, source_csv_path=raw_file if raw_file.exists() else None)
                    profile_dict = p.to_dict()
                    self.job_profiles[job_id] = profile_dict
                recipe = RecipeValidator.validate_recipe(approved_recipe_dict, profile_dict)
                self.job_recipes[job_id] = recipe
                self.job_plain_english[job_id] = RecipeValidator.render_plain_english(recipe)
            else:
                recipe = self.job_recipes.get(job_id)
                if not recipe:
                    profile_dict = self.job_profiles.get(job_id)
                    if not profile_dict and staged_pq.exists():
                        p = self.profiler.profile_parquet(staged_pq, source_csv_path=raw_file if raw_file.exists() else None)
                        profile_dict = p.to_dict()
                        self.job_profiles[job_id] = profile_dict
                    if profile_dict:
                        from core.ai.fallback import MinimalSafeRecipeGenerator
                        recipe, _, _ = MinimalSafeRecipeGenerator.generate(profile_dict)
                        self.job_recipes[job_id] = recipe
                        self.job_plain_english[job_id] = RecipeValidator.render_plain_english(recipe)
                    else:
                        raise ValueError(f"No profile or recipe available for job {job_id}")

            # 2. Execute Cleaning
            job.status = JobStatus.CLEANING
            job.current_stage = "Executing DuckDB macro CTE compilation"
            job.progress_pct = 40.0

            clean_pq = self.storage.clean_parquet_path(job_id)
            clean_res = self.compiler.execute_clean(recipe, staged_pq, clean_pq)

            # Export default cleaned CSV for backwards compatibility
            clean_csv = self.storage.clean_csv_path(job_id)
            clean_pq_sql = str(clean_pq).replace("\\", "/")
            clean_csv_sql = str(clean_csv).replace("\\", "/")
            import os
            conn = duckdb.connect(":memory:")
            conn.execute("SET preserve_insertion_order = false;")
            temp_dir = os.getenv("DUCKDB_TEMP_DIR", "/tmp/duckdb_temp")
            os.makedirs(temp_dir, exist_ok=True)
            conn.execute(f"SET temp_directory = '{temp_dir}';")
            mem_limit = os.getenv("DUCKDB_MEMORY_LIMIT", "600MB")
            conn.execute(f"SET memory_limit = '{mem_limit}';")
            conn.execute(f"COPY (SELECT * FROM read_parquet('{clean_pq_sql}')) TO '{clean_csv_sql}' (HEADER, DELIMITER ',');")
            conn.close()

            # 3. Verification & Delta Comparison
            job.status = JobStatus.VERIFYING
            job.current_stage = "Running reconciliation and verification tests"
            job.progress_pct = 80.0

            before_profile = self.job_profiles.get(job_id)
            if not before_profile:
                if staged_pq.exists():
                    p = self.profiler.profile_parquet(staged_pq, source_csv_path=raw_file if raw_file.exists() else None)
                    before_profile = p.to_dict()
                    self.job_profiles[job_id] = before_profile
                else:
                    raise FileNotFoundError(f"Staged parquet not found for verification of job {job_id}")

            v_json_path = self.storage.verification_json_path(job_id)
            v_result = self.verifier.verify(clean_pq, before_profile, recipe, output_verification_json=v_json_path)

            self.job_verifications[job_id] = v_result.to_dict()

            # 4. Final state
            job.status = JobStatus.DONE if v_result.status == "PASS" else JobStatus.DONE_WITH_WARNINGS
            job.current_stage = "Completed successfully" if job.status == JobStatus.DONE else "Completed with warnings"
            job.progress_pct = 100.0
            job.completed_at = datetime.now(timezone.utc)
            job.error = None

        except Exception as e:
            logger.exception("Error during cleaning and verification: %s", e)
            job.status = JobStatus.FAILED
            job.current_stage = f"Cleaning failed: {e}"
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

        # Update remaining TTL seconds
        ttl_remaining = None
        if job.expires_at:
            exp = job.expires_at if job.expires_at.tzinfo else job.expires_at.replace(tzinfo=timezone.utc)
            ttl_remaining = max(0, int((exp - datetime.now(timezone.utc)).total_seconds()))
            job.ttl_seconds_remaining = ttl_remaining

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
            expires_at=job.expires_at,
            ttl_seconds_remaining=ttl_remaining,
        )

    def evict_job(self, job_id: str) -> bool:
        """Evict a job from in-memory state and remove its directory from storage."""
        had_job = job_id in self.jobs
        self.jobs.pop(job_id, None)
        self.job_profiles.pop(job_id, None)
        self.job_reports.pop(job_id, None)
        self.job_recipes.pop(job_id, None)
        self.job_plain_english.pop(job_id, None)
        self.job_questions.pop(job_id, None)
        self.job_verifications.pop(job_id, None)
        self.job_adapter_options.pop(job_id, None)
        self.job_conversion_reports.pop(job_id, None)
        self.storage.cleanup_job(job_id)
        return had_job

    def get_expired_job_ids(self, max_age_hours: Optional[float] = None) -> List[str]:
        """Find non-active jobs whose created_at exceeds the specified TTL."""
        ttl = max_age_hours if max_age_hours is not None else float(os.getenv("STORAGE_TTL_HOURS", "24"))
        cutoff_dt = datetime.now(timezone.utc) - timedelta(hours=ttl)
        expired: List[str] = []

        active_statuses = {
            JobStatus.CONVERTING,
            JobStatus.PROFILING,
            JobStatus.CLEANING,
            JobStatus.VERIFYING,
            JobStatus.DRAFTING_RECIPE,
        }

        for j_id, j_meta in list(self.jobs.items()):
            if j_meta.status in active_statuses:
                continue
            created = j_meta.created_at
            if created:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if created < cutoff_dt:
                    expired.append(j_id)
        return expired


_default_orchestrator: Optional[JobOrchestrator] = None


def get_orchestrator(storage: Optional[JobStorage] = None) -> JobOrchestrator:
    """Retrieve or initialize the global shared orchestrator instance."""
    global _default_orchestrator
    if _default_orchestrator is None:
        _default_orchestrator = JobOrchestrator(storage=storage)
    return _default_orchestrator

