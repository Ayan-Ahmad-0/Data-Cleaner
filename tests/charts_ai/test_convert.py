"""Tests for LLM spec conversion and sanitization."""

import pytest
from pydantic import ValidationError
from charts.errors import InvalidChartSpecError
from charts_ai.convert import convert_llm_spec, strip_html_and_control_chars
from charts_ai.schemas import LLMChartSpec, LLMField, LLMFilter


def test_strip_html_and_control_chars():
    dirty = "<b>Hello</b> <script>alert(1)</script>\x00World\t!"
    cleaned = strip_html_and_control_chars(dirty)
    assert "<b>" not in cleaned
    assert "<script>" not in cleaned
    assert "\x00" not in cleaned
    assert "Hello alert(1)World\t!" == cleaned


def test_extra_fields_forbidden():
    with pytest.raises(ValidationError):
        LLMChartSpec(
            chart_type="bar",
            sql="SELECT * FROM data",  # extra field
        )


def test_convert_valid_spec():
    schema = {"region": "VARCHAR", "sales": "DOUBLE"}
    llm_spec = LLMChartSpec(
        chart_type="bar",
        x=LLMField(column="region"),
        y=LLMField(column="sales"),
        aggregation="sum",
        filters=[LLMFilter(column="region", op="!=", values=["North"])],
        sort="y_desc",
        top_n=10,
    )
    spec = convert_llm_spec(llm_spec, schema, title="Sales by <i>Region</i>")
    assert spec.chart_type == "bar"
    assert spec.x.column == "region"
    assert spec.y.column == "sales"
    assert spec.aggregation == "sum"
    assert len(spec.filters) == 1
    assert spec.filters[0].column == "region"
    assert spec.filters[0].value == "North"
    assert spec.title == "Sales by Region"


def test_convert_filter_numeric_parsing():
    schema = {"age": "INTEGER"}
    llm_spec = LLMChartSpec(
        chart_type="histogram",
        x=LLMField(column="age"),
        filters=[LLMFilter(column="age", op=">", values=["25"])],
    )
    spec = convert_llm_spec(llm_spec, schema)
    assert spec.filters[0].value == 25


def test_convert_unknown_column_rejected():
    schema = {"age": "INTEGER"}
    llm_spec = LLMChartSpec(
        chart_type="histogram",
        x=LLMField(column="non_existent"),
    )
    with pytest.raises(InvalidChartSpecError, match="does not exist in schema"):
        convert_llm_spec(llm_spec, schema)
