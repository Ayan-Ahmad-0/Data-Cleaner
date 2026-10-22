"""Limits, rate limiting, and quotas for Chart AI features (Section 12 of spec)."""

from __future__ import annotations
from dataclasses import dataclass, field
import os
import time
from typing import Dict, List, Optional
from analyst.errors import RateLimitError


@dataclass
class ChartsAILimits:
    """Configurable runtime limits for Chart AI generation."""
    enabled: bool = field(
        default_factory=lambda: os.getenv("CHARTS_AI_ENABLED", "true").lower() in ("true", "1", "yes")
    )
    send_samples: bool = field(
        default_factory=lambda: os.getenv("CHARTS_AI_SEND_SAMPLES", os.getenv("ANALYST_SEND_SAMPLES", "true")).lower() in ("true", "1", "yes")
    )
    model_name: str = field(
        default_factory=lambda: os.getenv("CHARTS_AI_MODEL", os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    )

    max_request_chars: int = 500
    charts_ai_user_per_minute: int = 10
    charts_ai_user_per_day: int = 100
    max_recommendations: int = 10
    auto_visualize_default_charts: int = 6
    auto_visualize_parallel_builds: int = 2
    plan_cache_ttl_seconds: int = 3600
    max_context_chars: int = 30000
    max_output_tokens: int = 2000
    llm_timeout_seconds: float = 30.0
    temperature: float = 0.2
    regenerate_cooldown_seconds: float = 10.0
    quota_backoff_seconds: float = 45.0


class ChartsAIRateLimiter:
    """In-memory rate limiter and quota cooldown tracker for Chart AI."""

    def __init__(self) -> None:
        self._minute_calls: Dict[str, List[float]] = {}
        self._day_calls: Dict[str, List[float]] = {}
        self._quota_cooldown_until: float = 0.0

    def trigger_quota_cooldown(self, cooldown_seconds: float = 45.0) -> None:
        """Trigger temporary cooldown after 429 quota exhaustion."""
        self._quota_cooldown_until = time.time() + cooldown_seconds

    def check_and_record(self, user_id: str, limits: ChartsAILimits) -> None:
        """Check rate limits and cooldowns, or raise RateLimitError."""
        now = time.time()

        if now < self._quota_cooldown_until:
            wait_sec = int(self._quota_cooldown_until - now)
            raise RateLimitError(
                f"AI chart service is currently busy. Please try again in {wait_sec} seconds.",
                technical_detail=f"Quota backoff active for {wait_sec}s",
            )

        # 1. User minute limit
        user_min_history = self._minute_calls.setdefault(user_id, [])
        self._minute_calls[user_id] = [t for t in user_min_history if now - t < 60.0]
        if len(self._minute_calls[user_id]) >= limits.charts_ai_user_per_minute:
            raise RateLimitError(
                f"You have reached the limit of {limits.charts_ai_user_per_minute} AI chart requests per minute. Please slow down.",
                technical_detail="User per-minute rate limit hit",
            )

        # 2. User daily limit
        user_day_history = self._day_calls.setdefault(user_id, [])
        self._day_calls[user_id] = [t for t in user_day_history if now - t < 86400.0]
        if len(self._day_calls[user_id]) >= limits.charts_ai_user_per_day:
            raise RateLimitError(
                f"You have reached your daily quota of {limits.charts_ai_user_per_day} AI chart requests.",
                technical_detail="User per-day rate limit hit",
            )

        # Record call
        self._minute_calls[user_id].append(now)
        self._day_calls[user_id].append(now)


default_charts_ai_rate_limiter = ChartsAIRateLimiter()
