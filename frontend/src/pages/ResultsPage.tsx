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
  const [showExplore, setShowExplore] = useState<boolean>(false);
  const [exploreInitialMode, setExploreInitialMode] = useState<'ask_ai' | 'sql'>('ask_ai');
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
  const dupsCleaned = comparison ? Math.max(0, comparison.duplicates_before - comparison.duplicates_after) : 0;

  // Selected format details
  const activeOption = exportOptions.find((o) => o.format_id === selectedFormat) || exportOptions[0];

  // If no job completed yet, show informative empty state
  const isJobCompleted = jobData?.job?.status === 'DONE' || jobData?.job?.status === 'DONE_WITH_WARNINGS' || Boolean(jobData?.verification);
  if (!jobData || !isJobCompleted) {
    return (
      <div className="container-shell py-16 sm:py-24 max-w-2xl mx-auto text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-[#141517] text-zinc-400 flex items-center justify-center mx-auto border border-zinc-800 shadow-sm">
          <FileCheck className="w-7 h-7 text-[#FF4B3E]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            No Cleaning Results Available
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-lg mx-auto">
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-zinc-800">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Cleaning & Verification Results
            </h1>
            {isFlattened && (
              <Tag variant="neutral" font="mono">
                Flattened Schema
              </Tag>
            )}
          </div>
          <p className="text-sm text-zinc-400 font-mono">
            Dataset: <span className="text-zinc-200 font-semibold">{jobData.job.filename}</span> · Engine: Vectorized DuckDB
          </p>
        </div>

        {/* Top-Right Utility / Export Action Bar */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Format Selector Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="appearance-none bg-[#141517] hover:bg-zinc-850 text-zinc-200 text-sm font-medium pl-3.5 pr-9 py-2.5 h-11 rounded-lg border border-zinc-800 cursor-pointer transition-colors outline-none focus:border-[#FF4B3E]"
            >
              {exportOptions.map((opt) => (
                <option
                  key={opt.format_id}
                  value={opt.format_id}
                  disabled={!opt.available}
                  className="bg-[#141517] text-zinc-200 py-1.5"
                >
                  {opt.name} {opt.is_source_format ? '(Same as uploaded)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 pointer-events-none" />
          </div>

          {/* Primary Action Button - Brand Coral */}
          <a
            href={getDownloadUrl(jobId, selectedFormat)}
            download
            className="inline-flex items-center justify-center rounded-lg transition-all cursor-pointer select-none font-sans whitespace-nowrap text-sm px-5 py-2.5 gap-2 h-11 font-semibold bg-[#FF4B3E] hover:bg-[#E03E32] text-white shadow-xs border border-transparent"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download {isFlattened ? 'Flattened ' : ''}{activeOption?.format_id ? activeOption.format_id.toUpperCase() : 'DATA'}</span>
          </a>

          {/* Audit JSON Report */}
          <a
            href={getDownloadUrl(jobId, 'report')}
            download
            className="inline-flex items-center justify-center border border-zinc-800 rounded-lg transition-colors cursor-pointer select-none font-sans whitespace-nowrap text-sm px-4 py-2.5 gap-2 h-11 font-medium bg-[#141517] hover:bg-zinc-800 text-zinc-300 hover:text-white"
          >
            <FileText className="w-4 h-4 shrink-0 text-zinc-400" />
            <span>Audit JSON</span>
          </a>
        </div>
      </div>

      {/* Horizontal Metrics Grid: Pure white numbers, muted gray labels */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Metric 1: Reconciled Rows */}
        <div className="bg-[#141517] border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-zinc-700/60 transition-colors">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 block font-sans">
              Reconciled Rows
            </span>
            <span className="text-2xl sm:text-3xl font-semibold font-mono block text-white tracking-tight">
              {comparison ? formatNumber(comparison.rows_after) : '—'}
            </span>
          </div>
          <span className="text-xs text-zinc-400 mt-2 block font-sans">
            {comparison ? `from ${formatNumber(comparison.rows_before)} initial rows` : 'Output record count'}
          </span>
        </div>

        {/* Metric 2: Rows Removed */}
        <div className="bg-[#141517] border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-zinc-700/60 transition-colors">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 block font-sans">
              Rows Removed
            </span>
            <span className="text-2xl sm:text-3xl font-semibold font-mono block text-white tracking-tight">
              {comparison ? (rowsDropped > 0 ? `-${formatNumber(rowsDropped)}` : '0') : '—'}
            </span>
          </div>
          <span className="text-xs text-zinc-400 mt-2 block font-sans">
            {comparison && rowsDropped > 0 ? `${formatPercent(pctDropped)} net reduction` : 'Zero records removed'}
          </span>
        </div>

        {/* Metric 3: Duplicates Removed */}
        <div className="bg-[#141517] border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-zinc-700/60 transition-colors">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 block font-sans">
              Duplicates Cleaned
            </span>
            <span className="text-2xl sm:text-3xl font-semibold font-mono block text-white tracking-tight">
              {comparison ? formatNumber(dupsCleaned) : '—'}
            </span>
          </div>
          <span className="text-xs text-zinc-400 mt-2 block font-sans">
            {comparison && comparison.duplicates_before > 0 ? '100% duplicate purge' : 'Zero duplicates detected'}
          </span>
        </div>

        {/* Metric 4: Integrity Tests */}
        <div className="bg-[#141517] border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-zinc-700/60 transition-colors">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 block font-sans">
              Integrity Tests
            </span>
            <span className="text-2xl sm:text-3xl font-semibold font-mono block text-white tracking-tight">
              {passedTestsCount} / {sortedTests.length}
            </span>
          </div>
          <span className="text-xs text-zinc-400 mt-2 block font-sans">
            {failedTestsCount === 0 ? 'All assertions passed' : `${failedTestsCount} warning${failedTestsCount > 1 ? 's' : ''} flagged`}
          </span>
        </div>
      </div>

      {/* Inspect or Query your Data Card */}
      {!showExplore && (
        <div className="p-6 rounded-xl bg-zinc-950/60 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xs">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-zinc-850 border border-zinc-750 text-[#FF4B3E] flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                Inspect or Query your Data
              </h3>
              <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
                Ask questions in natural English with our AI Analyst or write custom SQL queries directly against your cleaned data.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setExploreInitialMode('ask_ai');
                setShowExplore(true);
              }}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#FF4B3E] hover:bg-[#E03E32] text-white shadow-xs transition-all cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>Ask AI Analyst</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setExploreInitialMode('sql');
                setShowExplore(true);
              }}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-zinc-850 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-750 transition-all cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-zinc-400" />
              <span>SQL Query Box</span>
            </button>
          </div>
        </div>
      )}

      {/* Exploration Box when active */}
      {showExplore && (
        <div className="pt-2">
          <SqlQueryBox
            jobId={jobId}
            datasetName={jobData.job.filename}
            initialMode={exploreInitialMode}
            onClose={() => setShowExplore(false)}
          />
        </div>
      )}
          {/* Export Format Properties & Notices Table */}
          {(activeOption?.note || (conversionReport?.warnings && conversionReport.warnings.length > 0)) && (
            <div className="bg-[#141517] border border-zinc-800 rounded-xl overflow-hidden shadow-2xs">
              <div className="p-3.5 px-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                  Export Adapter Notices & Limitations
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  Format: {activeOption?.format_id?.toUpperCase()}
                </span>
              </div>
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium bg-[#141517]">
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider w-[32%]">Property</th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Notice / Detail</th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider text-right w-[18%]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {activeOption?.note && (
                    <tr className="hover:bg-zinc-850/50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-zinc-200">Export Specification</td>
                      <td className="py-2.5 px-4 text-zinc-400">{activeOption.note}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="text-zinc-400 font-mono text-xs">Configured</span>
                      </td>
                    </tr>
                  )}
                  {conversionReport?.warnings && conversionReport.warnings.map((w: string, idx: number) => (
                    <tr key={idx} className="hover:bg-zinc-850/50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-zinc-200">Fidelity Notice #{idx + 1}</td>
                      <td className="py-2.5 px-4 text-zinc-400">{w}</td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 text-amber-400 font-medium text-xs font-mono">
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
            <div className="bg-[#141517] border border-zinc-800 rounded-xl overflow-hidden shadow-2xs">
              <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                  Before vs. After Reconciliation
                </h2>
                <span className="text-xs sm:text-sm font-mono text-zinc-400">
                  Delta: <span className="text-zinc-200 font-medium">{comparison.rows_delta}</span>
                </span>
              </div>

              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider font-mono">Metric</th>
                    <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider font-mono">Before Cleaning</th>
                    <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider font-mono">After Cleaning</th>
                    <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider font-mono">Net Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 font-mono">
                  <tr className="hover:bg-zinc-850/50 transition-colors">
                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-200 text-sm sm:text-base">
                      Total Row Count
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      {formatNumber(comparison.rows_before)}
                    </td>
                    <td className="py-3.5 px-4 text-white font-semibold">
                      {formatNumber(comparison.rows_after)}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      -{formatNumber(rowsDropped)} ({formatPercent(pctDropped)})
                    </td>
                  </tr>

                  <tr className="hover:bg-zinc-850/50 transition-colors">
                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-200 text-sm sm:text-base">
                      Exact Duplicate Rows
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      {formatNumber(comparison.duplicates_before)}
                    </td>
                    <td className="py-3.5 px-4 text-emerald-400 font-semibold">
                      {formatNumber(comparison.duplicates_after)}
                    </td>
                    <td className="py-3.5 px-4 text-emerald-400">
                      -{formatNumber(dupsCleaned)} (100% removed)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Automated Integrity Tests Table */}
          <div className="bg-[#141517] border border-zinc-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
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
                  className="text-sm text-[#FF4B3E] hover:underline font-sans cursor-pointer font-medium"
                >
                  {showAllTests ? 'Show summary (first 6)' : `View all ${sortedTests.length} tests`}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium bg-[#141517]">
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider w-[35%] sm:w-[32%] font-mono">
                      Test / Column
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider font-mono">
                      Result
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider text-right w-[18%] sm:w-[15%] font-mono">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {sortedTests
                    .slice(0, showAllTests ? undefined : 6)
                    .map((test: any, idx: number) => {
                      const isPassed = test.passed;
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-zinc-850/50 transition-colors"
                        >
                          {/* Test / Column */}
                          <td className="py-3 px-4 align-top">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs sm:text-sm font-semibold text-zinc-200">
                                {test.test_name}
                              </span>
                              {test.column_name ? (
                                <span className="font-mono text-xs text-zinc-500">
                                  column: <span className="text-zinc-300 font-medium">{test.column_name}</span>
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-500">
                                  dataset-level assertion
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Result */}
                          <td className="py-3 px-4 align-top text-xs sm:text-sm text-zinc-400 leading-relaxed">
                            {test.details}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                              {isPassed ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span className="text-emerald-400 font-mono">Passed</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                  <span className="text-amber-400 font-semibold font-mono">Warning</span>
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

      {/* Clean Another File Card */}
      <div className="bg-[#141517] border border-zinc-800 rounded-xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-2xs">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
            Ready for your next dataset?
          </h3>
          <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
            Upload another CSV, Parquet, or Excel dataset to profile, review AI cleaning recipes, and verify results.
          </p>
        </div>

        <Button
          variant="secondary"
          size="lg"
          onClick={onRestart}
          leftIcon={<RotateCcw className="w-5 h-5 text-zinc-400" />}
        >
          Clean Another File
        </Button>
      </div>
    </div>
  );
};
