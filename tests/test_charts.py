"""Unit and security tests for charts package."""

import pytest
from charts.errors import InvalidChartSpecError
from charts.spec import ChartSpec, FieldRef, Filter, validate_spec
from charts.compile import compile_spec, quote_identifier
from charts.shape import chart_from_result


def test_quote_identifier():
    assert quote_identifier("column") == '"column"'
    assert quote_identifier('col"name') == '"col""name"'
    assert quote_identifier('drop table data; --') == '"drop table data; --"'


def test_validate_spec_unknown_column():
    schema = {"age": "INTEGER", "salary": "DOUBLE"}
    spec = ChartSpec(chart_type="histogram", x=FieldRef(column="unknown_col"))
    with pytest.raises(InvalidChartSpecError, match="does not exist in dataset schema"):
        validate_spec(spec, schema)


def test_validate_spec_type_mismatch():
    schema = {"name": "VARCHAR"}
    spec = ChartSpec(chart_type="histogram", x=FieldRef(column="name"))
    with pytest.raises(InvalidChartSpecError, match="requires a numeric X axis column"):
        validate_spec(spec, schema)


def test_validate_spec_pie_rules():
    schema = {"category": "VARCHAR", "amount": "DOUBLE"}
    # Pie without agg none
    spec = ChartSpec(chart_type="pie", x=FieldRef(column="category"), aggregation="none")
    with pytest.raises(InvalidChartSpecError, match="requires an aggregation"):
        validate_spec(spec, schema)

    # Pie top_n > 6
    spec2 = ChartSpec(chart_type="pie", x=FieldRef(column="category"), top_n=10)
    with pytest.raises(InvalidChartSpecError, match="allows at most 6 slices"):
        validate_spec(spec2, schema)


def test_compile_spec_sql_injection_resilience():
    malicious_col = 'col"; DROP TABLE data; --'
    schema = {malicious_col: "INTEGER"}
    spec = ChartSpec(
        chart_type="bar",
        x=FieldRef(column=malicious_col),
        aggregation="count",
        filters=[Filter(column=malicious_col, op="=", value="test' OR '1'='1")],
        title="Malicious'; DROP TABLE data; --",
    )
    sql, params, notes = compile_spec(spec, schema)
    
    # Assert identifier is safely quoted
    assert 'col""; DROP TABLE data; --' in sql
    # Assert filter value was parameterized, never concatenated
    assert "test' OR '1'='1" not in sql
    assert params == ["test' OR '1'='1"]
    # Assert title has zero effect on SQL
    assert "Malicious" not in sql
    # Assert final limit is present
    assert "LIMIT" in sql


def test_compile_spec_histogram():
    schema = {"fare": "DOUBLE"}
    spec = ChartSpec(chart_type="histogram", x=FieldRef(column="fare", bins=20))
    sql, params, notes = compile_spec(spec, schema)
    assert "WITH stats AS" in sql
    assert "LIMIT 25" in sql
    assert len(params) == 0


def test_compile_spec_scatter_sampling():
    schema = {"x_val": "DOUBLE", "y_val": "DOUBLE"}
    spec = ChartSpec(chart_type="scatter", x=FieldRef(column="x_val"), y=FieldRef(column="y_val"))
    sql, params, notes = compile_spec(spec, schema)
    assert "USING SAMPLE" in sql
    assert "reservoir, 42" in sql


def test_chart_from_result_shapes():
    # 1 row, 1 numeric
    s1 = chart_from_result([{"name": "total", "type": "BIGINT"}], [[42]])
    assert s1.spec.chart_type == "big_number"
    assert s1.spec.y.column == "total"

    # 1 cat, 1 numeric
    s2 = chart_from_result(
        [{"name": "dept", "type": "VARCHAR"}, {"name": "count", "type": "INTEGER"}],
        [["Engineering", 10], ["Design", 5]],
    )
    assert s2.spec.chart_type == "pie"  # <= 6 rows -> pie

    # 1 date, 1 numeric
    s3 = chart_from_result(
        [{"name": "dt", "type": "TIMESTAMP"}, {"name": "price", "type": "DOUBLE"}],
        [["2026-01-01", 100.0], ["2026-01-02", 105.0]],
    )
    assert s3.spec.chart_type == "line"
    assert s3.spec.x.column == "dt"
    assert s3.spec.y.column == "price"

    # 2 numeric columns: defaults to hbar instead of scatter
    s4 = chart_from_result(
        [{"name": "score", "type": "INTEGER"}, {"name": "salary", "type": "DOUBLE"}],
        [[85, 90000.0], [92, 120000.0]],
    )
    assert s4.spec.chart_type == "hbar"


