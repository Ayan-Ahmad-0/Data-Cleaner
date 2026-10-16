"""Recipe validation against dataset profile and plain-English translation."""

from __future__ import annotations
import json
from typing import Any, Dict, List, Optional, Tuple
from pydantic import ValidationError
from core.recipe_schema import Recipe


class RecipeValidationError(Exception):
    """Raised when a cleaning recipe fails validation checks."""
    pass


class RecipeValidator:
    """Validates recipes against schema and dataset profile."""

    @staticmethod
    def validate_recipe(
        recipe_dict: Dict[str, Any],
        profile_dict: Optional[Dict[str, Any]] = None,
    ) -> Recipe:
        """Parse, validate against Pydantic schema, and check profile consistency."""
        try:
            recipe = Recipe.model_validate(recipe_dict)
        except ValidationError as e:
            raise RecipeValidationError(f"Recipe schema validation failed: {e}")

        # Check against profile if provided
        if profile_dict:
            available_cols = set(profile_dict.get("columns", {}).keys())

            # Verify dedupe keys and order_by
            if recipe.dedupe:
                for key in recipe.dedupe.keys:
                    if key not in available_cols:
                        raise RecipeValidationError(
                            f"Dedupe key '{key}' does not exist in dataset columns: {available_cols}"
                        )
                if recipe.dedupe.order_by and recipe.dedupe.order_by not in available_cols:
                    raise RecipeValidationError(
                        f"Dedupe order_by column '{recipe.dedupe.order_by}' does not exist in dataset."
                    )

            # Verify column rules
            for col_name, rule in recipe.columns.items():
                if col_name not in available_cols:
                    raise RecipeValidationError(
                        f"Recipe references column '{col_name}', but it was not found in dataset profile."
                    )

        return recipe

    @staticmethod
    def render_plain_english(recipe: Recipe) -> List[str]:
        """Convert a recipe into human-readable plain-English instructions."""
        descriptions: List[str] = []

        if recipe.dedupe:
            keys_str = ", ".join(f"`{k}`" for k in recipe.dedupe.keys)
            order_str = f" ordered by `{recipe.dedupe.order_by}`" if recipe.dedupe.order_by else ""
            descriptions.append(
                f"Deduplicate rows partitioned by {keys_str}, keeping the {recipe.dedupe.keep} record{order_str}."
            )

        for col_name, rule in recipe.columns.items():
            if rule.trim_and_normalize:
                cfg = rule.trim_and_normalize
                case_str = f", normalize case to {cfg.case}" if cfg.case else ""
                tokens_str = f", converting tokens {cfg.null_tokens} to NULL" if cfg.null_tokens else ""
                descriptions.append(
                    f"Trim whitespace on `{col_name}`{case_str}{tokens_str}."
                )

            if rule.parse_timestamp:
                cfg = rule.parse_timestamp
                fmts = " and ".join(cfg.formats)
                descriptions.append(
                    f"Parse `{col_name}` using formats {fmts}, interpreted in {cfg.source_tz} timezone."
                )

            if rule.cast_type:
                descriptions.append(
                    f"Cast `{col_name}` to {rule.cast_type.type.upper()}."
                )

            if rule.clip_outliers:
                cfg = rule.clip_outliers
                bounds = []
                if cfg.min is not None:
                    bounds.append(f"min {cfg.min}")
                if cfg.max is not None:
                    bounds.append(f"max {cfg.max}")
                bounds_str = " and ".join(bounds)
                descriptions.append(
                    f"Clip outliers in `{col_name}` outside {bounds_str} (action: {cfg.action})."
                )

            if rule.handle_nulls:
                cfg = rule.handle_nulls
                if cfg.strategy == "fill_value":
                    val_str = f"with '{cfg.value}'"
                elif cfg.strategy == "fill_median":
                    val_str = "with column median"
                elif cfg.strategy == "fill_mode":
                    val_str = "with column mode"
                elif cfg.strategy == "drop_row":
                    val_str = "by dropping the row"
                else:
                    val_str = "by flagging"
                descriptions.append(
                    f"Handle NULLs in `{col_name}` {val_str}."
                )

        return descriptions
