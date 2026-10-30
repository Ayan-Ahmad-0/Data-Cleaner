import time
from pathlib import Path
from core.profiler import Profiler

dst = Path('data/benchmarks/events_1gb.parquet')
profiler = Profiler()

t0 = time.time()
print("Starting full profile_parquet...", flush=True)
profile = profiler.profile_parquet(dst)
print(f"Finished profile_parquet in {time.time() - t0:.2f}s", flush=True)
p_dict = profile.to_dict()
print(f"Columns: {list(p_dict['columns'].keys())}", flush=True)
for col, info in p_dict['columns'].items():
    print(f"  {col}: type={info['inferred_type']}, nulls={info['nulls']}, distinct={info['distinct']}", flush=True)
