"""Public domain models for Chart AI results (Section 7 of spec)."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, List, Optional
from charts.service import ChartData
from charts.spec import ChartSpec


@dataclass
class ChartRecommendation:
    id: str                          # stable within a plan, e.g. "rec_1"
    spec: ChartSpec                  # validated against the dataset schema
    title: str                       # plain text
    question_answered: str           # plain text
    why: str                         # plain text
    caveats: List[str] = field(default_factory=list)
    priority: int = 1                # 1 = most important
    source: str = "ai"               # "ai" or "standard"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "spec": self.spec.model_dump(),
            "title": self.title,
            "question_answered": self.question_answered,
            "why": self.why,
            "caveats": self.caveats,
            "priority": self.priority,
            "source": self.source,
        }


@dataclass
class DataPrepTip:
    column: Optional[str]
    tip: str                         # plain text
    action: str                      # "cast_as_date" | "cast_as_number" | "exclude_missing" | "hide_outliers" | "none"

    def to_dict(self) -> dict:
        return {
            "column": self.column,
            "tip": self.tip,
            "action": self.action,
        }


@dataclass
class VisualizationPlan:
    summary: str                     # 2-3 plain sentences about the dataset's shape
    recommendations: List[ChartRecommendation]
    prep_tips: List[DataPrepTip]
    avoid: List[str]
    used_fallback: bool = False
    elapsed_seconds: float = 0.0

    def to_dict(self) -> dict:
        return {
            "summary": self.summary,
            "recommendations": [r.to_dict() for r in self.recommendations],
            "prep_tips": [t.to_dict() for t in self.prep_tips],
            "avoid": self.avoid,
            "used_fallback": self.used_fallback,
            "elapsed_seconds": self.elapsed_seconds,
        }


@dataclass
class ChartFromTextResult:
    status: str                      # "ok" | "needs_clarification" | "cannot_chart" | "error"
    request: str
    spec: Optional[ChartSpec] = None
    title: Optional[str] = None
    explanation: Optional[str] = None
    assumptions: List[str] = field(default_factory=list)
    clarification_question: Optional[str] = None
    message: Optional[str] = None
    data: Optional[ChartData] = None
    retried: bool = False
    elapsed_seconds: float = 0.0

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "request": self.request,
            "spec": self.spec.model_dump() if self.spec else None,
            "title": self.title,
            "explanation": self.explanation,
            "assumptions": self.assumptions,
            "clarification_question": self.clarification_question,
            "message": self.message,
            "data": self.data.to_dict() if self.data else None,
            "retried": self.retried,
            "elapsed_seconds": self.elapsed_seconds,
        }
