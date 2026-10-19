"""Fidelity warnings rules engine for format conversions."""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from formats.base import ConversionReport

EXCEL_MAX_DATA_ROWS = 1_048_575


def fidelity_warnings(
    source_format: str,
    target_format: str,
    report: ConversionReport,
    options: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """
    Evaluate conversion fidelity and produce specific, sorted, human-readable warnings.

    Args:
        source_format: normalized source format id (e.g. 'csv', 'json', 'xlsx')
        target_format: normalized target format id (e.g. 'parquet', 'csv', 'xlsx')
        report: ConversionReport produced by convert_to_parquet
        options: optional user options passed for source or target

    Returns:
        List of plain-English warnings sorted by importance.
    """
    options = options or {}
    src = (source_format or "").lower().strip()
    tgt = (target_format or "").lower().strip()

    # Normalization
    if src in ("jsonl", "ndjson"):
        src = "ndjson"
    if tgt in ("jsonl", "ndjson"):
        tgt = "ndjson"

    warnings: List[str] = []

    # 1. Truncated / skipped rows (highest severity)
    # Check if adapter reported skipped rows
    for w in report.warnings:
        if "skipped" in w.lower() or "truncated" in w.lower():
            warnings.append(w)

    # 2. Schema Flattening (nested structs / objects)
    if report.flattened and tgt != "parquet":
        warnings.append(
            "Nested data was flattened into columns using dot notation (e.g. parent.child). Original nested structure is not preserved."
        )

    # 3. Excel row limits / multi-part splitting
    if tgt == "xlsx" and report.rows > EXCEL_MAX_DATA_ROWS:
        import math
        parts = math.ceil(report.rows / EXCEL_MAX_DATA_ROWS)
        warnings.append(
            f"The output dataset contains {report.rows:,} rows and will be split into {parts} Excel workbooks because Excel limits sheets to 1,048,576 rows."
        )

    # 4. Source Excel formula & formatting loss
    if src == "xlsx":
        sheet_info = ""
        if report.options_used and report.options_used.get("selected_sheet"):
            sheet_info = f" (sheet: '{report.options_used['selected_sheet']}')"
        warnings.append(
            f"Formulas were converted to their cached values. Cell formatting, colors, and multiple sheets are not preserved{sheet_info}."
        )

    # 5. Untyped CSV/TSV to typed target
    if src in ("csv", "tsv") and tgt in ("parquet", "json", "ndjson", "xlsx"):
        warnings.append(
            f"Source {src.upper()} has no native type information. Column data types were automatically inferred from sample values; verify the preview."
        )

    # 6. Typed source to untyped CSV/TSV
    if src in ("parquet", "json", "ndjson", "xlsx", "sqlite") and tgt in ("csv", "tsv"):
        warnings.append(
            f"Target {tgt.upper()} exports all columns as text values. Timestamps and dates are formatted in ISO-8601 representation."
        )

    # 7. Heavy standard JSON array for large files
    if tgt == "json" and report.rows > 50_000:
        warnings.append(
            f"Exporting {report.rows:,} rows as a single JSON array consumes significant memory when opened. NDJSON is recommended for large datasets."
        )

    # 8. List/array columns in tabular targets
    has_arrays = False
    for col, col_type in report.column_types.items():
        if "[]" in col_type or "LIST" in col_type.upper() or "ARRAY" in col_type.upper():
            has_arrays = True
            break
    if has_arrays and tgt in ("csv", "tsv", "xlsx"):
        warnings.append(
            f"Array and list columns were serialized as JSON text strings in the {tgt.upper()} output."
        )

    # 9. Mixed-type columns from adapter warnings
    for w in report.warnings:
        if "mixed type" in w.lower() and w not in warnings:
            warnings.append(w)

    # 10. Timestamps without timezone
    for col, col_type in report.column_types.items():
        if "TIMESTAMP" in col_type.upper() and "TZ" not in col_type.upper():
            # If adapter specifically warned or timestamps detected without tz
            pass

    # Deduplicate while preserving order
    deduped: List[str] = []
    for item in warnings:
        if item not in deduped:
            deduped.append(item)

    return deduped
