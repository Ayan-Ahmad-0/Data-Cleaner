"""PostgreSQL direct database connector powered by DuckDB postgres extension."""

from __future__ import annotations
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import duckdb
from pydantic import BaseModel, Field

from connectors.base import (
    BaseConnector,
    ConnectionTestResult,
    ConnectorMetadata,
    ConnectorType,
    ExportMode,
    SyncResult,
)

logger = logging.getLogger(__name__)


class PostgresConnectorConfig(BaseModel):
    """Configuration for connecting to a PostgreSQL database."""
    host: str = Field(..., description="PostgreSQL host (e.g., localhost, aws-0-us-east-1.pooler.supabase.com)")
    port: int = Field(5432, description="PostgreSQL port (default 5432)")
    database: str = Field(..., description="Target database name")
    username: str = Field(..., description="Database user name")
    password: str = Field(..., description="Database password")
    schema_name: str = Field("public", description="Target database schema name")
    table_name: str = Field(default="", description="Target destination or source table name")
    query: Optional[str] = Field(None, description="Optional custom SQL SELECT query for import")
    sslmode: str = Field("prefer", description="SSL connection mode (disable, allow, prefer, require)")
    mode: ExportMode = Field(ExportMode.OVERWRITE, description="Export mode: overwrite or append")


