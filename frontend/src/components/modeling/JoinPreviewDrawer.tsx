import React, { useEffect, useState } from 'react';
import { X, Settings2, Table, Loader2, ArrowRight } from 'lucide-react';
import type { Relationship, JoinPreviewResult } from '../../lib/api';
import { previewModelingJoin } from '../../lib/api';
import { Button } from '../ui/Button';

interface JoinPreviewDrawerProps {
  sessionId: string;
  relationship: Relationship | null;
  onClose: () => void;
  onEditRelationship: (rel: Relationship) => void;
}

export const JoinPreviewDrawer: React.FC<JoinPreviewDrawerProps> = ({
  sessionId,
  relationship,
  onClose,
  onEditRelationship,
}) => {
  const [loading, setLoading] = useState(false);
  const [joinType, setJoinType] = useState('INNER');
  const [preview, setPreview] = useState<JoinPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relationship || !sessionId) return;

    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await previewModelingJoin(sessionId, {
          from_table: relationship.from_table,
          from_column: relationship.from_column,
          to_table: relationship.to_table,
          to_column: relationship.to_column,
          join_type: joinType,
        });
        setPreview(res);
      } catch (err: any) {
        setError(err.message || 'Failed to generate join preview.');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [sessionId, relationship, joinType]);

  if (!relationship) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 max-h-80 bg-[var(--bg-surface)] border-t border-[var(--border-hairline)] shadow-2xl flex flex-col transition-all">
      {/* Drawer Header */}
      <div className="px-4 py-2.5 bg-[var(--bg-subtle)] border-b border-[var(--border-hairline)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--text-primary)]">
            <Table className="w-4 h-4 text-[#FF4B3E]" />
            <span>{relationship.from_table}.{relationship.from_column}</span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{relationship.to_table}.{relationship.to_column}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {relationship.cardinality}
            </span>
            <span className="text-[var(--text-muted)]">
              {preview?.matched_rows ?? '...'} / {preview?.total_child_rows ?? '...'} rows matched ({Math.round((preview?.match_ratio || 0) * 100)}%)
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Join Type Selector */}
          <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-app)] p-0.5 text-xs font-mono">
            {['INNER', 'LEFT', 'RIGHT'].map((jt) => (
              <button
                key={jt}
                type="button"
                onClick={() => setJoinType(jt)}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  joinType === jt
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {jt}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEditRelationship(relationship)}
            leftIcon={<Settings2 className="w-3.5 h-3.5" />}
            className="text-xs h-7 px-2.5 cursor-pointer"
          >
            Configure
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content / Sample Table */}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin text-[#FF4B3E]" />
            <span>Computing join preview in DuckDB...</span>
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-red-400 text-center font-mono">
            {error}
          </div>
        ) : preview && preview.sample_rows.length > 0 ? (
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] sticky top-0">
                {preview.columns.map((col, idx) => (
                  <th key={idx} className="py-1.5 px-3 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {preview.sample_rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-[var(--bg-hover)] transition-colors">
                  {preview.columns.map((col, cIdx) => (
                    <td key={cIdx} className="py-1.5 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                      {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-[var(--text-muted)] italic">null</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">
            No rows returned by {joinType} JOIN.
          </div>
        )}
      </div>
    </div>
  );
};
