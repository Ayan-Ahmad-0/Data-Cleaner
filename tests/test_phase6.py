"""Unit tests for Phase 6: Verifier and automated test assertions."""

import json
from pathlib import Path
import duckdb
import pytest

from core.compiler import RecipeCompiler
from core.recipe_schema import Recipe
from core.verifier import Verifier


@pytest.fixture
def clean_and_corrupt_pair(tmp_path: Path):
    in_parquet = tmp_path / "raw.parquet"
    out_parquet = tmp_path / "clean.parquet"

    conn = duckdb.connect(":memory:")
    in_pq_sql = str(in_parquet).replace("\\", "/")
    conn.execute(f"""
        COPY (
            SELECT 'usr_1' AS id, '25' AS age, 'active' AS status
            UNION ALL
            SELECT 'usr_2' AS id, 'N/A' AS age, 'pending' AS status
            UNION ALL
            SELECT 'usr_2' AS id, 'N/A' AS age, 'pending' AS status
            UNION ALL
            SELECT 'usr_3' AS id, '-10' AS age, 'active' AS status
        ) TO '{in_pq_sql}' (FORMAT PARQUET);
    """)
    conn.close()

    recipe = Recipe(
        dedupe={"keys": ["id"], "keep": "latest"},
        columns={
            "age": {
                "trim_and_normalize": {"trim": True, "null_tokens": ["N/A"]},
                "cast_type": {"type": "integer"},
                "clip_outliers": {"min": 0, "max": 120, "action": "null"},
                "handle_nulls": {"strategy": "fill_median"}
            }
        }
    )

    compiler = RecipeCompiler()
    compiler.execute_clean(recipe, in_parquet, out_parquet)

    before_profile = {
        "file": {"rows": 4, "columns": 3, "size_gb": 0.001},
        "duplicates": {"exact_rows": 1, "exact_pct": 25.0},
        "columns": {
            "id": {"nulls": 0},
            "age": {"nulls": 1, "negatives": 1},
            "status": {"nulls": 0},
        }
    }

    return in_parquet, out_parquet, before_profile, recipe


def test_verifier_passes_clean_run(clean_and_corrupt_pair, tmp_path: Path):
    _, out_parquet, before_profile, recipe = clean_and_corrupt_pair
    v_json = tmp_path / "verification.json"

    verifier = Verifier()
    result = verifier.verify(out_parquet, before_profile, recipe, output_verification_json=v_json)

    assert result.status == "PASS"
    assert result.tests_failed == 0
    assert result.tests_passed >= 3
    assert v_json.exists()

    # Verify before/after delta calculation
    assert result.comparison.rows_before == 4
    assert result.comparison.rows_after == 3
    assert result.comparison.duplicates_after == 0


def test_verifier_flags_warnings_on_violation(tmp_path: Path):
    out_parquet = tmp_path / "violation.parquet"
    conn = duckdb.connect(":memory:")
    out_pq_sql = str(out_parquet).replace("\\", "/")
    conn.execute(f"""
        COPY (
            SELECT 'usr_1' AS id, 25 AS age
            UNION ALL
            SELECT 'usr_1' AS id, 30 AS age
        ) TO '{out_pq_sql}' (FORMAT PARQUET);
    """)
    conn.close()

    # Recipe specifies unique id, but file has duplicates
    recipe = Recipe(dedupe={"keys": ["id"], "keep": "latest"})
    before_profile = {"file": {"rows": 2}, "duplicates": {"exact_rows": 0}, "columns": {"id": {}, "age": {}}}

    verifier = Verifier()
    result = verifier.verify(out_parquet, before_profile, recipe)

    assert result.status == "DONE_WITH_WARNINGS"
    assert result.tests_failed >= 1
