import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { ChartDataResponse } from '../../lib/api';

// Brand / Primary Accent (CleanFlow Orange) and Harmonious Palette
const BRAND_ORANGE = '#FD4233';
const BRAND_ORANGE_DARK = '#E53628';

const THEME_PALETTE = [
  '#FD4233', // 1. Brand CleanFlow Orange
  '#F97316', // 2. Warm Tangerine
  '#F59E0B', // 3. Amber Gold
  '#10B981', // 4. Emerald Green
  '#8B5CF6', // 5. Soft Violet
  '#06B6D4', // 6. Cyan Teal
  '#EC4899', // 7. Coral Rose
  '#64748B', // 8. Cool Slate
];

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
      colorway: THEME_PALETTE,
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
            color: 'rgba(253, 66, 51, 0.85)',
            line: { color: BRAND_ORANGE_DARK, width: 1.5 },
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
            color: BRAND_ORANGE,
            size: 7,
            opacity: 0.75,
            line: { color: BRAND_ORANGE_DARK, width: 1 },
          },
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 4. Box Plot
    if (spec.chart_type === 'box') {
      const traces: any[] = rows.map((r, idx) => {
        const color = THEME_PALETTE[idx % THEME_PALETTE.length];
        return {
          type: 'box',
          name: String(r[0]),
          q1: [r[3]],
          median: [r[4]],
          q3: [r[5]],
          lowerfence: [r[2]],
          upperfence: [r[6]],
          marker: { color },
          line: { color, width: 1.5 },
          fillcolor: isDark ? 'rgba(253, 66, 51, 0.18)' : 'rgba(253, 66, 51, 0.1)',
        };
      });
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
          colorscale: isDark
            ? [
                [0, '#1c1917'],
                [0.3, '#7c2d12'],
                [0.7, '#ea580c'],
                [1, '#fd4233'],
              ]
            : [
                [0, '#fff5f4'],
                [0.25, '#fed7aa'],
                [0.65, '#fb923c'],
                [1, '#fd4233'],
              ],
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
          hole: 0.38,
          textinfo: 'label+percent',
          hoverinfo: 'label+value+percent',
          marker: {
            colors: THEME_PALETTE,
            line: { color: isDark ? '#18181b' : '#ffffff', width: 2 },
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
          marker: {
            color: BRAND_ORANGE,
            line: { color: BRAND_ORANGE_DARK, width: 1 },
          },
        },
      ];
      return { isBigNumber: false, traces, layout: baseLayout };
    }

    // 8. Vertical Bar
    if (spec.chart_type === 'bar') {
      if (spec.color && columns.length >= 3) {
        const groups = Array.from(new Set(rows.map((r) => String(r[1]))));
        const categories = Array.from(new Set(rows.map((r) => String(r[0]))));
        const traces: any[] = groups.map((grp, idx) => {
          const color = THEME_PALETTE[idx % THEME_PALETTE.length];
          const yVals = categories.map((cat) => {
            const found = rows.find((r) => String(r[0]) === cat && String(r[1]) === grp);
            return found ? Number(found[2]) || 0 : 0;
          });
          return {
            type: 'bar',
            name: grp,
            x: categories,
            y: yVals,
            marker: { color },
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
            marker: {
              color: BRAND_ORANGE,
              line: { color: BRAND_ORANGE_DARK, width: 1 },
            },
          },
        ];
        return { isBigNumber: false, traces, layout: baseLayout };
      }
    }

    // 9. Line / Area
    const isArea = spec.chart_type === 'area';
    if (spec.color && columns.length >= 3) {
      const seriesNames = Array.from(new Set(rows.map((r) => String(r[1]))));
      const traces: any[] = seriesNames.map((sName, idx) => {
        const sRows = rows.filter((r) => String(r[1]) === sName);
        const color = THEME_PALETTE[idx % THEME_PALETTE.length];
        return {
          type: 'scatter',
          mode: 'lines+markers',
          name: sName,
          x: sRows.map((r) => r[0]),
          y: sRows.map((r) => r[2]),
          fill: isArea ? 'tozeroy' : undefined,
          line: { color, width: 2.5 },
          marker: { color, size: 4 },
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
        fillcolor: isArea
          ? (isDark ? 'rgba(253, 66, 51, 0.22)' : 'rgba(253, 66, 51, 0.12)')
          : undefined,
        line: { color: BRAND_ORANGE, width: 2.5 },
        marker: { color: BRAND_ORANGE, size: 5 },
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
