import React, { useState } from 'react';
import {
  type ChartColumnStats,
  type ChartFromTextResult,
  type PageDataOptions,
  askChartFromText,
} from '../../lib/api';
import { Button } from '../ui/Button';
import { Sparkles, Loader2, HelpCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface DescribeChartBarProps {
  jobId: string;
  columns: ChartColumnStats[];
  pageOptions: PageDataOptions;
  onChartCreated: (result: ChartFromTextResult) => void;
  onHandoffToQuery: () => void;
}

export const DescribeChartBar: React.FC<DescribeChartBarProps> = ({
  jobId,
  columns,
  pageOptions,
  onChartCreated,
  onHandoffToQuery,
}) => {
  const [requestText, setRequestText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [clarification, setClarification] = useState<string | null>(null);
  const [cannotChartMsg, setCannotChartMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate dynamic placeholder suggestions from columns
  const firstCat = columns.find((c) => c.kind === 'categorical')?.name || 'category';
  const firstNum = columns.find((c) => c.kind === 'numeric')?.name || 'revenue';
  const firstDt = columns.find((c) => c.kind === 'datetime')?.name;
  const placeholderExample = firstDt
    ? `e.g. total ${firstNum} by ${firstCat}, or ${firstDt} activity`
    : `e.g. average ${firstNum} by ${firstCat}`;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!requestText.trim() || isLoading) return;

    setIsLoading(true);
    setClarification(null);
    setCannotChartMsg(null);
    setErrorMessage(null);

    try {
      const result = await askChartFromText(jobId, requestText.trim(), pageOptions);
      if (result.status === 'ok') {
        onChartCreated(result);
        setRequestText('');
      } else if (result.status === 'needs_clarification') {
        setClarification(result.clarification_question || 'Could you provide more detail?');
      } else if (result.status === 'cannot_chart') {
        setCannotChartMsg(
          result.message || 'This request cannot be visualized as a single chart. Try querying via SQL.'
        );
      } else {
        setErrorMessage(result.message || 'Could not generate chart. Please adjust your request.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process AI chart request.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Prominent Search Bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-1.5 sm:p-2 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-[var(--radius-xl)] shadow-[var(--shadow-card)] focus-within:border-[var(--accent)] transition-all"
      >
        <div className="pl-3 text-[var(--accent)] flex items-center">
          <Sparkles className="w-5 h-5" />
        </div>

        <input
          type="text"
          value={requestText}
          onChange={(e) => {
            setRequestText(e.target.value);
            if (clarification) setClarification(null);
            if (cannotChartMsg) setCannotChartMsg(null);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder={`Describe a chart in plain English (${placeholderExample})...`}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden"
          disabled={isLoading}
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!requestText.trim() || isLoading}
          leftIcon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          className="px-5 shrink-0"
        >
          {isLoading ? 'Creating...' : 'Create'}
        </Button>
      </form>

      {/* Clarification prompt */}
      {clarification && (
        <div className="flex items-start gap-2.5 p-3.5 bg-[var(--accent-subtle)] border border-[var(--accent-border)] rounded-[var(--radius-lg)] text-xs text-[var(--accent-text)] animate-in fade-in">
          <HelpCircle className="w-4 h-4 shrink-0 text-[var(--accent)] mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block text-[var(--accent)]">Clarification needed:</span>
            {/* Plain text escaping guaranteed */}
            <p className="text-[var(--text-primary)]">{clarification}</p>
          </div>
        </div>
      )}

      {/* Cannot Chart Banner */}
      {cannotChartMsg && (
        <div className="flex items-start justify-between gap-3 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-[var(--radius-lg)] text-xs text-amber-400 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block text-amber-300">Cannot visualize as single chart:</span>
              <p className="text-[var(--text-primary)]">{cannotChartMsg}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onHandoffToQuery}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            className="shrink-0 text-xs"
          >
            Open SQL Box
          </Button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-[var(--radius-lg)] text-xs text-red-400 animate-in fade-in">
          {errorMessage}
        </div>
      )}
    </div>
  );
};
