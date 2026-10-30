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
    user_id="benchmark_user"
)

raw_dest = storage.raw_file_path(job.id, job.filename, user_id="benchmark_user")
print(f"Copying to {raw_dest}...", flush=True)
shutil.copyfile(src_csv, raw_dest)

print("Starting run_profile_and_ai_draft...", flush=True)
t0 = time.time()
orchestrator.run_profile_and_ai_draft(job.id)
t_elapsed = time.time() - t0

print(f"Completed in {t_elapsed:.2f}s! Status: {job.status}, Stage: {job.current_stage}, Error: {job.error}", flush=True)
