import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';

export interface ChartColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onReset?: () => void;
  defaultColor?: string;
  className?: string;
}

// 14 signature swatches matching the exact 2-row layout from design
const DEFAULT_SAVED_COLORS = [
  // Row 1
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#4F46E5', // Indigo (Signature)
  // Row 2
  '#EC4899', // Pink
  '#E11D48', // Crimson
  '#D946EF', // Fuchsia
  '#8B5CF6', // Purple
  '#0284C7', // Sky
  '#059669', // Emerald
  '#84CC16', // Lime
];

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length === 4) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const a = clean.length === 8 ? parseInt(clean.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const ChartColorPicker: React.FC<ChartColorPickerProps> = ({
  color,
  onChange,
  onReset,
  defaultColor,
  className = '',
}) => {
  // Initialize HSV from active color
  const [hsv, setHsv] = useState(() => {
    const parsed = hexToRgb(color || '#4F46E5');
    const { h, s, v } = rgbToHsv(parsed.r, parsed.g, parsed.b);
    return { h, s, v, a: parsed.a };
  });

  const [formatMode, setFormatMode] = useState<'hex' | 'rgb' | 'hsl'>('hex');
  const [hexInputText, setHexInputText] = useState(() => {
    const clean = (color || '#4F46E5').replace('#', '').toUpperCase();
    return clean.length > 6 ? clean.substring(0, 6) : clean;
  });

  const [savedColors, setSavedColors] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('dc_saved_chart_colors');
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return DEFAULT_SAVED_COLORS;
  });

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  // Sync state if color changes from external props
  useEffect(() => {
    if (!color) return;
    const parsed = hexToRgb(color);
    const { h, s, v } = rgbToHsv(parsed.r, parsed.g, parsed.b);
    setHsv((prev) => ({
      h: s === 0 && v === 0 ? prev.h : h,
      s,
      v,
      a: parsed.a ?? 1,
    }));
    setHexInputText(color.replace('#', '').toUpperCase().substring(0, 6));
  }, [color]);

  const currentRgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const currentHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);

  const notifyChange = useCallback(
    (nextHsv: { h: number; s: number; v: number; a: number }) => {
      const rgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      setHexInputText(hex.replace('#', ''));
      onChange(hex);
    },
    [onChange]
  );

  // SV Box Dragging
  const handleSvPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const s = x / rect.width;
    const v = 1 - y / rect.height;
    setHsv((prev) => {
      const next = { ...prev, s, v };
      notifyChange(next);
      return next;
    });
  };

  // Hue Slider Dragging
  const handleHuePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const h = Math.round((x / rect.width) * 360) % 360;
    setHsv((prev) => {
      const next = { ...prev, h };
      notifyChange(next);
      return next;
    });
  };

  // Alpha Slider Dragging
  const handleAlphaPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!alphaRef.current) return;
    const rect = alphaRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const a = Math.round((x / rect.width) * 100) / 100;
    setHsv((prev) => {
      const next = { ...prev, a };
      notifyChange(next);
      return next;
    });
  };

  const handleAddSavedColor = () => {
    if (!savedColors.includes(currentHex)) {
      const updated = [currentHex, ...savedColors].slice(0, 21);
      setSavedColors(updated);
      try {
        localStorage.setItem('dc_saved_chart_colors', JSON.stringify(updated));
      } catch {}
    }
  };

  const handleSelectSwatch = (hex: string) => {
    const parsed = hexToRgb(hex);
    const { h, s, v } = rgbToHsv(parsed.r, parsed.g, parsed.b);
    setHsv({ h, s, v, a: 1 });
    setHexInputText(hex.replace('#', '').toUpperCase());
    onChange(hex);
  };

  const handleReset = () => {
    if (defaultColor) {
      handleSelectSwatch(defaultColor);
    }
    if (onReset) {
      onReset();
    }
  };

  const toggleFormat = () => {
    setFormatMode((prev) => (prev === 'hex' ? 'rgb' : prev === 'rgb' ? 'hsl' : 'hex'));
  };

  return (
    <div
      className={`w-[276px] p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-md select-none space-y-3 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. 2D Saturation / Value Gradient Canvas */}
      <div
        ref={svRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handleSvPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) handleSvPointer(e);
        }}
        className="relative w-full h-36 rounded-xl overflow-hidden cursor-crosshair touch-none shadow-inner"
        style={{
          backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
          backgroundImage: `
            linear-gradient(to top, #000000, transparent),
            linear-gradient(to right, #ffffff, transparent)
          `,
        }}
      >
        {/* SV Draggable Handle */}
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* 2. Hue Rainbow Slider */}
      <div
        ref={hueRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handleHuePointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) handleHuePointer(e);
        }}
        className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-xs"
        style={{
          background:
            'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
        }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
          }}
        />
      </div>

      {/* 3. Alpha / Opacity Slider */}
      <div
        ref={alphaRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handleAlphaPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) handleAlphaPointer(e);
        }}
        className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-xs overflow-hidden"
        style={{
          backgroundImage: `
            linear-gradient(to right, transparent, ${currentHex}),
            repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%)
          `,
          backgroundSize: '100% 100%, 8px 8px',
        }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `${hsv.a * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* 4. Format & Value Inputs Row */}
      <div className="flex items-center gap-2 pt-0.5">
        {/* Format Switcher Pill */}
        <button
          type="button"
          onClick={toggleFormat}
          className="flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          title="Toggle color format (Hex, RGB, HSL)"
        >
          <span>{formatMode.toUpperCase()}</span>
          <ChevronsUpDown className="w-3 h-3 text-zinc-400" />
        </button>

        {/* Hex Text Box */}
        {formatMode === 'hex' && (
          <div className="flex-1 flex items-center px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus-within:border-blue-500 transition-colors">
            <span className="text-zinc-400 dark:text-zinc-500 font-semibold select-none mr-1.5">#</span>
            <input
              type="text"
              value={hexInputText}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                setHexInputText(val);
                if (val.length === 6 || val.length === 3) {
                  const fullHex = `#${val}`;
                  const parsed = hexToRgb(fullHex);
                  const hsvRes = rgbToHsv(parsed.r, parsed.g, parsed.b);
                  setHsv((prev) => ({ ...prev, ...hsvRes }));
                  onChange(fullHex);
                }
              }}
              onBlur={() => {
                if (hexInputText.length !== 6 && hexInputText.length !== 3) {
                  setHexInputText(currentHex.replace('#', ''));
                }
              }}
              placeholder="4F46E5"
              className="w-full bg-transparent focus:outline-none uppercase font-mono tracking-wider text-xs"
            />
          </div>
        )}

        {/* RGB Mode */}
        {formatMode === 'rgb' && (
          <div className="flex-1 grid grid-cols-3 gap-1">
            {(['r', 'g', 'b'] as const).map((ch) => (
              <input
                key={ch}
                type="number"
                min="0"
                max="255"
                value={currentRgb[ch]}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(255, Number(e.target.value) || 0));
                  const newRgb = { ...currentRgb, [ch]: val };
                  const newHsv = rgbToHsv(newRgb.r, newRgb.g, newRgb.b);
                  setHsv((prev) => ({ ...prev, ...newHsv }));
                  onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
                }}
                className="w-full text-center px-1 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            ))}
          </div>
        )}

        {/* HSL Mode */}
        {formatMode === 'hsl' && (
          <div className="flex-1 grid grid-cols-3 gap-1">
            <input
              type="number"
              min="0"
              max="360"
              value={hsv.h}
              onChange={(e) => {
                const h = Math.max(0, Math.min(360, Number(e.target.value) || 0));
                setHsv((prev) => {
                  const next = { ...prev, h };
                  notifyChange(next);
                  return next;
                });
              }}
              className="w-full text-center px-1 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(hsv.s * 100)}
              onChange={(e) => {
                const s = Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100;
                setHsv((prev) => {
                  const next = { ...prev, s };
                  notifyChange(next);
                  return next;
                });
              }}
              className="w-full text-center px-1 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(hsv.v * 100)}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100;
                setHsv((prev) => {
                  const next = { ...prev, v };
                  notifyChange(next);
                  return next;
                });
              }}
              className="w-full text-center px-1 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Percentage / Opacity Input */}
        <div className="w-16 flex items-center justify-center px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200">
          <span>{Math.round(hsv.a * 100)}%</span>
        </div>
      </div>

      {/* 5. Saved Colors Section */}
      <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">Saved colors:</span>
          <div className="flex items-center gap-2">
            {onReset && (
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium cursor-pointer transition-colors"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={handleAddSavedColor}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              + Add
            </button>
          </div>
        </div>

        {/* 2 Rows of 7 Circular Swatches */}
        <div className="grid grid-cols-7 gap-2 pt-0.5">
          {savedColors.slice(0, 14).map((hex, idx) => {
            const isSelected = currentHex.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={`${hex}-${idx}`}
                type="button"
                onClick={() => handleSelectSwatch(hex)}
                className={`w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-110 relative flex items-center justify-center ${
                  isSelected
                    ? 'ring-2 ring-offset-2 ring-zinc-500 dark:ring-zinc-300 ring-offset-white dark:ring-offset-zinc-900 scale-105'
                    : 'border border-black/10 dark:border-white/10 hover:shadow-xs'
                }`}
                style={{ backgroundColor: hex }}
                title={hex}
              >
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] stroke-[2.5]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
