import React from 'react';
import {
  type ChartRecommendation,
  type DataPrepTip,
  type PageDataOptions,
  type VisualizationPlan,
} from '../../lib/api';
import { Button } from '../ui/Button';
import {
  Lightbulb,
  X,
  CheckCircle2,
  AlertOctagon,
  Plus,
} from 'lucide-react';

interface VisualizationAdviceModalProps {
  plan: VisualizationPlan | null;
  isOpen: boolean;
  onClose: () => void;
  onCreateChart: (rec: ChartRecommendation) => void;
  onApplyPrepTip: (tip: DataPrepTip) => void;
  pageOptions: PageDataOptions;
}

export const VisualizationAdviceModal: React.FC<VisualizationAdviceModalProps> = ({
  plan,
  isOpen,
  onClose,
  onCreateChart,
  onApplyPrepTip,
  pageOptions,
}) => {
  if (!isOpen || !plan) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-[var(--radius-xl)] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                AI Visualization Advice & Plan
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Automated dataset analysis, recommended charts, data preparation tips, and caveats.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-6 text-xs sm:text-sm">
          {/* Dataset Summary */}
          {plan.summary && (
            <div className="p-4 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-[var(--radius-lg)] space-y-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                Dataset Overview
              </span>
              <p className="text-[var(--text-primary)] text-sm leading-relaxed">
                {plan.summary}
              </p>
            </div>
          )}

          {/* Recommended Charts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Recommended Charts ({plan.recommendations.length})
              </span>
            </div>

            <div className="space-y-3">
              {plan.recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-lg)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-[var(--border-strong)] transition-all"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)] uppercase">
                        {rec.spec.chart_type}
                      </span>
                      <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                        {rec.title}
                      </h4>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)]">
                      <strong className="text-[var(--text-primary)]">Question:</strong> {rec.question_answered}
                    </p>

                    <p className="text-xs text-[var(--text-muted)]">
                      <strong>Why:</strong> {rec.why}
                    </p>

                    {rec.caveats.length > 0 && (
                      <div className="text-[11px] text-amber-500/90 pt-0.5">
                        <strong>Caveat:</strong> {rec.caveats.join('; ')}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => {
                      onCreateChart(rec);
                      onClose();
                    }}
                    className="shrink-0 text-xs"
                  >
                    Create chart
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Data Preparation Tips */}
          {plan.prep_tips.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                Data Preparation Tips
              </span>

              <div className="space-y-2">
                {plan.prep_tips.map((tip, idx) => {
                  const isApplicable = tip.action !== 'none';
                  const isAlreadyApplied = Boolean(
                    (tip.action === 'exclude_missing' && pageOptions.exclude_missing) ||
                    (tip.action === 'hide_outliers' && pageOptions.hide_outliers) ||
                    (tip.action === 'cast_as_date' && tip.column && pageOptions.cast_overrides?.[tip.column] === 'date') ||
                    (tip.action === 'cast_as_number' && tip.column && pageOptions.cast_overrides?.[tip.column] === 'number')
                  );

                  return (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-[var(--radius-md)] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-[var(--text-primary)]">{tip.tip}</span>
                      </div>

                      {isApplicable && (
                        <Button
                          variant={isAlreadyApplied ? 'ghost' : 'secondary'}
                          size="sm"
                          disabled={isAlreadyApplied}
                          onClick={() => onApplyPrepTip(tip)}
                          className="shrink-0 text-[11px] h-7 px-2.5"
                        >
                          {isAlreadyApplied ? 'Applied' : 'Apply'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* What to Avoid */}
          {plan.avoid.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                What to Avoid For This Data
              </span>
              <ul className="space-y-1.5 text-xs text-[var(--text-muted)]">
                {plan.avoid.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <AlertOctagon className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex justify-end sticky bottom-0 z-10">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
