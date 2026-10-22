// Curated, modern analytics chart color swatches
export interface ChartColorSwatch {
  id: string;
  label: string;
  hex: string;
}

export const DEFAULT_CHART_COLOR = '#FD4233';

export const CHART_COLOR_SWATCHES: ChartColorSwatch[] = [
  { id: 'orange', label: 'Coral Orange', hex: '#FD4233' },
  { id: 'blue', label: 'Electric Blue', hex: '#2563EB' },
  { id: 'emerald', label: 'Emerald Green', hex: '#059669' },
  { id: 'violet', label: 'Vibrant Violet', hex: '#7C3AED' },
  { id: 'amber', label: 'Amber Gold', hex: '#D97706' },
  { id: 'rose', label: 'Rose Pink', hex: '#DB2777' },
  { id: 'cyan', label: 'Sky Cyan', hex: '#0284C7' },
  { id: 'indigo', label: 'Deep Indigo', hex: '#4F46E5' },
  { id: 'slate', label: 'Cool Slate', hex: '#475569' },
];

export const FALLBACK_PALETTE = [
  '#FD4233',
  '#2563EB',
  '#059669',
  '#7C3AED',
  '#D97706',
  '#DB2777',
  '#0284C7',
  '#4F46E5',
  '#475569',
];

export function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) {
    return `rgba(253, 66, 51, ${alpha})`;
  }
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function adjustBrightness(hex: string, percent: number): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return hex;
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 255) + Math.round(255 * (percent / 100))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function buildPaletteWithPrimary(primaryHex: string): string[] {
  const norm = primaryHex.toLowerCase();
  const rest = FALLBACK_PALETTE.filter((c) => c.toLowerCase() !== norm);
  return [primaryHex, ...rest];
}
