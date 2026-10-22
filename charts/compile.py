"""Safe SQL compiler for ChartSpec into parameterized DuckDB queries.

Security guarantees:
1. Pure function: compile_spec(spec, schema, limits) -> (sql, params, notes, warnings)
2. All column identifiers are verified against the validated schema and escaped with double quotes.
3. All filter values are bound as parameters ('?'), never string interpolated.
4. Aggregations and time buckets are resolved from fixed mapping dictionaries.
5. All queries have a strict LIMIT cap as a safety net.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple

from charts.errors import InvalidChartSpecError
from charts.limits import ChartLimits
from charts.spec import ChartSpec, FieldRef, Filter, validate_spec


def quote_identifier(col: str) -> str:
    """Safely quote a SQL identifier, escaping any internal double quotes."""
    escaped = col.replace('"', '""')
    return f'"{escaped}"'


def _render_field_expr(field_ref: FieldRef, schema: Dict[str, str]) -> Tuple[str, Optional[str]]:
    """Render a column reference into SQL with optional TRY_CAST and time_bucket.
    
    Returns (sql_expr, failure_count_sql_expr).
    """
    col_quoted = quote_identifier(field_ref.column)

    # 1. Cast expression
    if field_ref.cast_as == "number":
        expr = f"TRY_CAST({col_quoted} AS DOUBLE)"
        fail_expr = f"SUM(CASE WHEN {col_quoted} IS NOT NULL AND TRY_CAST({col_quoted} AS DOUBLE) IS NULL THEN 1 ELSE 0 END)"
    elif field_ref.cast_as == "date":
        expr = f"TRY_CAST({col_quoted} AS DATE)"
        fail_expr = f"SUM(CASE WHEN {col_quoted} IS NOT NULL AND TRY_CAST({col_quoted} AS DATE) IS NULL THEN 1 ELSE 0 END)"
    elif field_ref.cast_as == "timestamp":
        expr = f"TRY_CAST({col_quoted} AS TIMESTAMP)"
        fail_expr = f"SUM(CASE WHEN {col_quoted} IS NOT NULL AND TRY_CAST({col_quoted} AS TIMESTAMP) IS NULL THEN 1 ELSE 0 END)"
    elif field_ref.cast_as == "text":
        expr = f"CAST({col_quoted} AS VARCHAR)"
        fail_expr = None
    else:
        expr = col_quoted
        fail_expr = None

    # 2. Time bucket expression
    if field_ref.time_bucket:
        tb = field_ref.time_bucket
        if tb == "hour":
            expr = f"date_trunc('hour', {expr})"
        elif tb == "day":
            expr = f"date_trunc('day', {expr})"
        elif tb == "week":
            expr = f"date_trunc('week', {expr})"
        elif tb == "month":
            expr = f"date_trunc('month', {expr})"
        elif tb == "quarter":
            expr = f"date_trunc('quarter', {expr})"
        elif tb == "year":
            expr = f"date_trunc('year', {expr})"
        elif tb == "hour_of_day":
            expr = f"EXTRACT(HOUR FROM {expr})"
        elif tb == "day_of_week":
            expr = f"EXTRACT(DOW FROM {expr})"

    return expr, fail_expr


def _render_agg_expr(agg: str, expr: str) -> str:
    """Render aggregate expression."""
    if agg == "count":
        return f"COUNT({expr})" if expr != "*" else "COUNT(*)"
    if agg == "count_distinct":
        return f"COUNT(DISTINCT {expr})"
    if agg == "sum":
        return f"SUM({expr})"
    if agg == "avg":
        return f"AVG({expr})"
    if agg == "min":
        return f"MIN({expr})"
    if agg == "max":
        return f"MAX({expr})"
    if agg == "median":
        return f"MEDIAN({expr})"
    if agg == "none":
        return expr
    return f"COUNT(*)"


def compile_spec(
    spec: ChartSpec,
    schema: Dict[str, str],
    limits: Optional[ChartLimits] = None,
) -> Tuple[str, List[Any], List[str]]:
    """Compile a ChartSpec into a parameterized SQL statement, parameter list, and user notes.
    
    Args:
        spec: Validated ChartSpec
        schema: Mapping from column name to DuckDB type
        limits: Optional limits instance
        
    Returns:
        (sql_query, bound_parameters, notes)
    """
    lim = limits or ChartLimits()
    validate_spec(spec, schema, limits=lim)

    params: List[Any] = []
    notes: List[str] = []
    where_clauses: List[str] = []

    # Process filters
    for f in spec.filters:
        col_q = quote_identifier(f.column)
        if f.op == "is_null":
            where_clauses.append(f"{col_q} IS NULL")
        elif f.op == "not_null":
            where_clauses.append(f"{col_q} IS NOT NULL")
        elif f.op == "in":
            assert isinstance(f.value, list)
            placeholders = ", ".join(["?"] * len(f.value))
            where_clauses.append(f"{col_q} IN ({placeholders})")
            params.extend(f.value)
        elif f.op == "between":
            assert isinstance(f.value, list) and len(f.value) == 2
            where_clauses.append(f"{col_q} BETWEEN ? AND ?")
            params.extend(f.value)
        elif f.op in ("=", "!=", "<", "<=", ">", ">="):
            where_clauses.append(f"{col_q} {f.op} ?")
            params.append(f.value)

    # Exclude nulls toggle
    if spec.exclude_nulls:
        if spec.x:
            where_clauses.append(f"{quote_identifier(spec.x.column)} IS NOT NULL")
        if spec.y:
            where_clauses.append(f"{quote_identifier(spec.y.column)} IS NOT NULL")
        notes.append("Excluded missing (null) values from chart.")

    # Hide outliers toggle (for numeric y)
    if spec.hide_outliers and spec.y:
        y_q = quote_identifier(spec.y.column)
        # Note in chart annotations
        notes.append(f"Trimmed 1st..99th percentile outliers on '{spec.y.column}'.")
        where_clauses.append(
            f"{y_q} >= (SELECT quantile_cont({y_q}, 0.01) FROM data) AND {y_q} <= (SELECT quantile_cont({y_q}, 0.99) FROM data)"
        )

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    ctype = spec.chart_type

    # 1. BIG NUMBER
    if ctype == "big_number":
        y_expr = quote_identifier(spec.y.column) if spec.y else "*"
        agg_sql = _render_agg_expr(spec.aggregation, y_expr)
        sql = f"SELECT {agg_sql} AS value FROM data {where_sql} LIMIT 1"
        return sql, params, notes

    # 2. HISTOGRAM
    if ctype == "histogram":
        assert spec.x is not None
        bins = spec.x.bins or lim.histogram_default_bins
        bins = min(max(5, bins), lim.histogram_max_bins)
        x_expr, _ = _render_field_expr(spec.x, schema)
        
        # We compute histogram buckets in DuckDB using width_bucket
        non_null_where = f"{x_expr} IS NOT NULL"
        combined_where = f"WHERE ({non_null_where})" + (f" AND ({' AND '.join(where_clauses)})" if where_clauses else "")
        
        sql = f"""
