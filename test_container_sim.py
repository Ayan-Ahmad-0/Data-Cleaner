import time
from pathlib import Path
import duckdb
from core.profiler import Profiler
from formats import convert_to_parquet

src_csv = Path('data/benchmarks/events_1gb.csv')
dst_pq = Path('data/benchmarks/events_1gb.parquet')
if not dst_pq.exists():
    convert_to_parquet(src_csv, dst_pq)

# Simulate low-spec cloud container: 1 vCPU, 600MB RAM!
profiler = Profiler(memory_limit="600MB", threads=1)

print("Starting profile on 1 vCPU with 600MB RAM limit...", flush=True)
t0 = time.time()
def on_prog(pct, stage):
    print(f"[{time.time()-t0:.1f}s] {pct:.1f}% -> {stage}", flush=True)

profile = profiler.profile_parquet(dst_pq, progress_callback=on_prog)
t_total = time.time() - t0
print(f"Done in {t_total:.2f}s!", flush=True)
p = profile.to_dict()
for c, d in p["columns"].items():
    print(f"  {c}: type={d['inferred_type']}, distinct={d['distinct']}, key={d.get('candidate_key', False)}")
