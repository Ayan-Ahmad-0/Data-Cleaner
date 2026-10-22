"""Security and injection resilience tests for Chart AI."""

import pytest
from analyst.llm.fake import FakeLLMClient
from charts.errors import InvalidChartSpecError
from charts_ai.schemas import (
    LLMChartRequestResponse,
    LLMChartSpec,
    LLMField,
    LLMFilter,
)
from charts_ai.service import chart_from_text


def test_sql_injection_in_user_request(mock_charts_storage):
    storage, job_id = mock_charts_storage

    # User attempts SQL injection in natural language prompt
    malicious_request = "Sales'; DROP TABLE sales_data; SELECT * FROM pg_shadow; --"

    # Model attempts to execute or map to a malicious column or filter
    canned_resp = LLMChartRequestResponse(
        action="chart",
        spec=LLMChartSpec(
            chart_type="bar",
            x=LLMField(column="category"),
            y=LLMField(column="revenue"),
            filters=[
                LLMFilter(
                    column="category",
                    op="!=",
                    values=["Malicious'; DROP TABLE sales_data; --"],
                )
            ],
            aggregation="sum",
        ),
        title="<script>alert('xss')</script>Clean Title",
    )

    fake_client = FakeLLMClient(canned_responses=[canned_resp])
    result = chart_from_text(
        job_id=job_id,
        request=malicious_request,
        storage=storage,
        llm_client=fake_client,
    )

    assert result.status == "ok"
    assert result.data is not None
    # Verify title has HTML stripped
    assert "<script>" not in result.title
    assert "alert('xss')" in result.title or "Clean Title" in result.title
    # Verify query executed safely without table dropping
    assert len(result.data.rows) > 0


def test_model_invents_unknown_column_dropped(mock_charts_storage):
    storage, job_id = mock_charts_storage

    # Fake model attempts to chart a non-existent column
    canned_resp = LLMChartRequestResponse(
        action="chart",
        spec=LLMChartSpec(
            chart_type="bar",
            x=LLMField(column="invented_secret_column"),
            y=LLMField(column="revenue"),
            aggregation="sum",
        ),
    )

    fake_client = FakeLLMClient(canned_responses=[canned_resp])
    result = chart_from_text(
        job_id=job_id,
        request="show me invented_secret_column",
        storage=storage,
        llm_client=fake_client,
    )

    # Should fail safely with error status, never executing invalid column
    assert result.status == "error"
    assert result.data is None
