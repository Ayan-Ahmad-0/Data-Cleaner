import React, { useState, useEffect, useMemo } from 'react';
import {
  MoreVertical,
  Sliders,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  applyWrangleAction,
  undoWrangleAction,
  resetWrangleActions,
  getWrangleHistory,
  type WrangleColumn,
  type WrangleHistoryItem,
} from '../../lib/api';
import { WranglerContextMenu } from './WranglerContextMenu';
import { WranglerHistoryBar } from './WranglerHistoryBar';
import { formatNumber } from '../../lib/format';

interface DataWranglerGridProps {
  jobId: string;
  datasetName?: string;
  onDatasetChanged?: (newRowCount: number) => void;
}

export const DataWranglerGrid: React.FC<DataWranglerGridProps> = ({
  jobId,
  datasetName: _datasetName,
  onDatasetChanged,
}) => {
  const [columns, setColumns] = useState<WrangleColumn[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [history, setHistory] = useState<WrangleHistoryItem[]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [mutating, setMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Client search filter across preview rows
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    column: string;
    columnType: string;
    position: { x: number; y: number };
  } | null>(null);

  const fetchInitialData = async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      // Use SQL explore endpoint or history endpoint to initialize preview
      const histRes = await getWrangleHistory(jobId).catch(() => ({ history: [], can_undo: false }));
      setHistory(histRes.history || []);
      setCanUndo(histRes.can_undo || false);

      // Trigger a dry-run or fetch from explore query
      const res = await fetch(`/api/explore/${jobId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT * FROM data LIMIT 100;', row_limit: 100 }),
      });
      if (res.ok) {
        const qData = await res.json();
        setColumns(qData.columns || []);
        setRows(qData.rows || []);
        setRowCount(qData.row_count_returned || qData.rows?.length || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize wrangler grid.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [jobId]);

  const handleApplyAction = async (action: string, column: string, params?: Record<string, any>) => {
    setMutating(true);
    setError(null);
    try {
      const res = await applyWrangleAction(jobId, action, column, params);
      setColumns(res.columns);
      setRows(res.preview_rows);
      setRowCount(res.row_count);
      setHistory(res.history);
      setCanUndo(res.can_undo);
      setToastMessage(res.message);
      onDatasetChanged?.(res.row_count);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    } finally {
      setMutating(false);
    }
  };

  const handleUndo = async () => {
    setMutating(true);
    setError(null);
    try {
      const res = await undoWrangleAction(jobId);
      setColumns(res.columns);
      setRows(res.preview_rows);
      setRowCount(res.row_count);
      setHistory(res.history);
      setCanUndo(res.can_undo);
      setToastMessage(res.message);
      onDatasetChanged?.(res.row_count);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Undo failed.');
    } finally {
      setMutating(false);
    }
  };

  const handleReset = async () => {
    setMutating(true);
    setError(null);
    try {
      const res = await resetWrangleActions(jobId);
      setColumns(res.columns);
      setRows(res.preview_rows);
      setRowCount(res.row_count);
      setHistory([]);
      setCanUndo(false);
      setToastMessage(res.message);
      onDatasetChanged?.(res.row_count);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Reset failed.');
    } finally {
      setMutating(false);
    }
  };

  const openHeaderMenu = (column: string, columnType: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({
      column,
      columnType,
      position: { x: rect.left, y: rect.bottom + 4 },
    });
  };

  const filteredRows = useMemo(() => {
    if (!searchFilter.trim()) return rows;
    const term = searchFilter.toLowerCase();
    return rows.filter((r) =>
      r.some((cell) => cell != null && String(cell).toLowerCase().includes(term))
    );
  }, [rows, searchFilter]);

  if (loading) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-8 flex items-center justify-center gap-3 text-sm text-[var(--text-muted)]">
        <Loader2 className="w-5 h-5 animate-spin text-[#FF4B3E]" />
        <span>Loading Interactive Data Wrangler grid...</span>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl overflow-hidden shadow-2xs space-y-3 p-4 sm:p-5">
      {/* Top Header & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[#FF4B3E] flex items-center justify-center border border-[var(--border-hairline)]">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              <span>Interactive Data Wrangler</span>
              <span className="text-[11px] font-normal font-mono text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded border border-[var(--border-hairline)]">
                {formatNumber(rowCount)} rows · {columns.length} columns
              </span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Right-click or click <span className="font-mono text-[#FF4B3E] font-bold">⋮</span> on any column header to split, change casing, impute, or replace nulls.
            </p>
          </div>
        </div>

        {/* Filter Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter preview rows..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg text-xs text-[var(--text-primary)] outline-none"
          />
        </div>
      </div>

      {/* History & Undo Toolbar */}
      <WranglerHistoryBar
        history={history}
        canUndo={canUndo}
        isMutating={mutating}
        onUndo={handleUndo}
        onReset={handleReset}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Grid */}
      <div className="relative border border-[var(--border-hairline)] rounded-lg overflow-x-auto max-h-[460px] bg-[var(--bg-surface)]">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-hairline)] sticky top-0 z-10 shadow-2xs">
            <tr>
              <th className="py-2.5 px-3 text-[10px] text-[var(--text-muted)] border-r border-[var(--border-hairline)] w-12 text-right select-none bg-[var(--bg-subtle)]">
                #
              </th>
              {columns.map((c) => (
                <th
                  key={c.name}
                  onContextMenu={(e) => openHeaderMenu(c.name, c.type, e)}
                  className="py-2 px-3 text-[var(--text-primary)] font-semibold select-none whitespace-nowrap bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] transition-colors group cursor-pointer border-r border-[var(--border-hairline)] last:border-r-0"
                  title="Right-click or click ⋮ to wrangle column"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-[var(--text-primary)] font-semibold">{c.name}</span>
                      <span className="text-[9px] font-normal text-[var(--text-muted)] uppercase tracking-wider">
                        {c.type}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => openHeaderMenu(c.name, c.type, e)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] group-hover:text-[#FF4B3E] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)] bg-[var(--bg-surface)]">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No preview rows matching query.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="py-1.5 px-3 text-[10px] text-[var(--text-muted)] border-r border-[var(--border-hairline)] text-right select-none">
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`py-1.5 px-3 whitespace-nowrap max-w-[280px] truncate border-r border-[var(--border-hairline)] last:border-r-0 ${
                        cell === null ? 'text-[var(--text-muted)] italic font-sans' : 'text-[var(--text-primary)]'
                      }`}
                      title={cell === null ? 'NULL' : String(cell)}
                    >
                      {cell === null ? 'NULL' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
        <span>Showing first {filteredRows.length} rows preview in DuckDB</span>
        <span className="italic">All changes atomically modify cleaned Parquet on disk with instant Undo.</span>
      </div>

      {/* Render Active Context Menu */}
      {contextMenu && (
        <WranglerContextMenu
          column={contextMenu.column}
          columnType={contextMenu.columnType}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onApplyAction={handleApplyAction}
        />
      )}
    </div>
  );
};