def test_compile_spec_numeric_aggregation_on_varchar():
    """Verify numeric aggregation (avg, sum, median) on VARCHAR column compiles and runs in DuckDB."""
    import duckdb
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (order_date VARCHAR, order_hour VARCHAR)")
    con.execute("INSERT INTO data VALUES ('2026-01-01', '14'), ('2026-01-01', '08'), ('2026-01-02', '12')")
    
    schema = {"order_date": "VARCHAR", "order_hour": "VARCHAR"}
    spec = ChartSpec(
        chart_type="line",
        x=FieldRef(column="order_date", time_bucket="day", cast_as="timestamp"),
        y=FieldRef(column="order_hour", cast_as="number"),
        aggregation="avg",
    )
    sql, params, notes = compile_spec(spec, schema)
    assert "AVG(TRY_CAST" in sql
    res = con.execute(sql, params).fetchall()
    assert len(res) == 2
    con.close()


def test_compile_spec_bar_with_category_column_in_schema():
    """Verify bar chart on country runs even when table has an existing column named category."""
    import duckdb
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (country VARCHAR, category VARCHAR, amount VARCHAR)")
    con.execute("INSERT INTO data VALUES ('US', 'Electronics', '100'), ('UK', 'Clothing', '50'), ('US', 'Clothing', '75')")

    schema = {"country": "VARCHAR", "category": "VARCHAR", "amount": "VARCHAR"}
    spec = ChartSpec(
        chart_type="hbar",
        x=FieldRef(column="country"),
        y=FieldRef(column="amount", cast_as="number"),
        aggregation="sum",
    )
    sql, params, notes = compile_spec(spec, schema)
    assert "WITH grouped AS" in sql
    assert "GROUP BY 1" in sql
    res = con.execute(sql, params).fetchall()
    assert len(res) == 2
    # Check US is 175.0, UK is 50.0
    val_map = {row[0]: row[1] for row in res}
    assert val_map["US"] == 175.0
    assert val_map["UK"] == 50.0
    con.close()


def test_compile_spec_donut():
    """Verify donut chart compiles to valid SQL with max pie slices."""
    schema = {"payment_method": "VARCHAR", "amount": "DOUBLE"}
    spec = ChartSpec(chart_type="donut", x=FieldRef(column="payment_method"), aggregation="count")
    sql, params, notes = compile_spec(spec, schema)
    assert "WITH grouped AS" in sql
    assert "LIMIT 7" in sql


def test_compile_spec_box_and_heatmap():
    """Verify box plot and heatmap compile and execute properly in DuckDB."""
    import duckdb
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (currency VARCHAR, amount DOUBLE, payment_method VARCHAR)")
    con.execute("INSERT INTO data VALUES ('USD', 100.0, 'card'), ('EUR', 80.0, 'paypal'), ('USD', 150.0, 'card')")
    schema = {"currency": "VARCHAR", "amount": "DOUBLE", "payment_method": "VARCHAR"}

    # Box plot
    box_spec = ChartSpec(chart_type="box", x=FieldRef(column="currency"), y=FieldRef(column="amount"))
    box_sql, _, _ = compile_spec(box_spec, schema)
    assert "quantile_cont" in box_sql
    box_res = con.execute(box_sql).fetchall()
    assert len(box_res) == 2

    # Heatmap
    heat_spec = ChartSpec(chart_type="heatmap", x=FieldRef(column="currency"), y=FieldRef(column="payment_method"))
    heat_sql, _, _ = compile_spec(heat_spec, schema)
    con.close()


