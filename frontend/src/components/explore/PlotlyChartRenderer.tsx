import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { ChartDataResponse } from '../../lib/api';

interface PlotlyChartRendererProps {
  data: ChartDataResponse;
  height?: number;
  className?: string;
}

export const PlotlyChartRenderer: React.FC<PlotlyChartRendererProps> = ({
  data,
  height = 420,
  className = '',
}) => {
  const { spec, columns, rows } = data;
  const isDark = document.documentElement.classList.contains('dark');

  const plotConfig = useMemo(() => {
    const textColor = isDark ? '#e2e8f0' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const paperBg = 'transparent';
    const plotBg = 'transparent';

    const baseLayout: any = {
      autosize: true,
      height,
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      margin: { l: 50, r: 30, t: spec.title ? 45 : 20, b: 50 },
      font: {
        family: 'IBM Plex Sans, sans-serif',
        color: textColor,
        size: 12,
      },
      title: spec.title
        ? {
            text: spec.title,
            font: { family: 'IBM Plex Sans, sans-serif', size: 15, color: textColor },
            x: 0.02,
            xanchor: 'left',
          }
        : undefined,
      xaxis: {
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        tickfont: { color: textColor },
      },
      yaxis: {
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        tickfont: { color: textColor },
        type: spec.log_y ? 'log' : 'linear',
      },
      showlegend: !!spec.color || spec.chart_type === 'pie',
      legend: {
        font: { color: textColor },
        orientation: 'h',
        y: -0.2,
      },
    };

    // 1. Big Number Card
    if (spec.chart_type === 'big_number') {
      const val = rows.length > 0 && rows[0].length > 0 ? rows[0][0] : 0;
      const formatted = typeof val === 'number' ? Number(val).toLocaleString() : String(val ?? 0);
      return {
        isBigNumber: true,
        bigNumberValue: formatted,
        title: spec.title || 'Summary Value',
        traces: [],
        layout: baseLayout,
      };
    }

    // 2. Histogram
    if (spec.chart_type === 'histogram') {
      const xLabels = rows.map((r) => `${r[0]} - ${r[1]}`);
      const yValues = rows.map((r) => r[2]);
      const traces: any[] = [
        {
          type: 'bar',
          x: xLabels,
          y: yValues,
          marker: {
            color: '#3b82f6',
            line: { color: '#1d4ed8', width: 1 },
          },
          hoverinfo: 'x+y',
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 3. Scatter Plot
    if (spec.chart_type === 'scatter') {
      const xValues = rows.map((r) => r[0]);
      const yValues = rows.map((r) => r[1]);
      const traces: any[] = [
        {
          type: 'scatter',
          mode: 'markers',
          x: xValues,
          y: yValues,
          marker: {
            color: '#0ea5e9',
            size: 6,
            opacity: 0.7,
          },
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 4. Box Plot
    if (spec.chart_type === 'box') {
      const traces: any[] = rows.map((r) => ({
        type: 'box',
        name: String(r[0]),
        q1: [r[3]],
        median: [r[4]],
        q3: [r[5]],
        lowerfence: [r[2]],
        upperfence: [r[6]],
        marker: { color: '#6366f1' },
      }));
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 5. Heatmap
    if (spec.chart_type === 'heatmap') {
      const xSet = Array.from(new Set(rows.map((r) => String(r[0]))));
      const ySet = Array.from(new Set(rows.map((r) => String(r[1]))));
      const zMatrix: number[][] = ySet.map(() => xSet.map(() => 0));

      rows.forEach((r) => {
        const xIdx = xSet.indexOf(String(r[0]));
        const yIdx = ySet.indexOf(String(r[1]));
        if (xIdx !== -1 && yIdx !== -1) {
          zMatrix[yIdx][xIdx] = Number(r[2]) || 0;
        }
      });

      const traces: any[] = [
        {
          type: 'heatmap',
          x: xSet,
          y: ySet,
          z: zMatrix,
          colorscale: 'Blues',
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 6. Pie Chart
    if (spec.chart_type === 'pie') {
      const labels = rows.map((r) => String(r[0]));
      const values = rows.map((r) => Number(r[1]) || 0);
      const traces: any[] = [
        {
          type: 'pie',
          labels,
          values,
          hole: 0.35,
          textinfo: 'label+percent',
          hoverinfo: 'label+value+percent',
          marker: {
            colors: [
              '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'
            ],
          },
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 7. Horizontal Bar
    if (spec.chart_type === 'hbar') {
      const categories = rows.map((r) => String(r[0])).reverse();
      const values = rows.map((r) => Number(r[1]) || 0).reverse();
      const traces: any[] = [
        {
          type: 'bar',
          orientation: 'h',
          x: values,
          y: categories,
          marker: { color: '#3b82f6' },
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 8. Vertical Bar
    if (spec.chart_type === 'bar') {
      if (spec.color && columns.length >= 3) {
        const groups = Array.from(new Set(rows.map((r) => String(r[1]))));
        const categories = Array.from(new Set(rows.map((r) => String(r[0]))));
        const traces: any[] = groups.map((grp) => {
          const yVals = categories.map((cat) => {
            const found = rows.find((r) => String(r[0]) === cat && String(r[1]) === grp);
            return found ? Number(found[2]) || 0 : 0;
          });
          return {
            type: 'bar',
            name: grp,
            x: categories,
            y: yVals,
          };
        });
        return { isBigNumber: false, traces, layout: baseLayout };
      } else {
        const categories = rows.map((r) => String(r[0]));
        const values = rows.map((r) => Number(r[1]) || 0);
        const traces: any[] = [
          {
            type: 'bar',
            x: categories,
            y: values,
            marker: { color: '#3b82f6' },
          },
        ];
        return { isBigNumber: false, traces, layout: baseLayout };
      }
    }

    // 9. Line / Area
    const isArea = spec.chart_type === 'area';
    if (spec.color && columns.length >= 3) {
      const seriesNames = Array.from(new Set(rows.map((r) => String(r[1]))));
      const traces: any[] = seriesNames.map((sName) => {
        const sRows = rows.filter((r) => String(r[1]) === sName);
        return {
          type: 'scatter',
          mode: 'lines',
          name: sName,
          x: sRows.map((r) => r[0]),
          y: sRows.map((r) => r[2]),
          fill: isArea ? 'tozeroy' : undefined,
        };
      });
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    const xVals = rows.map((r) => r[0]);
    const yVals = rows.map((r) => (r.length > 1 ? r[1] : 0));
    const traces: any[] = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: xVals,
        y: yVals,
        fill: isArea ? 'tozeroy' : undefined,
        line: { color: '#2563eb', width: 2 },
        marker: { size: 4 },
      },
    ];

    return { isBigNumber: false, traces, layout: baseLayout };
  }, [data, isDark, height, spec, columns, rows]);

  if (plotConfig.isBigNumber) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 bg-[var(--bg-surface)] rounded-[var(--radius-lg)] border border-[var(--border-hairline)] ${className}`}
        style={{ minHeight: height }}
      >
        <span className="text-sm font-medium uppercase tracking-wider text-[var(--text-muted)] mb-2">
          {plotConfig.title}
        </span>
        <span className="text-5xl sm:text-6xl font-extrabold font-mono tracking-tight text-[var(--accent)]">
          {plotConfig.bigNumberValue}
        </span>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <Plot
        data={plotConfig.traces}
        layout={plotConfig.layout}
        config={{
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          toImageButtonOptions: {
            format: 'png',
            filename: spec.title ? spec.title.toLowerCase().replace(/\s+/g, '_') : 'chart',
            height: 600,
            width: 900,
            scale: 2,
          },
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
