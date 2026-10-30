# Feature 02: Vectorized Profiling Engine

## 1. Overview
The **Vectorized Profiling Engine** (`core/profiler.py`, `core/analyzer.py`) scans staged datasets in a single, high-throughput DuckDB execution pass. It extracts comprehensive statistical summaries, column data distributions, data quality defect indicators, and candidate keys without performing redundant table rescans. Regardless of input dataset size (100 MB to 10 GB), the profiler generates a compact, high-density JSON profile (`profile.json`) under 100 KB in size.

---

## 2. Metrics & Quality Defects Detected

The profiler evaluates every column across four diagnostic dimensions:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Vectorized Profiler Pass                        │
└───────┬───────────────────┬───────────────────┬───────────────────┬────┘
        │                   │                   │                   │
        ▼                   ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Distribution  │   │ Null & Drift  │   │ Whitespace    │   │ Keys & Schema │
│  Statistics   │   │  Sentinels    │   │   Anomalies   │   │  Uniqueness   │
├───────────────┤   ├───────────────┤   ├───────────────┤   ├───────────────┤
│ - Min / Max   │   │ - Null count  │   │ - Leading ws  │   │ - Unique count│
│ - Mean / Std  │   │ - Null %      │   │ - Trailing ws │   │ - Candidate PK│
│ - Quartiles   │   │ - Sentinel    │   │ - Internal ws │   │ - Cardinality │
│ - Top values  │   │   tokens      │   │   collapse    │   │ - Type drift  │
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
```

### Detailed Diagnostics Table

| Metric Category | Diagnostic Description | Vectorized DuckDB Extraction Function |
|---|---|---|
| **Candidate Primary Keys** | Identifies columns or column pairs with 100% uniqueness and 0% nulls. | `COUNT(DISTINCT col) = COUNT(*) AND COUNT(col) = COUNT(*)` |
| **Sentinel Null Values** | Catches text representations of missing data (`"N/A"`, `"-"`, `"null"`, `"None"`, `"\\N"`, `"#REF!"`). | `COUNT(*) FILTER (WHERE TRIM(LOWER(col)) IN ('n/a', 'null', 'none', '-'))` |
| **Whitespace Pollution** | Distinguishes between leading spaces, trailing carriage returns, and multi-space padding. | `COUNT(*) FILTER (WHERE col != TRIM(col))` |
| **Timestamp Drift** | Detects mixed date formats across a single column (e.g., `YYYY-MM-DD` mixed with `MM/DD/YYYY` or epoch seconds). | Regex pattern grouping & `TRY_CAST(col AS TIMESTAMP)` validation |
| **Numeric Discrepancies** | Identifies columns formatted as text containing currency signs (`$`, `€`), commas (`1,000`), or percent signs (`%`). | Regex matching for currency & separator patterns |
| **Exact Row Duplication** | Measures redundant duplicate rows across the entire dataset. | `COUNT(*) - COUNT(DISTINCT hash_row)` |

---

## 3. High-Throughput Aggregation Architecture

Traditional data profiling tools (like `ydata-profiling` or `pandas-profiling`) materialize in-memory Python objects and evaluate statistical functions sequentially in Python loops, consuming 5-10x the dataset's RAM and taking minutes on gigabyte files.

Datamorph delegates the entire aggregation workload to DuckDB's in-process vectorized C++ query engine:
1. Compiles a single dynamic `SELECT` query containing aggregated expressions for every column simultaneously.
2. DuckDB executes the query across 100% of rows utilizing vectorized SIMD chunks and multi-threaded partition workers.
3. Memory consumption remains strictly bounded (<200 MB RAM overhead) because data is processed in streaming columnar chunks.

---

## 4. Benchmark Performance

| Dataset Rows | File Size | DuckDB Profiling Latency | Traditional Profiling (Python) | Memory Peak |
|---|---|---|---|---|
| **100,000** | 12 MB | **0.18s** | 4.80s | 45 MB |
| **1,000,000** | 110 MB | **1.24s** | 42.10s | 98 MB |
| **15,000,000** | 1.05 GB | **63.05s** | *Crashed (OOM)* | 380 MB |

---

## 5. Sample Profile Structure (`profile.json`)

```json
{
  "file_info": {
    "rows": 1000000,
    "columns_count": 8,
    "file_size_bytes": 115343360
  },
  "candidate_primary_keys": ["transaction_id"],
  "duplicates": {
    "exact_rows": 420,
    "exact_pct": 0.042
  },
  "columns": {
    "transaction_id": {
      "inferred_type": "INTEGER",
      "null_count": 0,
      "null_pct": 0.0,
      "distinct_count": 1000000,
      "is_candidate_key": true
    },
    "amount": {
      "inferred_type": "DOUBLE",
      "null_count": 12,
      "null_pct": 0.0012,
      "min": 1.50,
      "max": 9999.00,
      "mean": 142.35,
      "whitespace_issues": 0
    },
    "created_date": {
      "inferred_type": "TIMESTAMP",
      "null_count": 0,
      "format_drift_detected": true,
      "sample_formats": ["YYYY-MM-DD", "MM/DD/YYYY"]
    }
  }
}
```