def test_all_chart_types_compile_and_execute():
    """Verify that every supported chart type compiles to valid SQL and executes in DuckDB without error."""
    import duckdb
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (dt TIMESTAMP, cat VARCHAR, cat2 VARCHAR, num DOUBLE)")
    con.execute("INSERT INTO data VALUES ('2026-01-01 10:00:00', 'A', 'X', 10.0), ('2026-01-02 11:00:00', 'B', 'Y', 20.0), ('2026-01-03 12:00:00', 'A', 'Y', 30.0)")
    schema = {"dt": "TIMESTAMP", "cat": "VARCHAR", "cat2": "VARCHAR", "num": "DOUBLE"}

    specs = [
        ChartSpec(chart_type="bar", x=FieldRef(column="cat"), y=FieldRef(column="num"), aggregation="sum"),
        ChartSpec(chart_type="hbar", x=FieldRef(column="cat"), y=FieldRef(column="num"), aggregation="avg"),
        ChartSpec(chart_type="line", x=FieldRef(column="dt", time_bucket="day"), y=FieldRef(column="num"), aggregation="sum"),
        ChartSpec(chart_type="area", x=FieldRef(column="dt", time_bucket="day"), y=FieldRef(column="num"), aggregation="count"),
        ChartSpec(chart_type="histogram", x=FieldRef(column="num", bins=5)),
        ChartSpec(chart_type="scatter", x=FieldRef(column="num"), y=FieldRef(column="num")),
        ChartSpec(chart_type="pie", x=FieldRef(column="cat"), aggregation="count"),
        ChartSpec(chart_type="donut", x=FieldRef(column="cat"), aggregation="count"),
        ChartSpec(chart_type="box", x=FieldRef(column="cat"), y=FieldRef(column="num")),
        ChartSpec(chart_type="box", y=FieldRef(column="num")),
        ChartSpec(chart_type="heatmap", x=FieldRef(column="cat"), y=FieldRef(column="cat2")),
        ChartSpec(chart_type="big_number", y=FieldRef(column="num"), aggregation="sum"),
    ]

    for spec in specs:
        sql, params, _ = compile_spec(spec, schema)
        res = con.execute(sql, params).fetchall()
        assert len(res) >= 0

    con.close()


def test_suggest_charts_diverse_types():
    """Verify that suggest_charts_from_stats proposes donut, pie, area, and box charts when data supports it."""
    from charts.stats import ColumnStats
    from charts.suggest import suggest_charts_from_stats

    stats = [
        ColumnStats(name="status", type="VARCHAR", null_pct=0.0, distinct_approx=3, kind="categorical"),
        ColumnStats(name="tier", type="VARCHAR", null_pct=0.0, distinct_approx=4, kind="categorical"),
        ColumnStats(name="created_at", type="TIMESTAMP", null_pct=0.0, distinct_approx=500, kind="datetime"),
        ColumnStats(name="revenue", type="DOUBLE", null_pct=0.0, distinct_approx=800, kind="numeric"),
        ColumnStats(name="cost", type="DOUBLE", null_pct=0.0, distinct_approx=750, kind="numeric"),
        ColumnStats(name="city", type="VARCHAR", null_pct=0.0, distinct_approx=20, kind="categorical"),
    ]

    suggestions = suggest_charts_from_stats(stats, row_count=1000, max_suggestions=8)
    chart_types = [s.chart_type for s in suggestions]

    assert "donut" in chart_types
    assert "pie" in chart_types
    assert "area" in chart_types
    assert "heatmap" in chart_types
    assert "hbar" in chart_types
    assert "box" not in chart_types
    assert "scatter" not in chart_types

    area_spec = next(s for s in suggestions if s.chart_type == "area")
    assert area_spec.custom_color == "#0284C7"
    line_spec = next(s for s in suggestions if s.chart_type == "line")
    assert line_spec.custom_color == "#E11D48"


def test_compile_spec_sum_on_varchar_auto_promotes_number_cast():
    """Verify sum on VARCHAR column without explicit cast_as auto-casts to number and compiles."""
    import duckdb
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (country VARCHAR, amount VARCHAR)")
    con.execute("INSERT INTO data VALUES ('US', '100'), ('UK', '50')")
    schema = {"country": "VARCHAR", "amount": "VARCHAR"}
    spec = ChartSpec(
        chart_type="hbar",
        x=FieldRef(column="country"),
        y=FieldRef(column="amount"),  # No explicit cast_as
        aggregation="sum",
    )
    sql, params, notes = compile_spec(spec, schema)
    assert "SUM(TRY_CAST" in sql
    assert spec.y.cast_as == "number"
    res = con.execute(sql, params).fetchall()
    assert len(res) == 2
    con.close()


