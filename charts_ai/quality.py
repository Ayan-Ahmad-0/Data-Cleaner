"""Quality filtering, deduplication, variety caps, and fallback merging for Chart AI (Section 10.4)."""

from __future__ import annotations
from typing import List, Tuple
from charts.spec import ChartSpec
from charts_ai.models import ChartRecommendation


def get_spec_signature(spec: ChartSpec) -> Tuple:
    """Deterministic signature to detect duplicate charts."""
    x_col = spec.x.column if spec.x else None
    y_col = spec.y.column if spec.y else None
    color_col = spec.color.column if spec.color else None
    filter_keys = tuple(sorted((f.column, f.op) for f in spec.filters))
    return (spec.chart_type, x_col, y_col, color_col, spec.aggregation, filter_keys)


def post_process_recommendations(
    raw_recs: List[ChartRecommendation],
    max_total: int = 10,
) -> List[ChartRecommendation]:
    """Deduplicate, enforce variety caps (<=1 pie, <=2 histograms), sort by priority, and assign stable IDs."""
    seen_signatures = set()
    filtered: List[ChartRecommendation] = []
    pie_count = 0
    hist_count = 0

    # Sort primarily by model priority
    sorted_recs = sorted(raw_recs, key=lambda r: r.priority)

    for rec in sorted_recs:
        sig = get_spec_signature(rec.spec)
        if sig in seen_signatures:
            continue

        # Variety caps
        if rec.spec.chart_type in ("pie", "donut"):
            if pie_count >= 2:
                continue
            pie_count += 1
        elif rec.spec.chart_type == "histogram":
            if hist_count >= 2:
                continue
            hist_count += 1

        seen_signatures.add(sig)
        filtered.append(rec)
        if len(filtered) >= max_total:
            break

    # Assign stable IDs
    for idx, r in enumerate(filtered, 1):
        r.id = f"rec_{idx}"
        r.priority = idx

    return filtered


def merge_fallback_recommendations(
    recs: List[ChartRecommendation],
    fallback_specs: List[ChartSpec],
    min_required: int = 3,
    target_count: int = 6,
) -> Tuple[List[ChartRecommendation], bool]:
    """If recommendations are fewer than min_required, merge in standard suggestions."""
    if len(recs) >= min_required and len(recs) > 0:
        return recs, False

    existing_sigs = {get_spec_signature(r.spec) for r in recs}
    merged = list(recs)

    for spec in fallback_specs:
        sig = get_spec_signature(spec)
        if sig not in existing_sigs:
            existing_sigs.add(sig)
            title = spec.title or f"{spec.chart_type.capitalize()} Analysis"
            q_answered = f"What is the distribution or pattern of {spec.x.column if spec.x else 'the data'}?"
            merged.append(
                ChartRecommendation(
                    id=f"rec_{len(merged) + 1}",
                    spec=spec,
                    title=title,
                    question_answered=q_answered,
                    why="Rule-based statistical chart recommendation.",
                    caveats=[],
                    priority=len(merged) + 1,
                    source="standard",
                )
            )
            if len(merged) >= target_count:
                break

    # Re-index IDs
    for idx, r in enumerate(merged, 1):
        r.id = f"rec_{idx}"
        r.priority = idx

    return merged, True
