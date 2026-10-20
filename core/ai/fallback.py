"""Deterministic minimal safe recipe generator and heuristic analyzer."""

from __future__ import annotations
from typing import Any, Dict, List, Tuple
from core.recipe_schema import (
    CastTypeConfig,
    ClipOutliersConfig,
    ColumnRule,
    DedupeConfig,
    HandleNullsConfig,
    ParseTimestampConfig,
    Recipe,
    TrimAndNormalizeConfig,
)


class MinimalSafeRecipeGenerator:
    """
    Constructs a conservative, guaranteed-valid fallback cleaning recipe
    directly from statistical profile metadata without an external LLM.
    """

    @staticmethod
    def generate(profile_data: Dict[str, Any]) -> Tuple[Recipe, str, List[str]]:
        columns_meta = profile_data.get("columns", {})
        duplicates_meta = profile_data.get("duplicates", {})
        file_meta = profile_data.get("file", {})

        column_rules: Dict[str, ColumnRule] = {}
        confirmations: List[str] = []
        open_questions: List[str] = []
        findings: List[str] = []

        # 1. Exact duplicates
        dedupe_config = None
        exact_dups = duplicates_meta.get("exact_rows", 0)
        if exact_dups > 0:
            candidate_keys = [
                col for col, meta in columns_meta.items() if meta.get("candidate_key")
            ]
            chosen_key = candidate_keys[0] if candidate_keys else list(columns_meta.keys())[0]
            dedupe_config = DedupeConfig(keys=[chosen_key], keep="latest")
            findings.append(
                f"- **Exact Duplicates**: {exact_dups:,} duplicate rows detected ({duplicates_meta.get('exact_pct', 0)}%)."
            )
            confirmations.append(f"dedupe.keys ({chosen_key})")
            open_questions.append(
                f"Confirm deduplication key: Is `{chosen_key}` the correct unique identifier to deduplicate on?"
            )

        # 2. Column-by-column inspections
        for col_name, meta in columns_meta.items():
            rule = ColumnRule()
            has_rule = False

            # Strings: whitespace & null tokens
            null_tokens = meta.get("null_tokens", {})
            ws_issues = meta.get("whitespace_issues", 0)
            if null_tokens or ws_issues > 0:
                tokens_list = [k for k in null_tokens.keys() if k != "<empty>"]
                rule.trim_and_normalize = TrimAndNormalizeConfig(
                    trim=True,
                    case=None,
                    null_tokens=tokens_list if tokens_list else ["N/A", "none", "null", "-"],
                )
                has_rule = True
                if null_tokens:
                    token_str = ", ".join(f"'{t}'" for t in tokens_list)
                    findings.append(
                        f"- **`{col_name}`**: Found {sum(null_tokens.values()):,} pseudo-null tokens ({token_str})."
                    )
                if ws_issues > 0:
                    findings.append(
                        f"- **`{col_name}`**: Found {ws_issues:,} values with leading or trailing whitespace."
                    )

            # Dates & Timestamps
            formats = meta.get("formats", [])
            if meta.get("inferred_type") == "timestamp" and formats:
                fmt_strings = [f["format"] for f in formats]
                rule.parse_timestamp = ParseTimestampConfig(
                    formats=fmt_strings,
                    source_tz="UTC",
                )
                has_rule = True
                findings.append(
                    f"- **`{col_name}`**: Detected {len(formats)} timestamp format variants."
                )

                if meta.get("day_month_ambiguous"):
                    confirmations.append(f"{col_name}.day_month_order")
                    open_questions.append(
                        f"Day/Month Order in `{col_name}`: Values parse as both DD/MM and MM/DD. Please confirm precedence."
                    )

            # Numeric negatives, outliers, and casting
            if meta.get("inferred_type") in ("integer", "double"):
                target_type = "double" if meta.get("inferred_type") == "double" or meta.get("decimals") else "bigint"
                rule.cast_type = CastTypeConfig(type=target_type)
                has_rule = True

                negs = meta.get("negatives", 0)
                if negs > 0:
                    rule.clip_outliers = ClipOutliersConfig(
                        min=0.0,
                        max=meta.get("max"),
                        action="null",
                    )
                    rule.handle_nulls = HandleNullsConfig(strategy="fill_median")
                    findings.append(
                        f"- **`{col_name}`**: Detected {negs:,} unexpected negative values (&lt; 0)."
                    )
                    confirmations.append(f"{col_name}.negative_imputation")
                    open_questions.append(
                        f"Imputation for `{col_name}`: Propose filling nullified negative values with median ({meta.get('median')}). Approve or specify override."
                    )

            if has_rule:
                column_rules[col_name] = rule

        recipe = Recipe(
            version=1,
            dedupe=dedupe_config,
            columns=column_rules,
            confirmations_required=confirmations,
        )

        # Markdown report
        report_md = f"""# Data Quality Report

## Dataset Summary
- **Total Rows**: {file_meta.get('rows', 0):,}
- **Columns**: {file_meta.get('columns', 0)}
- **File Size**: {file_meta.get('size_gb', 0)} GB

## Key Findings Ranked by Severity
{chr(10).join(findings) if findings else "- No significant data quality issues detected."}

## Proposed Actions
A minimal conservative cleaning recipe was generated targeting duplicate removal, token normalization, and safe boundary enforcement.
"""
        return recipe, report_md, open_questions
