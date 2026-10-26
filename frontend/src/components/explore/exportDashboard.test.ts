import { describe, it, expect } from 'vitest';
import { generateDashboardHtml } from './exportDashboard';
import type { QueryUploadResult } from '../../lib/api';
import type { ChartCardItem } from './ChartCard';

describe('exportDashboard', () => {
  const mockDataset: QueryUploadResult = {
    query_id: 'test-job-123',
    filename: 'sales_performance.csv',
    row_count: 54200,
    file_size_bytes: 2450000,
    columns: ['region', 'revenue'],
  };

  const mockCards: ChartCardItem[] = [
    {
      id: 'card-1',
      spec: {
        title: 'Total Revenue by Region',
        chart_type: 'bar',
        x: { column: 'region' },
        y: { column: 'revenue' },
        aggregation: 'sum',
        custom_color: '#FF4B3E',
      },
      originalSpec: {
        title: 'Total Revenue by Region',
        chart_type: 'bar',
        x: { column: 'region' },
        y: { column: 'revenue' },
        aggregation: 'sum',
      },
      data: {
        spec: {
          chart_type: 'bar',
          x: { column: 'region' },
          y: { column: 'revenue' },
          aggregation: 'sum',
        },
        columns: ['region', 'revenue'],
        rows: [
          ['North', 150000],
          ['South', 120000],
        ],
        row_count: 2,
        notes: [],
        warnings: [],
        elapsed_seconds: 0.05,
      },
      source: 'standard',
    },
  ];

  it('generates standalone HTML containing executive briefing header and Plotly script', () => {
    const html = generateDashboardHtml('Executive Q3 Performance', mockDataset, mockCards);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Executive Q3 Performance');
    expect(html).toContain('sales_performance.csv');
    expect(html).toContain('54,200');
    expect(html).toContain('cdn.plot.ly/plotly');
    expect(html).toContain('Total Revenue by Region');
    expect(html).toContain('window.print()');
  });

  it('safely escapes script tags to prevent HTML injection', () => {
    const dangerousDataset = {
      ...mockDataset,
      filename: '</script><script>alert(1)</script>',
    };
    const html = generateDashboardHtml('Malicious <script>', dangerousDataset, mockCards);

    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c/script\\u003e');
  });
});
