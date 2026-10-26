import React, { useState, useEffect } from 'react';
import {
  type ChartColumnStats,
  type ChartDataResponse,
  type ChartSpec,
  exportChartCsv,
} from '../../lib/api';
import { ChartTweakPanel } from './ChartTweakPanel';
import { PlotlyChartRenderer } from './PlotlyChartRenderer';
import {
  BRAND_CHART_SWATCHES,
  DEFAULT_CHART_COLOR,
  getDefaultChartColor,
} from './chartColors';
import { ChartColorPicker } from './ChartColorPicker';
import {
  Sliders,
  Download,
  Trash2,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  Palette,
  Check,
  RefreshCw,
} from 'lucide-react';

export interface ChartCardItem {
  id: string;
  spec: ChartSpec;
  originalSpec: ChartSpec;
  data: ChartDataResponse | null;
  loading?: boolean;
  error?: string | null;
  source: 'ai' | 'standard' | 'manual';
  questionAnswered?: string;
  why?: string;
  caveats?: string[];
  explanation?: string;
  assumptions?: string[];
  isEdited?: boolean;
}

interface ChartCardProps {
  jobId: string;
  item: ChartCardItem;
  columns: ChartColumnStats[];
  onUpdateSpec: (id: string, updatedSpec: ChartSpec) => void;
  onResetSpec: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  globalColor?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  jobId,
  item,
  columns,
  onUpdateSpec,
  onResetSpec,
  onRemove,
  onRetry,
  globalColor,
}) => {
  const [isTweakOpen, setIsTweakOpen] = useState(false);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportChartCsv(jobId, item.spec);
    } catch (err: any) {
      console.error('Failed to export chart CSV:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const hasWhyDetails =
    item.questionAnswered || item.why || (item.caveats && item.caveats.length > 0) || item.explanation;
  const defaultColor = getDefaultChartColor(item.spec.chart_type);
  const isKpi = item.spec.chart_type === 'big_number';
  const activeColor =
    item.spec.custom_color ||
    (globalColor && globalColor !== DEFAULT_CHART_COLOR ? globalColor : defaultColor);
  const [hexInput, setHexInput] = useState(activeColor);

  useEffect(() => {
    setHexInput(activeColor);
  }, [activeColor]);

  // KPI card value extraction
  const kpiRaw = item.data?.rows?.length && item.data.rows[0]?.length ? item.data.rows[0][0] : 0;
  const kpiFormatted = typeof kpiRaw === 'number' ? Number(kpiRaw).toLocaleString() : String(kpiRaw ?? 0);

  return (
    <div className="bg-[var(--bg-surface)] backdrop-blur border border-[var(--border-hairline)] rounded-xl p-4 sm:p-5 shadow-[var(--shadow-card)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between group">
      {/* 1. Card Header: Title + Category Pill on Left; Muted Utility Button Group on Right */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--border-hairline)]/60">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate tracking-tight">
            {item.spec.title || `${item.spec.chart_type.toUpperCase()} Chart`}
          </h3>

          {item.source === 'ai' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)] shrink-0">
              <Sparkles className="w-2.5 h-2.5" /> AI Pick
            </span>
          ) : item.source === 'standard' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)] shrink-0">
              Standard
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)] shrink-0">
              Custom
            </span>
          )}

          {item.isEdited && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/25 shrink-0">
              Edited
            </span>
          )}
        </div>

        {/* Compact Utility Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Quick Color Picker Trigger & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Change chart color"
              aria-label="Change chart color"
            >
              <Palette className="w-3.5 h-3.5" />
              <span
                className="w-2 h-2 rounded-full inline-block shrink-0 ring-1 ring-white/20"
                style={{ backgroundColor: activeColor }}
              />
            </button>

            {isColorPickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsColorPickerOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <ChartColorPicker
                    color={activeColor}
                    onChange={(newColor) => {
                      onUpdateSpec(item.id, { ...item.spec, custom_color: newColor });
                    }}
                    onReset={
                      item.spec.custom_color
                        ? () => onUpdateSpec(item.id, { ...item.spec, custom_color: null })
                        : undefined
                    }
                    defaultColor={defaultColor}
                  />
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setIsTweakOpen(true)}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Tweak chart parameters"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting || !item.data}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-40"
            title="Export chart data as CSV"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => onRemove(item.id)}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Remove chart"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Chart / KPI Render Area */}
      <div className="w-full flex-1 flex items-center justify-center my-1 min-h-[280px]">
        {item.loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
            <span className="text-xs">Computing chart data...</span>
          </div>
        ) : item.error ? (
          <div className="flex flex-col items-center justify-center p-5 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-xs max-w-sm w-full text-center space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-semibold text-sm">Failed to render chart</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] line-clamp-3 leading-relaxed">
              {item.error}
            </p>
            <button
              onClick={() => (onRetry ? onRetry(item.id) : onUpdateSpec(item.id, item.spec))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors cursor-pointer mt-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Render</span>
            </button>
          </div>
        ) : item.data ? (
          isKpi ? (
            /* Sleek KPI Card Display with dynamic custom color */
            <div className="py-8 px-4 flex flex-col items-center justify-center text-center w-full">
              <span
                className="text-5xl sm:text-6xl font-extrabold font-mono tracking-tight"
                style={{ color: activeColor }}
              >
                {kpiFormatted}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-medium mt-2 uppercase tracking-wider">
                {item.spec.y?.column ? `Total ${item.spec.y.column}` : 'Total rows in dataset'}
              </span>
            </div>
          ) : (
            <PlotlyChartRenderer data={item.data} height={310} customColor={activeColor} />
          )
        ) : (
          <div className="text-xs text-[var(--text-muted)]">No data available</div>
        )}
      </div>

      {/* 3. Card Footer: Metadata Notes & 'Why this chart?' Toggle */}
      {(hasWhyDetails || (item.data && (item.data.notes.length > 0 || item.data.warnings.length > 0))) && (
        <div className="border-t border-[var(--border-hairline)]/70 pt-2.5 mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
          {/* Notes / Data Caps */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.data && [...item.data.notes, ...item.data.warnings].map((n, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
              >
                <Info className="w-3 h-3 text-[var(--text-muted)]" />
                {n}
              </span>
            ))}
          </div>

          {/* Expandable Why Toggle */}
          {hasWhyDetails && (
            <button
              onClick={() => setIsWhyOpen(!isWhyOpen)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors ml-auto cursor-pointer font-medium"
            >
              <HelpCircle className="w-3 h-3 text-[var(--accent)]" />
              <span>Why this chart?</span>
              {isWhyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}

      {/* Expandable Why Details Accordion */}
      {isWhyOpen && hasWhyDetails && (
        <div className="p-3 bg-[var(--bg-subtle)]/50 border border-[var(--border-hairline)] rounded-lg text-xs text-[var(--text-secondary)] space-y-1.5 mt-2 animate-in fade-in duration-150">
          {item.questionAnswered && (
            <p><strong className="text-[var(--text-primary)]">Question answered:</strong> {item.questionAnswered}</p>
          )}
          {item.explanation && (
            <p><strong className="text-[var(--text-primary)]">What it shows:</strong> {item.explanation}</p>
          )}
          {item.why && (
            <p><strong className="text-[var(--text-primary)]">Rationale:</strong> {item.why}</p>
          )}
          {item.assumptions && item.assumptions.length > 0 && (
            <p className="text-[11px] text-[var(--text-muted)]"><strong>Assumptions:</strong> {item.assumptions.join('; ')}</p>
          )}
          {item.caveats && item.caveats.length > 0 && (
            <div className="text-[11px] text-amber-500/90 pt-0.5"><strong>Caveats:</strong> {item.caveats.join('; ')}</div>
          )}
        </div>
      )}

      {/* Tweak Panel Modal */}
      <ChartTweakPanel
        jobId={jobId}
        initialSpec={item.spec}
        originalSpec={item.originalSpec}
        columns={columns}
        isOpen={isTweakOpen}
        onClose={() => setIsTweakOpen(false)}
        onApply={(updated) => onUpdateSpec(item.id, updated)}
        onReset={() => onResetSpec(item.id)}
      />
    </div>
  );
};
