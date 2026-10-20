"""Security tests verifying DuckDB engine-level sandbox lockdown on real DuckDB connections."""

from pathlib import Path
import pytest
import duckdb

from explore.limits import QueryLimits
from explore.sandbox import create_sandboxed_connection


@pytest.fixture
def sample_parquet(tmp_path: Path) -> Path:
    """Create a temporary test Parquet file for sandboxing tests."""
    pq_path = tmp_path / "test_data.parquet"
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE t (id INT, label VARCHAR, score DOUBLE)")
    con.execute("INSERT INTO t VALUES (1, 'Alice', 95.5), (2, 'Bob', 88.0), (3, 'Charlie', 72.3)")
    con.execute(f"COPY t TO '{pq_path.as_posix()}' (FORMAT PARQUET)")
    con.close()
    return pq_path


@pytest.fixture
def foreign_parquet(tmp_path: Path) -> Path:
    """Create another user's Parquet file that must never be readable."""
    foreign_path = tmp_path / "foreign_user_secret.parquet"
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE secret (id INT, secret_token VARCHAR)")
    con.execute("INSERT INTO secret VALUES (1, 'SUPER_SECRET_123')")
    con.execute(f"COPY secret TO '{foreign_path.as_posix()}' (FORMAT PARQUET)")
    con.close()
    return foreign_path


def test_sandbox_allows_data_view_query(sample_parquet: Path):
    """Verify the view 'data' is queryable after all security lockdowns are in place."""
    limits = QueryLimits(memory_limit_per_query="512MB", threads_per_query=2)
    con = create_sandboxed_connection(sample_parquet, limits=limits)
    try:
        rows = con.execute("SELECT id, label, score FROM data ORDER BY id").fetchall()
        assert len(rows) == 3
        assert rows[0] == (1, "Alice", 95.5)
        assert rows[1] == (2, "Bob", 88.0)
    finally:
        con.close()


def test_sandbox_blocks_arbitrary_file_read(sample_parquet: Path, foreign_parquet: Path):
    """Verify that even if validation is bypassed, DuckDB engine blocks reading arbitrary files."""
    limits = QueryLimits()
    con = create_sandboxed_connection(sample_parquet, limits=limits)
    try:
        with pytest.raises(Exception) as exc_info:
            con.execute(f"SELECT * FROM read_parquet('{foreign_parquet.as_posix()}')")
        err_msg = str(exc_info.value).lower()
        assert any(term in err_msg for term in ["permission error", "disabled", "cannot access file", "not allowed"])
    finally:
        con.close()


def test_sandbox_blocks_file_write(sample_parquet: Path, tmp_path: Path):
    """Verify that file writes (COPY TO) are blocked on interactive query connections."""
    limits = QueryLimits()
    con = create_sandboxed_connection(sample_parquet, limits=limits)
    unauthorized_out = tmp_path / "hack_output.csv"
    try:
        with pytest.raises(Exception) as exc_info:
            con.execute(f"COPY data TO '{unauthorized_out.as_posix()}' (HEADER, DELIMITER ',')")
        err_msg = str(exc_info.value).lower()
        assert any(term in err_msg for term in ["permission error", "disabled", "cannot access file", "not allowed"])
    finally:
        con.close()


def test_sandbox_blocks_config_tampering(sample_parquet: Path):
    """Verify that lock_configuration prevents changing settings or unlocking external access."""
    limits = QueryLimits()
    con = create_sandboxed_connection(sample_parquet, limits=limits)
    try:
        with pytest.raises(Exception) as exc_info:
            con.execute("SET memory_limit = '100GB'")
        assert "locked" in str(exc_info.value).lower()

        with pytest.raises(Exception) as exc_info2:
            con.execute("SET enable_external_access = true")
        assert "locked" in str(exc_info2.value).lower()
    finally:
        con.close()


def test_sandbox_blocks_database_attach(sample_parquet: Path, tmp_path: Path):
    """Verify attaching an external database is strictly blocked."""
    limits = QueryLimits()
    con = create_sandboxed_connection(sample_parquet, limits=limits)
    db_file = tmp_path / "external.db"
    try:
        with pytest.raises(Exception) as exc_info:
            con.execute(f"ATTACH '{db_file.as_posix()}' AS ext")
        err_msg = str(exc_info.value).lower()
        assert any(term in err_msg for term in ["permission error", "disabled", "cannot access file", "not allowed"])
    finally:
        con.close()


def test_sandbox_export_connection_allows_only_designated_path(sample_parquet: Path, tmp_path: Path):
    """Verify export connection allows writing ONLY to the single designated output path."""
    limits = QueryLimits()
    authorized_csv = tmp_path / "authorized_export.csv"
    unauthorized_csv = tmp_path / "forbidden_export.csv"

    con = create_sandboxed_connection(
        sample_parquet,
        limits=limits,
        allow_write_path=authorized_csv,
    )
    try:
        # Designated path succeeds
        con.execute(f"COPY (SELECT * FROM data) TO '{authorized_csv.as_posix()}' (HEADER, DELIMITER ',')")
        assert authorized_csv.exists()
        assert authorized_csv.stat().st_size > 0

        # Unapproved path is blocked
        with pytest.raises(Exception) as exc_info:
            con.execute(f"COPY (SELECT * FROM data) TO '{unauthorized_csv.as_posix()}' (HEADER, DELIMITER ',')")
        err_msg = str(exc_info.value).lower()
        assert any(term in err_msg for term in ["permission error", "disabled", "cannot access file", "not allowed"])
    finally:
        con.close()
