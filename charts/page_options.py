"""Page-wide data options applied to chart specifications (Section 5.5 of spec)."""

from __future__ import annotations
from dataclasses import dataclass, field
import copy
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from charts.errors import InvalidChartSpecError
from charts.spec import ChartSpec, FieldRef, Filter, validate_spec


class PageDataOptions(BaseModel):
    """Page-wide data options stored per session/job."""
    cast_overrides: Dict[str, str] = Field(default_factory=dict)  # column -> "number" | "date" | "timestamp" | "text"
    exclude_missing: bool = False
    hide_outliers: bool = False  # Clip numeric axes to 1st..99th percentile
    cross_filters: Dict[str, Any] = Field(default_factory=dict)  # column -> value


def apply_page_options(
    spec: ChartSpec,
    options: Optional[PageDataOptions],
    schema: Dict[str, str],
) -> ChartSpec:
    """Apply page-wide data options onto an individual ChartSpec.
    
    Rules:
    - Cast overrides fill a field's missing cast_as. An explicit chart cast_as wins.
    - exclude_missing adds not_null filters on the chart's X and Y columns only.
    - hide_outliers enables percentile clipping on numeric axes.
    - cross_filters injects equality filters onto all linked charts (excluding the source dimension).
    - The resulting spec must pass validate_spec.
    """
    if options is None:
        return spec

    new_spec = copy.deepcopy(spec)

    # 1. Cast overrides
    if options.cast_overrides:
        for field_ref in (new_spec.x, new_spec.y, new_spec.color):
            if field_ref and field_ref.column in options.cast_overrides:
                if field_ref.cast_as is None:
                    override_cast = options.cast_overrides[field_ref.column]
                    if override_cast in ("number", "date", "timestamp", "text"):
                        field_ref.cast_as = override_cast  # type: ignore

    # 2. Exclude missing values on active axes
    if options.exclude_missing:
        active_cols = []
        if new_spec.x:
            active_cols.append(new_spec.x.column)
        if new_spec.y:
            active_cols.append(new_spec.y.column)

        existing_filter_cols = {f.column for f in new_spec.filters if f.op in ("not_null", "!=")}
        for col in active_cols:
            if col in schema and col not in existing_filter_cols:
                if len(new_spec.filters) < 10:
                    new_spec.filters.append(Filter(column=col, op="not_null"))

    # 3. Hide outliers
    if options.hide_outliers:
        new_spec.hide_outliers = True

    # 4. Cross-filters (interactive click-to-filter from linked charts)
    if options.cross_filters:
        for filter_col, filter_val in options.cross_filters.items():
            if filter_col in schema and filter_val is not None:
                # Do not apply filter to the source chart grouping by this exact column
                # so users can see all categories and click to switch or toggle
                is_source_chart = bool(new_spec.x and new_spec.x.column == filter_col)
                if not is_source_chart:
                    new_spec.filters = [
                        f for f in new_spec.filters if not (f.column == filter_col and f.op == "=")
                    ]
                    if len(new_spec.filters) < 10:
                        new_spec.filters.append(Filter(column=filter_col, op="=", value=filter_val))

    # 4. Validate output
    try:
        validate_spec(new_spec, schema)
        return new_spec
    except InvalidChartSpecError:
        # If applied options caused an invalid spec, return original valid spec
        return spec
