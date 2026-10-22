"""Public service implementation for Chart AI (Section 7 of spec)."""

from __future__ import annotations
import hashlib
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import duckdb

from analyst.errors import (
    LLMBadResponseError,
    LLMTimeoutError,
    LLMUnavailableError,
    RateLimitError,
)
from analyst.llm.base import LLMClient
from analyst.llm.gemini import GeminiClient
from app.storage import JobStorage
from charts.errors import ChartError, InvalidChartSpecError
from charts.page_options import PageDataOptions
from charts.service import ChartData, build_chart, get_column_stats, suggest_charts
from charts.spec import ChartSpec
from charts_ai.context import build_chart_ai_context
from charts_ai.convert import convert_llm_spec, strip_html_and_control_chars
from charts_ai.errors import AIChartsDisabledError
from charts_ai.limits import ChartsAILimits, default_charts_ai_rate_limiter, ChartsAIRateLimiter
from charts_ai.models import (
    ChartFromTextResult,
    ChartRecommendation,
    DataPrepTip,
    VisualizationPlan,
)
from charts_ai.prompt import (
    build_ask_system_prompt,
    build_ask_user_prompt,
    build_plan_system_prompt,
    build_plan_user_prompt,
    build_repair_prompt,
)
from charts_ai.quality import (
    merge_fallback_recommendations,
    post_process_recommendations,
)
from charts_ai.schemas import LLMChartRequestResponse, LLMPlan
from explore.service import resolve_job_parquet_paths

logger = logging.getLogger(__name__)

# Plan cache keyed by job_id + page_options_hash
_plan_cache: Dict[str, Tuple[float, VisualizationPlan]] = {}


def _get_plan_cache_key(job_id: str, page_options: Optional[PageDataOptions]) -> str:
    po_dump = page_options.model_dump_json() if page_options else ""
    return hashlib.sha256(f"{job_id}:{po_dump}".encode("utf-8")).hexdigest()


def get_default_llm_client(limits: Optional[ChartsAILimits] = None) -> LLMClient:
    """Resolve LLM client for Chart AI, using the configured Gemini key and model."""
    lim = limits or ChartsAILimits()
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    return GeminiClient(api_key=api_key, model_name=lim.model_name)


def sanitize_request_text(text: str, max_chars: int = 500) -> str:
    """Validate and clean natural language request."""
    if not text or not text.strip():
        raise InvalidChartSpecError("The chart request is empty.")
    # Strip control characters
    clean = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text).strip()
    if len(clean) > max_chars:
        clean = clean[:max_chars].strip()
    return clean


