"""Run baseline evaluation harness experiments and score profiler detection."""

from __future__ import annotations
import json
import os
import sys
from pathlib import Path

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.converter import Converter
from core.profiler import Profiler
from evaluation.datasets.generator import generate_events, generate_transactions
from evaluation.injector import CorruptionInjector, InjectionConfig
from evaluation.scorer import ProfilerScorer


def run_experiment(
    dataset_name: str = "events",
    num_rows: int = 50_000,
    seed: int = 42,
    output_dir: str = "data/evaluation",
) -> None:
    exp_dir = Path(output_dir) / dataset_name
    exp_dir.mkdir(parents=True, exist_ok=True)

    clean_csv = exp_dir / f"clean_{dataset_name}.csv"
    corrupt_csv = exp_dir / f"corrupted_{dataset_name}.csv"
    manifest_json = exp_dir / "manifest.json"
    parquet_file = exp_dir / f"corrupted_{dataset_name}.parquet"
    profile_json = exp_dir / "profile.json"

    print(f"\n==================================================================")
    print(f" EXPERIMENT: {dataset_name.upper()} ({num_rows:,} base rows, seed={seed})")
    print(f"==================================================================")

    # 1. Generate clean dataset
    print(f"[1/4] Generating clean {dataset_name} baseline...")
    if dataset_name == "transactions":
        generate_transactions(clean_csv, num_rows=num_rows, seed=seed)
    else:
        generate_events(clean_csv, num_rows=num_rows, seed=seed)

    # 2. Inject corruptions & generate manifest
    print(f"[2/4] Injecting controlled corruptions and recording manifest...")
    config = InjectionConfig(
        seed=seed,
        null_token_rate=0.04,
        exact_duplicate_rate=0.03,
        whitespace_rate=0.05,
        negative_outlier_rate=0.02,
        mixed_date_rate=0.25,
    )
    injector = CorruptionInjector(config=config)
    total_corrupted_rows, manifest = injector.inject_from_file(
        input_csv=clean_csv,
        output_csv=corrupt_csv,
        manifest_json=manifest_json,
    )
    print(f"      Total rows after corruption: {total_corrupted_rows:,}")
    print(f"      Total injected corruption events: {len(manifest):,}")

    # 3. Convert and Profile
    print(f"[3/4] Running Converter and Profiler on corrupted dataset...")
    conv = Converter(memory_limit="4GB", threads=4)
    conv.convert(corrupt_csv, parquet_file)

    profiler = Profiler(memory_limit="4GB", threads=4)
    profile = profiler.profile_parquet(parquet_file, corrupt_csv)
    p_dict = profile.to_dict()

    with open(profile_json, "w", encoding="utf-8") as f:
        json.dump(p_dict, f, indent=2)

    # 4. Score results
    print(f"[4/4] Scoring Profiler Detection Precision & Recall...")
    with open(manifest_json, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    scores = ProfilerScorer.score(m_data, p_dict)
    table_str = ProfilerScorer.print_summary_table(scores)
    print("\n" + table_str + "\n")


if __name__ == "__main__":
    run_experiment(dataset_name="events", num_rows=50_000, seed=42)
    run_experiment(dataset_name="transactions", num_rows=50_000, seed=123)
