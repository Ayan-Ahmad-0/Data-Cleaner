"""Data contracts and schemas for the AI Analyst feature."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator


class LLMResponse(BaseModel):
    """Structured response expected from the LLM for NL-to-SQL tasks."""
    action: Literal["answer", "clarify", "cannot_answer"]
    sql: Optional[str] = Field(
        None,
        description="One DuckDB SELECT statement, required when action is 'answer'",
    )
    explanation: Optional[str] = Field(
        None,
        description="1-3 plain sentences describing what the query computes",
    )
    assumptions: List[str] = Field(
        default_factory=list,
        description="Interpretations made about the question or columns",
    )
    clarification_question: Optional[str] = Field(
        None,
        description="Specific question when action is 'clarify'",
    )
    reason: Optional[str] = Field(
        None,
        description="Why the question cannot be answered, when action is 'cannot_answer'",
    )

    @model_validator(mode="after")
    def validate_action_fields(self) -> LLMResponse:
        """Validate consistency of action and associated fields."""
        if self.action == "answer":
            if not self.sql or not self.sql.strip():
                raise ValueError("Action 'answer' requires a non-empty 'sql' field.")
        elif self.action == "clarify":
            if not self.clarification_question and not self.reason:
                self.clarification_question = "Could you please clarify your question?"
        elif self.action == "cannot_answer":
            if not self.reason:
                self.reason = "This question cannot be answered from the available data."
        return self


@dataclass
class AnalystResult:
    """End-to-end outcome of an analyst ask() invocation."""
    status: str  # "ok" | "needs_clarification" | "cannot_answer" | "error"
    question: str
    sql: Optional[str] = None
    explanation: Optional[str] = None
    assumptions: List[str] = field(default_factory=list)
    clarification_question: Optional[str] = None
    result: Optional[Any] = None  # explore.service.QueryResult
    retried: bool = False
    message: Optional[str] = None
    elapsed_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to a JSON-serializable dictionary."""
        res_dict = None
        if self.result is not None:
            res_dict = {
                "columns": [{"name": c.name, "type": c.type} for c in self.result.columns],
                "rows": self.result.rows,
                "row_count_returned": self.result.row_count_returned,
                "truncated": self.result.truncated,
                "elapsed_seconds": self.result.elapsed_seconds,
                "warnings": getattr(self.result, "warnings", []),
            }

        return {
            "status": self.status,
            "question": self.question,
            "sql": self.sql,
            "explanation": self.explanation,
            "assumptions": self.assumptions,
            "clarification_question": self.clarification_question,
            "result": res_dict,
            "retried": self.retried,
            "message": self.message,
            "elapsed_seconds": self.elapsed_seconds,
        }
