import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateLinearRegression,
  buildTrendlineTrace,
} from './trendlineMath';

describe('trendlineMath', () => {
  describe('calculateSMA', () => {
    it('computes exact moving average and drops warmup periods', () => {
      const x = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
      const y = [10, 20, 30, 40, 50];
      const result = calculateSMA(x, y, 3);

      expect(result.x).toEqual(['2024-01-03', '2024-01-04', '2024-01-05']);
      expect(result.y).toEqual([20, 30, 40]);
    });

    it('returns empty when series is shorter than window', () => {
      const x = ['A', 'B'];
      const y = [10, 20];
      const result = calculateSMA(x, y, 5);
      expect(result.x).toHaveLength(0);
      expect(result.y).toHaveLength(0);
    });
  });

  describe('calculateEMA', () => {
    it('computes exponential moving average starting from initial SMA seed', () => {
      const x = ['D1', 'D2', 'D3', 'D4', 'D5'];
      const y = [10, 20, 30, 40, 50];
      const result = calculateEMA(x, y, 3);

      expect(result.x).toHaveLength(3);
      expect(result.y[0]).toBe(20); // Initial SMA seed
      expect(result.y[1]).toBeGreaterThan(20);
      expect(result.y[2]).toBeGreaterThan(result.y[1]);
    });
  });

  describe('calculateLinearRegression', () => {
    it('fits perfect linear data with R2 = 1.0', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // y = 2x + 0
      const result = calculateLinearRegression(x, y);

      expect(result.slope).toBeCloseTo(2, 2);
      expect(result.intercept).toBeCloseTo(0, 2);
      expect(result.r2).toBe(1);
      expect(result.y).toEqual([2, 4, 6, 8, 10]);
      expect(result.equation).toContain('y = 2.00x + 0.00');
    });

    it('handles date strings by parsing timestamps', () => {
      const x = ['2024-01-01', '2024-01-02', '2024-01-03'];
      const y = [100, 110, 120];
      const result = calculateLinearRegression(x, y);

      expect(result.r2).toBe(1);
      expect(result.y).toEqual([100, 110, 120]);
    });
  });

  describe('buildTrendlineTrace', () => {
    it('generates a valid Plotly dashed scatter trace for SMA', () => {
      const trace = buildTrendlineTrace(
        { type: 'sma', window: 3, line_style: 'dash' },
        ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
        [10, 20, 30, 40]
      );

      expect(trace).not.toBeNull();
      expect(trace.type).toBe('scatter');
      expect(trace.mode).toBe('lines');
      expect(trace.name).toBe('SMA (3)');
      expect(trace.line.dash).toBe('dash');
      expect(trace.x).toEqual(['2024-01-03', '2024-01-04']);
      expect(trace.y).toEqual([20, 30]);
    });

    it('returns null if trendline type is none', () => {
      const trace = buildTrendlineTrace({ type: 'none' }, ['A', 'B'], [10, 20]);
      expect(trace).toBeNull();
    });
  });
});
