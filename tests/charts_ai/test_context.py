"""Tests for context building in Chart AI."""

from charts.page_options import PageDataOptions
from charts_ai.context import build_chart_ai_context
from charts_ai.limits import ChartsAILimits


def test_build_context_content(mock_charts_storage):
    storage, job_id = mock_charts_storage
    context = build_chart_ai_context(job_id=job_id, storage=storage)

    assert "<dataset_context>" in context
    assert "</dataset_context>" in context
    assert "Total rows: 6" in context
    assert "category" in context
    assert "revenue" in context
    assert "order_date" in context

    # Sensitive column hiding
    assert "customer_email" in context
    assert "(sample hidden for privacy)" in context

    # Non-sensitive samples present
    assert 'samples: ["Electronics"' in context or 'samples: ["Furniture"' in context


def test_build_context_page_options(mock_charts_storage):
    storage, job_id = mock_charts_storage
    options = PageDataOptions(
        cast_overrides={"order_id": "text"},
        exclude_missing=True,
        hide_outliers=True,
    )
    context = build_chart_ai_context(job_id=job_id, storage=storage, page_options=options)
    assert "exclude_missing: ON" in context
    assert "hide_outliers: ON" in context
    assert "order_id->text" in context


def test_build_context_disable_samples(mock_charts_storage):
    storage, job_id = mock_charts_storage
    lim = ChartsAILimits(send_samples=False)
    context = build_chart_ai_context(job_id=job_id, storage=storage, limits=lim)
    assert "samples: [" not in context
