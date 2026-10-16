import { getDownloadUrl, type JobDetailResponse } from '../lib/api';

interface ResultsPageProps {
  jobData: JobDetailResponse | null;
  onRestart: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({ jobData, onRestart }) => {
  const verification = jobData?.verification;
  const comparison = verification?.comparison;
  const testResults = verification?.test_results || [];
  const status = jobData?.job?.status || 'DONE';
  const jobId = jobData?.job?.id || '';

  const isWarnings = status === 'DONE_WITH_WARNINGS';

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight">
              Cleaning & Verification Results
            </h1>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-xs mono ${
                isWarnings ? 'bg-amber-50 text-[var(--warn)]' : 'bg-green-50 text-[var(--ok)]'
              }`}
            >
              STATUS: {status}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {comparison ? `${comparison.rows_after.toLocaleString()} rows reconciled.` : 'Cleaning completed.'}{' '}
            {verification?.tests_passed || 0} tests passed, {verification?.tests_failed || 0} failed.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <a
            href={getDownloadUrl(jobId, 'parquet')}
            download
            className="bg-[var(--surface)] hairline-border hover:bg-gray-50 text-[var(--text)] text-xs font-medium px-3.5 py-1.5 rounded-xs transition-colors mono cursor-pointer inline-block"
          >
            Download Parquet
          </a>
          <a
            href={getDownloadUrl(jobId, 'csv')}
            download
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium px-4 py-1.5 rounded-xs transition-colors mono cursor-pointer inline-block"
          >
            Download Clean CSV
          </a>
        </div>
      </div>

      {/* Before/After Table */}
      {comparison && (
        <div className="bg-[var(--surface)] hairline-border rounded-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] bg-gray-50/50 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Before vs. After Reconciliation
            </span>
            <span className="text-xs mono text-[var(--ok)]">
              Reconciliation Delta: {comparison.rows_delta}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-gray-50/20">
                <th className="py-2.5 px-4 font-medium">Metric</th>
                <th className="py-2.5 px-4 font-medium">Before Clean</th>
                <th className="py-2.5 px-4 font-medium">After Clean</th>
                <th className="py-2.5 px-4 font-medium">Reconciled Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] mono">
              <tr>
                <td className="py-2.5 px-4 font-medium font-sans text-[var(--text)]">Total Rows</td>
                <td className="py-2.5 px-4">{comparison.rows_before.toLocaleString()}</td>
                <td className="py-2.5 px-4 font-semibold text-[var(--text)]">{comparison.rows_after.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-[var(--text-muted)]">{comparison.rows_delta.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium font-sans text-[var(--text)]">Exact Duplicates</td>
                <td className="py-2.5 px-4 text-[var(--warn)]">{comparison.duplicates_before.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-[var(--ok)] font-semibold">{comparison.duplicates_after.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-[var(--ok)]">
                  -{comparison.duplicates_before.toLocaleString()} (100% removed)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Verification Tests */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Automated Tests ({testResults.length})
            </span>
            <span className="text-xs mono text-[var(--ok)]">
              {verification?.tests_passed || 0} Passed
            </span>
          </div>
          <div className="space-y-2 text-xs">
            {testResults.map((t: any, idx: number) => (
              <div key={idx} className="flex items-start justify-between">
                <div>
                  <span className={t.passed ? 'text-[var(--ok)] font-medium' : 'text-[var(--danger)] font-medium'}>
                    {t.passed ? '✓' : '✗'} {t.test_name} {t.column_name ? `(${t.column_name})` : ''}
                  </span>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{t.details}</p>
                </div>
                <span className={`mono text-[11px] font-semibold ${t.passed ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}>
                  {t.passed ? 'PASS' : 'WARN'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              Start Another Cleaning Job
            </span>
            <p className="text-xs text-[var(--text-muted)]">
              Process another multi-gigabyte CSV dataset with single-pass DuckDB profiling, AI recipe grounding, and automated reconciliation tests.
            </p>
          </div>
          <button
            onClick={onRestart}
            className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-[var(--text)] text-xs font-medium py-2 rounded-xs transition-colors cursor-pointer"
          >
            Upload New Dataset &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
