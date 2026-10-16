import React, { useState } from 'react';

interface ApprovalPageProps {
  onStartCleaning: () => void;
}

export const ApprovalPage: React.FC<ApprovalPageProps> = ({ onStartCleaning }) => {
  const [dayFirst, setDayFirst] = useState('day');
  const [nullStrategy, setNullStrategy] = useState('fill_median');
  const [dedupeKey, setDedupeKey] = useState('event_id');

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight">
            Review & Approve Cleaning Recipe
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Rules are restricted to the verified macro library. Free-form SQL generation is prohibited.
          </p>
        </div>
        <button
          onClick={onStartCleaning}
          className="bg-[var(--ok)] hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
        >
          <span>Approve & Execute Clean</span>
          <span className="mono text-[11px] opacity-80">(~45s)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Findings & Estimation */}
        <div className="space-y-4">
          <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-3">
              Identified Issues (4)
            </span>
            <ul className="space-y-2.5 text-xs">
              <li className="flex items-start justify-between">
                <span className="font-medium text-[var(--text)]">timestamp</span>
                <span className="text-[var(--warn)] mono">Ambiguous format</span>
              </li>
              <li className="flex items-start justify-between">
                <span className="font-medium text-[var(--text)]">duplicates</span>
                <span className="text-[var(--warn)] mono">2.5% (375k rows)</span>
              </li>
              <li className="flex items-start justify-between">
                <span className="font-medium text-[var(--text)]">session_duration</span>
                <span className="text-[var(--danger)] mono">18 negatives</span>
              </li>
              <li className="flex items-start justify-between">
                <span className="font-medium text-[var(--text)]">platform</span>
                <span className="text-[var(--text-muted)] mono">15k null tokens</span>
              </li>
            </ul>
          </div>

          <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs text-xs space-y-1.5">
            <span className="font-medium text-[var(--text)] block">Engine Execution Profile</span>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>DuckDB Memory Limit:</span>
              <span>4.0 GB</span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>CPU Threads:</span>
              <span>4 Cores</span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>Estimated Runtime:</span>
              <span className="text-[var(--text)] font-medium">~45 seconds</span>
            </div>
          </div>
        </div>

        {/* Right Column: Proposed Rules & Decision Inputs */}
        <div className="md:col-span-2 space-y-4">
          {/* Rule 1: Deduplication */}
          <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold mono text-[var(--text)]">
                Macro: dedupe(keys, keep="latest")
              </span>
              <span className="text-[11px] px-1.5 py-0.5 bg-green-50 text-[var(--ok)] rounded-xs mono">
                Verified
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Retain 1 unique row per identifier. Discard 375,000 exact duplicates.
            </p>
            <div className="text-xs space-y-1">
              <label className="text-[var(--text)] font-medium block">Partition Key:</label>
              <select
                value={dedupeKey}
                onChange={(e) => setDedupeKey(e.target.value)}
                className="w-full bg-gray-50 border border-[var(--border)] rounded-xs p-1.5 mono text-xs"
              >
                <option value="event_id">event_id (Candidate Key · 97.5% distinct)</option>
                <option value="all_columns">Entire Row (Exact match on all columns)</option>
              </select>
            </div>
          </div>

          {/* Rule 2: Timestamp Parsing with Required Confirmation */}
          <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs border-l-2 border-l-[var(--warn)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold mono text-[var(--text)]">
                Macro: parse_timestamp("timestamp")
              </span>
              <span className="text-[11px] px-1.5 py-0.5 bg-amber-50 text-[var(--warn)] rounded-xs font-medium">
                Action Required
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Values contain '/' separators where day and month are ambiguous (e.g. 05/06/2025). Please specify format precedence:
            </p>
            <div className="flex space-x-6 text-xs">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="dayFirst"
                  value="day"
                  checked={dayFirst === 'day'}
                  onChange={() => setDayFirst('day')}
                  className="text-[var(--accent)]"
                />
                <span className="mono">Day first (DD/MM/YYYY)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="dayFirst"
                  value="month"
                  checked={dayFirst === 'month'}
                  onChange={() => setDayFirst('month')}
                  className="text-[var(--accent)]"
                />
                <span className="mono">Month first (MM/DD/YYYY)</span>
              </label>
            </div>
          </div>

          {/* Rule 3: Numeric Outlier & Null Strategy */}
          <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold mono text-[var(--text)]">
                Macro: clip_outliers("session_duration_sec") & handle_nulls()
              </span>
              <span className="text-[11px] px-1.5 py-0.5 bg-green-50 text-[var(--ok)] rounded-xs mono">
                Verified
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Clamp or null negative values (&lt; 0), then apply chosen imputation strategy.
            </p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-[var(--text)] font-medium block mb-1">Null Strategy:</label>
                <select
                  value={nullStrategy}
                  onChange={(e) => setNullStrategy(e.target.value)}
                  className="w-full bg-gray-50 border border-[var(--border)] rounded-xs p-1.5 mono text-xs"
                >
                  <option value="fill_median">Fill with Median (1,800 sec)</option>
                  <option value="fill_zero">Fill with Constant (0)</option>
                  <option value="drop_row">Drop Rows with Invalid Values</option>
                </select>
              </div>
              <div>
                <label className="text-[var(--text)] font-medium block mb-1">Negative Values:</label>
                <div className="text-xs text-[var(--text-muted)] p-1.5 bg-gray-50 border border-[var(--border)] rounded-xs mono">
                  Convert to NULL &rarr; Impute
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
