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
          className="bg-[#141517] border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-zinc-700/60 transition-colors"
        >
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 block font-sans">
              {metric.label}
            </span>
            <span className="text-2xl sm:text-3xl font-semibold font-mono block text-white tracking-tight">
              {metric.value}
            </span>
          </div>
          {metric.subtext && (
            <span className="text-xs text-zinc-400 mt-2 block font-sans">
              {metric.subtext}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
