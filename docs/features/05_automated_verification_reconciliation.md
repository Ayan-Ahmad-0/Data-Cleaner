# Feature 05: Automated Verification & Reconciliation

## 1. Overview
The **Automated Verification & Reconciliation Engine** (`core/verifier.py`) acts as the quality assurance gatekeeper for Datamorph. After the Vectorized CTE Engine executes, the verifier automatically re-profiles the resulting dataset, compares post-clean characteristics against pre-clean metrics, asserts that recipe constraints were satisfied, and computes exact row-level reconciliation deltas.

---

## 2. Verification Architecture

```
Pre-Clean Profile (`profile.json`)
          │
          ├─────────────────────────────────────────┐
          │                                         │
          ▼                                         ▼
Execution Engine                        Post-Clean Re-Profiler
          │                                         │
          ▼                                         ▼
Cleaned Dataset (`cleaned.parquet`) ──────► Verification & Assertion Engine
                                                    │
                                                    ▼
                                        Reconciliation Report (`verification.json`)
```

---

## 3. Four Core Verification Gates

Every dataset undergoes four automated assertion suites before being declared ready for downstream consumption:

### A. Row Count Reconciliation
Measures the exact lifecycle of all input rows:
$$\text{Input Rows} - \text{Duplicate Rows Dropped} - \text{Null Filtered Rows} = \text{Output Rows}$$
Any unaccounted row loss triggers an immediate pipeline warning.

### B. Type Adherence Validation
Asserts that 100% of values in transformed columns match their target physical data types.
- Example: Verifies that `amount` has transitioned from `VARCHAR` to `DOUBLE` with zero uncoerced string remnants.

### C. Null Reduction & Imputation Audit
Compares null counts before and after imputation:
- Reports exact counts of sentinel strings converted to SQL `NULL`.
- Reports exact counts of cells filled by mean, median, mode, or constant values.
- Asserts that columns marked with non-null constraints contain 0 nulls.

### D. Constraint & Uniqueness Assertions
Evaluates primary key integrity:
- Verifies that candidate primary keys maintain 100% distinctness.
- Asserts that numeric ranges fall within declared business constraints ($0 \le \text{price} \le 100,000$).

---

## 4. Verification Output Format (`verification.json`)

```json
{
  "status": "PASSED",
  "job_id": "job_101",
  "reconciliation_summary": {
    "rows_input": 1000000,
    "rows_output": 999580,
    "rows_dropped": 420,
    "duplicate_rows_removed": 420,
    "cells_imputed": 12,
    "whitespace_anomalies_fixed": 84520,
    "sentinel_nulls_converted": 315
  },
  "assertions": [
    {
      "check": "primary_key_uniqueness",
      "column": "transaction_id",
      "expected": 1.0,
      "actual": 1.0,
      "status": "PASSED"
    },
    {
      "check": "type_conformance",
      "column": "amount",
      "expected_type": "DOUBLE",
      "actual_type": "DOUBLE",
      "conformance_pct": 100.0,
      "status": "PASSED"
    },
    {
      "check": "whitespace_eradication",
      "column": "customer_name",
      "untrimmed_count": 0,
      "status": "PASSED"
    }
  ],
  "verification_timestamp": "2026-10-30T10:45:12Z"
}
```

---

## 5. UI Presentation
In the Datamorph web interface, the verification results are rendered as an interactive **Reconciliation Delta Card** with color-coded badges, visual progress indicators, and an expandable Markdown Audit Log ready for compliance export.

