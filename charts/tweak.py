"""Per-chart Tweak panel helpers and default starter spec (Section 5.3 and 5.4 of spec)."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.storage import JobStorage
from charts.limits import ChartLimits
from charts.service import get_column_stats
from charts.spec import ChartSpec, FieldRef, _is_datetime_type, _is_numeric_type
from charts.stats import ColumnStats


class ColumnOption(BaseModel):
    name: str
    type: str
    kind: str
    null_pct: float
    distinct_approx: Optional[int] = None


class TweakOptions(BaseModel):
    allowed_chart_types: List[str]
    disabled_chart_types: Dict[str, str] = Field(default_factory=dict)
    allowed_aggregations: List[str]
    disabled_aggregations: Dict[str, str] = Field(default_factory=dict)
    columns: List[ColumnOption]
    disabled_reasons: Dict[str, str] = Field(default_factory=dict)


def default_starter_spec(schema: Dict[str, str], stats: List[ColumnStats]) -> ChartSpec:
    """Create a deterministic default starter chart spec (Section 5.3).
    
    Rules:
    - If there is a categorical column (2 to 50 distinct values): horizontal bar, count of rows, top 20.
    - Else if there is a numeric column: histogram of the first numeric column.
    - Else: big number (row count).
    """
    # 1. Categorical column with 2-50 distinct
    categoricals = [
        c for c in stats
        if c.name in schema and c.kind == "categorical" and c.distinct_approx and 2 <= c.distinct_approx <= 50
    ]
    if categoricals:
        first_cat = categoricals[0]
        return ChartSpec(
            chart_type="hbar",
            x=FieldRef(column=first_cat.name),
            aggregation="count",
            sort="y_desc",
            top_n=20,
            title=f"Count by {first_cat.name}",
        )

    # 2. Numeric column -> Histogram
    numerics = [
        c for c in stats
        if c.name in schema and (c.kind == "numeric" or _is_numeric_type(schema.get(c.name, ""), None))
    ]
    if numerics:
        first_num = numerics[0]
        return ChartSpec(
            chart_type="histogram",
            x=FieldRef(column=first_num.name, bins=20),
            aggregation="count",
            title=f"Distribution of {first_num.name}",
        )

    # 3. Else: Big number of total rows
    return ChartSpec(
        chart_type="big_number",
        aggregation="count",
        title="Total Records",
    )


def get_tweak_options(
    job_id: str,
    user_id: str = "anonymous",
    spec: Optional[ChartSpec] = None,
    storage: Optional[JobStorage] = None,
    limits: Optional[ChartLimits] = None,
) -> TweakOptions:
    """Compute allowed chart types, aggregations, and column options for the Tweak panel.
    
    Reuses validate_spec semantic rules, using cached column stats only (no data scans).
    """
    stats = get_column_stats(job_id, user_id=user_id, storage=storage, limits=limits)
    schema = {s.name: s.type for s in stats}

    all_chart_types = [
        "bar", "hbar", "line", "area", "histogram", "scatter",
        "pie", "box", "heatmap", "big_number"
    ]
    all_aggregations = ["count", "count_distinct", "sum", "avg", "min", "max", "median", "none"]

    col_options = [
        ColumnOption(
            name=s.name,
            type=s.type,
            kind=s.kind,
            null_pct=s.null_pct,
            distinct_approx=s.distinct_approx,
        )
        for s in stats
    ]

    has_numeric = any(s.kind == "numeric" or _is_numeric_type(s.type, None) for s in stats)
    has_datetime = any(s.kind == "datetime" or _is_datetime_type(s.type, None) for s in stats)
    has_categorical = any(s.kind in ("categorical", "boolean") for s in stats)

    disabled_types: Dict[str, str] = {}
    allowed_types: List[str] = []

    for ct in all_chart_types:
        if ct in ("histogram", "scatter", "box") and not has_numeric:
            disabled_types[ct] = f"{ct.capitalize()} requires at least one numeric column in dataset."
        elif ct == "pie" and not has_categorical and not any(s.distinct_approx and s.distinct_approx <= 10 for s in stats):
            disabled_types[ct] = "Pie chart requires a categorical column with few distinct values."
        else:
            allowed_types.append(ct)

    # Aggregations: if spec has Y column, check whether it is numeric
    disabled_aggs: Dict[str, str] = {}
    allowed_aggs: List[str] = []

    y_is_num = True
    if spec and spec.y:
        y_type = schema.get(spec.y.column, "")
        y_is_num = _is_numeric_type(y_type, spec.y.cast_as)

    for agg in all_aggregations:
        if agg in ("sum", "avg", "median"):
            if not y_is_num:
                col_name = spec.y.column if spec and spec.y else "Y"
                disabled_aggs[agg] = f"Aggregation '{agg}' requires a numeric column; '{col_name}' is not numeric."
            elif not has_numeric and not (spec and spec.y and spec.y.cast_as == "number"):
                disabled_aggs[agg] = f"Aggregation '{agg}' requires a numeric column."
            else:
                allowed_aggs.append(agg)
        else:
            allowed_aggs.append(agg)

    return TweakOptions(
        allowed_chart_types=allowed_types,
        disabled_chart_types=disabled_types,
        allowed_aggregations=allowed_aggs,
        disabled_aggregations=disabled_aggs,
        columns=col_options,
    )
