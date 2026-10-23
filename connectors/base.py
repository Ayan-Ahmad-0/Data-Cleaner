"""Base definitions, schemas, and interfaces for data warehouse and cloud storage connectors."""

from __future__ import annotations
from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConnectorType(str, Enum):
    """Enumeration of supported connector targets."""
    S3 = "s3"
    POSTGRES = "postgres"
    MOTHERDUCK = "motherduck"
    SHEETS = "sheets"


class ExportMode(str, Enum):
    """Behavior when destination table or target already exists."""
    OVERWRITE = "overwrite"
    APPEND = "append"


class ExportFormat(str, Enum):
    """File format for cloud storage exports."""
    PARQUET = "parquet"
    CSV = "csv"
    JSON = "json"


class ConnectorMetadata(BaseModel):
    """Exposes connector capabilities and configuration requirements to the UI."""
    id: str
    display_name: str
    description: str
    category: str  # "cloud_storage", "database", "lakehouse", "spreadsheet"
    supported_formats: List[str] = Field(default_factory=list)
    supports_import: bool = True
    supports_export: bool = True
    config_fields: List[Dict[str, Any]] = Field(default_factory=list)


class TestConnectionResult(BaseModel):
    """Response returned when pinging or validating connector credentials."""
    success: bool
    message: str
    latency_ms: Optional[float] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class SyncResult(BaseModel):
    """Result of exporting or importing a dataset via a connector."""
    success: bool
    rows_transferred: int
    destination_uri: str
    elapsed_seconds: float
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)


class BaseConnector(ABC):
    """Abstract interface that all storage and database connectors must implement."""

    connector_type: ConnectorType
    display_name: str
    description: str
    category: str

    @abstractmethod
    def get_metadata(self) -> ConnectorMetadata:
        """Return UI-consumable schema and capability metadata."""
        pass

    @abstractmethod
    def test_connection(self, config: Dict[str, Any]) -> TestConnectionResult:
        """Validate credentials, endpoints, and reachability."""
        pass

    @abstractmethod
    def export_dataset(
        self,
        source_parquet_path: Path,
        config: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None,
    ) -> SyncResult:
        """Export dataset to the destination."""
        pass

    def import_dataset(
        self,
        config: Dict[str, Any],
        target_parquet_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> SyncResult:
        """Import dataset from the source into canonical Parquet (default stub)."""
        raise NotImplementedError(f"Import not implemented for connector {self.connector_type.value}")