WITH stats AS (
    SELECT MIN({x_expr}) AS min_v, MAX({x_expr}) AS max_v
    FROM data
    {combined_where}
),
binned AS (
    SELECT 
        CASE 
            WHEN s.max_v = s.min_v THEN 1
            ELSE LEAST({bins}, GREATEST(1, CAST(FLOOR(({x_expr} - s.min_v) / NULLIF((s.max_v - s.min_v) / {bins}, 0)) + 1 AS INT)))
        END AS bucket,
        s.min_v,
        s.max_v,
        CASE WHEN s.max_v = s.min_v THEN 0 ELSE (s.max_v - s.min_v) / {bins} END AS step
    FROM data d
    CROSS JOIN stats s
    {combined_where}
)
SELECT 
    ROUND(min_v + (bucket - 1) * step, 4) AS bin_start,
    ROUND(min_v + bucket * step, 4) AS bin_end,
    COUNT(*) AS count
FROM binned
GROUP BY bucket, min_v, max_v, step
ORDER BY bucket ASC
LIMIT {bins + 5}
""".strip()
        notes.append(f"Grouped into {bins} numeric bins.")
        return sql, params, notes

    # 3. SCATTER PLOT (Sampled)
    if ctype == "scatter":
        assert spec.x is not None and spec.y is not None
        sample_size = lim.scatter_sample_size
        x_expr, _ = _render_field_expr(spec.x, schema)
        y_expr, _ = _render_field_expr(spec.y, schema)
        
        # Color column if present
        color_select = f", {quote_identifier(spec.color.column)} AS color" if spec.color else ""
        
        sql = f"""
SELECT {x_expr} AS x, {y_expr} AS y{color_select}
FROM data USING SAMPLE {sample_size} (reservoir, 42)
{where_sql}
LIMIT {sample_size}
""".strip()
        notes.append(f"Sampled {sample_size:,} points (repeatable seed 42) for interactive performance.")
        return sql, params, notes

    # 4. BOX PLOT
    if ctype == "box":
        assert spec.y is not None
        y_expr, _ = _render_field_expr(spec.y, schema)
        
        if spec.x:
            x_expr, _ = _render_field_expr(spec.x, schema)
            top_n = spec.top_n or 15
            sql = f"""
SELECT 
    {x_expr} AS category,
    COUNT(*) AS n,
    MIN({y_expr}) AS min,
    quantile_cont({y_expr}, 0.25) AS q1,
    MEDIAN({y_expr}) AS median,
    quantile_cont({y_expr}, 0.75) AS q3,
    MAX({y_expr}) AS max
