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


def _is_numeric_type_str(col_type: str) -> bool:
    """Check if DuckDB column type string represents a numeric type."""
    t = col_type.upper()
    return any(k in t for k in ("INT", "DOUBLE", "FLOAT", "DECIMAL", "REAL", "NUMERIC", "HUGEINT"))


def _is_datetime_type_str(col_type: str) -> bool:
    """Check if DuckDB column type string represents a date or timestamp type."""
    t = col_type.upper()
    return any(k in t for k in ("DATE", "TIME", "TIMESTAMP"))


def _render_field_expr(field_ref: FieldRef, schema: Dict[str, str]) -> Tuple[str, Optional[str]]:
    """Render a column reference into SQL with optional TRY_CAST and time_bucket.
    
    Returns (sql_expr, failure_count_sql_expr).
    """
    col_quoted = quote_identifier(field_ref.column)
    col_type = schema.get(field_ref.column, "")

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
        # If the column is not already date/timestamp, cast to TIMESTAMP first
        if not field_ref.cast_as and not _is_datetime_type_str(col_type):
            expr = f"TRY_CAST({expr} AS TIMESTAMP)"

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


def _render_y_expr(field_ref: Optional[FieldRef], schema: Dict[str, str], agg: str) -> str:
    """Render the Y-axis column expression, ensuring TRY_CAST to DOUBLE if aggregating numerically."""
    if not field_ref:
        return "*"
    expr, _ = _render_field_expr(field_ref, schema)
    if agg in ("avg", "sum", "median"):
        col_type = schema.get(field_ref.column, "")
        if not _is_numeric_type_str(col_type) or field_ref.cast_as == "number":
            col_quoted = quote_identifier(field_ref.column)
            expr = f"TRY_CAST({col_quoted} AS DOUBLE)"
    return expr


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
    if spec.chart_type in ("pie", "donut"):
        if spec.top_n and spec.top_n > lim.max_pie_slices:
            spec.top_n = lim.max_pie_slices
        elif not spec.top_n:
            spec.top_n = lim.max_pie_slices
        if spec.aggregation == "none":
            spec.aggregation = "count"
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
        col_type = schema.get(spec.y.column, "")
        if not _is_numeric_type_str(col_type) or spec.y.cast_as == "number":
            y_eval = f"TRY_CAST({quote_identifier(spec.y.column)} AS DOUBLE)"
        else:
            y_eval = quote_identifier(spec.y.column)
        notes.append(f"Trimmed 1st..99th percentile outliers on '{spec.y.column}'.")
        where_clauses.append(
            f"({y_eval} IS NOT NULL AND {y_eval} >= (SELECT quantile_cont({y_eval}, 0.01) FROM data WHERE {y_eval} IS NOT NULL) AND {y_eval} <= (SELECT quantile_cont({y_eval}, 0.99) FROM data WHERE {y_eval} IS NOT NULL))"
        )

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    ctype = spec.chart_type

    # 1. BIG NUMBER
    if ctype == "big_number":
        y_expr = _render_y_expr(spec.y, schema, spec.aggregation)
        agg_sql = _render_agg_expr(spec.aggregation, y_expr)
        sql = f"SELECT {agg_sql} AS value FROM data {where_sql} LIMIT 1"
        return sql, params, notes

    # 2. HISTOGRAM
    if ctype == "histogram":
        assert spec.x is not None
        bins = spec.x.bins or lim.histogram_default_bins
        bins = min(max(5, bins), lim.histogram_max_bins)
        x_expr, _ = _render_field_expr(spec.x, schema)
        if not _is_numeric_type_str(schema.get(spec.x.column, "")) or spec.x.cast_as == "number":
            x_expr = f"TRY_CAST({quote_identifier(spec.x.column)} AS DOUBLE)"
        
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
        if not _is_numeric_type_str(schema.get(spec.x.column, "")) or spec.x.cast_as == "number":
            x_expr = f"TRY_CAST({quote_identifier(spec.x.column)} AS DOUBLE)"
        if not _is_numeric_type_str(schema.get(spec.y.column, "")) or spec.y.cast_as == "number":
            y_expr = f"TRY_CAST({quote_identifier(spec.y.column)} AS DOUBLE)"
        
        # Color column if present
        color_select = f", {quote_identifier(spec.color.column)} AS color" if spec.color else ""
        
        scatter_where = list(where_clauses)
        scatter_where.append(f"{x_expr} IS NOT NULL")
        scatter_where.append(f"{y_expr} IS NOT NULL")
        scatter_where_sql = "WHERE " + " AND ".join(scatter_where)

        sql = f"""
SELECT {x_expr} AS x, {y_expr} AS y{color_select}
FROM data USING SAMPLE {sample_size} (reservoir, 42)
{scatter_where_sql}
LIMIT {sample_size}
""".strip()
        notes.append(f"Sampled {sample_size:,} points (repeatable seed 42) for interactive performance.")
        return sql, params, notes

    # 4. BOX PLOT
    if ctype == "box":
        assert spec.y is not None
        y_expr, _ = _render_field_expr(spec.y, schema)
        if not _is_numeric_type_str(schema.get(spec.y.column, "")) or spec.y.cast_as == "number":
            y_expr = f"TRY_CAST({quote_identifier(spec.y.column)} AS DOUBLE)"
        
        box_where = list(where_clauses)
        box_where.append(f"{y_expr} IS NOT NULL")

        if spec.x:
            x_expr, _ = _render_field_expr(spec.x, schema)
            box_where.append(f"{x_expr} IS NOT NULL")
            box_where_sql = "WHERE " + " AND ".join(box_where)
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
{box_where_sql}
GROUP BY 1
ORDER BY n DESC
LIMIT {top_n}
""".strip()
            notes.append(f"Computed five-number summary for top {top_n} categories.")
        else:
            box_where_sql = "WHERE " + " AND ".join(box_where)
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
{box_where_sql}
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
        
        heat_where = list(where_clauses)
        heat_where.append(f"{x_expr} IS NOT NULL")
        heat_where.append(f"{y_expr} IS NOT NULL")
        heat_where_sql = "WHERE " + " AND ".join(heat_where)

        sql = f"""
