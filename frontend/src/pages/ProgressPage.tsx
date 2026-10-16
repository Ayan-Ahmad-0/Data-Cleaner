import React, { useEffect, useState } from 'react';
import type { JobDetailResponse } from '../lib/api';
import { Tag } from '../components/ui/Tag';
import { Check, Loader2, Clock } from 'lucide-react';

interface ProgressPageProps {
  jobData: JobDetailResponse | null;
  onCancel?: () => void;
}

interface PipelineStage {
  id: string;
  name: string;
  description: string;
}

const STAGES: PipelineStage[] = [
  { id: 'convert', name: 'File Staging', description: 'Converting raw CSV to text Parquet buffers' },
  { id: 'profile', name: 'Statistical Profiler', description: 'Single-pass scan for nulls, keys, and format drift' },
  { id: 'clean', name: 'Vectorized Cleaning', description: 'Executing compiled DuckDB CTE transformation chain' },
  { id: 'verify', name: 'Verification & Reconciliation', description: 'Validating output against recipe assertions' },
];

export const ProgressPage: React.FC<ProgressPageProps> = ({ jobData, onCancel }) => {
  const job = jobData?.job;
  const status = job?.status || 'RUNNING';
  const currentStageName = job?.current_stage || 'Processing dataset...';
  const progressPct = job?.progress_pct || 0;

  // Track elapsed seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Determine stage status
  const getStageStatus = (stageId: string): 'done' | 'active' | 'pending' => {
    if (status === 'DONE' || status === 'DONE_WITH_WARNINGS') return 'done';

    if (stageId === 'convert') {
      if (['PROFILING', 'DRAFTING_RECIPE', 'AWAITING_APPROVAL', 'CLEANING', 'VERIFYING'].includes(status)) {
        return 'done';
      }
      return 'active';
    }

    if (stageId === 'profile') {
      if (['DRAFTING_RECIPE', 'AWAITING_APPROVAL', 'CLEANING', 'VERIFYING'].includes(status)) {
        return 'done';
      }
      if (status === 'PROFILING') return 'active';
      return 'pending';
    }

    if (stageId === 'clean') {
      if (status === 'VERIFYING') return 'done';
      if (status === 'CLEANING') return 'active';
      return 'pending';
    }

    if (stageId === 'verify') {
      if (status === 'VERIFYING') return 'active';
      return 'pending';
    }

    return 'pending';
  };

  return (
    <div className="container-shell py-12 max-w-2xl mx-auto space-y-6">
      {/* Header card with aria-live */}
      <div
        aria-live="polite"
        className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-sm)] p-6 space-y-6"
      >
        <div className="flex items-center justify-between pb-4 hairline-b">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-[var(--text-primary)]">
                Processing Dataset
              </h1>
              <Tag variant="accent" font="mono">
                {status}
              </Tag>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">
              {job?.filename || 'Dataset'} · {job?.id}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
            <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Current status bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-medium text-[var(--text-primary)]">{currentStageName}</span>
            <span className="font-mono text-[var(--text-muted)]">{progressPct.toFixed(0)}%</span>
          </div>

          <div className="w-full bg-[var(--bg-subtle)] h-2 rounded-[var(--radius-xs)] overflow-hidden hairline-border">
            <div
              className="bg-[var(--accent)] h-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(progressPct, 8)}%` }}
            />
          </div>
        </div>

        {/* Stage List */}
        <div className="space-y-3 pt-2">
          {STAGES.map((stg) => {
            const stgStatus = getStageStatus(stg.id);

            return (
              <div
                key={stg.id}
                className={`flex items-start gap-3 p-3 rounded-[var(--radius-xs)] border hairline-border transition-colors ${
                  stgStatus === 'active'
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)]'
                    : stgStatus === 'done'
                    ? 'bg-[var(--bg-surface)]'
                    : 'bg-[var(--bg-subtle)] opacity-60'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {stgStatus === 'done' ? (
                    <span className="w-4 h-4 rounded-full bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  ) : stgStatus === 'active' ? (
                    <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-[var(--border-hairline)] block" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-[var(--text-primary)] block">
                    {stg.name}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] block">
                    {stg.description}
                  </span>
                </div>

                <Tag
                  variant={stgStatus === 'done' ? 'ok' : stgStatus === 'active' ? 'accent' : 'neutral'}
                  font="mono"
                >
                  {stgStatus.toUpperCase()}
                </Tag>
              </div>
            );
          })}
        </div>

        {/* Reassurance note & Cancel option */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <span>Execution occurs in-process with memory spillover protection.</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-colors underline cursor-pointer"
            >
              Cancel Operation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
