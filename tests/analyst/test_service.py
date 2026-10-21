"""Unit tests for analyst service orchestration with FakeLLMClient."""

import pytest
from analyst.errors import LLMBadResponseError, LLMTimeoutError, RateLimitError
from analyst.limits import AnalystLimits, AnalystRateLimiter
from analyst.llm.fake import FakeLLMClient
from analyst.schemas import LLMResponse
from analyst.service import ask


def test_ask_answer_success_path(mock_analyst_storage, sample_analyst_profile):
    """Verify happy path: model returns valid SQL, executes against DuckDB, returns QueryResult."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=[
            LLMResponse(
                action="answer",
                sql='SELECT count(*) as total_trips, avg("fare_amount") as avg_fare FROM data;',
                explanation="Calculates the total number of trips and the average fare.",
                assumptions=["Treated all rows in data as trips"],
            )
        ]
    )

    result = ask(
        job_id=job_id,
        question="How many trips and what is the average fare?",
        llm_client=fake_client,
        storage=storage,
        rate_limiter=rate_limiter,
        profile_data=sample_analyst_profile,
    )

    assert result.status == "ok"
    assert result.sql == 'SELECT count(*) as total_trips, avg("fare_amount") as avg_fare FROM data;'
    assert result.retried is False
    assert result.result is not None
    assert result.result.row_count_returned == 1
    assert result.result.rows[0][0] == 5
    assert len(result.assumptions) == 1


def test_ask_clarify_path(mock_analyst_storage, sample_analyst_profile):
    """Verify clarify path: model asks for clarification, no SQL is executed."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=[
            LLMResponse(
                action="clarify",
                clarification_question="Did you mean total fare or trip distance when asking for highest value?",
                assumptions=[],
            )
        ]
    )

    result = ask(
        job_id=job_id,
        question="Which trip has the highest value?",
        llm_client=fake_client,
        storage=storage,
        rate_limiter=rate_limiter,
        profile_data=sample_analyst_profile,
    )

    assert result.status == "needs_clarification"
    assert result.clarification_question is not None
    assert "Did you mean total fare" in result.clarification_question
    assert result.sql is None
    assert result.result is None


def test_ask_cannot_answer_path(mock_analyst_storage, sample_analyst_profile):
    """Verify cannot_answer path: model reports missing data, no SQL is executed."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=[
            LLMResponse(
                action="cannot_answer",
                reason="The dataset does not contain weather or rain condition columns.",
                assumptions=[],
            )
        ]
    )

    result = ask(
        job_id=job_id,
        question="Did it rain during the longest trip?",
        llm_client=fake_client,
        storage=storage,
        rate_limiter=rate_limiter,
        profile_data=sample_analyst_profile,
    )

    assert result.status == "cannot_answer"
    assert "weather" in result.message
    assert result.sql is None
    assert result.result is None


def test_ask_one_retry_on_bad_sql_then_success(mock_analyst_storage, sample_analyst_profile):
    """Verify retry flow: invalid column name triggers one retry, second attempt succeeds."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=[
            # First attempt: references invalid column 'non_existent_fare'
            LLMResponse(
                action="answer",
                sql='SELECT avg("non_existent_fare") FROM data;',
                explanation="Calculates average fare.",
            ),
            # Second attempt: corrected column 'fare_amount'
            LLMResponse(
                action="answer",
                sql='SELECT avg("fare_amount") as avg_fare FROM data;',
                explanation="Calculates average fare using correct column.",
            ),
        ]
    )

    result = ask(
        job_id=job_id,
        question="What is the average fare?",
        llm_client=fake_client,
        storage=storage,
        rate_limiter=rate_limiter,
        profile_data=sample_analyst_profile,
    )

    assert result.status == "ok"
    assert result.retried is True
    assert result.sql == 'SELECT avg("fare_amount") as avg_fare FROM data;'
    assert result.result is not None
    assert len(fake_client.calls) == 2


def test_ask_retry_failure_caps_at_two_attempts(mock_analyst_storage, sample_analyst_profile):
    """Verify invalid SQL twice returns status='error' with friendly message and no third call."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=[
            LLMResponse(
                action="answer",
                sql='SELECT missing_one FROM data;',
            ),
            LLMResponse(
                action="answer",
                sql='SELECT missing_two FROM data;',
            ),
        ]
    )

    result = ask(
        job_id=job_id,
        question="Compute something missing",
        llm_client=fake_client,
        storage=storage,
        rate_limiter=rate_limiter,
        profile_data=sample_analyst_profile,
    )

    assert result.status == "error"
    assert result.retried is True
    assert "failed after retry" in result.message
    assert len(fake_client.calls) == 2


def test_ask_malformed_llm_response_handled(mock_analyst_storage, sample_analyst_profile):
    """Verify LLMBadResponseError triggers retry or safe error without crash."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=[
            LLMBadResponseError("Malformed JSON returned by model"),
        ]
    )

    with pytest.raises(LLMBadResponseError):
        ask(
            job_id=job_id,
            question="Hello",
            llm_client=fake_client,
            storage=storage,
            rate_limiter=rate_limiter,
            profile_data=sample_analyst_profile,
        )


def test_ask_timeout_error_mapped(mock_analyst_storage, sample_analyst_profile):
    """Verify LLMTimeoutError maps properly."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()

    fake_client = FakeLLMClient(
        canned_responses=LLMTimeoutError(timeout_seconds=5.0)
    )

    with pytest.raises(LLMTimeoutError):
        ask(
            job_id=job_id,
            question="Calculate long query",
            llm_client=fake_client,
            storage=storage,
            rate_limiter=rate_limiter,
            profile_data=sample_analyst_profile,
        )


def test_run_evaluation_suite_with_fake(mock_analyst_storage, sample_analyst_profile):
    """Verify evaluation suite runs across all benchmark questions with 100% pass rate."""
    from tests.analyst.eval_questions import EVAL_QUESTIONS, run_evaluation_suite

    storage, job_id = mock_analyst_storage

    # Build fake client dispatching canned response per question
    canned_map = {}
    for q in EVAL_QUESTIONS:
        if q.canned_llm_response:
            canned_map[q.question] = q.canned_llm_response

    fake_client = FakeLLMClient(canned_responses=canned_map)
    report = run_evaluation_suite(
        job_id=job_id,
        storage=storage,
        llm_client=fake_client,
        profile_data=sample_analyst_profile,
    )

    assert report.total_questions == len(EVAL_QUESTIONS)
    assert report.passed_count == report.total_questions
    assert report.pass_rate_pct == 100.0
    assert report.invalid_sql_count == 0
