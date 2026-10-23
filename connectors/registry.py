"""Central registry for discovering and instantiating cloud and database connectors."""

from __future__ import annotations
import logging
from typing import Dict, List, Optional

from connectors.base import BaseConnector, ConnectorMetadata
from connectors.postgres import PostgresConnector
from connectors.s3 import S3Connector

logger = logging.getLogger(__name__)


class ConnectorRegistry:
    """Registry maintaining active connectors for data sources and destinations."""

    _connectors: Dict[str, BaseConnector] = {}

    @classmethod
    def register(cls, connector: BaseConnector) -> None:
        """Register a connector instance by its identifier."""
        key = connector.connector_type.value
        cls._connectors[key] = connector
        logger.debug("Registered connector '%s' (%s)", key, connector.display_name)

    @classmethod
    def get(cls, connector_id: str) -> Optional[BaseConnector]:
        """Retrieve a connector by identifier."""
        cls._ensure_defaults()
        return cls._connectors.get(connector_id.lower().strip())

    @classmethod
    def list_all(cls) -> List[ConnectorMetadata]:
        """List all available connectors with their configuration metadata."""
        cls._ensure_defaults()
        return [c.get_metadata() for c in cls._connectors.values()]

    @classmethod
    def _ensure_defaults(cls) -> None:
        """Register default out-of-the-box connectors if not already loaded."""
        if not cls._connectors:
            cls.register(S3Connector())
            cls.register(PostgresConnector())


# Ensure default connectors are registered on import
ConnectorRegistry._ensure_defaults()
