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

