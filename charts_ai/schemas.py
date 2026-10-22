"""LLM-facing structured output schemas for Chart AI (Section 8 of spec)."""

from __future__ import annotations
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class LLMFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")
    column: str
    op: Literal["=", "!=", "<", "<=", ">", ">=", "in", "between", "is_null", "not_null"]
    values: List[str] = Field(default_factory=list)


class LLMField(BaseModel):
    model_config = ConfigDict(extra="forbid")
    column: str
    cast_as: Optional[Literal["number", "date", "timestamp", "text"]] = None
    time_bucket: Optional[Literal["hour", "day", "week", "month", "quarter", "year", "hour_of_day", "day_of_week"]] = None
    bins: Optional[int] = None


class LLMChartSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chart_type: Literal["bar", "hbar", "line", "area", "histogram", "scatter", "pie", "box", "heatmap", "big_number"]
    x: Optional[LLMField] = None
    y: Optional[LLMField] = None
    color: Optional[LLMField] = None
    aggregation: Literal["count", "count_distinct", "sum", "avg", "min", "max", "median", "none"] = "count"
    filters: List[LLMFilter] = Field(default_factory=list)
    sort: Literal["x", "y_desc", "y_asc"] = "y_desc"
    top_n: Optional[int] = None
    log_y: bool = False


class LLMRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spec: LLMChartSpec
    title: str = Field(..., max_length=120)
    question_answered: str = Field(..., max_length=140)
    why: str = Field(..., max_length=240)
    caveats: List[str] = Field(default_factory=list)
    priority: int = 1


class LLMPlanTip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    column: Optional[str] = None
    tip: str = Field(..., max_length=200)
    action: Literal["cast_as_date", "cast_as_number", "exclude_missing", "hide_outliers", "none"] = "none"


class LLMPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(..., max_length=500)
    recommendations: List[LLMRecommendation] = Field(default_factory=list)
    prep_tips: List[LLMPlanTip] = Field(default_factory=list)
    avoid: List[str] = Field(default_factory=list)


class LLMChartRequestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["chart", "clarify", "cannot_chart"]
    spec: Optional[LLMChartSpec] = None
    title: Optional[str] = None
    explanation: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)
    clarification_question: Optional[str] = None
    reason: Optional[str] = None
