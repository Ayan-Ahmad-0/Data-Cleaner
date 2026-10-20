# One-Click AI Data Cleaner Vectorized Pipeline

Vectorized multi-format profiling, cleaning, and exploration pipeline powered by DuckDB, sqlglot, and Google Gemini. Ingests 1 to 10 GB datasets, extracts single-pass statistical profiles without full table scans, parameterizes deterministic SQL transformation macros, and verifies output with automated reconciliation tests.

![DuckDB](https://img.shields.io/badge/DuckDB-1.1+-FFF000?style=flat&logo=duckdb&logoColor=black)
![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12%20%7C%203.13-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19.0+-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Flash%20Preview-4285F4?style=flat&logo=google&logoColor=white)
![sqlglot](https://img.shields.io/badge/sqlglot-30.0+-ED8B00?style=flat&logo=sqlite&logoColor=white)

---

## Overview

1. **Ingest** raw CSV, Parquet, JSON, NDJSON, and Excel files into zstandard-compressed columnar Parquet with all-varchar text staging, avoiding data loss from speculative type inference.
2. **Profile** candidate keys, null token distributions, whitespace anomalies, and timestamp formats in a single DuckDB aggregation pass, emitting profiles smaller than 100 KB.
3. **Draft** structured cleaning recipes using Gemini LLM or heuristic offline safe fallbacks constrained strictly to a fixed macro menu without raw SQL generation.
4. **Compile** parameterized recipes into unified vectorized Common Table Expression (CTE) SQL chains executed entirely in-process by DuckDB at over 1,300,000 rows per second.
5. **Verify** cleaned datasets through post-execution re-profiling, constraint assertions, and exact row-level reconciliation deltas.
6. **Explore** raw and cleaned datasets interactively using an in-browser DuckDB SQL console guarded by sqlglot AST sandboxing and strict query resource caps.

Measured on an AMD Ryzen / Intel Core workstation: 15,000,000 rows (1.05 GB) converted in 9.98s, profiled in 63.05s, and cleaned in 11.38s. Deployed locally via Docker Compose and FastAPI.

---

## Architecture

Raw Files (CSV, Parquet, JSON, NDJSON, XLSX) → Streaming Stager → Parquet Buffer → DuckDB Profiler (<100 KB metadata) → Gemini / Local Fallback → Pydantic Validator → DuckDB CTE Engine → Verifier → Sandboxed SQL Explorer

| Stage | Purpose | Format | Storage |
|---|---|---|---|
| Ingestion | Staging raw input without type coercion | Parquet (ZSTD, all-varchar) | Local disk (`data/jobs/{id}/staged.parquet`) |
| Multi-Format Adapter | Format detection, flattening, and conversion | In-memory Arrow tables | Temporary memory buffers |
| Profiling | Single-pass statistical and defect extraction | JSON (`profile.json`, <100 KB) | Memory / Job Storage |
| AI Drafting | Parameterizing macro menu and quality report | Pydantic Recipe Schema | Memory / Job Storage |
| CTE Compilation | Vectorized data cleaning and type transformation | DuckDB CTE SQL Query | In-process execution |
| Verification | Automated assertion checks and row reconciliation | JSON (`verification.json`) | Job Storage |
| SQL Exploration | Sandboxed read-only interactive exploration | DuckDB In-Memory View | DuckDB memory session |
| Export | Multi-format delivery of cleaned dataset | Parquet, CSV, JSON, NDJSON, XLSX | Local disk / API download |

### Architecture Diagram
<!-- Add: images/architecture_pipeline.png -->
![Architecture Pipeline](images/architecture_pipeline.png)

### Tech Stack
- **Execution Engine**: DuckDB 1.1+ (in-process vectorized SQL, multi-threaded aggregation, zero network overhead)
- **SQL Security & AST**: sqlglot 30.0+ (strict read-only SELECT validation, forbidden statement AST denial)
- **Backend API**: FastAPI 0.111+, Uvicorn 0.30+, Python 3.11 - 3.13
- **Schema & Validation**: Pydantic v2 (strict allowlist models, `extra="forbid"`)
- **AI Reasoning**: Google GenAI SDK (`gemini-3-flash-preview` / `gemini-2.5-flash`), with deterministic fallback
- **Frontend UI**: React 19, TypeScript 5.0+, Tailwind CSS, Vite (5-step linear guided workflow)

---

## Interactive Interface

<!-- Add: images/demo_approval_screen.png -->
![Interactive Review Screen](images/demo_approval_screen.png)

<!-- Add: images/demo_sql_explorer.png -->
![Sandboxed SQL Explorer](images/demo_sql_explorer.png)

<!-- Add: images/demo_results_screen.png -->
![Verification Results Screen](images/demo_results_screen.png)

---

## Pipeline Flow

```
Input (CSV, Parquet, JSON, NDJSON, XLSX)
│
▼
[formats/convert.py] ─────────────────────────► (data/jobs/{id}/raw.parquet)
│
▼
[core/profiler.py] ───────────────────────────► (profile.json < 100 KB)
│
▼
[core/ai/generator.py] ◄── [Gemini LLM] ──────► (recipe.json + report.md)
│
▼
[core/validator.py] ──────────────────────────► Linear Confirmation Review
│
▼
[core/compiler.py] ───────────────────────────► DuckDB Vectorized CTE
│
▼
[core/verifier.py] ───────────────────────────► (data/jobs/{id}/cleaned.parquet)
│                                               (data/jobs/{id}/cleaned.csv)
│                                               (verification.json)
▼
[explore/service.py] ◄── [sqlglot AST Sandbox] ─► In-Browser SQL Explorer (Cleaned Data / Original Data)
```

Each stage is completely deterministic and re-runnable from its stored Parquet snapshot without re-processing raw input files.

---

## Evaluation Results

The evaluation suite benchmarks detection recall, precision, and latency across three representative domains: web analytics events, financial transactions, and e-commerce customer reviews. Corruptions were injected deterministically with ground-truth manifest logs across 5 defect categories: null tokens, string whitespace/casing, timestamp format drift, numeric outliers, and duplicate primary keys.

| Domain | Ingested Rows | Injected Defects | Profiler Detection Recall | Profiler Precision | Cleaning Latency | Cleaning Throughput |
|---|---|---|---|---|---|---|
| Web Events | 50,000 | 10,754 | 98.4% | 99.1% | 0.11s | 454,545 rows/s |
| Transactions | 50,000 | 9,842 | 96.8% | 97.4% | 0.10s | 500,000 rows/s |
| Reviews | 50,000 | 8,910 | 97.3% | 98.0% | 0.12s | 416,666 rows/s |
| Web Events (1 GB Scale) | 15,000,000 | 2,850,000 | 97.9% | 98.6% | 11.38s | 1,318,565 rows/s |

<!-- Add: images/evaluation_metrics.png -->
![Evaluation Metrics](images/evaluation_metrics.png)

The most instructive failure mode occurred during timestamp parsing when mixed European (`%d/%m/%Y`) and US (`%m/%d/%Y`) date tokens coincided in the same column. When day tokens did not exceed 12, ambiguous dates could be incorrectly parsed. The engine diagnoses this ambiguity during profiling and injects an explicit human confirmation prompt into the review screen rather than silently guessing.

---

## Storage Engine

| Object | Description |
|---|---|
| `raw.parquet` | Unmodified source data compressed with ZSTD; all columns typed as VARCHAR to preserve raw token signatures |
| `profile.json` | Compact statistical summary containing distinct counts, null distributions, numeric percentiles, and format matches |
| `recipe.json` | Parameterized JSON structure adhering to the Pydantic macro schema |
| `cleaned.parquet` | Final analytical dataset with concrete DuckDB types (TIMESTAMP, DOUBLE, BIGINT, VARCHAR) and duplicate rows pruned |
| `cleaned.csv` | Exported standard CSV representation for downstream spreadsheet or BI tool ingestion |
| `verification.json` | Audit record containing before/after row delta counts, duplicate reconciliation, and assertion status |
| `export.*` | On-demand format exports generated in Parquet, CSV, JSON, NDJSON, or Excel formats |

---

## Reliability Guarantees

- **Vectorized In-Process Execution** — DuckDB executes all CTE operations in SIMD-accelerated C++ kernels directly against columnar Parquet buffers, eliminating JVM or network socket overhead.
- **Strict Macro Allowlist** — The AI generator has no access to raw SQL generation. It selects and parameterizes macros from a closed schema (`trim_and_normalize`, `cast_type`, `clip_outliers`, `handle_nulls`, `parse_timestamp`, `dedupe`).
- **AST Sandboxed SQL Exploration** — All interactive SQL queries are parsed through `sqlglot` prior to execution. DDL, DML, file system calls, and external table references are denied at parse time before reaching the query engine.
- **Strict Query Resource Caps** — Interactive SQL queries enforce a 5.0-second execution timeout, a 10,000-row return limit, a 100 MB export ceiling, and a 2-worker concurrency guard.
- **SQL Injection Prevention** — All column identifiers and parameters passed into SQL generation are sanitized using `quote_ident()` with double-quote escaping.
- **Privacy Mode Masking** — When privacy mode is enabled, sample data values and categorical token lists are stripped from LLM prompts; only statistical distributions and column names are transmitted.
- **Deterministic Offline Fallback** — If Gemini API rate limits, network interruptions, or quota exhaustion occurs, the pipeline falls back to an offline rule-based recipe generator without pipeline stoppage.
- **Reconciliation Audit Gate** — Output files are verified before delivery; if unexpected row loss exceeds defined thresholds, warnings are flagged in the verification report.

---

## Repository Structure

```
data-cleaner/
├── app/                        # FastAPI REST service and storage manager
│   ├── main.py                 # API route declarations and static asset mounting
│   ├── models.py               # Pydantic schemas for API requests and job metadata
│   ├── orchestrator.py         # Pipeline state machine and execution coordinator
│   └── storage.py              # File path manager for job artifacts and outputs
├── core/                       # Core data cleaning engine
│   ├── ai/                     # LLM integration and recipe generation
│   │   ├── fallback.py         # Rule-based offline heuristic recipe generator
│   │   ├── gemini_client.py    # Google GenAI SDK interface with model fallback
│   │   ├── generator.py        # AIRecipeGenerator orchestrator with single-retry logic
│   │   └── prompts.py          # Grounded prompt templates and privacy masking
│   ├── macros/                 # Deterministic SQL transformation macros
│   │   ├── base.py             # Macro interface and quote_ident sanitizer
│   │   ├── dates.py            # Timestamp parsing and timezone normalization
│   │   ├── dedupe.py           # Deduplication with QUALIFY row_number() windowing
│   │   ├── numbers.py          # Numeric casting, bounds clipping, and null imputation
│   │   └── strings.py          # Whitespace trimming and null token mapping
│   ├── compiler.py             # Vectorized CTE compiler and execution engine
│   ├── converter.py            # Raw CSV to all-varchar ZSTD Parquet converter
│   ├── profiler.py             # Single-pass statistical and defect profiler
│   ├── recipe_schema.py        # Pydantic v2 strict schema models for recipes
│   ├── validator.py            # Schema validation and plain-English translation
│   └── verifier.py             # Automated post-clean assertions and reconciliation
├── explore/                    # Sandboxed in-browser DuckDB exploration engine
│   ├── errors.py               # Exploration-specific exception hierarchy
│   ├── limits.py               # Query execution timeout and concurrency controls
│   ├── sandbox.py              # Secure DuckDB connection factory and filesystem locks
│   ├── service.py              # Sandboxed query execution and schema inspection
│   └── validate.py             # sqlglot AST parsing and read-only SELECT validation
├── formats/                    # Multi-format ingestion and export subsystem
│   ├── adapters/               # Readers for CSV, Parquet, JSON, NDJSON, and Excel
│   ├── exporters/              # Writers for CSV, Parquet, JSON, NDJSON, and Excel
│   ├── base.py                 # Format adapter interface contracts
│   ├── convert.py              # Format conversion pipeline and staging manager
│   ├── detect.py               # Magic byte and structural format sniffing
│   ├── fidelity.py             # Format capability matrices and precision checks
│   ├── flatten.py              # Recursive JSON object and list schema flattener
│   └── registry.py             # Adapter registry for automatic format resolution
├── docs/                       # Technical documentation and evaluation logs
│   ├── adr-001-duckdb-vs-dbt.md# Architecture Decision Record for DuckDB CTEs
│   ├── evaluation_design.md    # Metrics definition and defect taxonomy
│   └── evaluation.md           # Comprehensive evaluation report and scale analysis
├── evaluation/                 # Testing harness and synthetic defect injection
│   ├── datasets/               # Domain-specific synthetic data generators
│   ├── injector.py             # Controlled corruption injector and manifest logger
│   ├── run_experiments.py      # Baseline experimental runner
│   └── scorer.py               # Precision, recall, and F1 calculation engine
├── frontend/                   # React 19 + TypeScript + Vite web interface
│   ├── src/                    # UI screens (Upload, Report, Approval, Progress, Results, Explore)
│   ├── package.json            # Node dependency declarations
│   └── vite.config.ts          # Vite build configuration with proxy support
├── tests/                      # Pytest test suite (139 unit and integration tests)
├── .github/workflows/ci.yml    # GitHub Actions multi-version CI workflow (Python 3.11/3.12, Node 20)
├── demo.py                     # Autonomous end-to-end CLI demonstration runner
├── docker-compose.yml          # Containerized multi-stage service deployment
├── Dockerfile                  # Multi-stage production container build
├── requirements.txt            # Python backend dependencies
└── README.md                   # System documentation
```

---

## Configuration

Copy `.env.example` to `.env` and set parameters:

```bash
# Google Gemini API Key (optional for offline heuristic mode)
GEMINI_API_KEY=AIzaSyYourKeyHere

# Model configuration
GEMINI_MODEL=gemini-3-flash-preview

# DuckDB Engine Settings
DUCKDB_MEMORY_LIMIT=4GB
DUCKDB_THREADS=4
```

- **Connection Secrets** — No external database connection strings are required; DuckDB runs in-process with ephemeral or file-backed storage.
- **Deployment Keys** — If `GEMINI_API_KEY` is not provided, the pipeline operates in offline deterministic heuristic mode without failure.
- **Memory Quirks** — On memory-constrained systems (e.g. 8 GB RAM total), adjust `DUCKDB_MEMORY_LIMIT=2GB` to prevent OS swapping during multi-GB dataset conversions.

---

## Getting Started

### 1. Clone repository
```bash
git clone https://github.com/Ayan-Ahmad-0/Data-Cleaner.git
cd data-cleaner
```

### 2. Install dependencies
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run autonomous end-to-end demo
```bash
python demo.py 25000
```

### 4. Run full test suite
```bash
pytest -v tests/
```

### 5. Launch interactive web application
```bash
# Terminal 1: Backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend dev server
cd frontend
npm install
npm run dev
```

### 6. Run with Docker Compose
```bash
docker compose up --build
```

| Service | URL | Description |
|---|---|---|
| Web Application | http://localhost:5173 | Interactive 5-step React UI (Development) |
| Unified API & UI | http://localhost:8000 | FastAPI backend serving API and static production frontend |
| API Documentation | http://localhost:8000/docs | Interactive OpenAPI Swagger UI |
| Health Endpoint | http://localhost:8000/api/health | Service readiness and engine status |

---

## Challenges Solved

- **Type Inference Sampling Bias** — Symptom: Ingesting dirty CSVs directly into standard typed SQL engines failed on row 50,000 due to unexpected string tokens in numeric columns. Diagnosis: DuckDB's automatic CSV sniffer uses sample rows that miss corruptions occurring deeper in large files. Fix: Implemented two-stage ingestion where CSVs are initially converted to Parquet with `all_varchar=true`, deferring type casting to compiled CTE stages after complete statistical profiling.
- **Python 3.11 f-String Backslash Syntax Restriction** — Symptom: GitHub Actions CI failed with `SyntaxError: f-string expression part cannot include a backslash` during test collection on Python 3.11 runners. Diagnosis: Python 3.11 does not permit backslashes inside f-string expression braces (`{p.replace('\'', '\'\'')}`). Fix: Refactored string escaping in `explore/sandbox.py` to use explicit string concatenation prior to list joining.
- **SQL Dialect Title-Casing Absence** — Symptom: Recipe execution failed with `Catalog Error: Scalar Function with name initcap does not exist`. Diagnosis: DuckDB SQL does not implement PostgreSQL's `initcap()` function. Fix: Implemented composite SQL expression `(upper(substr(col, 1, 1)) || lower(substr(col, 2)))` inside string normalization macros.
- **Profiler String Functions on Typed Data** — Symptom: Verification failed with `Binder Error: No function matches length(DOUBLE)`. Diagnosis: Columns already transformed into numeric or date types in verification passes were passed into string length assertions. Fix: Wrapped all text inspection queries in safe `try_cast(col AS VARCHAR)` expressions.
- **CI Missing Dependencies Under Minimal Runners** — Symptom: CI failed during test collection with `ModuleNotFoundError: No module named 'sqlglot'`. Diagnosis: `sqlglot` and `httpx` were present in the local virtual environment but omitted from `requirements.txt`. Fix: Added `sqlglot>=25.0.0` and `httpx>=0.27.0` to `requirements.txt` and updated the `Dockerfile` to copy `explore/` and `formats/` directories.
- **Fallback Recipe Numeric Typing** — Symptom: In the interactive SQL query box, numeric columns in cleaned tables remained typed as `VARCHAR`. Diagnosis: `MinimalSafeRecipeGenerator` detected numeric types for bounds clipping but omitted setting `rule.cast_type`. Fix: Updated heuristic fallback logic to automatically set `CastTypeConfig(type="double" | "bigint")` for all inferred numeric columns.
- **LLM Model Availability and Rate Spikes** — Symptom: Calls to preview Gemini endpoints intermittently returned `503 UNAVAILABLE` or `404 NOT_FOUND` during peak usage. Diagnosis: Preview model quotas and regional demand fluctuations caused transient request drops. Fix: Built a two-tier resilience architecture featuring `gemini-3-flash-preview` with an automatic fallback to `MinimalSafeRecipeGenerator` heuristic execution.
- **Windows CLI Encoding Glitches** — Symptom: CLI demo crashed with `UnicodeEncodeError: 'charmap' codec can't encode character '\u2717'`. Diagnosis: Standard Windows PowerShell consoles operate on Windows-1252 code pages that cannot display Unicode tick/cross symbols. Fix: Standardized CLI test outputs on ASCII markers `[PASS]` and `[WARN]`.

---

## Future Improvements

- **Fuzzy Deduplication via MinHash LSH** — Extend exact primary key deduplication to support approximate string matching for customer names and addresses using DuckDB extension bindings.
- **Schema Drift Alerting** — Implement automated schema evolution detection comparing successive CSV uploads against historical baseline profiles.
- **Partitioned Parquet Output** — Add optional hive-partitioned exports (`/year=2026/month=10/`) for enterprise data warehouse ingestion into Snowflake or BigQuery.
- **Custom User Macro Registration** — Allow end users to register custom SQL transformation macros via the web UI without modifying core compiler source code.
