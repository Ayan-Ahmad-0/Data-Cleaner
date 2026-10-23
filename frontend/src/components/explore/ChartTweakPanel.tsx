import React, { useEffect, useState } from 'react';
import {
  type ChartColumnStats,
  type ChartSpec,
  type FieldRef,
  type Filter,
  type TweakOptionsResponse,
  getTweakOptions,
} from '../../lib/api';
import { Button } from '../ui/Button';
import {
  Sliders,
  X,
  RotateCcw,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import { CHART_COLOR_SWATCHES, DEFAULT_CHART_COLOR } from './chartColors';

interface ChartTweakPanelProps {
  jobId: string;
  initialSpec: ChartSpec;
  originalSpec: ChartSpec;
  columns: ChartColumnStats[];
  isOpen: boolean;
  onClose: () => void;
  onApply: (updatedSpec: ChartSpec) => void;
  onReset: () => void;
}

const CHART_TYPES: { id: ChartSpec['chart_type']; label: string }[] = [
  { id: 'bar', label: 'Bar' },
  { id: 'hbar', label: 'H-Bar' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'histogram', label: 'Histogram' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'pie', label: 'Pie' },
  { id: 'box', label: 'Box' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'big_number', label: 'Metric' },
];

const AGGREGATIONS = [
  { id: 'count', label: 'Count' },
  { id: 'count_distinct', label: 'Count Distinct' },
  { id: 'sum', label: 'Sum' },
  { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
  { id: 'median', label: 'Median' },
  { id: 'none', label: 'None' },
];

const TIME_BUCKETS = ['day', 'week', 'month', 'quarter', 'year', 'hour', 'hour_of_day', 'day_of_week'];

export const ChartTweakPanel: React.FC<ChartTweakPanelProps> = ({
  jobId,
  initialSpec,
  originalSpec,
  columns,
  isOpen,
  onClose,
  onApply,
  onReset,
}) => {
  const [spec, setSpec] = useState<ChartSpec>(initialSpec);
  const [tweakOptions, setTweakOptions] = useState<TweakOptionsResponse | null>(null);

  useEffect(() => {
    setSpec(initialSpec);
  }, [initialSpec]);

  useEffect(() => {
    if (isOpen) {
      getTweakOptions(jobId, spec)
        .then((opts) => setTweakOptions(opts))
        .catch((err) => console.error('Failed to load tweak options:', err));
    }
  }, [isOpen, jobId, spec]);

  const handleApply = () => {
    let sanitized = { ...spec };
    if (sanitized.chart_type === 'pie') {
      sanitized.top_n = Math.min(sanitized.top_n || 6, 6);
      if (sanitized.aggregation === 'none') {
        sanitized.aggregation = 'count';
      }
    }
    onApply(sanitized);
    onClose();
  };

  const isEdited = JSON.stringify(spec) !== JSON.stringify(originalSpec);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleApply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, spec]);

  const handleChartTypeChange = (chartType: ChartSpec['chart_type']) => {
    let newTopN = spec.top_n;
    let newAgg = spec.aggregation;
    if (chartType === 'pie') {
      newTopN = Math.min(newTopN || 6, 6);
      if (newAgg === 'none') {
        newAgg = 'count';
      }
    }
    const updated = { ...spec, chart_type: chartType, top_n: newTopN, aggregation: newAgg };
    setSpec(updated);
    // Refresh options for disabled aggregations
    getTweakOptions(jobId, updated).then(setTweakOptions).catch(() => {});
  };

  const handleColumnChange = (role: 'x' | 'y' | 'color', colName: string) => {
    const field: FieldRef | undefined = colName ? { column: colName } : undefined;
    const updated = { ...spec, [role]: field };
    setSpec(updated);
    getTweakOptions(jobId, updated).then(setTweakOptions).catch(() => {});
  };

  const handleCastChange = (role: 'x' | 'y', castAs: any) => {
    const current = spec[role];
    if (!current) return;
    const updated = {
      ...spec,
      [role]: { ...current, cast_as: castAs || undefined },
    };
    setSpec(updated);
  };

  const handleTimeBucketChange = (bucket: any) => {
    if (!spec.x) return;
    setSpec({
      ...spec,
      x: { ...spec.x, time_bucket: bucket || undefined },
    });
  };

  const handleAddFilter = () => {
    if ((spec.filters || []).length >= 10) return;
    const firstCol = columns[0]?.name || '';
    const newFilters: Filter[] = [...(spec.filters || []), { column: firstCol, op: '=', value: '' }];
    setSpec({ ...spec, filters: newFilters });
  };

  const handleRemoveFilter = (index: number) => {
    const newFilters = (spec.filters || []).filter((_, i) => i !== index);
    setSpec({ ...spec, filters: newFilters });
  };

  const handleFilterChange = (index: number, key: keyof Filter, val: any) => {
    const newFilters = [...(spec.filters || [])];
    newFilters[index] = { ...newFilters[index], [key]: val };
    setSpec({ ...spec, filters: newFilters });
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-[var(--radius-xl)] shadow-2xl w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">Tweak Chart</h3>
                {isEdited && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)] uppercase tracking-wide">
                    Modified
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] truncate hidden sm:block">
                Modify chart type, axes, aggregation, and filters.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="text-xs font-medium cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Check className="w-3.5 h-3.5" />}
              onClick={handleApply}
              className="text-xs font-semibold shadow-xs cursor-pointer"
            >
              Apply Changes
            </Button>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content form */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-6 text-xs sm:text-sm custom-scrollbar">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Chart Title
            </label>
            <input
              type="text"
              value={spec.title || ''}
              maxLength={120}
              placeholder="Enter chart title..."
              onChange={(e) => setSpec({ ...spec, title: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-hidden"
            />
          </div>

          {/* Chart Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Chart Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {CHART_TYPES.map((ct) => {
                const disabledReason = tweakOptions?.disabled_chart_types?.[ct.id];
                const isSelected = spec.chart_type === ct.id;
                return (
                  <button
                    key={ct.id}
                    disabled={!!disabledReason}
                    title={disabledReason || ct.label}
                    onClick={() => handleChartTypeChange(ct.id)}
                    className={`py-2 px-2.5 rounded-[var(--radius-md)] text-xs font-medium border text-center transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                        : disabledReason
                        ? 'border-[var(--border-hairline)] bg-[var(--bg-app)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart Color / Accent */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Chart Color / Accent
              </label>
              {spec.custom_color && (
                <button
                  type="button"
                  onClick={() => setSpec({ ...spec, custom_color: null })}
                  className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Reset to default
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 p-2.5 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)]">
              {CHART_COLOR_SWATCHES.map((swatch) => {
                const currentHex = spec.custom_color || DEFAULT_CHART_COLOR;
                const isSelected = currentHex.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => setSpec({ ...spec, custom_color: swatch.hex })}
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer relative hover:scale-105 ${
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

              <div className="h-5 w-px bg-[var(--border-hairline)] mx-1" />

              {/* Custom Color Input */}
              <label className="relative cursor-pointer flex items-center gap-1.5">
                <input
                  type="color"
                  value={
                    spec.custom_color && spec.custom_color.startsWith('#') && spec.custom_color.length === 7
                      ? spec.custom_color
                      : '#FD4233'
                  }
                  onChange={(e) => setSpec({ ...spec, custom_color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border-0 p-0 opacity-0 absolute inset-0"
                />
                <div
                  className="w-6 h-6 rounded-md border border-[var(--border-hairline)] shadow-2xs"
                  style={{ backgroundColor: spec.custom_color || DEFAULT_CHART_COLOR }}
                />
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  {spec.custom_color || 'Default'}
                </span>
              </label>
            </div>
          </div>

          {/* Axes & Columns Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* X Axis */}
            {spec.chart_type !== 'big_number' && (
              <div className="space-y-1.5 p-3 rounded-[var(--radius-lg)] bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-xs text-[var(--text-primary)]">X Axis Column</label>
                  {spec.x && (
                    <select
                      value={spec.x.cast_as || ''}
                      onChange={(e) => handleCastChange('x', e.target.value)}
                      className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-1.5 py-0.5 text-[var(--text-secondary)]"
                    >
                      <option value="">Default type</option>
                      <option value="number">Read as Number</option>
                      <option value="date">Read as Date</option>
                      <option value="timestamp">Read as Timestamp</option>
                      <option value="text">Read as Text</option>
                    </select>
                  )}
                </div>
                <select
                  value={spec.x?.column || ''}
                  onChange={(e) => handleColumnChange('x', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] text-xs"
                >
                  <option value="">(Select column)</option>
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type}) {c.null_pct > 0 ? `· ${c.null_pct}% null` : ''}
                    </option>
                  ))}
                </select>

                {/* Time bucket option if date or line/area */}
                {(spec.chart_type === 'line' || spec.chart_type === 'area' || spec.x?.cast_as === 'date') && (
                  <div className="pt-2 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-secondary)]">Time bucket:</span>
                    <select
                      value={spec.x?.time_bucket || ''}
                      onChange={(e) => handleTimeBucketChange(e.target.value)}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-2 py-0.5 text-[11px]"
                    >
                      <option value="">None (exact)</option>
                      {TIME_BUCKETS.map((tb) => (
                        <option key={tb} value={tb}>{tb}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Y Axis */}
            {spec.chart_type !== 'histogram' && (
              <div className="space-y-1.5 p-3 rounded-[var(--radius-lg)] bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-xs text-[var(--text-primary)]">Y Axis Column</label>
                  {spec.y && (
                    <select
                      value={spec.y.cast_as || ''}
                      onChange={(e) => handleCastChange('y', e.target.value)}
                      className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-1.5 py-0.5 text-[var(--text-secondary)]"
                    >
                      <option value="">Default type</option>
                      <option value="number">Read as Number</option>
                      <option value="text">Read as Text</option>
                    </select>
                  )}
                </div>
                <select
                  value={spec.y?.column || ''}
                  onChange={(e) => handleColumnChange('y', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] text-xs"
                >
                  <option value="">(None / Row Count)</option>
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type}) {c.null_pct > 0 ? `· ${c.null_pct}% null` : ''}
                    </option>
                  ))}
                </select>

                {/* Aggregation */}
                <div className="pt-2 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]">Aggregation:</span>
                  <select
                    value={spec.aggregation}
                    onChange={(e) => setSpec({ ...spec, aggregation: e.target.value as any })}
                    className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-2 py-0.5 text-[11px]"
                  >
                    {AGGREGATIONS.map((a) => {
                      const disabledReason = tweakOptions?.disabled_aggregations?.[a.id];
                      return (
                        <option key={a.id} value={a.id} disabled={!!disabledReason}>
                          {a.label} {disabledReason ? '(!)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Grouping / Bins / Top N */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Color / Grouping */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">Color / Grouping</label>
              <select
                value={spec.color?.column || ''}
                onChange={(e) => handleColumnChange('color', e.target.value)}
                className="w-full px-2 py-1 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded text-xs"
              >
                <option value="">(None)</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Top N */}
            {(spec.chart_type === 'bar' || spec.chart_type === 'hbar' || spec.chart_type === 'pie') && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--text-secondary)]">Top N items</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={spec.top_n || 20}
                  onChange={(e) => setSpec({ ...spec, top_n: parseInt(e.target.value) || 20 })}
                  className="w-full px-2 py-1 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded text-xs"
                />
              </div>
            )}

            {/* Sort */}
            {spec.chart_type !== 'big_number' && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--text-secondary)]">Sort Order</label>
                <select
                  value={spec.sort}
                  onChange={(e) => setSpec({ ...spec, sort: e.target.value as any })}
                  className="w-full px-2 py-1 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded text-xs"
                >
                  <option value="y_desc">Highest first (Y Desc)</option>
                  <option value="y_asc">Lowest first (Y Asc)</option>
                  <option value="x">Category / Date (X)</option>
                </select>
              </div>
            )}
          </div>

          {/* Filters List */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Filters ({(spec.filters || []).length}/10)
              </span>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleAddFilter}
                disabled={(spec.filters || []).length >= 10}
                className="text-[11px] py-1 h-7"
              >
                Add Filter
              </Button>
            </div>

            {(spec.filters || []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">No filters applied to this chart.</p>
            ) : (
              <div className="space-y-2">
                {(spec.filters || []).map((flt, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-[var(--bg-app)] p-2 rounded-[var(--radius-md)] border border-[var(--border-hairline)]">
                    <select
                      value={flt.column}
                      onChange={(e) => handleFilterChange(idx, 'column', e.target.value)}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-2 py-1 text-xs max-w-[130px]"
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>

                    <select
                      value={flt.op}
                      onChange={(e) => handleFilterChange(idx, 'op', e.target.value)}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-1.5 py-1 text-xs"
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="not_null">Not Null</option>
                      <option value="is_null">Is Null</option>
                    </select>

                    {flt.op !== 'not_null' && flt.op !== 'is_null' && (
                      <input
                        type="text"
                        value={String(flt.value ?? '')}
                        placeholder="Value..."
                        onChange={(e) => handleFilterChange(idx, 'value', e.target.value)}
                        className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-2 py-1 text-xs"
                      />
                    )}

                    <button
                      onClick={() => handleRemoveFilter(idx)}
                      className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] sticky bottom-0 z-10">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => {
                setSpec(originalSpec);
                onReset();
              }}
              disabled={!isEdited}
              className="text-xs"
            >
              Reset to Original
            </Button>
            {isEdited && (
              <span className="text-[11px] text-[var(--text-muted)] font-mono hidden sm:inline">
                Unsaved changes
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="secondary" size="sm" onClick={onClose} className="text-xs font-medium">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Check className="w-3.5 h-3.5" />}
              onClick={handleApply}
              className="text-xs font-semibold px-4 shadow-xs"
            >
              Apply Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