def plan_visualization(
    job_id: str,
    user_id: str = "anonymous",
    storage: Optional[JobStorage] = None,
    page_options: Optional[PageDataOptions] = None,
    force_refresh: bool = False,
    llm_client: Optional[LLMClient] = None,
    limits: Optional[ChartsAILimits] = None,
    rate_limiter: Optional[ChartsAIRateLimiter] = None,
) -> VisualizationPlan:
    """Generate or retrieve a visualization plan with recommendations, data prep tips, and caveats."""
    t0 = time.perf_counter()
    lim = limits or ChartsAILimits()
    rl = rate_limiter or default_charts_ai_rate_limiter

    cache_key = _get_plan_cache_key(job_id, page_options)
    now = time.time()

    if not force_refresh and cache_key in _plan_cache:
        cached_time, cached_plan = _plan_cache[cache_key]
        if now - cached_time < lim.plan_cache_ttl_seconds:
            return cached_plan

    # Fallback generator in case AI is disabled or fails
    def generate_fallback_plan(summary_msg: str, used_fallback: bool = True) -> VisualizationPlan:
        try:
            standard_specs = suggest_charts(job_id=job_id, user_id=user_id, storage=storage)
        except Exception:
            standard_specs = []
        recs, _ = merge_fallback_recommendations([], standard_specs, min_required=1, target_count=6)
        plan = VisualizationPlan(
            summary=summary_msg,
            recommendations=recs,
            prep_tips=[],
            avoid=["Pie charts with more than 6 slices", "Charts using unindexed high-cardinality IDs"],
            used_fallback=used_fallback,
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )
        _plan_cache[cache_key] = (now, plan)
        return plan

    # Check feature enabled
    if not lim.enabled:
        return generate_fallback_plan("Standard rule-based visualization suggestions (AI planning is disabled).")

    # Check API key presence
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key and llm_client is None:
        return generate_fallback_plan("Standard rule-based visualization suggestions (GEMINI_API_KEY not configured).")

    # Rate limiting
    try:
        rl.check_and_record(user_id=user_id, limits=lim)
    except RateLimitError as e:
        logger.warning("Rate limit hit during plan_visualization: %s", e)
        return generate_fallback_plan("AI chart suggestions are busy; showing standard suggestions instead.")

    # 1. Fetch schema and stats
    stats = get_column_stats(job_id=job_id, user_id=user_id, storage=storage)
    schema = {s.name: s.type for s in stats}

    # 2. Build context
    context_str = build_chart_ai_context(
        job_id=job_id,
        user_id=user_id,
        storage=storage,
        page_options=page_options,
        limits=lim,
    )

    client = llm_client or get_default_llm_client(limits=lim)
    system_prompt = build_plan_system_prompt()
    user_prompt = build_plan_user_prompt(context_str)

    llm_plan: Optional[LLMPlan] = None
    try:
        llm_plan = client.generate_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=LLMPlan,
        )
    except RateLimitError:
        rl.trigger_quota_cooldown(lim.quota_backoff_seconds)
        logger.warning("Gemini 429 quota reached in plan_visualization. Falling back to rule-based.")
        return generate_fallback_plan("AI quota reached; showing standard suggestions.")
    except Exception as e:
        logger.warning("Gemini call failed during plan_visualization: %s. Using fallback.", e)
        return generate_fallback_plan("Standard rule-based suggestions (AI temporary error).")

    # 3. Convert and validate recommendations
    valid_recs: List[ChartRecommendation] = []
    validation_errors: List[str] = []

    for item in llm_plan.recommendations:
        try:
            domain_spec = convert_llm_spec(item.spec, schema, title=item.title)
            valid_recs.append(
                ChartRecommendation(
                    id=f"rec_{len(valid_recs) + 1}",
                    spec=domain_spec,
                    title=strip_html_and_control_chars(item.title, max_len=120),
                    question_answered=strip_html_and_control_chars(item.question_answered, max_len=140),
                    why=strip_html_and_control_chars(item.why, max_len=240),
                    caveats=[strip_html_and_control_chars(c, max_len=160) for c in item.caveats[:3]],
                    priority=item.priority,
                    source="ai",
                )
            )
        except InvalidChartSpecError as ve:
            logger.info("AI chart spec rejected: %s", ve)
            validation_errors.append(str(ve))

    # 4. One repair retry if fewer than 3 recommendations are valid
    if len(valid_recs) < 3 and validation_errors:
        try:
            repair_user_prompt = build_repair_prompt(
                context=context_str,
                previous_output=str(llm_plan.model_dump_json()),
                error_messages=validation_errors[:5],
            )
            repaired_plan: LLMPlan = client.generate_structured(
                system_prompt=system_prompt,
                user_prompt=repair_user_prompt,
                response_model=LLMPlan,
            )
            for item in repaired_plan.recommendations:
                try:
                    domain_spec = convert_llm_spec(item.spec, schema, title=item.title)
                    valid_recs.append(
                        ChartRecommendation(
                            id=f"rec_{len(valid_recs) + 1}",
                            spec=domain_spec,
                            title=strip_html_and_control_chars(item.title, max_len=120),
                            question_answered=strip_html_and_control_chars(item.question_answered, max_len=140),
                            why=strip_html_and_control_chars(item.why, max_len=240),
                            caveats=[strip_html_and_control_chars(c, max_len=160) for c in item.caveats[:3]],
                            priority=item.priority,
                            source="ai",
                        )
                    )
                except InvalidChartSpecError:
                    pass
        except Exception as re_err:
            logger.warning("Repair retry failed: %s", re_err)

    # 5. Quality processing (dedupe, variety caps)
    processed_recs = post_process_recommendations(valid_recs, max_total=lim.max_recommendations)

    # 6. Fallback merge if still fewer than 3
    used_fallback = False
    if len(processed_recs) < 3:
        try:
            standard_specs = suggest_charts(job_id=job_id, user_id=user_id, storage=storage)
        except Exception:
            standard_specs = []
        processed_recs, used_fallback = merge_fallback_recommendations(
            processed_recs, standard_specs, min_required=3, target_count=6
        )

    # 7. Convert prep tips
    clean_tips: List[DataPrepTip] = []
    for tip in llm_plan.prep_tips[:8]:
        col_clean = tip.column.strip() if tip.column and tip.column.strip() in schema else None
        clean_tips.append(
            DataPrepTip(
                column=col_clean,
                tip=strip_html_and_control_chars(tip.tip, max_len=200),
                action=tip.action,
            )
        )

    # 8. Clean summary and avoid list
    summary = strip_html_and_control_chars(llm_plan.summary, max_len=500)
    avoid_list = [strip_html_and_control_chars(a, max_len=160) for a in llm_plan.avoid[:5]]

    result_plan = VisualizationPlan(
        summary=summary,
        recommendations=processed_recs,
        prep_tips=clean_tips,
        avoid=avoid_list,
        used_fallback=used_fallback,
        elapsed_seconds=round(time.perf_counter() - t0, 3),
    )

    _plan_cache[cache_key] = (now, result_plan)
    return result_plan


