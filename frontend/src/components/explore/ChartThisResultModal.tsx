import React, { useMemo, useState } from 'react';
import type { ExploreQueryResult } from '../../lib/api';
import { PlotlyChartRenderer } from './PlotlyChartRenderer';
import { Button } from '../ui/Button';
import { BarChart3, AlertTriangle } from 'lucide-react';

interface ChartThisResultModalProps {
  result: ExploreQueryResult;
  datasetName?: string;
  onClose: () => void;
}

export const ChartThisResultModal: React.FC<ChartThisResultModalProps> = ({
  result,
  onClose,
}) => {
  const { columns, rows, truncated, row_count_returned } = result;

  // Detect initial chart shape purely on client without extra queries
  const initialConfig = useMemo(() => {
    const colNames = columns.map((c) => c.name);
    const colTypes = columns.map((c) => c.type.toUpperCase());

    const isNum = (t: string) =>
      ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'REAL'].some((p) =>
        t.startsWith(p)
      );
    const isDt = (t: string) => ['DATE', 'TIME', 'TIMESTAMP'].some((kw) => t.includes(kw));

    const numCols = colNames.filter((_, i) => isNum(colTypes[i]));
    const dtCols = colNames.filter((_, i) => isDt(colTypes[i]));
    const catCols = colNames.filter((_, i) => !isNum(colTypes[i]) && !isDt(colTypes[i]));

    let chartType: any = 'bar';
    let xCol: string | null = catCols[0] || colNames[0] || null;
    let yCol: string | null = numCols[0] || (colNames[1] ? colNames[1] : null);

    if (rows.length === 1 && numCols.length === 1) {
      chartType = 'big_number';
      xCol = null;
      yCol = numCols[0];
    } else if (dtCols.length >= 1 && numCols.length >= 1) {
      chartType = 'line';
      xCol = dtCols[0];
      yCol = numCols[0];
    } else if (numCols.length === 2 && colNames.length === 2) {
      chartType = 'hbar';
      xCol = numCols[0];
      yCol = numCols[1];
    } else if (catCols.length >= 1 && numCols.length >= 1) {
      chartType = rows.length <= 6 && rows.length > 1 ? 'pie' : 'bar';
      xCol = catCols[0];
      yCol = numCols[0];
    } else if (numCols.length === 1) {
      chartType = 'histogram';
      xCol = numCols[0];
      yCol = null;
    }

    return { chartType, xCol, yCol };
  }, [columns, rows]);

  const [chartType, setChartType] = useState<string>(initialConfig.chartType);
  const [xCol, setXCol] = useState<string | null>(initialConfig.xCol);
  const [yCol, setYCol] = useState<string | null>(initialConfig.yCol);

  // Map rows to small chart data response for PlotlyChartRenderer
  const chartData = useMemo(() => {
    const xIdx = xCol ? columns.findIndex((c) => c.name === xCol) : -1;
    const yIdx = yCol ? columns.findIndex((c) => c.name === yCol) : -1;

    let chartRows: any[][] = [];
    if (chartType === 'big_number') {
      const val = yIdx !== -1 && rows.length > 0 ? rows[0][yIdx] : 0;
      chartRows = [[val]];
    } else if (chartType === 'histogram' && xIdx !== -1) {
      const vals = rows.map((r) => Number(r[xIdx])).filter((n) => !isNaN(n));
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const bins = 15;
      const step = (maxV - minV) / bins || 1;
      const counts = Array(bins).fill(0);
      vals.forEach((v) => {
        const b = Math.min(bins - 1, Math.max(0, Math.floor((v - minV) / step)));
        counts[b]++;
      });
      chartRows = counts.map((cnt, i) => [
        (minV + i * step).toFixed(1),
        (minV + (i + 1) * step).toFixed(1),
        cnt,
      ]);
    } else {
      chartRows = rows.map((r) => [
        xIdx !== -1 ? r[xIdx] : '(None)',
        yIdx !== -1 ? Number(r[yIdx]) || 0 : 1,
      ]);
    }

    return {
      spec: {
        chart_type: chartType as any,
        x: xCol ? { column: xCol } : null,
        y: yCol ? { column: yCol } : null,
        title: `${yCol || 'Count'} by ${xCol || 'Metric'}`,
      },
      columns: [xCol || 'category', yCol || 'value'],
      rows: chartRows,
      row_count: chartRows.length,
      notes: [],
      warnings: truncated
        ? ['Chart shows the first returned rows only. Aggregate in SQL for a full-data chart.']
        : [],
      elapsed_seconds: 0.0,
    };
  }, [chartType, xCol, yCol, columns, rows, truncated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-[var(--bg-surface)] w-full max-w-4xl max-h-[90vh] rounded-[var(--radius-xl)] border border-[var(--border-hairline)] shadow-[var(--shadow-modal)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Chart This Result
              </h3>
              <span className="text-xs text-[var(--text-muted)]">
                Instant interactive visualization of returned rows ({row_count_returned.toLocaleString()} rows)
              </span>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Truncation Notice */}
        {truncated && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>
              Chart shows the first <strong>{row_count_returned.toLocaleString()}</strong> rows only. Aggregate in SQL for a full-dataset chart.
            </span>
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-secondary)]">Type:</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-sm)] px-2.5 py-1 text-xs"
            >
              <option value="bar">Bar Chart</option>
              <option value="hbar">Horizontal Bar</option>
              <option value="line">Line Chart</option>
              <option value="area">Area Chart</option>
              <option value="pie">Pie Chart</option>
              <option value="scatter">Scatter Plot</option>
              <option value="histogram">Histogram</option>
              <option value="big_number">Metric Card</option>
            </select>
          </div>

          {chartType !== 'big_number' && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--text-secondary)]">X Axis:</span>
              <select
                value={xCol || ''}
                onChange={(e) => setXCol(e.target.value || null)}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-sm)] px-2.5 py-1 text-xs"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-secondary)]">Y Axis:</span>
            <select
              value={yCol || ''}
              onChange={(e) => setYCol(e.target.value || null)}
              className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-sm)] px-2.5 py-1 text-xs"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chart View */}
        <div className="flex-1 p-6 flex items-center justify-center min-h-[380px] bg-[var(--bg-surface)]">
          <PlotlyChartRenderer data={chartData} height={380} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
          <Button size="sm" variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
