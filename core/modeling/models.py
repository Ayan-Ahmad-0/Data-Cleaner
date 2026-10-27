"""Pydantic schemas and data classes for multi-table modeling."""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ColumnMetadata(BaseModel):
    """Metadata describing a single column within a staged table."""
    name: str
    data_type: str
    is_nullable: bool = True
    is_pk: bool = False
    is_fk: bool = False
    distinct_count: Optional[int] = None
    null_count: Optional[int] = None
    sample_values: List[Any] = Field(default_factory=list)


class TableMetadata(BaseModel):
    """Metadata describing a staged table in the modeling session."""
    table_name: str
    row_count: int = 0
    file_size_bytes: int = 0
    original_filename: str = ""
    columns: List[ColumnMetadata] = Field(default_factory=list)
    position_x: float = 0.0
    position_y: float = 0.0


class Relationship(BaseModel):
    """Relational edge linking two columns across tables."""
    id: str
    from_table: str  # Child table containing foreign key reference
    from_column: str
    to_table: str    # Parent table containing primary / unique key
    to_column: str
    cardinality: str = "1:N"  # "1:1", "1:N", "N:1", "N:M"
    confidence: float = 1.0
    match_ratio: float = 1.0
    orphan_count: int = 0
    status: str = "detected"  # "detected", "confirmed", "manual"


class ModelingSessionState(BaseModel):
    """Full snapshot of an interactive multi-table modeling session."""
    session_id: str
    created_at: str
    tables: Dict[str, TableMetadata] = Field(default_factory=dict)
    relationships: List[Relationship] = Field(default_factory=list)


class JoinPreviewResult(BaseModel):
    """Sample preview and statistical match metrics for a relationship join."""
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    join_type: str = "INNER"
    matched_rows: int = 0
    total_child_rows: int = 0
    match_ratio: float = 0.0
    orphan_count: int = 0
    columns: List[str] = Field(default_factory=list)
    sample_rows: List[Dict[str, Any]] = Field(default_factory=list)
