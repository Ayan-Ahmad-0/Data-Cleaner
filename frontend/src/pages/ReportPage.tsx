import React from 'react';

interface ReportPageProps {
  onProceedToApproval: () => void;
}

export const ReportPage: React.FC<ReportPageProps> = ({ onProceedToApproval }) => {
  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight">
            Data Quality Findings
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Statistical profile extracted in 1 pass over Parquet text staging.
          </p>
        </div>
        <button
          onClick={onProceedToApproval}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium px-3.5 py-1.5 rounded-xs transition-colors cursor-pointer"
        >
          Review Proposed Recipe &rarr;
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Total Rows</span>
          <span className="text-lg font-semibold mono text-[var(--text)] mt-1 block">15,000,000</span>
          <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">100% scanned</span>
        </div>
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Exact Duplicates</span>
          <span className="text-lg font-semibold mono text-[var(--warn)] mt-1 block">375,000</span>
          <span className="text-[11px] text-[var(--warn)] mt-0.5 block">2.5% of total records</span>
        </div>
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Pseudo-Null Tokens</span>
          <span className="text-lg font-semibold mono text-[var(--danger)] mt-1 block">48,335</span>
          <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">'N/A', 'none', '-' strings</span>
        </div>
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Ambiguous Formats</span>
          <span className="text-lg font-semibold mono text-[var(--warn)] mt-1 block">1 Column</span>
          <span className="text-[11px] text-[var(--warn)] mt-0.5 block">DD/MM vs MM/DD ambiguity</span>
        </div>
      </div>

      <div className="bg-[var(--surface)] hairline-border rounded-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Column-by-Column Profiler Breakdown
          </span>
          <span className="text-xs mono text-[var(--text-muted)]">6 Columns Analyzed</span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-gray-50/20">
              <th className="py-2.5 px-4 font-medium">Column</th>
              <th className="py-2.5 px-4 font-medium">Inferred Type</th>
              <th className="py-2.5 px-4 font-medium">Nulls & Tokens</th>
              <th className="py-2.5 px-4 font-medium">Distinct / Cardinality</th>
              <th className="py-2.5 px-4 font-medium">Detected Anomalies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] mono">
            <tr className="hover:bg-gray-50/30">
              <td className="py-2.5 px-4 font-medium text-[var(--text)]">event_id</td>
              <td className="py-2.5 px-4">VARCHAR</td>
              <td className="py-2.5 px-4 text-[var(--ok)]">0 (0.0%)</td>
              <td className="py-2.5 px-4">14,625,000 (Candidate Key)</td>
              <td className="py-2.5 px-4 text-[var(--text-muted)] font-sans">None</td>
            </tr>
            <tr className="hover:bg-gray-50/30">
              <td className="py-2.5 px-4 font-medium text-[var(--text)]">timestamp</td>
              <td className="py-2.5 px-4">TIMESTAMP</td>
              <td className="py-2.5 px-4 text-[var(--ok)]">0 (0.0%)</td>
              <td className="py-2.5 px-4">12,410,229</td>
              <td className="py-2.5 px-4 text-[var(--warn)] font-sans">Ambiguous day/month order detected</td>
            </tr>
            <tr className="hover:bg-gray-50/30">
              <td className="py-2.5 px-4 font-medium text-[var(--text)]">platform</td>
              <td className="py-2.5 px-4">VARCHAR</td>
              <td className="py-2.5 px-4 text-[var(--warn)]">15,004 (0.1% 'N/A')</td>
              <td className="py-2.5 px-4">5</td>
              <td className="py-2.5 px-4 text-[var(--text-muted)] font-sans">Whitespace padding in 2,410 rows</td>
            </tr>
            <tr className="hover:bg-gray-50/30">
              <td className="py-2.5 px-4 font-medium text-[var(--text)]">session_duration_sec</td>
              <td className="py-2.5 px-4">INTEGER</td>
              <td className="py-2.5 px-4 text-[var(--warn)]">33,331 (0.22% '-')</td>
              <td className="py-2.5 px-4">3,600</td>
              <td className="py-2.5 px-4 text-[var(--danger)] font-sans">18 negatives (&lt; 0), max 3,600</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
