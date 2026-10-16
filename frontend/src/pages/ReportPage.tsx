import React, { useMemo, useState } from 'react';
import type { JobDetailResponse } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Disclosure } from '../components/ui/Disclosure';
import { MarkdownView } from '../components/ui/MarkdownView';
import { SummaryStrip, type SummaryMetric } from '../components/ui/SummaryStrip';
import { Tag } from '../components/ui/Tag';
import { deriveColumnStatus, formatNumber, formatPercent, pluralize } from '../lib/format';
import { ArrowRight, ChevronDown, ChevronRight, Filter, Search } from 'lucide-react';

interface ReportPageProps {
  jobData: JobDetailResponse | null;
  onProceedToApproval: () => void;
}

export const ReportPage: React.FC<ReportPageProps> = ({ jobData, onProceedToApproval }) => {
  const profile = jobData?.profile;

  // Table state for 40+ columns
  const [filterIssuesOnly, setFilterIssuesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});

  const toggleExpand = (colName: string) => {
    setExpandedColumns((prev) => ({ ...prev, [colName]: !prev[colName] }));
  };

  // Derive findings across all columns
  const columnAnalysis = useMemo(() => {
    const cols: Record<string, any> = profile?.columns || {};
    const list = Object.entries(cols).map(([name, meta]) => {
      const status = deriveColumnStatus(meta);
      return { name, meta, status };
    });

    const issuesCount = list.filter((c) => !c.status.isClean).length;
    return { list, issuesCount };
  }, [profile]);

  // Filtered column list
  const filteredColumns = useMemo(() => {
    return columnAnalysis.list.filter(({ name, status }) => {
      if (filterIssuesOnly && status.isClean) return false;
      if (searchQuery.trim()) {
        return name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      }
      return true;
    });
  }, [columnAnalysis.list, filterIssuesOnly, searchQuery]);

  // Editorial Verdict headline
  const verdictText = useMemo(() => {
    const issues = columnAnalysis.issuesCount;
    const dups = profile?.duplicates?.exact_rows || 0;

    if (issues === 0 && dups === 0) {
      return 'All columns appear clean and conform to expected formats.';
    }
    if (issues > 0 && dups > 0) {
      return `${pluralize(issues, 'column requires', 'columns require')} attention and duplicate records were detected.`;
    }
    if (issues > 0) {
      return `${pluralize(issues, 'column requires', 'columns require')} attention before this data is safe to use.`;
    }
    return 'Duplicate rows were detected; column formats appear consistent.';
  }, [columnAnalysis.issuesCount, profile]);

  // Summary strip metrics (neutral and semantic colors strictly for actual status)
  const summaryMetrics: SummaryMetric[] = useMemo(() => {
    const file = profile?.file || {};
    const dupsObj = profile?.duplicates || {};
    const dups = dupsObj.exact_rows || 0;
    const dupPct = dupsObj.exact_pct || 0;
    const cols = profile?.columns || {};

    return [
      {
        label: 'Total Rows',
        value: file.rows ? formatNumber(file.rows) : '—',
        subtext: '100% profiled',
        status: 'normal',
      },
      {
        label: 'Exact Duplicates',
        value: formatNumber(dups),
        subtext: dups > 0 ? `${formatPercent(dupPct)} of records` : 'Zero duplicates',
        status: dups > 0 ? 'warn' : 'normal',
      },
      {
        label: 'Columns Profiled',
        value: formatNumber(file.columns || Object.keys(cols).length),
        subtext: `${columnAnalysis.issuesCount} with issues`,
        status: columnAnalysis.issuesCount > 0 ? 'warn' : 'normal',
      },
      {
        label: 'Profiling Duration',
        value: profile?.profile_duration_seconds ? `${profile.profile_duration_seconds.toFixed(2)}s` : '—',
        subtext: 'Single-pass scan',
        status: 'normal',
      },
    ];
  }, [profile, columnAnalysis.issuesCount]);

  return (
    <div className="container-shell py-8 space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 hairline-b">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
            Data Quality Assessment
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
            {verdictText}
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={onProceedToApproval}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Review Cleaning Plan
        </Button>
      </div>

      {/* Summary Strip (Dividers, not boxes) */}
      <SummaryStrip metrics={summaryMetrics} />

      {/* Formatted AI Quality Report */}
      {jobData?.report_markdown && (
        <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-sm)] p-6 space-y-3">
          <div className="flex items-center justify-between pb-3 hairline-b">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              AI Data Quality Report
            </h2>
            <Tag variant="neutral">Generated from Statistical Profile</Tag>
          </div>

          <MarkdownView content={jobData.report_markdown} />
        </div>
      )}

      {/* Column Inspector Table */}
      <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-sm)] overflow-hidden">
        {/* Table Controls (Search & Filter) */}
        <div className="p-4 hairline-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Column Profiler Breakdown
            </h2>
            <Tag variant="neutral" font="mono">
              {filteredColumns.length} of {columnAnalysis.list.length} columns
            </Tag>
          </div>

          <div className="flex items-center gap-3">
            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search column..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs font-sans rounded-[var(--radius-xs)] border hairline-border bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Issues only toggle */}
            <Button
              size="sm"
              variant={filterIssuesOnly ? 'primary' : 'secondary'}
              onClick={() => setFilterIssuesOnly(!filterIssuesOnly)}
              leftIcon={<Filter className="w-3 h-3" />}
            >
              {filterIssuesOnly ? 'Showing Issues Only' : 'Issues Only'}
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Column profiler table"
          className="overflow-x-auto max-h-[580px] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--bg-subtle)] hairline-b text-[var(--text-muted)] font-medium z-10 select-none">
              <tr>
                <th className="py-2.5 px-4 font-medium w-8"></th>
                <th className="py-2.5 px-4 font-medium">Column</th>
                <th className="py-2.5 px-4 font-medium">Inferred Type</th>
                <th className="py-2.5 px-4 font-medium">Missing / Nulls</th>
                <th className="py-2.5 px-4 font-medium">Cardinality</th>
                <th className="py-2.5 px-4 font-medium">Status & Anomalies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filteredColumns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No columns match the current filter.
                  </td>
                </tr>
              ) : (
                filteredColumns.map(({ name, meta, status }) => {
                  const isExpanded = Boolean(expandedColumns[name]);
                  const nullPct = meta.null_pct || 0;
                  const tokenCount = Object.values(meta.null_tokens || {}).reduce(
                    (a: number, b: any) => a + Number(b),
                    0
                  );

                  return (
                    <React.Fragment key={name}>
                      <tr
                        onClick={() => toggleExpand(name)}
                        className="hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-4 text-[var(--text-muted)]">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-[var(--text-primary)] font-mono">
                          {name}
                        </td>
                        <td className="py-2.5 px-4">
                          <Tag variant="neutral" font="mono">
                            {meta.inferred_type || 'string'}
                          </Tag>
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <div className="flex items-center gap-2">
                            <span>
                              {formatNumber(meta.nulls)} ({formatPercent(nullPct)})
                            </span>
                            {nullPct > 0 && (
                              <div className="w-12 h-1 bg-[var(--border-hairline)] rounded-full overflow-hidden shrink-0">
                                <div
                                  className="h-full bg-[var(--status-warn)]"
                                  style={{ width: `${Math.min(nullPct, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <span>{formatNumber(meta.distinct)}</span>
                          {meta.candidate_key && (
                            <Tag variant="ok" className="ml-1.5" font="sans">
                              Primary Key
                            </Tag>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {status.isClean ? (
                            <Tag variant="ok">Clean</Tag>
                          ) : (
                            <Tag variant={status.severity}>{status.label}</Tag>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Inspection Details */}
                      {isExpanded && (
                        <tr className="bg-[var(--bg-subtle)]">
                          <td colSpan={6} className="px-10 py-3.5 space-y-2 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {/* Diagnostic Issues */}
                              <div>
                                <span className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">
                                  Detected Issues
                                </span>
                                {status.issues.length === 0 ? (
                                  <span className="text-[var(--status-ok-text)]">No issues detected in column.</span>
                                ) : (
                                  <ul className="list-disc pl-4 space-y-0.5 text-[var(--text-secondary)]">
                                    {status.issues.map((issue, idx) => (
                                      <li key={idx}>{issue}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Null Tokens Breakdown */}
                              <div>
                                <span className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">
                                  Placeholder Tokens ({tokenCount})
                                </span>
                                {tokenCount === 0 ? (
                                  <span className="text-[var(--text-muted)]">No dirty string tokens found.</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                                    {Object.entries(meta.null_tokens || {}).map(([tok, cnt]) => (
                                      <span
                                        key={tok}
                                        className="bg-[var(--bg-surface)] px-1.5 py-0.5 rounded-[var(--radius-xs)] hairline-border"
                                      >
                                        "{tok}": {formatNumber(cnt as number)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Sample Values */}
                              <div>
                                <span className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">
                                  Sample Values
                                </span>
                                {meta.sample_values && meta.sample_values.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 font-mono text-[11px] text-[var(--text-secondary)]">
                                    {meta.sample_values.slice(0, 5).map((val: string, idx: number) => (
                                      <span
                                        key={idx}
                                        className="bg-[var(--bg-surface)] px-1.5 py-0.5 rounded-[var(--radius-xs)] hairline-border truncate max-w-[120px]"
                                        title={val}
                                      >
                                        {val === '' ? '<empty>' : val}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[var(--text-muted)]">Sample values withheld or empty.</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engine Details Disclosure (Collapsed at bottom) */}
      <Disclosure
        title="Technical Engine Details"
        subtitle="DuckDB Parquet staging & profiler architecture"
        defaultOpen={false}
      >
        <div className="space-y-2 pt-2 leading-relaxed">
          <p>
            Profiling is executed directly on an in-memory or ephemeral DuckDB instance. The raw CSV
            is converted into text-only columnar Parquet with Zstandard compression to preserve raw
            tokens without premature type inference.
          </p>
          <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px]">
            <span>Engine: DuckDB Vectorized C++</span>
            <span>·</span>
            <span>Profile Size: &lt;100 KB JSON</span>
            <span>·</span>
            <span>Full-File Scan: Single Pass</span>
          </div>
        </div>
      </Disclosure>
    </div>
  );
};
