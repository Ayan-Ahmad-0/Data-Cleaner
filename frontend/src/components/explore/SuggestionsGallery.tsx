import React from 'react';
import type { ChartColumnStats, ChartSpec } from '../../lib/api';
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface SuggestionsGalleryProps {
  suggestions: ChartSpec[];
  columns: ChartColumnStats[];
  onSelectSuggestion: (spec: ChartSpec) => void;
}

export const SuggestionsGallery: React.FC<SuggestionsGalleryProps> = ({
  suggestions,
  onSelectSuggestion,
}) => {
  if (suggestions.length === 0) {
    return null;
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'bar':
      case 'hbar':
      case 'histogram':
        return BarChart;
      case 'line':
      case 'area':
        return LineChart;
      case 'pie':
        return PieChart;
      case 'scatter':
        return ScatterChart;
      default:
        return Activity;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          Suggested Charts
        </h3>
        <span className="text-xs text-[var(--text-muted)]">
          (auto-generated from types & variance)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {suggestions.map((spec, idx) => {
          const Icon = getIcon(spec.chart_type);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectSuggestion(spec)}
              className="flex flex-col p-3.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-hairline)] hover:border-[var(--accent)] rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] text-left transition-all duration-150 group cursor-pointer"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                  <Icon className="w-3.5 h-3.5" />
                  {spec.chart_type}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" />
              </div>

              <span className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 mb-1">
                {spec.title || `${spec.chart_type.toUpperCase()} chart`}
              </span>

              <div className="text-[11px] text-[var(--text-muted)] flex flex-col gap-0.5 mt-auto pt-2 border-t border-[var(--border-hairline)]">
                {spec.x && (
                  <span>
                    X: <span className="font-mono text-[var(--text-secondary)]">{spec.x.column}</span>
                  </span>
                )}
                {spec.y && (
                  <span>
                    Y: <span className="font-mono text-[var(--text-secondary)]">{spec.y.column}</span>
                  </span>
                )}
                {!spec.y && spec.aggregation && (
                  <span>
                    Agg: <span className="font-mono text-[var(--text-secondary)]">{spec.aggregation}</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
