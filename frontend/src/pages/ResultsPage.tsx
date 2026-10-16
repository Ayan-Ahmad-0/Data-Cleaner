import React from 'react';

interface ResultsPageProps {
  onRestart: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({ onRestart }) => {
  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight">
              Cleaning & Verification Completed
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 bg-green-50 text-[var(--ok)] rounded-xs mono">
              STATUS: DONE
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            15,000,000 rows processed & reconciled. 0 unhandled test failures.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => alert('Downloading Clean Parquet...')}
            className="bg-[var(--surface)] hairline-border hover:bg-gray-50 text-[var(--text)] text-xs font-medium px-3 py-1.5 rounded-xs transition-colors mono cursor-pointer"
          >
            Download Parquet (158 MB)
          </button>
          <button
            onClick={() => alert('Downloading Clean CSV...')}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium px-3.5 py-1.5 rounded-xs transition-colors mono cursor-pointer"
          >
            Download CSV (845 MB)
          </button>
        </div>
      </div>

      {/* Verification delta comparison */}
      <div className="bg-[var(--surface)] hairline-border rounded-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Before vs. After Reconciliation
          </span>
          <span className="text-xs mono text-[var(--ok)]">Reconciliation Passed</span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-gray-50/20">
              <th className="py-2 px-4 font-medium">Metric</th>
              <th className="py-2 px-4 font-medium">Before Clean</th>
              <th className="py-2 px-4 font-medium">After Clean</th>
              <th className="py-2 px-4 font-medium">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] mono">
            <tr>
              <td className="py-2 px-4 font-medium font-sans text-[var(--text)]">Total Rows</td>
              <td className="py-2 px-4">15,000,000</td>
              <td className="py-2 px-4 font-semibold text-[var(--text)]">14,625,000</td>
              <td className="py-2 px-4 text-[var(--warn)]">-375,000 (-2.5%)</td>
            </tr>
            <tr>
              <td className="py-2 px-4 font-medium font-sans text-[var(--text)]">Exact Duplicates</td>
              <td className="py-2 px-4 text-[var(--warn)]">375,000</td>
              <td className="py-2 px-4 text-[var(--ok)] font-semibold">0</td>
              <td className="py-2 px-4 text-[var(--ok)]">-375,000 (100% removed)</td>
            </tr>
            <tr>
              <td className="py-2 px-4 font-medium font-sans text-[var(--text)]">Pseudo-Null Tokens ('N/A', '-')</td>
              <td className="py-2 px-4 text-[var(--danger)]">48,335</td>
              <td className="py-2 px-4 text-[var(--ok)] font-semibold">0</td>
              <td className="py-2 px-4 text-[var(--ok)]">-48,335 (Normalized)</td>
            </tr>
            <tr>
              <td className="py-2 px-4 font-medium font-sans text-[var(--text)]">Negative Duration Outliers</td>
              <td className="py-2 px-4 text-[var(--danger)]">18</td>
              <td className="py-2 px-4 text-[var(--ok)] font-semibold">0</td>
              <td className="py-2 px-4 text-[var(--ok)]">-18 (Imputed with median)</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tests and change log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
            Verification Tests Executed
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[var(--ok)]">
              <span>✓ test_unique_keys (event_id)</span>
              <span className="mono">PASS</span>
            </div>
            <div className="flex items-center justify-between text-[var(--ok)]">
              <span>✓ test_not_null (reconciled columns)</span>
              <span className="mono">PASS</span>
            </div>
            <div className="flex items-center justify-between text-[var(--ok)]">
              <span>✓ test_accepted_range (session_duration &gt;= 0)</span>
              <span className="mono">PASS</span>
            </div>
            <div className="flex items-center justify-between text-[var(--ok)]">
              <span>✓ test_row_count_reconciliation</span>
              <span className="mono">PASS</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              Start Another Cleaning Run
            </span>
            <p className="text-xs text-[var(--text-muted)]">
              Clean an additional CSV dataset with profile-guided AI and verified DuckDB execution.
            </p>
          </div>
          <button
            onClick={onRestart}
            className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-[var(--text)] text-xs font-medium py-2 rounded-xs transition-colors cursor-pointer"
          >
            Upload New File &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
