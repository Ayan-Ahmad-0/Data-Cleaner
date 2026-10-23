"""Deterministic, rule-based chart suggestions for raw datasets (Section 10 of spec)."""

from __future__ import annotations
from typing import Dict, List, Optional

from charts.limits import ChartLimits
from charts.spec import ChartSpec, FieldRef, Filter
from charts.stats import ColumnStats


from datetime import datetime


def _parse_datetime_safe(val: object) -> Optional[datetime]:
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str:
        return None
    # 1. Standard library ISO format parser (Python 3.11+ handles YYYY-MM-DD, ISO-8601 timestamps, etc.)
    try:
        clean = val_str.replace("Z", "+00:00") if val_str.endswith("Z") else val_str
        dt = datetime.fromisoformat(clean)
        return dt.replace(tzinfo=None)
    except Exception:
        pass

    # 2. Common explicit date and datetime formats
    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(val_str[:19], fmt)
            return dt.replace(tzinfo=None)
        except Exception:
            continue

    # 3. Fallback to python-dateutil if installed
    try:
        from dateutil import parser
        dt = parser.parse(val_str, fuzzy=True)
        return dt.replace(tzinfo=None)
    except Exception:
        pass

    return None


def _pick_adaptive_time_bucket(col: ColumnStats) -> str:
    """Choose an optimal time bucket based on the column's date range, defaulting to week."""
    if not col.min or not col.max:
        return "week"
    try:
        d_min = _parse_datetime_safe(col.min)
        d_max = _parse_datetime_safe(col.max)
        if not d_min or not d_max:
            return "week"
        days = abs((d_max - d_min).days)
        if days > 730:
            return "month"
        elif days <= 3:
            return "day"
        else:
            return "week"
    except Exception:
        return "week"