SELECT 
    {x_expr} AS x,
    {y_expr} AS y,
    COUNT(*) AS value
FROM data
{heat_where_sql}
GROUP BY 1, 2
ORDER BY value DESC
LIMIT {max_cells}
""".strip()
        notes.append(f"Aggregated top {max_cells} heatmap cells.")
        return sql, params, notes

    # 6. BAR / HBAR / PIE / DONUT
    if ctype in ("bar", "hbar", "pie", "donut"):
        assert spec.x is not None
        x_expr, _ = _render_field_expr(spec.x, schema)
        y_expr = _render_y_expr(spec.y, schema, spec.aggregation)
        agg_sql = _render_agg_expr(spec.aggregation, y_expr)
        
        is_pie_like = ctype in ("pie", "donut")
        top_n = spec.top_n or (lim.max_pie_slices if is_pie_like else 20)
        top_n = min(top_n, lim.max_pie_slices if is_pie_like else lim.max_categories_bar)

        order_by = {
            "y_desc": "value DESC",
            "y_asc": "value ASC",
            "x": "category ASC",
        }.get(spec.sort, "value DESC")

        # Color grouping if specified and not pie/donut
        if spec.color and not is_pie_like:
            color_expr, _ = _render_field_expr(spec.color, schema)
            sql = f"""
SELECT 
    {x_expr} AS category,
    {color_expr} AS color_group,
    {agg_sql} AS value
FROM data
{where_sql}
GROUP BY 1, 2
ORDER BY {order_by}
LIMIT {top_n * lim.max_series_color}
""".strip()
            notes.append(f"Grouped by '{spec.x.column}' and '{spec.color.column}'.")
            return sql, params, notes

        # Other bucket aggregation: if spec.aggregation is avg or median, average the remaining values
        other_agg = (
            "AVG(value)" if spec.aggregation in ("avg", "median")
            else "MIN(value)" if spec.aggregation == "min"
            else "MAX(value)" if spec.aggregation == "max"
            else "SUM(value)"
        )

        # Standard bar/pie with Top N and "Other" bucket
        sql = f"""
WITH grouped AS (
    SELECT 
        COALESCE(CAST({x_expr} AS VARCHAR), '(Null)') AS category,
        {agg_sql} AS value
    FROM data
    {where_sql}
    GROUP BY 1
),
ranked AS (
    SELECT 
        category,
        value,
        ROW_NUMBER() OVER (ORDER BY value DESC) AS rnk
    FROM grouped
),
top_rows AS (
    SELECT category, value FROM ranked WHERE rnk <= {top_n}
),
other_row AS (
    SELECT 'Other' AS category, {other_agg} AS value
    FROM ranked
    WHERE rnk > {top_n}
    HAVING COUNT(*) > 0
)
SELECT category, value FROM (
    SELECT category, value, 0 AS is_other FROM top_rows
    UNION ALL
    SELECT category, value, 1 AS is_other FROM other_row
)
ORDER BY is_other ASC, {order_by}
LIMIT {top_n + 1}
""".strip()
        notes.append(f"Top {top_n} categories shown; remaining grouped into 'Other'.")
        return sql, params, notes

    # 7. LINE / AREA
    if ctype in ("line", "area"):
        assert spec.x is not None
        x_expr, _ = _render_field_expr(spec.x, schema)
        y_expr = _render_y_expr(spec.y, schema, spec.aggregation)
        agg_sql = _render_agg_expr(spec.aggregation, y_expr)
        
        max_points = lim.max_points_line
        color_expr = f", {quote_identifier(spec.color.column)} AS series" if spec.color else ""
        group_by = f"GROUP BY 1" + (f", 2" if spec.color else "")
        order_by = f"ORDER BY 1 ASC"

        # Chronological timeline points cannot have NULL timestamps or invalid parsed dates.
        # Excluding null x_expr prevents failed TRY_CAST rows from collapsing into a giant (None, N) bucket,
        # which would artificially scale the Y-axis to thousands and visually flatten the entire trend line.
        line_where = list(where_clauses)
        line_where.append(f"{x_expr} IS NOT NULL")
        if spec.y and spec.aggregation in ("sum", "avg", "min", "max", "median"):
            line_where.append(f"{y_expr} IS NOT NULL")
        line_where_sql = "WHERE " + " AND ".join(line_where)

        sql = f"""
SELECT 
    {x_expr} AS x{color_expr},
    {agg_sql} AS y
FROM data
{line_where_sql}
{group_by}
{order_by}
LIMIT {max_points}
""".strip()
        notes.append(f"Capped at {max_points:,} chronological data points.")
        return sql, params, notes

    raise InvalidChartSpecError(f"Unsupported chart type '{ctype}'.")
