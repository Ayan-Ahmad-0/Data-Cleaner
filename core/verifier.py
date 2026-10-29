"""Output re-profiling, verification test execution, and before/after comparison."""

from __future__ import annotations
import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
import duckdb

from core.macros.base import quote_ident
from core.profiler import Profiler, DatasetProfile
from core.recipe_schema import Recipe

logger = logging.getLogger(__name__)


@dataclass
class TestResult:
    test_name: str
    column_name: Optional[str]
    rule_type: str
    passed: bool
    details: str


@dataclass
class BeforeAfterComparison:
    rows_before: int
    rows_after: int
    rows_delta: int
    duplicates_before: int
    duplicates_after: int
    nulls_by_column: Dict[str, Dict[str, int]]
    negatives_by_column: Dict[str, Dict[str, int]]


@dataclass
class VerificationResult:
    status: str  # "PASS" or "DONE_WITH_WARNINGS"
    tests_passed: int
    tests_failed: int
    test_results: List[TestResult]
    comparison: BeforeAfterComparison
    output_profile: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "tests_passed": self.tests_passed,
            "tests_failed": self.tests_failed,
            "test_results": [asdict(t) for t in self.test_results],
            "comparison": asdict(self.comparison),
            "output_profile": self.output_profile,
        }


class Verifier:
    """Re-profiles output and executes verification assertions against the recipe."""

    def __init__(self, memory_limit: Optional[str] = None, threads: int = 4, temp_directory: Optional[str] = None) -> None:
        self.memory_limit = memory_limit or os.getenv("DUCKDB_MEMORY_LIMIT", "600MB")
        self.threads = threads
        self.temp_directory = temp_directory or os.getenv("DUCKDB_TEMP_DIR", "/tmp/duckdb_temp")
        self.profiler = Profiler(memory_limit=self.memory_limit, threads=threads, temp_directory=self.temp_directory)

    def verify(
        self,
        cleaned_parquet_path: str | Path,
        before_profile: Dict[str, Any],
        recipe: Recipe,
        output_verification_json: Optional[str | Path] = None,
    ) -> VerificationResult:
        pq_path = Path(cleaned_parquet_path).resolve()
        if not pq_path.exists():
            raise FileNotFoundError(f"Cleaned file not found: {pq_path}")

        # 1. Re-profile the output dataset
        after_prof = self.profiler.profile_parquet(pq_path)
        after_dict = after_prof.to_dict()

        # 2. Compute Before/After deltas
        rows_before = before_profile.get("file", {}).get("rows", 0)
        rows_after = after_dict.get("file", {}).get("rows", 0)
        dups_before = before_profile.get("duplicates", {}).get("exact_rows", 0)
        dups_after = after_dict.get("duplicates", {}).get("exact_rows", 0)

        nulls_comp: Dict[str, Dict[str, int]] = {}
        negs_comp: Dict[str, Dict[str, int]] = {}

        for col, after_meta in after_dict.get("columns", {}).items():
            before_meta = before_profile.get("columns", {}).get(col, {})
            nulls_comp[col] = {
                "before": before_meta.get("nulls", 0),
                "after": after_meta.get("nulls", 0),
            }
            if "negatives" in before_meta or "negatives" in after_meta:
                negs_comp[col] = {
                    "before": before_meta.get("negatives", 0),
                    "after": after_meta.get("negatives", 0),
                }

        comparison = BeforeAfterComparison(
            rows_before=rows_before,
            rows_after=rows_after,
            rows_delta=rows_after - rows_before,
            duplicates_before=dups_before,
            duplicates_after=dups_after,
            nulls_by_column=nulls_comp,
            negatives_by_column=negs_comp,
        )

        # 3. Execute Verification Tests
        test_results: List[TestResult] = []
        pq_sql = str(pq_path).replace("\\", "/")
        conn = duckdb.connect(":memory:")
        conn.execute("SET preserve_insertion_order = false;")
        if self.temp_directory:
            os.makedirs(self.temp_directory, exist_ok=True)
            conn.execute(f"SET temp_directory = '{self.temp_directory}';")
        conn.execute(f"SET memory_limit = '{self.memory_limit}';")
        conn.execute(f"SET threads = {self.threads};")

        try:
            view_name = "verified_clean_data"
            conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{pq_sql}');")

            # Test A: Deduplication Uniqueness Test
            if recipe.dedupe:
                keys = recipe.dedupe.keys
                key_cols = ", ".join(quote_ident(k) for k in keys)
                dup_q = f"SELECT COUNT(*) - COUNT(DISTINCT ({key_cols})) FROM {view_name};"
                dup_count = conn.execute(dup_q).fetchone()[0]
                passed = (dup_count == 0)
                test_results.append(TestResult(
                    test_name="unique_key_test",
                    column_name=",".join(keys),
                    rule_type="dedupe",
                    passed=passed,
                    details=f"Dedupe key check: {dup_count} duplicate keys remaining in output." if not passed else "Unique constraint confirmed (0 duplicate keys).",
                ))

            # Test B: Not-Null assertions on imputed columns
            for col, rule in recipe.columns.items():
                if rule.handle_nulls and rule.handle_nulls.strategy in ("fill_value", "fill_median", "fill_mode"):
                    qcol = quote_ident(col)
                    null_cnt = conn.execute(f"SELECT COUNT(*) FROM {view_name} WHERE {qcol} IS NULL;").fetchone()[0]
                    passed = (null_cnt == 0)
                    test_results.append(TestResult(
                        test_name="not_null_test",
                        column_name=col,
                        rule_type="handle_nulls",
                        passed=passed,
                        details=f"Null check: {null_cnt} nulls remain." if not passed else "0 NULLs remain after imputation.",
                    ))

            # Test C: Accepted range assertions on outlier-clipped columns
            for col, rule in recipe.columns.items():
                if rule.clip_outliers:
                    cfg = rule.clip_outliers
                    qcol = quote_ident(col)
                    num_col = f"try_cast({qcol} AS DOUBLE)"
                    conds = []
                    if cfg.min is not None:
                        conds.append(f"{num_col} < {cfg.min}")
                    if cfg.max is not None:
                        conds.append(f"{num_col} > {cfg.max}")
                    if conds:
                        violation_cnt = conn.execute(
                            f"SELECT COUNT(*) FROM {view_name} WHERE {' OR '.join(conds)};"
                        ).fetchone()[0]
                        passed = (violation_cnt == 0)
                        test_results.append(TestResult(
                            test_name="accepted_range_test",
                            column_name=col,
                            rule_type="clip_outliers",
                            passed=passed,
                            details=f"Bound check: {violation_cnt} values out of bounds." if not passed else f"All values conform to bounding interval.",
                        ))

            # Test D: Global reconciliation test
            # Rows after cannot be greater than rows before
            reconciliation_passed = (rows_after <= rows_before)
            test_results.append(TestResult(
                test_name="row_reconciliation_test",
                column_name=None,
                rule_type="global",
                passed=reconciliation_passed,
                details=f"Reconciliation: Ingested {rows_before:,} rows, delivered {rows_after:,} rows (reconciled).",
            ))

        finally:
            conn.close()

        tests_passed = sum(1 for t in test_results if t.passed)
        tests_failed = sum(1 for t in test_results if not t.passed)
        status = "PASS" if tests_failed == 0 else "DONE_WITH_WARNINGS"

        result = VerificationResult(
            status=status,
            tests_passed=tests_passed,
            tests_failed=tests_failed,
            test_results=test_results,
            comparison=comparison,
            output_profile=after_dict,
        )

        if output_verification_json:
            out_v = Path(output_verification_json)
            out_v.parent.mkdir(parents=True, exist_ok=True)
            with open(out_v, "w", encoding="utf-8") as f:
                json.dump(result.to_dict(), f, indent=2)

        return result
