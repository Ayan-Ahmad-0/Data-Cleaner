import React, { useState } from 'react';
import { X, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Relationship, TableMetadata } from '../../lib/api';
import { Button } from '../ui/Button';

interface RelationshipModalProps {
  isOpen: boolean;
  relationship: Relationship | null;
  tables: Record<string, TableMetadata>;
  onClose: () => void;
  onSave: (rel: Relationship) => void;
  onDelete: (relId: string) => void;
}

export const RelationshipModal: React.FC<RelationshipModalProps> = ({
  isOpen,
  relationship,
  tables,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !relationship) return null;

  const [fromTable, setFromTable] = useState(relationship.from_table);
  const [fromColumn, setFromColumn] = useState(relationship.from_column);
  const [toTable, setToTable] = useState(relationship.to_table);
  const [toColumn, setToColumn] = useState(relationship.to_column);
  const [cardinality, setCardinality] = useState(relationship.cardinality);

  const fromCols = tables[fromTable]?.columns || [];
  const toCols = tables[toTable]?.columns || [];

  const handleSave = () => {
    onSave({
      ...relationship,
      from_table: fromTable,
      from_column: fromColumn,
      to_table: toTable,
      to_column: toColumn,
      cardinality,
      status: 'confirmed',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
              Relational Link Configuration
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {relationship.status.toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs font-sans">
          {/* Match Quality Banner */}
          <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between">
            <div>
              <span className="text-[var(--text-muted)] block text-[11px]">Match Ratio</span>
              <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                {Math.round(relationship.match_ratio * 100)}%
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[11px]">Confidence</span>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {Math.round(relationship.confidence * 100)}%
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[11px]">Orphan Rows</span>
              <span className="font-mono text-sm font-bold text-amber-400">
                {relationship.orphan_count}
              </span>
            </div>
          </div>

          {/* Child Table & Column (Foreign Key) */}
          <div className="space-y-1.5">
            <label className="font-medium text-[var(--text-secondary)]">Child Table & Key (Foreign Key)</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={fromTable}
                onChange={(e) => {
                  setFromTable(e.target.value);
                  const firstCol = tables[e.target.value]?.columns[0]?.name || '';
                  setFromColumn(firstCol);
                }}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none"
              >
                {Object.keys(tables).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={fromColumn}
                onChange={(e) => setFromColumn(e.target.value)}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none"
              >
                {fromCols.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.data_type})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Arrow Divider */}
          <div className="flex items-center justify-center text-[var(--text-muted)]">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Parent Table & Column (Primary Key) */}
          <div className="space-y-1.5">
            <label className="font-medium text-[var(--text-secondary)]">Parent Table & Key (Primary Key)</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={toTable}
                onChange={(e) => {
                  setToTable(e.target.value);
                  const firstCol = tables[e.target.value]?.columns[0]?.name || '';
                  setToColumn(firstCol);
                }}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none"
              >
                {Object.keys(tables).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={toColumn}
                onChange={(e) => setToColumn(e.target.value)}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none"
              >
                {toCols.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.data_type})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cardinality Selector */}
          <div className="space-y-1.5">
            <label className="font-medium text-[var(--text-secondary)]">Cardinality Mapping</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1:N', label: '1 to Many (1:N)' },
                { id: '1:1', label: '1 to 1 (1:1)' },
                { id: 'N:M', label: 'Many to Many (N:M)' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardinality(c.id)}
                  className={`py-1.5 px-2 rounded-lg border text-xs font-mono transition-colors ${
                    cardinality === c.id
                      ? 'border-[#FF4B3E] bg-[#FF4B3E]/10 text-[#FF4B3E] font-bold'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onDelete(relationship.id);
              onClose();
            }}
            leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-400" />}
            className="text-xs text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            Delete Link
          </Button>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
              className="text-xs bg-[#FF4B3E] hover:bg-[#E03E32]"
            >
              Save Link
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
