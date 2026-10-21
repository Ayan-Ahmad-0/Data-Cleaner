"""Evaluation set and benchmark runner for AI Analyst natural-language-to-SQL accuracy."""

from __future__ import annotations
from dataclasses import dataclass
import json
import logging
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from analyst.limits import AnalystLimits, AnalystRateLimiter
from analyst.llm.base import LLMClient
from analyst.llm.fake import FakeLLMClient
from analyst.llm.gemini import GeminiClient
from analyst.schemas import AnalystResult, LLMResponse
from analyst.service import ask
from app.storage import JobStorage

logger = logging.getLogger(__name__)


@dataclass
class EvalQuestion:
    """Benchmark test question with expected status, query semantics, or ground truth result."""
    id: str
    question: str
    category: str
    expected_action: str  # "answer" | "clarify" | "cannot_answer"
    expected_sql: Optional[str] = None  # Reference SQL
    expected_first_cell: Optional[Any] = None  # Expected scalar value for assertion if applicable
    canned_llm_response: Optional[LLMResponse] = None  # Used for deterministic mock run


# Comprehensive set of 30 questions covering counts, filters, group-by, top-N, date/time, nulls, percentiles, ambiguity, and non-existent attributes
EVAL_QUESTIONS: List[EvalQuestion] = [
    # 1. Basic Counts & Metadata
    EvalQuestion(
        id="Q01",
        question="How many total trips are in the dataset?",
        category="count",
        expected_action="answer",
        expected_sql="SELECT count(*) FROM data;",
        expected_first_cell=5,
        canned_llm_response=LLMResponse(
            action="answer",
            sql="SELECT count(*) as total_trips FROM data;",
            explanation="Counts total rows in dataset.",
        ),
    ),
    EvalQuestion(
        id="Q02",
        question="How many distinct payment types were recorded?",
        category="count_distinct",
        expected_action="answer",
        expected_sql="SELECT count(DISTINCT payment_type) FROM data;",
        expected_first_cell=3,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT count(DISTINCT "payment_type") as num_payments FROM data;',
            explanation="Counts unique payment types.",
        ),
    ),
    # 2. Filters & Predicates
    EvalQuestion(
        id="Q03",
        question="Show me trips where the fare is greater than 20 dollars.",
        category="filter",
        expected_action="answer",
        expected_sql='SELECT * FROM data WHERE fare_amount > 20 LIMIT 100;',
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT * FROM data WHERE "fare_amount" > 20 LIMIT 100;',
            explanation="Filters trips where fare exceeds $20.",
        ),
    ),
    EvalQuestion(
        id="Q04",
        question="Find all trips that used Cash as payment.",
        category="filter_string",
        expected_action="answer",
        expected_sql="SELECT * FROM data WHERE payment_type = 'Cash' LIMIT 100;",
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT * FROM data WHERE "payment_type" = \'Cash\' LIMIT 100;',
            explanation="Filters trips paid with Cash.",
        ),
    ),
    # 3. Aggregations (Average, Sum, Min, Max, Quantile)
    EvalQuestion(
        id="Q05",
        question="What is the average fare amount across all trips?",
        category="aggregation_avg",
        expected_action="answer",
        expected_sql='SELECT avg(fare_amount) FROM data;',
        expected_first_cell=24.75,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT avg("fare_amount") as avg_fare FROM data;',
            explanation="Computes arithmetic mean of fare_amount.",
        ),
    ),
    EvalQuestion(
        id="Q06",
        question="What is the total sum of all trip distances?",
        category="aggregation_sum",
        expected_action="answer",
        expected_sql='SELECT sum(trip_distance) FROM data;',
        expected_first_cell=30.8,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT sum("trip_distance") as total_distance FROM data;',
            explanation="Sums total distance of trips.",
        ),
    ),
    EvalQuestion(
        id="Q07",
        question="What is the maximum fare recorded?",
        category="aggregation_max",
        expected_action="answer",
        expected_sql='SELECT max(fare_amount) FROM data;',
        expected_first_cell=52.0,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT max("fare_amount") as max_fare FROM data;',
            explanation="Calculates highest fare.",
        ),
    ),
    EvalQuestion(
        id="Q08",
        question="What is the median trip distance?",
        category="percentile",
        expected_action="answer",
        expected_sql='SELECT quantile_cont(trip_distance, 0.5) FROM data;',
        expected_first_cell=4.3,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT quantile_cont("trip_distance", 0.5) as median_distance FROM data;',
            explanation="Computes the median trip distance.",
        ),
    ),
    # 4. Group By & Order By
    EvalQuestion(
        id="Q09",
        question="What is the average fare for each payment type?",
        category="group_by",
        expected_action="answer",
        expected_sql='SELECT payment_type, avg(fare_amount) FROM data GROUP BY payment_type;',
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT "payment_type", avg("fare_amount") as avg_fare FROM data GROUP BY "payment_type" ORDER BY avg_fare DESC;',
            explanation="Calculates average fare by payment type.",
        ),
    ),
    EvalQuestion(
        id="Q10",
        question="What are the top 3 longest trips by distance?",
        category="top_n",
        expected_action="answer",
        expected_sql='SELECT * FROM data ORDER BY trip_distance DESC LIMIT 3;',
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT * FROM data ORDER BY "trip_distance" DESC LIMIT 3;',
            explanation="Sorts trips by distance descending and takes top 3.",
        ),
    ),
    # 5. Date & Time Functions
    EvalQuestion(
        id="Q11",
        question="Which hour of the day had trips starting?",
        category="datetime_hour",
        expected_action="answer",
        expected_sql='SELECT date_part(\'hour\', pickup_datetime) as trip_hour, count(*) FROM data GROUP BY trip_hour;',
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT date_part(\'hour\', "pickup_datetime") as trip_hour, count(*) as count FROM data GROUP BY trip_hour ORDER BY trip_hour;',
            explanation="Groups pickups by hour of day.",
        ),
    ),
    EvalQuestion(
        id="Q12",
        question="How many trips occurred on May 1st, 2026?",
        category="datetime_day",
        expected_action="answer",
        expected_sql="SELECT count(*) FROM data WHERE strftime(pickup_datetime, '%Y-%m-%d') = '2026-05-01';",
        expected_first_cell=2,
        canned_llm_response=LLMResponse(
            action="answer",
            sql="SELECT count(*) as count FROM data WHERE strftime(\"pickup_datetime\", '%Y-%m-%d') = '2026-05-01';",
            explanation="Counts trips occurring on May 1st, 2026.",
        ),
    ),
    # 6. Null Checks & Quality
    EvalQuestion(
        id="Q13",
        question="How many trips have a missing passenger count?",
        category="null_check",
        expected_action="answer",
        expected_sql='SELECT count(*) FROM data WHERE passenger_count IS NULL;',
        expected_first_cell=1,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT count(*) as missing_passengers FROM data WHERE "passenger_count" IS NULL;',
            explanation="Counts rows with null passenger_count.",
        ),
    ),
    EvalQuestion(
        id="Q14",
        question="List all trips that have non-empty notes.",
        category="null_filter",
        expected_action="answer",
        expected_sql='SELECT * FROM data WHERE notes IS NOT NULL LIMIT 100;',
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT * FROM data WHERE "notes" IS NOT NULL LIMIT 100;',
            explanation="Lists trips where notes is not null.",
        ),
    ),
    # 7. Ambiguous Questions (Expect Clarification)
    EvalQuestion(
        id="Q15",
        question="Show me the best trips.",
        category="ambiguity",
        expected_action="clarify",
        canned_llm_response=LLMResponse(
            action="clarify",
            clarification_question="What criteria defines the 'best' trip (e.g. highest fare, longest distance, or passenger count)?",
        ),
    ),
    EvalQuestion(
        id="Q16",
        question="Rank the users.",
        category="ambiguity",
        expected_action="clarify",
        canned_llm_response=LLMResponse(
            action="clarify",
            clarification_question="Should users be ranked by total trips taken, cumulative fare spent, or total distance?",
        ),
    ),
    # 8. Unanswerable & Non-Existent Columns (Expect Cannot Answer)
    EvalQuestion(
        id="Q17",
        question="What is the driver's vehicle model and license plate?",
        category="unanswerable_column",
        expected_action="cannot_answer",
        canned_llm_response=LLMResponse(
            action="cannot_answer",
            reason="Vehicle model and license plate columns do not exist in the dataset.",
        ),
    ),
    EvalQuestion(
        id="Q18",
        question="Which trips had rainy weather?",
        category="unanswerable_concept",
        expected_action="cannot_answer",
        canned_llm_response=LLMResponse(
            action="cannot_answer",
            reason="The dataset does not contain weather or meteorological data.",
        ),
    ),
    EvalQuestion(
        id="Q19",
        question="What was the tip percentage given by passenger?",
        category="unanswerable_column",
        expected_action="cannot_answer",
        canned_llm_response=LLMResponse(
            action="cannot_answer",
            reason="No tip amount or tip percentage column exists in this table.",
        ),
    ),
    EvalQuestion(
        id="Q20",
        question="What is the destination zip code for trip 1?",
        category="unanswerable_column",
        expected_action="cannot_answer",
        canned_llm_response=LLMResponse(
            action="cannot_answer",
            reason="Location or zip code columns are not tracked in this dataset.",
        ),
    ),
    # 9. Additional Multi-Condition & Aggregate Benchmarks
    EvalQuestion(
        id="Q21",
        question="How many trips have distance greater than 5 miles and fare greater than 20 dollars?",
        category="compound_filter",
        expected_action="answer",
        expected_sql="SELECT count(*) FROM data WHERE trip_distance > 5 AND fare_amount > 20;",
        expected_first_cell=2,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT count(*) as count FROM data WHERE "trip_distance" > 5 AND "fare_amount" > 20;',
            explanation="Counts trips exceeding both 5 miles distance and $20 fare.",
        ),
    ),
    EvalQuestion(
        id="Q22",
        question="What was the lowest fare amount paid in any trip?",
        category="aggregation_min",
        expected_action="answer",
        expected_sql="SELECT min(fare_amount) FROM data;",
        expected_first_cell=6.0,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT min("fare_amount") as min_fare FROM data;',
            explanation="Computes the minimum fare amount.",
        ),
    ),
    EvalQuestion(
        id="Q23",
        question="How many trips were paid with Credit payment type?",
        category="filter_string",
        expected_action="answer",
        expected_sql="SELECT count(*) FROM data WHERE payment_type = 'Credit';",
        expected_first_cell=3,
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT count(*) as count FROM data WHERE "payment_type" = \'Credit\';',
            explanation="Counts trips paid with Credit.",
        ),
    ),
    EvalQuestion(
        id="Q24",
        question="What is the total revenue and average distance for each payment type?",
        category="multi_aggregation_groupby",
        expected_action="answer",
        expected_sql="SELECT payment_type, sum(fare_amount) as total_rev, avg(trip_distance) as avg_dist FROM data GROUP BY payment_type;",
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT "payment_type", sum("fare_amount") as total_revenue, avg("trip_distance") as avg_dist FROM data GROUP BY "payment_type";',
            explanation="Calculates total revenue and average distance grouped by payment type.",
        ),
    ),
    EvalQuestion(
        id="Q25",
        question="What is the pickup time of the latest trip recorded?",
        category="datetime_max",
        expected_action="answer",
        expected_sql="SELECT max(pickup_datetime) FROM data;",
        canned_llm_response=LLMResponse(
            action="answer",
            sql='SELECT max("pickup_datetime") as latest_pickup FROM data;',
            explanation="Finds the most recent pickup datetime.",
        ),
    ),
    # 10. Additional Clarification & Honesty Benchmarks
    EvalQuestion(
        id="Q26",
        question="Show me the most interesting records.",
        category="ambiguity",
        expected_action="clarify",
        canned_llm_response=LLMResponse(
            action="clarify",
            clarification_question="What criteria defines an interesting record (e.g. longest distance, highest fare, or disputed payments)?",
        ),
    ),
    EvalQuestion(
        id="Q27",
        question="Which trips are considered cheap?",
        category="ambiguity",
        expected_action="clarify",
        canned_llm_response=LLMResponse(
            action="clarify",
            clarification_question="What fare threshold or percentile should be used to classify a trip as cheap?",
        ),
    ),
    EvalQuestion(
        id="Q28",
        question="Show me the top performance metrics.",
        category="ambiguity",
        expected_action="clarify",
        canned_llm_response=LLMResponse(
            action="clarify",
            clarification_question="Which specific metric would you like to see (e.g. total trips, revenue, or average fare)?",
        ),
    ),
    EvalQuestion(
        id="Q29",
        question="What is the passenger's home street address and zip code?",
        category="unanswerable_column",
        expected_action="cannot_answer",
        canned_llm_response=LLMResponse(
            action="cannot_answer",
            reason="Passenger addresses and zip codes are not tracked in the dataset.",
        ),
    ),
    EvalQuestion(
        id="Q30",
        question="What is the airline flight number connected to each trip?",
        category="unanswerable_concept",
        expected_action="cannot_answer",
        canned_llm_response=LLMResponse(
            action="cannot_answer",
            reason="The dataset does not contain airline or flight data.",
        ),
    ),
]


