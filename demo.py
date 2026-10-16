"""End-to-End Autonomous Pipeline Demo.

Generates a synthetic dirty dataset, converts to Parquet, profiles it,
generates an AI cleaning recipe, compiles vectorized DuckDB CTE SQL,
executes the cleaning, and runs automated verification.
"""

from __future__ import annotations
import json
import os
import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
from core.ai.gemini_client import get_gemini_callable
from core.ai.generator import AIRecipeGenerator, AIReportResult
from core.compiler import RecipeCompiler
from core.converter import Converter
from core.profiler import Profiler
from core.recipe_schema import Recipe
from core.validator import RecipeValidator
from core.verifier import Verifier, VerificationResult
from evaluation.datasets.generator import generate_events
from evaluation.injector import CorruptionInjector, InjectionConfig


def run_pipeline_demo(num_rows: int = 25000) -> None:
    print("=" * 70)
    print("ONE-CLICK AI DATA CLEANER - END-TO-END DEMO")
    print("=" * 70)

    start_total = time.perf_counter()
    demo_dir = Path("data") / "demo"
    demo_dir.mkdir(parents=True, exist_ok=True)

    clean_csv_temp = demo_dir / "clean_events_temp.csv"
    raw_csv = demo_dir / "dirty_events.csv"
    manifest_json = demo_dir / "manifest.json"
    raw_parquet = demo_dir / "dirty_events.parquet"
    clean_parquet = demo_dir / "cleaned_events.parquet"
    clean_csv = demo_dir / "cleaned_events.csv"

    # 1. Synthesize dirty data
    print(f"\n[1/6] Synthesizing {num_rows:,} rows of corrupt test data...")
    generate_events(clean_csv_temp, num_rows=num_rows, seed=42)
    injector = CorruptionInjector(
        InjectionConfig(
            seed=42,
            null_token_rate=0.06,
            exact_duplicate_rate=0.04,
            whitespace_rate=0.06,
            negative_outlier_rate=0.02,
            mixed_date_rate=0.30,
        )
    )
    total_dirty, corruptions = injector.inject_from_file(
        input_csv=clean_csv_temp,
        output_csv=raw_csv,
        manifest_json=manifest_json,
    )
    if clean_csv_temp.exists():
        clean_csv_temp.unlink()

    raw_csv_size = raw_csv.stat().st_size / (1024 * 1024)
    print(f"      Generated CSV: {raw_csv} ({raw_csv_size:.2f} MB, {total_dirty:,} rows)")
    print(f"      Injected defects: {len(corruptions):,} logged to {manifest_json}")

    # 2. Convert to Parquet
    print("\n[2/6] Converting CSV -> Parquet via DuckDB...")
    t0 = time.perf_counter()
    converter = Converter()
    conv_res = converter.convert(raw_csv, raw_parquet)
    t_convert = time.perf_counter() - t0
    parquet_size = raw_parquet.stat().st_size / (1024 * 1024)
    print(f"      Parquet written in {t_convert:.3f}s ({parquet_size:.2f} MB, {conv_res.row_count:,} rows)")

    # 3. Profile Dataset
    print("\n[3/6] Running single-pass DuckDB profiler...")
    t0 = time.perf_counter()
    profiler = Profiler()
    profile_obj = profiler.profile_parquet(raw_parquet)
    profile_dict = profile_obj.to_dict()
    t_profile = time.perf_counter() - t0
    row_count = profile_dict.get("file", {}).get("rows", 0)
    col_count = len(profile_dict.get("columns", {}))
    print(f"      Profiled {row_count:,} rows and {col_count} columns in {t_profile:.3f}s")
    for col_name, col_info in list(profile_dict.get("columns", {}).items())[:3]:
        print(f"        - {col_name}: {col_info.get('inferred_type')} (nulls: {col_info.get('nulls')}, whitespace: {col_info.get('whitespace_issues', 0)})")

    # 4. Generate AI Recipe
    print("\n[4/6] Generating cleaning recipe (AI / Heuristic Safe Fallback)...")
    t0 = time.perf_counter()
    llm_callable = get_gemini_callable()
    generator = AIRecipeGenerator(llm_client=llm_callable, privacy_mode=False)
    ai_result: AIReportResult = generator.generate_report_and_recipe(profile_dict)
    recipe: Recipe = ai_result.recipe
    t_recipe = time.perf_counter() - t0
    
    # Plain English representation
    plain_english = ai_result.recipe_plain_english
    print(f"      Recipe generated in {t_recipe:.3f}s (mode: {'Fallback Heuristics' if ai_result.is_fallback else 'Gemini AI'})")
    print(f"      AI Quality Report excerpt:\n        {ai_result.report_markdown[:140].strip()}...")
    print("      Plain-English Operations:")
    for op in plain_english:
        print(f"        * {op}")

    # 5. Compile and Execute DuckDB CTE Pipeline
    print("\n[5/6] Compiling vectorized DuckDB CTE and executing...")
    t0 = time.perf_counter()
    compiler = RecipeCompiler()
    clean_res = compiler.execute_clean(
        recipe=recipe,
        input_parquet=raw_parquet,
        output_parquet=clean_parquet,
    )
    t_exec = time.perf_counter() - t0

    # Export clean CSV
    clean_pq_escaped = str(clean_parquet).replace("\\", "/")
    clean_csv_escaped = str(clean_csv).replace("\\", "/")
    duckdb.connect().execute(
        f"COPY (SELECT * FROM read_parquet('{clean_pq_escaped}')) TO '{clean_csv_escaped}' (HEADER, DELIMITER ',');"
    )

    throughput = clean_res.rows_out / max(clean_res.duration_seconds, 0.001)
    print(f"      Cleaned in {clean_res.duration_seconds:.3f}s ({clean_res.rows_out:,} rows output)")
    print(f"      Vectorized throughput: {throughput:,.0f} rows/sec")

    # 6. Verify Results
    print("\n[6/6] Running post-clean verification & reconciliation assertions...")
    t0 = time.perf_counter()
    verifier = Verifier()
    verification: VerificationResult = verifier.verify(
        cleaned_parquet_path=clean_parquet,
        before_profile=profile_dict,
        recipe=recipe,
    )
    t_verify = time.perf_counter() - t0
    total_time = time.perf_counter() - start_total

    # Summary Table
    print("\n" + "=" * 70)
    print("DEMO RUN SUMMARY")
    print("=" * 70)
    comp = verification.comparison
    dropped = max(0, comp.rows_before - comp.rows_after)
    pct_dropped = (dropped / max(comp.rows_before, 1)) * 100.0
    print(f"  Input Rows:          {comp.rows_before:,}")
    print(f"  Final Rows:          {comp.rows_after:,}")
    print(f"  Rows Dropped:        {dropped:,} ({pct_dropped:.2f}%)")
    print(f"  Duplicates Removed:  {comp.duplicates_before - comp.duplicates_after:,}")
    print(f"  Verification Status: {verification.status}")
    print(f"  Tests Passed/Failed: {verification.tests_passed}/{verification.tests_failed}")
    print(f"  Total Pipeline Time: {total_time:.3f}s")
    print("-" * 70)
    print("  Verification Checks:")
    for test in verification.test_results:
        mark = "PASS" if test.passed else "WARN"
        print(f"    [{mark}] {test.test_name}: {test.rule_type} on {test.column_name or 'dataset'} -> {test.details}")
    print("=" * 70)
    print(f"Cleaned CSV:     {clean_csv.resolve()}")
    print(f"Cleaned Parquet: {clean_parquet.resolve()}")


if __name__ == "__main__":
    rows = int(sys.argv[1]) if len(sys.argv) > 1 else 25000
    run_pipeline_demo(rows)
