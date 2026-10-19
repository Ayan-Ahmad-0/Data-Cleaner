"""Format Adapter Layer and Multi-Format Export package."""

from formats.base import (
    ConversionError,
    ConversionReport,
    ExportError,
    FormatAdapter,
    FormatAdapterError,
    FormatDetectionError,
    FormatExporter,
    UnsupportedConversionError,
    UnsupportedFormatError,
)
from formats.convert import (
    COMPATIBILITY_MATRIX,
    ConvertResult,
    check_compatibility,
    convert_file,
)
from formats.fidelity import fidelity_warnings
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
    # Convert-only mode
    "convert_file",
    "ConvertResult",
    "check_compatibility",
    "COMPATIBILITY_MATRIX",
    "fidelity_warnings",
    # Data structures & errors
    "ConversionReport",
    "FormatAdapter",
    "FormatExporter",
    "FormatAdapterError",
    "UnsupportedFormatError",
    "UnsupportedConversionError",
    "FormatDetectionError",
    "ConversionError",
    "ExportError",
    # Registries
    "AdapterRegistry",
    "ExporterRegistry",
]
