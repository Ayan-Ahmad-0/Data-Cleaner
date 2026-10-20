import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  executeExploreQuery,
  exportExploreQuery,
  getExploreSchema,
  type ExploreColumnInfo,
  type ExploreQueryResult,
  type ExploreSchemaResponse,
} from '../../lib/api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { Tag } from '../ui/Tag';
import {
  Play,
  Download,
  Clock,
  Database,
  History,
  RotateCcw,
  Search,
  AlertCircle,
  FileSpreadsheet,
  Terminal,
  Shield,
  X,
} from 'lucide-react';

interface SqlQueryBoxProps {
  jobId: string;
  datasetName?: string;
  onClose?: () => void;
}

interface QueryHistoryItem {
  sql: string;
  timestamp: string;
  rowCount: number;
  durationSeconds: number;
}

export const SqlQueryBox: React.FC<SqlQueryBoxProps> = ({
  jobId,
  datasetName = 'cleaned dataset',
  onClose,
}) => {
  const [schema, setSchema] = useState<ExploreSchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState<boolean>(true);
  const [schemaFilter, setSchemaFilter] = useState<string>('');
  const [activeTable, setActiveTable] = useState<string>('data');

  const [sql, setSql] = useState<string>('SELECT * FROM data LIMIT 100;');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [result, setResult] = useState<ExploreQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTimer, setElapsedTimer] = useState<number>(0);

  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const stored = sessionStorage.getItem(`cleanflow_sql_history_${jobId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerIntervalRef = useRef<any>(null);

  const getTableLabel = (t: string): string => {
    if (t === 'original') return 'Original Data';
    if (t === 'data') return 'Cleaned Data';
    return t;
  };

  const handleTableChange = (t: string) => {
    setActiveTable(t);
    setSql((prev) => {
      const trimmed = prev.trim();
      if (
        trimmed === 'SELECT * FROM data LIMIT 100;' ||
        trimmed === 'SELECT * FROM original LIMIT 100;'
      ) {
        return `SELECT * FROM ${t} LIMIT 100;`;
      }
      return prev;
    });
  };

  // Load schema on mount or activeTable change
  useEffect(() => {
    let isMounted = true;
    setSchemaLoading(true);
    setError(null);

    getExploreSchema(jobId, activeTable)
      .then((data) => {
        if (!isMounted) return;
        setSchema(data);
        setSchemaLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to inspect dataset schema.');
        setSchemaLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [jobId, activeTable]);

  // Persist history
  const addHistoryItem = (item: QueryHistoryItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.sql.trim() !== item.sql.trim());
      const updated = [item, ...filtered].slice(0, 10);
      try {
        sessionStorage.setItem(`cleanflow_sql_history_${jobId}`, JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save query history:', err);
      }
      return updated;
    });
  };

  // Run query handler
  const handleRunQuery = async () => {
    if (!sql.trim() || isRunning) return;

    setIsRunning(true);
    setError(null);
    setElapsedTimer(0);

    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      setElapsedTimer(Math.floor((Date.now() - startTime) / 100) / 10);
    }, 100);

    try {
      const queryRes = await executeExploreQuery(jobId, sql.trim(), 1000);
      clearInterval(timerIntervalRef.current);
      setResult(queryRes);

      addHistoryItem({
        sql: sql.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rowCount: queryRes.row_count_returned,
        durationSeconds: queryRes.elapsed_seconds,
      });
    } catch (err: any) {
      clearInterval(timerIntervalRef.current);
      setError(err.message || 'Query execution failed.');
    } finally {
      clearInterval(timerIntervalRef.current);
      setIsRunning(false);
    }
  };

  // Keyboard shortcut Ctrl+Enter or Cmd+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunQuery();
    }
  };

  // Insert column into textarea at cursor
  const handleInsertColumn = (colName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setSql((prev) => `${prev} "${colName}"`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = `"${colName}"`;
    const nextSql = sql.substring(0, start) + insertion + sql.substring(end);
    setSql(nextSql);

    // Restore focus and position cursor after inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  // Export full result to CSV
  const handleExportCsv = async () => {
    if (!sql.trim() || isExporting) return;
    setIsExporting(true);
    try {
      await exportExploreQuery(jobId, sql.trim());
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter columns in schema panel
  const filteredColumns = useMemo(() => {
    if (!schema?.columns) return [];
    if (!schemaFilter.trim()) return schema.columns;
    const q = schemaFilter.toLowerCase();
    return schema.columns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)
    );
  }, [schema?.columns, schemaFilter]);

  // Context-aware query examples
  const exampleQueries = useMemo(() => {
    const cols = schema?.columns || [];
    const firstCol = cols[0]?.name || 'id';
    const categoryCol = cols.find((c) => c.type.includes('VARCHAR') || c.type.includes('TEXT'))?.name || firstCol;
    const numericCol = cols.find((c) => c.type.includes('INT') || c.type.includes('DOUBLE') || c.type.includes('DECIMAL'))?.name || firstCol;

    return [
      {
        title: 'Preview 100 rows',
        sql: `SELECT * FROM ${activeTable} LIMIT 100;`,
      },
      {
        title: 'Total record count',
        sql: `SELECT count(*) as total_rows FROM ${activeTable};`,
      },
      {
        title: `Top 10 values by "${categoryCol}"`,
        sql: `SELECT "${categoryCol}", count(*) as count\nFROM ${activeTable}\nGROUP BY "${categoryCol}"\nORDER BY count DESC\nLIMIT 10;`,
      },
      {
        title: `Null count for "${firstCol}"`,
        sql: `SELECT count(*) - count("${firstCol}") as missing_count,\n       count(*) as total_rows\nFROM ${activeTable};`,
      },
      {
        title: `Aggregation summary on "${numericCol}"`,
        sql: `SELECT min("${numericCol}") as min_val,\n       avg("${numericCol}") as avg_val,\n       max("${numericCol}") as max_val\nFROM ${activeTable};`,
      },
    ];
  }, [schema, activeTable]);

  return (
    <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-lg)] shadow-xs overflow-hidden flex flex-col min-h-[640px]">
      {/* Header bar */}
      <div className="px-5 py-4 hairline-b bg-[var(--bg-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
            <Terminal className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                Explore Data (SQL)
              </h2>
              <Tag variant="neutral" font="mono">Sandboxed DuckDB</Tag>
              {schema?.tables_available && schema.tables_available.length > 1 && (
                <div className="inline-flex rounded-md shadow-xs ml-2">
                  {schema.tables_available.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTableChange(t)}
                      className={`px-2.5 py-1 text-xs font-medium first:rounded-l-md last:rounded-r-md hairline-border transition-colors cursor-pointer ${
                        activeTable === t
                          ? 'bg-[var(--accent)] text-white font-semibold shadow-xs'
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {getTableLabel(t)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Query <span className="font-mono text-[var(--text-primary)]">{datasetName}</span> directly using standard read-only SQL statements.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<History className="w-3.5 h-3.5" />}
              onClick={() => setShowHistory(!showHistory)}
            >
              History ({history.length})
            </Button>
          )}

          <Button
            size="sm"
            variant="primary"
            leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
            onClick={handleRunQuery}
            disabled={isRunning || !sql.trim()}
          >
            {isRunning ? `Running (${elapsedTimer}s)...` : 'Run Query'}
          </Button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close query box"
              className="p-1.5 rounded-[var(--radius-xs)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace: 2 Columns (Schema Panel + Query Workspace) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-[500px]">
        {/* Left: Schema Browser (3 cols) */}
        <aside className="lg:col-span-4 xl:col-span-3 hairline-r bg-[var(--bg-surface)] flex flex-col">
          <div className="p-3 hairline-b bg-[var(--bg-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
                Table: <span className="font-mono text-[var(--text-primary)]">{getTableLabel(activeTable)}</span>
              </span>
              <span className="font-mono">
                {schema ? `${schema.row_count.toLocaleString()} rows` : '...'}
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search columns or types..."
                value={schemaFilter}
                onChange={(e) => setSchemaFilter(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hairline-border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Column list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[460px]">
            {schemaLoading ? (
              <div className="p-4 text-xs text-[var(--text-muted)] text-center animate-pulse">
                Inspecting table columns...
              </div>
            ) : filteredColumns.length === 0 ? (
              <div className="p-4 text-xs text-[var(--text-muted)] text-center">
                No matching columns found.
              </div>
            ) : (
              filteredColumns.map((col: ExploreColumnInfo) => (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => handleInsertColumn(col.name)}
                  title={
                    col.sample_values && col.sample_values.length > 0
                      ? `Click to insert "${col.name}"\nSamples: ${col.sample_values.join(', ')}`
                      : `Click to insert "${col.name}"`
                  }
                  className="w-full text-left px-2.5 py-1.5 rounded-[var(--radius-xs)] hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between group cursor-pointer text-xs"
                >
                  <span className="font-mono font-medium text-[var(--text-primary)] truncate max-w-[140px] xl:max-w-[170px]">
                    {col.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                    {col.type}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="p-2.5 hairline-t bg-[var(--bg-subtle)] text-[11px] text-[var(--text-muted)] text-center">
            Click any column to insert into query
          </div>
        </aside>

        {/* Right: SQL Editor & Results (9 cols) */}
        <main className="lg:col-span-8 xl:col-span-9 flex flex-col min-w-0 bg-[var(--bg-surface)]">
          {/* Editor Header Toolbar */}
          <div className="px-4 py-2 hairline-b bg-[var(--bg-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)] font-mono">SQL Editor</span>
              <span className="text-[11px] text-[var(--text-muted)]">
                (Press <kbd className="px-1.5 py-0.5 rounded hairline-border bg-[var(--bg-surface)] font-mono text-[10px]">Ctrl+Enter</kbd> to run)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Examples Dropdown */}
              <select
                aria-label="Load query template"
                onChange={(e) => {
                  if (e.target.value) {
                    setSql(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="text-xs px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hairline-border text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Load Example Query...</option>
                {exampleQueries.map((ex, idx) => (
                  <option key={idx} value={ex.sql}>
                    {ex.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setSql(`SELECT * FROM ${activeTable} LIMIT 100;`)}
                title="Reset to default query"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* History drawer if active */}
          {showHistory && (
            <div className="p-3 hairline-b bg-[var(--bg-hover)] space-y-2 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                <span>Recent Query History (Current Session)</span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
              {history.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSql(item.sql);
                    setShowHistory(false);
                  }}
                  className="p-2 rounded-[var(--radius-xs)] bg-[var(--bg-surface)] hairline-border hover:border-[var(--accent)] cursor-pointer transition-colors space-y-1"
                >
                  <pre className="font-mono text-xs text-[var(--text-primary)] line-clamp-2 whitespace-pre-wrap">
                    {item.sql}
                  </pre>
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span>{item.timestamp}</span>
                    <span>{item.rowCount} rows ({item.durationSeconds}s)</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SQL Textarea */}
          <div className="relative p-3 bg-[var(--bg-surface)]">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={5}
              placeholder={`SELECT * FROM ${activeTable} WHERE ...`}
              spellCheck={false}
              className="w-full font-mono text-xs sm:text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] hairline-border text-[var(--text-primary)] leading-relaxed focus:outline-hidden focus:border-[var(--accent)] resize-y min-h-[110px]"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="px-4 pb-3">
              <Callout
                variant="danger"
                title="Query Error"
                action={
                  <Button size="sm" variant="secondary" onClick={() => setError(null)}>
                    Dismiss
                  </Button>
                }
              >
                <div className="font-mono text-xs whitespace-pre-wrap">{error}</div>
              </Callout>
            </div>
          )}

          {/* Truncation Warning */}
          {result?.truncated && (
            <div className="px-4 pb-2">
              <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] hairline-border border-[var(--accent)] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-[var(--text-primary)]">
                  <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>
                    Showing first <strong>{result.row_count_returned.toLocaleString()}</strong> rows of result. Export full result to view all records.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExportCsv}
                  disabled={isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Download Full CSV'}
                </Button>
              </div>
            </div>
          )}

          {/* Results Area */}
          <div className="flex-1 flex flex-col min-h-0 hairline-t">
            {/* Results Header */}
            <div className="px-4 py-2.5 hairline-b bg-[var(--bg-subtle)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span className="font-semibold text-[var(--text-primary)]">Query Results</span>
                {result && (
                  <>
                    <Tag variant="neutral" font="mono">
                      {result.row_count_returned.toLocaleString()} rows
                    </Tag>
                    <span className="text-[var(--text-muted)] flex items-center gap-1 font-mono text-[11px]">
                      <Clock className="w-3 h-3" />
                      {result.elapsed_seconds}s
                    </span>
                  </>
                )}
              </div>

              {result && result.rows.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleExportCsv}
                  disabled={isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </Button>
              )}
            </div>

            {/* Results Table Scroll View */}
            <div className="flex-1 overflow-auto max-h-[400px]">
              {isRunning ? (
                <div className="py-16 text-center space-y-3">
                  <div className="inline-block w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    Executing sandboxed query ({elapsedTimer}s)...
                  </p>
                </div>
              ) : !result ? (
                <div className="py-16 text-center space-y-2">
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-[var(--text-muted)] stroke-1" />
                  <p className="text-xs text-[var(--text-secondary)]">
                    Run a query to view results.
                  </p>
                </div>
              ) : result.rows.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  Query completed successfully with 0 rows returned.
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="bg-[var(--bg-subtle)] hairline-b sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 text-[10px] text-[var(--text-muted)] hairline-r w-12 text-right select-none bg-[var(--bg-subtle)]">
                        #
                      </th>
                      {result.columns.map((c, idx) => (
                        <th key={idx} className="py-2 px-3 text-[var(--text-primary)] font-semibold select-text whitespace-nowrap bg-[var(--bg-subtle)]">
                          <div className="flex flex-col">
                            <span>{c.name}</span>
                            <span className="text-[9px] font-normal text-[var(--text-muted)] uppercase tracking-wider">
                              {c.type}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)] bg-[var(--bg-surface)]">
                    {result.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[var(--bg-hover)] transition-colors">
                        <td className="py-1.5 px-3 text-[10px] text-[var(--text-muted)] hairline-r text-right select-none">
                          {rIdx + 1}
                        </td>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`py-1.5 px-3 whitespace-nowrap max-w-[280px] truncate ${
                              cell === null ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'
                            }`}
                            title={cell === null ? 'NULL' : String(cell)}
                          >
                            {cell === null ? 'NULL' : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Footer bar with privacy line */}
      <div className="px-5 py-2.5 hairline-t bg-[var(--bg-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[var(--accent)]" />
          Queries run on your temporary sandboxed copy of the data. Files are deleted after 24 hours.
        </span>
        <span className="font-mono">Read-Only DuckDB Engine</span>
      </div>
    </div>
  );
};
