import React, { useMemo, useState } from 'react';
import { getDownloadUrl, type JobDetailResponse } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { formatNumber, formatPercent } from '../lib/format';
import { CheckCircle2, AlertTriangle, Download, RotateCcw, FileText, FileCheck, ChevronDown, Terminal, Bot } from 'lucide-react';
import { SqlQueryBox } from '../components/explore/SqlQueryBox';

interface ResultsPageProps {
  jobData: JobDetailResponse | null;
  onRestart: () => void;
  onGoToUpload?: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({ jobData, onRestart, onGoToUpload }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'ask_ai' | 'sql'>('summary');
  const verification = jobData?.verification;
  const comparison = verification?.comparison;
  const jobId = jobData?.job?.id || '';

  const [showAllTests, setShowAllTests] = useState(false);
  const conversionReport = jobData?.conversion_report;
  const isFlattened = Boolean(conversionReport?.flattened);
  const detectedFormat = jobData?.job?.detected_format;

  // Format selection list
  const exportOptions = useMemo(() => {
    if (jobData?.export_options && jobData.export_options.length > 0) {
      return jobData.export_options;
    }
    return [
      { format_id: 'csv', name: 'CSV (Comma-Separated)', extension: '.csv', mime_type: 'text/csv', available: true, is_source_format: detectedFormat === 'csv' },
      { format_id: 'parquet', name: 'Parquet (ZSTD)', extension: '.parquet', mime_type: 'application/octet-stream', available: true, is_source_format: detectedFormat === 'parquet' },
      { format_id: 'tsv', name: 'TSV (Tab-Separated)', extension: '.tsv', mime_type: 'text/tab-separated-values', available: true, is_source_format: detectedFormat === 'tsv' },
      { format_id: 'ndjson', name: 'NDJSON (Newline JSON)', extension: '.ndjson', mime_type: 'application/x-ndjson', available: true, is_source_format: detectedFormat === 'ndjson' || detectedFormat === 'json' },
      { format_id: 'json', name: 'JSON (Array)', extension: '.json', mime_type: 'application/json', available: true },
      { format_id: 'xlsx', name: 'Excel Workbook (.xlsx)', extension: '.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', available: true, is_source_format: detectedFormat === 'xlsx' },
    ];
  }, [jobData?.export_options, detectedFormat]);

  // Initial selected format: pick "same as uploaded" if available, else 'csv'
  const defaultFormat = useMemo(() => {
    const same = exportOptions.find((o) => o.is_source_format && o.available);
    return same ? same.format_id : 'csv';
  }, [exportOptions]);

  const [selectedFormat, setSelectedFormat] = useState<string>(defaultFormat);

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

  // Selected format details
  const activeOption = exportOptions.find((o) => o.format_id === selectedFormat) || exportOptions[0];

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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 hairline-b">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
              Cleaning & Verification Results
            </h1>
            <Tag variant={failedTestsCount > 0 ? 'warn' : 'ok'} font="mono">
              {failedTestsCount > 0 ? 'Completed with Warnings' : 'Verified Clean'}
            </Tag>
            {isFlattened && (
              <Tag variant="neutral" font="mono">
                Flattened Schema
              </Tag>
            )}
            {detectedFormat && (
              <Tag variant="neutral" font="mono">
                Source: {detectedFormat.toUpperCase()}
              </Tag>
            )}
          </div>

          {/* Structured Compact Stat Bar */}
          <div className="inline-flex flex-wrap items-center gap-x-6 gap-y-2 py-2 px-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] hairline-border text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] font-medium">Reconciled Rows:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {comparison ? formatNumber(comparison.rows_after) : '—'}
              </span>
            </div>
            <span className="text-[var(--border-hairline)] hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] font-medium">Removed:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {comparison ? `${formatNumber(rowsDropped)} (${formatPercent(pctDropped)})` : '—'}
              </span>
            </div>
            <span className="text-[var(--border-hairline)] hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] font-medium">Tests Passed:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {passedTestsCount} / {sortedTests.length}
                {failedTestsCount > 0 && (
                  <span className="text-[var(--status-warn)] font-medium ml-1">
                    ({failedTestsCount} Flagged)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Utility / Export Actions Only */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Format Selector Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="appearance-none bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm font-medium pl-3.5 pr-9 py-2.5 h-11 rounded-[var(--radius-sm)] hairline-border cursor-pointer transition-colors outline-none focus:border-[var(--accent)]"
            >
              {exportOptions.map((opt) => (
                <option
                  key={opt.format_id}
                  value={opt.format_id}
                  disabled={!opt.available}
                  className="bg-[var(--bg-surface)] text-[var(--text-primary)] py-1.5"
                >
                  {opt.name} {opt.is_source_format ? '(Same as uploaded)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)] absolute right-3 pointer-events-none" />
          </div>

          {/* Primary Action Button */}
          <a
            href={getDownloadUrl(jobId, selectedFormat)}
            download
            className="inline-flex items-center justify-center border hairline-border rounded-[var(--radius-sm)] transition-colors cursor-pointer select-none font-sans whitespace-nowrap text-sm px-5 py-2.5 gap-2 h-11 font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border-transparent shadow-none"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download {isFlattened ? 'Flattened ' : ''}{activeOption?.format_id ? activeOption.format_id.toUpperCase() : 'DATA'}</span>
          </a>

          {/* Audit JSON Report */}
          <a
            href={getDownloadUrl(jobId, 'report')}
            download
            className="inline-flex items-center justify-center border hairline-border rounded-[var(--radius-sm)] transition-colors cursor-pointer select-none font-sans whitespace-nowrap text-sm px-4 py-2.5 gap-2 h-11 font-medium bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Audit JSON</span>
          </a>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-1 border-b hairline-b border-[var(--border-hairline)] pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'summary'
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Verification & Quality Summary</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ask_ai')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'ask_ai'
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Ask AI Analyst</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sql')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'sql'
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>SQL Query Box</span>
        </button>
      </div>

      {activeTab === 'ask_ai' ? (
        <SqlQueryBox jobId={jobId} datasetName={jobData.job.filename} initialMode="ask_ai" />
      ) : activeTab === 'sql' ? (
        <SqlQueryBox jobId={jobId} datasetName={jobData.job.filename} initialMode="sql" />
      ) : (
        <>
      {/* Export Format Properties & Notices Table */}
      {(activeOption?.note || (conversionReport?.warnings && conversionReport.warnings.length > 0)) && (
        <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] overflow-hidden">
          <div className="p-3 px-4 hairline-b bg-[var(--bg-subtle)] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Export Adapter Notices & Limitations
            </span>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              Format: {activeOption?.format_id?.toUpperCase()}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="hairline-b text-[var(--text-muted)] font-medium bg-[var(--bg-surface)]">
                <th className="py-2 px-4 font-semibold text-xs uppercase tracking-wider w-[32%]">Property</th>
                <th className="py-2 px-4 font-semibold text-xs uppercase tracking-wider">Notice / Detail</th>
                <th className="py-2 px-4 font-semibold text-xs uppercase tracking-wider text-right w-[18%]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {activeOption?.note && (
                <tr className="hover:bg-[var(--bg-hover)]">
                  <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">Export Specification</td>
                  <td className="py-2.5 px-4 text-[var(--text-secondary)]">{activeOption.note}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className="text-[var(--text-muted)] font-medium">Configured</span>
                  </td>
                </tr>
              )}
              {conversionReport?.warnings && conversionReport.warnings.map((w: string, idx: number) => (
                <tr key={idx} className="hover:bg-[var(--bg-hover)]">
                  <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">Fidelity Notice #{idx + 1}</td>
                  <td className="py-2.5 px-4 text-[var(--text-secondary)]">{w}</td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 text-[var(--status-warn)] font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Notice</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      {/* Automated Integrity Tests Table */}
      <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] overflow-hidden">
        <div className="p-4 sm:p-5 hairline-b flex items-center justify-between bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
              Automated Integrity Tests
            </h2>
            <Tag variant={failedTestsCount > 0 ? 'warn' : 'ok'} font="mono">
              {passedTestsCount} passed · {failedTestsCount} warnings
            </Tag>
          </div>

          {sortedTests.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllTests(!showAllTests)}
              className="text-sm text-[var(--accent)] hover:underline font-sans cursor-pointer font-medium"
            >
              {showAllTests ? 'Show summary (first 6)' : `View all ${sortedTests.length} tests`}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="hairline-b text-[var(--text-muted)] font-medium bg-[var(--bg-surface)]">
                <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider w-[35%] sm:w-[32%]">
                  Test / Column
                </th>
                <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">
                  Result
                </th>
                <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider text-right w-[18%] sm:w-[15%]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {sortedTests
                .slice(0, showAllTests ? undefined : 6)
                .map((test: any, idx: number) => {
                  const isPassed = test.passed;
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-[var(--bg-hover)] transition-colors ${
                        !isPassed ? 'bg-[var(--status-warn-bg)]/40' : ''
                      }`}
                    >
                      {/* Test / Column */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                            {test.test_name}
                          </span>
                          {test.column_name ? (
                            <span className="font-mono text-xs text-[var(--text-muted)]">
                              column: <span className="text-[var(--text-secondary)] font-medium">{test.column_name}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              dataset-level assertion
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Result */}
                      <td className="py-3 px-4 align-top text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        {test.details}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                          {isPassed ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-[var(--status-ok)] shrink-0" />
                              <span className="text-[var(--status-ok)]">Passed</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4 text-[var(--status-warn)] shrink-0" />
                              <span className="text-[var(--status-warn)] font-semibold">Warning</span>
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
      </>
      )}

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
