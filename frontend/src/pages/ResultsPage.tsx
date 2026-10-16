import React, { useMemo, useState } from 'react';
import { getDownloadUrl, type JobDetailResponse } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { formatNumber, formatPercent, pluralize } from '../lib/format';
import { CheckCircle2, AlertTriangle, Download, RotateCcw, FileText, FileCheck } from 'lucide-react';

interface ResultsPageProps {
  jobData: JobDetailResponse | null;
  onRestart: () => void;
  onGoToUpload?: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({ jobData, onRestart, onGoToUpload }) => {
  const verification = jobData?.verification;
  const comparison = verification?.comparison;
  const jobId = jobData?.job?.id || '';

  const [showAllTests, setShowAllTests] = useState(false);

  // Sort tests so failures and warnings appear first
  const sortedTests = useMemo(() => {
    const list = verification?.test_results || [];
    return [...list].sort((a, b) => {
      if (a.passed === b.passed) return 0;
      return a.passed ? 1 : -1;
    });
  }, [verification]);

  const failedTestsCount = sortedTests.filter((t) => !t.passed).length;
  const passedTestsCount = sortedTests.filter((t) => t.passed).length;

  const rowsDropped = comparison ? Math.max(0, comparison.rows_before - comparison.rows_after) : 0;
  const pctDropped = comparison && comparison.rows_before > 0 ? (rowsDropped / comparison.rows_before) * 100 : 0;

  // If no job completed yet, show informative empty state
  const isJobCompleted = jobData?.job?.status === 'DONE' || jobData?.job?.status === 'DONE_WITH_WARNINGS' || Boolean(jobData?.verification);
  if (!jobData || !isJobCompleted) {
    return (
      <div className="container-shell py-16 sm:py-24 max-w-2xl mx-auto text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto hairline-border">
          <FileCheck className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
            No Cleaning Results Available
          </h2>
          <p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-lg mx-auto">
            Execute a data cleaning job in Step 3 to view before/after reconciliation deltas,
            automated validation tests, and download cleaned datasets.
          </p>
        </div>
        <Button size="lg" variant="primary" onClick={onGoToUpload ? onGoToUpload : onRestart}>
          Go to Upload (Step 1)
        </Button>
      </div>
    );
  }

  return (
    <div className="container-shell py-8 sm:py-12 space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 hairline-b">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
              Cleaning & Verification Results
            </h1>
            <Tag variant={failedTestsCount > 0 ? 'warn' : 'ok'} font="mono">
              {failedTestsCount > 0 ? 'Completed with Warnings' : 'Verified Clean'}
            </Tag>
          </div>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1.5 max-w-2xl leading-relaxed">
            {comparison
              ? `${formatNumber(comparison.rows_after)} rows reconciled. ${pluralize(rowsDropped, 'row was', 'rows were')} removed (${formatPercent(pctDropped)}).`
              : 'Cleaning process completed.'}{' '}
            {passedTestsCount} verification {passedTestsCount === 1 ? 'test' : 'tests'} passed
            {failedTestsCount > 0 ? `, ${failedTestsCount} flagged for review.` : '.'}
          </p>
        </div>

        {/* Primary Download Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <a href={getDownloadUrl(jobId, 'csv')} download className="inline-block">
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Download className="w-5 h-5" />}
            >
              Download Clean CSV
            </Button>
          </a>

          <a href={getDownloadUrl(jobId, 'parquet')} download className="inline-block">
            <Button
              variant="secondary"
              size="lg"
              leftIcon={<Download className="w-5 h-5" />}
            >
              Parquet (ZSTD)
            </Button>
          </a>

          <a href={getDownloadUrl(jobId, 'report')} download className="inline-block">
            <Button
              variant="ghost"
              size="lg"
              leftIcon={<FileText className="w-5 h-5" />}
            >
              Audit JSON
            </Button>
          </a>
        </div>
      </div>

      {/* Before / After Reconciliation Table */}
      {comparison && (
        <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] overflow-hidden">
          <div className="p-4 sm:p-5 hairline-b flex items-center justify-between bg-[var(--bg-subtle)]">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
              Before vs. After Reconciliation
            </h2>
            <span className="text-sm font-mono text-[var(--text-muted)]">
              Reconciliation Delta: {comparison.rows_delta}
            </span>
          </div>

          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="hairline-b text-[var(--text-muted)] font-medium">
                <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider">Metric</th>
                <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider">Before Cleaning</th>
                <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider">After Cleaning</th>
                <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider">Net Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] font-mono">
              <tr>
                <td className="py-3.5 px-4 font-sans font-medium text-[var(--text-primary)] text-sm sm:text-base">
                  Total Row Count
                </td>
                <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                  {formatNumber(comparison.rows_before)}
                </td>
                <td className="py-3.5 px-4 text-[var(--text-primary)] font-semibold">
                  {formatNumber(comparison.rows_after)}
                </td>
                <td className="py-3.5 px-4 text-[var(--text-muted)]">
                  -{formatNumber(rowsDropped)} ({formatPercent(pctDropped)})
                </td>
              </tr>

              <tr>
                <td className="py-3.5 px-4 font-sans font-medium text-[var(--text-primary)] text-sm sm:text-base">
                  Exact Duplicate Rows
                </td>
                <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                  {formatNumber(comparison.duplicates_before)}
                </td>
                <td className="py-3.5 px-4 text-[var(--status-ok)] font-semibold">
                  {formatNumber(comparison.duplicates_after)}
                </td>
                <td className="py-3.5 px-4 text-[var(--status-ok)]">
                  -{formatNumber(comparison.duplicates_before - comparison.duplicates_after)} (100% removed)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Verification Tests (Failures First & Prominent) */}
      <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3.5 hairline-b">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
              Automated Integrity Tests
            </h2>
            <Tag variant={failedTestsCount > 0 ? 'warn' : 'ok'} font="mono">
              {passedTestsCount} passed · {failedTestsCount} warnings
            </Tag>
          </div>

          {sortedTests.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllTests(!showAllTests)}
              className="text-sm text-[var(--accent)] hover:underline font-sans cursor-pointer font-medium"
            >
              {showAllTests ? 'Show summary' : `View all ${sortedTests.length} tests`}
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {sortedTests
            .slice(0, showAllTests ? undefined : 6)
            .map((test: any, idx: number) => {
              const isPassed = test.passed;
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-[var(--radius-sm)] border hairline-border flex items-start justify-between gap-3.5 text-sm ${
                    isPassed
                      ? 'bg-[var(--bg-surface)]'
                      : 'bg-[var(--status-warn-bg)] border-[var(--status-warn-border)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {isPassed ? (
                      <CheckCircle2 className="w-5 h-5 text-[var(--status-ok)] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-[var(--status-warn)] shrink-0 mt-0.5" />
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)] font-mono text-sm sm:text-base">
                          {test.test_name}
                        </span>
                        {test.column_name && (
                          <Tag variant="neutral" font="mono">
                            {test.column_name}
                          </Tag>
                        )}
                      </div>
                      <p className="text-[var(--text-secondary)] text-xs sm:text-sm leading-relaxed">
                        {test.details}
                      </p>
                    </div>
                  </div>

                  <Tag variant={isPassed ? 'ok' : 'warn'} font="mono">
                    {isPassed ? 'PASS' : 'WARN'}
                  </Tag>
                </div>
              );
            })}
        </div>
      </div>

      {/* Clean Another File Card */}
      <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
            Ready for your next dataset?
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Upload another CSV dataset to profile, review AI cleaning recipes, and verify results.
          </p>
        </div>

        <Button
          variant="secondary"
          size="lg"
          onClick={onRestart}
          leftIcon={<RotateCcw className="w-5 h-5" />}
        >
          Clean Another File
        </Button>
      </div>
    </div>
  );
};
