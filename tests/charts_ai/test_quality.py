"""Tests for quality filtering, variety caps, and fallback merging."""

import pytest
from charts.spec import ChartSpec, FieldRef
from charts_ai.models import ChartRecommendation
from charts_ai.quality import post_process_recommendations, merge_fallback_recommendations


def test_post_process_deduplication():
    spec1 = ChartSpec(chart_type="bar", x=FieldRef(column="cat"), aggregation="count")
    spec2 = ChartSpec(chart_type="bar", x=FieldRef(column="cat"), aggregation="count")
    recs = [
        ChartRecommendation(id="1", spec=spec1, title="Chart 1", question_answered="Q1", why="Why 1", priority=1),
        ChartRecommendation(id="2", spec=spec2, title="Chart 2", question_answered="Q2", why="Why 2", priority=2),
    ]
    processed = post_process_recommendations(recs)
    assert len(processed) == 1
    assert processed[0].id == "rec_1"


def test_variety_caps():
    # 2 pies, 3 histograms
    recs = [
        ChartRecommendation(id="p1", spec=ChartSpec(chart_type="pie", x=FieldRef(column="c1"), aggregation="count"), title="Pie 1", question_answered="", why="", priority=1),
        ChartRecommendation(id="p2", spec=ChartSpec(chart_type="pie", x=FieldRef(column="c2"), aggregation="count"), title="Pie 2", question_answered="", why="", priority=2),
        ChartRecommendation(id="h1", spec=ChartSpec(chart_type="histogram", x=FieldRef(column="n1")), title="Hist 1", question_answered="", why="", priority=3),
        ChartRecommendation(id="h2", spec=ChartSpec(chart_type="histogram", x=FieldRef(column="n2")), title="Hist 2", question_answered="", why="", priority=4),
        ChartRecommendation(id="h3", spec=ChartSpec(chart_type="histogram", x=FieldRef(column="n3")), title="Hist 3", question_answered="", why="", priority=5),
    ]
    processed = post_process_recommendations(recs)
    pie_count = sum(1 for r in processed if r.spec.chart_type == "pie")
    hist_count = sum(1 for r in processed if r.spec.chart_type == "histogram")
    assert pie_count == 1  # max 1 pie
    assert hist_count == 2  # max 2 histograms


def test_merge_fallback_recommendations():
    # Only 1 recommendation -> should merge standard specs
    spec1 = ChartSpec(chart_type="bar", x=FieldRef(column="cat"), aggregation="count")
    recs = [ChartRecommendation(id="1", spec=spec1, title="T1", question_answered="Q1", why="W1", priority=1)]
    fallback = [
        ChartSpec(chart_type="line", x=FieldRef(column="dt"), aggregation="count"),
        ChartSpec(chart_type="histogram", x=FieldRef(column="num")),
        ChartSpec(chart_type="hbar", x=FieldRef(column="cat2"), aggregation="count"),
    ]
    merged, used_fallback = merge_fallback_recommendations(recs, fallback, min_required=3, target_count=4)
    assert used_fallback is True
    assert len(merged) == 4
    assert merged[0].source == "ai"
    assert merged[1].source == "standard"
