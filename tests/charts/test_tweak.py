"""Unit tests for tweak panel helpers and default starter spec."""

import pytest
from charts.spec import ChartSpec, FieldRef
from charts.stats import ColumnStats
from charts.tweak import default_starter_spec, get_tweak_options


def test_default_starter_spec_categorical():
    schema = {"region": "VARCHAR", "age": "INTEGER"}
    stats = [
        ColumnStats(name="region", type="VARCHAR", null_pct=0.0, distinct_approx=5, min=None, max=None, kind="categorical"),
        ColumnStats(name="age", type="INTEGER", null_pct=0.0, distinct_approx=40, min="18", max="65", kind="numeric"),
    ]
    spec = default_starter_spec(schema, stats)
    assert spec.chart_type == "hbar"
    assert spec.x.column == "region"
    assert spec.aggregation == "count"
    assert spec.top_n == 20


def test_default_starter_spec_numeric():
    schema = {"salary": "DOUBLE"}
    stats = [
        ColumnStats(name="salary", type="DOUBLE", null_pct=0.0, distinct_approx=500, min="1000", max="9000", kind="numeric"),
    ]
    spec = default_starter_spec(schema, stats)
    assert spec.chart_type == "histogram"
    assert spec.x.column == "salary"


def test_default_starter_spec_big_number():
    schema = {"notes": "VARCHAR"}
    stats = [
        ColumnStats(name="notes", type="VARCHAR", null_pct=0.0, distinct_approx=5000, min=None, max=None, kind="text_long"),
    ]
    spec = default_starter_spec(schema, stats)
    assert spec.chart_type == "big_number"
    assert spec.aggregation == "count"
