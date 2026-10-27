"""Pydantic models and JSON Schema for constrained cleaning recipes."""

from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator

# Allowed strptime formats
ALLOWED_DATE_FORMATS = {
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%Y-%m-%d %H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%d %H:%M:%S%z",
}

ALLOWED_CAST_TYPES = {
    "integer",
    "bigint",
    "double",
    "boolean",
    "varchar",
    "date",
    "timestamp",
}


class TrimAndNormalizeConfig(BaseModel):
    trim: bool = True
    case: Optional[Literal["lower", "upper", "title"]] = None
    null_tokens: List[str] = Field(default_factory=lambda: ["N/A", "NA", "none", "null", "-", "?", ""])

    model_config = {"extra": "forbid"}


class CastTypeConfig(BaseModel):
    type: Literal["integer", "bigint", "double", "boolean", "varchar", "date", "timestamp"]

    model_config = {"extra": "forbid"}


class ParseTimestampConfig(BaseModel):
    formats: List[str] = Field(min_length=1)
    source_tz: str = "UTC"

    model_config = {"extra": "forbid"}

    @field_validator("formats")
    @classmethod
    def validate_formats(cls, v: List[str]) -> List[str]:
        for fmt in v:
            if fmt not in ALLOWED_DATE_FORMATS:
                raise ValueError(f"Format '{fmt}' is not in the allowed date format menu.")
        return v


class HandleNullsConfig(BaseModel):
    strategy: Literal["drop_row", "fill_value", "fill_median", "fill_mode", "flag"]
    value: Optional[Union[str, int, float, bool]] = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_fill_value(self) -> HandleNullsConfig:
        if self.strategy == "fill_value" and self.value is None:
            raise ValueError("Strategy 'fill_value' requires a non-null 'value' parameter.")
        return self


class ClipOutliersConfig(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    action: Literal["null", "clamp"] = "null"

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_bounds(self) -> ClipOutliersConfig:
        if self.min is None and self.max is None:
            raise ValueError("Clip outliers requires at least one of 'min' or 'max'.")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError(f"min ({self.min}) must be less than or equal to max ({self.max}).")
        return self


class MaskPiiConfig(BaseModel):
    strategy: Literal["partial_mask", "sha256_hash", "redact"] = "partial_mask"
    entity_type: Optional[str] = None

    model_config = {"extra": "forbid"}


class ColumnRule(BaseModel):
    trim_and_normalize: Optional[TrimAndNormalizeConfig] = None
    cast_type: Optional[CastTypeConfig] = None
    parse_timestamp: Optional[ParseTimestampConfig] = None
    clip_outliers: Optional[ClipOutliersConfig] = None
    handle_nulls: Optional[HandleNullsConfig] = None
    mask_pii: Optional[MaskPiiConfig] = None

    model_config = {"extra": "forbid"}


class DedupeConfig(BaseModel):
    keys: List[str] = Field(min_length=1)
    keep: Literal["first", "latest", "all"] = "latest"
    order_by: Optional[str] = None

    model_config = {"extra": "forbid"}


class Recipe(BaseModel):
    version: int = 1
    dedupe: Optional[DedupeConfig] = None
    columns: Dict[str, ColumnRule] = Field(default_factory=dict)
    confirmations_required: List[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}

    @classmethod
    def get_json_schema(cls) -> Dict[str, Any]:
        """Return the strict JSON Schema for LLM structured output enforcement."""
        return cls.model_json_schema()
