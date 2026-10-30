"""Automated storage retention manager, TTL expiration, and disk scavenger."""

from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import logging
import os
from pathlib import Path
import shutil
import time
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class RetentionConfig:
    """Configurable storage retention parameters."""
    ttl_hours: float = field(
        default_factory=lambda: float(os.getenv("STORAGE_TTL_HOURS", "24"))
    )
    cleanup_interval_minutes: int = field(
        default_factory=lambda: int(os.getenv("STORAGE_CLEANUP_INTERVAL_MINUTES", "30"))
    )
    enabled: bool = field(
        default_factory=lambda: os.getenv("STORAGE_CLEANUP_ENABLED", "true").lower() in ("true", "1", "yes")
    )
    max_disk_usage_percent: int = field(
        default_factory=lambda: int(os.getenv("STORAGE_MAX_DISK_PERCENT", "90"))
    )
    base_data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("DATA_DIR", "data")).resolve()
    )


@dataclass
class RetentionSweepResult:
    """Detailed summary of a completed storage retention sweep."""
    jobs_purged: int = 0
    convert_jobs_purged: int = 0
    query_jobs_purged: int = 0
    modeling_sessions_purged: int = 0
    bytes_freed: int = 0
    elapsed_seconds: float = 0.0
    disk_usage_percent_before: Optional[float] = None
    disk_usage_percent_after: Optional[float] = None
    errors: List[str] = field(default_factory=list)

    @property
    def total_purged(self) -> int:
        return (
            self.jobs_purged
            + self.convert_jobs_purged
            + self.query_jobs_purged
            + self.modeling_sessions_purged
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "jobs_purged": self.jobs_purged,
            "convert_jobs_purged": self.convert_jobs_purged,
            "query_jobs_purged": self.query_jobs_purged,
            "modeling_sessions_purged": self.modeling_sessions_purged,
            "total_purged": self.total_purged,
            "bytes_freed": self.bytes_freed,
            "bytes_freed_formatted": format_bytes(self.bytes_freed),
            "elapsed_seconds": round(self.elapsed_seconds, 3),
            "disk_usage_percent_before": self.disk_usage_percent_before,
            "disk_usage_percent_after": self.disk_usage_percent_after,
            "errors": self.errors,
        }


def format_bytes(size: int) -> str:
    """Format bytes into human-readable metric."""
    if size < 1024:
        return f"{size} B"
    for unit in ("KB", "MB", "GB", "TB"):
        size /= 1024.0
        if size < 1024.0:
            return f"{size:.2f} {unit}"
    return f"{size:.2f} PB"


def get_dir_size_bytes(path: Path) -> int:
    """Compute total disk bytes occupied by a directory."""
    if not path.exists():
        return 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0

    total = 0
    try:
        for entry in path.rglob("*"):
            if entry.is_file():
                try:
                    total += entry.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total


