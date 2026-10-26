import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { ChartDataResponse } from '../../lib/api';
import {
  getDefaultChartColor,
  adjustBrightness,
  buildPaletteWithPrimary,
  hexToRgba,
  buildHeatmapColorscale,
} from './chartColors';
import { buildTrendlineTrace } from './trendlineMath';

interface PlotlyChartRendererProps {
  data: ChartDataResponse;
  height?: number;
  className?: string;
  customColor?: string;
  onPointClick?: (column: string, value: any) => void;
  crossFilters?: Record<string, any>;
}

export const PlotlyChartRenderer: React.FC<PlotlyChartRendererProps> = ({
  data,
  height = 420,
  className = '',
  customColor,
  onPointClick,
  crossFilters,
}) => {
  const { spec, columns, rows } = data;
  const isDark = document.documentElement.classList.contains('dark');

  const plotConfig = useMemo(() => {
    const textColor = isDark ? '#e2e8f0' : '#1e293b';
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const zerolineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const paperBg = 'transparent';
    const plotBg = 'transparent';

    const defaultColor = getDefaultChartColor(spec?.chart_type);
    const primaryColor = spec?.custom_color || customColor || defaultColor;
    const primaryDark = adjustBrightness(primaryColor, -15);
    const activePalette = buildPaletteWithPrimary(primaryColor);

    const baseLayout: any = {
      autosize: true,
      height,
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      colorway: activePalette,
      margin: { l: 48, r: 18, t: 14, b: 38 },
      font: {
        family: 'IBM Plex Sans, sans-serif',
        color: textColor,
        size: 11,
      },
      // Note: ChartCard header already displays the title cleanly in crisp typography.
      // Omitting title from the Plotly canvas prevents duplicated headers and saves canvas height.
      xaxis: {
        gridcolor: gridColor,
        gridwidth: 1,
        zerolinecolor: zerolineColor,
        zerolinewidth: 1,
        tickfont: { color: tickColor, size: 11 },
        automargin: true,
      },
      yaxis: {
        gridcolor: gridColor,
        gridwidth: 1,
        zerolinecolor: zerolineColor,
        zerolinewidth: 1,
        tickfont: { color: tickColor, size: 11 },
        automargin: true,
      },
      showlegend:
        !!spec.color ||
        spec.chart_type === 'pie' ||
        spec.chart_type === 'donut' ||
        (!!spec.trendline && spec.trendline.type !== 'none'),
      legend: {
        font: { color: textColor, size: 11 },
        orientation: 'h',
        y: -0.18,
      },
    };

    // 1. Big Number Card
    if (spec.chart_type === 'big_number') {
      const val = rows.length > 0 && rows[0].length > 0 ? rows[0][0] : 0;
      const formatted = typeof val === 'number' ? Number(val).toLocaleString() : String(val ?? 0);
      return {
        isBigNumber: true,
        bigNumberValue: formatted,
        primaryColor,
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
            color: hexToRgba(primaryColor, 0.85),
            line: { color: primaryDark, width: 1.5 },
          },
          hoverinfo: 'x+y',
        },
      ];
      const histLayout = {
        ...baseLayout,
        bargap: 0.15,
        xaxis: { ...baseLayout.xaxis, type: 'category' },
        yaxis: { ...baseLayout.yaxis, type: spec.log_y ? 'log' : 'linear' },
      };
      return { isBigNumber: false, primaryColor, traces, layout: histLayout };
    }

    // 3. Scatter Plot
    if (spec.chart_type === 'scatter') {
      const validRows = rows.filter(
        (r) => r && r[0] != null && r[1] != null && Number.isFinite(Number(r[0])) && Number.isFinite(Number(r[1]))
      );
      const xValues = validRows.map((r) => Number(r[0]));
      const yValues = validRows.map((r) => Number(r[1]));
      const traces: any[] = [
        {
          type: 'scatter',
          mode: 'markers',
          x: xValues,
          y: yValues,
          marker: {
            color: primaryColor,
            size: 7,
            opacity: 0.75,
            line: { color: primaryDark, width: 1 },
          },
        },
      ];

      if (spec.trendline && spec.trendline.type !== 'none') {
        const sorted = [...validRows].sort((a, b) => Number(a[0]) - Number(b[0]));
        const trendTrace = buildTrendlineTrace(
          spec.trendline,
          sorted.map((r) => Number(r[0])),
          sorted.map((r) => Number(r[1])),
          { primaryColor, isDark }
        );
        if (trendTrace) {
          traces.push(trendTrace);
        }
      }

      const scatterLayout = {
        ...baseLayout,
        xaxis: { ...baseLayout.xaxis, type: 'linear' },
        yaxis: { ...baseLayout.yaxis, type: spec.log_y ? 'log' : 'linear' },
      };
      return { isBigNumber: false, primaryColor, traces, layout: scatterLayout };
    }

    // 4. Box Plot
    if (spec.chart_type === 'box') {
      const traces: any[] = rows.map((r, idx) => {
        const color = activePalette[idx % activePalette.length];
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
          fillcolor: isDark ? hexToRgba(primaryColor, 0.18) : hexToRgba(primaryColor, 0.1),
        };
      });
      const boxLayout = {
        ...baseLayout,
        xaxis: { ...baseLayout.xaxis, type: 'category' },
        yaxis: { ...baseLayout.yaxis, type: spec.log_y ? 'log' : 'linear' },
      };
      return { isBigNumber: false, primaryColor, traces, layout: boxLayout };
    }

    // 5. Heatmap (Styled like Microsoft Power BI Matrix with Conditional Formatting)
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

      // Format cell data labels with commas (Power BI Matrix values)
      const textMatrix = zMatrix.map((row) =>
        row.map((val) => {
          if (val == null) return '';
          const num = Number(val);
          if (isNaN(num)) return String(val);
          if (Number.isInteger(num)) {
            return num.toLocaleString();
          }
          return num.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: Math.abs(num) < 10 ? 2 : 1,
          });
        })
      );

      const numCols = xSet.length;
      const numRows = ySet.length;
      // Auto-scale in-cell text size based on density (suppress if > 25 columns to avoid clutter)
      const cellFontSize =
        numCols > 25 || numRows > 25
          ? 0
          : numCols > 15 || numRows > 15
          ? 9
          : numCols > 10 || numRows > 10
          ? 10.5
          : 12.5;

      const colorscale = buildHeatmapColorscale(primaryColor, isDark);

      const traces: any[] = [
        {
          type: 'heatmap',
          x: xSet,
          y: ySet,
          z: zMatrix,
          ...(cellFontSize > 0
            ? {
                text: textMatrix,
                texttemplate: '<b>%{text}</b>',
                textfont: {
                  family: 'Segoe UI, -apple-system, BlinkMacSystemFont, IBM Plex Sans, sans-serif',
                  size: cellFontSize,
                },
              }
            : {}),
          xgap: 3,
          ygap: 3,
          colorscale,
          colorbar: {
            thickness: 12,
            len: 0.85,
            outlinewidth: 0,
            bordercolor: 'transparent',
            tickfont: {
              color: tickColor,
              size: 10,
              family: 'Segoe UI, -apple-system, BlinkMacSystemFont, IBM Plex Sans, sans-serif',
            },
            tickformat: ',d',
            xpad: 12,
            ypad: 0,
          },
          hovertemplate:
            '<b>%{y}</b> • <b>%{x}</b><br>' +
            '<span style="font-size: 11px; opacity: 0.85;">Count:</span> <b>%{z:,.0f}</b>' +
            '<extra></extra>',
        },
      ];

      const heatLayout = {
        ...baseLayout,
        margin: {
          ...baseLayout.margin,
          l: 85,
          r: 25,
          t: 16,
          b: 48,
        },
        hoverlabel: {
          bgcolor: isDark ? '#1e293b' : '#ffffff',
          bordercolor: isDark ? '#334155' : '#cbd5e1',
          font: {
            family: 'Segoe UI, -apple-system, BlinkMacSystemFont, IBM Plex Sans, sans-serif',
            size: 12,
            color: isDark ? '#f8fafc' : '#0f172a',
          },
        },
        xaxis: {
          ...baseLayout.xaxis,
          type: 'category',
          ticks: '',
          showgrid: false,
          zeroline: false,
          tickfont: {
            color: tickColor,
            size: 11.5,
            family: 'Segoe UI, -apple-system, BlinkMacSystemFont, IBM Plex Sans, sans-serif',
          },
        },
        yaxis: {
          ...baseLayout.yaxis,
          type: 'category',
          autorange: 'reversed', // Display top-down matching Power BI matrix
          ticks: '',
          showgrid: false,
          zeroline: false,
          tickfont: {
            color: tickColor,
            size: 11.5,
            family: 'Segoe UI, -apple-system, BlinkMacSystemFont, IBM Plex Sans, sans-serif',
          },
        },
      };
      return { isBigNumber: false, primaryColor, traces, layout: heatLayout };
    }

    // 6. Pie & Donut Chart
    if (spec.chart_type === 'pie' || spec.chart_type === 'donut') {
      const labels = rows.map((r) => String(r[0]));
      const values = rows.map((r) => Number(r[1]) || 0);
      const isDonut = spec.chart_type === 'donut';
      const activeFilterVal = spec.x?.column && crossFilters ? crossFilters[spec.x.column] : null;
      const colors = labels.map((lbl, idx) => {
        const c = activePalette[idx % activePalette.length];
        if (activeFilterVal == null) return c;
        return String(lbl) === String(activeFilterVal) ? c : hexToRgba(c, 0.25);
      });
      const traces: any[] = [
        {
          type: 'pie',
          labels,
          values,
          domain: { x: [0, 1], y: [0, 1] },
          hole: isDonut ? 0.55 : 0,
          textinfo: 'percent',
          hoverinfo: 'label+value+percent',
          textposition: 'inside',
          marker: {
            colors,
            line: { color: isDark ? '#18181b' : '#ffffff', width: 2 },
          },
        },
      ];
      const { xaxis, yaxis, ...layoutWithoutAxes } = baseLayout;
      const pieLayout = {
        ...layoutWithoutAxes,
        margin: { l: 20, r: 20, t: 15, b: 35 },
      };
      return { isBigNumber: false, primaryColor, traces, layout: pieLayout };
    }

    // 7. Horizontal Bar
    if (spec.chart_type === 'hbar') {
      const categories = rows.map((r) => String(r[0])).reverse();
      const values = rows.map((r) => Number(r[1]) || 0).reverse();
      const activeFilterVal = spec.x?.column && crossFilters ? crossFilters[spec.x.column] : null;
      const colors = categories.map((cat) => {
        if (activeFilterVal == null) return primaryColor;
        return String(cat) === String(activeFilterVal) ? primaryColor : hexToRgba(primaryColor, 0.25);
      });
      const traces: any[] = [
        {
          type: 'bar',
          orientation: 'h',
          x: values,
          y: categories,
          marker: {
            color: colors,
            line: { color: primaryDark, width: 1 },
          },
        },
      ];
      const hbarLayout = {
        ...baseLayout,
        bargap: 0.28,
        margin: {
          ...baseLayout.margin,
          l: 110,
          t: 12,
          b: 36,
          r: 20,
        },
        xaxis: {
          ...baseLayout.xaxis,
          type: spec.log_y ? 'log' : 'linear',
        },
        yaxis: {
          ...baseLayout.yaxis,
          type: 'category',
          automargin: true,
        },
      };
      return { isBigNumber: false, primaryColor, traces, layout: hbarLayout };
    }

    // 8. Vertical Bar
    if (spec.chart_type === 'bar') {
      const barLayout = {
        ...baseLayout,
        bargap: 0.28,
        margin: {
          ...baseLayout.margin,
          t: 12,
          b: 40,
          l: 45,
          r: 20,
        },
        xaxis: {
          ...baseLayout.xaxis,
          type: 'category',
          automargin: true,
        },
        yaxis: {
          ...baseLayout.yaxis,
          type: spec.log_y ? 'log' : 'linear',
        },
      };

      if (spec.color && columns.length >= 3) {
        const groups = Array.from(new Set(rows.map((r) => String(r[1]))));
        const categories = Array.from(new Set(rows.map((r) => String(r[0]))));
        const traces: any[] = groups.map((grp, idx) => {
          const color = activePalette[idx % activePalette.length];
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
        return { isBigNumber: false, primaryColor, traces, layout: barLayout };
      } else {
        const categories = rows.map((r) => String(r[0]));
        const values = rows.map((r) => Number(r[1]) || 0);
        const activeFilterVal = spec.x?.column && crossFilters ? crossFilters[spec.x.column] : null;
        const colors = categories.map((cat) => {
          if (activeFilterVal == null) return primaryColor;
          return String(cat) === String(activeFilterVal) ? primaryColor : hexToRgba(primaryColor, 0.25);
        });
        const traces: any[] = [
          {
            type: 'bar',
            x: categories,
            y: values,
            marker: {
              color: colors,
              line: { color: primaryDark, width: 1 },
            },
          },
        ];
        return { isBigNumber: false, primaryColor, traces, layout: barLayout };
      }
    }

    // 9. Line / Area
    const isArea = spec.chart_type === 'area';
    const lineLayout = {
      ...baseLayout,
      margin: {
        ...baseLayout.margin,
        t: 12,
        b: 36,
        l: 45,
        r: 20,
      },
      xaxis: {
        ...baseLayout.xaxis,
        automargin: true,
      },
      yaxis: {
        ...baseLayout.yaxis,
        type: spec.log_y ? 'log' : 'linear',
        rangemode: isArea ? 'tozero' : 'normal',
      },
    };

    if (spec.color && columns.length >= 3) {
      const validRows = rows.filter(
        (r) => r && r[0] != null && r[0] !== '' && r[2] != null && Number.isFinite(Number(r[2]))
      );
      const seriesNames = Array.from(new Set(validRows.map((r) => String(r[1]))));
      const traces: any[] = seriesNames.map((sName, idx) => {
        const sRows = validRows.filter((r) => String(r[1]) === sName);
        const color = activePalette[idx % activePalette.length];
        return {
          type: 'scatter',
          mode: 'lines+markers',
          name: sName,
          x: sRows.map((r) => r[0]),
          y: sRows.map((r) => Number(r[2])),
          fill: isArea ? 'tozeroy' : undefined,
          line: { color, width: 2.5 },
          marker: { color, size: 4 },
        };
      });

      if (spec.trendline && spec.trendline.type !== 'none') {
        seriesNames.forEach((sName, idx) => {
          const sRows = validRows.filter((r) => String(r[1]) === sName);
          const color = activePalette[idx % activePalette.length];
          const trendTrace = buildTrendlineTrace(
            spec.trendline!,
            sRows.map((r) => r[0]),
            sRows.map((r) => Number(r[2])),
            { seriesName: sName, primaryColor: color, isDark }
          );
          if (trendTrace) {
            traces.push(trendTrace);
          }
        });
      }

      return { isBigNumber: false, primaryColor, traces, layout: lineLayout };
    }

    const validRows = rows.filter(
      (r) => r && r[0] != null && r[0] !== '' && r[1] != null && Number.isFinite(Number(r[1]))
    );
    const xVals = validRows.map((r) => r[0]);
    const yVals = validRows.map((r) => Number(r[1]));
    const traces: any[] = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: xVals,
        y: yVals,
        fill: isArea ? 'tozeroy' : undefined,
        fillcolor: isArea
          ? (isDark ? hexToRgba(primaryColor, 0.22) : hexToRgba(primaryColor, 0.12))
          : undefined,
        line: { color: primaryColor, width: 2.5 },
        marker: { color: primaryColor, size: 5 },
      },
    ];

    if (spec.trendline && spec.trendline.type !== 'none') {
      const trendTrace = buildTrendlineTrace(
        spec.trendline,
        xVals,
        yVals,
        { primaryColor, isDark }
      );
      if (trendTrace) {
        traces.push(trendTrace);
      }
    }

    return { isBigNumber: false, primaryColor, traces, layout: lineLayout };
  }, [data, isDark, height, spec, columns, rows, customColor, crossFilters]);

  const handlePlotClick = (event: any) => {
    if (!onPointClick || !event || !event.points || event.points.length === 0) return;
    const pt = event.points[0];
    let clickedCol: string | undefined = undefined;
    let clickedVal: any = undefined;

    if (spec.chart_type === 'bar') {
      clickedCol = spec.x?.column;
      clickedVal = pt.x;
    } else if (spec.chart_type === 'hbar') {
      clickedCol = spec.x?.column;
      clickedVal = pt.y;
    } else if (spec.chart_type === 'pie' || spec.chart_type === 'donut') {
      clickedCol = spec.x?.column;
      clickedVal = pt.label;
    } else if (spec.chart_type === 'heatmap') {
      clickedCol = spec.x?.column;
      clickedVal = pt.x;
    }

    if (clickedCol && clickedVal != null) {
      onPointClick(clickedCol, clickedVal);
    }
  };

  if (plotConfig.isBigNumber) {
    return (
      <div className={`flex flex-col items-center justify-center py-6 px-4 w-full text-center ${className}`}>
        <span
          className="text-4xl sm:text-5xl font-extrabold font-mono tracking-tight"
          style={{ color: plotConfig.primaryColor }}
        >
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
          displayModeBar: 'hover',
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
        onClick={handlePlotClick}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
