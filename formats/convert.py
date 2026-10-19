"""Orchestration function and compatibility matrix for Convert-Only mode."""

from __future__ import annotations
import math
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from formats.base import (
    ConversionReport,
    FormatDetectionError,
    UnsupportedConversionError,
    UnsupportedFormatError,
)
from formats.detect import detect_format
from formats.fidelity import fidelity_warnings
from formats.registry import (
    AdapterRegistry,
    ExporterRegistry,
    convert_to_parquet,
    export_cleaned,
)

# ==============================================================================
# Compatibility Matrix (Section 6.2 of Spec)
# ==============================================================================

# Dictionary mapping source_format -> set of supported target_formats
# Target is available as long as exporter exists in ExporterRegistry
COMPATIBILITY_MATRIX: Dict[str, Dict[str, Dict[str, Any]]] = {
    "csv": {
        "csv": {"allowed": True, "note": "Re-export with customized delimiter or encoding"},
        "tsv": {"allowed": True, "note": "Export as Tab-Separated Values"},
        "parquet": {"allowed": True, "note": "High-efficiency columnar format (ZSTD compressed)"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Excel workbook format (splits if >1M rows)"},
    },
    "tsv": {
        "csv": {"allowed": True, "note": "Export as Comma-Separated Values"},
        "tsv": {"allowed": True, "note": "Re-export with customized options"},
        "parquet": {"allowed": True, "note": "High-efficiency columnar format (ZSTD compressed)"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Excel workbook format (splits if >1M rows)"},
    },
    "parquet": {
        "csv": {"allowed": True, "note": "Export as Comma-Separated Values"},
        "tsv": {"allowed": True, "note": "Export as Tab-Separated Values"},
        "parquet": {"allowed": True, "note": "Re-export Parquet"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Excel workbook format (splits if >1M rows)"},
    },
    "json": {
        "csv": {"allowed": True, "note": "Flattened schema exported to CSV"},
        "tsv": {"allowed": True, "note": "Flattened schema exported to TSV"},
        "parquet": {"allowed": True, "note": "Columnar format with flattened structs"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Excel workbook (splits if >1M rows)"},
    },
    "ndjson": {
        "csv": {"allowed": True, "note": "Flattened schema exported to CSV"},
        "tsv": {"allowed": True, "note": "Flattened schema exported to TSV"},
        "parquet": {"allowed": True, "note": "Columnar format with flattened structs"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Excel workbook (splits if >1M rows)"},
    },
    "xlsx": {
        "csv": {"allowed": True, "note": "Selected sheet exported to CSV"},
        "tsv": {"allowed": True, "note": "Selected sheet exported to TSV"},
        "parquet": {"allowed": True, "note": "Selected sheet converted to Parquet"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Re-export to Excel workbook"},
    },
    "sqlite": {
        "csv": {"allowed": True, "note": "Selected table exported to CSV"},
        "tsv": {"allowed": True, "note": "Selected table exported to TSV"},
        "parquet": {"allowed": True, "note": "Selected table converted to Parquet"},
        "ndjson": {"allowed": True, "note": "Newline-delimited JSON stream"},
        "json": {"allowed": True, "note": "Standard JSON Array format"},
        "xlsx": {"allowed": True, "note": "Excel workbook (splits if >1M rows)"},
    },
}


def check_compatibility(source_format: str, target_format: str) -> Tuple[bool, str]:
    """Check whether a source-to-target format conversion is supported."""
    src = (source_format or "").lower().strip()
    tgt = (target_format or "").lower().strip()

    if src in ("jsonl", "ndjson"):
        src = "ndjson"
    if tgt in ("jsonl", "ndjson"):
        tgt = "ndjson"

    # Unsupported output format not registered
    if not ExporterRegistry.get(tgt):
        return False, f"Target format '{tgt}' does not have a registered exporter. Supported targets: csv, tsv, parquet, ndjson, json, xlsx."

    source_rules = COMPATIBILITY_MATRIX.get(src)
    if not source_rules:
        # Check if source format is supported at all
        if not AdapterRegistry.get(src):
            return False, f"Source format '{src}' is not supported. Supported sources: csv, tsv, parquet, json, ndjson, xlsx, sqlite."
        # If adapter exists, default to allowing all registered exporters
        return True, "Compatible"

    target_rule = source_rules.get(tgt)
    if not target_rule or not target_rule.get("allowed", False):
        return False, f"Conversion from '{source_format}' to '{target_format}' is not supported."

    return True, target_rule.get("note", "Compatible")


# ==============================================================================
# ConvertResult & convert_file Orchestration
# ==============================================================================

@dataclass
class ConvertResult:
    output_files: List[Path]
    source_format: str
    target_format: str
    rows: int
    columns: List[str]
    warnings: List[str] = field(default_factory=list)
    intermediate_parquet: Optional[Path] = None
    elapsed_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "output_files": [str(p) for p in self.output_files],
            "output_filenames": [p.name for p in self.output_files],
            "source_format": self.source_format,
            "target_format": self.target_format,
            "rows": self.rows,
            "columns": self.columns,
            "warnings": self.warnings,
            "intermediate_parquet": str(self.intermediate_parquet) if self.intermediate_parquet else None,
            "elapsed_seconds": self.elapsed_seconds,
        }


def convert_file(
    input_path: Path,
    target_format: str,
    work_dir: Path,
    source_format: Optional[str] = None,
    source_options: Optional[Dict[str, Any]] = None,
    target_options: Optional[Dict[str, Any]] = None,
    progress_cb: Optional[Callable[[str, float], None]] = None,
    keep_intermediate: bool = False,
) -> ConvertResult:
    """
    Stream-convert any supported dataset directly to the target format without profiling or cleaning.

    Args:
        input_path: Path to raw input dataset
        target_format: format_id for desired output ('csv', 'tsv', 'parquet', 'ndjson', 'json', 'xlsx')
        work_dir: Directory where task-isolated output artifacts should be stored
        source_format: Optional source format id (auto-detected if None)
        source_options: Options for adapter (delimiter, sheet, table, etc.)
        target_options: Options for exporter
        progress_cb: Optional callable(stage: str, fraction: float)
        keep_intermediate: If True, preserves intermediate Parquet for handoff to cleaning

    Returns:
        ConvertResult with paths, row counts, columns, and fidelity warnings.
    """
    start_time = time.perf_counter()
    input_path = Path(input_path).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # 1. Isolated job directory
    job_uuid = uuid.uuid4().hex[:8]
    job_dir = Path(work_dir).resolve() / f"convert_{job_uuid}"
    job_dir.mkdir(parents=True, exist_ok=True)
    temp_intermediate = job_dir / "intermediate.parquet"

    # Report progress helper
    def report_progress(stage: str, frac: float) -> None:
        if progress_cb:
            try:
                progress_cb(stage, frac)
            except Exception:
                pass

    try:
        report_progress("detecting", 0.10)

        # 2. Source format detection
        src_fmt = source_format
        if not src_fmt or src_fmt == "auto":
            detected, confidence = detect_format(input_path)
            if detected == "unknown" or confidence < 0.50:
                raise FormatDetectionError(input_path, confidence)
            src_fmt = detected

        # 3. Compatibility check
        allowed, reason = check_compatibility(src_fmt, target_format)
        if not allowed:
            suggestion = "Please select another target format like Parquet or CSV."
            raise UnsupportedConversionError(src_fmt, target_format, reason, suggestion=suggestion)

        # 4. Convert to canonical Parquet staging
        report_progress("reading", 0.30)
        conversion_report = convert_to_parquet(
            path=input_path,
            out_path=temp_intermediate,
            format_id=src_fmt,
            options=source_options,
        )

        # 5. Build fidelity warnings
        report_progress("analyzing", 0.60)
        merged_warnings = fidelity_warnings(
            source_format=src_fmt,
            target_format=target_format,
            report=conversion_report,
            options=target_options,
        )

        # 6. Export to target format
        report_progress("writing", 0.80)
        output_dir = job_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        created_files = export_cleaned(
            cleaned_parquet=temp_intermediate,
            out_dir=output_dir,
            format_id=target_format,
            options=target_options,
        )

        report_progress("completed", 1.0)
        elapsed = time.perf_counter() - start_time

        # 7. Intermediate parquet management
        saved_intermediate = None
        if keep_intermediate:
            saved_intermediate = temp_intermediate
        elif target_format.lower() == "parquet" and len(created_files) == 1:
            # Output is already parquet
            if temp_intermediate.exists() and temp_intermediate != created_files[0]:
                temp_intermediate.unlink(missing_ok=True)
        else:
            temp_intermediate.unlink(missing_ok=True)

        return ConvertResult(
            output_files=created_files,
            source_format=src_fmt,
            target_format=target_format,
            rows=conversion_report.rows,
            columns=conversion_report.columns,
            warnings=merged_warnings,
            intermediate_parquet=saved_intermediate,
            elapsed_seconds=round(elapsed, 3),
        )

    except Exception:
        # Clean up job temp directory on failed runs
        if not keep_intermediate and job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        raise
