/**
 * Pure formatting and status derivation helpers.
 * Kept strictly pure for unit testing and deterministic rendering.
 */

import type { ColumnProfile } from '../types';

/**
 * Format raw byte count into adaptive human-readable unit.
 * Examples: 613713 -> "613.7 KB", 3365824 -> "3.21 MB", 1073741824 -> "1.00 GB"
 */
export function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Format a number with locale thousands separators.
 */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

/**
 * Format a percentage with proper handling of tiny values.
 * e.g., 0 -> "0%", 0.004 -> "<0.01%", 3.42 -> "3.42%"
 */
export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || isNaN(pct) || pct === 0) return '0%';
  if (pct > 0 && pct < 0.01) return '<0.01%';
  return `${pct.toFixed(pct >= 10 ? 1 : 2)}%`;
}

/**
 * Pluralize a word based on count.
 * e.g., pluralize(1, 'row', 'rows') -> "1 row", pluralize(4, 'row', 'rows') -> "4 rows"
 */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export interface ColumnStatusSummary {
  isClean: boolean;
  severity: 'ok' | 'warn' | 'danger';
  label: string;
  issues: string[];
}

/**
 * Derive true column status from actual profile metrics.
 * NEVER labels a column clean if it contains nulls, negative outliers,
 * whitespace anomalies, or format ambiguities.
 */
export function deriveColumnStatus(meta: ColumnProfile): ColumnStatusSummary {
  const issues: string[] = [];

  const nullCount = meta.nulls || 0;
  const nullPct = meta.null_pct || 0;
  if (nullCount > 0) {
    issues.push(`${pluralize(nullCount, 'empty value', 'empty values')} (${formatPercent(nullPct)})`);
  }

  const nullTokens = meta.null_tokens || {};
  const tokenSum = Object.values(nullTokens).reduce((sum, n) => sum + Number(n), 0);
  if (tokenSum > 0) {
    issues.push(`${pluralize(tokenSum, 'placeholder token', 'placeholder tokens')} ("N/A", "null", etc.)`);
  }

  const ws = meta.whitespace_issues || 0;
  if (ws > 0) {
    issues.push(`${pluralize(ws, 'value with stray whitespace', 'values with stray whitespace')}`);
  }

  const negatives = meta.negatives || 0;
  if (negatives > 0) {
    issues.push(`${pluralize(negatives, 'negative value', 'negative values')} (min: ${meta.min})`);
  }

  if (meta.day_month_ambiguous) {
    issues.push('Ambiguous date order (DD/MM vs MM/DD requires confirmation)');
  }

  if (issues.length === 0) {
    return {
      isClean: true,
      severity: 'ok',
      label: 'Clean',
      issues: [],
    };
  }

  const hasCritical = negatives > 0 || (nullPct > 20) || meta.day_month_ambiguous;
  return {
    isClean: false,
    severity: hasCritical ? 'danger' : 'warn',
    label: issues.length === 1 ? issues[0] : `${issues.length} issues detected`,
    issues,
  };
}

/**
 * Clean recipe plain-English strings:
 * - Remove literal backticks: `event_id` -> event_id
 * - Clean grammar and awkward capitalization
 */
export function cleanRuleSentence(ruleStr: string): string {
  if (!ruleStr) return '';
  return ruleStr
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\b1 STEPS\b/gi, '1 step')
    .replace(/\bDetected 1 timestamp format variants\b/gi, 'Detected 1 timestamp format variant')
    .trim();
}
