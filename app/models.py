"""Data models and state definitions for the data cleaning job lifecycle."""

from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from core.recipe_schema import Recipe


class JobStatus(str, Enum):
    CREATED = "CREATED"
    UPLOADED = "UPLOADED"
    CONVERTING = "CONVERTING"
    PROFILING = "PROFILING"
    PROFILED = "PROFILED"
    DRAFTING_RECIPE = "DRAFTING_RECIPE"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    CLEANING = "CLEANING"
    VERIFYING = "VERIFYING"
    DONE = "DONE"
    DONE_WITH_WARNINGS = "DONE_WITH_WARNINGS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class JobMetadata(BaseModel):
    id: str
    filename: str
    status: JobStatus = JobStatus.CREATED
    progress_pct: float = 0.0
    current_stage: str = "Initialized"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    file_size_bytes: int = 0
    row_count: int = 0
    privacy_mode: bool = False
    error: Optional[str] = None


class JobDetailResponse(BaseModel):
    job: JobMetadata
    profile: Optional[Dict[str, Any]] = None
    report_markdown: Optional[str] = None
    recipe: Optional[Dict[str, Any]] = None
    recipe_plain_english: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    verification: Optional[Dict[str, Any]] = None
    download_urls: Dict[str, str] = Field(default_factory=dict)
