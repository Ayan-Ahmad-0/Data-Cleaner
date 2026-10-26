"""Unit tests for Calculated Columns and Metric Formula Builder (Phase 2)."""

import pytest
import duckdb
from pathlib import Path

from charts.errors import InvalidChartSpecError
from charts.spec import ChartSpec, FieldRef, validate_formula_string, validate_spec
from charts.compile import compile_spec
from charts.page_options import PageDataOptions, apply_page_options
from charts.service import validate_formula


def test_validate_formula_string_valid():
    """Verify that safe arithmetic and SQL expressions pass validation."""
    valid_formulas = [
        "revenue - cost",
        "(orders * 1.0 / NULLIF(visits, 0)) * 100",
        "ROUND(price * (1 - discount), 2)",
        "COALESCE(fare, 0) + 5",
        "SUM(revenue) / COUNT(order_id)",
        "EXTRACT(year FROM order_date) - 2000",
    ]
    for formula in valid_formulas:
        validate_formula_string(formula)  # Should not raise


def test_validate_formula_string_security_and_syntax():
    """Verify that dangerous tokens, semicolons, and syntax issues are rejected."""
    # Semicolons
    with pytest.raises(InvalidChartSpecError, match="Semicolons are not permitted"):
        validate_formula_string("revenue - cost; DROP TABLE data;")

    # Banned keywords
    for word in ["ATTACH", "DROP", "INSERT", "COPY", "PRAGMA", "SYSTEM", "DELETE"]:
        with pytest.raises(InvalidChartSpecError, match=f"Disallowed command or statement '{word}'"):
            validate_formula_string(f"SELECT {word} FROM data")

    # Unbalanced parentheses
    with pytest.raises(InvalidChartSpecError, match="Unbalanced parentheses"):
        validate_formula_string("(revenue - cost")
    with pytest.raises(InvalidChartSpecError, match="Unbalanced parentheses"):
        validate_formula_string("revenue - cost)")

    # Empty formula
    with pytest.raises(InvalidChartSpecError, match="cannot be empty"):
        validate_formula_string("   ")


def test_compile_spec_with_custom_metric_formula():
    """Verify that a spec with field_ref.formula compiles to valid SQL and executes in DuckDB."""
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (category VARCHAR, revenue DOUBLE, cost DOUBLE)")
    con.execute("INSERT INTO data VALUES ('Tech', 1000.0, 600.0), ('Tech', 500.0, 200.0), ('Office', 300.0, 250.0)")

    schema = {"category": "VARCHAR", "revenue": "DOUBLE", "cost": "DOUBLE"}
    spec = ChartSpec(
        chart_type="bar",
        x=FieldRef(column="category"),
        y=FieldRef(column="Profit", formula="revenue - cost"),
        aggregation="sum",
    )

    sql, params, notes = compile_spec(spec, schema)
    assert "(revenue - cost)" in sql
    assert "SUM(TRY_CAST((revenue - cost) AS DOUBLE))" in sql

    res = con.execute(sql, params).fetchall()
    assert len(res) == 2
    # Tech profit should be (1000 - 600) + (500 - 200) = 700.0
    # Office profit should be 300 - 250 = 50.0
    profit_map = {row[0]: row[1] for row in res}
    assert profit_map["Tech"] == 700.0
    assert profit_map["Office"] == 50.0
    con.close()


def test_compile_spec_with_aggregate_measure_formula():
    """Verify that measures with embedded aggregations (e.g. SUM(rev) / SUM(cost)) work with aggregation='none'."""
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE data (category VARCHAR, revenue DOUBLE, cost DOUBLE)")
    con.execute("INSERT INTO data VALUES ('Tech', 1000.0, 500.0), ('Office', 200.0, 100.0)")

    schema = {"category": "VARCHAR", "revenue": "DOUBLE", "cost": "DOUBLE"}
    spec = ChartSpec(
        chart_type="bar",
        x=FieldRef(column="category"),
        y=FieldRef(column="MarkupRatio", formula="SUM(revenue) / NULLIF(SUM(cost), 0)"),
        aggregation="none",
    )

    sql, params, notes = compile_spec(spec, schema)
    assert "SUM(revenue) / NULLIF(SUM(cost), 0)" in sql

    res = con.execute(sql, params).fetchall()
    assert len(res) == 2
    ratio_map = {row[0]: row[1] for row in res}
    assert ratio_map["Tech"] == 2.0
    assert ratio_map["Office"] == 2.0
    con.close()


def test_apply_page_options_calculated_columns():
    """Verify that pageDataOptions.calculated_columns automatically populates formula onto matching field_refs."""
    schema = {"category": "VARCHAR", "revenue": "DOUBLE", "cost": "DOUBLE"}
    spec = ChartSpec(
        chart_type="bar",
        x=FieldRef(column="category"),
        y=FieldRef(column="Profit"),  # Column name matches page-wide calculated column
        aggregation="sum",
    )

    options = PageDataOptions(
        calculated_columns={"Profit": "revenue - cost", "Margin": "(revenue - cost) / revenue"}
    )

    applied_spec = apply_page_options(spec, options, schema)
    assert applied_spec.y is not None
    assert applied_spec.y.formula == "revenue - cost"
    assert applied_spec.y.column == "Profit"
