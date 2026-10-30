import time
import shutil
from pathlib import Path
from app.orchestrator import JobOrchestrator
from app.storage import JobStorage

storage = JobStorage()
orchestrator = JobOrchestrator(storage=storage)

src_csv = Path('data/benchmarks/events_1gb.csv')
print(f"Creating job for {src_csv}...", flush=True)

job = orchestrator.create_job(
    filename=src_csv.name,
    file_size=src_csv.stat().st_size,
    user_id="test_large_file_user"
)

raw_dest = storage.raw_file_path(job.id, job.filename, user_id="test_large_file_user")
print(f"Copying file to {raw_dest}...", flush=True)
shutil.copyfile(src_csv, raw_dest)

print("Starting run_profile_and_ai_draft...", flush=True)
t0 = time.time()

# Background monitoring thread to print progress updates like the frontend would see
import threading
stop_monitor = False
def monitor():
    last_stage = None
    last_pct = None
    while not stop_monitor:
        if job.current_stage != last_stage or job.progress_pct != last_pct:
            print(f"[{time.time()-t0:.1f}s] Progress: {job.progress_pct}% | Stage: {job.current_stage} | Status: {job.status}", flush=True)
            last_stage = job.current_stage
            last_pct = job.progress_pct
        time.sleep(0.3)

th = threading.Thread(target=monitor, daemon=True)
th.start()

orchestrator.run_profile_and_ai_draft(job.id)
stop_monitor = True
t_elapsed = time.time() - t0

print(f"\nCOMPLETED IN {t_elapsed:.2f}s!", flush=True)
print(f"Final Status: {job.status}", flush=True)
print(f"Final Stage: {job.current_stage}", flush=True)
print(f"Row count: {job.row_count}", flush=True)
profile = orchestrator.job_profiles.get(job.id)
if profile:
    print(f"Columns profiled: {list(profile['columns'].keys())}", flush=True)
    for col, meta in profile['columns'].items():
        print(f"  - {col}: type={meta['inferred_type']}, distinct={meta['distinct']}, nulls={meta['nulls']}", flush=True)
