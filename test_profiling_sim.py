import duckdb
import time
from pathlib import Path
from core.duckdb_utils import configure_duckdb_connection
from core.profiler import Profiler

csv_path = Path("data/benchmarks/events_1gb.csv")
print(f"Testing with {csv_path}, size: {csv_path.stat().st_size / (1024**3):.2f} GB")

conn = duckdb.connect()
# Limit memory to 500MB to simulate Oracle Cloud E2.1.Micro!
conn.execute("SET memory_limit = '500MB'")
conn.execute("SET threads = 1")
conn.execute("SET preserve_insertion_order = false")

t0 = time.perf_counter()
print("Starting profiler under 500MB memory limit & 1 thread...")

# We can profile directly or test parquet conversion
from formats.registry import convert_to_parquet

pq_path = Path("data/benchmarks/events_1gb_test.parquet")
if not pq_path.exists():
    print("Converting CSV to Parquet with 500MB limit...")
    t_conv0 = time.perf_counter()
    conv = convert_to_parquet(csv_path, pq_path)
    print(f"Converted in {time.perf_counter() - t_conv0:.2f}s, rows={conv.rows}")

t_prof0 = time.perf_counter()
profiler = Profiler(memory_limit="500MB", threads=1)
prof = profiler.profile_parquet(pq_path, source_csv_path=csv_path)
print(f"Profiled in {time.perf_counter() - t_prof0:.2f}s!")
print(f"Total rows: {prof.file_info['rows']}, cols: {prof.file_info['columns']}")
for col, p in prof.columns.items():
    print(f"Col {col}: type={p.inferred_type}, nulls={p.nulls}, distinct={p.distinct_count}")
