"""Generate test fixtures for all format adapter tests."""

import gzip
import json
import sqlite3
from pathlib import Path
import duckdb

FIXTURES_DIR = Path(__file__).parent / "fixtures"
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)


def create_fixtures():
    # 1. Standard CSV
    (FIXTURES_DIR / "sample.csv").write_text(
        "id,name,amount,city\n1,Alice,100.50,New York\n2,Bob,250.00,London\n3,Charlie,75.25,Paris\n",
        encoding="utf-8"
    )

    # 2. Semicolon delimited CSV
    (FIXTURES_DIR / "semicolon.csv").write_text(
        "id;name;amount;city\n10;François;300,50;Montréal\n20;Jürgen;400,00;Berlin\n",
        encoding="utf-8"
    )

    # 3. TSV
    (FIXTURES_DIR / "sample.tsv").write_text(
        "id\tname\tscore\n1\tAlpha\t98\n2\tBeta\t87\n3\tGamma\t94\n",
        encoding="utf-8"
    )

    # 4. BOM + Latin-1 characters CSV
    bom_content = "\ufeffid,name,city\n1,Renée,München\n2,José,São Paulo\n"
    (FIXTURES_DIR / "bom_latin1.csv").write_text(bom_content, encoding="utf-8")

    # 5. Empty CSV & Header-only CSV
    (FIXTURES_DIR / "empty.csv").write_text("", encoding="utf-8")
    (FIXTURES_DIR / "header_only.csv").write_text("id,name,score\n", encoding="utf-8")

    # 6. Gzipped CSV
    with gzip.open(FIXTURES_DIR / "sample.csv.gz", "wt", encoding="utf-8") as gz:
        gz.write("id,name\n1,GzOne\n2,GzTwo\n")

    # 7. NDJSON
    ndjson_content = (
        '{"id": 1, "name": "Alice", "tags": ["admin", "staff"]}\n'
        '{"id": 2, "name": "Bob", "missing_field": 42}\n'
        '{"id": 3, "name": "Charlie", "tags": ["user"]}\n'
    )
    (FIXTURES_DIR / "sample.ndjson").write_text(ndjson_content, encoding="utf-8")

    # 8. Nested JSON array
    nested_json = [
        {
            "id": 101,
            "user": {
                "name": "David",
                "address": {
                    "city": "Boston",
                    "zip": "02101"
                }
            },
            "status": "active"
        },
        {
            "id": 102,
            "user": {
                "name": "Eve",
                "address": {
                    "city": "Austin",
                    "zip": "73301"
                }
            },
            "status": "pending"
        }
    ]
    (FIXTURES_DIR / "nested.json").write_text(json.dumps(nested_json, indent=2), encoding="utf-8")

    # 9. Arrays JSON
    arrays_json = [
        {"id": 1, "items": [10, 20, 30]},
        {"id": 2, "items": [40, 50]}
    ]
    (FIXTURES_DIR / "arrays.json").write_text(json.dumps(arrays_json), encoding="utf-8")

    # 10. Wrong extension files
    # CSV content with .txt
    (FIXTURES_DIR / "wrong_ext_csv_as_txt.txt").write_text("id,val,category\n1,100,A\n2,200,B\n", encoding="utf-8")
    # JSON content with .csv
    (FIXTURES_DIR / "wrong_ext_json_as_csv.csv").write_text(json.dumps([{"id": 1, "val": "json_inside_csv"}]), encoding="utf-8")

    # 11. Parquet fixture
    conn = duckdb.connect(":memory:")
    pq_path = str(FIXTURES_DIR / "sample.parquet").replace("\\", "/")
    conn.execute(f"""
        COPY (
            SELECT 1 AS id, 'Widget' AS product, 19.99 AS price
            UNION ALL
            SELECT 2 AS id, 'Gadget' AS product, 29.99 AS price
        ) TO '{pq_path}' (FORMAT PARQUET);
    """)

    # 12. Excel multi-sheet (.xlsx) fixture
    xlsx_path = str(FIXTURES_DIR / "sample.xlsx").replace("\\", "/")
    try:
        conn.execute("LOAD excel;")
        conn.execute(f"""
            COPY (
                SELECT 1 AS customer_id, 'Acme Corp' AS name
                UNION ALL
                SELECT 2 AS customer_id, 'Global Inc' AS name
            ) TO '{xlsx_path}' (FORMAT XLSX);
        """)
    except Exception as e:
        print("Excel fixture warning:", e)

    # 13. SQLite database fixture with multiple tables
    db_path = FIXTURES_DIR / "sample.db"
    if db_path.exists():
        db_path.unlink()
    sq_conn = sqlite3.connect(db_path)
    sq_cur = sq_conn.cursor()
    sq_cur.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT);")
    sq_cur.execute("INSERT INTO users VALUES (1, 'admin_user', 'admin'), (2, 'guest_user', 'guest');")
    sq_cur.execute("CREATE TABLE products (sku TEXT PRIMARY KEY, title TEXT, stock INT);")
    sq_cur.execute("INSERT INTO products VALUES ('SKU-1', 'Notebook', 50), ('SKU-2', 'Pen', 120);")
    sq_conn.commit()
    sq_conn.close()

    conn.close()
    print("All fixtures generated successfully in:", FIXTURES_DIR)


if __name__ == "__main__":
    create_fixtures()
