import type { JobDetailResponse } from '../lib/api';

interface ReportPageProps {
  jobData: JobDetailResponse | null;
  onProceedToApproval: () => void;
}

export const ReportPage: React.FC<ReportPageProps> = ({ jobData, onProceedToApproval }) => {
  const profile = jobData?.profile;
  const fileMeta = profile?.file || {};
  const duplicates = profile?.duplicates || {};
  const columns = profile?.columns || {};

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight">
            Data Quality Findings
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Statistical profile extracted in 1 pass over DuckDB Parquet text staging.
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
          <span className="text-lg font-semibold mono text-[var(--text)] mt-1 block">
            {fileMeta.rows ? fileMeta.rows.toLocaleString() : '—'}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">100% scanned</span>
        </div>
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Exact Duplicates</span>
          <span className="text-lg font-semibold mono text-[var(--warn)] mt-1 block">
            {duplicates.exact_rows ? duplicates.exact_rows.toLocaleString() : '0'}
          </span>
          <span className="text-[11px] text-[var(--warn)] mt-0.5 block">
            {duplicates.exact_pct || 0}% of records
          </span>
        </div>
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Columns Profiled</span>
          <span className="text-lg font-semibold mono text-[var(--text)] mt-1 block">
            {fileMeta.columns || Object.keys(columns).length}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">All columns ingested</span>
        </div>
        <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
          <span className="text-xs text-[var(--text-muted)] block">Profile Duration</span>
          <span className="text-lg font-semibold mono text-[var(--ok)] mt-1 block">
            {profile?.profile_duration_seconds ? `${profile.profile_duration_seconds}s` : '—'}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">Vectorized scan</span>
        </div>
      </div>

      {jobData?.report_markdown && (
        <div className="bg-[var(--surface)] hairline-border rounded-xs p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block border-b border-[var(--border)] pb-2">
            AI Quality Report
          </span>
          <div className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap font-sans">
            {jobData.report_markdown}
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] hairline-border rounded-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Column-by-Column Profiler Breakdown
          </span>
          <span className="text-xs mono text-[var(--text-muted)]">
            {Object.keys(columns).length} Columns
          </span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-gray-50/20">
              <th className="py-2.5 px-4 font-medium">Column</th>
              <th className="py-2.5 px-4 font-medium">Inferred Type</th>
              <th className="py-2.5 px-4 font-medium">Nulls & Tokens</th>
              <th className="py-2.5 px-4 font-medium">Distinct / Cardinality</th>
              <th className="py-2.5 px-4 font-medium">Anomalies Detected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] mono">
            {Object.entries(columns).map(([colName, meta]: [string, any]) => {
              const nullTokens = meta.null_tokens || {};
              const tokenCount: number = (Object.values(nullTokens) as number[]).reduce((a: number, b: number) => a + Number(b), 0);
              const hasNegatives = (meta.negatives || 0) > 0;
              const hasWs = (meta.whitespace_issues || 0) > 0;

              return (
                <tr key={colName} className="hover:bg-gray-50/30">
                  <td className="py-2.5 px-4 font-medium text-[var(--text)] font-sans">{colName}</td>
                  <td className="py-2.5 px-4 uppercase">{meta.inferred_type}</td>
                  <td className="py-2.5 px-4">
                    {meta.nulls} ({meta.null_pct}%)
                    {tokenCount > 0 && (
                      <span className="text-[var(--warn)] ml-1">
                        · {tokenCount} tokens
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    {meta.distinct ? meta.distinct.toLocaleString() : '—'}
                    {meta.candidate_key && (
                      <span className="text-[var(--ok)] ml-1 font-sans font-medium">(Key)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-sans text-xs">
                    {hasNegatives && (
                      <span className="text-[var(--danger)] block">
                        {meta.negatives} negative values (min: {meta.min})
                      </span>
                    )}
                    {hasWs && (
                      <span className="text-[var(--warn)] block">
                        {meta.whitespace_issues} whitespace issues
                      </span>
                    )}
                    {meta.day_month_ambiguous && (
                      <span className="text-[var(--warn)] block">
                        Ambiguous date format (DD/MM vs MM/DD)
                      </span>
                    )}
                    {!hasNegatives && !hasWs && !meta.day_month_ambiguous && tokenCount === 0 && (
                      <span className="text-[var(--text-muted)]">Clean</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