class StorageRetentionManager:
    """Manages periodic TTL purging, disk cleanup, and headroom enforcement."""

    # Explicit whitelist of directories safe for dynamic purging
    DYNAMIC_SUBDIRS = ("jobs", "convert_jobs", "query_jobs", "modeling")

    # Strictly protected static fixture directories that must NEVER be purged
    PROTECTED_SUBDIRS = ("benchmarks", "demo", "evaluation")

    def __init__(self, config: Optional[RetentionConfig] = None) -> None:
        self.config = config or RetentionConfig()
        self.data_dir = self.config.base_data_dir

    def get_disk_usage(self) -> Dict[str, Any]:
        """Query host disk capacity and current usage percentage."""
        try:
            target_path = self.data_dir if self.data_dir.exists() else Path.cwd()
            usage = shutil.disk_usage(str(target_path))
            total = usage.total
            used = usage.used
            free = usage.free
            pct_used = round((used / total) * 100, 2) if total > 0 else 0.0
            return {
                "total_bytes": total,
                "used_bytes": used,
                "free_bytes": free,
                "percent_used": pct_used,
                "total_formatted": format_bytes(total),
                "used_formatted": format_bytes(used),
                "free_formatted": format_bytes(free),
            }
        except Exception as e:
            logger.warning("Could not query disk usage: %s", e)
            return {
                "total_bytes": 0,
                "used_bytes": 0,
                "free_bytes": 0,
                "percent_used": 0.0,
                "total_formatted": "Unknown",
                "used_formatted": "Unknown",
                "free_formatted": "Unknown",
            }

    def get_storage_inventory(self) -> Dict[str, Any]:
        """Inspect all dynamic categories and calculate job counts and bytes on disk."""
        inventory: Dict[str, Any] = {}
        total_dynamic_bytes = 0

        for category in self.DYNAMIC_SUBDIRS:
            cat_dir = self.data_dir / category
            item_count = 0
            cat_bytes = 0
            if cat_dir.exists() and cat_dir.is_dir():
                try:
                    subdirs = [p for p in cat_dir.iterdir() if p.is_dir()]
                    item_count = len(subdirs)
                    cat_bytes = sum(get_dir_size_bytes(d) for d in subdirs)
                except OSError as e:
                    logger.warning("Failed to inspect category '%s': %s", category, e)

            total_dynamic_bytes += cat_bytes
            inventory[category] = {
                "count": item_count,
                "bytes": cat_bytes,
                "bytes_formatted": format_bytes(cat_bytes),
            }

        inventory["total_dynamic_bytes"] = total_dynamic_bytes
        inventory["total_dynamic_bytes_formatted"] = format_bytes(total_dynamic_bytes)
        inventory["disk"] = self.get_disk_usage()
        return inventory

    def purge_expired_data(
        self,
        orchestrator: Optional[Any] = None,
        convert_jobs: Optional[Dict[str, Any]] = None,
        max_age_hours: Optional[float] = None,
    ) -> RetentionSweepResult:
        """Perform a single comprehensive retention sweep across all dynamic directories and in-memory caches."""
        start_time = time.perf_counter()
        result = RetentionSweepResult()
        disk_before = self.get_disk_usage()
        result.disk_usage_percent_before = disk_before.get("percent_used")

        ttl_hours = max_age_hours if max_age_hours is not None else self.config.ttl_hours
        cutoff_timestamp = time.time() - (ttl_hours * 3600)
        cutoff_dt = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)

        logger.info(
            "Starting storage retention sweep (TTL: %.1f hours, Cutoff: %s)",
            ttl_hours,
            cutoff_dt.isoformat(),
        )

        active_job_ids: Set[str] = set()

        # Step 1: Purge in-memory jobs in orchestrator and identify active jobs to protect
        if orchestrator is not None:
            try:
                for job_id, job in list(orchestrator.jobs.items()):
                    # Protect in-progress jobs from being deleted
                    status_val = getattr(job, "status", None)
                    status_str = getattr(status_val, "value", str(status_val)).upper()
                    if status_str in ("CONVERTING", "PROFILING", "CLEANING", "VERIFYING", "DRAFTING_RECIPE"):
                        active_job_ids.add(job_id)
                        continue

                    # Check job created_at
                    job_created = getattr(job, "created_at", None)
                    is_expired = False
                    if isinstance(job_created, datetime):
                        # Normalize timezone if necessary
                        if job_created.tzinfo is None:
                            job_created = job_created.replace(tzinfo=timezone.utc)
                        is_expired = job_created < cutoff_dt

                    if is_expired:
                        job_dir = orchestrator.storage.job_dir(job_id) if hasattr(orchestrator, "storage") else (self.data_dir / "jobs" / job_id)
                        freed = get_dir_size_bytes(job_dir)
                        if hasattr(orchestrator, "evict_job"):
                            orchestrator.evict_job(job_id)
                        else:
                            orchestrator.jobs.pop(job_id, None)
                            if hasattr(orchestrator, "storage"):
                                orchestrator.storage.cleanup_job(job_id)

                        result.jobs_purged += 1
                        result.bytes_freed += freed
            except Exception as e:
                err_msg = f"Error during orchestrator in-memory purge: {e}"
                logger.exception(err_msg)
                result.errors.append(err_msg)

        # Step 2: Purge disk directories for each dynamic category
        for category in self.DYNAMIC_SUBDIRS:
            cat_dir = self.data_dir / category
            if not cat_dir.exists() or not cat_dir.is_dir():
                continue

            try:
                for item_path in cat_dir.iterdir():
                    if not item_path.is_dir():
                        continue

                    folder_id = item_path.name
                    # Never purge an actively processing cleaning job
                    if folder_id in active_job_ids:
                        continue

                    # Check modification / creation time of directory
                    try:
                        stat = item_path.stat()
                        mtime = stat.st_mtime
                    except OSError:
                        mtime = time.time()

                    if mtime < cutoff_timestamp:
                        dir_bytes = get_dir_size_bytes(item_path)
                        try:
                            shutil.rmtree(item_path, ignore_errors=True)
                            result.bytes_freed += dir_bytes

                            if category == "jobs":
                                result.jobs_purged += 1
                                if orchestrator and hasattr(orchestrator, "evict_job"):
                                    orchestrator.evict_job(folder_id)
                            elif category == "convert_jobs":
                                result.convert_jobs_purged += 1
                                if convert_jobs is not None:
                                    convert_jobs.pop(folder_id, None)
                            elif category == "query_jobs":
                                result.query_jobs_purged += 1
                                if convert_jobs is not None:
                                    convert_jobs.pop(folder_id, None)
                            elif category == "modeling":
                                result.modeling_sessions_purged += 1

                            logger.debug("Purged expired directory: %s (%s)", item_path, format_bytes(dir_bytes))
                        except Exception as e:
                            err_msg = f"Failed to delete '{item_path}': {e}"
                            logger.warning(err_msg)
                            result.errors.append(err_msg)
            except Exception as e:
                err_msg = f"Error sweeping directory '{cat_dir}': {e}"
                logger.exception(err_msg)
                result.errors.append(err_msg)

        # Step 3: Evict any remaining in-memory convert_jobs whose work_dir no longer exists
        if convert_jobs is not None:
            try:
                for c_id, c_data in list(convert_jobs.items()):
                    wdir = c_data.get("work_dir")
                    if wdir and not Path(wdir).exists():
                        convert_jobs.pop(c_id, None)
            except Exception as e:
                logger.warning("Error evicting orphaned convert_jobs in memory: %s", e)

        # Step 4: Emergency disk usage enforcement if above threshold
        disk_current = self.get_disk_usage()
        if disk_current.get("percent_used", 0) > self.config.max_disk_usage_percent:
            logger.warning(
                "Disk usage (%.1f%%) exceeds maximum threshold (%d%%). Running emergency FIFO eviction.",
                disk_current.get("percent_used", 0),
                self.config.max_disk_usage_percent,
            )
            self._emergency_disk_eviction(result, active_job_ids, orchestrator, convert_jobs)

        disk_after = self.get_disk_usage()
        result.disk_usage_percent_after = disk_after.get("percent_used")
        result.elapsed_seconds = time.perf_counter() - start_time

        logger.info(
            "Retention sweep completed in %.3fs: %d items purged, %s freed.",
            result.elapsed_seconds,
            result.total_purged,
            format_bytes(result.bytes_freed),
        )
        return result

    def _emergency_disk_eviction(
        self,
        result: RetentionSweepResult,
        active_job_ids: Set[str],
        orchestrator: Optional[Any],
        convert_jobs: Optional[Dict[str, Any]],
    ) -> None:
        """Evict oldest items in FIFO order when disk usage hits critical watermark."""
        candidate_dirs: List[tuple[Path, float, str]] = []

        for category in self.DYNAMIC_SUBDIRS:
            cat_dir = self.data_dir / category
            if not cat_dir.exists() or not cat_dir.is_dir():
                continue
            for item in cat_dir.iterdir():
                if item.is_dir() and item.name not in active_job_ids:
                    try:
                        candidate_dirs.append((item, item.stat().st_mtime, category))
                    except OSError:
                        pass

        # Sort ascending by modification time (oldest first)
        candidate_dirs.sort(key=lambda x: x[1])

        target_max_pct = self.config.max_disk_usage_percent - 5  # evict down to 5% below watermark
        for item_path, _, cat in candidate_dirs:
            cur_disk = self.get_disk_usage()
            if cur_disk.get("percent_used", 0) <= target_max_pct:
                break

            folder_id = item_path.name
            dir_bytes = get_dir_size_bytes(item_path)
            shutil.rmtree(item_path, ignore_errors=True)
            result.bytes_freed += dir_bytes

            if cat == "jobs":
                result.jobs_purged += 1
                if orchestrator and hasattr(orchestrator, "evict_job"):
                    orchestrator.evict_job(folder_id)
            elif cat == "convert_jobs":
                result.convert_jobs_purged += 1
                if convert_jobs is not None:
                    convert_jobs.pop(folder_id, None)
            elif cat == "query_jobs":
                result.query_jobs_purged += 1
                if convert_jobs is not None:
                    convert_jobs.pop(folder_id, None)
            elif cat == "modeling":
                result.modeling_sessions_purged += 1

            logger.info("Emergency disk eviction purged %s (%s)", item_path, format_bytes(dir_bytes))


