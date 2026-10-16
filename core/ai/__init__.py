"""AI report generation, recipe drafting, and safe fallback pipeline."""

from core.ai.prompts import build_recipe_prompt, clean_profile_for_prompt
from core.ai.fallback import MinimalSafeRecipeGenerator
from core.ai.generator import AIRecipeGenerator, AIReportResult

__all__ = [
    "build_recipe_prompt",
    "clean_profile_for_prompt",
    "MinimalSafeRecipeGenerator",
    "AIRecipeGenerator",
    "AIReportResult",
]
