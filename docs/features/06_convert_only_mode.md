# Feature 06: Zero-Profiling Convert-Only Mode

## 1. Overview
Not every analytical task requires comprehensive profiling, AI recipe generation, or dataset transformation. Often, engineers simply need to convert a 2 GB CSV or Excel workbook into high-performance Apache Parquet or export SQLite database tables to JSON Lines for web APIs.

The **Convert-Only Mode** (`/api/convert`, `frontend/src/pages/ConvertPage.tsx`) provides a dedicated streaming conversion pipeline that bypasses profiling and LLM analysis completely. It achieves raw I/O transfer speeds, supports instant browser previews via sample slicing, and includes a 1-click **Handoff to Clean** workflow.

---

## 2. Conversion Matrix

Datamorph supports bidirectional stream conversion across all 6 primary data formats:

| From \ To | Parquet | CSV | JSON Lines | JSON Array | Excel (.xlsx) | SQLite (.db) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **CSV / TSV** | Yes | Yes (delim/quote change) | Yes | Yes | Yes | Yes |
| **Parquet** | Yes (compression change) | Yes | Yes | Yes | Yes | Yes |
| **JSON Lines** | Yes | Yes | Yes | Yes | Yes | Yes |
| **JSON Array** | Yes | Yes | Yes | Yes | Yes | Yes |
| **Excel (.xlsx)** | Yes | Yes | Yes | Yes | Yes (sheet split) | Yes |
| **SQLite (.db)** | Yes (per-table) | Yes (per-table) | Yes | Yes | Yes | Yes |

---

## 3. Instant 2 MB Preview Engine

For large files (50 MB to 10 GB), users should not wait minutes just to verify whether delimiter or header options are configured correctly.

In Convert-Only mode:
1. If the input file exceeds 5 MB, the client slices the first 2 MB (`file.slice(0, 2 * 1024 * 1024)`).
2. The server processes the 2 MB sample instantaneously in memory via DuckDB.
3. The frontend displays the first 20 rows in a reactive grid within **<100ms**, allowing users to verify columns, headers, and encoding before executing the full conversion.

---

## 4. One-Click Handoff to Clean Pipeline

Convert-Only mode is seamlessly linked with the core cleaning pipeline. If a user converts a dirty CSV to Parquet and notices formatting anomalies in the preview grid, they do not need to download and re-upload the dataset.

Clicking **"Handoff to Clean"**:
1. Invokes `POST /api/convert/{convert_id}/handoff-to-clean`.
2. The server creates an active cleaning job directly referencing the converted Parquet file in storage.
3. The browser automatically transitions to the **Results & Recipe Studio**, initiating single-pass profiling without duplicate network uploads.

---

## 5. API Reference

### `POST /api/convert`
Generates an instantaneous tabular preview for format options validation.
- **Form Data:**
  - `file`: Raw upload or sample slice
  - `format`: Target format identifier (`PARQUET`, `CSV`, `JSON`, `XLSX`)
  - `options`: JSON string of dialect options (`{"delimiter": ",", "header": true}`)

### `POST /api/convert/execute`
Executes full-speed stream conversion and returns download metadata.
- **Form Data:**
  - `file`: Full file upload
  - `target_format`: Format ID
- **Response:**
  ```json
  {
    "convert_id": "conv_98a72b",
    "result": {
      "output_files": ["data/convert_jobs/default/conv_98a72b/output.parquet"],
      "output_filenames": ["converted_sales.parquet"],
      "source_format": "CSV",
      "target_format": "PARQUET",
      "rows": 15000000,
      "columns": ["id", "timestamp", "amount"],
      "elapsed_seconds": 9.98
    }
  }
  ```
