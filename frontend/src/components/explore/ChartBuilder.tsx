import React, { useEffect, useState, useTransition } from 'react';
import {
  buildChart,
  exportChartCsv,
  type ChartColumnStats,
  type ChartDataResponse,
  type ChartSpec,
} from '../../lib/api';
import { PlotlyChartRenderer } from './PlotlyChartRenderer';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  Activity,
  Download,
  AlertTriangle,
  Info,
  RefreshCw,
  Table as TableIcon,
} from 'lucide-react';

interface ChartBuilderProps {
  jobId: string;
  columns: ChartColumnStats[];
  initialSpec?: ChartSpec | null;
  onHandoffToQuery?: () => void;
  onHandoffToClean?: () => void;
}

const CHART_TYPES = [
  { id: 'bar', label: 'Bar', icon: BarChart },
  { id: 'hbar', label: 'H-Bar', icon: BarChart },
  { id: 'line', label: 'Line', icon: LineChart },
  { id: 'area', label: 'Area', icon: Activity },
  { id: 'histogram', label: 'Histogram', icon: BarChart },
  { id: 'scatter', label: 'Scatter', icon: ScatterChart },
  { id: 'pie', label: 'Pie', icon: PieChart },
  { id: 'box', label: 'Box Plot', icon: Activity },
  { id: 'big_number', label: 'Metric Card', icon: Activity },
] as const;

