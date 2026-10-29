import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatNumber,
  formatPercent,
  pluralize,
  deriveColumnStatus,
  cleanRuleSentence,
} from './format';
import type { ColumnProfile } from '../types';

describe('formatBytes', () => {
  it('formats zero or invalid bytes safely', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
  });

  it('formats bytes, KB, MB, and GB adaptively', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(613713)).toBe('599.3 KB');
    expect(formatBytes(3365824)).toBe('3.21 MB');
    expect(formatBytes(1073741824)).toBe('1.00 GB');
    expect(formatBytes(6871947673)).toBe('6.40 GB');
  });
});

describe('formatNumber', () => {
  it('formats integers with commas', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(10600)).toBe('10,600');
    expect(formatNumber(15000000)).toBe('15,000,000');
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats standard percentages cleanly', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(4.21)).toBe('4.21%');
    expect(formatPercent(12.5)).toBe('12.5%');
  });

  it('formats tiny fractions as <0.01% instead of 0%', () => {
    expect(formatPercent(0.004)).toBe('<0.01%');
    expect(formatPercent(0.009)).toBe('<0.01%');
  });
});

describe('pluralize', () => {
  it('correctly handles singular and plural forms', () => {
    expect(pluralize(1, 'row', 'rows')).toBe('1 row');
    expect(pluralize(2, 'row', 'rows')).toBe('2 rows');
    expect(pluralize(10600, 'row', 'rows')).toBe('10,600 rows');
    expect(pluralize(1, 'column requires', 'columns require')).toBe('1 column requires');
    expect(pluralize(3, 'column requires', 'columns require')).toBe('3 columns require');
  });
});

describe('deriveColumnStatus', () => {
  it('identifies truly clean columns as clean', () => {
    const cleanCol: ColumnProfile = {
      inferred_type: 'string',
      nulls: 0,
      null_pct: 0,
      distinct: 100,
      candidate_key: false,
      null_tokens: {},
      whitespace_issues: 0,
      negatives: 0,
    };
    const status = deriveColumnStatus(cleanCol);
    expect(status.isClean).toBe(true);
    expect(status.severity).toBe('ok');
    expect(status.label).toBe('Clean');
  });

  it('never marks a column clean if it has nulls', () => {
    const nullCol: ColumnProfile = {
      inferred_type: 'string',
      nulls: 420,
      null_pct: 3.96,
      distinct: 100,
      candidate_key: false,
    };
    const status = deriveColumnStatus(nullCol);
    expect(status.isClean).toBe(false);
    expect(status.severity).toBe('warn');
    expect(status.issues.some((i) => i.includes('empty value'))).toBe(true);
  });

  it('marks negative outliers with danger severity', () => {
    const outlierCol: ColumnProfile = {
      inferred_type: 'integer',
      nulls: 0,
      null_pct: 0,
      distinct: 50,
      candidate_key: false,
      negatives: 15,
      min: -120,
    };
    const status = deriveColumnStatus(outlierCol);
    expect(status.isClean).toBe(false);
    expect(status.severity).toBe('danger');
    expect(status.issues.some((i) => i.includes('negative value'))).toBe(true);
  });

  it('flags day/month ambiguity as requiring attention', () => {
    const dateCol: ColumnProfile = {
      inferred_type: 'timestamp',
      nulls: 0,
      null_pct: 0,
      distinct: 500,
      candidate_key: false,
      day_month_ambiguous: true,
    };
    const status = deriveColumnStatus(dateCol);
    expect(status.isClean).toBe(false);
    expect(status.severity).toBe('danger');
    expect(status.issues.some((i) => i.includes('Ambiguous date order'))).toBe(true);
  });
});

describe('cleanRuleSentence', () => {
  it('strips backticks around column names', () => {
    const raw = 'Parse `created_at` using formats %Y-%m-%d, interpreted in `UTC`.';
    expect(cleanRuleSentence(raw)).toBe('Parse created_at using formats %Y-%m-%d, interpreted in UTC.');
  });

  it('fixes awkward pluralization and uppercase steps', () => {
    expect(cleanRuleSentence('Cleaning plan: 1 STEPS')).toBe('Cleaning plan: 1 step');
    expect(cleanRuleSentence('Detected 1 timestamp format variants in timestamp')).toBe(
      'Detected 1 timestamp format variant in timestamp'
    );
  });
});
