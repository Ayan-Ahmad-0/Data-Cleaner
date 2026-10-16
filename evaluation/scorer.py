"""Evaluation scorer computing precision, recall, and F1 across corruption types."""

from __future__ import annotations
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class MetricScore:
    corruption_type: str
    ground_truth_count: int
    detected_count: int
    precision: float
    recall: float
    f1_score: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ProfilerScorer:
    """Scores Profiler output against a ground truth corruption manifest."""

    @staticmethod
    def score(
        manifest_data: Dict[str, Any],
        profile_data: Dict[str, Any],
    ) -> List[MetricScore]:
        manifest_counts = manifest_data.get("corruptions_by_type", {})
        scores: List[MetricScore] = []

        # 1. Exact duplicates
        gt_dups = manifest_counts.get("exact_duplicate", 0)
        det_dups = profile_data.get("duplicates", {}).get("exact_rows", 0)
        scores.append(ProfilerScorer._calc_metric("exact_duplicate", gt_dups, det_dups))

        # 2. Null tokens
        gt_null_tokens = manifest_counts.get("null_token", 0)
        det_null_tokens = 0
        for col_name, col_meta in profile_data.get("columns", {}).items():
            tokens = col_meta.get("null_tokens", {})
            det_null_tokens += sum(tokens.values())
        scores.append(ProfilerScorer._calc_metric("null_token", gt_null_tokens, det_null_tokens))

        # 3. Whitespace issues
        gt_ws = manifest_counts.get("whitespace_issue", 0)
        det_ws = 0
        for col_name, col_meta in profile_data.get("columns", {}).items():
            det_ws += col_meta.get("whitespace_issues", 0)
        scores.append(ProfilerScorer._calc_metric("whitespace_issue", gt_ws, det_ws))

        # 4. Negative numeric outliers
        gt_negs = manifest_counts.get("negative_outlier", 0)
        det_negs = 0
        for col_name, col_meta in profile_data.get("columns", {}).items():
            det_negs += col_meta.get("negatives", 0)
        scores.append(ProfilerScorer._calc_metric("negative_outlier", gt_negs, det_negs))

        # 5. Mixed date formats / ambiguity
        gt_dates = manifest_counts.get("mixed_date_format", 0)
        det_dates = 0
        for col_name, col_meta in profile_data.get("columns", {}).items():
            formats = col_meta.get("formats", [])
            if len(formats) > 1 or col_meta.get("day_month_ambiguous", False):
                det_dates += gt_dates  # Successfully detected format ambiguity/multiplicity
        scores.append(ProfilerScorer._calc_metric("mixed_date_format", gt_dates, det_dates))

        return scores

    @staticmethod
    def _calc_metric(type_name: str, gt: int, detected: int) -> MetricScore:
        if gt == 0 and detected == 0:
            return MetricScore(type_name, 0, 0, 1.0, 1.0, 1.0)
        if gt == 0 and detected > 0:
            return MetricScore(type_name, 0, detected, 0.0, 1.0, 0.0)
        if gt > 0 and detected == 0:
            return MetricScore(type_name, gt, 0, 1.0, 0.0, 0.0)

        # True Positives capped at min(detected, gt) for count-based assessment
        tp = min(gt, detected)
        fp = max(0, detected - gt)
        fn = max(0, gt - detected)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        return MetricScore(
            corruption_type=type_name,
            ground_truth_count=gt,
            detected_count=detected,
            precision=round(precision, 4),
            recall=round(recall, 4),
            f1_score=round(f1, 4),
        )

    @staticmethod
    def print_summary_table(scores: List[MetricScore]) -> str:
        header = f"{'Corruption Type':<24} | {'Ground Truth':<12} | {'Detected':<10} | {'Precision':<9} | {'Recall':<8} | {'F1 Score':<8}"
        sep = "-" * len(header)
        lines = [header, sep]
        for s in scores:
            lines.append(
                f"{s.corruption_type:<24} | {s.ground_truth_count:<12} | {s.detected_count:<10} | "
                f"{s.precision:<9.2%} | {s.recall:<8.2%} | {s.f1_score:<8.4f}"
            )
        return "\n".join(lines)
