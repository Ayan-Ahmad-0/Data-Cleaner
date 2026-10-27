"""Tests for S3 and S3-compatible cloud storage connector."""

from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from connectors.base import ExportFormat, SyncResult, TestConnectionResult
from connectors.s3 import S3Connector, S3ConnectorConfig


def test_s3_connector_metadata():
    connector = S3Connector()
    meta = connector.get_metadata()
    assert meta.id == "s3"
    assert meta.display_name == "AWS S3 / Cloudflare R2"
    assert meta.category == "cloud_storage"
    assert "parquet" in meta.supported_formats
    assert "csv" in meta.supported_formats
    assert "json" in meta.supported_formats
    assert any(f["name"] == "bucket" for f in meta.config_fields)
    assert any(f["name"] == "endpoint_url" for f in meta.config_fields)


def test_s3_build_destination_uri():
    connector = S3Connector()

    # Default prefix and filename
    cfg1 = S3ConnectorConfig(bucket="my-bucket", export_format=ExportFormat.PARQUET)
    uri1 = connector._build_destination_uri(cfg1, default_name="test_dataset")
    assert uri1 == "s3://my-bucket/test_dataset.parquet"

    # With prefix and custom filename
    cfg2 = S3ConnectorConfig(
        bucket="s3://my-bucket/",
        prefix="/analytics/2026/",
        filename="custom_report",
        export_format=ExportFormat.CSV,
    )
    uri2 = connector._build_destination_uri(cfg2, default_name="fallback")
    assert uri2 == "s3://my-bucket/analytics/2026/custom_report.csv"

    # With existing matching extension
    cfg3 = S3ConnectorConfig(
        bucket="my-bucket",
        prefix="exports",
        filename="data.json",
        export_format=ExportFormat.JSON,
    )
    uri3 = connector._build_destination_uri(cfg3, default_name="fallback")
    assert uri3 == "s3://my-bucket/exports/data.json"


def test_s3_test_connection_invalid_bucket():
    connector = S3Connector()
    res = connector.test_connection({"bucket": "!!invalid_bucket!!"})
    assert res.success is False
    assert "Invalid S3 bucket name" in res.message


def test_s3_test_connection_valid_format():
    connector = S3Connector()
    res = connector.test_connection({
        "bucket": "valid-analytics-bucket",
        "region": "us-west-2",
        "endpoint_url": "https://account.r2.cloudflarestorage.com",
    })
    assert res.success is True
    assert "valid-analytics-bucket" in res.message
    assert res.details["region"] == "us-west-2"


def test_s3_export_missing_file_raises(tmp_path: Path):
    connector = S3Connector()
    missing_file = tmp_path / "non_existent.parquet"
    with pytest.raises(FileNotFoundError):
        connector.export_dataset(
            missing_file,
            config={"bucket": "test-bucket"},
        )


def test_s3_export_success_mock(tmp_path: Path):
    connector = S3Connector()
    source_pq = tmp_path / "test.parquet"
    source_pq.write_bytes(b"dummy parquet content")

    mock_con = MagicMock()
    mock_con.execute.return_value.fetchone.return_value = [1500]

    with patch("duckdb.connect", return_value=mock_con):
        res = connector.export_dataset(
            source_parquet_path=source_pq,
            config={
                "bucket": "datamorph-bucket",
                "prefix": "processed",
                "filename": "orders.parquet",
                "export_format": "parquet",
            },
        )

        assert isinstance(res, SyncResult)
        assert res.success is True
        assert res.rows_transferred == 1500
        assert res.destination_uri == "s3://datamorph-bucket/processed/orders.parquet"
        mock_con.close.assert_called_once()


def test_s3_resolve_source_uri():
    connector = S3Connector()

    # Direct source URI
    cfg1 = S3ConnectorConfig(source_uri="s3://lakehouse-bucket/raw/events.parquet")
    assert connector._resolve_source_uri(cfg1) == "s3://lakehouse-bucket/raw/events.parquet"

    # Bucket + Key
    cfg2 = S3ConnectorConfig(bucket="my-bucket", key="folder/dataset.csv")
    assert connector._resolve_source_uri(cfg2) == "s3://my-bucket/folder/dataset.csv"

    # Bucket + Prefix + Filename
    cfg3 = S3ConnectorConfig(bucket="s3://my-bucket/", prefix="/raw/2026/", filename="data.json")
    assert connector._resolve_source_uri(cfg3) == "s3://my-bucket/raw/2026/data.json"

    # Missing bucket and source_uri raises
    cfg_empty = S3ConnectorConfig()
    with pytest.raises(ValueError, match="Either bucket or source_uri must be provided"):
        connector._resolve_source_uri(cfg_empty)


def test_s3_import_success_mock(tmp_path: Path):
    connector = S3Connector()
    target_pq = tmp_path / "imported.parquet"

    mock_con = MagicMock()
    mock_con.execute.return_value.fetchone.return_value = [3400]

    with patch("duckdb.connect", return_value=mock_con):
        res = connector.import_dataset(
            config={
                "source_uri": "s3://analytics-lake/raw/sales.parquet",
            },
            target_parquet_path=target_pq,
        )

        assert isinstance(res, SyncResult)
        assert res.success is True
        assert res.rows_transferred == 3400
        assert res.destination_uri == "s3://analytics-lake/raw/sales.parquet"
        assert "3,400" in res.message
        mock_con.close.assert_called_once()

