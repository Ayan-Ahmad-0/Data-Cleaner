"""End-to-end AI recipe generation with validation retry and safe fallback."""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
from core.ai.fallback import MinimalSafeRecipeGenerator
from core.ai.prompts import build_recipe_prompt, clean_profile_for_prompt
from core.recipe_schema import Recipe
from core.validator import RecipeValidator, RecipeValidationError

logger = logging.getLogger(__name__)


@dataclass
class AIReportResult:
    report_markdown: str
    recipe: Recipe
    recipe_dict: Dict[str, Any]
    recipe_plain_english: List[str]
    open_questions: List[str]
    is_fallback: bool
    retried: bool = False
    tokens_used: int = 0


class AIRecipeGenerator:
    """Orchestrates AI analysis with schema validation retry and guaranteed fallback."""

    def __init__(
        self,
        llm_client: Optional[Callable[[str, str], str]] = None,
        privacy_mode: bool = False,
    ) -> None:
        self.llm_client = llm_client
        self.privacy_mode = privacy_mode

    def generate_report_and_recipe(
        self,
        profile_data: Dict[str, Any],
    ) -> AIReportResult:
        """
        Produce a plain-English report, draft recipe, and open questions.
        Retries once on validation failure before cleanly falling back.
        """
        # If no external LLM client configured, use the deterministic fallback directly
        if self.llm_client is None:
            recipe, report_md, questions = MinimalSafeRecipeGenerator.generate(profile_data)
            plain_english = RecipeValidator.render_plain_english(recipe)
            return AIReportResult(
                report_markdown=report_md,
                recipe=recipe,
                recipe_dict=recipe.model_dump(),
                recipe_plain_english=plain_english,
                open_questions=questions,
                is_fallback=True,
                retried=False,
                tokens_used=0,
            )

        system_prompt, user_prompt = build_recipe_prompt(
            profile_data, privacy_mode=self.privacy_mode
        )

        retried = False
        try:
            # Turn 1: Initial Generation
            raw_response = self.llm_client(system_prompt, user_prompt)
            data = json.loads(raw_response)

            try:
                recipe = RecipeValidator.validate_recipe(data.get("recipe", {}), profile_data)
                report_md = data.get("report_markdown", "# Data Quality Report\n")
                questions = data.get("open_questions", [])
                plain_english = RecipeValidator.render_plain_english(recipe)

                return AIReportResult(
                    report_markdown=report_md,
                    recipe=recipe,
                    recipe_dict=recipe.model_dump(),
                    recipe_plain_english=plain_english,
                    open_questions=questions,
                    is_fallback=False,
                    retried=False,
                )
            except RecipeValidationError as val_err:
                # Turn 2: Retry once with validation error feedback
                logger.warning("AI draft failed validation: %s. Retrying once...", val_err)
                retried = True
                retry_prompt = (
                    f"{user_prompt}\n\n"
                    f"PREVIOUS ATTEMPT FAILED VALIDATION:\n{val_err}\n"
                    "Please correct the error, ensure all column names exist in the profile, "
                    "and emit strictly valid JSON adhering to the recipe schema."
                )
                retry_response = self.llm_client(system_prompt, retry_prompt)
                retry_data = json.loads(retry_response)

                recipe = RecipeValidator.validate_recipe(retry_data.get("recipe", {}), profile_data)
                report_md = retry_data.get("report_markdown", "# Data Quality Report\n")
                questions = retry_data.get("open_questions", [])
                plain_english = RecipeValidator.render_plain_english(recipe)

                return AIReportResult(
                    report_markdown=report_md,
                    recipe=recipe,
                    recipe_dict=recipe.model_dump(),
                    recipe_plain_english=plain_english,
                    open_questions=questions,
                    is_fallback=False,
                    retried=True,
                )

        except Exception as e:
            logger.error("AI recipe generation failed or timed out: %s. Engaging safe fallback.", e)
            recipe, report_md, questions = MinimalSafeRecipeGenerator.generate(profile_data)
            plain_english = RecipeValidator.render_plain_english(recipe)
            return AIReportResult(
                report_markdown=report_md,
                recipe=recipe,
                recipe_dict=recipe.model_dump(),
                recipe_plain_english=plain_english,
                open_questions=questions,
                is_fallback=True,
                retried=retried,
            )
