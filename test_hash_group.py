import duckdb
import time
from pathlib import Path

pq_path = Path("data/benchmarks/events_1gb_test.parquet")
conn = duckdb.connect()
conn.execute("SET memory_limit = '500MB'")
conn.execute("SET threads = 1")
conn.execute("SET preserve_insertion_order = false")

desc = conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{str(pq_path).replace('\\', '/')}')").fetchall()
column_names = [col[0] for col in desc]
cols_quoted = ", ".join(f'"{col}"' for col in column_names)

print("Testing duplicate check with hash(cols)...")
t0 = time.perf_counter()
query = f"""
    SELECT 1 FROM (
        SELECT hash({cols_quoted}) as h
        FROM read_parquet('{str(pq_path).replace('\\', '/')}')
        GROUP BY h
        HAVING COUNT(*) > 1
        LIMIT 1
    )
"""
res = conn.execute(query).fetchone()
print(f"Has duplicates: {res}, took: {time.perf_counter() - t0:.2f}s")
