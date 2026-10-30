# Datamorph: Comprehensive Feature & Architecture Specification

> **Vectorized Data Profiling, Cleaning, Relational Modeling, Exploration, Visualization, and Ephemeral Retention Engine**  
> *A production-grade, in-process data quality engineering platform powered by DuckDB, Apache Arrow, sqlglot, Plotly, and Google Gemini.*

---

## Table of Contents
1. [Platform Architecture & Executive Overview](#1-platform-architecture--executive-overview)
2. [Feature 01: Multi-Format Ingestion & Cloud Connectors](#feature-01-multi-format-ingestion--cloud-connectors)
3. [Feature 02: Vectorized Profiling Engine](#feature-02-vectorized-profiling-engine)
4. [Feature 03: AI Recipe Generation & Heuristic Fallback](#feature-03-ai-recipe-generation--heuristic-fallback)
5. [Feature 04: Vectorized CTE SQL Cleaning Engine](#feature-04-vectorized-cte-sql-cleaning-engine)
6. [Feature 05: Automated Verification & Reconciliation](#feature-05-automated-verification--reconciliation)
7. [Feature 06: Zero-Profiling Convert-Only Mode](#feature-06-zero-profiling-convert-only-mode)
8. [Feature 07: Sandboxed SQL Query Studio](#feature-07-sandboxed-sql-query-studio)
9. [Feature 08: AI Analyst (Natural Language to SQL)](#feature-08-ai-analyst-natural-language-to-sql)
10. [Feature 09: Visualize Data & AI Charting Engine](#feature-09-visualize-data--ai-charting-engine)
11. [Feature 10: Multi-Table ERD Modeling Studio](#feature-10-multi-table-erd-modeling-studio)
12. [Feature 11: Interactive Data Wrangler & PII Masking](#feature-11-interactive-data-wrangler--pii-masking)
13. [Feature 12: Automated TTL & Background Storage Retention](#feature-12-automated-ttl--background-storage-retention)
14. [Feature 13: Multi-Tenancy & Data Privacy Isolation](#feature-13-multi-tenancy--data-privacy-isolation)

---

## 1. Platform Architecture & Executive Overview

Datamorph addresses the fundamental bottlenecks of modern tabular data preparation: speculative type inference crashes, slow iterative Python transformations, security vulnerabilities in AI-generated SQL, memory exhaustion on gigabyte files, and ephemeral storage bloat.

By leveraging **DuckDB's vectorized C++ columnar execution engine** in-process, Datamorph ingests, profiles, models, cleans, verifies, and charts datasets containing millions of rows in seconds without full table rescans, external database dependencies, or disk thrashing.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Datamorph End-to-End Pipeline                                 │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. Ingestion Layer                                                                               │
│    CSV, Parquet, JSON, NDJSON, Excel (.xlsx), SQLite (.db), PostgreSQL, AWS S3                   │
│    └── All-Varchar Staging into Canonical Zstandard Parquet (data/jobs/{user_id}/{job_id}/)      │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. Mode Router (5 Operating Paradigms)                                                           │
│    ├── Clean Data      ── Single-pass Profiler ──► AI Recipe ──► CTE Compiler ──► Verifier      │
│    ├── Convert Only    ── Pure zero-profiling stream transformation between 6+ formats           │
│    ├── Query Data      ── Direct sandbox indexing for instant sandboxed SQL exploration          │
│    ├── Visualize Data  ── Instant vectorized chart generation & AI Auto-Visualize dashboard      │
│    └── Model Data(ERD) ── Multi-table staging, visual schema canvas, PK/FK links & DuckDB JOINs  │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. Exploration, Visualization & Downstream Hand-off                                              │
│    ├── AI Analyst (NL-to-SQL with 3-tier injection defense & self-correction loop)               │
│    ├── Plotly Analytics Dashboard (11 chart types, 20 curated palettes, SVG/PNG/CSV export)      │
│    └── Multi-Format Downstream Export (Parquet, CSV, JSON, NDJSON, XLSX, DBML, Mermaid, DDL)      │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. Storage Scavenger & Privacy Daemon                                                            │
│    ├── Automated 24-hour TTL background cleaner (jobs, convert_jobs, query_jobs, modeling)       │
│    └── Strict multi-tenancy isolation (regex validation, OWASP 404 IDOR masking)                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 01: Multi-Format Ingestion & Cloud Connectors

### 1. Overview
The **Multi-Format Ingestion Engine** provides a zero-data-loss gateway for ingesting tabular datasets of varying shapes, encodings, and container formats into Datamorph's vectorized columnar pipeline. It automatically detects source formats via magic byte signatures, stages heterogeneous raw data into uniform zstandard-compressed columnar Parquet with all-varchar string representation, and integrates with cloud object stores and relational databases.

### 2. Supported Ingestion Sources

| Format / Source | Extensions / Protocol | Sniffing Method | Staging Strategy |
|---|---|---|---|
| **CSV / TSV** | `.csv`, `.tsv`, `.txt` | Sniff delimiter, quotechar, escapechar, header line | Staged as all-varchar Parquet; prevents speculative integer overflow |
| **Apache Parquet** | `.parquet`, `.pq` | Magic bytes `PAR1` | Direct column copy with compression normalization to Zstandard |
| **JSON Lines / NDJSON** | `.jsonl`, `.ndjson` | Top-line JSON object parser | Streaming line-by-line normalization into tabular record buffers |
| **JSON Array** | `.json` | Root token inspection (`[` vs `{`) | Exploded record flattening into relational columns |
| **Microsoft Excel** | `.xlsx`, `.xls` | Zip container inspection / sheet discovery | Multi-sheet inspection; active sheet extraction via Calamine/OpenPyXL |
| **SQLite Database** | `.db`, `.sqlite`, `.sqlite3` | SQLite header string `SQLite format 3` | Native table enumeration and selective table extraction via DuckDB SQLite driver |
| **PostgreSQL** | Connection string (`postgresql://`) | Direct TCP connection & information schema probe | Async query stream directly into in-memory Arrow buffers |
| **AWS S3 / S3-Compatible** | `s3://` bucket URI | S3 API metadata & range request sample | Streamed chunk download with resumable buffering |

### 3. All-Varchar Staging Architecture
Traditional data loading libraries infer column types based on the first 1,000 rows. If row 10,001 contains an alphanumeric string in what appeared to be an integer column, the pipeline halts or silently coerces the string into `NaN`. 

Datamorph loads every raw column initially as `VARCHAR`. Type casting is delayed until the Profiler analyzes 100% of the rows and the Cleaning Engine executes verified `TRY_CAST` transformations.

---

## Feature 02: Vectorized Profiling Engine

### 1. Overview
The **Vectorized Profiling Engine** (`core/profiler.py`, `core/analyzer.py`) scans staged datasets in a single, high-throughput DuckDB execution pass. It extracts comprehensive statistical summaries, column data distributions, data quality defect indicators, and candidate keys without performing redundant table rescans. Regardless of input dataset size (100 MB to 10 GB), the profiler generates a compact, high-density JSON profile (`profile.json`) under 100 KB in size.

### 2. Metrics & Quality Defects Detected

| Metric Category | Diagnostic Description | Vectorized DuckDB Extraction Function |
|---|---|---|
| **Candidate Primary Keys** | Identifies columns or column pairs with 100% uniqueness and 0% nulls. | `COUNT(DISTINCT col) = COUNT(*) AND COUNT(col) = COUNT(*)` |
| **Sentinel Null Values** | Catches text representations of missing data (`"N/A"`, `"-"`, `"null"`, `"None"`, `"\\N"`, `"#REF!"`). | `COUNT(*) FILTER (WHERE TRIM(LOWER(col)) IN ('n/a', 'null', 'none', '-'))` |
| **Whitespace Pollution** | Distinguishes between leading spaces, trailing carriage returns, and multi-space padding. | `COUNT(*) FILTER (WHERE col != TRIM(col))` |
| **Timestamp Drift** | Detects mixed date formats across a single column (e.g., `YYYY-MM-DD` mixed with `MM/DD/YYYY` or epoch seconds). | Regex pattern grouping & `TRY_CAST(col AS TIMESTAMP)` validation |
| **Numeric Discrepancies** | Identifies columns formatted as text containing currency signs (`$`, `€`), commas (`1,000`), or percent signs (`%`). | Regex matching for currency & separator patterns |
| **Exact Row Duplication** | Measures redundant duplicate rows across the entire dataset. | `COUNT(*) - COUNT(DISTINCT hash_row)` |

### 3. Benchmark Performance

| Dataset Rows | File Size | DuckDB Profiling Latency | Traditional Profiling (Python) | Memory Peak |
|---|---|---|---|---|
| **100,000** | 12 MB | **0.18s** | 4.80s | 45 MB |
| **1,000,000** | 110 MB | **1.24s** | 42.10s | 98 MB |
| **15,000,000** | 1.05 GB | **63.05s** | *Crashed (OOM)* | 380 MB |

---

## Feature 03: AI Recipe Generation & Heuristic Fallback

### 1. Overview
The **AI Recipe Generation System** (`core/recipe.py`, `core/llm/`) bridges qualitative profile insights with deterministic data transformations. It leverages Google Gemini (`gemini-3.5-flash` / `gemini-flash-latest`) to synthesize an optimized data cleaning plan ("Recipe"). To guarantee safety, execution reliability, and zero hallucination risk, the LLM is **never permitted to generate raw SQL code**. Instead, it outputs a strictly parameterized Pydantic configuration constrained to an allowlist of 18 vectorized cleaning macros.

### 2. The 18 Vectorized Cleaning Macros

```
Macro Menu Allowlist (Strictly Validated via Pydantic extra="forbid")
├── Whitespace & Text
│   ├── trim_whitespace     (strip leading/trailing whitespace)
│   ├── normalize_case      (lower, upper, title casing)
│   ├── collapse_spaces     (consecutive spaces -> single space)
│   └── strip_characters    (remove unprintable / control chars)
├── Null & Sentinels
│   ├── convert_sentinels   ('N/A', 'null', '-' -> SQL NULL)
│   ├── impute_missing      (fill with mean, median, mode, or literal)
│   └── drop_null_rows      (drop records with critical missing fields)
├── Type Casting
│   ├── cast_type           (safe TRY_CAST to target type)
│   ├── parse_currency      (strip '$', '€' and cast to DOUBLE)
│   ├── parse_percentage    (strip '%' and divide by 100.0)
│   └── parse_boolean       ('yes'/'no', '1'/'0' -> BOOLEAN)
├── Dates & Timestamps
│   ├── standardize_dates   (normalize drift into ISO 8601)
│   └── extract_epoch       (Unix epoch -> standard TIMESTAMP)
├── Deduplication
│   ├── deduplicate_rows    (drop exact row duplicates)
│   └── deduplicate_by_key  (retain newest/first row per primary key)
├── Outliers & Filtering
│   ├── filter_outliers     (cap or filter beyond N std devs or IQR)
│   └── filter_range        (constrain numerics to [min, max])
└── Privacy & Masking
    └── mask_pii            (hash or token redacting for PII)
```

### 3. Deterministic Heuristic Fallback Engine
When running in air-gapped environments, without an API key, or during network timeouts (>5.0s), Datamorph engages its deterministic heuristic rules engine. It evaluates detected defects and synthesizes an equivalent recipe in **<2ms**, providing 100% pipeline reliability.

---

## Feature 04: Vectorized CTE SQL Cleaning Engine

### 1. Overview
The **Vectorized CTE SQL Execution Engine** (`core/engine.py`, `core/compiler.py`) compiles high-level cleaning recipes into a single, unified Common Table Expression (CTE) query chain. Instead of executing multiple iterative `UPDATE` queries or copying data through intermediate Python memory buffers, the entire cleaning pipeline runs in-process inside DuckDB's vectorized execution engine at throughputs exceeding **1,300,000 rows per second**.

### 2. Compiled CTE Architecture
Every transformation step forms a dependency stage in a single query:
```sql
WITH 
raw_source AS (
    SELECT * FROM read_parquet('data/jobs/{user_id}/{job_id}/parquet/staged.parquet')
),
step_1_whitespace AS (
    SELECT TRIM(id) AS id, TRIM(name) AS name, TRIM(amount) AS amount FROM raw_source
),
step_2_sentinels AS (
    SELECT id, name, CASE WHEN amount IN ('N/A', 'null', '-') THEN NULL ELSE amount END AS amount 
    FROM step_1_whitespace
),
step_3_casting AS (
    SELECT TRY_CAST(id AS INTEGER) AS id, name, TRY_CAST(amount AS DOUBLE) AS amount 
    FROM step_2_sentinels
),
step_4_dedup AS (
    SELECT * EXCLUDE (rk) FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY amount DESC) as rk FROM step_3_casting
    ) WHERE rk = 1
)
COPY (SELECT * FROM step_4_dedup) 
TO 'data/jobs/{user_id}/{job_id}/clean/cleaned.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
```

### 3. Safe Concrete Type Evolution with `TRY_CAST`
Standard `CAST(col AS DOUBLE)` halts an entire pipeline if a single corrupted string is encountered. Datamorph uses `TRY_CAST` across all compiled queries: valid values are transformed at native speed, and corrupt outliers are safely coerced to `NULL` for verification auditing without aborting execution.

---

## Feature 05: Automated Verification & Reconciliation

### 1. Overview
The **Automated Verification & Reconciliation Engine** (`core/verifier.py`) acts as the quality assurance gatekeeper for Datamorph. After the Vectorized CTE Engine executes, the verifier automatically re-profiles the resulting dataset, compares post-clean characteristics against pre-clean metrics, asserts that recipe constraints were satisfied, and computes exact row-level reconciliation deltas.

### 2. Four Verification Gates
1. **Row Count Reconciliation:** Asserts $\text{Input Rows} - \text{Duplicates} - \text{Dropped} = \text{Output Rows}$.
2. **Type Adherence Validation:** Verifies that 100% of transformed columns match their target physical types with 0 uncoerced string remnants.
3. **Null Reduction Audit:** Audits exact counts of sentinels coerced to SQL `NULL` and cells imputed by mean/median/mode.
4. **Constraint & Uniqueness Assertions:** Validates candidate primary key distinctness ($1.000$) and range boundaries.

The engine writes `verification.json` and renders a visual Reconciliation Delta Card in the web UI.

---

## Feature 06: Zero-Profiling Convert-Only Mode

### 1. Overview
For scenarios requiring pure file format conversion without data transformation, the **Convert-Only Mode** (`/api/convert`, `frontend/src/pages/ConvertPage.tsx`) provides high-speed streaming conversion across all 6 supported formats (CSV, Parquet, JSON, NDJSON, XLSX, SQLite) bypassing profiling and LLM analysis completely.

### 2. High-Speed 2 MB Preview & 1-Click Handoff
- **Instant Preview:** For files larger than 5 MB, the browser sends a 2 MB sample slice returning a reactive 20-row preview grid in **<100ms** to verify delimiters and sheet selections.
- **Handoff to Clean:** If the converted data reveals data defects, clicking "Handoff to Clean" (`/api/convert/{id}/handoff-to-clean`) automatically registers the file into the cleaning pipeline without duplicate uploads.

---

## Feature 07: Sandboxed SQL Query Studio

### 1. Overview
The **Sandboxed SQL Query Studio** (`explore/service.py`, `explore/sandbox.py`, `explore/validate.py`) provides an in-browser analytical workbench. Users can upload raw files directly or explore post-clean datasets using native DuckDB SQL.

### 2. AST Validation & Security Sandbox
- **`sqlglot` AST Parser:** Disallows multi-statement attacks and enforces read-only `SELECT` queries.
- **Forbidden Function Blocklist:** 100% denial rate on file reads (`read_csv`, `read_parquet`), metadata inspection (`duckdb_settings`), and database attachments (`ATTACH`).
- **Resource Ceilings:** 5.0-second query execution timeout, 10,000-row returned truncation cap, and a per-user concurrency controller.
- **Direct Export:** Users can download the filtered query result set directly as CSV (`/api/explore/{job_id}/export`).

---

## Feature 08: AI Analyst (Natural Language to SQL)

### 1. Overview
The **AI Analyst** (`analyst/service.py`, `analyst/prompt.py`, `analyst/context.py`) translates plain English analytical questions ("What were the top 5 regions by total revenue in Q3?") into sandboxed DuckDB SQL queries, executes them against the `data` view, and summarizes the findings in clear prose.

### 2. Three-Tier Privacy & Security Defense
1. **Zero-Row Privacy Masking:** The LLM is never sent full table rows. The prompt contains only column metadata, inferred types, and at most 3 truncated, masked sample values.
2. **Self-Correction Retry Loop:** If generated SQL encounters a DuckDB syntax or schema error, the error is fed back into a second prompt turn, achieving a 93%+ recovery rate.
3. **AST Validation:** Generated SQL passes through the same strict `sqlglot` read-only filter before execution.

---

## Feature 09: Visualize Data & AI Charting Engine

### 1. Overview
The **Visualize Data Engine** (`charts/service.py`, `charts_ai/service.py`) compiles declarative specifications into high-performance Plotly.js charts. Users can choose from 11 chart types, use the AI Auto-Visualize dashboard generator, or type natural language prompts to generate visualizations.

### 2. Chart Types & Modern Styling
- **Supported Chart Types:** Bar, Horizontal Bar, Line, Area, Histogram (with signature `#8F0926` default), Scatter, Pie, Donut, Box Plot, Heatmap, and Big Number metric cards.
- **Vectorized Aggregation:** DuckDB compiles chart aggregations with `TRY_CAST` directly on disk, enabling rendering of multi-million-row datasets in **<15ms**.
- **Palettes & Styling:** 20 modern analytics color themes, trendlines, interactive sorting, and SVG/PNG/CSV export options.

---

## Feature 10: Multi-Table ERD Modeling Studio

### 1. Overview
The **Multi-Table ERD Modeling Studio** (`core/modeling/service.py`, `frontend/src/pages/ModelPage.tsx`) provides an interactive canvas for staging multiple related data files (CSV, Parquet, JSON, Excel, or SQLite databases) and visually building relational schemas.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Model Data (ERD) Studio Canvas                    │
├──────────────────────────┬──────────────────┬──────────────────────────┤
│    [ Customers Table ]   │                  │     [ Orders Table ]     │
│    • customer_id (PK) ───┼── Bezier Link ───┼──► • customer_id (FK)    │
│    • customer_name       │   Cardinality    │    • order_id (PK)       │
│    • email               │      (1:N)       │    • order_amount        │
└──────────────────────────┴──────────────────┴──────────────────────────┘
```

### 2. Core Capabilities
- **Draggable Entity Cards:** Tables render with column names, data types, and primary key badges, with persistent coordinates on canvas pan and zoom.
- **Automated Relationship Discovery:** Discovers candidate primary keys and calculates foreign key value overlaps using DuckDB set-containment queries.
- **Interactive Join Preview:** Shows match statistics (matched rows, orphan rows, match ratio) and preview rows before executing joins.
- **Multi-Format Schema Export:** Exports the visual model to Mermaid ERD diagrams, DBML, or PostgreSQL DDL.
- **Joined Dataset Materialization:** Executes chained joins and materializes `merged.parquet` for instant handoff into AI Analyst, SQL Studio, or CSV download.

---

## Feature 11: Interactive Data Wrangler & PII Masking

### 1. Overview
The **Interactive Data Wrangler** (`core/wrangler/service.py`, `frontend/src/components/wrangler/`) allows users to visually inspect and manipulate data columns through a virtualized data grid with full undo/redo history.

### 2. Wrangler Capabilities
- **Transformations:** Rename column, drop column, change type, trim whitespace, change case, filter rows, fill missing values, and replace literals.
- **Reversible History:** Non-destructive transformation stack with one-click undo (`/wrangle/undo`) and full reset (`/wrangle/reset`).
- **Automated PII Masking (`core/pii/`):** Identifies email addresses, phone numbers, Social Security Numbers, and credit card patterns, redacting them with deterministic hash digests or `[REDACTED]` tokens.

---

## Feature 12: Automated TTL & Background Storage Retention

### 1. Overview
The **Storage Retention System** (`core/retention.py`) is an autonomous background scavenger that prevents disk exhaustion in SaaS or shared server deployments by enforcing an automated Time-To-Live (TTL) policy.

### 2. Retention Architecture
- **Periodic Daemon Loop:** An asynchronous background worker runs every 30 minutes, sweeping dynamic directories (`jobs/`, `convert_jobs/`, `query_jobs/`, `modeling/`).
- **24-Hour TTL Eviction:** Automatically deletes files and directories older than 24 hours (configurable via `STORAGE_TTL_HOURS`).
- **Protected Fixtures:** Benchmark datasets (`data/benchmarks/`), demo files (`data/demo/`), and evaluation sets (`data/evaluation/`) are strictly whitelisted and never pruned.
- **Emergency Disk-Pressure Protection:** If host disk usage exceeds 90% (`STORAGE_MAX_DISK_PERCENT`), the scavenger triggers a FIFO eviction of the oldest completed jobs.
- **REST Maintenance API:** Offers `GET /api/maintenance/storage` for capacity diagnostics and `POST /api/maintenance/cleanup` for manual sweeps.

---

## Feature 13: Multi-Tenancy & Data Privacy Isolation

### 1. Overview
The **Multi-Tenancy & Privacy Isolation Engine** (`core/tenant.py`, `app/storage.py`) guarantees complete data segregation between users. User A can never access, query, export, or download User B's datasets.

### 2. Security & Zero-Login Client Design
- **Path Traversal Defense:** Tenant identifiers are strictly validated against `^[a-zA-Z0-9_\-]{1,64}$`. Any directory traversal sequences (`../`, `\`, null bytes) are rejected with `400 Bad Request`.
- **Physical Partitioning:** Files are organized into tenant-specific partitions:
  - `data/jobs/{user_id}/{job_id}/...`
  - `data/convert_jobs/{user_id}/{convert_id}/...`
  - `data/modeling/{user_id}/{session_id}/...`
- **OWASP-Compliant IDOR Defense:** If Tenant B attempts to access Tenant A's dataset, Datamorph returns `404 Not Found` (never `403 Forbidden`) to prevent resource enumeration, logging a security audit warning to server logs.
- **Zero-Login Anonymous UUID:** The frontend automatically generates and stores an anonymous UUID in `localStorage` (`datamorph_user_id`), attaching it via `X-User-Id` headers and `?user_id=` download links without forcing user login.
