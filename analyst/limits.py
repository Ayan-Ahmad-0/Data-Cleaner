"""Limits, configuration, and rate limiter for AI Analyst."""

from __future__ import annotations
from dataclasses import dataclass, field
import os
import re
import threading
import time
from typing import Dict, List, Optional, Tuple

from analyst.errors import RateLimitError


@dataclass
class AnalystLimits:
    """Operational and safety boundaries for the AI Analyst."""
    max_question_chars: int = 1000
    max_questions_per_user_per_minute: int = 5
    max_questions_per_user_per_day: int = 100
    max_questions_global_per_minute: int = 60
    max_context_chars: int = 30000
    max_output_tokens: int = 2048
    llm_timeout_seconds: float = 20.0
    max_generated_queries_per_question: int = 2
    max_columns_in_context: int = 200
    max_sample_chars: int = 40
    max_samples_per_column: int = 3

    # Dynamic environment-backed settings
    model_name: str = field(
        default_factory=lambda: os.getenv("ANALYST_MODEL", "gemini-3.5-flash")
    )
    temperature: float = field(
        default_factory=lambda: float(os.getenv("ANALYST_TEMPERATURE", "0.1"))
    )
    send_samples: bool = field(
        default_factory=lambda: os.getenv("ANALYST_SEND_SAMPLES", "true").lower() in ("true", "1", "yes")
    )
    enabled: bool = field(
        default_factory=lambda: os.getenv("ANALYST_ENABLED", "true").lower() in ("true", "1", "yes")
    )

    # Sensitive patterns
    sensitive_column_pattern: str = r"(?i)(name|first_name|last_name|full_name|email|phone|ssn|social_security|password|passwd|secret|token|credit_card|card_num|card_number|address|dob|birth_date)"
    sensitive_value_patterns: List[str] = field(
        default_factory=lambda: [
            r"^[\w\.-]+@[\w\.-]+\.\w+$",  # email
            r"^\+?[0-9\-\(\)\s]{7,20}$",   # phone
            r"^\d{3}-\d{2}-\d{4}$",        # SSN
        ]
    )


class AnalystRateLimiter:
    """Thread-safe sliding-window rate limiter for user bursts and daily quotas."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._user_timestamps: Dict[str, List[float]] = {}
        self._global_timestamps: List[float] = []

    def check_and_record(self, user_id: str, limits: Optional[AnalystLimits] = None) -> None:
        """Check rate limits and record call timestamp if allowed.
        
        Raises:
            RateLimitError: If per-minute or daily quota is exceeded.
        """
        lim = limits or AnalystLimits()
        now = time.time()
        one_minute_ago = now - 60.0
        one_day_ago = now - 86400.0

        with self._lock:
            # 1. Prune and check global rate limit
            self._global_timestamps = [t for t in self._global_timestamps if t > one_minute_ago]
            if len(self._global_timestamps) >= lim.max_questions_global_per_minute:
                raise RateLimitError(
                    "Ask AI is currently busy. Please try again soon, or use the SQL box directly.",
                    technical_detail=f"Global limit {lim.max_questions_global_per_minute}/min exceeded",
                )

            # 2. Prune and check user limits
            user_history = self._user_timestamps.get(user_id, [])
            user_history = [t for t in user_history if t > one_day_ago]
            self._user_timestamps[user_id] = user_history

            # Check per-minute burst
            recent_user_calls = [t for t in user_history if t > one_minute_ago]
            if len(recent_user_calls) >= lim.max_questions_per_user_per_minute:
                raise RateLimitError(
                    f"You have reached the limit of {lim.max_questions_per_user_per_minute} questions per minute. Please wait a moment before trying again.",
                    technical_detail=f"User {user_id} exceeded burst limit {lim.max_questions_per_user_per_minute}/min",
                )

            # Check daily quota
            if len(user_history) >= lim.max_questions_per_user_per_day:
                raise RateLimitError(
                    f"Daily question limit reached ({lim.max_questions_per_user_per_day} questions). You can continue analyzing your data using the SQL box.",
                    technical_detail=f"User {user_id} exceeded daily quota {lim.max_questions_per_user_per_day}/day",
                )

            # Record call
            self._global_timestamps.append(now)
            self._user_timestamps[user_id].append(now)

    def reset(self) -> None:
        """Reset all rate limiter counters (useful in tests)."""
        with self._lock:
            self._user_timestamps.clear()
            self._global_timestamps.clear()


# Default singleton instance
default_rate_limiter = AnalystRateLimiter()
