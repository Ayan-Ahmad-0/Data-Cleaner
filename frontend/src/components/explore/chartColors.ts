// Curated, modern analytics chart color swatches
export interface ChartColorSwatch {
  id: string;
  label: string;
  hex: string;
}

export const DEFAULT_CHART_COLOR = '#FD4233';
export const DEFAULT_LINE_COLOR = '#E11D48';
export const DEFAULT_AREA_COLOR = '#0284C7';
export const DEFAULT_HEATMAP_COLOR = '#118DFF';

export function getDefaultChartColor(chartType?: string): string {
  if (chartType === 'line') return DEFAULT_LINE_COLOR;
  if (chartType === 'area') return DEFAULT_AREA_COLOR;
  if (chartType === 'heatmap') return DEFAULT_HEATMAP_COLOR;
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
  { id: 'powerbi', label: 'Power BI Blue', hex: '#118DFF' },
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

export function blendWithWhite(hex: string, alpha: number): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return '#f1f5f9';
  const r = Math.round(((num >> 16) & 255) * alpha + 255 * (1 - alpha));
  const g = Math.round(((num >> 8) & 255) * alpha + 255 * (1 - alpha));
  const b = Math.round((num & 255) * alpha + 255 * (1 - alpha));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function blendWithDark(hex: string, alpha: number): string {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return '#1e293b';
  const r = Math.round(((num >> 16) & 255) * alpha + 15 * (1 - alpha));
  const g = Math.round(((num >> 8) & 255) * alpha + 23 * (1 - alpha));
  const b = Math.round((num & 255) * alpha + 42 * (1 - alpha));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Builds authentic Power BI matrix heatmap color scale.
 * Default (#118DFF) matches Microsoft Power BI's signature corporate blue gradient.
 * Custom colors smoothly scale from soft base tint to rich saturated maximum.
 */
export function buildHeatmapColorscale(primaryColor: string, isDark: boolean): [number, string][] {
  const norm = primaryColor.toLowerCase();
  // Signature Power BI Blue
  if (norm === '#118dff' || norm === '#2563eb' || norm === '#0078d4') {
    return isDark
      ? [
          [0, '#132238'],
          [0.25, '#17365d'],
          [0.55, '#1a569b'],
          [0.8, '#0d6efd'],
          [1.0, '#38bdf8'],
        ]
      : [
          [0, '#ebf3fc'],
          [0.3, '#9ec5f7'],
          [0.65, '#3b8ded'],
          [1.0, '#005fb8'],
        ];
  }

  // Any custom color chosen by user
  if (isDark) {
    return [
      [0, blendWithDark(primaryColor, 0.2)],
      [0.3, adjustBrightness(primaryColor, -40)],
      [0.65, adjustBrightness(primaryColor, -10)],
      [1.0, adjustBrightness(primaryColor, 20)],
    ];
  } else {
    return [
      [0, blendWithWhite(primaryColor, 0.1)],
      [0.3, blendWithWhite(primaryColor, 0.38)],
      [0.65, blendWithWhite(primaryColor, 0.72)],
      [1.0, adjustBrightness(primaryColor, -18)],
    ];
  }
}
