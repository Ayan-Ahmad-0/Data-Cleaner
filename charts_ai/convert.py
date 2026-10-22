"""Conversion and sanitization from LLM models to domain ChartSpec (Section 8 of spec)."""

from __future__ import annotations
import logging
import re
from typing import Any, Dict, List, Optional, Union

from charts.errors import InvalidChartSpecError
from charts.spec import ChartSpec, FieldRef, Filter, validate_spec, _is_numeric_type, _is_datetime_type
from charts_ai.schemas import LLMChartSpec, LLMField, LLMFilter

logger = logging.getLogger(__name__)


def strip_html_and_control_chars(text: Optional[str], max_len: Optional[int] = None) -> str:
    """Remove HTML tags, control characters, and trim to max_len."""
    if not text:
        return ""
    # Strip HTML tags
    clean = re.sub(r"<[^>]*>", "", text)
    # Strip control characters except whitespace
    clean = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", clean).strip()
    if max_len and len(clean) > max_len:
        clean = clean[:max_len].strip()
    return clean


def parse_filter_value(val_str: str, col_type: str, cast_as: Optional[str]) -> Union[str, float, int]:
    """Parse a string filter value according to the column type."""
    is_num = _is_numeric_type(col_type, cast_as)
    if is_num:
        try:
            if "." in val_str:
                return float(val_str)
            return int(val_str)
        except ValueError:
            return float(val_str)
    return val_str


def convert_llm_filter(llm_f: LLMFilter, schema: Dict[str, str]) -> Filter:
    """Convert an LLMFilter into a validated Filter domain object."""
    col = llm_f.column.strip()
    if col not in schema:
        raise InvalidChartSpecError(f"Filter column '{col}' does not exist in schema.")

    op = llm_f.op
    col_type = schema[col]

    if op in ("is_null", "not_null"):
        return Filter(column=col, op=op)

    parsed_values: List[Union[str, float, int]] = []
    for raw in llm_f.values:
        clean_raw = strip_html_and_control_chars(str(raw), max_len=100)
        try:
            parsed_values.append(parse_filter_value(clean_raw, col_type, None))
        except Exception:
            parsed_values.append(clean_raw)

    if op == "in":
        if not parsed_values:
            raise InvalidChartSpecError(f"Filter operator 'in' for '{col}' requires at least one value.")
        return Filter(column=col, op=op, value=parsed_values)
    elif op == "between":
        if len(parsed_values) != 2:
            raise InvalidChartSpecError(f"Filter operator 'between' for '{col}' requires exactly 2 values.")
        return Filter(column=col, op=op, value=parsed_values)
    else:
        if not parsed_values:
            raise InvalidChartSpecError(f"Filter operator '{op}' for '{col}' requires a value.")
        return Filter(column=col, op=op, value=parsed_values[0])


def convert_llm_field(field_m: Optional[LLMField], schema: Dict[str, str]) -> Optional[FieldRef]:
    """Convert an LLMField into FieldRef domain object."""
    if field_m is None:
        return None
    col = field_m.column.strip()
    if col not in schema:
        raise InvalidChartSpecError(f"Column '{col}' does not exist in schema.")
    return FieldRef(
        column=col,
        cast_as=field_m.cast_as,
        time_bucket=field_m.time_bucket,
        bins=field_m.bins,
    )


def convert_llm_spec(llm_spec: LLMChartSpec, schema: Dict[str, str], title: Optional[str] = None) -> ChartSpec:
    """Convert an LLMChartSpec to a ChartSpec and validate it against the schema.
    
    Raises:
        InvalidChartSpecError if spec fails validation.
    """
    x_ref = convert_llm_field(llm_spec.x, schema)
    y_ref = convert_llm_field(llm_spec.y, schema)
    color_ref = convert_llm_field(llm_spec.color, schema)

    filters: List[Filter] = []
    for f in llm_spec.filters:
        filters.append(convert_llm_filter(f, schema))

    clean_title = strip_html_and_control_chars(title, max_len=120) if title else None

    # Handle top_n default bounds
    top_n = llm_spec.top_n
    if top_n is not None:
        top_n = max(1, min(50, top_n))

    spec = ChartSpec(
        chart_type=llm_spec.chart_type,
        x=x_ref,
        y=y_ref,
        color=color_ref,
        aggregation=llm_spec.aggregation,
        filters=filters,
        sort=llm_spec.sort,
        top_n=top_n,
        log_y=llm_spec.log_y,
        title=clean_title,
    )

    validate_spec(spec, schema)
    return spec
