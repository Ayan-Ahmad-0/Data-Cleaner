import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type ChartColumnStats,
  type ChartSpec,
  type FieldRef,
  type Filter,
  type TweakOptionsResponse,
  type PageDataOptions,
  type ValidateFormulaResponse,
  type TrendlineType,
  type TrendlineLineStyle,
  getTweakOptions,
  validateFormula,
} from '../../lib/api';
import { Button } from '../ui/Button';
import {
  Sliders,
  X,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Calculator,
  Code2,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import {
  getDefaultChartColor,
} from './chartColors';
import { ChartColorPicker } from './ChartColorPicker';

interface ChartTweakPanelProps {
  jobId: string;
  initialSpec: ChartSpec;
  originalSpec: ChartSpec;
  columns: ChartColumnStats[];
  pageOptions?: PageDataOptions;
  onUpdatePageOptions?: (opts: PageDataOptions) => void;
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
  { id: 'donut', label: 'Donut' },
  { id: 'box', label: 'Box' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'big_number', label: 'Metric' },
];

export const isNumericCol = (c?: ChartColumnStats | null): boolean => {
  if (!c) return false;
  return c.kind === 'numeric' || /(int|float|double|decimal|num|real)/i.test(c.type);
};

export function adaptSpecForChartType(
  current: ChartSpec,
  targetType: ChartSpec['chart_type'],
  columns: ChartColumnStats[]
): ChartSpec {
  const colMap = new Map<string, ChartColumnStats>();
  columns.forEach((c) => colMap.set(c.name, c));

  const numCols = columns.filter((c) => isNumericCol(c));
  const catCols = columns.filter((c) => !isNumericCol(c));
  const firstNum = numCols[0]?.name;
  const secondNum = numCols[1]?.name || firstNum;
  const firstCat = catCols[0]?.name || columns[0]?.name;
  const allCols = columns.map((c) => c.name);

  const updated: ChartSpec = { ...current, chart_type: targetType };

  if (targetType === 'box') {
    // Box plot requires a numeric Y axis column. X is optional category group.
    const currentYIsNum = current.y && (current.y.cast_as === 'number' || isNumericCol(colMap.get(current.y.column)));
    const currentXIsNum = current.x && (current.x.cast_as === 'number' || isNumericCol(colMap.get(current.x.column)));

    if (currentYIsNum) {
      updated.y = current.y;
    } else if (currentXIsNum) {
      updated.y = current.x;
      updated.x = undefined;
    } else if (firstNum) {
      updated.y = { column: firstNum };
    }

    if (updated.x && updated.y && updated.x.column === updated.y.column) {
      updated.x = undefined;
    }
    updated.aggregation = 'none';
  } else if (targetType === 'heatmap') {
    // Heatmap requires both X and Y axis columns.
    if (!updated.x && allCols.length > 0) {
      updated.x = { column: allCols[0] };
    }
    if (!updated.y || (updated.x && updated.y.column === updated.x.column)) {
      const distinctCol = allCols.find((c) => !updated.x || c !== updated.x.column) || allCols[0];
      if (distinctCol) {
        updated.y = { column: distinctCol };
      }
    }
    updated.aggregation = 'count';
  } else if (targetType === 'scatter') {
    // Scatter requires both X and Y to be numeric.
    const currentXIsNum = current.x && (current.x.cast_as === 'number' || isNumericCol(colMap.get(current.x.column)));
    const currentYIsNum = current.y && (current.y.cast_as === 'number' || isNumericCol(colMap.get(current.y.column)));

    if (!currentXIsNum && firstNum) {
      updated.x = { column: firstNum };
    }
    if (!currentYIsNum) {
      if (secondNum && (!updated.x || secondNum !== updated.x.column)) {
        updated.y = { column: secondNum };
      } else if (firstNum) {
        updated.y = { column: firstNum };
      }
    }
    updated.aggregation = 'none';
  } else if (targetType === 'histogram') {
    // Histogram requires numeric X, no Y.
    const currentXIsNum = current.x && (current.x.cast_as === 'number' || isNumericCol(colMap.get(current.x.column)));
    const currentYIsNum = current.y && (current.y.cast_as === 'number' || isNumericCol(colMap.get(current.y.column)));

    if (currentXIsNum) {
      updated.x = current.x;
    } else if (currentYIsNum) {
      updated.x = current.y;
    } else if (firstNum) {
      updated.x = { column: firstNum };
    }
    updated.y = undefined;
    updated.aggregation = 'count';
  } else if (targetType === 'pie' || targetType === 'donut') {
    updated.top_n = Math.min(updated.top_n || 6, 6);
    if (!updated.x && (firstCat || allCols[0])) {
      updated.x = { column: firstCat || allCols[0] };
    }
    if (updated.aggregation === 'none') {
      updated.aggregation = 'count';
    }
  } else if (targetType === 'big_number') {
    updated.x = undefined;
    if (updated.aggregation === 'none') {
      updated.aggregation = 'count';
    }
    if (!updated.y && firstNum) {
      const firstNumCol = colMap.get(firstNum);
      const castAs = firstNumCol && !isNumericCol(firstNumCol) ? 'number' : undefined;
      updated.y = { column: firstNum, cast_as: castAs };
    }
  } else if (targetType === 'bar' || targetType === 'hbar') {
    if (!updated.x && (firstCat || allCols[0])) {
      updated.x = { column: firstCat || allCols[0] };
    }
    if (updated.aggregation === 'none') {
      updated.aggregation = 'count';
    }
  } else if (targetType === 'line' || targetType === 'area') {
    if (!updated.x) {
      const dtCol = columns.find((c) => c.kind === 'datetime' || /date|time/i.test(c.type));
      updated.x = { column: dtCol ? dtCol.name : (allCols[0] || ''), time_bucket: 'week' };
    } else if (!updated.x.time_bucket) {
      updated.x = { ...updated.x, time_bucket: 'week' };
    }
    if (updated.aggregation === 'none') {
      updated.aggregation = 'count';
    }
  }

  return updated;
}

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

const TIME_BUCKETS = ['week', 'day', 'month', 'quarter', 'year', 'hour', 'hour_of_day', 'day_of_week'];

const FORMULA_PRESETS = [
  { label: 'Difference (A - B)', template: 'col1 - col2' },
  { label: 'Ratio % ((A / B) * 100)', template: '(col1 * 1.0 / NULLIF(col2, 0)) * 100' },
  { label: 'Multiplication (A * B)', template: 'col1 * col2' },
  { label: 'Margin % ((A - B) / A * 100)', template: '((col1 - col2) * 1.0 / NULLIF(col1, 0)) * 100' },
  { label: 'Rounded Average ROUND(A, 2)', template: 'ROUND(col1, 2)' },
];

export const ChartTweakPanel: React.FC<ChartTweakPanelProps> = ({
  jobId,
  initialSpec,
  originalSpec,
  columns,
  pageOptions,
  onUpdatePageOptions,
  isOpen,
  onClose,
  onApply,
  onReset,
}) => {
  const [spec, setSpec] = useState<ChartSpec>(initialSpec);
  const [tweakOptions, setTweakOptions] = useState<TweakOptionsResponse | null>(null);

  // Custom Formula / Metric Builder State
  const [metricMode, setMetricMode] = useState<'column' | 'formula'>(
    initialSpec.y?.formula ? 'formula' : 'column'
  );
  const [formulaName, setFormulaName] = useState(initialSpec.y?.column || 'Custom Metric');
  const [formulaExpr, setFormulaExpr] = useState(initialSpec.y?.formula || '');
  const [saveToPage, setSaveToPage] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidateFormulaResponse | null>(null);

  useEffect(() => {
    setSpec(initialSpec);
    if (initialSpec.y?.formula) {
      setMetricMode('formula');
      setFormulaName(initialSpec.y.column || 'Custom Metric');
      setFormulaExpr(initialSpec.y.formula);
    } else {
      setMetricMode('column');
      setFormulaName('Custom Metric');
      setFormulaExpr('');
      setValidationResult(null);
    }
  }, [initialSpec, isOpen]);

  // Debounced DuckDB Formula Validation
  useEffect(() => {
    if (metricMode !== 'formula' || !formulaExpr.trim() || !isOpen) {
      setValidationResult(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    const timer = setTimeout(() => {
      validateFormula(jobId, formulaExpr.trim(), formulaName)
        .then((res) => {
          setValidationResult(res);
          setIsValidating(false);
        })
        .catch((err) => {
          setValidationResult({ valid: false, error: err.message });
          setIsValidating(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [formulaExpr, formulaName, metricMode, jobId, isOpen]);

  const insertTokenIntoFormula = (token: string) => {
    setFormulaExpr((prev) => (prev ? `${prev} ${token}` : token));
  };

  const handleApplyPreset = (preset: typeof FORMULA_PRESETS[0]) => {
    const numCols = columns.filter((c) => isNumericCol(c)).map((c) => `"${c.name}"`);
    const c1 = numCols[0] || '"col_a"';
    const c2 = numCols[1] || numCols[0] || '"col_b"';
    const filled = preset.template.replace(/col1/g, c1).replace(/col2/g, c2);
    setFormulaExpr(filled);
    if (!formulaName || formulaName === 'Custom Metric') {
      setFormulaName(preset.label.split(' ')[0]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      getTweakOptions(jobId, spec)
        .then((opts) => setTweakOptions(opts))
        .catch((err) => console.error('Failed to load tweak options:', err));
    }
  }, [isOpen, jobId, spec]);

  const handleApply = () => {
    let currentSpec = { ...spec };
    if (metricMode === 'formula' && formulaExpr.trim()) {
      const colLabel = formulaName.trim() || 'Custom Metric';
      const hasAgg = /(SUM|AVG|MEDIAN|COUNT|MIN|MAX)\s*\(/i.test(formulaExpr);
      currentSpec = {
        ...currentSpec,
        y: {
          column: colLabel,
          formula: formulaExpr.trim(),
        },
        aggregation: hasAgg ? 'none' : currentSpec.aggregation === 'none' ? 'sum' : currentSpec.aggregation,
      };

      if (saveToPage && onUpdatePageOptions && pageOptions) {
        onUpdatePageOptions({
          ...pageOptions,
          calculated_columns: {
            ...(pageOptions.calculated_columns || {}),
            [colLabel]: formulaExpr.trim(),
          },
        });
      }
    }

    let sanitized = adaptSpecForChartType(currentSpec, currentSpec.chart_type, columns);
    if (sanitized.y && !sanitized.y.formula && (sanitized.aggregation === 'sum' || sanitized.aggregation === 'avg' || sanitized.aggregation === 'median')) {
      const colObj = columns.find((c) => c.name === sanitized.y?.column);
      if (colObj && !isNumericCol(colObj) && !sanitized.y.cast_as) {
        sanitized = {
          ...sanitized,
          y: { ...sanitized.y, cast_as: 'number' },
        };
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
    const updated = adaptSpecForChartType(spec, chartType, columns);
    setSpec(updated);
    // Refresh options for disabled aggregations
    getTweakOptions(jobId, updated).then(setTweakOptions).catch(() => {});
  };

  const handleColumnChange = (role: 'x' | 'y' | 'color', colName: string) => {
    let field: FieldRef | undefined = colName ? { column: colName } : undefined;
    if (field && role === 'x' && (spec.chart_type === 'line' || spec.chart_type === 'area')) {
      const colObj = columns.find((c) => c.name === colName);
      if (colObj && (colObj.kind === 'datetime' || /date|time/i.test(colObj.type))) {
        field = { ...field, time_bucket: 'week' };
      }
    }
    if (field && role === 'y' && (spec.aggregation === 'sum' || spec.aggregation === 'avg' || spec.aggregation === 'median')) {
      const colObj = columns.find((c) => c.name === colName);
      if (colObj && !isNumericCol(colObj)) {
        field = { ...field, cast_as: 'number' };
      }
    }
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

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      style={{ zIndex: 9999 }}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
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

          {/* Axes & Columns Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* X Axis */}
            {spec.chart_type !== 'big_number' && (
              <div className="space-y-1.5 p-3 rounded-[var(--radius-lg)] bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-xs text-[var(--text-primary)]">
                    {spec.chart_type === 'box'
                      ? 'X Axis (Category - Optional)'
                      : spec.chart_type === 'heatmap'
                      ? 'X Axis Column (Required)'
                      : spec.chart_type === 'scatter'
                      ? 'X Axis Column (Numeric Required)'
                      : spec.chart_type === 'histogram'
                      ? 'Numeric Column (X)'
                      : 'X Axis Column'}
                  </label>
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
                  <option value="">{spec.chart_type === 'box' ? '(None / All Data)' : '(Select column)'}</option>
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

            {/* Y Axis / Metric Builder */}
            {spec.chart_type !== 'histogram' && (
              <div className="space-y-3 p-3.5 rounded-[var(--radius-lg)] bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                {/* Header with Mode Switcher */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="font-semibold text-xs text-[var(--text-primary)] truncate">
                      {spec.chart_type === 'box'
                        ? 'Y Axis Column'
                        : spec.chart_type === 'heatmap'
                        ? 'Y Axis Column'
                        : spec.chart_type === 'scatter'
                        ? 'Y Axis Column'
                        : 'Metric / Y Axis'}
                    </label>
                    {spec.y?.formula && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-400 font-semibold border border-indigo-500/25 shrink-0">
                        fx formula
                      </span>
                    )}
                  </div>

                  {/* Mode Switcher Tabs */}
                  <div className="flex items-center p-0.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-hairline)] shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setMetricMode('column');
                        if (spec.y?.formula) {
                          setSpec({ ...spec, y: { column: columns[0]?.name || '' } });
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        metricMode === 'column'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      Column
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMetricMode('formula');
                        if (!formulaExpr) {
                          const numCols = columns.filter((c) => isNumericCol(c));
                          const c1 = numCols[0]?.name ? `"${numCols[0].name}"` : '"col_a"';
                          const c2 = numCols[1]?.name ? `"${numCols[1].name}"` : '"col_b"';
                          setFormulaName('Calculated Metric');
                          setFormulaExpr(`${c1} - ${c2}`);
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                        metricMode === 'formula'
                          ? 'bg-[var(--bg-surface)] text-indigo-400 shadow-2xs font-semibold'
                          : 'text-[var(--text-muted)] hover:text-indigo-400'
                      }`}
                    >
                      <Calculator className="w-3 h-3 text-indigo-400" />
                      <span>Formula (fx)</span>
                    </button>
                  </div>
                </div>

                {metricMode === 'column' ? (
                  /* Standard Column Selection */
                  <div className="space-y-2">
                    <select
                      value={spec.y?.column || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const savedCalc = pageOptions?.calculated_columns?.[val];
                        if (savedCalc) {
                          setSpec({ ...spec, y: { column: val, formula: savedCalc } });
                        } else {
                          handleColumnChange('y', val);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] text-xs"
                    >
                      <option value="">
                        {spec.chart_type === 'box' || spec.chart_type === 'heatmap' || spec.chart_type === 'scatter'
                          ? '(Select column)'
                          : '(None / Row Count)'}
                      </option>
                      {pageOptions?.calculated_columns && Object.keys(pageOptions.calculated_columns).length > 0 && (
                        <optgroup label="Calculated Formulas (fx)">
                          {Object.entries(pageOptions.calculated_columns).map(([name, form]) => (
                            <option key={`calc_${name}`} value={name}>
                              fx {name} = {form}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Dataset Columns">
                        {columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.type}) {c.null_pct > 0 ? `· ${c.null_pct}% null` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    {/* Aggregation */}
                    {spec.chart_type !== 'box' && spec.chart_type !== 'scatter' && (
                      <div className="pt-1 flex items-center justify-between text-[11px]">
                        <span className="text-[var(--text-secondary)]">Aggregation:</span>
                        <select
                          value={spec.aggregation}
                          onChange={(e) => {
                            const newAgg = e.target.value as any;
                            let updatedY = spec.y ? { ...spec.y } : undefined;
                            if (updatedY && (newAgg === 'sum' || newAgg === 'avg' || newAgg === 'median')) {
                              const colObj = columns.find((c) => c.name === updatedY?.column);
                              if (colObj && !isNumericCol(colObj) && !updatedY.cast_as) {
                                updatedY = { ...updatedY, cast_as: 'number' };
                              }
                            }
                            setSpec({ ...spec, aggregation: newAgg, y: updatedY });
                          }}
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
                    )}
                    {spec.chart_type === 'box' && (
                      <div className="pt-1 text-[11px] text-[var(--text-muted)] italic">
                        Five-number summary (min, Q1, median, Q3, max)
                      </div>
                    )}
                    {spec.chart_type === 'scatter' && (
                      <div className="pt-1 text-[11px] text-[var(--text-muted)] italic">
                        Sampled data points (no aggregation)
                      </div>
                    )}
                  </div>
                ) : (
                  /* Custom Formula & Metric Builder */
                  <div className="space-y-3 pt-1 border-t border-[var(--border-hairline)]/60">
                    {/* Metric Name */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--text-secondary)] flex items-center justify-between">
                        <span>Metric Label</span>
                        <span className="text-[10px] text-[var(--text-muted)]">Shown on axis & tooltips</span>
                      </label>
                      <input
                        type="text"
                        value={formulaName}
                        onChange={(e) => setFormulaName(e.target.value)}
                        placeholder="e.g. Net Profit, Conversion Rate, Margin"
                        className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-hidden"
                      />
                    </div>

                    {/* Formula Editor */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                          <Code2 className="w-3 h-3 text-indigo-400" />
                          <span>Formula Expression (SQL / DuckDB)</span>
                        </label>
                        {/* Quick Presets Dropdown */}
                        <select
                          onChange={(e) => {
                            const p = FORMULA_PRESETS.find((x) => x.label === e.target.value);
                            if (p) handleApplyPreset(p);
                            e.target.value = '';
                          }}
                          defaultValue=""
                          className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded px-1.5 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                        >
                          <option value="" disabled>Insert formula preset...</option>
                          {FORMULA_PRESETS.map((p) => (
                            <option key={p.label} value={p.label}>{p.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="relative">
                        <textarea
                          rows={2}
                          value={formulaExpr}
                          onChange={(e) => setFormulaExpr(e.target.value)}
                          placeholder='e.g. "revenue" - "cost" or ("orders" * 1.0 / NULLIF("visits", 0)) * 100'
                          className="w-full px-2.5 py-2 font-mono text-xs bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] text-[var(--text-primary)] focus:border-indigo-400 focus:outline-hidden leading-relaxed resize-y"
                        />
                      </div>

                      {/* Quick Insert Column Chips */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-[var(--text-muted)] block">Click to insert column into formula:</span>
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar p-1 rounded bg-[var(--bg-app)] border border-[var(--border-hairline)]/50">
                          {columns.map((c) => (
                            <button
                              key={`chip_${c.name}`}
                              type="button"
                              onClick={() => insertTokenIntoFormula(`"${c.name}"`)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                              title={`Insert "${c.name}" (${c.type})`}
                            >
                              + {c.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Real-time Validation Status */}
                      <div className="pt-0.5">
                        {isValidating ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                            <span>Validating formula syntax in DuckDB...</span>
                          </div>
                        ) : validationResult?.valid ? (
                          <div className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <span className="flex items-center gap-1 font-medium">
                              <Check className="w-3 h-3 text-emerald-500" />
                              Valid expression ({validationResult.inferred_type})
                            </span>
                            {validationResult.sample_result !== null && (
                              <span className="font-mono text-[10px] opacity-90">
                                Sample: {String(validationResult.sample_result)}
                              </span>
                            )}
                          </div>
                        ) : validationResult?.error ? (
                          <div className="text-[11px] px-2 py-1 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 leading-tight">
                            <span className="font-semibold">Error: </span>
                            <span>{validationResult.error}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Save to Page Options Checkbox */}
                      <label className="flex items-center gap-2 pt-1 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveToPage}
                          onChange={(e) => setSaveToPage(e.target.checked)}
                          className="rounded text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                        />
                        <span>Save as reusable calculated metric across all charts</span>
                      </label>
                    </div>
                  </div>
                )}
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
            {(spec.chart_type === 'bar' || spec.chart_type === 'hbar' || spec.chart_type === 'pie' || spec.chart_type === 'donut') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {spec.chart_type === 'pie' || spec.chart_type === 'donut' ? 'Max slices (max 6)' : 'Top N items'}
                  </label>
                  {(spec.chart_type === 'pie' || spec.chart_type === 'donut') && (
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">1–6</span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  max={spec.chart_type === 'pie' || spec.chart_type === 'donut' ? 6 : 50}
                  value={
                    spec.chart_type === 'pie' || spec.chart_type === 'donut'
                      ? Math.min(spec.top_n || 6, 6)
                      : (spec.top_n || 20)
                  }
                  onChange={(e) => {
                    const maxAllowed = spec.chart_type === 'pie' || spec.chart_type === 'donut' ? 6 : 50;
                    const parsed = parseInt(e.target.value) || 1;
                    const clamped = Math.min(Math.max(parsed, 1), maxAllowed);
                    setSpec({ ...spec, top_n: clamped });
                  }}
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

          {/* Trendline & Moving Averages (for Line, Area, Scatter) */}
          {['line', 'area', 'scatter'].includes(spec.chart_type) && (
            <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Trendlines & Moving Averages (SMA)
                  </label>
                </div>
                {spec.trendline && spec.trendline.type !== 'none' && (
                  <button
                    type="button"
                    onClick={() => setSpec({ ...spec, trendline: null })}
                    className="text-[11px] text-[var(--text-muted)] hover:text-red-400 cursor-pointer"
                  >
                    Clear trendline
                  </button>
                )}
              </div>

              {/* Type Segmented Buttons */}
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--bg-app)] rounded-[var(--radius-md)] border border-[var(--border-hairline)]">
                {[
                  { id: 'none' as const, label: 'Off' },
                  { id: 'sma' as const, label: 'SMA' },
                  { id: 'ema' as const, label: 'EMA' },
                  { id: 'linear' as const, label: 'Linear Trend' },
                ].map((t) => {
                  const isActive = (!spec.trendline && t.id === 'none') || spec.trendline?.type === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (t.id === 'none') {
                          setSpec({ ...spec, trendline: null });
                        } else {
                          setSpec({
                            ...spec,
                            trendline: {
                              type: t.id,
                              window: spec.trendline?.window || 7,
                              show_equation: spec.trendline?.show_equation ?? true,
                              line_style: spec.trendline?.line_style || 'dash',
                              color: spec.trendline?.color || null,
                            },
                          });
                        }
                      }}
                      className={`py-1 text-xs font-medium rounded transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-hairline)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Active Trendline Configuration Options */}
              {spec.trendline && spec.trendline.type !== 'none' && (
                <div className="space-y-3 p-3 rounded-[var(--radius-md)] bg-[var(--bg-app)] border border-[var(--border-hairline)]">
                  {/* Moving Average Window Selection (for SMA & EMA) */}
                  {(spec.trendline.type === 'sma' || spec.trendline.type === 'ema') && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--text-secondary)]">
                          Period Window ({spec.trendline.window || 7} points)
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {spec.trendline.type === 'sma' ? 'Simple Moving Average' : 'Exponential Moving Average'}
                        </span>
                      </div>

                      {/* Quick Window Presets */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { label: '7 periods', val: 7 },
                          { label: '14 periods', val: 14 },
                          { label: '30 periods', val: 30 },
                          { label: '90 periods', val: 90 },
                        ].map((p) => {
                          const isCur = (spec.trendline?.window || 7) === p.val;
                          return (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() =>
                                setSpec({
                                  ...spec,
                                  trendline: { ...spec.trendline!, window: p.val },
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer ${
                                isCur
                                  ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 font-semibold'
                                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                              }`}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[10px] text-[var(--text-muted)]">Custom:</span>
                          <input
                            type="number"
                            min={2}
                            max={365}
                            value={spec.trendline.window || 7}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 2;
                              setSpec({
                                ...spec,
                                trendline: { ...spec.trendline!, window: Math.min(Math.max(v, 2), 365) },
                              });
                            }}
                            className="w-14 px-1.5 py-0.5 text-xs font-mono bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Linear Regression Options */}
                  {spec.trendline.type === 'linear' && (
                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={spec.trendline.show_equation ?? true}
                        onChange={(e) =>
                          setSpec({
                            ...spec,
                            trendline: { ...spec.trendline!, show_equation: e.target.checked },
                          })
                        }
                        className="rounded text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                      />
                      <span>Show R² score and regression formula in chart legend</span>
                    </label>
                  )}

                  {/* Line Style and Color Customization */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-[var(--border-hairline)]/50">
                    {/* Line Stroke Style */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-[var(--text-muted)] block">Stroke Style</span>
                      <div className="flex items-center gap-1">
                        {[
                          { id: 'dash' as const, label: 'Dashed (---)' },
                          { id: 'dot' as const, label: 'Dotted (···)' },
                          { id: 'solid' as const, label: 'Solid (───)' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setSpec({
                                ...spec,
                                trendline: { ...spec.trendline!, line_style: s.id },
                              })
                            }
                            className={`flex-1 py-1 px-1 text-[10px] font-mono rounded text-center transition-colors cursor-pointer border ${
                              (spec.trendline?.line_style || 'dash') === s.id
                                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--accent)]'
                                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-hairline)] hover:text-[var(--text-secondary)]'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Overlay Accent Color */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-[var(--text-muted)] block">Trend Color</span>
                      <div className="flex items-center gap-1.5">
                        {[
                          { color: '#f59e0b', name: 'Amber' },
                          { color: '#06b6d4', name: 'Cyan' },
                          { color: '#10b981', name: 'Emerald' },
                          { color: '#f43f5e', name: 'Rose' },
                          { color: '#a855f7', name: 'Purple' },
                        ].map((c) => {
                          const isSel = (spec.trendline?.color || '#f59e0b') === c.color;
                          return (
                            <button
                              key={c.color}
                              type="button"
                              onClick={() =>
                                setSpec({
                                  ...spec,
                                  trendline: { ...spec.trendline!, color: c.color },
                                })
                              }
                              title={c.name}
                              className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${
                                isSel ? 'scale-110 ring-2 ring-white/50 border-white' : 'border-transparent hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.color }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart Color / Accent */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
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
                  Reset to default ({getDefaultChartColor(spec.chart_type)})
                </button>
              )}
            </div>
            <div className="flex items-center justify-start">
              <ChartColorPicker
                color={spec.custom_color || getDefaultChartColor(spec.chart_type)}
                onChange={(newColor) => setSpec({ ...spec, custom_color: newColor })}
                onReset={
                  spec.custom_color
                    ? () => setSpec({ ...spec, custom_color: null })
                    : undefined
                }
                defaultColor={getDefaultChartColor(spec.chart_type)}
              />
            </div>
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
    </div>,
    document.body
  );
};
