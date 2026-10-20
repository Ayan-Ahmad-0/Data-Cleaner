import React, { useEffect, useState } from 'react';
import type { JobDetailResponse } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Tag } from '../components/ui/Tag';
import { CheckCircle2, Loader2, Clock, XCircle, RefreshCw } from 'lucide-react';

interface ProgressPageProps {
  jobData: JobDetailResponse | null;
  onProceedToResults?: () => void;
  onGoToApproval?: () => void;
  onRetry?: () => void;
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

export const ProgressPage: React.FC<ProgressPageProps> = ({
  jobData,
  onProceedToResults,
  onGoToApproval,
  onRetry,
  onCancel,
  onGoToUpload,
}) => {
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
  const getStageStatus = (stageId: string): 'done' | 'active' | 'pending' | 'failed' => {
    if (status === 'DONE' || status === 'DONE_WITH_WARNINGS') return 'done';

    if (status === 'FAILED') {
      const stageLower = currentStageName.toLowerCase();
      if (progressPct >= 80 || stageLower.includes('verif') || stageLower.includes('reconcil')) {
        if (stageId === 'verify') return 'failed';
        if (stageId === 'clean' || stageId === 'profile' || stageId === 'convert') return 'done';
        return 'pending';
      }
      if (progressPct >= 40 || stageLower.includes('clean') || stageLower.includes('duckdb') || stageLower.includes('cte')) {
        if (stageId === 'clean') return 'failed';
        if (stageId === 'profile' || stageId === 'convert') return 'done';
        return 'pending';
      }
      if (progressPct >= 25 || stageLower.includes('profile') || stageLower.includes('ai') || stageLower.includes('draft') || stageLower.includes('recipe')) {
        if (stageId === 'profile') return 'failed';
        if (stageId === 'convert') return 'done';
        return 'pending';
      }
      if (stageId === 'convert') return 'failed';
      return 'pending';
    }

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

  const isFailed = status === 'FAILED';
  const tagVariant = isFailed ? 'danger' : status === 'DONE' || status === 'DONE_WITH_WARNINGS' ? 'ok' : 'accent';

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
              <Tag variant={tagVariant} font="mono">
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
            <span className={`font-medium ${isFailed ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}>
              {currentStageName}
            </span>
            <span className="font-mono text-[var(--text-muted)]">{progressPct.toFixed(0)}%</span>
          </div>

          <div className="w-full bg-[var(--bg-subtle)] h-2.5 rounded-full overflow-hidden hairline-border">
            <div
              className={`h-full transition-all duration-300 ease-out ${
                isFailed ? 'bg-[var(--status-danger)]' : 'bg-[var(--accent)]'
              }`}
              style={{ width: `${Math.max(progressPct, 8)}%` }}
            />
          </div>
        </div>

        {/* Failure Callout Banner */}
        {isFailed && (
          <Callout variant="danger" title="Pipeline Execution Stopped">
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-primary)]">
                {job?.error || currentStageName || 'An error occurred during dataset processing.'}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                The pipeline halted safely to protect dataset integrity. You can retry the cleaning step, return to modify your cleaning recipe, or start fresh with an upload.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {onRetry && (
                  <Button variant="primary" size="sm" onClick={onRetry} className="gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Cleaning
                  </Button>
                )}
                {onGoToApproval && (
                  <Button variant="secondary" size="sm" onClick={onGoToApproval}>
                    Back to Cleaning Plan
                  </Button>
                )}
                {onGoToUpload && (
                  <Button variant="ghost" size="sm" onClick={onGoToUpload}>
                    Upload New Dataset
                  </Button>
                )}
              </div>
            </div>
          </Callout>
        )}

        {/* Awaiting Approval Notice if user lands on Step 4 */}
        {status === 'AWAITING_APPROVAL' && (
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] hairline-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-semibold text-[var(--text-primary)] block text-sm sm:text-base">
                Profiling & Recipe Complete
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                The dataset has been analyzed and the cleaning recipe drafted. Review and confirm rule parameters before executing.
              </span>
            </div>
            {onGoToApproval && (
              <Button variant="primary" size="md" onClick={onGoToApproval} className="shrink-0">
                Review & Approve Plan
              </Button>
            )}
          </div>
        )}

        {/* Pipeline Execution Stages Table */}
        <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] overflow-hidden">
          <div className="p-3.5 sm:p-4 hairline-b bg-[var(--bg-subtle)] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Pipeline Execution Plan
            </span>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              4 Vectorized Stages
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="hairline-b text-[var(--text-muted)] font-medium bg-[var(--bg-surface)]">
                  <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider w-[36%] sm:w-[32%]">
                    Stage / Step
                  </th>
                  <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">
                    Execution Details
                  </th>
                  <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider text-right w-[20%] sm:w-[18%]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {STAGES.map((stg) => {
                  const stgStatus = getStageStatus(stg.id);
                  const isActive = stgStatus === 'active';
                  const isDone = stgStatus === 'done';
                  const isFailedStage = stgStatus === 'failed';

                  return (
                    <tr
                      key={stg.id}
                      className={`transition-colors ${
                        isFailedStage
                          ? 'bg-[var(--status-danger)]/10 hover:bg-[var(--status-danger)]/15'
                          : isActive
                          ? 'bg-[var(--accent-subtle)]/40 hover:bg-[var(--accent-subtle)]/60'
                          : isDone
                          ? 'hover:bg-[var(--bg-hover)]'
                          : 'opacity-60 hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {/* Stage Name & Identifier */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`text-xs sm:text-sm font-semibold ${
                              isFailedStage
                                ? 'text-[var(--status-danger)]'
                                : isActive
                                ? 'text-[var(--accent)]'
                                : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {stg.name}
                          </span>
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            stage: <span className="text-[var(--text-secondary)] font-medium">{stg.id}</span>
                          </span>
                        </div>
                      </td>

                      {/* Description / Progress Context */}
                      <td className="py-3 px-4 align-top text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        <div>{stg.description}</div>
                        {isFailedStage && (job?.error || currentStageName) && (
                          <div className="text-xs text-[var(--status-danger)] mt-1 font-mono">
                            ↳ {job?.error ? `Error: ${job.error}` : currentStageName}
                          </div>
                        )}
                        {isActive && currentStageName && currentStageName !== stg.name && (
                          <div className="text-xs text-[var(--accent)] mt-1 font-mono">
                            ↳ {currentStageName}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                          {isDone ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-[var(--status-ok)] shrink-0" />
                              <span className="text-[var(--status-ok)]">Passed</span>
                            </>
                          ) : isFailedStage ? (
                            <>
                              <XCircle className="w-4 h-4 text-[var(--status-danger)] shrink-0" />
                              <span className="text-[var(--status-danger)] font-semibold">Failed</span>
                            </>
                          ) : isActive ? (
                            <>
                              <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin shrink-0" />
                              <span className="text-[var(--accent)] font-semibold">Running</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] shrink-0 opacity-40 mr-1" />
                              <span className="text-[var(--text-muted)]">Pending</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
