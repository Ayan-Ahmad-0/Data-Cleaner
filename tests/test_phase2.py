"""Unit tests for Phase 2: Corruption Injector and Profiler Scorer."""

from pathlib import Path
from evaluation.datasets.generator import generate_events
from evaluation.injector import CorruptionInjector, InjectionConfig
from evaluation.scorer import ProfilerScorer, MetricScore


def test_injector_manifest_fidelity(tmp_path: Path):
    clean_csv = tmp_path / "clean.csv"
    corrupt_csv = tmp_path / "corrupt.csv"
    manifest_json = tmp_path / "manifest.json"

    generate_events(clean_csv, num_rows=200, seed=42)

    config = InjectionConfig(
        seed=42,
        null_token_rate=0.1,
        exact_duplicate_rate=0.05,
        whitespace_rate=0.1,
    )
    injector = CorruptionInjector(config=config)
    total_rows, manifest = injector.inject_from_file(clean_csv, corrupt_csv, manifest_json)

    assert total_rows > 200
    assert len(manifest) > 0
    assert manifest_json.exists()

    # Check manifest record types
    types = {r.corruption_type for r in manifest}
    assert "exact_duplicate" in types or "whitespace_issue" in types or "null_token" in types


def test_scorer_metrics():
    manifest_data = {
        "corruptions_by_type": {
            "exact_duplicate": 100,
            "null_token": 50,
            "whitespace_issue": 20,
            "negative_outlier": 10,
        }
    }
    profile_data = {
        "duplicates": {"exact_rows": 100},
        "columns": {
            "col_a": {
                "null_tokens": {"N/A": 50},
                "whitespace_issues": 20,
                "negatives": 10,
            }
        }
    }

    scores = ProfilerScorer.score(manifest_data, profile_data)
    scores_dict = {s.corruption_type: s for s in scores}

    # 100% precision and recall for all matching
    assert scores_dict["exact_duplicate"].precision == 1.0
    assert scores_dict["exact_duplicate"].recall == 1.0
    assert scores_dict["exact_duplicate"].f1_score == 1.0

    assert scores_dict["null_token"].precision == 1.0
    assert scores_dict["null_token"].recall == 1.0