def suggest_charts_from_stats(
    stats: List[ColumnStats],
    row_count: int,
    max_suggestions: int = 8,
) -> List[ChartSpec]:
    """Propose up to max_suggestions prioritized, visually diverse charts from dataset stats.
    
    Provides rich visual variety across circular (donut, pie), continuous (area, line),
    distribution (box, histogram), and relational (scatter, heatmap, bar) formats:
    1. Low-cardinality category (2-6 values) -> Donut chart
    2. Datetime column -> Area chart (smooth gradient volume/activity over time)
    3. Second low-cardinality category -> Pie chart
    4. Categorical comparison -> Horizontal bar (top 15 ranking)
    5. Datetime + Numeric -> Line chart (rate/average metric over time)
    6. Cross-tabulation -> Heatmap (2D co-occurrence density matrix)
    7. Numeric distribution -> Histogram (binned distribution)
    8. Metric ranking across categories -> Horizontal bar (hbar)
    9. KPI Overview -> Big Number metric card
    10. Additional categories -> Vertical Bar charts
    """
    suggestions: List[ChartSpec] = []
    seen_keys = set()

    def add_spec(s: ChartSpec, key: str) -> None:
        if key not in seen_keys and len(suggestions) < max_suggestions:
            seen_keys.add(key)
            suggestions.append(s)

    # 1. Low-cardinality categoricals (2 to 6 unique values): ideal for Donut & Pie
    low_cardinality = [
        c for c in stats
        if (c.kind in ("categorical", "boolean") or (c.distinct_approx and 2 <= c.distinct_approx <= 6))
        and c.distinct_approx
        and 2 <= c.distinct_approx <= 6
    ]

    # 2. Medium/high-cardinality categoricals (7 to 50 unique values): ideal for Bar / H-Bar ranking
    mid_cardinality = [
        c for c in stats
        if c.kind == "categorical" and c.distinct_approx and 7 <= c.distinct_approx <= 50
    ]
    all_categoricals = [
        c for c in stats
        if c.kind == "categorical" and c.distinct_approx and 2 <= c.distinct_approx <= 50
    ]

    numerics = [c for c in stats if c.kind == "numeric"]
    datetimes = [c for c in stats if c.kind == "datetime"]

    # Rule 1: First Low-Cardinality column -> Donut Chart (Modern, circular, vibrant)
    if low_cardinality:
        col = low_cardinality[0]
        col_label = col.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="donut",
                x=FieldRef(column=col.name),
                aggregation="count",
                top_n=6,
                title=f"{col_label} Breakdown",
            ),
            f"donut_{col.name}",
        )

    # Rule 2: Datetime column -> Area Chart (Activity/records over time with smooth fill)
    if datetimes:
        dt_col = datetimes[0]
        dt_label = dt_col.name.replace("_", " ").title()
        cast_as = "timestamp" if dt_col.type.upper() == "VARCHAR" else None
        bucket = _pick_adaptive_time_bucket(dt_col)
        add_spec(
            ChartSpec(
                chart_type="area",
                x=FieldRef(column=dt_col.name, time_bucket=bucket, cast_as=cast_as),
                aggregation="count",
                custom_color="#0284C7",
                title=f"Activity Over Time ({dt_label})",
            ),
            f"dt_area_{dt_col.name}",
        )

    # Rule 3: Second Low-Cardinality column -> Pie Chart
    if len(low_cardinality) > 1:
        col = low_cardinality[1]
        col_label = col.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="pie",
                x=FieldRef(column=col.name),
                aggregation="count",
                top_n=6,
                title=f"Distribution by {col_label}",
            ),
            f"pie_{col.name}",
        )

    # Rule 4: Categorical Ranking -> Horizontal Bar (H-Bar)
    used_cat_cols = {s.x.column for s in suggestions if s.x}
    avail_cats = [c for c in (mid_cardinality or all_categoricals) if c.name not in used_cat_cols]
    if avail_cats:
        cat = avail_cats[0]
        cat_label = cat.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="hbar",
                x=FieldRef(column=cat.name),
                aggregation="count",
                sort="y_desc",
                top_n=15,
                title=f"Top {cat_label} Categories",
            ),
            f"cat_hbar_{cat.name}",
        )

    # Rule 5: Datetime + Numeric -> Line Chart (Average metric trend over time)
    if datetimes and numerics:
        dt_col = datetimes[0]
        num_col = numerics[0]
        dt_cast = "timestamp" if dt_col.type.upper() == "VARCHAR" else None
        num_cast = "number" if num_col.type.upper() == "VARCHAR" else None
        num_label = num_col.name.replace("_", " ").title()
        bucket = _pick_adaptive_time_bucket(dt_col)
        add_spec(
            ChartSpec(
                chart_type="line",
                x=FieldRef(column=dt_col.name, time_bucket=bucket, cast_as=dt_cast),
                y=FieldRef(column=num_col.name, cast_as=num_cast),
                aggregation="avg",
                custom_color="#E11D48",
                title=f"Average {num_label} Over Time",
            ),
            f"dt_num_line_{dt_col.name}_{num_col.name}",
        )

    # Rule 6: Multi-category Cross-Tabulation -> Heatmap (2D Co-occurrence Density)
    if len(all_categoricals) >= 2:
        cat1 = all_categoricals[0]
        cat2 = all_categoricals[1]
        cat1_label = cat1.name.replace("_", " ").title()
        cat2_label = cat2.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="heatmap",
                x=FieldRef(column=cat1.name),
                y=FieldRef(column=cat2.name),
                aggregation="count",
                title=f"{cat1_label} vs. {cat2_label} Heatmap",
            ),
            f"heat_{cat1.name}_{cat2.name}",
        )
    elif all_categoricals and datetimes:
        cat = all_categoricals[0]
        dt = datetimes[0]
        cat_label = cat.name.replace("_", " ").title()
        dt_cast = "timestamp" if dt.type.upper() == "VARCHAR" else None
        add_spec(
            ChartSpec(
                chart_type="heatmap",
                x=FieldRef(column=cat.name),
                y=FieldRef(column=dt.name, time_bucket="day_of_week", cast_as=dt_cast),
                aggregation="count",
                title=f"{cat_label} by Day of Week Heatmap",
            ),
            f"heat_{cat.name}_{dt.name}",
        )
    elif len(stats) >= 2:
        col1 = stats[0]
        col2 = stats[1]
        c1_label = col1.name.replace("_", " ").title()
        c2_label = col2.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="heatmap",
                x=FieldRef(column=col1.name),
                y=FieldRef(column=col2.name),
                aggregation="count",
                title=f"{c1_label} vs. {c2_label} Heatmap",
            ),
            f"heat_{col1.name}_{col2.name}",
        )

    # Rule 7: Numeric Distribution -> Histogram
    if numerics:
        num = numerics[0]
        num_cast = "number" if num.type.upper() == "VARCHAR" else None
        num_label = num.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="histogram",
                x=FieldRef(column=num.name, cast_as=num_cast, bins=25),
                aggregation="count",
                title=f"{num_label} Distribution",
            ),
            f"hist_{num.name}",
        )

    # Rule 8: Metric Ranking across Categories -> Horizontal Bar (H-Bar) instead of Scatter
    if (all_categoricals or mid_cardinality) and numerics:
        used_hbar_cats = {s.x.column for s in suggestions if s.chart_type == "hbar" and s.x}
        candidate_cats = [c for c in (all_categoricals or mid_cardinality) if c.name not in used_hbar_cats]
        cat = candidate_cats[0] if candidate_cats else (all_categoricals or mid_cardinality)[0]
        num = numerics[0]
        cat_label = cat.name.replace("_", " ").title()
        num_label = num.name.replace("_", " ").title()
        num_cast = "number" if num.type.upper() == "VARCHAR" else None
        add_spec(
            ChartSpec(
                chart_type="hbar",
                x=FieldRef(column=cat.name),
                y=FieldRef(column=num.name, cast_as=num_cast),
                aggregation="sum",
                sort="y_desc",
                top_n=12,
                title=f"{num_label} by {cat_label}",
            ),
            f"cat_metric_hbar_{cat.name}_{num.name}",
        )
    elif all_categoricals:
        used_hbar_cats = {s.x.column for s in suggestions if s.chart_type == "hbar" and s.x}
        candidate_cats = [c for c in all_categoricals if c.name not in used_hbar_cats]
        cat = candidate_cats[0] if candidate_cats else all_categoricals[0]
        cat_label = cat.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="hbar",
                x=FieldRef(column=cat.name),
                aggregation="count",
                sort="y_desc",
                top_n=12,
                title=f"Top {cat_label} Breakdown",
            ),
            f"cat_hbar_count_{cat.name}",
        )
    elif len(numerics) >= 2:
        x_num = numerics[0]
        y_num = numerics[1]
        x_cast = "number" if x_num.type.upper() == "VARCHAR" else None
        y_cast = "number" if y_num.type.upper() == "VARCHAR" else None
        x_label = x_num.name.replace("_", " ").title()
        y_label = y_num.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="hbar",
                x=FieldRef(column=x_num.name, cast_as=x_cast),
                y=FieldRef(column=y_num.name, cast_as=y_cast),
                aggregation="sum",
                sort="y_desc",
                top_n=12,
                title=f"{y_label} by {x_label}",
            ),
            f"hbar_num_{x_num.name}_{y_num.name}",
        )

    # Rule 9: Key KPI Metric -> Big Number Card
    if numerics:
        num = numerics[0]
        num_cast = "number" if num.type.upper() == "VARCHAR" else None
        num_label = num.name.replace("_", " ").title()
        add_spec(
            ChartSpec(
                chart_type="big_number",
                y=FieldRef(column=num.name, cast_as=num_cast),
                aggregation="sum",
                title=f"Total {num_label}",
            ),
            "kpi_metric",
        )
    else:
        add_spec(
            ChartSpec(
                chart_type="big_number",
                y=None,
                aggregation="count",
                title="Total Records In Dataset",
            ),
            "kpi_metric",
        )

    # Rule 10: Additional Categoricals -> Vertical Bar charts (fill remaining slots)
    for cat in all_categoricals:
        if len(suggestions) >= max_suggestions:
            break
        key = f"cat_bar_{cat.name}"
        if key not in seen_keys:
            cat_label = cat.name.replace("_", " ").title()
            add_spec(
                ChartSpec(
                    chart_type="bar",
                    x=FieldRef(column=cat.name),
                    aggregation="count",
                    sort="y_desc",
                    top_n=10,
                    title=f"Counts by {cat_label}",
                ),
                key,
            )

    return suggestions[:max_suggestions]