async def retention_daemon_loop(
    manager: StorageRetentionManager,
    orchestrator: Optional[Any] = None,
    convert_jobs: Optional[Dict[str, Any]] = None,
) -> None:
    """Continuous background worker that executes the retention sweep at configured intervals."""
    interval_seconds = max(60, manager.config.cleanup_interval_minutes * 60)
    logger.info(
        "Storage retention daemon loop started (Interval: %d mins / %ds, TTL: %.1f hours)",
        manager.config.cleanup_interval_minutes,
        interval_seconds,
        manager.config.ttl_hours,
    )

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            if manager.config.enabled:
                manager.purge_expired_data(
                    orchestrator=orchestrator,
                    convert_jobs=convert_jobs,
                )
        except asyncio.CancelledError:
            logger.info("Storage retention daemon loop received cancellation request.")
            break
        except Exception as e:
            logger.exception("Unexpected error in storage retention daemon loop: %s", e)


if __name__ == "__main__":
    # Direct CLI entrypoint for Linux crontab / Docker tasks: python -m core.retention
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    mgr = StorageRetentionManager()
    res = mgr.purge_expired_data()
    print(
        f"Sweep completed: {res.total_purged} items purged, "
        f"{format_bytes(res.bytes_freed)} freed in {res.elapsed_seconds:.3f}s."
    )
