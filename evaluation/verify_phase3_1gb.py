"""Verification script for Phase 3: Validate, compile, and execute on 1 GB benchmark."""

import sys
import time
from pathlib import Path

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.compiler import RecipeCompiler
from core.recipe_schema import Recipe
from core.validator import RecipeValidator


def run_phase3_benchmark():
    benchmark_dir = Path("data/benchmarks")
    in_parquet = benchmark_dir / "events_1gb.parquet"
    out_parquet = benchmark_dir / "events_1gb_cleaned.parquet"

    if not in_parquet.exists():
        print(f"Error: {in_parquet} not found. Run create_benchmarks.py first.")
        return

    print("=" * 70)
    print(" PHASE 3 DONE CRITERION: Validate, Compile & Clean 1 GB Dataset")
    print("=" * 70)

    # 1. Hand-written recipe
    recipe_dict = {
        "version": 1,
        "dedupe": {
            "keys": ["event_id"],
            "keep": "latest",
            "order_by": "timestamp"
        },
        "columns": {
            "platform": {
                "trim_and_normalize": {
                    "trim": True,
                    "case": "lower",
                    "null_tokens": ["N/A", "none", "null", "-"]
                }
            },
            "timestamp": {
                "parse_timestamp": {
                    "formats": ["%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y/%m/%d"],
                    "source_tz": "UTC"
                }
            },
            "session_duration_sec": {
                "cast_type": {"type": "integer"},
                "clip_outliers": {"min": 0, "max": 3600, "action": "clamp"},
                "handle_nulls": {"strategy": "fill_median"}
            }
        },
        "confirmations_required": ["timestamp.day_month_order"]
    }

    print("\n[1/4] Validating Recipe against Pydantic schema...")
    recipe = RecipeValidator.validate_recipe(recipe_dict)
    print("      Recipe successfully validated!")

    print("\n[2/4] Rendering Plain-English Instructions:")
    descriptions = RecipeValidator.render_plain_english(recipe)
    for i, desc in enumerate(descriptions, 1):
        print(f"      {i}. {desc}")

    print("\n[3/4] Compiling Recipe to DuckDB CTE Chain SQL...")
    compiler = RecipeCompiler(memory_limit="4GB", threads=4)

    print(f"\n[4/4] Executing cleaning on {in_parquet.name} ({in_parquet.stat().st_size / (1024*1024):.2f} MB)...")
    result = compiler.execute_clean(recipe, in_parquet, out_parquet)

    print("\n" + "=" * 70)
    print(" CLEANING EXECUTION COMPLETE")
    print("=" * 70)
    print(f" Rows in:          {result.rows_in:,}")
    print(f" Rows out:         {result.rows_out:,}")
    print(f" Rows dropped:     {result.rows_dropped:,}")
    print(f" Execution time:   {result.duration_seconds:.2f} seconds")
    print(f" Throughput:       {result.rows_in / result.duration_seconds:,.0f} rows/sec")
    print(f" Output file size: {result.output_size_bytes / (1024*1024):.2f} MB")
    print("=" * 70)


if __name__ == "__main__":
    run_phase3_benchmark()
