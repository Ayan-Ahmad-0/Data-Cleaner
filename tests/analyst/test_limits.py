"""Unit tests for AnalystLimits, question sanitization, and AnalystRateLimiter."""

import pytest
from analyst.errors import QuestionNotAllowedError, RateLimitError
from analyst.limits import AnalystLimits, AnalystRateLimiter
from analyst.llm.fake import FakeLLMClient
from analyst.schemas import LLMResponse
from analyst.service import ask


def test_rate_limiter_burst_control():
    """Verify per-minute rate limit triggers RateLimitError on the N+1 attempt."""
    limiter = AnalystRateLimiter()
    limits = AnalystLimits(max_questions_per_user_per_minute=3)

    # 3 allowed calls
    for _ in range(3):
        limiter.check_and_record("user_1", limits=limits)

    # 4th call must be blocked
    with pytest.raises(RateLimitError) as exc_info:
        limiter.check_and_record("user_1", limits=limits)

    assert "limit of 3 questions per minute" in exc_info.value.user_message


def test_rate_limiter_daily_quota():
    """Verify daily quota triggers RateLimitError once threshold is reached."""
    limiter = AnalystRateLimiter()
    limits = AnalystLimits(max_questions_per_user_per_minute=100, max_questions_per_user_per_day=5)

    for _ in range(5):
        limiter.check_and_record("user_2", limits=limits)

    with pytest.raises(RateLimitError) as exc_info:
        limiter.check_and_record("user_2", limits=limits)

    assert "Daily question limit reached" in exc_info.value.user_message


def test_rate_limiter_global_limit():
    """Verify global queries per minute protects shared API resources."""
    limiter = AnalystRateLimiter()
    limits = AnalystLimits(
        max_questions_global_per_minute=2,
        max_questions_per_user_per_minute=10,
    )

    limiter.check_and_record("user_a", limits=limits)
    limiter.check_and_record("user_b", limits=limits)

    # 3rd call from another user triggers global throttle
    with pytest.raises(RateLimitError) as exc_info:
        limiter.check_and_record("user_c", limits=limits)

    assert "Ask AI is currently busy" in exc_info.value.user_message


def test_question_too_long_rejected(mock_analyst_storage, sample_analyst_profile):
    """Verify questions exceeding max_question_chars are rejected immediately."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()
    fake_client = FakeLLMClient()

    limits = AnalystLimits(max_question_chars=50)
    long_question = "A" * 51

    with pytest.raises(QuestionNotAllowedError) as exc_info:
        ask(
            job_id=job_id,
            question=long_question,
            llm_client=fake_client,
            limits=limits,
            storage=storage,
            rate_limiter=rate_limiter,
            profile_data=sample_analyst_profile,
        )

    assert "exceeds the maximum length of 50" in exc_info.value.user_message


def test_empty_question_rejected(mock_analyst_storage, sample_analyst_profile):
    """Verify empty or whitespace-only questions raise QuestionNotAllowedError."""
    storage, job_id = mock_analyst_storage
    rate_limiter = AnalystRateLimiter()
    fake_client = FakeLLMClient()

    with pytest.raises(QuestionNotAllowedError):
        ask(
            job_id=job_id,
            question="   ",
            llm_client=fake_client,
            storage=storage,
            rate_limiter=rate_limiter,
            profile_data=sample_analyst_profile,
        )
