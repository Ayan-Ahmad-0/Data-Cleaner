import React from 'react';

export interface SummaryMetric {
  label: string;
  value: string;
  subtext?: string;
  status?: 'normal' | 'ok' | 'warn' | 'danger';
}

export interface SummaryStripProps {
  metrics: SummaryMetric[];
  className?: string;
}

export const SummaryStrip: React.FC<SummaryStripProps> = ({ metrics, className = '' }) => {
  return (
    <div
      className={`w-full bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-sm)] flex flex-wrap divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-hairline)] ${className}`}
    >
      {metrics.map((metric, idx) => {
        const valueColor = {
          normal: 'text-[var(--text-primary)]',
          ok: 'text-[var(--status-ok)]',
          warn: 'text-[var(--status-warn)]',
          danger: 'text-[var(--status-danger)]',
        }[metric.status || 'normal'];

        return (
          <div key={idx} className="flex-1 min-w-[140px] px-4 py-3 sm:py-3.5">
            <span className="text-xs text-[var(--text-muted)] block font-sans">
              {metric.label}
            </span>
            <span className={`text-lg font-semibold font-mono block mt-0.5 ${valueColor}`}>
              {metric.value}
            </span>
            {metric.subtext && (
              <span className="text-[11px] text-[var(--text-muted)] block mt-0.5 leading-tight font-sans">
                {metric.subtext}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
