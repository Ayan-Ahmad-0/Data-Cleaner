"""Orchestration service for the AI Analyst natural-language-to-SQL pipeline."""

from __future__ import annotations
import hashlib
import logging
import re
import time
from typing import Any, Dict, List, Optional

from analyst.context import build_context
from analyst.errors import (
    AnalystError,
    LLMBadResponseError,
    LLMTimeoutError,
    LLMUnavailableError,
    QuestionNotAllowedError,
    RateLimitError,
)
from analyst.limits import AnalystLimits, default_rate_limiter, AnalystRateLimiter
from analyst.llm.base import LLMClient
from analyst.llm.gemini import GeminiClient
from analyst.prompt import build_retry_prompt, build_system_prompt, build_user_prompt
from analyst.schemas import AnalystResult, LLMResponse
from app.storage import JobStorage
from explore.errors import ExploreError, QueryNotAllowedError, QuerySyntaxError, QueryTimeoutError
from explore.service import QueryResult, run_query
from explore.validate import validate_sql

logger = logging.getLogger(__name__)


def sanitize_error_message(error_str: str) -> str:
    """Strip internal file paths and system directories from engine errors."""
    if not error_str:
        return "Unknown query execution error"
    # Replace Windows and POSIX absolute file paths
    sanitized = re.sub(r"[a-zA-Z]:\\[^\s:\"']+", "<job_data_file>", error_str)
    sanitized = re.sub(r"/[a-zA-Z0-9_\.-]+/[^\s:\"']+", "<job_data_file>", sanitized)
    # Strip memory addresses
    sanitized = re.sub(r"0x[0-9a-fA-F]+", "<address>", sanitized)
    return sanitized.strip()


def sanitize_question(question: str, max_chars: int = 1000) -> str:
    """Validate and clean input question."""
    if not question or not question.strip():
        raise QuestionNotAllowedError("The submitted question is empty.")

    # Strip control characters except newline and tab
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", question).strip()

    if len(cleaned) > max_chars:
        raise QuestionNotAllowedError(
            f"Question exceeds the maximum length of {max_chars} characters ({len(cleaned)} characters)."
        )

    return cleaned


