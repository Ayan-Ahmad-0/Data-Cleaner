# Feature 01: Multi-Format Ingestion & Cloud Connectors

## 1. Overview
The **Multi-Format Ingestion Engine** provides a zero-data-loss gateway for ingesting tabular datasets of varying shapes, encodings, and container formats into Datamorph's vectorized columnar pipeline. It automatically detects source formats via magic byte signatures, stages heterogeneous raw data into uniform zstandard-compressed columnar Parquet with all-varchar string representation, and integrates with cloud object stores and relational databases.

---

## 2. Supported Ingestion Sources

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

---

## 3. Architecture & Ingestion Flow

```
Raw File / Cloud Stream
  │
  ▼
Format Detection (`formats/detector.py`)
  ├── Magic byte analysis
  ├── Extension fallback
  └── Sample slice (First 1 MB read avoids reading multi-GB files for format sniffing)
  │
  ▼
Staging Adapter (`formats/`)
  ├── Enforce all-varchar casting (`CAST(col AS VARCHAR)`)
  ├── Eliminate premature truncation and type mismatch exceptions
  └── Normalize null sentinel representations
  │
  ▼
Staged Columnar Storage (`data/jobs/{user_id}/{job_id}/parquet/staged.parquet`)
  └── Compressed with Zstandard (ZSTD) for 3-5x storage reduction
```

---

## 4. Key Design Decisions

1. **All-Varchar Staging Architecture:**
   - *Problem:* Traditional data loading libraries (pandas, polars) infer column types based on the first 1,000 rows. If row 10,001 contains an alphanumeric string in what appeared to be an integer column, the pipeline halts or silently coerces the string into `NaN`.
   - *Solution:* Every raw column is initially loaded as `VARCHAR`. Type casting is delayed until the Profiler analyzes 100% of the rows and the Cleaning Engine executes verified `TRY_CAST` transformations.

2. **Zero-Overhead Sample Sniffing:**
   - In the frontend, files exceeding 1 MB are sliced in-browser (`file.slice(0, 1024 * 1024)`). Only the initial 1 MB sample is transmitted to `/api/formats/detect` for immediate schema and sheet detection.

3. **External Connector Security:**
   - Database credentials and AWS access keys are encrypted in-flight, never logged to server consoles, and held solely in-memory for the duration of the transfer stream.

---

## 5. API Reference

### `POST /api/formats/detect`
Inspects an uploaded file sample and returns detected format, confidence score, and sheet/table names.
- **Request:** `multipart/form-data` with `file: UploadFile`
- **Response:**
  ```json
  {
    "format": "EXCEL",
    "confidence": 1.0,
    "filename": "quarterly_financials.xlsx",
    "sheets": ["Q1_Summary", "Q2_Summary", "Historical_Raw"],
    "tables": []
  }
  ```

### `POST /api/connectors/test`
Validates connectivity to an external PostgreSQL database or AWS S3 bucket.
- **Payload:**
  ```json
  {
    "type": "postgres",
    "connection_string": "postgresql://user:pass@host:5432/analytics"
  }
  ```
- **Response:**
  ```json
  {
    "status": "connected",
    "tables": ["orders", "customers", "inventory_logs"]
  }
  ```
