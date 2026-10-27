"""Interactive Data Wrangler engine providing cell fixes, column splitting, casing, imputation, and atomic rollback."""

from __future__ import annotations
from dataclasses import dataclass, field
import datetime
import json
import logging
import os
from pathlib import Path
import shutil
from typing import Any, Dict, List, Literal, Optional, Tuple, Union
import uuid

import duckdb

from app.storage import JobStorage
from core.macros.base import quote_ident

logger = logging.getLogger(__name__)


@dataclass
class WrangleAction:
    step: int
    action_type: str
    column: str
    description: str
    params: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step": self.step,
            "action_type": self.action_type,
            "column": self.column,
            "description": self.description,
            "params": self.params,
            "timestamp": self.timestamp,
        }


@dataclass
class WrangleResult:
    success: bool
    message: str
    row_count: int
    columns: List[Dict[str, str]]  # [{'name': '...', 'type': '...'}]
    preview_rows: List[List[Any]]
    history: List[Dict[str, Any]]
    can_undo: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "message": self.message,
            "row_count": self.row_count,
            "columns": self.columns,
            "preview_rows": self.preview_rows,
            "history": self.history,
            "can_undo": self.can_undo,
        }


class DataWranglerService:
    """Manages point-and-click column mutations and undo/redo snapshots on cleaned datasets."""

    def __init__(self, storage: Optional[JobStorage] = None) -> None:
        self.storage = storage or JobStorage()

    def _get_history_dir(self, job_id: str) -> Path:
        d = self.storage.job_dir(job_id) / "wrangle" / "history"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _get_history_file(self, job_id: str) -> Path:
        return self.storage.job_dir(job_id) / "wrangle" / "history.json"

    def get_history(self, job_id: str) -> List[Dict[str, Any]]:
        hf = self._get_history_file(job_id)
        if not hf.exists():
            return []
        try:
            with open(hf, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_history(self, job_id: str, history: List[Dict[str, Any]]) -> None:
        hf = self._get_history_file(job_id)
        with open(hf, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)

    def _get_dataset_info(self, parquet_path: Path, preview_limit: int = 100) -> Tuple[int, List[Dict[str, str]], List[List[Any]]]:
        """Fetch row count, schema columns, and preview rows from Parquet."""
        p_sql = str(parquet_path.resolve()).replace("\\", "/")
        con = duckdb.connect(":memory:")
        try:
            col_info = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{p_sql}')").fetchall()
            columns = [{"name": str(c[0]), "type": str(c[1])} for c in col_info]
            cnt_res = con.execute(f"SELECT COUNT(*) FROM read_parquet('{p_sql}')").fetchone()
            row_count = int(cnt_res[0]) if cnt_res else 0
            rows = con.execute(f"SELECT * FROM read_parquet('{p_sql}') LIMIT {preview_limit}").fetchall()
            preview = [list(r) for r in rows]
            return row_count, columns, preview
        finally:
            con.close()

    def ensure_baseline_snapshot(self, job_id: str) -> Path:
        """Ensure initial step 0 snapshot exists before first mutation."""
        clean_pq = self.storage.clean_parquet_path(job_id)
        if not clean_pq.exists():
            # If cleaned.parquet not found, fallback to staged.parquet
            staged_pq = self.storage.staged_parquet_path(job_id)
            if staged_pq.exists():
                shutil.copy2(staged_pq, clean_pq)
            else:
                raise FileNotFoundError(f"No dataset available to wrangle for job '{job_id}'.")

        h_dir = self._get_history_dir(job_id)
        step_0 = h_dir / "step_0.parquet"
        if not step_0.exists():
            shutil.copy2(clean_pq, step_0)
        return clean_pq

    def apply_action(
        self,
        job_id: str,
        action_type: str,
        column: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> WrangleResult:
        """Execute a wrangle action on the dataset with snapshot creation."""
        params = params or {}
        clean_pq = self.ensure_baseline_snapshot(job_id)
        history = self.get_history(job_id)
        current_step = len(history)

        # Snapshot current state before executing mutation
        h_dir = self._get_history_dir(job_id)
        step_snapshot = h_dir / f"step_{current_step}.parquet"
        shutil.copy2(clean_pq, step_snapshot)

        # Build DuckDB mutation SQL
        clean_sql_path = str(clean_pq.resolve()).replace("\\", "/")
        con = duckdb.connect(":memory:")

        # Get existing columns
        col_res = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{clean_sql_path}')").fetchall()
        existing_cols = [c[0] for c in col_res]
        q_col = quote_ident(column)

        mutation_sql: str = ""
        action_desc: str = ""

        try:
            # 1. Split by delimiter
            if action_type == "split_delimiter":
                delimiter = params.get("delimiter", " ")
                drop_original = params.get("drop_original", False)
                num_parts = int(params.get("num_parts", 2))
                new_names = params.get("new_column_names")

                # Generate new column names if not provided
                if not new_names or len(new_names) < num_parts:
                    new_names = [f"{column}_{i+1}" for i in range(num_parts)]

                escaped_delim = delimiter.replace("'", "''")
                split_projections = []
                for idx, col_name in enumerate(new_names[:num_parts]):
                    part_num = idx + 1
                    q_new = quote_ident(col_name)
                    split_projections.append(
                        f"NULLIF(trim(split_part(cast({q_col} as varchar), '{escaped_delim}', {part_num})), '') AS {q_new}"
                    )

                if drop_original:
                    select_base = f"* EXCLUDE ({q_col})"
                else:
                    select_base = "*"

                mutation_sql = f"""
                    SELECT {select_base}, {', '.join(split_projections)}
                    FROM read_parquet('{clean_sql_path}')
                """
                action_desc = f"Split '{column}' by '{delimiter}' into {new_names}"

            # 2. Text casing & whitespace
            elif action_type in ("change_casing", "trim_whitespace"):
                case_mode = params.get("case", "trim")
                if case_mode == "upper":
                    expr = f"UPPER(cast({q_col} as varchar))"
                    action_desc = f"Convert '{column}' to UPPERCASE"
                elif case_mode == "lower":
                    expr = f"LOWER(cast({q_col} as varchar))"
                    action_desc = f"Convert '{column}' to lowercase"
                elif case_mode == "title":
                    # Title case with trim
                    expr = f"INITCAP(trim(cast({q_col} as varchar)))"
                    action_desc = f"Convert '{column}' to Title Case"
                else:  # trim
                    expr = f"TRIM(cast({q_col} as varchar))"
                    action_desc = f"Trim whitespace from '{column}'"

                mutation_sql = f"""
                    SELECT * REPLACE ({expr} AS {q_col})
                    FROM read_parquet('{clean_sql_path}')
                """

            # 3. Impute missing values
            elif action_type == "impute_missing":
                strategy = params.get("strategy", "mean").lower()

                if strategy == "mean":
                    expr = f"COALESCE({q_col}, (SELECT AVG({q_col}) FROM read_parquet('{clean_sql_path}')))"
                    action_desc = f"Impute missing in '{column}' with Mean"
                elif strategy == "median":
                    expr = f"COALESCE({q_col}, (SELECT MEDIAN({q_col}) FROM read_parquet('{clean_sql_path}')))"
                    action_desc = f"Impute missing in '{column}' with Median"
                elif strategy == "mode":
                    expr = f"COALESCE({q_col}, (SELECT MODE({q_col}) FROM read_parquet('{clean_sql_path}')))"
                    action_desc = f"Impute missing in '{column}' with Mode"
                elif strategy == "forward_fill":
                    expr = f"COALESCE({q_col}, LAST_VALUE({q_col} IGNORE NULLS) OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))"
                    action_desc = f"Forward fill missing values in '{column}'"
                elif strategy == "backward_fill":
                    expr = f"COALESCE({q_col}, FIRST_VALUE({q_col} IGNORE NULLS) OVER (ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))"
                    action_desc = f"Backward fill missing values in '{column}'"
                else:
                    raise ValueError(f"Unknown imputation strategy: {strategy}")

                mutation_sql = f"""
                    SELECT * REPLACE ({expr} AS {q_col})
                    FROM read_parquet('{clean_sql_path}')
                """

            # 4. Replace NULLs with custom default
            elif action_type == "replace_nulls":
                default_val = params.get("value", "")
                if isinstance(default_val, (int, float)):
                    fill_expr = str(default_val)
                elif isinstance(default_val, bool):
                    fill_expr = "TRUE" if default_val else "FALSE"
                else:
                    escaped_val = str(default_val).replace("'", "''")
                    fill_expr = f"'{escaped_val}'"

                mutation_sql = f"""
                    SELECT * REPLACE (COALESCE({q_col}, {fill_expr}) AS {q_col})
                    FROM read_parquet('{clean_sql_path}')
                """
                action_desc = f"Replace NULLs in '{column}' with '{default_val}'"

            # 5. Drop column
            elif action_type == "drop_column":
                if len(existing_cols) <= 1:
                    raise ValueError("Cannot drop the only column in the dataset.")
                mutation_sql = f"""
                    SELECT * EXCLUDE ({q_col})
                    FROM read_parquet('{clean_sql_path}')
                """
                action_desc = f"Drop column '{column}'"

            # 6. Rename column
            elif action_type == "rename_column":
                new_name = params.get("new_name", "").strip()
                if not new_name:
                    raise ValueError("New column name is required.")
                if new_name in existing_cols and new_name != column:
                    raise ValueError(f"Column '{new_name}' already exists in dataset.")
                q_new = quote_ident(new_name)
                mutation_sql = f"""
                    SELECT * EXCLUDE ({q_col}), {q_col} AS {q_new}
                    FROM read_parquet('{clean_sql_path}')
                """
                action_desc = f"Rename column '{column}' to '{new_name}'"

            # 7. Cast column type
            elif action_type == "cast_type":
                target_type = params.get("target_type", "VARCHAR").upper()
                mutation_sql = f"""
                    SELECT * REPLACE (TRY_CAST({q_col} AS {target_type}) AS {q_col})
                    FROM read_parquet('{clean_sql_path}')
                """
                action_desc = f"Cast '{column}' to {target_type}"

            else:
                raise ValueError(f"Unsupported wrangle action: {action_type}")

            # Execute mutation to temporary file
            temp_wrangled = clean_pq.parent / f".wrangled_{uuid.uuid4().hex[:8]}.parquet"
            temp_sql_path = str(temp_wrangled.resolve()).replace("\\", "/")
            con.execute(f"COPY ({mutation_sql.strip()}) TO '{temp_sql_path}' (FORMAT PARQUET);")

            # Atomically swap temporary file into cleaned.parquet
            if temp_wrangled.exists():
                shutil.move(temp_wrangled, clean_pq)

            # Record action in history stack
            action = WrangleAction(
                step=current_step + 1,
                action_type=action_type,
                column=column,
                description=action_desc,
                params=params,
            )
            history.append(action.to_dict())
            self._save_history(job_id, history)

            row_count, cols, preview = self._get_dataset_info(clean_pq)

            return WrangleResult(
                success=True,
                message=action_desc,
                row_count=row_count,
                columns=cols,
                preview_rows=preview,
                history=history,
                can_undo=True,
            )

        except Exception as e:
            logger.exception("Wrangle action '%s' failed on job %s: %s", action_type, job_id, e)
            # Revert to snapshot in case of partial write
            if step_snapshot.exists():
                shutil.copy2(step_snapshot, clean_pq)
            raise ValueError(f"Wrangle failed: {str(e)}")
        finally:
            con.close()

    def undo(self, job_id: str) -> WrangleResult:
        """Roll back the last wrangle action."""
        clean_pq = self.ensure_baseline_snapshot(job_id)
        history = self.get_history(job_id)

        if not history:
            row_count, cols, preview = self._get_dataset_info(clean_pq)
            return WrangleResult(
                success=False,
                message="No wrangle actions to undo.",
                row_count=row_count,
                columns=cols,
                preview_rows=preview,
                history=[],
                can_undo=False,
            )

        h_dir = self._get_history_dir(job_id)
        target_step = len(history) - 1
        snapshot_file = h_dir / f"step_{target_step}.parquet"

        if not snapshot_file.exists():
            snapshot_file = h_dir / "step_0.parquet"

        if snapshot_file.exists():
            shutil.copy2(snapshot_file, clean_pq)

        history.pop()
        self._save_history(job_id, history)

        row_count, cols, preview = self._get_dataset_info(clean_pq)
        return WrangleResult(
            success=True,
            message=f"Undid action. Restored to step {target_step}.",
            row_count=row_count,
            columns=cols,
            preview_rows=preview,
            history=history,
            can_undo=len(history) > 0,
        )

    def reset(self, job_id: str) -> WrangleResult:
        """Revert dataset to baseline step 0 (initial clean state)."""
        clean_pq = self.ensure_baseline_snapshot(job_id)
        h_dir = self._get_history_dir(job_id)
        step_0 = h_dir / "step_0.parquet"

        if step_0.exists():
            shutil.copy2(step_0, clean_pq)

        self._save_history(job_id, [])
        row_count, cols, preview = self._get_dataset_info(clean_pq)

        return WrangleResult(
            success=True,
            message="Reset dataset to initial cleaned state.",
            row_count=row_count,
            columns=cols,
            preview_rows=preview,
            history=[],
            can_undo=False,
        )
