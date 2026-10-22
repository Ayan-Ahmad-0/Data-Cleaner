import React, { useState } from 'react';
import {
  type ChartColumnStats,
  type ChartDataResponse,
  type ChartSpec,
  exportChartCsv,
} from '../../lib/api';
import { Button } from '../ui/Button';
import { ChartTweakPanel } from './ChartTweakPanel';
import { PlotlyChartRenderer } from './PlotlyChartRenderer';
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
}

export const ChartCard: React.FC<ChartCardProps> = ({
  jobId,
  item,
  columns,
  onUpdateSpec,
  onResetSpec,
  onRemove,
}) => {
  const [isTweakOpen, setIsTweakOpen] = useState(false);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[var(--radius-xl)] p-5 shadow-[var(--shadow-card)] space-y-4 transition-all hover:border-[var(--border-strong)]">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {item.source === 'ai' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)]">
              <Sparkles className="w-3 h-3" /> AI Pick
            </span>
          ) : item.source === 'standard' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
              Standard
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)]">
              Custom
            </span>
          )}

          {item.isEdited && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25">
              Edited
            </span>
          )}

          <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
            {item.spec.title || `${item.spec.chart_type.toUpperCase()} Chart`}
          </h3>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Sliders className="w-3.5 h-3.5" />}
            onClick={() => setIsTweakOpen(true)}
            className="text-xs h-7.5 px-2.5"
          >
            Tweak
          </Button>

          <Button
            variant="ghost"
            size="sm"
            leftIcon={isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            onClick={handleExport}
            disabled={isExporting || !item.data}
            className="text-xs h-7.5 px-2 text-[var(--text-secondary)]"
            title="Export small aggregated data as CSV"
          >
            Export
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(item.id)}
            className="text-xs h-7.5 px-2 text-[var(--text-muted)] hover:text-red-500"
            title="Remove chart card"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Chart Render Area */}
      <div className="min-h-[320px] flex items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-app)]/50 p-2">
        {item.loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            <span className="text-xs">Computing aggregated chart data...</span>
          </div>
        ) : item.error ? (
          <div className="flex items-start gap-2.5 p-4 rounded-[var(--radius-lg)] bg-red-500/10 border border-red-500/25 text-red-400 text-xs max-w-md">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Failed to render chart</span>
              <p className="mt-1">{item.error}</p>
            </div>
          </div>
        ) : item.data ? (
          <PlotlyChartRenderer data={item.data} height={340} />
        ) : (
          <div className="text-xs text-[var(--text-muted)]">No data available</div>
        )}
      </div>

      {/* "Why this chart?" Accordion */}
      {hasWhyDetails && (
        <div className="border border-[var(--border-hairline)] rounded-[var(--radius-md)] overflow-hidden bg-[var(--bg-subtle)]/40 text-xs">
          <button
            onClick={() => setIsWhyOpen(!isWhyOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-left font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
              Why this chart?
            </span>
            {isWhyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {isWhyOpen && (
            <div className="px-3.5 pb-3 pt-1 space-y-2 border-t border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] bg-[var(--bg-app)]/50">
              {item.questionAnswered && (
                <p>
                  <strong className="text-[var(--text-primary)]">Question answered:</strong> {item.questionAnswered}
                </p>
              )}
              {item.explanation && (
                <p>
                  <strong className="text-[var(--text-primary)]">What it shows:</strong> {item.explanation}
                </p>
              )}
              {item.why && (
                <p>
                  <strong className="text-[var(--text-primary)]">Rationale:</strong> {item.why}
                </p>
              )}
              {item.assumptions && item.assumptions.length > 0 && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  <strong>Assumptions:</strong> {item.assumptions.join('; ')}
                </p>
              )}
              {item.caveats && item.caveats.length > 0 && (
                <div className="text-[11px] text-amber-500/90 pt-1">
                  <strong>Caveats:</strong> {item.caveats.join('; ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Applied notes & warnings */}
      {item.data && (item.data.notes.length > 0 || item.data.warnings.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)] pt-1">
          <Info className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          {[...item.data.notes, ...item.data.warnings].map((n, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-hairline)]">
              {n}
            </span>
          ))}
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