export const ChartBuilder: React.FC<ChartBuilderProps> = ({
  jobId,
  columns,
  initialSpec,
  onHandoffToQuery,
  onHandoffToClean,
}) => {
  const [spec, setSpec] = useState<ChartSpec>(() => {
    if (initialSpec) return initialSpec;
    const defaultX = columns[0]?.name || '';
    return {
      chart_type: 'bar',
      x: { column: defaultX },
      aggregation: 'count',
      sort: 'y_desc',
      top_n: 20,
    };
  });

  const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [, startTransition] = useTransition();

  // Sync if initialSpec updates
  useEffect(() => {
    if (initialSpec) {
      setSpec(initialSpec);
    }
  }, [initialSpec]);

  // Debounced auto-fetch chart data on spec changes
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchTimer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await buildChart(jobId, spec, controller.signal);
        if (active) {
          setChartData(res);
        }
      } catch (err: any) {
        if (active && err.name !== 'AbortError') {
          setError(err.message || 'Failed to render chart.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(fetchTimer);
    };
  }, [jobId, spec]);

  const updateSpec = (updater: (prev: ChartSpec) => ChartSpec) => {
    startTransition(() => {
      setSpec((prev) => updater(prev));
    });
  };

  const handleExportCsv = async () => {
    try {
      await exportChartCsv(jobId, spec);
    } catch (err: any) {
      setError(err.message || 'CSV export failed.');
    }
  };

  const selectedXCol = columns.find((c) => c.name === spec.x?.column);
  const selectedYCol = columns.find((c) => c.name === spec.y?.column);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Left Configuration Controls Panel */}
      <div className="w-full lg:w-80 shrink-0 bg-[var(--bg-surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--border-hairline)] shadow-[var(--shadow-card)] flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
          <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
            Chart Configuration
          </span>
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />}
        </div>

        {/* Chart Type Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Chart Type
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {CHART_TYPES.map((t) => {
              const Icon = t.icon;
              const isSelected = spec.chart_type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSpec((prev) => ({ ...prev, chart_type: t.id }))}
                  className={`flex flex-col items-center justify-center p-2 rounded-[var(--radius-md)] text-xs font-medium transition-colors border ${
                    isSelected
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-hairline)]'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1" />
                  <span className="truncate w-full text-center">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* X Axis Picker (when applicable) */}
        {spec.chart_type !== 'big_number' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                X Axis / Category
              </label>
              {selectedXCol && selectedXCol.null_pct > 0 && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  {selectedXCol.null_pct}% nulls
                </span>
              )}
            </div>
            <select
              value={spec.x?.column || ''}
              onChange={(e) => {
                const colName = e.target.value;
                updateSpec((prev) => ({
                  ...prev,
                  x: { ...prev.x, column: colName },
                }));
              }}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.type}) {c.null_pct > 0 ? `· ${c.null_pct}% null` : ''}
                </option>
              ))}
            </select>

            {/* Time bucket selector if datetime */}
            {(selectedXCol?.kind === 'datetime' || spec.x?.cast_as === 'date' || spec.x?.cast_as === 'timestamp') && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-[var(--text-muted)]">Bucket:</span>
                <select
                  value={spec.x?.time_bucket || 'day'}
                  onChange={(e) =>
                    updateSpec((prev) => ({
                      ...prev,
                      x: { ...prev.x, column: prev.x?.column || '', time_bucket: e.target.value as any },
                    }))
                  }
                  className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-xs)] px-2 py-1 text-xs"
                >
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                  <option value="hour_of_day">Hour of Day (0-23)</option>
                  <option value="day_of_week">Day of Week (0-6)</option>
                </select>
              </div>
            )}

            {/* Parse hint suggestion */}
            {selectedXCol && selectedXCol.parse_hints?.as_date_success_pct && selectedXCol.parse_hints.as_date_success_pct > 80 && !spec.x?.cast_as && (
              <button
                type="button"
                onClick={() =>
                  updateSpec((prev) => ({
                    ...prev,
                    x: { ...prev.x, column: prev.x?.column || '', cast_as: 'timestamp', time_bucket: 'day' },
                  }))
                }
                className="text-[11px] text-left text-[var(--accent)] hover:underline mt-1"
              >
                💡 Read as date ({selectedXCol.parse_hints.as_date_success_pct}% parsed)
              </button>
            )}
          </div>
        )}

        {/* Y Axis & Aggregation */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {spec.chart_type === 'histogram' ? 'Value' : 'Y Axis / Measure'}
            </label>
            {selectedYCol && selectedYCol.null_pct > 0 && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {selectedYCol.null_pct}% nulls
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <select
              value={spec.aggregation || 'count'}
              onChange={(e) =>
                updateSpec((prev) => ({
                  ...prev,
                  aggregation: e.target.value as any,
                }))
              }
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-[var(--text-primary)] w-28"
            >
              <option value="count">Count (*)</option>
              <option value="count_distinct">Distinct</option>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
              <option value="median">Median</option>
              <option value="none">Raw (None)</option>
            </select>

            <select
              value={spec.y?.column || ''}
              onChange={(e) => {
                const colName = e.target.value;
                updateSpec((prev) => ({
                  ...prev,
                  y: colName ? { column: colName } : null,
                }));
              }}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-[var(--text-primary)] flex-1 focus:outline-none"
            >
              <option value="">(None / Row Count)</option>
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Color / Grouping (Optional) */}
        {['bar', 'line', 'area', 'scatter'].includes(spec.chart_type) && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Group / Color Series
            </label>
            <select
              value={spec.color?.column || ''}
              onChange={(e) => {
                const colName = e.target.value;
                updateSpec((prev) => ({
                  ...prev,
                  color: colName ? { column: colName } : null,
                }));
              }}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="">(None)</option>
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Data Quality Toggles */}
        <div className="border-t border-[var(--border-hairline)] pt-3 flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Data Quality & Filters
          </span>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={spec.exclude_nulls || false}
              onChange={(e) => updateSpec((prev) => ({ ...prev, exclude_nulls: e.target.checked }))}
              className="rounded text-[var(--accent)]"
            />
            <span>Exclude missing values</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={spec.hide_outliers || false}
              onChange={(e) => updateSpec((prev) => ({ ...prev, hide_outliers: e.target.checked }))}
              className="rounded text-[var(--accent)]"
            />
            <span>Hide outliers (1st-99th percentile)</span>
          </label>

          {/* Log scale toggle */}
          {['bar', 'line', 'area', 'scatter'].includes(spec.chart_type) && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={spec.log_y || false}
                onChange={(e) => updateSpec((prev) => ({ ...prev, log_y: e.target.checked }))}
                className="rounded text-[var(--accent)]"
              />
              <span>Logarithmic Y scale</span>
            </label>
          )}
        </div>

        {/* Chart Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Title
          </label>
          <input
            type="text"
            value={spec.title || ''}
            placeholder="Custom chart title..."
            onChange={(e) => updateSpec((prev) => ({ ...prev, title: e.target.value }))}
            className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
          />
        </div>
      </div>

      {/* Right Canvas Area */}
      <div className="flex-1 w-full bg-[var(--bg-surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--border-hairline)] shadow-[var(--shadow-card)] flex flex-col gap-4 min-h-[520px]">
        {/* Top Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-[var(--text-primary)]">
              {spec.title || 'Chart Preview'}
            </span>
            {chartData && (
              <span className="text-xs text-[var(--text-muted)]">
                ({chartData.row_count} rows · {chartData.elapsed_seconds}s)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowTable((prev) => !prev)}
              className="text-xs h-8"
            >
              <TableIcon className="w-3.5 h-3.5 mr-1.5" />
              {showTable ? 'View Chart' : 'View Aggregated Data'}
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportCsv}
              className="text-xs h-8"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <Callout variant="danger" title="Chart Generation Failed">
            {error}
          </Callout>
        )}

        {/* Render Canvas */}
        {!error && chartData && !showTable && (
          <div className="w-full flex-1 flex flex-col justify-center items-center relative">
            <PlotlyChartRenderer data={chartData} height={460} />
          </div>
        )}

        {/* Data Table View */}
        {!error && chartData && showTable && (
          <div className="w-full overflow-x-auto flex-1 max-h-[460px] border border-[var(--border-hairline)] rounded-[var(--radius-md)]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 border-b border-[var(--border-hairline)]">
                <tr>
                  {chartData.columns.map((col, idx) => (
                    <th key={idx} className="p-2.5 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {chartData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--bg-hover)]">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2.5 text-[var(--text-primary)]">
                        {cell === null ? <span className="text-[var(--text-muted)] italic">null</span> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes and Warnings Footer */}
        {chartData && (chartData.notes.length > 0 || chartData.warnings.length > 0) && (
          <div className="border-t border-[var(--border-hairline)] pt-3 flex flex-col gap-1.5 text-xs text-[var(--text-muted)]">
            {chartData.notes.map((note, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>{note}</span>
              </div>
            ))}
            {chartData.warnings.map((warn, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-amber-500">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{warn}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Handoff Bar */}
        <div className="border-t border-[var(--border-hairline)] pt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            Explore deeper or sanitize messy columns:
          </span>
          <div className="flex items-center gap-2">
            {onHandoffToQuery && (
              <Button size="sm" variant="secondary" onClick={onHandoffToQuery} className="text-xs">
                Query this data (SQL & AI)
              </Button>
            )}
            {onHandoffToClean && (
              <Button size="sm" variant="primary" onClick={onHandoffToClean} className="text-xs">
                Clean this file
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
