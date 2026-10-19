"""Base interfaces, data structures, and typed errors for the Format Adapter Layer."""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ==============================================================================
# Typed Exceptions
# ==============================================================================

class FormatAdapterError(Exception):
    """Base exception for all format adapter operations."""
    pass


class UnsupportedFormatError(FormatAdapterError):
    """Raised when a format is unknown or not supported."""
    def __init__(self, format_id: str, hint: Optional[str] = None) -> None:
        msg = f"Unsupported format: '{format_id}'."
        if hint:
            msg += f" {hint}"
        super().__init__(msg)
        self.format_id = format_id
        self.hint = hint


class FormatDetectionError(FormatAdapterError):
    """Raised when format detection confidence is below threshold or ambiguous."""
    def __init__(self, path: Path, confidence: float, message: Optional[str] = None) -> None:
        msg = message or f"Unable to reliably detect format for '{path.name}' (confidence: {confidence:.2f}). Please specify format explicitly."
        super().__init__(msg)
        self.path = path
        self.confidence = confidence


class ConversionError(FormatAdapterError):
    """Raised when parsing or converting a file to Parquet fails."""
    def __init__(self, message: str, row_or_line: Optional[int] = None) -> None:
        full_msg = message
        if row_or_line is not None:
            full_msg = f"Error at line/row {row_or_line}: {message}"
        super().__init__(full_msg)
        self.row_or_line = row_or_line


class ExportError(FormatAdapterError):
    """Raised when exporting cleaned Parquet to a target format fails."""
    pass


class UnsupportedConversionError(FormatAdapterError):
    """Raised when a source-to-target format conversion pair is not allowed."""
    def __init__(self, source_format: str, target_format: str, reason: str, suggestion: Optional[str] = None) -> None:
        msg = f"Cannot convert '{source_format}' to '{target_format}': {reason}"
        if suggestion:
            msg += f" {suggestion}"
        super().__init__(msg)
        self.source_format = source_format
        self.target_format = target_format
        self.reason = reason
        self.suggestion = suggestion


# ==============================================================================
# Conversion Report
# ==============================================================================

@dataclass
class ConversionReport:
    """Summary of an adapter conversion to canonical flat Parquet."""
    source_format: str
    rows: int
    columns: List[str]
    column_types: Dict[str, str]  # Column name -> DuckDB type name
    warnings: List[str] = field(default_factory=list)
    options_used: Dict[str, Any] = field(default_factory=dict)
    flattened: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_format": self.source_format,
            "rows": self.rows,
            "columns": self.columns,
            "column_types": self.column_types,
            "warnings": self.warnings,
            "options_used": self.options_used,
            "flattened": self.flattened,
        }


# ==============================================================================
# Abstract Base Interfaces
# ==============================================================================

class FormatAdapter(ABC):
    """Contract for converting source data files into flat canonical Parquet."""
    format_id: str
    extensions: Tuple[str, ...]

    @abstractmethod
    def sniff(self, path: Path) -> float:
        """
        Return confidence 0.0-1.0 that this adapter can read the file.
        Must read only a small initial chunk (e.g. 64KB) of the file.
        """
        pass

    @abstractmethod
    def preview(
        self,
        path: Path,
        options: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], ConversionReport]:
        """
        Return the first `limit` rows as flat dicts plus a ConversionReport.
        Must execute quickly even on multi-GB files.
        """
        pass

    @abstractmethod
    def to_parquet(
        self,
        path: Path,
        out_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> ConversionReport:
        """
        Stream-convert the entire file to a flat canonical Parquet file at out_path.
        Memory must remain bounded.
        """
        pass


class FormatExporter(ABC):
    """Contract for exporting cleaned canonical Parquet into target formats."""
    format_id: str
    extension: str
    mime_type: str

    @abstractmethod
    def export(
        self,
        cleaned_parquet: Path,
        out_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> List[Path]:
        """
        Write the cleaned table to out_path.
        Returns a list of created file paths (e.g. multiple files if split).
        Must write to temporary file first and atomically rename on completion.
        """
        pass

    def available_for(self, source_format: str, row_count: int) -> Tuple[bool, Optional[str]]:
        """
        Whether this export format is offered for the dataset, plus an optional explanatory note.
        """
        return True, None