class PostgresConnector(BaseConnector):
    """High-speed vectorized database connector for PostgreSQL using DuckDB."""

    connector_type = ConnectorType.POSTGRES
    display_name = "PostgreSQL"
    description = "Push cleaned tables directly into PostgreSQL or cloud Postgres services (Supabase, Neon, RDS)."
    category = "database"

    def get_metadata(self) -> ConnectorMetadata:
        return ConnectorMetadata(
            id=self.connector_type.value,
            display_name=self.display_name,
            description=self.description,
            category=self.category,
            supported_formats=["table"],
            supports_import=True,
            supports_export=True,
            config_fields=[
                {"name": "host", "label": "Host", "type": "string", "required": True, "placeholder": "localhost or db.xyz.supabase.co"},
                {"name": "port", "label": "Port", "type": "number", "required": False, "default": 5432},
                {"name": "database", "label": "Database", "type": "string", "required": True, "placeholder": "postgres"},
                {"name": "username", "label": "Username", "type": "string", "required": True, "placeholder": "postgres"},
                {"name": "password", "label": "Password", "type": "password", "required": True, "secret": True},
                {"name": "schema_name", "label": "Schema", "type": "string", "required": False, "default": "public", "placeholder": "public"},
                {"name": "table_name", "label": "Table Name", "type": "string", "required": True, "placeholder": "cleaned_dataset"},
                {"name": "mode", "label": "Write Mode", "type": "select", "options": ["overwrite", "append"], "default": "overwrite"},
                {"name": "sslmode", "label": "SSL Mode", "type": "select", "options": ["prefer", "require", "disable"], "default": "prefer"},
            ],
        )

    def _sanitize_identifier(self, identifier: str, field_name: str) -> str:
        """Ensure SQL identifier is alphanumeric with underscores to prevent injection."""
        clean = identifier.strip()
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", clean):
            raise ValueError(f"Invalid {field_name} '{identifier}'. Must contain only letters, numbers, and underscores, starting with a letter or underscore.")
        return clean

    def _build_connection_string(self, cfg: PostgresConnectorConfig) -> str:
        """Construct a safe libpq connection string."""
        # Escape single quotes and backslashes in password/user if necessary
        pwd_escaped = cfg.password.replace("\\", "\\\\").replace("'", "\\'")
        user_escaped = cfg.username.replace("\\", "\\\\").replace("'", "\\'")
        db_escaped = cfg.database.replace("\\", "\\\\").replace("'", "\\'")
        host_escaped = cfg.host.replace("\\", "\\\\").replace("'", "\\'")

        return (
            f"host='{host_escaped}' port={cfg.port} dbname='{db_escaped}' "
            f"user='{user_escaped}' password='{pwd_escaped}' sslmode='{cfg.sslmode}'"
        )

    def test_connection(self, config: Dict[str, Any]) -> ConnectionTestResult:
        """Attempt to attach to PostgreSQL and execute a ping query."""
        start_time = time.perf_counter()
        try:
            cfg = PostgresConnectorConfig.model_validate(config)
            self._sanitize_identifier(cfg.schema_name, "schema_name")
            self._sanitize_identifier(cfg.table_name, "table_name")

            con = duckdb.connect(":memory:")
            con.execute("INSTALL postgres; LOAD postgres;")
            conn_str = self._build_connection_string(cfg)
            conn_str_sql = conn_str.replace("'", "''")

            alias = f"pg_test_{int(time.time())}"
            con.execute(f"ATTACH '{conn_str_sql}' AS {alias} (TYPE POSTGRES);")
            
            # Run test query
            con.execute(f"SELECT 1 FROM {alias}.information_schema.tables LIMIT 1;")
            con.execute(f"DETACH {alias};")
            con.close()

            elapsed = (time.perf_counter() - start_time) * 1000
            return ConnectionTestResult(
                success=True,
                message=f"Successfully connected to PostgreSQL at {cfg.host}:{cfg.port}/{cfg.database}",
                latency_ms=round(elapsed, 2),
                details={"host": cfg.host, "database": cfg.database, "schema": cfg.schema_name},
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start_time) * 1000
            logger.warning("Postgres connection test failed: %s", e)
            return ConnectionTestResult(
                success=False,
                message=f"PostgreSQL connection failed: {str(e)}",
                latency_ms=round(elapsed, 2),
            )

    def export_dataset(
        self,
        source_parquet_path: Path,
        config: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None,
    ) -> SyncResult:
        """Export local Parquet dataset into a PostgreSQL table."""
        if not source_parquet_path.exists():
            raise FileNotFoundError(f"Source dataset not found at {source_parquet_path}")

        start_time = time.perf_counter()
        cfg = PostgresConnectorConfig.model_validate(config)
        if not cfg.table_name:
            raise ValueError("Table name is required for PostgreSQL export.")
        schema = self._sanitize_identifier(cfg.schema_name, "schema_name")
        table = self._sanitize_identifier(cfg.table_name, "table_name")

        con = duckdb.connect(":memory:")
        con.execute("INSTALL postgres; LOAD postgres;")

        conn_str = self._build_connection_string(cfg)
        conn_str_sql = conn_str.replace("'", "''")
        alias = "pg_target"

        try:
            con.execute(f"ATTACH '{conn_str_sql}' AS {alias} (TYPE POSTGRES);")

            src_path_str = str(source_parquet_path.resolve()).replace("\\", "/")
            row_count_res = con.execute(f"SELECT count(*) FROM read_parquet('{src_path_str}')").fetchone()
            row_count = int(row_count_res[0]) if row_count_res else 0

            # Execute table creation / insertion
            if cfg.mode == ExportMode.OVERWRITE:
                con.execute(f"DROP TABLE IF EXISTS {alias}.{schema}.{table};")
                con.execute(f"CREATE TABLE {alias}.{schema}.{table} AS SELECT * FROM read_parquet('{src_path_str}');")
            elif cfg.mode == ExportMode.APPEND:
                con.execute(f"INSERT INTO {alias}.{schema}.{table} SELECT * FROM read_parquet('{src_path_str}');")
            else:
                raise ValueError(f"Unsupported write mode: {cfg.mode}")

            destination_uri = f"postgresql://{cfg.host}:{cfg.port}/{cfg.database}/{schema}.{table}"
            elapsed = time.perf_counter() - start_time

            return SyncResult(
                success=True,
                rows_transferred=row_count,
                destination_uri=destination_uri,
                elapsed_seconds=round(elapsed, 3),
                message=f"Successfully transferred {row_count:,} rows into {schema}.{table} in {elapsed:.2f}s",
                details={
                    "host": cfg.host,
                    "database": cfg.database,
                    "schema": schema,
                    "table": table,
                    "mode": cfg.mode.value,
                },
            )
        except Exception as e:
            logger.exception("Postgres export failed to %s.%s", schema, table)
            raise RuntimeError(f"Failed to export to PostgreSQL table '{schema}.{table}': {str(e)}") from e
        finally:
            try:
                con.execute(f"DETACH {alias};")
            except Exception:
                pass
            con.close()

    def import_dataset(
        self,
        config: Dict[str, Any],
        target_parquet_path: Path,
        options: Optional[Dict[str, Any]] = None,
    ) -> SyncResult:
        """Import table or query from PostgreSQL directly into canonical local Parquet."""
        start_time = time.perf_counter()
        cfg = PostgresConnectorConfig.model_validate(config)

        import_query = cfg.query or (options or {}).get("query")
        if import_query:
            source_desc = "custom query"
        else:
            if not cfg.table_name:
                raise ValueError("Either table_name or query must be provided for PostgreSQL import.")
            schema = self._sanitize_identifier(cfg.schema_name, "schema_name")
            table = self._sanitize_identifier(cfg.table_name, "table_name")
            source_desc = f"{schema}.{table}"

        target_parquet_path.parent.mkdir(parents=True, exist_ok=True)
        target_path_str = str(target_parquet_path.resolve()).replace("\\", "/")

        con = duckdb.connect(":memory:")
        con.execute("INSTALL postgres; LOAD postgres;")

        conn_str = self._build_connection_string(cfg)
        conn_str_sql = conn_str.replace("'", "''")
        alias = "pg_source"

        try:
            con.execute(f"ATTACH '{conn_str_sql}' AS {alias} (TYPE POSTGRES);")

            if import_query:
                source_expr = f"({import_query})"
            else:
                source_expr = f"{alias}.{schema}.{table}"

            con.execute(f"COPY (SELECT * FROM {source_expr}) TO '{target_path_str}' (FORMAT PARQUET, COMPRESSION 'ZSTD');")

            row_count_res = con.execute(f"SELECT count(*) FROM read_parquet('{target_path_str}')").fetchone()
            row_count = int(row_count_res[0]) if row_count_res else 0

            elapsed = time.perf_counter() - start_time
            destination_uri = f"postgresql://{cfg.host}:{cfg.port}/{cfg.database}/{source_desc}"

            return SyncResult(
                success=True,
                rows_transferred=row_count,
                destination_uri=destination_uri,
                elapsed_seconds=round(elapsed, 3),
                message=f"Successfully imported {row_count:,} rows from PostgreSQL {source_desc} in {elapsed:.2f}s",
                details={
                    "host": cfg.host,
                    "database": cfg.database,
                    "source": source_desc,
                    "target_path": str(target_parquet_path),
                },
            )
        except Exception as e:
            logger.exception("Postgres import failed: %s", e)
            raise RuntimeError(f"Failed to import from PostgreSQL: {str(e)}") from e
        finally:
            try:
                con.execute(f"DETACH {alias};")
            except Exception:
                pass
            con.close()

