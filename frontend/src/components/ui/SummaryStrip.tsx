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
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full ${className}`}>
      {metrics.map((metric, idx) => (
        <div
          key={idx}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-[var(--border-strong)] transition-colors shadow-2xs"
        >
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] block font-sans">
              {metric.label}
            </span>
            <span className="text-2xl sm:text-3xl font-semibold font-mono block text-[var(--text-primary)] tracking-tight">
              {metric.value}
            </span>
          </div>
          {metric.subtext && (
            <span className="text-xs text-[var(--text-muted)] mt-2 block font-sans">
              {metric.subtext}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