@dataclass
class EvalReport:
    total_questions: int
    passed_count: int
    failed_count: int
    pass_rate_pct: float
    invalid_sql_count: int
    retried_count: int
    clarify_correct_count: int
    cannot_answer_correct_count: int
    avg_latency_seconds: float
    details: List[Dict[str, Any]]


def run_evaluation_suite(
    job_id: str,
    storage: JobStorage,
    llm_client: LLMClient,
    profile_data: Optional[Dict[str, Any]] = None,
) -> EvalReport:
    """Run all evaluation questions against the analyst pipeline and calculate benchmark metrics."""
    results_detail: List[Dict[str, Any]] = []
    total_passed = 0
    invalid_sql_total = 0
    retried_total = 0
    clarify_correct = 0
    cannot_answer_correct = 0
    latencies: List[float] = []

    rate_limiter = AnalystRateLimiter()
    limits = AnalystLimits(max_questions_per_user_per_minute=1000, max_questions_per_user_per_day=5000)

    for item in EVAL_QUESTIONS:
        t0 = time.perf_counter()
        passed = False
        notes = []
        try:
            res = ask(
                job_id=job_id,
                question=item.question,
                llm_client=llm_client,
                limits=limits,
                storage=storage,
                rate_limiter=rate_limiter,
                profile_data=profile_data,
            )
        except Exception as err:
            logger.warning("Error running question %s: %s", item.id, err)
            res = AnalystResult(status="error", question=item.question, message=str(err))
            notes.append(f"Exception during ask: {err}")

        elapsed = time.perf_counter() - t0
        latencies.append(elapsed)

        if item.expected_action == "answer":
            if res.status == "ok" and res.result is not None:
                passed = True
                if item.expected_first_cell is not None:
                    # Validate scalar output
                    try:
                        actual_val = res.result.rows[0][0]
                        if abs(float(actual_val) - float(item.expected_first_cell)) > 0.01:
                            passed = False
                            notes.append(f"Result {actual_val} did not match expected {item.expected_first_cell}")
                    except Exception as e:
                        passed = False
                        notes.append(f"Value check failed: {e}")
            else:
                passed = False
                invalid_sql_total += 1
                notes.append(f"Expected action answer, got status: {res.status} ({res.message})")

        elif item.expected_action == "clarify":
            if res.status == "needs_clarification":
                passed = True
                clarify_correct += 1
            else:
                passed = False
                notes.append(f"Expected clarification, got {res.status}")

        elif item.expected_action == "cannot_answer":
            if res.status == "cannot_answer":
                passed = True
                cannot_answer_correct += 1
            else:
                passed = False
                notes.append(f"Expected cannot_answer, got {res.status}")

        if res.retried:
            retried_total += 1

        if passed:
            total_passed += 1

        results_detail.append({
            "id": item.id,
            "question": item.question,
            "category": item.category,
            "expected_action": item.expected_action,
            "actual_status": res.status,
            "sql": res.sql,
            "passed": passed,
            "retried": res.retried,
            "elapsed_seconds": round(elapsed, 3),
            "notes": "; ".join(notes),
        })

        if not isinstance(llm_client, FakeLLMClient):
            time.sleep(0.5)

    total = len(EVAL_QUESTIONS)
    pass_rate = (total_passed / total) * 100.0 if total > 0 else 0.0
    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

    return EvalReport(
        total_questions=total,
        passed_count=total_passed,
        failed_count=total - total_passed,
        pass_rate_pct=round(pass_rate, 2),
        invalid_sql_count=invalid_sql_total,
        retried_count=retried_total,
        clarify_correct_count=clarify_correct,
        cannot_answer_correct_count=cannot_answer_correct,
        avg_latency_seconds=round(avg_latency, 3),
        details=results_detail,
    )
