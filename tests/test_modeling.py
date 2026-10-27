"""Unit and integration tests for multi-table modeling, relationship detection, and ERD export."""

import sqlite3
import tempfile
from pathlib import Path
import pytest
import duckdb

from core.modeling.models import ColumnMetadata, Relationship, TableMetadata
from core.modeling.detector import RelationshipDetector
from core.modeling.service import ModelingService


@pytest.fixture
def temp_modeling_service():
    """Create a temporary modeling service instance isolated in a temp directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        service = ModelingService(base_dir=Path(tmpdir))
        yield service


@pytest.fixture
def sample_csv_tables(tmp_path):
    """Create two related CSV files: customers and orders."""
    customers_csv = tmp_path / "customers.csv"
    customers_csv.write_text(
        "id,name,email,city\n"
        "1,Alice,alice@example.com,New York\n"
        "2,Bob,bob@example.com,London\n"
        "3,Charlie,charlie@example.com,Paris\n",
        encoding="utf-8",
    )

    orders_csv = tmp_path / "orders.csv"
    orders_csv.write_text(
        "id,customer_id,total_amount,order_date\n"
        "101,1,149.99,2026-01-15\n"
        "102,1,49.50,2026-01-16\n"
        "103,2,299.00,2026-01-17\n"
        "104,3,19.99,2026-01-18\n",
        encoding="utf-8",
    )

    return customers_csv, orders_csv


def test_modeling_session_lifecycle(temp_modeling_service, sample_csv_tables):
    """Test full session creation, multi-table staging, and PK/FK auto-discovery."""
    customers_csv, orders_csv = sample_csv_tables
    service = temp_modeling_service

    # 1. Create session
    session_id = service.create_session()
    assert session_id.startswith("model_")

    # 2. Add customers table
    c_meta = service.add_table(
        session_id=session_id,
        file_path=customers_csv,
        original_filename="customers.csv",
        table_name="customers",
    )
    assert c_meta.table_name == "customers"
    assert c_meta.row_count == 3
    col_names = [c.name for c in c_meta.columns]
    assert "id" in col_names
    assert "name" in col_names

    # Verify 'id' was detected as primary key
    id_col = next(c for c in c_meta.columns if c.name == "id")
    assert id_col.is_pk is True

    # 3. Add orders table
    o_meta = service.add_table(
        session_id=session_id,
        file_path=orders_csv,
        original_filename="orders.csv",
        table_name="orders",
    )
    assert o_meta.table_name == "orders"
    assert o_meta.row_count == 4

    # 4. Check auto-detected relationship between orders.customer_id and customers.id
    state = service.get_session_state(session_id)
    assert len(state.tables) == 2
    assert len(state.relationships) >= 1

    rel = state.relationships[0]
    assert rel.from_table == "orders"
    assert rel.from_column == "customer_id"
    assert rel.to_table == "customers"
    assert rel.to_column == "id"
    assert rel.cardinality in ("1:N", "1:n")
    assert rel.match_ratio == 1.0
    assert rel.orphan_count == 0


def test_join_preview(temp_modeling_service, sample_csv_tables):
    """Test join preview execution with match stats and sample records."""
    customers_csv, orders_csv = sample_csv_tables
    service = temp_modeling_service

    session_id = service.create_session()
    service.add_table(session_id, customers_csv, "customers.csv", "customers")
    service.add_table(session_id, orders_csv, "orders.csv", "orders")

    preview = service.preview_join(
        session_id=session_id,
        from_table="orders",
        from_column="customer_id",
        to_table="customers",
        to_column="id",
        join_type="INNER",
    )

    assert preview.from_table == "orders"
    assert preview.to_table == "customers"
    assert preview.matched_rows == 4
    assert preview.match_ratio == 1.0
    assert preview.orphan_count == 0
    assert len(preview.sample_rows) == 4
    first_row = preview.sample_rows[0]
    assert "name" in first_row
    assert "total_amount" in first_row


def test_schema_exports(temp_modeling_service, sample_csv_tables):
    """Test Mermaid, DBML, and SQL DDL schema export formatting."""
    customers_csv, orders_csv = sample_csv_tables
    service = temp_modeling_service

    session_id = service.create_session()
    service.add_table(session_id, customers_csv, "customers.csv", "customers")
    service.add_table(session_id, orders_csv, "orders.csv", "orders")

    # Mermaid
    mermaid_str = service.export_schema(session_id, export_format="mermaid")
    assert "erDiagram" in mermaid_str
    assert '"CUSTOMERS"' in mermaid_str
    assert '"ORDERS"' in mermaid_str

    # DBML
    dbml_str = service.export_schema(session_id, export_format="dbml")
    assert "Table customers {" in dbml_str
    assert "Table orders {" in dbml_str
    assert "Ref: orders.customer_id > customers.id" in dbml_str

    # SQL DDL
    ddl_str = service.export_schema(session_id, export_format="sql_ddl")
    assert 'CREATE TABLE "customers"' in ddl_str
    assert 'CREATE TABLE "orders"' in ddl_str
    assert "FOREIGN KEY" in ddl_str


def test_table_removal_and_relationship_cleanup(temp_modeling_service, sample_csv_tables):
    """Test that removing a table properly cascades and removes linked relationships."""
    customers_csv, orders_csv = sample_csv_tables
    service = temp_modeling_service

    session_id = service.create_session()
    service.add_table(session_id, customers_csv, "customers.csv", "customers")
    service.add_table(session_id, orders_csv, "orders.csv", "orders")

    state = service.get_session_state(session_id)
    assert len(state.relationships) > 0

    # Remove customers table
    service.remove_table(session_id, "customers")
    state_after = service.get_session_state(session_id)
    assert "customers" not in state_after.tables
    assert len(state_after.relationships) == 0


def test_sqlite_database_extraction(temp_modeling_service, tmp_path):
    """Test staging a multi-table SQLite database with foreign keys."""
    db_file = tmp_path / "test_store.db"
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY,
            category_name TEXT NOT NULL
        );
    """)
    cursor.execute("""
        CREATE TABLE products (
            product_id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            category_id INTEGER,
            price REAL,
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );
    """)

    cursor.execute("INSERT INTO categories VALUES (1, 'Electronics'), (2, 'Books');")
    cursor.execute("INSERT INTO products VALUES (10, 'Smartphone', 1, 699.99), (20, 'Novel', 2, 14.99);")
    conn.commit()
    conn.close()

    service = temp_modeling_service
    session_id = service.create_session()

    tables = service.add_sqlite_database(session_id, db_file)
    assert len(tables) == 2

    state = service.get_session_state(session_id)
    assert "categories" in state.tables
    assert "products" in state.tables

    # Check extracted SQLite foreign key
    fk_rel = next((r for r in state.relationships if r.from_table == "products" and r.to_table == "categories"), None)
    assert fk_rel is not None
    assert fk_rel.from_column == "category_id"
    assert fk_rel.to_column == "id"
    assert fk_rel.status == "confirmed"


