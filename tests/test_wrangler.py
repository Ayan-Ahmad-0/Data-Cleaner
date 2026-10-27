"""Unit tests for Interactive Data Wrangler service and atomic undo snapshots."""

import pytest
import duckdb
from app.storage import JobStorage
from core.wrangler.service import DataWranglerService


@pytest.fixture
def wrangler_env(tmp_path):
    storage = JobStorage(base_dir=str(tmp_path / "jobs"))
    job_id = "test_wrangler_job"
    clean_pq = storage.clean_parquet_path(job_id)

    # Create dummy dataset
    con = duckdb.connect(":memory:")
    con.execute(f"""
        COPY (
            SELECT 
                1 AS id, 
                'John Doe' AS full_name, 
                'alice.smith@example.com' AS email,
                100.0 AS score,
                'Pending' AS status
            UNION ALL
            SELECT 
                2 AS id, 
                'Jane Miller' AS full_name, 
                'jane.doe@example.com' AS email,
                NULL AS score,
                'Completed' AS status
            UNION ALL
            SELECT 
                3 AS id, 
                'Bob Builder' AS full_name, 
                NULL AS email,
                300.0 AS score,
                NULL AS status
        ) TO '{str(clean_pq).replace('\\', '/')}' (FORMAT PARQUET);
    """)
    con.close()

    service = DataWranglerService(storage=storage)
    return service, job_id, storage


def test_wrangle_split_delimiter(wrangler_env):
    service, job_id, _ = wrangler_env

    res = service.apply_action(
        job_id=job_id,
        action_type="split_delimiter",
        column="full_name",
        params={
            "delimiter": " ",
            "num_parts": 2,
            "new_column_names": ["first_name", "last_name"],
            "drop_original": True,
        },
    )

    assert res.success is True
    col_names = [c["name"] for c in res.columns]
    assert "first_name" in col_names
    assert "last_name" in col_names
    assert "full_name" not in col_names
    assert len(res.history) == 1

    # Check rows
    first_row = res.preview_rows[0]
    # Check that first_name and last_name have John and Doe
    fn_idx = col_names.index("first_name")
    ln_idx = col_names.index("last_name")
    assert first_row[fn_idx] == "John"
    assert first_row[ln_idx] == "Doe"


def test_wrangle_casing_and_trim(wrangler_env):
    service, job_id, _ = wrangler_env

    # Convert full_name to UPPERCASE
    res = service.apply_action(
        job_id=job_id,
        action_type="change_casing",
        column="full_name",
        params={"case": "upper"},
    )
    assert res.success is True
    col_names = [c["name"] for c in res.columns]
    name_idx = col_names.index("full_name")
    assert res.preview_rows[0][name_idx] == "JOHN DOE"

    # Convert to lowercase
    res2 = service.apply_action(
        job_id=job_id,
        action_type="change_casing",
        column="full_name",
        params={"case": "lower"},
    )
    assert res2.preview_rows[0][name_idx] == "john doe"


def test_wrangle_impute_missing_mean_and_ffill(wrangler_env):
    service, job_id, _ = wrangler_env

    # Impute missing in score (mean of 100.0 and 300.0 is 200.0)
    res = service.apply_action(
        job_id=job_id,
        action_type="impute_missing",
        column="score",
        params={"strategy": "mean"},
    )
    assert res.success is True
    col_names = [c["name"] for c in res.columns]
    score_idx = col_names.index("score")
    # Row 2 (Jane Miller) had score=None, now 200.0
    assert res.preview_rows[1][score_idx] == 200.0

    # Forward fill status (Row 3 had NULL, row 2 was 'Completed')
    res2 = service.apply_action(
        job_id=job_id,
        action_type="impute_missing",
        column="status",
        params={"strategy": "forward_fill"},
    )
    status_idx = [c["name"] for c in res2.columns].index("status")
    assert res2.preview_rows[2][status_idx] == "Completed"


def test_wrangle_replace_nulls_and_drop_rename(wrangler_env):
    service, job_id, _ = wrangler_env

    # Replace null email with 'no-reply@company.com'
    res = service.apply_action(
        job_id=job_id,
        action_type="replace_nulls",
        column="email",
        params={"value": "no-reply@company.com"},
    )
    col_names = [c["name"] for c in res.columns]
    email_idx = col_names.index("email")
    assert res.preview_rows[2][email_idx] == "no-reply@company.com"

    # Rename column
    res2 = service.apply_action(
        job_id=job_id,
        action_type="rename_column",
        column="score",
        params={"new_name": "performance_score"},
    )
    assert "performance_score" in [c["name"] for c in res2.columns]
    assert "score" not in [c["name"] for c in res2.columns]

    # Drop column
    res3 = service.apply_action(
        job_id=job_id,
        action_type="drop_column",
        column="status",
    )
    assert "status" not in [c["name"] for c in res3.columns]


def test_wrangle_undo_and_reset(wrangler_env):
    service, job_id, storage = wrangler_env

    # Action 1: Casing
    service.apply_action(job_id, "change_casing", "full_name", {"case": "upper"})
    # Action 2: Drop status
    res2 = service.apply_action(job_id, "drop_column", "status")
    assert "status" not in [c["name"] for c in res2.columns]
    assert len(res2.history) == 2

    # Undo Action 2 (status should be back)
    undo_res = service.undo(job_id)
    assert undo_res.success is True
    assert "status" in [c["name"] for c in undo_res.columns]
    assert len(undo_res.history) == 1

    # Reset (back to initial baseline)
    reset_res = service.reset(job_id)
    assert reset_res.success is True
    assert len(reset_res.history) == 0
    # Original casing should be restored
    name_idx = [c["name"] for c in reset_res.columns].index("full_name")
    assert reset_res.preview_rows[0][name_idx] == "John Doe"