FROM data
{where_sql}
GROUP BY {x_expr}
ORDER BY n DESC
LIMIT {top_n}
""".strip()
            notes.append(f"Computed five-number summary for top {top_n} categories.")
        else:
            sql = f"""
SELECT 
    'All Data' AS category,
    COUNT(*) AS n,
    MIN({y_expr}) AS min,
    quantile_cont({y_expr}, 0.25) AS q1,
    MEDIAN({y_expr}) AS median,
    quantile_cont({y_expr}, 0.75) AS q3,
    MAX({y_expr}) AS max
FROM data
{where_sql}
LIMIT 1
""".strip()
            notes.append("Computed five-number summary across entire dataset.")
            
        return sql, params, notes

    # 5. HEATMAP
    if ctype == "heatmap":
        assert spec.x is not None and spec.y is not None
        x_expr, _ = _render_field_expr(spec.x, schema)
        y_expr, _ = _render_field_expr(spec.y, schema)
        max_cells = lim.heatmap_max_cells
        
        sql = f"""
SELECT 
    {x_expr} AS x,
    {y_expr} AS y,
    COUNT(*) AS value
FROM data
{where_sql}
GROUP BY {x_expr}, {y_expr}
ORDER BY value DESC
LIMIT {max_cells}
""".strip()
        notes.append(f"Aggregated top {max_cells} heatmap cells.")
        return sql, params, notes

    # 6. BAR / HBAR / PIE
    if ctype in ("bar", "hbar", "pie"):
        assert spec.x is not None
        x_expr, _ = _render_field_expr(spec.x, schema)
        y_col_expr = quote_identifier(spec.y.column) if spec.y else "*"
        agg_sql = _render_agg_expr(spec.aggregation, y_col_expr)
        
        top_n = spec.top_n or (lim.max_pie_slices if ctype == "pie" else 20)
        top_n = min(top_n, lim.max_pie_slices if ctype == "pie" else lim.max_categories_bar)

        order_by = {
            "y_desc": "value DESC",
            "y_asc": "value ASC",
            "x": "category ASC",
        }.get(spec.sort, "value DESC")

        # Color grouping if specified and not pie
        if spec.color and ctype != "pie":
            color_expr = quote_identifier(spec.color.column)
            sql = f"""
SELECT 
    {x_expr} AS category,
    {color_expr} AS color_group,
    {agg_sql} AS value
FROM data
{where_sql}
GROUP BY {x_expr}, {color_expr}
ORDER BY {order_by}
LIMIT {top_n * lim.max_series_color}
""".strip()
            notes.append(f"Grouped by '{spec.x.column}' and '{spec.color.column}'.")
            return sql, params, notes

        # Standard bar/pie with Top N and "Other" bucket
        sql = f"""
WITH ranked AS (
    SELECT 
        COALESCE(CAST({x_expr} AS VARCHAR), '(Null)') AS category,
        {agg_sql} AS value,
        ROW_NUMBER() OVER (ORDER BY {agg_sql} DESC) AS rnk
    FROM data
    {where_sql}
    GROUP BY category
),
top_rows AS (
    SELECT category, value FROM ranked WHERE rnk <= {top_n}
),
other_row AS (
    SELECT 'Other' AS category, SUM(value) AS value
    FROM ranked
    WHERE rnk > {top_n}
    HAVING COUNT(*) > 0
)
SELECT category, value FROM top_rows
UNION ALL
SELECT category, value FROM other_row
LIMIT {top_n + 1}
""".strip()
        notes.append(f"Top {top_n} categories shown; remaining grouped into 'Other'.")
        return sql, params, notes

    # 7. LINE / AREA
    if ctype in ("line", "area"):
        assert spec.x is not None
        x_expr, _ = _render_field_expr(spec.x, schema)
        y_col_expr = quote_identifier(spec.y.column) if spec.y else "*"
        agg_sql = _render_agg_expr(spec.aggregation, y_col_expr)
        
        max_points = lim.max_points_line
        color_expr = f", {quote_identifier(spec.color.column)} AS series" if spec.color else ""
        group_by = f"GROUP BY {x_expr}" + (f", {quote_identifier(spec.color.column)}" if spec.color else "")
        order_by = f"ORDER BY {x_expr} ASC"

        sql = f"""
SELECT 
    {x_expr} AS x{color_expr},
    {agg_sql} AS y
FROM data
{where_sql}
{group_by}
{order_by}
LIMIT {max_points}
""".strip()
        notes.append(f"Capped at {max_points:,} chronological data points.")
        return sql, params, notes

    raise InvalidChartSpecError(f"Unsupported chart type '{ctype}'.")
