"""Unit tests for PageDataOptions and apply_page_options."""

import pytest
from charts.page_options import PageDataOptions, apply_page_options
from charts.spec import ChartSpec, FieldRef, Filter


def test_apply_page_options_none():
    schema = {"category": "VARCHAR", "amount": "DOUBLE"}
    spec = ChartSpec(chart_type="bar", x=FieldRef(column="category"), y=FieldRef(column="amount"), aggregation="sum")
    applied = apply_page_options(spec, None, schema)
    assert applied == spec


def test_apply_page_options_cast_overrides():
    schema = {"order_date": "VARCHAR", "amount": "VARCHAR"}
    
    # Field without explicit cast_as should receive override
    spec = ChartSpec(
        chart_type="line",
        x=FieldRef(column="order_date", time_bucket="month"),
        y=FieldRef(column="amount"),
        aggregation="sum",
    )
    options = PageDataOptions(
        cast_overrides={"order_date": "date", "amount": "number"}
    )
    applied = apply_page_options(spec, options, schema)
    assert applied.x.cast_as == "date"
    assert applied.y.cast_as == "number"

    # Explicit cast_as on chart must NOT be overwritten
    spec_explicit = ChartSpec(
        chart_type="line",
        x=FieldRef(column="order_date", cast_as="timestamp", time_bucket="month"),
        y=FieldRef(column="amount"),
        aggregation="sum",
    )
    applied_explicit = apply_page_options(spec_explicit, options, schema)
    assert applied_explicit.x.cast_as == "timestamp"
    assert applied_explicit.y.cast_as == "number"


def test_apply_page_options_exclude_missing():
    schema = {"category": "VARCHAR", "revenue": "DOUBLE", "country": "VARCHAR"}
    spec = ChartSpec(
        chart_type="bar",
        x=FieldRef(column="category"),
        y=FieldRef(column="revenue"),
        aggregation="sum",
    )
    options = PageDataOptions(exclude_missing=True)
    applied = apply_page_options(spec, options, schema)

    filter_cols = {f.column for f in applied.filters if f.op == "not_null"}
    assert "category" in filter_cols
    assert "revenue" in filter_cols
    assert "country" not in filter_cols


def test_apply_page_options_hide_outliers():
    schema = {"val": "DOUBLE"}
    spec = ChartSpec(chart_type="histogram", x=FieldRef(column="val"))
    assert spec.hide_outliers is False

    options = PageDataOptions(hide_outliers=True)
    applied = apply_page_options(spec, options, schema)
    assert applied.hide_outliers is True


def test_apply_page_options_cross_filters():
    schema = {"city": "VARCHAR", "status": "VARCHAR", "revenue": "DOUBLE"}
    
    # 1. Chart grouped by status (the source chart of the status filter)
    # Should NOT have the status filter applied to itself
    status_chart = ChartSpec(chart_type="bar", x=FieldRef(column="status"), y=FieldRef(column="revenue"), aggregation="sum")
    
    # 2. Chart grouped by city (linked target chart)
    # MUST receive the status = 'Active' filter
    city_chart = ChartSpec(chart_type="bar", x=FieldRef(column="city"), y=FieldRef(column="revenue"), aggregation="sum")
    
    options = PageDataOptions(cross_filters={"status": "Active"})
    
    applied_status = apply_page_options(status_chart, options, schema)
    applied_city = apply_page_options(city_chart, options, schema)
    
    # Source chart remains unfiltered on status so user can see all categories
    assert not any(f.column == "status" for f in applied_status.filters)
    
    # Linked chart receives status filter
    matching = [f for f in applied_city.filters if f.column == "status"]
    assert len(matching) == 1
    assert matching[0].op == "="
    assert matching[0].value == "Active"

