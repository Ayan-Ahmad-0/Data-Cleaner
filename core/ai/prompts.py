"""Prompt templates and profile formatting for the AI report and recipe drafting step."""

from __future__ import annotations
import copy
import json
from typing import Any, Dict, Tuple
from core.recipe_schema import Recipe

SYSTEM_PROMPT = """You are an expert Data Quality Engineer.
Your task is to analyze a dataset's statistical profile, draft a plain-English report of findings, and construct a conservative data cleaning recipe in JSON format.

CRITICAL CONSTRAINTS:
1. You NEVER write free-form SQL. All transformations MUST strictly use the fixed macro menu:
   - trim_and_normalize: {trim: bool, case: "lower"|"upper"|"title"|null, null_tokens: [str]}
   - cast_type: {type: "integer"|"bigint"|"double"|"boolean"|"varchar"|"date"|"timestamp"}
   - parse_timestamp: {formats: [str], source_tz: str}
   - clip_outliers: {min: float|null, max: float|null, action: "null"|"clamp"}
   - handle_nulls: {strategy: "drop_row"|"fill_value"|"fill_median"|"fill_mode"|"flag", value: any}
   - dedupe: {keys: [str], keep: "first"|"latest"|"all", order_by: str|null}
2. NEVER invent column names. Only reference columns present in the input profile.
3. Mark any business decisions (null imputation, date precedence, dedupe keys) in confirmations_required.
4. Prefer conservative actions over destructive actions.
5. Output MUST be valid JSON adhering to the specified schema.
"""


from core.privacy.detector import PiiDetector
from core.privacy.masking import mask_value


def clean_profile_for_prompt(profile_data: Dict[str, Any], privacy_mode: bool = False) -> Dict[str, Any]:
    """Scrub raw sample values if privacy_mode is active or if PII is detected."""
    cleaned = copy.deepcopy(profile_data)
    for col_name, col_meta in cleaned.get("columns", {}).items():
        if "sample_values" in col_meta and col_meta["sample_values"]:
            if privacy_mode:
                col_meta["sample_values"] = []
            else:
                # Auto-detect sensitive PII in samples even if privacy_mode is False
                detected = PiiDetector.scan_column(col_name, col_meta["sample_values"])
                if detected and detected.confidence >= 0.5:
                    col_meta["sample_values"] = [
                        mask_value(v, detected.entity_type, strategy=detected.suggested_strategy)
                        for v in col_meta["sample_values"]
                    ]
                    col_meta["pii_detected"] = detected.to_dict()
    return cleaned


def build_recipe_prompt(profile_data: Dict[str, Any], privacy_mode: bool = False) -> Tuple[str, str]:
    """Construct system and user prompts with schema grounding."""
    cleaned_profile = clean_profile_for_prompt(profile_data, privacy_mode=privacy_mode)
    schema_json = json.dumps(Recipe.get_json_schema(), indent=2)

    user_prompt = f"""Dataset Statistical Profile:
```json
{json.dumps(cleaned_profile, indent=2)}
```

Target Recipe JSON Schema:
```json
{schema_json}
```

Instructions:
1. Analyze the dataset profile.
2. Formulate a plain-English report detailing findings ranked by severity.
3. Propose a structured cleaning recipe matching the Target Recipe JSON Schema.
4. List any open questions or ambiguous decisions that require human approval in `confirmations_required`.

Respond with a JSON object containing:
{{
  "report_markdown": "<plain-English markdown report>",
  "recipe": <JSON recipe strictly adhering to the schema>,
  "open_questions": ["<question 1>", "<question 2>"]
}}
"""
    return SYSTEM_PROMPT, user_prompt