def ask(
    job_id: str,
    user_id: str = "anonymous",
    question: str = "",
    history: Optional[List[Any]] = None,
    llm_client: Optional[LLMClient] = None,
    limits: Optional[AnalystLimits] = None,
    storage: Optional[JobStorage] = None,
    rate_limiter: Optional[AnalystRateLimiter] = None,
    profile_data: Optional[Dict[str, Any]] = None,
) -> AnalystResult:
    """Translate natural language question to DuckDB SQL, validate and execute.
    
    Args:
        job_id: Identifier of the target dataset job.
        user_id: Identifier of the requesting user.
        question: Plain-English question from the user.
        history: Reserved for future multi-turn follow-ups (ignored in v1).
        llm_client: LLMClient instance (defaults to GeminiClient).
        limits: Configured AnalystLimits.
        storage: Optional JobStorage provider.
        rate_limiter: Optional AnalystRateLimiter (defaults to singleton).
        profile_data: Optional pre-existing profile dictionary.
        
    Returns:
        AnalystResult containing status, SQL, explanation, assumptions, and query results.
    """
    t_start = time.perf_counter()
    lim = limits or AnalystLimits()
    rl = rate_limiter or default_rate_limiter

    # Check if feature is globally enabled
    if not lim.enabled:
        return AnalystResult(
            status="error",
            question=question,
            message="Ask AI is currently disabled by administrator configuration.",
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )

    # 1. Rate limiting & Quotas
    rl.check_and_record(user_id=user_id, limits=lim)

    # 2. Question validation
    clean_q = sanitize_question(question, max_chars=lim.max_question_chars)

    # 3. Context building
    context = build_context(
        job_id=job_id,
        user_id=user_id,
        question=clean_q,
        limits=lim,
        storage=storage,
        profile_data=profile_data,
    )

    # 4. LLM Client resolution
    client = llm_client
    if client is None:
        client = GeminiClient(limits=lim)

    # 5. First LLM generation pass
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(context=context, question=clean_q)

    llm_resp: LLMResponse = client.generate_structured(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=LLMResponse,
    )

    elapsed_first = time.perf_counter() - t_start

    # Handle clarification or unanswerable statuses without running SQL
    if llm_resp.action == "clarify":
        return AnalystResult(
            status="needs_clarification",
            question=clean_q,
            clarification_question=llm_resp.clarification_question or llm_resp.reason or "Could you clarify your question?",
            explanation=llm_resp.explanation,
            assumptions=llm_resp.assumptions,
            elapsed_seconds=round(elapsed_first, 3),
        )

    if llm_resp.action == "cannot_answer":
        return AnalystResult(
            status="cannot_answer",
            question=clean_q,
            message=llm_resp.reason or "This question cannot be answered from the available columns.",
            explanation=llm_resp.explanation,
            assumptions=llm_resp.assumptions,
            elapsed_seconds=round(elapsed_first, 3),
        )

    first_sql = (llm_resp.sql or "").strip()
    first_error: Optional[str] = None
    query_result: Optional[QueryResult] = None

    # Step 6: Validate and run first generated SQL
    try:
        if not first_sql:
            raise QuerySyntaxError("Model proposed action='answer' without providing SQL.")

        # SQL validation
        validate_sql(first_sql)

        # Execution in sandbox
        query_result = run_query(
            job_id=job_id,
            user_id=user_id,
            sql=first_sql,
            storage=storage,
        )

        return AnalystResult(
            status="ok",
            question=clean_q,
            sql=first_sql,
            explanation=llm_resp.explanation,
            assumptions=llm_resp.assumptions,
            result=query_result,
            retried=False,
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )

    except Exception as exc:
        first_error = str(exc)
        sql_hash = hashlib.sha256(first_sql.encode("utf-8")).hexdigest()[:12]
        logger.warning(
            "Generated SQL failed first execution (hash=%s, job=%s): %s",
            sql_hash,
            job_id,
            first_error,
        )

    # Step 7: Automatic single retry on failure
    sanitized_err = sanitize_error_message(first_error or "Syntax or execution error")
    retry_prompt = build_retry_prompt(
        context=context,
        question=clean_q,
        previous_sql=first_sql,
        error_message=sanitized_err,
    )

    try:
        retry_resp: LLMResponse = client.generate_structured(
            system_prompt=system_prompt,
            user_prompt=retry_prompt,
            response_model=LLMResponse,
        )
    except Exception as retry_llm_err:
        logger.error("LLM retry generation failed: %s", retry_llm_err)
        return AnalystResult(
            status="error",
            question=clean_q,
            sql=first_sql,
            retried=True,
            message=f"Query generation failed: {sanitized_err}",
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )

    # Inspect retry action
    if retry_resp.action == "clarify":
        return AnalystResult(
            status="needs_clarification",
            question=clean_q,
            sql=first_sql,
            clarification_question=retry_resp.clarification_question or "Could you clarify your question?",
            explanation=retry_resp.explanation,
            assumptions=retry_resp.assumptions,
            retried=True,
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )

    if retry_resp.action == "cannot_answer":
        return AnalystResult(
            status="cannot_answer",
            question=clean_q,
            sql=first_sql,
            message=retry_resp.reason or "This question cannot be answered from the available columns.",
            explanation=retry_resp.explanation,
            assumptions=retry_resp.assumptions,
            retried=True,
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )

    retry_sql = (retry_resp.sql or "").strip()
    try:
        if not retry_sql:
            raise QuerySyntaxError("Retry attempt did not provide a SQL statement.")

        validate_sql(retry_sql)

        query_result = run_query(
            job_id=job_id,
            user_id=user_id,
            sql=retry_sql,
            storage=storage,
        )

        return AnalystResult(
            status="ok",
            question=clean_q,
            sql=retry_sql,
            explanation=retry_resp.explanation or llm_resp.explanation,
            assumptions=retry_resp.assumptions or llm_resp.assumptions,
            result=query_result,
            retried=True,
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )

    except Exception as second_exc:
        second_err = sanitize_error_message(str(second_exc))
        logger.warning("Retry query execution failed for job %s: %s", job_id, second_err)
        return AnalystResult(
            status="error",
            question=clean_q,
            sql=retry_sql or first_sql,
            retried=True,
            message=f"Generated query failed after retry: {second_err}. You can review or edit the SQL in the SQL box.",
            elapsed_seconds=round(time.perf_counter() - t_start, 3),
        )
