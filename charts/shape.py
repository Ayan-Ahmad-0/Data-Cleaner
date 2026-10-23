"""Chart suggestions from in-memory QueryResult shapes (Section 13 of spec).

Requires no database access; inspects columns, data types, and row count of existing results.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, List, Optional

from charts.spec import ChartSpec, FieldRef


@dataclass
class ChartSuggestion:
    spec: Optional[ChartSpec]
    reason: str
    can_chart: bool = True
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "spec": self.spec.model_dump() if self.spec else None,
            "reason": self.reason,
            "can_chart": self.can_chart,
            "warnings": self.warnings,
        }


def is_duckdb_numeric(col_type: str) -> bool:
    t = col_type.upper()
    return any(t.startswith(p) for p in (
        "INT", "BIGINT", "SMALLINT", "TINYINT", "HUGEINT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL"
    ))


def is_duckdb_datetime(col_type: str) -> bool:
    t = col_type.upper()
    return any(kw in t for kw in ("DATE", "TIME", "TIMESTAMP"))


def chart_from_result(
    columns: List[dict],
    rows: List[List[Any]],
    truncated: bool = False,
) -> ChartSuggestion:
    """Propose an instant chart specification based solely on the shape of a QueryResult.
    
    Rules (Section 13):
    1. 1 row, 1 numeric column: big number.
    2. 1 categorical + 1 numeric column: bar (or pie when 6 or fewer rows).
    3. 1 date/time + 1 or more numeric columns: line (one series per numeric column).
    4. 2 numeric columns: horizontal bar.
    5. 1 numeric column only: histogram (if not truncated).
    6. 2 categorical + 1 numeric: grouped bar or heatmap.
    7. Otherwise: manual selection.
    """
    warnings: List[str] = []
    if truncated:
        warnings.append("Chart shows the first returned rows only. Aggregate in SQL for a full-data chart.")

    if not columns or len(columns) == 0:
        return ChartSuggestion(spec=None, reason="Result has no columns.", can_chart=False, warnings=warnings)

    num_rows = len(rows)
    col_names = [c.get("name", f"col_{i}") for i, c in enumerate(columns)]
    col_types = [c.get("type", "VARCHAR") for c in columns]

    num_cols = [col_names[i] for i, t in enumerate(col_types) if is_duckdb_numeric(t)]
    dt_cols = [col_names[i] for i, t in enumerate(col_types) if is_duckdb_datetime(t)]
    cat_cols = [col_names[i] for i, t in enumerate(col_types) if not is_duckdb_numeric(t) and not is_duckdb_datetime(t)]

    # 1. 1 row, 1 numeric column: Big Number
    if num_rows == 1 and len(num_cols) == 1 and len(columns) == 1:
        spec = ChartSpec(
            chart_type="big_number",
            y=FieldRef(column=num_cols[0]),
            aggregation="sum",
            title=num_cols[0],
        )
        return ChartSuggestion(spec=spec, reason="Single metric value detected.", warnings=warnings)

    # 2. 1 Date + 1 or more Numeric: Line
    if len(dt_cols) == 1 and len(num_cols) >= 1:
        spec = ChartSpec(
            chart_type="line",
            x=FieldRef(column=dt_cols[0]),
            y=FieldRef(column=num_cols[0]),
            aggregation="none",
            title=f"{num_cols[0]} over {dt_cols[0]}",
        )
        return ChartSuggestion(spec=spec, reason="Time series detected.", warnings=warnings)

    # 3. 1 Categorical + 1 Numeric: Bar (or Pie if <= 6 rows)
    if len(cat_cols) == 1 and len(num_cols) == 1:
        cat_name = cat_cols[0]
        num_name = num_cols[0]
        chart_type = "pie" if (num_rows <= 6 and num_rows > 1) else "bar"
        spec = ChartSpec(
            chart_type=chart_type,
            x=FieldRef(column=cat_name),
            y=FieldRef(column=num_name),
            aggregation="none",
            title=f"{num_name} by {cat_name}",
        )
        return ChartSuggestion(
            spec=spec,
            reason=f"Breakdown of {num_name} across {cat_name}.",
            warnings=warnings,
        )

    # 4. 2 Numeric columns: Horizontal Bar
    if len(num_cols) == 2 and len(columns) == 2:
        spec = ChartSpec(
            chart_type="hbar",
            x=FieldRef(column=num_cols[0]),
            y=FieldRef(column=num_cols[1]),
            aggregation="none",
            sort="y_desc",
            title=f"{num_cols[1]} by {num_cols[0]}",
        )
        return ChartSuggestion(spec=spec, reason="Horizontal bar ranking of two numeric variables.", warnings=warnings)

    # 5. 1 Numeric column only: Histogram
    if len(num_cols) == 1 and len(columns) == 1:
        if truncated:
            warnings.append("Result is truncated; histogram may not represent full distribution.")
        spec = ChartSpec(
            chart_type="histogram",
            x=FieldRef(column=num_cols[0]),
            aggregation="count",
            title=f"Distribution of {num_cols[0]}",
        )
        return ChartSuggestion(spec=spec, reason="Single numeric column distribution.", warnings=warnings)

    # 6. 2 Categorical + 1 Numeric: Heatmap or Bar with color
    if len(cat_cols) == 2 and len(num_cols) == 1:
        spec = ChartSpec(
            chart_type="bar",
            x=FieldRef(column=cat_cols[0]),
            y=FieldRef(column=num_cols[0]),
            color=FieldRef(column=cat_cols[1]),
            aggregation="none",
            title=f"{num_cols[0]} by {cat_cols[0]} and {cat_cols[1]}",
        )
        return ChartSuggestion(spec=spec, reason="Two category dimensions with numeric metric.", warnings=warnings)

    # Fallback: Let user select axes
    return ChartSuggestion(
        spec=None,
        reason="Multiple dimensions detected; please select axes manually.",
        can_chart=True,
        warnings=warnings,
    )
