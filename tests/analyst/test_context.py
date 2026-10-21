"""Unit tests for analyst context builder, privacy masking, and sample caps."""

import pytest
from analyst.context import build_context, clear_context_cache
from analyst.limits import AnalystLimits


def test_context_basic_schema_and_stats(mock_analyst_storage, sample_analyst_profile):
    """Verify context contains table metadata, columns, and statistical summary."""
    storage, job_id = mock_analyst_storage
    clear_context_cache()

    ctx = build_context(
        job_id=job_id,
        storage=storage,
        profile_data=sample_analyst_profile,
    )

    assert ctx.primary_table == "data"
    assert ctx.row_count == 5
    assert "data" in ctx.tables_available
    col_names = [c.name for c in ctx.columns]
    assert "trip_id" in col_names
    assert "fare_amount" in col_names

    # Check stats presence
    fare_col = next(c for c in ctx.columns if c.name == "fare_amount")
    assert fare_col.min_val == 6.0
    assert fare_col.max_val == 52.0
    assert fare_col.null_pct == 0.0


def test_context_sample_capping_and_truncation(mock_analyst_storage, sample_analyst_profile):
    """Verify at most 3 sample values per column and values over 40 chars are truncated."""
    storage, job_id = mock_analyst_storage
    clear_context_cache()

    ctx = build_context(
        job_id=job_id,
        storage=storage,
        profile_data=sample_analyst_profile,
    )

    for col in ctx.columns:
        assert len(col.sample_values) <= 3

    # Check notes column which has a very long row (> 40 chars)
    notes_col = next(c for c in ctx.columns if c.name == "notes")
    for s in notes_col.sample_values:
        assert len(s) <= 43  # 40 chars + "..."


def test_context_sensitive_column_hiding(mock_analyst_storage, sample_analyst_profile):
    """Verify sensitive columns (email, phone) have samples hidden and marked."""
    storage, job_id = mock_analyst_storage
    clear_context_cache()

    ctx = build_context(
        job_id=job_id,
        storage=storage,
        profile_data=sample_analyst_profile,
    )

    email_col = next(c for c in ctx.columns if c.name == "passenger_email")
    phone_col = next(c for c in ctx.columns if c.name == "driver_phone")

    assert email_col.samples_hidden is True
    assert len(email_col.sample_values) == 0

    assert phone_col.samples_hidden is True
    assert len(phone_col.sample_values) == 0

    formatted = ctx.format_table_context()
    assert "passenger_email" in formatted
    assert "(sample hidden)" in formatted
    assert "alice@example.com" not in formatted


def test_context_send_samples_disabled(mock_analyst_storage, sample_analyst_profile):
    """Verify setting send_samples=False completely strips sample values."""
    storage, job_id = mock_analyst_storage
    clear_context_cache()

    limits = AnalystLimits(send_samples=False)
    ctx = build_context(
        job_id=job_id,
        limits=limits,
        storage=storage,
        profile_data=sample_analyst_profile,
    )

    for col in ctx.columns:
        assert len(col.sample_values) == 0

    formatted = ctx.format_table_context()
    assert "Morning commute" not in formatted


def test_context_wide_table_truncation(mock_analyst_storage, sample_analyst_profile):
    """Verify tables exceeding max_columns_in_context are truncated and flagged."""
    storage, job_id = mock_analyst_storage
    clear_context_cache()

    # Artificially set max_columns_in_context to 4
    limits = AnalystLimits(max_columns_in_context=4)
    ctx = build_context(
        job_id=job_id,
        question="What is the average fare_amount and trip_distance?",
        limits=limits,
        storage=storage,
        profile_data=sample_analyst_profile,
    )

    assert ctx.schema_truncated is True
    assert len(ctx.columns) == 4
    col_names = [c.name for c in ctx.columns]
    # Fare amount and trip distance should be prioritized because mentioned in question
    assert "fare_amount" in col_names
    assert "trip_distance" in col_names

    formatted = ctx.format_table_context()
    assert "schema truncated" in formatted
