import React, { useEffect, useState } from 'react';

interface ProgressPageProps {
  onComplete: () => void;
}

const STAGES = [
  { id: 'convert', label: 'CSV to Parquet Conversion', duration: '9.98s' },
  { id: 'profile', label: 'Single-Pass Statistical Profiling', duration: '12.4s' },
  { id: 'clean', label: 'DuckDB Macro SQL Compilation & Execution', duration: '18.2s' },
  { id: 'verify', label: 'Output Verification & Reconciliation Tests', duration: '4.5s' },
];

export const ProgressPage: React.FC<ProgressPageProps> = ({ onComplete }) => {
  const [activeStageIndex, setActiveStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStageIndex((prev) => {
        if (prev < STAGES.length - 1) {
          return prev + 1;
        } else {
          clearInterval(timer);
          setTimeout(onComplete, 800);
          return prev;
        }
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="max-w-xl mx-auto py-16 px-6">
      <div className="bg-[var(--surface)] hairline-border rounded-xs p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Cleaning in Progress</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Processing 15,000,000 rows on DuckDB engine
            </p>
          </div>
          <span className="text-xs mono font-medium text-[var(--accent)] bg-blue-50 px-2 py-0.5 rounded-xs animate-pulse">
            Executing
          </span>
        </div>

        <div className="space-y-4">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < activeStageIndex;
            const isCurrent = idx === activeStageIndex;
            return (
              <div key={stage.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] mono ${
                      isCompleted
                        ? 'bg-[var(--ok)] text-white'
                        : isCurrent
                        ? 'bg-[var(--accent)] text-white animate-pulse'
                        : 'bg-gray-100 text-[var(--text-muted)]'
                    }`}
                  >
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`${
                      isCurrent
                        ? 'font-medium text-[var(--text)]'
                        : isCompleted
                        ? 'text-[var(--text)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                <span className="mono text-[var(--text-muted)]">
                  {isCompleted ? stage.duration : isCurrent ? 'Running...' : 'Queued'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <div className="w-full bg-gray-100 h-1.5 rounded-xs overflow-hidden">
            <div
              className="bg-[var(--accent)] h-full transition-all duration-500 ease-out"
              style={{
                width: `${((activeStageIndex + 1) / STAGES.length) * 100}%`,
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};
