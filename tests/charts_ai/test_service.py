"""Unit tests for charts_ai service functions using FakeLLMClient."""

import pytest
from analyst.llm.fake import FakeLLMClient
from charts_ai.schemas import (
    LLMChartRequestResponse,
    LLMChartSpec,
    LLMField,
    LLMPlan,
    LLMPlanTip,
    LLMRecommendation,
)
from charts_ai.service import auto_visualize, chart_from_text, plan_visualization


def test_plan_visualization_success(mock_charts_storage):
    storage, job_id = mock_charts_storage

    canned_plan = LLMPlan(
        summary="A compact dataset of 6 e-commerce orders across 3 product categories.",
        recommendations=[
            LLMRecommendation(
                spec=LLMChartSpec(
                    chart_type="bar",
                    x=LLMField(column="category"),
                    y=LLMField(column="revenue"),
                    aggregation="sum",
                    sort="y_desc",
                ),
                title="Revenue by Category",
                question_answered="Which product category generates the most revenue?",
                why="Category comparison suited for total revenue volume.",
                caveats=["Sample data size is limited."],
                priority=1,
            ),
            LLMRecommendation(
                spec=LLMChartSpec(
                    chart_type="line",
                    x=LLMField(column="order_date", time_bucket="day"),
                    y=LLMField(column="revenue"),
                    aggregation="sum",
                ),
                title="Revenue Over Time",
                question_answered="How does sales revenue trend by day?",
                why="Time-series pattern analysis.",
                caveats=[],
                priority=2,
            ),
            LLMRecommendation(
                spec=LLMChartSpec(
                    chart_type="histogram",
                    x=LLMField(column="quantity"),
                ),
                title="Distribution of Order Quantities",
                question_answered="What quantity per order is most common?",
                why="Histogram shows distribution of item counts.",
                caveats=[],
                priority=3,
            ),
        ],
        prep_tips=[
            LLMPlanTip(
                column="revenue",
                tip="Ensure revenue column has extreme outliers clipped.",
                action="hide_outliers",
            )
        ],
        avoid=["Pie charts with more than 6 slices."],
    )

    fake_client = FakeLLMClient(canned_responses=[canned_plan])
    plan = plan_visualization(
        job_id=job_id,
        storage=storage,
        force_refresh=True,
        llm_client=fake_client,
    )

    assert plan.used_fallback is False
    assert len(plan.recommendations) == 3
    assert plan.recommendations[0].title == "Revenue by Category"
    assert plan.recommendations[0].spec.chart_type == "bar"
    assert len(plan.prep_tips) == 1
    assert plan.prep_tips[0].action == "hide_outliers"


def test_plan_visualization_fallback_on_llm_failure(mock_charts_storage):
    storage, job_id = mock_charts_storage

    fake_client = FakeLLMClient(canned_responses=RuntimeError("Gemini server offline"))
    plan = plan_visualization(
        job_id=job_id,
        storage=storage,
        force_refresh=True,
        llm_client=fake_client,
    )

    assert plan.used_fallback is True
    assert len(plan.recommendations) > 0
    assert plan.recommendations[0].source == "standard"


def test_auto_visualize_builds_charts(mock_charts_storage):
    storage, job_id = mock_charts_storage

    canned_plan = LLMPlan(
        summary="Dataset summary",
        recommendations=[
            LLMRecommendation(
                spec=LLMChartSpec(
                    chart_type="bar",
                    x=LLMField(column="category"),
                    y=LLMField(column="revenue"),
                    aggregation="avg",
                ),
                title="Average Revenue by Category",
                question_answered="Average basket size by category",
                why="Comparison of central tendency",
                priority=1,
            )
        ],
        prep_tips=[],
        avoid=[],
    )

    fake_client = FakeLLMClient(canned_responses=[canned_plan])
    charts = auto_visualize(
        job_id=job_id,
        storage=storage,
        max_charts=2,
        force_refresh=True,
        llm_client=fake_client,
    )

    assert len(charts) >= 1
    rec, chart_data = charts[0]
    assert rec.title == "Average Revenue by Category"
    assert hasattr(chart_data, "rows")
    assert len(chart_data.rows) > 0


def test_chart_from_text_ok(mock_charts_storage):
    storage, job_id = mock_charts_storage

    canned_resp = LLMChartRequestResponse(
        action="chart",
        spec=LLMChartSpec(
            chart_type="bar",
            x=LLMField(column="category"),
            y=LLMField(column="revenue"),
            aggregation="sum",
        ),
        title="Revenue by Category",
        explanation="Displays total revenue summed by product category.",
        assumptions=["Mapped 'sales' to revenue column."],
    )

    fake_client = FakeLLMClient(canned_responses=[canned_resp])
    result = chart_from_text(
        job_id=job_id,
        request="show me sales by category",
        storage=storage,
        llm_client=fake_client,
    )

    assert result.status == "ok"
    assert result.spec is not None
    assert result.spec.chart_type == "bar"
    assert result.data is not None
    assert len(result.data.rows) > 0


def test_chart_from_text_clarify(mock_charts_storage):
    storage, job_id = mock_charts_storage

    canned_resp = LLMChartRequestResponse(
        action="clarify",
        clarification_question="Did you want total revenue or average revenue?",
        assumptions=[],
    )

    fake_client = FakeLLMClient(canned_responses=[canned_resp])
    result = chart_from_text(
        job_id=job_id,
        request="show revenue",
        storage=storage,
        llm_client=fake_client,
    )

    assert result.status == "needs_clarification"
    assert "total revenue or average revenue" in result.clarification_question
    assert result.data is None


def test_chart_from_text_cannot_chart(mock_charts_storage):
    storage, job_id = mock_charts_storage

    canned_resp = LLMChartRequestResponse(
        action="cannot_chart",
        reason="Predictive forecasting is not supported by a single chart. Try querying with the SQL box.",
    )

    fake_client = FakeLLMClient(canned_responses=[canned_resp])
    result = chart_from_text(
        job_id=job_id,
        request="predict revenue for next quarter",
        storage=storage,
        llm_client=fake_client,
    )

    assert result.status == "cannot_chart"
    assert "Predictive forecasting" in result.message
    assert result.data is None
