"""Benchmark dataset generator and end-to-end Phase 0/1 verification."""

import os
import sys
import time
from pathlib import Path

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import duckdb
from core.converter import Converter
from core.profiler import Profiler


def generate_benchmark_csv(target_path: str | Path, row_count: int = 15_000_000) -> Path:
    """Generate a clean 1 GB+ dataset rapidly using DuckDB's vectorized generator."""
    target = Path(target_path).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target_sql = str(target).replace("\\", "/")

    print(f"Generating {row_count:,} rows into {target}...")
    start = time.perf_counter()

    conn = duckdb.connect(":memory:")
    conn.execute(f"""
        COPY (
            SELECT
                'evt_' || (range + 10000000)::VARCHAR AS event_id,
                'usr_' || (1000 + (random() * 49000)::INT)::VARCHAR AS user_id,
                CASE (random() * 5)::INT
                    WHEN 0 THEN 'page_view'
                    WHEN 1 THEN 'click'
                    WHEN 2 THEN 'signup'
                    WHEN 3 THEN 'checkout'
                    WHEN 4 THEN 'search'
                    ELSE 'logout'
                END AS event_type,
                strftime(TIMESTAMP '2025-01-01 00:00:00' + INTERVAL (random() * 31536000) SECOND, '%Y-%m-%d %H:%M:%S') AS timestamp,
                CASE (random() * 4)::INT
                    WHEN 0 THEN 'web'
                    WHEN 1 THEN 'ios'
                    WHEN 2 THEN 'android'
                    WHEN 3 THEN 'macos'
                    ELSE 'windows'
                END AS platform,
                (1 + (random() * 3599)::INT) AS session_duration_sec
            FROM range({row_count})
        ) TO '{target_sql}' (HEADER, DELIMITER ',');
    """)
    conn.close()

    elapsed = time.perf_counter() - start
    size_mb = target.stat().st_size / (1024 * 1024)
    print(f"Generated {size_mb:.2f} MB in {elapsed:.2f} seconds.")
    return target


def run_phase0_summarize(csv_path: Path):
    """Phase 0 Done Criterion: Load 1 GB CSV into DuckDB and run SUMMARIZE."""
    print(f"\n--- Phase 0 Done Criterion: Running SUMMARIZE on {csv_path.name} ---")
    start = time.perf_counter()
    csv_sql = str(csv_path).replace("\\", "/")

    conn = duckdb.connect(":memory:")
    res = conn.execute(f"SUMMARIZE SELECT * FROM read_csv('{csv_sql}', header=true);").fetchall()
    conn.close()

    elapsed = time.perf_counter() - start
    print(f"SUMMARIZE completed in {elapsed:.2f} seconds across {len(res)} columns.")


def run_phase1_profile(csv_path: Path, parquet_path: Path):
    """Phase 1 Done Criterion: Convert 1 GB CSV to Parquet and profile to JSON < 100KB."""
    print(f"\n--- Phase 1 Done Criterion: Convert and Profile {csv_path.name} ---")
    conv = Converter(memory_limit="4GB", threads=4)
    conv_res = conv.convert(csv_path, parquet_path)
    print(f"Converted {conv_res.row_count:,} rows to Parquet in {conv_res.duration_seconds:.2f}s "
          f"({conv_res.parquet_size_bytes / (1024*1024):.2f} MB)")

    profiler = Profiler(memory_limit="4GB", threads=4)
    profile = profiler.profile_parquet(parquet_path, csv_path)
    p_dict = profile.to_dict()

    import json
    json_bytes = json.dumps(p_dict, indent=2).encode("utf-8")
    json_size_kb = len(json_bytes) / 1024

    print(f"Profile duration: {profile.duration_seconds:.2f}s")
    print(f"Profile JSON size: {json_size_kb:.2f} KB (Target: < 100 KB)")
    print(f"Row count profiled: {p_dict['file']['rows']:,}")
    print(f"Columns profiled: {list(p_dict['columns'].keys())}")
    assert json_size_kb < 100, f"Profile size {json_size_kb} KB exceeds 100 KB target"


if __name__ == "__main__":
    benchmark_dir = Path("data/benchmarks")
    csv_file = benchmark_dir / "events_1gb.csv"
    pq_file = benchmark_dir / "events_1gb.parquet"

    # 1. Generate 1 GB CSV (~15M rows)
    generate_benchmark_csv(csv_file, row_count=15_000_000)

    # 2. Phase 0 verification: DuckDB SUMMARIZE
    run_phase0_summarize(csv_file)

    # 3. Phase 1 verification: Converter + Profiler
    run_phase1_profile(csv_file, pq_file)
