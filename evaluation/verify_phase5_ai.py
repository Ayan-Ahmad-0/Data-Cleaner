"""Verification script for Phase 5 across 3 corrupted base datasets."""

import json
import sys
from pathlib import Path

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.ai.generator import AIRecipeGenerator
from core.converter import Converter
from core.profiler import Profiler
from core.validator import RecipeValidator
from evaluation.datasets.generator import generate_events, generate_transactions, generate_reviews
from evaluation.injector import CorruptionInjector, InjectionConfig


def test_ai_on_dataset(dataset_name: str, generate_func, target_dir: Path):
    print(f"\n--- Testing AI Recipe Generation on: {dataset_name.upper()} ---")
    clean_csv = target_dir / f"clean_{dataset_name}.csv"
    corrupt_csv = target_dir / f"corrupt_{dataset_name}.csv"
    manifest_json = target_dir / f"manifest_{dataset_name}.json"
    parquet_path = target_dir / f"staged_{dataset_name}.parquet"

    # 1. Generate & Corrupt
    generate_func(clean_csv, num_rows=10_000, seed=42)
    injector = CorruptionInjector(config=InjectionConfig(seed=42))
    injector.inject_from_file(clean_csv, corrupt_csv, manifest_json)

    # 2. Convert & Profile
    conv = Converter()
    conv.convert(corrupt_csv, parquet_path)
    profiler = Profiler()
    profile = profiler.profile_parquet(parquet_path, corrupt_csv)
    p_dict = profile.to_dict()

    # 3. AI Generation
    ai_gen = AIRecipeGenerator()
    result = ai_gen.generate_report_and_recipe(p_dict)

    # 4. Assert recipe validity
    validated = RecipeValidator.validate_recipe(result.recipe_dict, p_dict)
    assert validated is not None
    assert len(result.recipe_plain_english) > 0
    assert len(result.open_questions) > 0

    print(f"  [OK] Recipe successfully validated with {len(result.recipe.columns)} column rules.")
    print(f"  [OK] Identified {len(result.open_questions)} open confirmation question(s).")
    print(f"  [OK] Generated {len(result.recipe_plain_english)} plain-English cleaning step(s).")
    for q in result.open_questions:
        print(f"    - Question: {q}")


def run_phase5_verification():
    eval_dir = Path("data/evaluation/phase5_test")
    eval_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print(" PHASE 5 VERIFICATION: AI Recipe Drafting on 3 Base Datasets")
    print("=" * 70)

    test_ai_on_dataset("events", generate_events, eval_dir)
    test_ai_on_dataset("transactions", generate_transactions, eval_dir)
    test_ai_on_dataset("reviews", generate_reviews, eval_dir)

    print("\n" + "=" * 70)
    print(" ALL 3 DATASETS PRODUCED VALID RECIPES AND CONFIRMATION QUESTIONS")
    print("=" * 70)


if __name__ == "__main__":
    run_phase5_verification()
