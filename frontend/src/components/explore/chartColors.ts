// Curated, modern analytics chart color swatches
export interface ChartColorSwatch {
  id: string;
  label: string;
  hex: string;
}

export const DEFAULT_CHART_COLOR = '#FD4233';
export const DEFAULT_LINE_COLOR = '#E11D48';
export const DEFAULT_AREA_COLOR = '#0284C7';

export function getDefaultChartColor(chartType?: string): string {
  if (chartType === 'line') return DEFAULT_LINE_COLOR;
  if (chartType === 'area') return DEFAULT_AREA_COLOR;
  return DEFAULT_CHART_COLOR;
}

export const CHART_COLOR_SWATCHES: ChartColorSwatch[] = [
  // Warm Reds & Oranges
  { id: 'scarlet', label: 'Scarlet Red', hex: '#FF2400' },
  { id: 'orange', label: 'Coral Orange (Brand)', hex: '#FD4233' },
  { id: 'ruby', label: 'Crimson Ruby', hex: '#E11D48' },
  { id: 'tangerine', label: 'Warm Tangerine', hex: '#F97316' },
  { id: 'amber', label: 'Amber Gold', hex: '#F59E0B' },
  { id: 'yellow', label: 'Canary Yellow', hex: '#EAB308' },
  { id: 'bronze', label: 'Warm Bronze', hex: '#B45309' },

  // Greens & Teals
  { id: 'lime', label: 'Chartreuse Lime', hex: '#84CC16' },
  { id: 'emerald', label: 'Emerald Green', hex: '#10B981' },
  { id: 'jade', label: 'Deep Jade', hex: '#059669' },
  { id: 'teal', label: 'Deep Teal', hex: '#0D9488' },
  { id: 'cyan', label: 'Sky Cyan', hex: '#06B6D4' },

  // Blues & Purples
  { id: 'azure', label: 'Ocean Azure', hex: '#0284C7' },
  { id: 'blue', label: 'Royal Blue', hex: '#2563EB' },
  { id: 'indigo', label: 'Deep Indigo', hex: '#4F46E5' },
  { id: 'violet', label: 'Vibrant Violet', hex: '#7C3AED' },
  { id: 'purple', label: 'Purple Orchid', hex: '#9333EA' },

  // Pinks & Neutrals
  { id: 'fuchsia', label: 'Vivid Fuchsia', hex: '#C026D3' },
  { id: 'rose', label: 'Rose Pink', hex: '#EC4899' },
  { id: 'coral', label: 'Coral Rose', hex: '#F43F5E' },
  { id: 'slate', label: 'Cool Slate', hex: '#64748B' },
];

export const FALLBACK_PALETTE = [
  '#FD4233',
  '#0284C7',
  '#E11D48',
  '#FF2400',
  '#2563EB',
  '#10B981',
  '#7C3AED',
  '#F59E0B',
  '#06B6D4',
  '#EC4899',
  '#84CC16',
  '#4F46E5',
  '#F97316',
  '#0D9488',
  '#9333EA',
  '#64748B',
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
