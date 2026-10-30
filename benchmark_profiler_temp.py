import time
from pathlib import Path
import duckdb
from core.profiler import Profiler

dst = Path('data/benchmarks/events_1gb.parquet')
profiler = Profiler()

conn = profiler._get_connection()
pq_sql = str(dst.resolve()).replace('\\', '/')
view_name = 'raw_data'
conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{pq_sql}');")

t0 = time.time()
print('1. Counting rows...')
total_rows = conn.execute(f'SELECT COUNT(*) FROM {view_name}').fetchone()[0]
print(f'Rows: {total_rows} in {time.time()-t0:.2f}s')

t0 = time.time()
print('2. Duplicate detection...')
desc = conn.execute(f'DESCRIBE {view_name}').fetchall()
column_names = [col[0] for col in desc]
cols_quoted = ', '.join(f'"{col}"' for col in column_names)
exact_dup_rows = conn.execute(f'SELECT COUNT(*) - COUNT(DISTINCT hash({cols_quoted})) FROM {view_name}').fetchone()[0]
print(f'Exact dup rows: {exact_dup_rows} in {time.time()-t0:.2f}s')

for col in column_names:
    t0 = time.time()
    print(f'3. Profiling column: {col}...')
    res = profiler._profile_column(conn, view_name, col, total_rows)
    print(f'   Done {col} in {time.time()-t0:.2f}s (type: {res.inferred_type}, distinct: {res.distinct_count})')
conn.close()