def auto_visualize(
    job_id: str,
    user_id: str = "anonymous",
    storage: Optional[JobStorage] = None,
    page_options: Optional[PageDataOptions] = None,
    max_charts: int = 6,
    force_refresh: bool = False,
    llm_client: Optional[LLMClient] = None,
    limits: Optional[ChartsAILimits] = None,
) -> List[Tuple[ChartRecommendation, Union[ChartData, ChartError]]]:
    """Plan and build top recommended charts for the dataset."""
    plan = plan_visualization(
        job_id=job_id,
        user_id=user_id,
        storage=storage,
        page_options=page_options,
        force_refresh=force_refresh,
        llm_client=llm_client,
        limits=limits,
    )

    results: List[Tuple[ChartRecommendation, Union[ChartData, ChartError]]] = []
    for rec in plan.recommendations[:max_charts]:
        try:
            chart_data = build_chart(
                job_id=job_id,
                user_id=user_id,
                spec=rec.spec,
                page_options=page_options,
                storage=storage,
            )
            results.append((rec, chart_data))
        except ChartError as ce:
            logger.warning("Auto-visualize chart %s failed: %s", rec.id, ce)
            results.append((rec, ce))
        except Exception as e:
            logger.exception("Unexpected error building chart %s: %s", rec.id, e)
            results.append((rec, ChartError(str(e))))

    return results


