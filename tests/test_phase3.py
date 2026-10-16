"""Unit tests for Phase 3: Macro library, Recipe schema, Validator, and Compiler."""

import pytest
from pathlib import Path
import duckdb

from core.converter import Converter
from core.macros.strings import TrimAndNormalizeMacro
from core.macros.numbers import CastTypeMacro, ClipOutliersMacro, HandleNullsMacro
from core.macros.dates import ParseTimestampMacro
from core.macros.dedupe import DedupeMacro
from core.recipe_schema import Recipe
from core.validator import RecipeValidator, RecipeValidationError
from core.compiler import RecipeCompiler


def test_macros_generate_valid_sql():
    # Trim and normalize
    m_trim = TrimAndNormalizeMacro(trim=True, case="lower", null_tokens=["N/A", "none"])
    sql_trim = m_trim.to_sql("email")
    assert "lower(trim(\"email\"))" in sql_trim
    assert "'n/a'" in sql_trim

    # Cast type
    m_cast = CastTypeMacro(target_type="integer")
    assert m_cast.to_sql("age") == 'try_cast("age" AS INTEGER)'

    # Clip outliers
    m_clip_null = ClipOutliersMacro(min_val=0, max_val=100, action="null")
    sql_clip = m_clip_null.to_sql("score")
    assert '"score" < 0' in sql_clip and '"score" > 100' in sql_clip

    # Timestamp
    m_ts = ParseTimestampMacro(formats=["%d/%m/%Y", "%Y-%m-%d"])
    sql_ts = m_ts.to_sql("signup_date")
    assert 'COALESCE(try_strptime(trim("signup_date"), \'%d/%m/%Y\')' in sql_ts

    # Dedupe
    m_dedupe = DedupeMacro(keys=["event_id"], keep="latest", order_by="ts")
    assert 'QUALIFY row_number() OVER (PARTITION BY "event_id" ORDER BY "ts" DESC) = 1' in m_dedupe.to_qualify_clause()


def test_recipe_validation_and_plain_english():
    recipe_dict = {
        "version": 1,
        "dedupe": {"keys": ["event_id"], "keep": "latest"},
        "columns": {
            "signup_date": {
                "parse_timestamp": {"formats": ["%d/%m/%Y", "%Y-%m-%d"], "source_tz": "UTC"}
            },
            "age": {
                "cast_type": {"type": "integer"},
                "clip_outliers": {"min": 0, "max": 120, "action": "null"},
                "handle_nulls": {"strategy": "fill_median"}
            }
        }
    }

    # Validate against fake profile
    profile = {
        "columns": {
            "event_id": {},
            "signup_date": {},
            "age": {},
            "other_col": {}
        }
    }

    recipe = RecipeValidator.validate_recipe(recipe_dict, profile)
    assert recipe.dedupe.keys == ["event_id"]

    # Plain English translations
    sentences = RecipeValidator.render_plain_english(recipe)
    assert len(sentences) >= 3
    assert any("signup_date" in s for s in sentences)
    assert any("median" in s for s in sentences)


def test_compiler_execution_end_to_end(tmp_path: Path):
    # Create test parquet with messy data
    in_parquet = tmp_path / "raw.parquet"
    out_parquet = tmp_path / "clean.parquet"

    conn = duckdb.connect(":memory:")
    conn.execute(f"""
        COPY (
            SELECT 'evt_1' AS event_id, '  alice  ' AS name, '25' AS age, '10/01/2025' AS signup_date
            UNION ALL
            SELECT 'evt_2' AS event_id, 'BOB' AS name, 'N/A' AS age, '2025-01-12' AS signup_date
            UNION ALL
            SELECT 'evt_3' AS event_id, 'Charlie' AS name, '-15' AS age, '15/02/2025' AS signup_date
            UNION ALL
            SELECT 'evt_3' AS event_id, 'Charlie' AS name, '-15' AS age, '15/02/2025' AS signup_date
        ) TO '{str(in_parquet).replace("\\", "/")}' (FORMAT PARQUET);
    """)
    conn.close()

    recipe = Recipe(
        dedupe={"keys": ["event_id"], "keep": "latest"},
        columns={
            "name": {
                "trim_and_normalize": {"trim": True, "case": "title", "null_tokens": []}
            },
            "age": {
                "trim_and_normalize": {"trim": True, "null_tokens": ["N/A"]},
                "cast_type": {"type": "integer"},
                "clip_outliers": {"min": 0, "max": 120, "action": "null"},
                "handle_nulls": {"strategy": "fill_median"}
            },
            "signup_date": {
                "parse_timestamp": {"formats": ["%d/%m/%Y", "%Y-%m-%d"]}
            }
        }
    )

    compiler = RecipeCompiler()
    result = compiler.execute_clean(recipe, in_parquet, out_parquet)

    assert result.rows_in == 4
    assert result.rows_out == 3  # 1 duplicate dropped
    assert result.rows_dropped == 1
    assert out_parquet.exists()

    # Query cleaned parquet to check column transformations
    check_conn = duckdb.connect(":memory:")
    rows = check_conn.execute(
        f"SELECT event_id, name, age, signup_date FROM read_parquet('{str(out_parquet).replace('\\', '/')}') ORDER BY event_id"
    ).fetchall()
    check_conn.close()

    # 'evt_1' name trimmed and titled
    assert rows[0][1] == "Alice"
    # 'evt_2' age (was N/A) filled with median (25)
    assert rows[1][2] == 25
    # 'evt_3' negative age (-15) was nulled and imputed with median (25)
    assert rows[2][2] == 25
