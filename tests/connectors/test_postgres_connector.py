"""Tests for PostgreSQL database connector."""

from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from connectors.base import ExportMode, SyncResult, TestConnectionResult
from connectors.postgres import PostgresConnector, PostgresConnectorConfig


def test_postgres_connector_metadata():
    connector = PostgresConnector()
    meta = connector.get_metadata()
    assert meta.id == "postgres"
    assert meta.display_name == "PostgreSQL"
    assert meta.category == "database"
    assert "table" in meta.supported_formats
    assert any(f["name"] == "host" for f in meta.config_fields)
    assert any(f["name"] == "table_name" for f in meta.config_fields)


def test_postgres_sanitize_identifier():
    connector = PostgresConnector()
    assert connector._sanitize_identifier("valid_table_name_123", "table") == "valid_table_name_123"
    assert connector._sanitize_identifier("schema_public", "schema") == "schema_public"

    with pytest.raises(ValueError, match="Invalid table"):
        connector._sanitize_identifier("table; DROP TABLE users;", "table")

    with pytest.raises(ValueError, match="Invalid table"):
        connector._sanitize_identifier("123_invalid_start", "table")

    with pytest.raises(ValueError, match="Invalid table"):
        connector._sanitize_identifier("table-with-dashes", "table")


def test_postgres_build_connection_string():
    connector = PostgresConnector()
    cfg = PostgresConnectorConfig(
        host="localhost",
        port=5432,
        database="analytics",
        username="postgres",
        password="secret'password\\withquotes",
        schema_name="public",
        table_name="cleaned_orders",
        sslmode="require",
    )
    conn_str = connector._build_connection_string(cfg)
    assert "host='localhost'" in conn_str
    assert "port=5432" in conn_str
    assert "dbname='analytics'" in conn_str
    assert "user='postgres'" in conn_str
    assert "secret\\'password\\\\withquotes" in conn_str
    assert "sslmode='require'" in conn_str


def test_postgres_test_connection_unreachable():
    connector = PostgresConnector()
    res = connector.test_connection({
        "host": "invalid-unreachable-db-host.internal",
        "port": 5432,
        "database": "postgres",
        "username": "user",
        "password": "pwd",
        "table_name": "test_table",
    })
    assert isinstance(res, TestConnectionResult)
    assert res.success is False
    assert "PostgreSQL connection failed" in res.message


def test_postgres_export_missing_file_raises(tmp_path: Path):
    connector = PostgresConnector()
    missing_file = tmp_path / "not_there.parquet"
    with pytest.raises(FileNotFoundError):
        connector.export_dataset(
            missing_file,
            config={
                "host": "localhost",
                "database": "db",
                "username": "u",
                "password": "p",
                "table_name": "t",
            },
        )


def test_postgres_export_success_mock(tmp_path: Path):
    connector = PostgresConnector()
    source_pq = tmp_path / "data.parquet"
    source_pq.write_bytes(b"dummy content")

    mock_con = MagicMock()
    mock_con.execute.return_value.fetchone.return_value = [4200]

    with patch("duckdb.connect", return_value=mock_con):
        res = connector.export_dataset(
            source_parquet_path=source_pq,
            config={
                "host": "db.supabase.co",
                "port": 6543,
                "database": "postgres",
                "username": "postgres",
                "password": "password123",
                "schema_name": "analytics",
                "table_name": "clean_transactions",
                "mode": "overwrite",
            },
        )

        assert isinstance(res, SyncResult)
        assert res.success is True
        assert res.rows_transferred == 4200
        assert "clean_transactions" in res.destination_uri
        assert res.details["schema"] == "analytics"
        assert res.details["mode"] == "overwrite"
        mock_con.close.assert_called_once()


def test_postgres_import_table_mock(tmp_path: Path):
    connector = PostgresConnector()
    target_pq = tmp_path / "imported_pg.parquet"

    mock_con = MagicMock()
    mock_con.execute.return_value.fetchone.return_value = [850]

    with patch("duckdb.connect", return_value=mock_con):
        res = connector.import_dataset(
            config={
                "host": "localhost",
                "database": "sales_db",
                "username": "postgres",
                "password": "secret",
                "schema_name": "public",
                "table_name": "orders",
            },
            target_parquet_path=target_pq,
        )

        assert isinstance(res, SyncResult)
        assert res.success is True
        assert res.rows_transferred == 850
        assert "orders" in res.destination_uri
        mock_con.close.assert_called_once()


def test_postgres_import_custom_query_mock(tmp_path: Path):
    connector = PostgresConnector()
    target_pq = tmp_path / "imported_query.parquet"

    mock_con = MagicMock()
    mock_con.execute.return_value.fetchone.return_value = [120]

    with patch("duckdb.connect", return_value=mock_con):
        res = connector.import_dataset(
            config={
                "host": "localhost",
                "database": "sales_db",
                "username": "postgres",
                "password": "secret",
                "query": "SELECT id, amount, customer FROM orders WHERE status = 'COMPLETED'",
            },
            target_parquet_path=target_pq,
        )

        assert isinstance(res, SyncResult)
        assert res.success is True
        assert res.rows_transferred == 120
        assert "custom query" in res.destination_uri
        mock_con.close.assert_called_once()


def test_postgres_import_missing_table_and_query_raises(tmp_path: Path):
    connector = PostgresConnector()
    target_pq = tmp_path / "imported.parquet"

    with pytest.raises(ValueError, match="Either table_name or query must be provided"):
        connector.import_dataset(
            config={
                "host": "localhost",
                "database": "sales_db",
                "username": "postgres",
                "password": "secret",
            },
            target_parquet_path=target_pq,
        )