def chart_from_text(
    job_id: str,
    user_id: str = "anonymous",
    request: str = "",
    storage: Optional[JobStorage] = None,
    page_options: Optional[PageDataOptions] = None,
    history: Optional[List[Any]] = None,
    llm_client: Optional[LLMClient] = None,
    limits: Optional[ChartsAILimits] = None,
    rate_limiter: Optional[ChartsAIRateLimiter] = None,
) -> ChartFromTextResult:
    """Translate natural-language plain text into a validated ChartSpec and execute it (Section 10.6)."""
    t0 = time.perf_counter()
    lim = limits or ChartsAILimits()
    rl = rate_limiter or default_charts_ai_rate_limiter

    # 1. Clean and validate request
    clean_req = sanitize_request_text(request, max_chars=lim.max_request_chars)

    if not lim.enabled:
        return ChartFromTextResult(
            status="error",
            request=clean_req,
            message="Chart AI features are currently disabled by configuration.",
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    # 2. Rate limiting
    rl.check_and_record(user_id=user_id, limits=lim)

    # 3. Context & schema
    stats = get_column_stats(job_id=job_id, user_id=user_id, storage=storage)
    schema = {s.name: s.type for s in stats}
    context_str = build_chart_ai_context(
        job_id=job_id,
        user_id=user_id,
        storage=storage,
        page_options=page_options,
        limits=lim,
    )

    client = llm_client or get_default_llm_client(limits=lim)
    system_prompt = build_ask_system_prompt()
    user_prompt = build_ask_user_prompt(context_str, clean_req)

    # 4. Generate response
    try:
        resp: LLMChartRequestResponse = client.generate_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=LLMChartRequestResponse,
        )
    except RateLimitError as rle:
        rl.trigger_quota_cooldown(lim.quota_backoff_seconds)
        return ChartFromTextResult(
            status="error",
            request=clean_req,
            message="AI chart request limit reached. Please wait a moment before trying again.",
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )
    except Exception as e:
        logger.warning("Error calling LLM for chart_from_text: %s", e)
        return ChartFromTextResult(
            status="error",
            request=clean_req,
            message="Could not generate chart. Please try describing your request differently or use 'Add chart'.",
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    # 5. Handle clarify and cannot_chart actions
    if resp.action == "clarify":
        return ChartFromTextResult(
            status="needs_clarification",
            request=clean_req,
            clarification_question=strip_html_and_control_chars(resp.clarification_question or "Could you clarify what data you would like to chart?"),
            explanation=strip_html_and_control_chars(resp.explanation),
            assumptions=[strip_html_and_control_chars(a) for a in resp.assumptions],
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    if resp.action == "cannot_chart":
        return ChartFromTextResult(
            status="cannot_chart",
            request=clean_req,
            message=strip_html_and_control_chars(resp.reason or "This request cannot be visualized as a single chart. Try querying in the SQL box or Ask AI, then click 'Chart this result'."),
            assumptions=[strip_html_and_control_chars(a) for a in resp.assumptions],
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    # 6. Action is chart: convert and validate
    if not resp.spec:
        return ChartFromTextResult(
            status="error",
            request=clean_req,
            message="The AI did not propose a chart specification.",
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    spec: Optional[ChartSpec] = None
    retried = False

    try:
        spec = convert_llm_spec(resp.spec, schema, title=resp.title)
    except InvalidChartSpecError as ve:
        # One repair retry
        logger.info("Chart request spec invalid (%s). Attempting repair retry...", ve)
        retried = True
        try:
            repair_prompt = build_repair_prompt(
                context=context_str,
                previous_output=str(resp.model_dump_json()),
                error_messages=[str(ve)],
            )
            retry_resp: LLMChartRequestResponse = client.generate_structured(
                system_prompt=system_prompt,
                user_prompt=repair_prompt,
                response_model=LLMChartRequestResponse,
            )
            if retry_resp.spec:
                spec = convert_llm_spec(retry_resp.spec, schema, title=retry_resp.title or resp.title)
        except Exception as retry_err:
            logger.warning("Repair retry failed: %s", retry_err)

    if spec is None:
        return ChartFromTextResult(
            status="error",
            request=clean_req,
            message="Could not create a valid chart for that description. Try clicking 'Add chart' and adjust it using the Tweak panel.",
            retried=retried,
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    # 7. Execute chart build
    try:
        chart_data = build_chart(
            job_id=job_id,
            user_id=user_id,
            spec=spec,
            page_options=page_options,
            storage=storage,
        )
    except Exception as e:
        logger.warning("Build chart execution failed for chart_from_text: %s", e)
        return ChartFromTextResult(
            status="error",
            request=clean_req,
            spec=spec,
            title=strip_html_and_control_chars(resp.title),
            message=f"Chart query execution failed: {e}",
            retried=retried,
            elapsed_seconds=round(time.perf_counter() - t0, 3),
        )

    return ChartFromTextResult(
        status="ok",
        request=clean_req,
        spec=spec,
        title=strip_html_and_control_chars(resp.title),
        explanation=strip_html_and_control_chars(resp.explanation),
        assumptions=[strip_html_and_control_chars(a) for a in resp.assumptions],
        data=chart_data,
        retried=retried,
        elapsed_seconds=round(time.perf_counter() - t0, 3),
    )
