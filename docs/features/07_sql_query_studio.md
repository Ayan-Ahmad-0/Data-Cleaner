# Feature 07: Sandboxed SQL Query Studio

## 1. Overview
The **Sandboxed SQL Query Studio** (`explore/service.py`, `explore/sandbox.py`, `explore/validate.py`, `frontend/src/pages/QueryPage.tsx`) provides a zero-setup, in-browser SQL workbench. Analysts and engineers can upload raw datasets directly (or query post-clean outputs) and execute ad-hoc analytical queries using native DuckDB SQL. The execution engine is protected by strict AST validation powered by `sqlglot`, read-only connection sandboxing, memory caps, and timeout circuit-breakers.

---

## 2. Multi-Tier Security & AST Validation

To prevent arbitrary code execution, server filesystem exfiltration, or denial-of-service attacks, every SQL query passes through a multi-tier security filter before hitting the database:

```
User SQL Query
      │
      ▼
Tier 1: AST Parsing & Whitelist Filter (`explore/validate.py` via sqlglot)
      ├── Disallow multiple statements (`SELECT 1; DROP TABLE data;`)
      ├── Require root statement to be AST `Select`
      └── Strictly forbid write / administrative AST nodes:
          - Drop, Insert, Delete, Update, Alter, Create
          - Attach, Detach, Copy, Export, Import, Checkpoint, Vacuum
          - Install, Load, Pragma, Set, Call
      │
      ▼
Tier 2: Forbidden Table & Function Scanner
      ├── Block disk-probing functions: `read_csv`, `read_parquet`, `read_json`, `read_text`, `glob`
      ├── Block database metadata access: `duckdb_settings`, `information_schema`
      └── Restrict target table exclusively to virtual view `data`
      │
      ▼
Tier 3: Execution Sandbox & Resource Ceilings (`explore/sandbox.py`)
      ├── In-memory DuckDB connection (`:memory:`)
      ├── 5.0-second query timeout watchdog
      ├── 10,000-row returned truncation ceiling
      └── Per-user & global concurrency limiter (max 10 parallel queries)
      │
      ▼
Query Execution Output (JSON Rows + Paginated React Data Grid)
```

---

## 3. Defense Against Known SQL Injections

The following real-world attack vectors were tested against Datamorph's AST validator; **100% were rejected** with explicit HTTP `400 Bad Request` security errors:

| Attack Payload | Security Mechanism | Error Triggered |
|---|---|---|
| `DROP TABLE data;` | Non-SELECT root statement | `Only read-only SELECT queries are permitted.` |
| `SELECT * FROM read_csv('/etc/passwd');` | Forbidden table-valued function | `Function 'read_csv' is not permitted.` |
| `ATTACH 'evil.db' AS evil;` | Forbidden AST node `Attach` | `ATTACH statements are forbidden.` |
| `INSTALL httpfs; LOAD httpfs;` | Multi-statement & extension loading | `Multiple SQL statements are not permitted.` |
| `SELECT 1; -- comment\n DROP TABLE data` | Multi-statement comment bypass | `Multiple SQL statements are not permitted.` |
| `SELECT * FROM duckdb_settings();` | System internals probing | `Access to 'duckdb_settings' is forbidden.` |

---

## 4. Analytical Capabilities

Because queries run on DuckDB, users have access to modern analytical SQL features:
- **Window Functions:** `ROW_NUMBER() OVER (...)`, `RANK()`, `LEAD()`, `LAG()`
- **Common Table Expressions (CTEs):** `WITH summary AS (...) SELECT * FROM summary`
- **Aggregation Functions:** `MEDIAN()`, `APPROX_COUNT_DISTINCT()`, `QUANTILE_CONT()`
- **Regex & String Manipulation:** `REGEXP_MATCHES()`, `SPLIT_PART()`, `CONCAT_WS()`
- **Complex Aggregations:** `FILTER (WHERE ...)` clauses inside aggregations

---

## 5. UI Features & Export

- **Instant Schema Tree:** Displays all column names, detected data types, and null counts in a collapsible sidebar.
- **Query Auto-Format:** Beautifies SQL syntax with standard indentation.
- **Export Filtered Results:** Allows downloading the exact query output as a standalone CSV with custom file naming (`/api/explore/{job_id}/export`).
