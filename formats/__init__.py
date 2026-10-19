"""Format Adapter Layer and Multi-Format Export package."""

from formats.base import (
    ConversionError,
    ConversionReport,
    ExportError,
    FormatAdapter,
    FormatAdapterError,
    FormatDetectionError,
    FormatExporter,
    UnsupportedFormatError,
)
from formats.registry import (
    AdapterRegistry,
    ExporterRegistry,
    convert_to_parquet,
    detect_format,
    export_cleaned,
    list_export_options,
)

__all__ = [
    # Primary 4-function public API
    "detect_format",
    "convert_to_parquet",
    "list_export_options",
    "export_cleaned",
    # Data structures & errors
    "ConversionReport",
    "FormatAdapter",
    "FormatExporter",
    "FormatAdapterError",
    "UnsupportedFormatError",
    "FormatDetectionError",
    "ConversionError",
    "ExportError",
    # Registries
    "AdapterRegistry",
    "ExporterRegistry",
]
