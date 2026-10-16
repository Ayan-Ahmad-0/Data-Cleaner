import type { JobDetailResponse } from '../lib/api';

interface ProgressPageProps {
  jobData: JobDetailResponse | null;
}

export const ProgressPage: React.FC<ProgressPageProps> = ({ jobData }) => {
  const job = jobData?.job;
  const currentStage = job?.current_stage || 'Processing dataset...';
  const progressPct = job?.progress_pct || 10;
  const status = job?.status || 'RUNNING';

  return (
    <div className="max-w-xl mx-auto py-16 px-6">
      <div className="bg-[var(--surface)] hairline-border rounded-xs p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Cleaning in Progress</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mono">
              Job ID: {job?.id} · {job?.filename}
            </p>
          </div>
          <span className="text-xs mono font-medium text-[var(--accent)] bg-blue-50 px-2 py-0.5 rounded-xs animate-pulse">
            {status}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-xs text-[var(--text)] font-medium">
            <span>{currentStage}</span>
            <span className="mono">{progressPct.toFixed(0)}%</span>
          </div>

          <div className="w-full bg-gray-100 h-2 rounded-xs overflow-hidden">
            <div
              className="bg-[var(--accent)] h-full transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            ></div>
          </div>
        </div>

        <div className="p-3 bg-gray-50/50 hairline-border rounded-xs text-xs text-[var(--text-muted)] space-y-1">
          <span className="font-medium text-[var(--text)] block">Execution Status:</span>
          <p>
            DuckDB is executing your recipe using single-pass vectorized execution. Intermediate spills to temporary disk storage are managed automatically.
          </p>
        </div>
      </div>
    </div>
  );
};
