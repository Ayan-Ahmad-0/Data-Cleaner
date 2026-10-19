"""Registry for format adapters and exporters, and the primary four-function public API."""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Type

from formats.base import (
    ConversionReport,
    FormatAdapter,
    FormatDetectionError,
    FormatExporter,
    UnsupportedFormatError,
)
from formats.detect import detect_format as _detect_format


class AdapterRegistry:
    """Central registry of all input format adapters."""

    _adapters: Dict[str, FormatAdapter] = {}

    @classmethod
    def register(cls, adapter: FormatAdapter) -> None:
        cls._adapters[adapter.format_id.lower()] = adapter

    @classmethod
    def get(cls, format_id: str) -> Optional[FormatAdapter]:
        return cls._adapters.get(format_id.lower())

    @classmethod
    def list_adapters(cls) -> List[FormatAdapter]:
        return list(cls._adapters.values())

    @classmethod
    def find_by_extension(cls, ext: str) -> Optional[FormatAdapter]:
        ext_clean = ("." + ext.lstrip(".")).lower()
        for adapter in cls._adapters.values():
            if any(ext_clean == e or ext_clean.endswith(e) for e in adapter.extensions):
                return adapter
        return None


class ExporterRegistry:
    """Central registry of all output format exporters."""

    _exporters: Dict[str, FormatExporter] = {}

    @classmethod
    def register(cls, exporter: FormatExporter) -> None:
        cls._exporters[exporter.format_id.lower()] = exporter

    @classmethod
    def get(cls, format_id: str) -> Optional[FormatExporter]:
        return cls._exporters.get(format_id.lower())

    @classmethod
    def list_exporters(cls) -> List[FormatExporter]:
        return list(cls._exporters.values())


# ==============================================================================
# Built-in Registrations
# ==============================================================================

def _register_defaults() -> None:
    from formats.adapters.csv_adapter import CsvAdapter
    from formats.adapters.parquet_adapter import ParquetAdapter
    from formats.adapters.json_adapter import JsonAdapter
    from formats.adapters.excel_adapter import ExcelAdapter
    from formats.adapters.sqlite_adapter import SqliteAdapter

    from formats.exporters.csv_exporter import CsvExporter, TsvExporter
    from formats.exporters.parquet_exporter import ParquetExporter
    from formats.exporters.json_exporter import NdjsonExporter, JsonArrayExporter
    from formats.exporters.excel_exporter import ExcelExporter

    # Adapters
    AdapterRegistry.register(CsvAdapter())
    AdapterRegistry.register(ParquetAdapter())
    AdapterRegistry.register(JsonAdapter())
    AdapterRegistry.register(ExcelAdapter())
    AdapterRegistry.register(SqliteAdapter())

    # Exporters
    ExporterRegistry.register(CsvExporter())
    ExporterRegistry.register(TsvExporter())
    ExporterRegistry.register(ParquetExporter())
    ExporterRegistry.register(NdjsonExporter())
    ExporterRegistry.register(JsonArrayExporter())
    ExporterRegistry.register(ExcelExporter())


_register_defaults()


# ==============================================================================
# Public API (Section 5.4 of Spec)
# ==============================================================================

def detect_format(path: Path) -> Tuple[str, float]:
    """
    Detect the format id and confidence of a given file.
    Example: ('ndjson', 0.95)
    """
    return _detect_format(path)


def convert_to_parquet(
    path: Path,
    out_path: Path,
    format_id: Optional[str] = None,
    options: Optional[Dict[str, Any]] = None,
) -> ConversionReport:
    """
    Stream-convert any supported data file into flat canonical Parquet.
    If format_id is omitted, it is automatically detected.
    """
    path = Path(path).resolve()
    out_path = Path(out_path).resolve()
    options = options or {}

    if not format_id or format_id == "auto":
        detected, confidence = detect_format(path)
        if detected == "unknown" or confidence < 0.50:
            raise FormatDetectionError(path, confidence)
        format_id = detected

    adapter = AdapterRegistry.get(format_id)
    if not adapter:
        # Fallback check by extension
        adapter = AdapterRegistry.find_by_extension(path.suffix)

    if not adapter:
        hint = "Please convert or export to CSV, Parquet, JSON, or Excel (.xlsx)."
        if path.suffix.lower() == ".xls":
            hint = "Legacy .xls is not supported; please save as .xlsx or .csv."
        raise UnsupportedFormatError(format_id, hint=hint)

    return adapter.to_parquet(path, out_path, options=options)


def list_export_options(source_format: str, row_count: int) -> List[Dict[str, Any]]:
    """
    Return all available export formats and their capabilities for a dataset of row_count.
    Includes notes on splitting or recommendations.
    """
    results: List[Dict[str, Any]] = []
    source_lower = (source_format or "").lower()

    # Friendly display names
    format_names = {
        "csv": "CSV (Comma-Separated Values)",
        "tsv": "TSV (Tab-Separated Values)",
        "parquet": "Parquet (Compressed Columnar)",
        "ndjson": "NDJSON (Newline-Delimited JSON)",
        "json": "JSON (Standard JSON Array)",
        "xlsx": "Excel Workbook (.xlsx)",
    }

    # Normalize source format for "Same as uploaded"
    normalized_source = source_lower
    if normalized_source in ("jsonl", "ndjson"):
        normalized_source = "ndjson"
    elif normalized_source in ("csv", "tsv", "txt"):
        normalized_source = "csv" if source_lower != "tsv" else "tsv"

    for exporter in ExporterRegistry.list_exporters():
        available, note = exporter.available_for(source_format, row_count)
        is_same = (exporter.format_id == normalized_source)

        results.append({
            "format_id": exporter.format_id,
            "name": format_names.get(exporter.format_id, exporter.format_id.upper()),
            "extension": exporter.extension,
            "mime_type": exporter.mime_type,
            "available": available,
            "note": note,
            "is_source_format": is_same,
        })

    return results


def export_cleaned(
    cleaned_parquet: Path,
    out_dir: Path,
    format_id: str,
    options: Optional[Dict[str, Any]] = None,
) -> List[Path]:
    """
    Export cleaned Parquet dataset into the requested target format.
    Returns list of paths created (handles multi-file splitting for Excel).
    """
    cleaned_parquet = Path(cleaned_parquet).resolve()
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    options = options or {}

    exporter = ExporterRegistry.get(format_id)
    if not exporter:
        raise UnsupportedFormatError(format_id, hint=f"Available export formats: {list(ExporterRegistry._exporters.keys())}")

    base_name = cleaned_parquet.stem.replace("cleaned_", "").replace(".parquet", "")
    target_filename = f"cleaned_{base_name}{exporter.extension}"
    target_path = out_dir / target_filename

    return exporter.export(cleaned_parquet, target_path, options=options)
