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

print("Testing exact dup rows calculation...")
t0 = time.perf_counter()
query = f"""
    SELECT COUNT(*) - COUNT(DISTINCT hash({cols_quoted}))
    FROM read_parquet('{str(pq_path).replace('\\', '/')}')
"""
res = conn.execute(query).fetchone()
print(f"Dup rows: {res[0]}, took: {time.perf_counter() - t0:.2f}s")
