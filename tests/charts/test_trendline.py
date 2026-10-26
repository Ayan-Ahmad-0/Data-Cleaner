"""Unit tests for TrendlineConfig and trendline spec validation."""

import pytest
from charts.errors import InvalidChartSpecError
from charts.spec import ChartSpec, FieldRef, TrendlineConfig, validate_spec


def test_trendline_config_defaults():
    config = TrendlineConfig(type="sma", window=14)
    assert config.type == "sma"
    assert config.window == 14
    assert config.show_equation is False
    assert config.line_style == "dash"


def test_trendline_validation_valid():
    schema = {"timestamp": "TIMESTAMP", "revenue": "DOUBLE"}
    spec = ChartSpec(
        chart_type="line",
        x=FieldRef(column="timestamp"),
        y=FieldRef(column="revenue"),
        aggregation="sum",
        trendline=TrendlineConfig(type="sma", window=7, show_equation=True),
    )
    validate_spec(spec, schema)


def test_trendline_validation_linear_scatter():
    schema = {"height": "DOUBLE", "weight": "DOUBLE"}
    spec = ChartSpec(
        chart_type="scatter",
        x=FieldRef(column="height"),
        y=FieldRef(column="weight"),
        aggregation="none",
        trendline=TrendlineConfig(type="linear", show_equation=True, line_style="dot"),
    )
    validate_spec(spec, schema)


def test_trendline_validation_unsupported_chart():
    schema = {"category": "VARCHAR", "count": "INTEGER"}
    spec = ChartSpec(
        chart_type="pie",
        x=FieldRef(column="category"),
        y=FieldRef(column="count"),
        aggregation="sum",
        trendline=TrendlineConfig(type="sma", window=7),
    )
    with pytest.raises(InvalidChartSpecError, match="Trendlines are not supported for 'pie'"):
        validate_spec(spec, schema)


def test_trendline_validation_invalid_window():
    schema = {"timestamp": "TIMESTAMP", "revenue": "DOUBLE"}
    spec = ChartSpec(
        chart_type="line",
        x=FieldRef(column="timestamp"),
        y=FieldRef(column="revenue"),
        aggregation="sum",
        trendline=TrendlineConfig(type="sma", window=1),
    )
    # Pydantic validation catches window < 2 directly or via validate_spec
    with pytest.raises((ValueError, InvalidChartSpecError)):
        validate_spec(spec, schema)