def test_modeling_api_endpoints(sample_csv_tables):
    """Test REST API endpoints for modeling session creation, file uploads, and schema export."""
    from fastapi.testclient import TestClient
    from app.main import app

    customers_csv, orders_csv = sample_csv_tables
    client = TestClient(app)

    # 1. Create session
    resp = client.post("/api/modeling/sessions")
    assert resp.status_code == 200
    data = resp.json()
    session_id = data["session_id"]
    assert session_id.startswith("model_")

    # 2. Upload customers table
    with open(customers_csv, "rb") as f:
        resp = client.post(
            f"/api/modeling/sessions/{session_id}/tables",
            files={"file": ("customers.csv", f, "text/csv")},
        )
    assert resp.status_code == 200
    state = resp.json()
    assert "customers" in state["tables"]

    # 3. Upload orders table
    with open(orders_csv, "rb") as f:
        resp = client.post(
            f"/api/modeling/sessions/{session_id}/tables",
            files={"file": ("orders.csv", f, "text/csv")},
        )
    assert resp.status_code == 200
    state = resp.json()
    assert "orders" in state["tables"]
    assert len(state["relationships"]) >= 1

    # 4. Preview Join
    resp = client.post(
        f"/api/modeling/sessions/{session_id}/preview-join",
        json={
            "from_table": "orders",
            "from_column": "customer_id",
            "to_table": "customers",
            "to_column": "id",
            "join_type": "INNER",
        },
    )
    assert resp.status_code == 200
    join_res = resp.json()
    assert join_res["matched_rows"] == 4
    assert len(join_res["sample_rows"]) == 4

    # 5. Export schema
    resp = client.get(f"/api/modeling/sessions/{session_id}/export?format=mermaid")
    assert resp.status_code == 200
    exp = resp.json()
    assert exp["format"] == "mermaid"
    assert "erDiagram" in exp["content"]

    # 6. Handoff query (materializes merged.parquet for SQL exploration & AI Analyst)
    resp = client.post(f"/api/modeling/sessions/{session_id}/handoff-query")
    assert resp.status_code == 200
    handoff = resp.json()
    assert "SELECT" in handoff["sql"]
    assert handoff["query_id"] == session_id
    assert handoff["row_count"] == 4

    # 6b. Verify SQL and AI exploration endpoints resolve the merged modeling dataset
    resp = client.get(f"/api/explore/{session_id}/schema")
    assert resp.status_code == 200
    schema_info = resp.json()
    assert schema_info["row_count"] == 4
    col_names = [c["name"] for c in schema_info["columns"]]
    assert "name" in col_names
    assert "total_amount" in col_names

    resp = client.post(
        f"/api/explore/{session_id}/query",
        json={"sql": "SELECT name, total_amount FROM data ORDER BY total_amount DESC LIMIT 5;"},
    )
    assert resp.status_code == 200
    q_data = resp.json()
    assert q_data["row_count_returned"] == 4
    assert len(q_data["rows"]) == 4

    # 7. Export merged CSV
    resp = client.get(f"/api/modeling/sessions/{session_id}/export-csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "name" in resp.text
    assert "total_amount" in resp.text

    # 8. Delete table
    resp = client.delete(f"/api/modeling/sessions/{session_id}/tables/customers")
    assert resp.status_code == 200
    state_after = resp.json()
    assert "customers" not in state_after["tables"]


