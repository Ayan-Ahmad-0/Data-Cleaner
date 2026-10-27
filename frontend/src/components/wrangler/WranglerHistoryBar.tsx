import React from 'react';
import { Undo2, RotateCcw, History, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import type { WrangleHistoryItem } from '../../lib/api';

interface WranglerHistoryBarProps {
  history: WrangleHistoryItem[];
  canUndo: boolean;
  isMutating: boolean;
  onUndo: () => void;
  onReset: () => void;
}

export const WranglerHistoryBar: React.FC<WranglerHistoryBarProps> = ({
  history,
  canUndo,
  isMutating,
  onUndo,
  onReset,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border-hairline)] rounded-xl text-xs">
      {/* History status & pills */}
      <div className="flex items-center gap-3 overflow-x-auto py-0.5">
        <div className="flex items-center gap-1.5 text-[var(--text-muted)] font-medium shrink-0">
          <History className="w-4 h-4 text-[#FF4B3E]" />
          <span>Wrangle History:</span>
        </div>

        {history.length === 0 ? (
          <span className="text-[var(--text-muted)] italic">
            No cell or column changes yet. Right-click any column header to wrangle.
          </span>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {history.slice(-3).map((item) => (
              <span
                key={item.step}
                className="px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[11px] font-mono text-[var(--text-primary)] shadow-2xs"
                title={item.description}
              >
                #{item.step}: {item.description}
              </span>
            ))}
            {history.length > 3 && (
              <span className="text-[11px] text-[var(--text-muted)] font-mono">
                +{history.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="secondary"
          onClick={onUndo}
          disabled={!canUndo || isMutating}
          leftIcon={
            isMutating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF4B3E]" />
            ) : (
              <Undo2 className="w-3.5 h-3.5" />
            )
          }
          className="text-xs h-8 px-3"
        >
          Undo
        </Button>

        {history.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('Reset all interactive wrangle actions back to original clean state?')) {
                onReset();
              }
            }}
            disabled={isMutating}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            className="text-xs h-8 px-2.5 text-[var(--text-muted)] hover:text-red-400"
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
};
