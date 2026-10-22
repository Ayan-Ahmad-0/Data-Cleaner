import React, { useState } from 'react';
import { type ChartColumnStats, type PageDataOptions } from '../../lib/api';
import { Button } from '../ui/Button';
import {
  CHART_COLOR_SWATCHES,
  DEFAULT_CHART_COLOR,
} from './chartColors';
import {
  SlidersHorizontal,
  RotateCcw,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Lightbulb,
  Loader2,
  Palette,
  Check,
} from 'lucide-react';

interface DataOptionsPanelProps {
  options: PageDataOptions;
  columns: ChartColumnStats[];
  onChange: (newOptions: PageDataOptions) => void;
  onReset: () => void;
  // Suggestion tabs
  viewTab?: 'standard' | 'ai';
  onSwitchTab?: (tab: 'standard' | 'ai') => void;
  // Quick Actions
  onAutoVisualize?: () => void;
  isAutoVisualizing?: boolean;
  onOpenAdvice?: () => void;
  loadingAdvice?: boolean;
  onAddChart?: () => void;
  isAddingChart?: boolean;
  // Global Chart Color
  globalColor?: string;
  onGlobalColorChange?: (color: string) => void;
}

export const DataOptionsPanel: React.FC<DataOptionsPanelProps> = ({
  options,
  columns,
  onChange,
  onReset,
  viewTab,
  onSwitchTab,
  onAutoVisualize,
  isAutoVisualizing,
  onOpenAdvice,
  loadingAdvice,
  onAddChart,
  isAddingChart,
  globalColor,
  onGlobalColorChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
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
    <div className="bg-[var(--bg-surface)] backdrop-blur-md border border-[var(--border-hairline)] rounded-xl p-2 sm:px-3 sm:py-2 text-xs shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left Section: Suggestion Modes & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {onSwitchTab && (
            <div className="flex items-center bg-[var(--bg-subtle)] p-0.5 rounded-lg border border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => onSwitchTab('standard')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewTab === 'standard'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => onSwitchTab('ai')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewTab === 'ai'
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                AI picks
              </button>
            </div>
          )}

          {/* Subtle separator */}
          {onSwitchTab && (onAutoVisualize || onOpenAdvice || onAddChart) && (
            <div className="hidden sm:block h-4 w-px bg-[var(--border-hairline)]" />
          )}

          {/* Action Triggers */}
          <div className="flex items-center gap-1.5">
            {onAutoVisualize && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  isAutoVisualizing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  )
                }
                onClick={onAutoVisualize}
                disabled={isAutoVisualizing}
                className="text-xs h-7.5 px-2.5 font-medium"
              >
                {isAutoVisualizing ? 'Visualizing...' : 'Auto-visualize'}
              </Button>
            )}

            {onOpenAdvice && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  loadingAdvice ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  )
                }
                onClick={onOpenAdvice}
                disabled={loadingAdvice}
                className="text-xs h-7.5 px-2.5 font-medium"
              >
                Advice
              </Button>
            )}

            {onAddChart && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  isAddingChart ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )
                }
                onClick={onAddChart}
                disabled={isAddingChart}
                className="text-xs h-7.5 px-2.5 font-medium"
              >
                Add chart
              </Button>
            )}
          </div>
        </div>

        {/* Right Section: Streamlined Data Filters & Theme Color */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Global Theme Color Chip */}
          {onGlobalColorChange && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsColorMenuOpen(!isColorMenuOpen)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-all cursor-pointer select-none"
                title="Choose global chart color theme"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Theme Color</span>
                <span
                  className="w-2 h-2 rounded-full border border-black/20 dark:border-white/20 inline-block shrink-0 shadow-2xs"
                  style={{ backgroundColor: globalColor || DEFAULT_CHART_COLOR }}
                />
              </button>

              {isColorMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsColorMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-50 p-2.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xl w-48 space-y-2 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-primary)] px-0.5">
                      <span>Global Chart Color</span>
                      {globalColor && globalColor !== DEFAULT_CHART_COLOR && (
                        <button
                          type="button"
                          onClick={() => {
                            onGlobalColorChange(DEFAULT_CHART_COLOR);
                            setIsColorMenuOpen(false);
                          }}
                          className="text-[10px] text-[var(--accent)] hover:underline font-normal cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                      {CHART_COLOR_SWATCHES.map((swatch) => {
                        const activeHex = globalColor || DEFAULT_CHART_COLOR;
                        const isSelected = activeHex.toLowerCase() === swatch.hex.toLowerCase();
                        return (
                          <button
                            key={swatch.id}
                            type="button"
                            onClick={() => {
                              onGlobalColorChange(swatch.hex);
                              setIsColorMenuOpen(false);
                            }}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer relative hover:scale-105 ${
                              isSelected
                                ? 'ring-2 ring-offset-2 ring-[var(--accent)] dark:ring-offset-zinc-900 scale-105'
                                : 'hover:opacity-90'
                            }`}
                            style={{ backgroundColor: swatch.hex }}
                            title={swatch.label}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1.5 border-t border-[var(--border-hairline)]/70 flex items-center gap-2">
                      <label className="relative cursor-pointer shrink-0">
                        <input
                          type="color"
                          value={
                            globalColor && globalColor.startsWith('#') && globalColor.length === 7
                              ? globalColor
                              : '#FD4233'
                          }
                          onChange={(e) => onGlobalColorChange(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0 opacity-0 absolute inset-0"
                        />
                        <div
                          className="w-6 h-6 rounded-md border border-[var(--border-hairline)] shadow-2xs"
                          style={{ backgroundColor: globalColor || DEFAULT_CHART_COLOR }}
                        />
                      </label>
                      <input
                        type="text"
                        value={globalColor || DEFAULT_CHART_COLOR}
                        onChange={(e) => onGlobalColorChange(e.target.value)}
                        placeholder="#hex"
                        className="flex-1 text-[11px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded text-[var(--text-primary)] uppercase focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Exclude Missing Toggle Chip */}
          <button
            type="button"
            onClick={handleToggleExcludeMissing}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer select-none ${
              options.exclude_missing
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent-border)] font-semibold shadow-xs'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                options.exclude_missing ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'
              }`}
            />
            Exclude missing
          </button>

          {/* Hide Outliers Toggle Chip */}
          <button
            type="button"
            onClick={handleToggleHideOutliers}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer select-none ${
              options.hide_outliers
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent-border)] font-semibold shadow-xs'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                options.hide_outliers ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'
              }`}
            />
            Hide outliers
          </button>

          {/* Type Overrides Toggle Chip */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer select-none ${
              activeCasts.length > 0 || isExpanded
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent-border)] font-semibold'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Type overrides</span>
            {activeCasts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--accent)] text-white font-mono">
                {activeCasts.length}
              </span>
            )}
            {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>

          {/* Reset All Filters Button */}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Type Overrides Drawer */}
      {isExpanded && (
        <div className="mt-2.5 pt-2.5 border-t border-[var(--border-hairline)] space-y-2.5 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--text-secondary)] text-xs font-medium">Read column:</span>
            <select
              value={selectedCol}
              onChange={(e) => setSelectedCol(e.target.value)}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent)]"
            >
              <option value="">(Select column)</option>
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>

            <span className="text-xs text-[var(--text-muted)]">as</span>

            <select
              value={selectedCast}
              onChange={(e) => setSelectedCast(e.target.value as any)}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent)]"
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
              className="h-7 text-xs font-medium"
            >
              Apply override
            </Button>
          </div>

          {activeCasts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-hairline)]/60">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Active overrides:</span>
              {activeCasts.map(([col, castType]) => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)]"
                >
                  <code className="text-[var(--text-primary)] font-mono">{col}</code>
                  <span>→</span>
                  <span className="font-semibold text-[var(--accent)]">{castType}</span>
                  <button
                    onClick={() => handleRemoveCast(col)}
                    className="text-[var(--text-muted)] hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
                    title="Remove override"
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
