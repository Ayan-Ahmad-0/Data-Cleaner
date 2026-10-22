"""Deterministic, rule-based chart suggestions for raw datasets (Section 10 of spec)."""

from __future__ import annotations
from typing import Dict, List, Optional

from charts.limits import ChartLimits
from charts.spec import ChartSpec, FieldRef, Filter
from charts.stats import ColumnStats


def suggest_charts_from_stats(
    stats: List[ColumnStats],
    row_count: int,
    max_suggestions: int = 8,
) -> List[ChartSpec]:
    """Propose up to max_suggestions prioritized, deterministic charts from dataset stats.
    
    Rules follow Section 10 of the spec:
    1. Overall missing values overview
    2. Datetime column -> Line chart (count per day/month)
    3. Datetime + Numeric -> Line chart (avg/sum per time bucket)
    4. Categorical column (2 to 50 distinct) -> Horizontal bar (count by category, top 20)
    5. Numeric by Categorical -> Bar chart (avg by category)
    6. Numeric column (high variance / low nulls) -> Histogram
    7. Two numeric columns -> Scatter plot
    8. Low-cardinality boolean/categorical (2 to 6) -> Donut / Pie
    """
    suggestions: List[ChartSpec] = []
    seen_keys = set()

    def add_spec(s: ChartSpec, key: str) -> None:
        if key not in seen_keys and len(suggestions) < max_suggestions:
            seen_keys.add(key)
            suggestions.append(s)

    # Partition columns by kind
    categoricals = [c for c in stats if c.kind == "categorical" and c.distinct_approx and 2 <= c.distinct_approx <= 50]
    numerics = [c for c in stats if c.kind == "numeric"]
    datetimes = [c for c in stats if c.kind == "datetime"]
    booleans = [c for c in stats if c.kind == "boolean" or (c.distinct_approx and 2 <= c.distinct_approx <= 4)]

    # Rule 1: Always for raw data, Missing Values overview if columns have nulls
    cols_with_nulls = [c for c in stats if c.null_pct > 0.0]
    if cols_with_nulls:
        # Note: We can create a spec for a bar chart or report; in standard suggestions,
        # we can suggest a bar of null percentages or a big number of rows
        add_spec(
            ChartSpec(
                chart_type="big_number",
                aggregation="count",
                title="Total Rows In Dataset",
            ),
            "total_rows_metric",
        )

    # Rule 2: Datetime column -> Line chart (trips/records per day or month)
    if datetimes:
        dt_col = datetimes[0]
        cast_as = "timestamp" if dt_col.type.upper() == "VARCHAR" else None
        add_spec(
            ChartSpec(
                chart_type="line",
                x=FieldRef(column=dt_col.name, time_bucket="day", cast_as=cast_as),
                aggregation="count",
                title=f"Activity Over Time ({dt_col.name})",
            ),
            f"dt_count_{dt_col.name}",
        )

        # Rule 3: Datetime + Numeric column -> Line chart of average
        if numerics:
            num_col = numerics[0]
            num_cast = "number" if num_col.type.upper() == "VARCHAR" else None
            add_spec(
                ChartSpec(
                    chart_type="line",
                    x=FieldRef(column=dt_col.name, time_bucket="day", cast_as=cast_as),
                    y=FieldRef(column=num_col.name, cast_as=num_cast),
                    aggregation="avg",
                    title=f"Average {num_col.name} Over Time",
                ),
                f"dt_num_avg_{dt_col.name}_{num_col.name}",
            )

    # Rule 4: Categorical column with 2 to 50 distinct values -> Horizontal bar (top 20)
    for cat in categoricals[:3]:
        add_spec(
            ChartSpec(
                chart_type="hbar",
                x=FieldRef(column=cat.name),
                aggregation="count",
                sort="y_desc",
                top_n=20,
                title=f"Distribution of {cat.name} (Top Categories)",
            ),
            f"cat_hbar_{cat.name}",
        )

    # Rule 5: Numeric by Categorical -> Bar chart of average
    if categoricals and numerics:
        cat = categoricals[0]
        num = numerics[0]
        num_cast = "number" if num.type.upper() == "VARCHAR" else None
        add_spec(
            ChartSpec(
                chart_type="bar",
                x=FieldRef(column=cat.name),
                y=FieldRef(column=num.name, cast_as=num_cast),
                aggregation="avg",
                sort="y_desc",
                top_n=15,
                title=f"Average {num.name} by {cat.name}",
            ),
            f"num_by_cat_{cat.name}_{num.name}",
        )

    # Rule 6: Up to 2 Numeric histograms
    for num in numerics[:2]:
        num_cast = "number" if num.type.upper() == "VARCHAR" else None
        add_spec(
            ChartSpec(
                chart_type="histogram",
                x=FieldRef(column=num.name, cast_as=num_cast, bins=30),
                aggregation="count",
                title=f"Distribution of {num.name}",
            ),
            f"hist_{num.name}",
        )

    # Rule 7: Two numeric columns -> Scatter plot
    if len(numerics) >= 2:
        x_num = numerics[0]
        y_num = numerics[1]
        x_cast = "number" if x_num.type.upper() == "VARCHAR" else None
        y_cast = "number" if y_num.type.upper() == "VARCHAR" else None
        add_spec(
            ChartSpec(
                chart_type="scatter",
                x=FieldRef(column=x_num.name, cast_as=x_cast),
                y=FieldRef(column=y_num.name, cast_as=y_cast),
                title=f"{x_num.name} vs. {y_num.name}",
            ),
            f"scatter_{x_num.name}_{y_num.name}",
        )

    # Rule 8: Low-cardinality boolean / categorical -> Pie
    if booleans:
        b_col = booleans[0]
        add_spec(
            ChartSpec(
                chart_type="pie",
                x=FieldRef(column=b_col.name),
                aggregation="count",
                top_n=6,
                title=f"Breakdown by {b_col.name}",
            ),
            f"pie_{b_col.name}",
        )

    return suggestions[:max_suggestions]
