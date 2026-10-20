"""Tests for SQL query validation layer and attack string detection."""

import pytest
from explore.errors import QueryNotAllowedError, QuerySyntaxError
from explore.limits import QueryLimits
from explore.validate import validate_sql


REJECTED_ATTACK_QUERIES = [
    # Mutations and DDL
    ("DROP TABLE data", "DROP"),
    ("INSERT INTO data VALUES (1)", "INSERT"),
    ("DELETE FROM data WHERE id = 1", "DELETE"),
    ("UPDATE data SET id = 2", "UPDATE"),
    ("CREATE TABLE hack AS SELECT 1", "CREATE"),
    ("ALTER TABLE data ADD COLUMN x INT", "ALTER"),
    ("COPY data TO 'out.csv'", "COPY"),
    ("ATTACH 'database.db'", "ATTACH"),
    ("DETACH database", "DETACH"),
    ("INSTALL httpfs", "LOAD"),
    ("LOAD httpfs", "LOAD"),
    ("PRAGMA version", "PRAGMA"),
    ("SET memory_limit='100GB'", "SET"),
    ("CALL custom_proc()", "CALL"),
    ("EXPORT DATABASE 'out'", "EXPORT"),
    ("IMPORT DATABASE 'in'", "IMPORT"),
    ("CHECKPOINT", "CHECKPOINT"),
    ("VACUUM", "VACUUM"),
    # Multiple statements
    ("SELECT 1; SELECT 2", "Multiple SQL statements"),
    ("SELECT 1; -- comment\n DROP TABLE data", "Multiple SQL statements"),
    # File reading & Table Functions
    ("SELECT * FROM read_csv('/etc/passwd')", "forbidden"),
    ("SELECT * FROM read_csv_auto('file.csv')", "forbidden"),
    ("SELECT * FROM read_parquet('/var/data.parquet')", "forbidden"),
    ("SELECT * FROM read_json('secret.json')", "forbidden"),
    ("SELECT * FROM read_json_auto('secret.json')", "forbidden"),
    ("SELECT * FROM read_text('notes.txt')", "forbidden"),
    ("SELECT * FROM read_blob('key.bin')", "forbidden"),
    ("SELECT * FROM glob('/*')", "forbidden"),
    ("SELECT * FROM parquet_scan('a.parquet')", "forbidden"),
    ("SELECT * FROM parquet_metadata('a.parquet')", "forbidden"),
    ("SELECT * FROM sniff_csv('a.csv')", "forbidden"),
    ("SELECT * FROM read_xlsx('report.xlsx')", "forbidden"),
    ("SELECT * FROM sqlite_scan('db.sqlite', 'table')", "forbidden"),
    ("SELECT * FROM '/etc/passwd'", "not permitted"),
    ("SELECT * FROM 'data.csv'", "not permitted"),
    # Case variants & CTE embedding
    ("SELECT * FROM rEaD_cSv('/etc/passwd')", "forbidden"),
    ("WITH cte AS (SELECT * FROM read_csv('/etc/passwd')) SELECT * FROM cte", "forbidden"),
    ("SELECT * FROM (SELECT * FROM glob('/*')) sub", "forbidden"),
    # System settings & reflection
    ("SELECT * FROM duckdb_settings()", "forbidden"),
    ("SELECT * FROM duckdb_extensions()", "forbidden"),
    ("SELECT current_setting('memory_limit')", "forbidden"),
    # Unknown tables (not in allow-list)
    ("SELECT * FROM secrets", "not accessible"),
    ("SELECT * FROM information_schema.tables", "not accessible"),
    ("SELECT * FROM users", "not accessible"),
]


@pytest.mark.parametrize("query,expected_err", REJECTED_ATTACK_QUERIES)
def test_rejected_queries(query: str, expected_err: str):
    """Ensure hostile and unauthorized queries are rejected by validation layer."""
    with pytest.raises((QueryNotAllowedError, QuerySyntaxError)) as exc_info:
        validate_sql(query)
    assert str(exc_info.value).strip() != ""


def test_reject_empty_query():
    """Ensure empty or whitespace-only queries are rejected."""
    with pytest.raises(QueryNotAllowedError) as exc_info:
        validate_sql("   ")
    assert "cannot be empty" in str(exc_info.value).lower()


def test_reject_query_exceeding_max_length():
    """Ensure queries exceeding maximum configured length are rejected."""
    limits = QueryLimits(max_sql_length=100)
    huge_sql = "SELECT * FROM data WHERE " + "id = 1 AND " * 20
    with pytest.raises(QueryNotAllowedError) as exc_info:
        validate_sql(huge_sql, limits=limits)
    assert "exceeds maximum allowed length" in str(exc_info.value)


ACCEPTED_VALID_QUERIES = [
    "SELECT * FROM data",
    "SELECT id, name, price FROM data WHERE price > 50.0",
    "SELECT category, count(*), avg(price) FROM data GROUP BY category ORDER BY count(*) DESC",
    "SELECT a.id, b.name FROM data a JOIN data b ON a.id = b.id",
    "SELECT id, row_number() OVER (PARTITION BY category ORDER BY price DESC) as rk FROM data",
    "WITH filtered AS (SELECT * FROM data WHERE active = true) SELECT count(*) FROM filtered",
    "SELECT * FROM (SELECT id, category FROM data) sub WHERE id > 10",
    "SELECT id, name FROM data WHERE id = 1 UNION ALL SELECT id, name FROM data WHERE id = 2",
    "SELECT * FROM data LIMIT 10 OFFSET 20",
    "SELECT count(DISTINCT category), coalesce(max(price), 0) FROM data",
]


@pytest.mark.parametrize("query", ACCEPTED_VALID_QUERIES)
def test_accepted_queries(query: str):
    """Ensure standard SQL analytical queries on allowed table 'data' are approved."""
    validated = validate_sql(query)
    assert validated.sql == query.strip()
    assert "data" in validated.referenced_tables


def test_cte_aliases_allowed():
    """Ensure CTE aliases declared inside the query are properly recognized as valid."""
    sql = "WITH summary AS (SELECT category, sum(price) as total FROM data GROUP BY category) SELECT * FROM summary"
    validated = validate_sql(sql)
    assert "data" in validated.referenced_tables


def test_trailing_semicolon_stripped():
    """Ensure trailing semicolons and whitespace are safely stripped."""
    sql = "SELECT * FROM data LIMIT 100;\n\n"
    validated = validate_sql(sql)
    assert validated.sql == "SELECT * FROM data LIMIT 100"

