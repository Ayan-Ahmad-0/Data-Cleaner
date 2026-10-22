import React, { useState } from 'react';
import { type ChartColumnStats, type PageDataOptions } from '../../lib/api';
import { Button } from '../ui/Button';
import {
  SlidersHorizontal,
  RotateCcw,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DataOptionsPanelProps {
  options: PageDataOptions;
  columns: ChartColumnStats[];
  onChange: (newOptions: PageDataOptions) => void;
  onReset: () => void;
}

export const DataOptionsPanel: React.FC<DataOptionsPanelProps> = ({
  options,
  columns,
  onChange,
  onReset,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCol, setSelectedCol] = useState('');
  const [selectedCast, setSelectedCast] = useState<'number' | 'date' | 'timestamp' | 'text'>('date');

  const activeCasts = Object.entries(options.cast_overrides || {});
  const activeCount =
    (options.exclude_missing ? 1 : 0) +
    (options.hide_outliers ? 1 : 0) +
    activeCasts.length;

  const handleToggleExcludeMissing = () => {
    onChange({ ...options, exclude_missing: !options.exclude_missing });
  };

  const handleToggleHideOutliers = () => {
    onChange({ ...options, hide_outliers: !options.hide_outliers });
  };

  const handleAddCast = () => {
    if (!selectedCol) return;
    const updated = {
      ...options.cast_overrides,
      [selectedCol]: selectedCast,
    };
    onChange({ ...options, cast_overrides: updated });
    setSelectedCol('');
  };

  const handleRemoveCast = (col: string) => {
    const updated = { ...options.cast_overrides };
    delete updated[col];
    onChange({ ...options, cast_overrides: updated });
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[var(--radius-lg)] p-3 sm:p-4 text-xs shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-semibold text-[var(--text-primary)]">Page-Wide Data Options</span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold text-[11px] border border-[var(--accent-border)]">
              {activeCount} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Toggles */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.exclude_missing}
              onChange={handleToggleExcludeMissing}
              className="accent-[var(--accent)] rounded"
            />
            <span className="text-[var(--text-secondary)] font-medium">Exclude missing</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.hide_outliers}
              onChange={handleToggleHideOutliers}
              className="accent-[var(--accent)] rounded"
            />
            <span className="text-[var(--text-secondary)] font-medium">Hide outliers (1st–99th%)</span>
          </label>

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="w-3 h-3" />}
              onClick={onReset}
              className="text-[11px] h-7 px-2"
            >
              Reset all
            </Button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
            title={isExpanded ? 'Collapse cast overrides' : 'Expand cast overrides'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Active cast pills summary */}
      {activeCasts.length > 0 && !isExpanded && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-2 border-t border-[var(--border-hairline)]">
          <span className="text-[11px] text-[var(--text-muted)]">Casts:</span>
          {activeCasts.map(([col, castType]) => (
            <span
              key={col}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)]"
            >
              <code className="text-[var(--text-primary)]">{col}</code> → {castType}
              <button
                onClick={() => handleRemoveCast(col)}
                className="hover:text-red-500 transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Expanded Cast Overrides Form */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border-hairline)] space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--text-secondary)] font-medium">Add read-as override:</span>
            <select
              value={selectedCol}
              onChange={(e) => setSelectedCol(e.target.value)}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2 py-1 text-xs"
            >
              <option value="">(Select column)</option>
              {columns.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
              ))}
            </select>

            <span>read as</span>

            <select
              value={selectedCast}
              onChange={(e) => setSelectedCast(e.target.value as any)}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2 py-1 text-xs"
            >
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="timestamp">Timestamp</option>
              <option value="text">Text</option>
            </select>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleAddCast}
              disabled={!selectedCol}
              className="h-7 text-xs"
            >
              Add
            </Button>
          </div>

          {activeCasts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Active cast overrides:</span>
              {activeCasts.map(([col, castType]) => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)]"
                >
                  <code className="text-[var(--text-primary)] font-mono">{col}</code>
                  <span>→</span>
                  <span className="font-semibold text-[var(--accent)]">{castType}</span>
                  <button
                    onClick={() => handleRemoveCast(col)}
                    className="text-[var(--text-muted)] hover:text-red-500 transition-colors ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
