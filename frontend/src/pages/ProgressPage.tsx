import React, { useEffect, useState } from 'react';
import type { JobDetailResponse } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { Check, Loader2, Clock } from 'lucide-react';

interface ProgressPageProps {
  jobData: JobDetailResponse | null;
  onProceedToResults?: () => void;
  onCancel?: () => void;
  onGoToUpload?: () => void;
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

export const ProgressPage: React.FC<ProgressPageProps> = ({ jobData, onProceedToResults, onCancel, onGoToUpload }) => {
  const job = jobData?.job;
  const status = job?.status || 'RUNNING';
  const currentStageName = job?.current_stage || 'Processing dataset...';
  const progressPct = job?.progress_pct || 0;

  // Track elapsed seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!jobData) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [jobData]);

  if (!jobData) {
    return (
      <div className="container-shell py-16 sm:py-24 max-w-2xl mx-auto text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto hairline-border">
          <Clock className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
            No Active Cleaning Task
          </h2>
          <p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-lg mx-auto">
            Review and approve your dataset's cleaning recipe in Step 3 to execute the transformation pipeline
            and monitor stage progress here.
          </p>
        </div>
        {onGoToUpload && (
          <Button size="lg" variant="primary" onClick={onGoToUpload}>
            Go to Upload (Step 1)
          </Button>
        )}
      </div>
    );
  }

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
    <div className="container-shell py-12 sm:py-16 max-w-3xl mx-auto space-y-8">
      {/* Header card with aria-live */}
      <div
        aria-live="polite"
        className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-6 sm:p-8 space-y-7"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 hairline-b">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
                Processing Dataset
              </h1>
              <Tag variant="accent" font="mono">
                {status}
              </Tag>
            </div>
            <p className="text-sm text-[var(--text-muted)] mt-1 font-mono">
              {job?.filename || 'Dataset'} · {job?.id}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] font-mono">
            <Clock className="w-4 h-4 text-[var(--text-muted)]" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Current status bar */}
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm sm:text-base">
            <span className="font-medium text-[var(--text-primary)]">{currentStageName}</span>
            <span className="font-mono text-[var(--text-muted)]">{progressPct.toFixed(0)}%</span>
          </div>

          <div className="w-full bg-[var(--bg-subtle)] h-2.5 rounded-full overflow-hidden hairline-border">
            <div
              className="bg-[var(--accent)] h-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(progressPct, 8)}%` }}
            />
          </div>
        </div>

        {/* Stage List */}
        <div className="space-y-3.5 pt-2">
          {STAGES.map((stg) => {
            const stgStatus = getStageStatus(stg.id);

            return (
              <div
                key={stg.id}
                className={`flex items-start gap-3.5 p-4 sm:p-5 rounded-[var(--radius-md)] border hairline-border transition-colors ${
                  stgStatus === 'active'
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)]'
                    : stgStatus === 'done'
                    ? 'bg-[var(--bg-surface)]'
                    : 'bg-[var(--bg-subtle)] opacity-60'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {stgStatus === 'done' ? (
                    <span className="w-5 h-5 rounded-full bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                  ) : stgStatus === 'active' ? (
                    <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-[var(--border-hairline)] block" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-sm sm:text-base font-semibold text-[var(--text-primary)] block">
                    {stg.name}
                  </span>
                  <span className="text-xs sm:text-sm text-[var(--text-secondary)] block mt-0.5">
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

        {/* When completed, prominent View Results button */}
        {(status === 'DONE' || status === 'DONE_WITH_WARNINGS') && onProceedToResults && (
          <div className="pt-4 flex items-center justify-between bg-[var(--bg-subtle)] p-4 rounded-[var(--radius-md)] hairline-border">
            <div>
              <span className="font-semibold text-[var(--text-primary)] block">
                Cleaning and verification finished!
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                Ready to review reconciliation metrics and download cleaned dataset.
              </span>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={onProceedToResults}
            >
              View Cleaning Results & Download
            </Button>
          </div>
        )}

        {/* Reassurance note & Cancel option */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span>Execution occurs in-process with memory spillover protection.</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-colors underline cursor-pointer"
            >
              Cancel Operation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