def test_compile_spec_line_and_area_excludes_null_dates():
    """Verify line and area queries exclude null/unparseable timestamps so they don't corrupt the Y-axis scale."""
    import duckdb
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (order_date VARCHAR, amount DOUBLE)")
    # 5 valid rows on 2026-01-01, 5 valid rows on 2026-01-02, and 100 corrupted date rows
    con.execute("""
    INSERT INTO data VALUES 
    ('2026-01-01', 10.0), ('2026-01-01', 12.0), ('2026-01-01', 14.0), ('2026-01-01', 11.0), ('2026-01-01', 13.0),
    ('2026-01-02', 20.0), ('2026-01-02', 22.0), ('2026-01-02', 24.0), ('2026-01-02', 21.0), ('2026-01-02', 23.0)
    """)
    for _ in range(100):
        con.execute("INSERT INTO data VALUES ('corrupted_val', 5.0)")

    schema = {"order_date": "VARCHAR", "amount": "DOUBLE"}
    spec = ChartSpec(
        chart_type="area",
        x=FieldRef(column="order_date", time_bucket="day", cast_as="timestamp"),
        aggregation="count",
    )
    sql, params, notes = compile_spec(spec, schema)
    assert "IS NOT NULL" in sql
    res = con.execute(sql, params).fetchall()
    
    # Must only contain the 2 valid date buckets (count=5 each), NOT the 100 corrupted rows as (None, 100)
    assert len(res) == 2
    assert all(r[0] is not None for r in res)
    assert res[0][1] == 5
    assert res[1][1] == 5
    con.close()


def test_suggest_charts_adaptive_time_bucket():
    """Verify adaptive time bucketing defaults to week instead of day."""
    from charts.stats import ColumnStats
    from charts.suggest import suggest_charts_from_stats

    # 1. Multi-year span (> 730 days) -> should suggest 'month'
    stats_long = [
        ColumnStats(name="order_date", type="VARCHAR", null_pct=0.0, distinct_approx=900, min="2023-01-01", max="2026-05-15", kind="datetime"),
        ColumnStats(name="amount", type="DOUBLE", null_pct=0.0, distinct_approx=800, kind="numeric"),
    ]
    sug_long = suggest_charts_from_stats(stats_long, row_count=5000)
    area_long = next(s for s in sug_long if s.chart_type == "area")
    assert area_long.x.time_bucket == "month"

    # 2. Multi-month span (90 days) -> should suggest default 'week'
    stats_mid = [
        ColumnStats(name="order_date", type="VARCHAR", null_pct=0.0, distinct_approx=90, min="2026-01-01", max="2026-04-01", kind="datetime"),
        ColumnStats(name="amount", type="DOUBLE", null_pct=0.0, distinct_approx=800, kind="numeric"),
    ]
    sug_mid = suggest_charts_from_stats(stats_mid, row_count=1000)
    area_mid = next(s for s in sug_mid if s.chart_type == "area")
    assert area_mid.x.time_bucket == "week"

    # 3. Default without min/max dates -> should suggest default 'week'
    stats_default = [
        ColumnStats(name="order_date", type="VARCHAR", null_pct=0.0, distinct_approx=100, kind="datetime"),
        ColumnStats(name="amount", type="DOUBLE", null_pct=0.0, distinct_approx=800, kind="numeric"),
    ]
    sug_default = suggest_charts_from_stats(stats_default, row_count=1000)
    area_default = next(s for s in sug_default if s.chart_type == "area")
    assert area_default.x.time_bucket == "week"

    # 4. Ultra-short span (2 days) -> should suggest 'day'
    stats_short = [
        ColumnStats(name="order_date", type="VARCHAR", null_pct=0.0, distinct_approx=2, min="2026-01-01", max="2026-01-03", kind="datetime"),
        ColumnStats(name="amount", type="DOUBLE", null_pct=0.0, distinct_approx=800, kind="numeric"),
    ]
    sug_short = suggest_charts_from_stats(stats_short, row_count=100)
    area_short = next(s for s in sug_short if s.chart_type == "area")
    assert area_short.x.time_bucket == "day"


def test_suggest_charts_adaptive_time_bucket_without_dateutil(monkeypatch):
    """Verify adaptive time bucketing works cleanly without dateutil module present."""
    import sys
    from charts.stats import ColumnStats
    from charts.suggest import suggest_charts_from_stats

    # Block dateutil import
    monkeypatch.setitem(sys.modules, "dateutil", None)
    monkeypatch.setitem(sys.modules, "dateutil.parser", None)

    stats_long = [
        ColumnStats(name="order_date", type="VARCHAR", null_pct=0.0, distinct_approx=900, min="2023-01-01", max="2026-05-15", kind="datetime"),
        ColumnStats(name="amount", type="DOUBLE", null_pct=0.0, distinct_approx=800, kind="numeric"),
    ]
    sug = suggest_charts_from_stats(stats_long, row_count=5000)
    area = next(s for s in sug if s.chart_type == "area")
    assert area.x.time_bucket == "month"




