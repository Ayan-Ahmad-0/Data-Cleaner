/**
 * Mathematical calculations and Plotly trace generators for Trendlines,
 * Simple Moving Averages (SMA), Exponential Moving Averages (EMA),
 * and Ordinary Least Squares (OLS) Linear Regression.
 */

import type { TrendlineConfig } from '../../lib/api';

export interface LinearRegressionResult {
  x: any[];
  y: number[];
  slope: number;
  intercept: number;
  r2: number;
  equation: string;
}

export interface MovingAverageResult {
  x: any[];
  y: number[];
}

/**
 * Computes a Simple Moving Average (SMA) over a series.
 * Drops the first (window - 1) warmup points so the moving average is strictly computed.
 */
export function calculateSMA(x: any[], y: number[], window: number): MovingAverageResult {
  const w = Math.max(2, Math.floor(window));
  if (!y || y.length < w) {
    return { x: [], y: [] };
  }

  const resultX: any[] = [];
  const resultY: number[] = [];

  let currentSum = 0;
  for (let i = 0; i < w; i++) {
    currentSum += y[i];
  }
  resultX.push(x[w - 1]);
  resultY.push(Number((currentSum / w).toFixed(4)));

  for (let i = w; i < y.length; i++) {
    currentSum += y[i] - y[i - w];
    resultX.push(x[i]);
    resultY.push(Number((currentSum / w).toFixed(4)));
  }

  return { x: resultX, y: resultY };
}

/**
 * Computes an Exponential Moving Average (EMA) over a series.
 * Uses smoothing factor alpha = 2 / (window + 1) with an initial SMA seed.
 */
export function calculateEMA(x: any[], y: number[], window: number): MovingAverageResult {
  const w = Math.max(2, Math.floor(window));
  if (!y || y.length < w) {
    return { x: [], y: [] };
  }

  const alpha = 2 / (w + 1);
  const resultX: any[] = [];
  const resultY: number[] = [];

  // Seed with initial SMA
  let seedSum = 0;
  for (let i = 0; i < w; i++) {
    seedSum += y[i];
  }
  let currentEma = seedSum / w;
  resultX.push(x[w - 1]);
  resultY.push(Number(currentEma.toFixed(4)));

  for (let i = w; i < y.length; i++) {
    currentEma = y[i] * alpha + currentEma * (1 - alpha);
    resultX.push(x[i]);
    resultY.push(Number(currentEma.toFixed(4)));
  }

  return { x: resultX, y: resultY };
}

/**
 * Computes Ordinary Least Squares (OLS) linear regression.
 * Returns best-fit line points, slope, intercept, R-squared score, and formatted equation.
 */
export function calculateLinearRegression(x: any[], y: number[]): LinearRegressionResult {
  const n = y.length;
  if (!y || n < 2) {
    return { x: [], y: [], slope: 0, intercept: 0, r2: 0, equation: '' };
  }

  // Determine whether X is numeric or date-based
  const numericX: number[] = [];
  let isDateOrNumeric = true;

  for (let i = 0; i < n; i++) {
    const val = x[i];
    if (typeof val === 'number' && !isNaN(val)) {
      numericX.push(val);
    } else if (typeof val === 'string' && !isNaN(Date.parse(val))) {
      numericX.push(Date.parse(val));
    } else {
      isDateOrNumeric = false;
      break;
    }
  }

  // Fallback to sequential index if X values are arbitrary categorical strings
  const effectiveX = isDateOrNumeric ? numericX : x.map((_, idx) => idx);

  // Compute means
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += effectiveX[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Compute slope (m) and intercept (b)
  let ssXX = 0;
  let ssXY = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const diffX = effectiveX[i] - meanX;
    const diffY = y[i] - meanY;
    ssXX += diffX * diffX;
    ssXY += diffX * diffY;
    ssTot += diffY * diffY;
  }

  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  const intercept = meanY - slope * meanX;

  // Compute fitted values and R-squared
  let ssRes = 0;
  const fittedY: number[] = [];
  for (let i = 0; i < n; i++) {
    const fit = slope * effectiveX[i] + intercept;
    fittedY.push(Number(fit.toFixed(4)));
    const res = y[i] - fit;
    ssRes += res * res;
  }

  const r2 = ssTot !== 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;

  // Format equation
  const formatCoeff = (v: number) => {
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (Math.abs(v) >= 1) return v.toFixed(2);
    return v.toFixed(4);
  };

  const sign = intercept >= 0 ? '+' : '-';
  const equation = `y = ${formatCoeff(slope)}x ${sign} ${formatCoeff(Math.abs(intercept))} (R² = ${r2.toFixed(2)})`;

  return {
    x,
    y: fittedY,
    slope,
    intercept,
    r2: Number(r2.toFixed(3)),
    equation,
  };
}

/**
 * Builds a Plotly-ready trace for an active trendline overlay.
 */
export function buildTrendlineTrace(
  trendline: TrendlineConfig,
  xVals: any[],
  yVals: number[],
  options?: {
    seriesName?: string;
    primaryColor?: string;
    isDark?: boolean;
  }
): any | null {
  if (!trendline || trendline.type === 'none' || !yVals || yVals.length < 2) {
    return null;
  }

  const { seriesName, primaryColor = '#f59e0b', isDark = true } = options || {};
  const window = trendline.window || 7;
  const strokeColor = trendline.color || (primaryColor === '#f59e0b' ? '#38bdf8' : '#f59e0b');
  const dashStyle = trendline.line_style || 'dash';

  let traceX: any[] = [];
  let traceY: number[] = [];
  let traceName = '';
  let hoverTemplate = '';

  if (trendline.type === 'sma') {
    const sma = calculateSMA(xVals, yVals, window);
    if (sma.x.length === 0) return null;
    traceX = sma.x;
    traceY = sma.y;
    traceName = seriesName ? `${seriesName} SMA (${window})` : `SMA (${window})`;
    hoverTemplate = `<b>${traceName}</b><br>%{x}: <b>%{y:,.2f}</b><extra></extra>`;
  } else if (trendline.type === 'ema') {
    const ema = calculateEMA(xVals, yVals, window);
    if (ema.x.length === 0) return null;
    traceX = ema.x;
    traceY = ema.y;
    traceName = seriesName ? `${seriesName} EMA (${window})` : `EMA (${window})`;
    hoverTemplate = `<b>${traceName}</b><br>%{x}: <b>%{y:,.2f}</b><extra></extra>`;
  } else if (trendline.type === 'linear') {
    const ols = calculateLinearRegression(xVals, yVals);
    if (ols.x.length === 0) return null;
    traceX = ols.x;
    traceY = ols.y;
    const r2Label = `R² = ${ols.r2.toFixed(2)}`;
    traceName = trendline.show_equation
      ? (seriesName ? `${seriesName} Trend (${r2Label})` : ols.equation)
      : (seriesName ? `${seriesName} Trend (${r2Label})` : `Linear Trend (${r2Label})`);
    hoverTemplate = `<b>${traceName}</b><br>%{x}: <b>%{y:,.2f}</b><extra></extra>`;
  } else {
    return null;
  }

  return {
    type: 'scatter',
    mode: 'lines',
    name: traceName,
    x: traceX,
    y: traceY,
    line: {
      color: strokeColor,
      width: 2,
      dash: dashStyle,
    },
    hoverinfo: 'all',
    hovertemplate: hoverTemplate,
    hoverlabel: {
      bgcolor: isDark ? '#18181b' : '#ffffff',
      bordercolor: strokeColor,
    },
  };
}
