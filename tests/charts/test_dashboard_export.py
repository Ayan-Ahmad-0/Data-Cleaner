"""Tests for Standalone Executive Dashboard HTML Export."""

import pytest
from charts.dashboard_export import generate_dashboard_html


def test_generate_dashboard_html_basic():
    title = "Q4 Financial Overview"
    dataset_name = "sales_2024.parquet"
    cards = [
        {
            "spec": {
                "chart_type": "bar",
                "x": {"column": "region"},
                "y": {"column": "revenue"},
                "aggregation": "sum",
                "custom_color": "#FF4B3E",
            },
            "title": "Revenue by Region",
            "data": {
                "columns": ["region", "revenue"],
                "rows": [["North", 120000], ["South", 98000], ["East", 145000]],
            },
        },
        {
            "spec": {
                "chart_type": "big_number",
                "y": {"column": "revenue"},
                "aggregation": "sum",
            },
            "title": "Total Revenue",
            "data": {
                "columns": ["sum_revenue"],
                "rows": [[363000]],
            },
        },
    ]
    metadata = {
        "row_count": 25000,
        "column_count": 12,
        "generated_at": "2026-10-26 12:00:00 UTC",
    }

    html = generate_dashboard_html(
        title=title,
        dataset_name=dataset_name,
        cards_data=cards,
        metadata=metadata,
    )

    assert "<!DOCTYPE html>" in html
    assert "Q4 Financial Overview" in html
    assert "sales_2024.parquet" in html
    assert "25,000" in html
    assert "cdn.plot.ly/plotly" in html
    assert "window.print()" in html
    assert "Revenue by Region" in html
    assert "North" in html


def test_generate_dashboard_html_escaping():
    html = generate_dashboard_html(
        title="<script>alert(1)</script>",
        dataset_name="data<>&.csv",
        cards_data=[],
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
