"""Unit tests for Phase 5: AI recipe drafting, prompt construction, and fallback."""

import json
import pytest
from core.ai.prompts import clean_profile_for_prompt, build_recipe_prompt
from core.ai.fallback import MinimalSafeRecipeGenerator
from core.ai.generator import AIRecipeGenerator
from core.recipe_schema import Recipe


@pytest.fixture
def sample_profile():
    return {
        "file": {"rows": 1000, "columns": 3, "size_gb": 0.05},
        "duplicates": {"exact_rows": 25, "exact_pct": 2.5},
        "columns": {
            "event_id": {
                "inferred_type": "string",
                "candidate_key": True,
                "null_tokens": {},
                "whitespace_issues": 0,
                "sample_values": ["evt_1", "evt_2"],
            },
            "signup_date": {
                "inferred_type": "timestamp",
                "candidate_key": False,
                "null_tokens": {"N/A": 15},
                "whitespace_issues": 5,
                "formats": [{"format": "%d/%m/%Y", "match_pct": 50.0}, {"format": "%Y-%m-%d", "match_pct": 50.0}],
                "day_month_ambiguous": True,
                "sample_values": ["01/02/2025", "2025-02-01"],
            },
            "age": {
                "inferred_type": "integer",
                "candidate_key": False,
                "null_tokens": {},
                "whitespace_issues": 0,
                "negatives": 12,
                "median": 30.0,
                "max": 100.0,
                "sample_values": ["25", "-5"],
            }
        }
    }


def test_privacy_mode_scrubbing(sample_profile):
    scrubbed = clean_profile_for_prompt(sample_profile, privacy_mode=True)
    for col_name, meta in scrubbed["columns"].items():
        assert meta["sample_values"] == []

    # Original remains untouched
    assert len(sample_profile["columns"]["event_id"]["sample_values"]) > 0


def test_fallback_recipe_generation(sample_profile):
    recipe, report_md, questions = MinimalSafeRecipeGenerator.generate(sample_profile)

    assert isinstance(recipe, Recipe)
    assert recipe.dedupe is not None
    assert recipe.dedupe.keys == ["event_id"]
    assert "signup_date" in recipe.columns
    assert "age" in recipe.columns
    assert len(questions) >= 2
    assert "Data Quality Report" in report_md


def test_ai_generator_retry_flow(sample_profile):
    call_count = 0

    def mock_flaky_llm(system_p, user_p):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # Return recipe with non-existent column to trigger validation failure
            return json.dumps({
                "report_markdown": "# Bad Report",
                "recipe": {"version": 1, "columns": {"non_existent_column": {}}}
            })
        else:
            # Return valid recipe on retry
            return json.dumps({
                "report_markdown": "# Corrected Report",
                "recipe": {
                    "version": 1,
                    "dedupe": {"keys": ["event_id"], "keep": "latest"},
                    "columns": {
                        "signup_date": {
                            "parse_timestamp": {"formats": ["%d/%m/%Y", "%Y-%m-%d"]}
                        }
                    }
                },
                "open_questions": ["Confirm date order?"]
            })

    generator = AIRecipeGenerator(llm_client=mock_flaky_llm)
    result = generator.generate_report_and_recipe(sample_profile)

    assert call_count == 2
    assert result.retried is True
    assert result.is_fallback is False
    assert result.recipe.dedupe.keys == ["event_id"]


def test_ai_generator_fallback_on_failure(sample_profile):
    def mock_broken_llm(system_p, user_p):
        return "Not valid JSON at all!"

    generator = AIRecipeGenerator(llm_client=mock_broken_llm)
    result = generator.generate_report_and_recipe(sample_profile)

    # Should gracefully fall back
    assert result.is_fallback is True
    assert result.recipe.dedupe.keys == ["event_id"]
    assert len(result.open_questions) > 0
