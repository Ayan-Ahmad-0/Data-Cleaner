import React, { useMemo, useRef, useState } from 'react';
import {
  askAiAnalyst,
  exportExploreQuery,
  type AnalystAskResult,
  type ExploreSchemaResponse,
} from '../../lib/api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { Tag } from '../ui/Tag';
import {
  Sparkles,
  Download,
  Clock,
  Copy,
  Check,
  Code2,
  Terminal,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  Info,
} from 'lucide-react';

interface AskAiTabProps {
  jobId: string;
  datasetName?: string;
  schema: ExploreSchemaResponse | null;
  activeTable: string;
  onOpenInSqlBox: (sql: string) => void;
}

export const AskAiTab: React.FC<AskAiTabProps> = ({
  jobId,
  datasetName = 'dataset',
  schema,
  activeTable,
  onOpenInSqlBox,
}) => {
  const [question, setQuestion] = useState<string>('');
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [elapsedTimer, setElapsedTimer] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Understanding your question...');
  const [result, setResult] = useState<AnalystAskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [userFeedback, setUserFeedback] = useState<'up' | 'down' | null>(null);

  const timerIntervalRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Dynamic context-aware suggested questions
  const suggestedQuestions = useMemo(() => {
    const cols = schema?.columns || [];
    const firstCol = cols[0]?.name || 'id';
    const catCol =
      cols.find((c) => c.type.includes('VARCHAR') || c.type.includes('TEXT'))?.name || firstCol;
    const numCol =
      cols.find(
        (c) =>
          c.type.includes('INT') ||
          c.type.includes('DOUBLE') ||
          c.type.includes('DECIMAL') ||
          c.type.includes('FLOAT')
      )?.name || firstCol;
    const dateCol =
      cols.find(
        (c) =>
          c.type.includes('TIMESTAMP') ||
          c.type.includes('DATE') ||
          c.name.toLowerCase().includes('date') ||
          c.name.toLowerCase().includes('time')
      )?.name;

    const list = [
      {
        label: 'Total record count',
        prompt: `How many total rows are in ${activeTable}?`,
      },
      {
        label: `Top 10 by "${catCol}"`,
        prompt: `What are the top 10 most frequent values of "${catCol}"?`,
      },
      {
        label: `Average "${numCol}"`,
        prompt: `What is the average and maximum of "${numCol}"?`,
      },
      {
        label: `Missing values in "${firstCol}"`,
        prompt: `How many rows have a missing or null "${firstCol}"?`,
      },
    ];

    if (dateCol) {
      list.push({
        label: `Activity by date`,
        prompt: `Show the count of records grouped by date from "${dateCol}".`,
      });
    }

    return list;
  }, [schema, activeTable]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearInterval(timerIntervalRef.current);
    setIsAsking(false);
    setError('Analysis cancelled by user.');
  };

  const handleSelectExample = (promptText: string) => {
    setQuestion(promptText);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsAsking(true);
    setError(null);
    setResult(null);
    setUserFeedback(null);
    setElapsedTimer(0);
    setStatusMessage('Analyzing schema & generating DuckDB query...');

    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 100) / 10;
      setElapsedTimer(elapsed);
      if (elapsed > 4.0) {
        setStatusMessage('Synthesizing query with Gemini 3.5...');
      } else if (elapsed > 8.0) {
        setStatusMessage('Validating query in DuckDB sandbox...');
      }
    }, 100);

    try {
      const res = await askAiAnalyst(jobId, trimmed, 'anonymous', controller.signal);
      clearInterval(timerIntervalRef.current);
      setResult(res);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      clearInterval(timerIntervalRef.current);
      setError(err.message || 'Failed to analyze question with AI Analyst.');
    } finally {
      clearInterval(timerIntervalRef.current);
      setIsAsking(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleCopySql = (sqlText: string) => {
    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleExportResultCsv = async () => {
    if (!result?.sql || isExporting) return;
    setIsExporting(true);
    try {
      await exportExploreQuery(jobId, result.sql);
    } catch (err: any) {
      setError(err.message || 'CSV Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-[var(--bg-surface)]">
      {/* Top Question Input Area */}
      <div className="p-4 hairline-b bg-[var(--bg-subtle)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Ask a Question in English
            </span>
            <Tag variant="neutral" font="mono">DuckDB SQL Synthesis</Tag>
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {question.length} / 1,000 chars
          </span>
        </div>

        {/* Textarea + Submit Button */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            maxLength={1000}
            placeholder={`Ask anything about ${datasetName} (e.g. "Which category has the highest average fare?", "Show top 10 trips by distance")...`}
            className="w-full text-xs sm:text-sm p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hairline-border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] leading-relaxed focus:outline-hidden focus:border-[var(--accent)] resize-none"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {/* Suggested prompt chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Examples:</span>
              {suggestedQuestions.map((ex, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectExample(ex.prompt)}
                  className="px-2 py-0.5 rounded-full text-[11px] hairline-border bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {isAsking ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              ) : (
                question.trim() && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuestion('')}
                  >
                    Clear
                  </Button>
                )
              )}
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                onClick={handleAsk}
                disabled={isAsking || !question.trim()}
              >
                {isAsking ? `Analyzing (${elapsedTimer}s)...` : 'Ask AI'}
              </Button>
            </div>
          </div>
        </div>

        {/* Privacy Notice Banner (Section 7 Spec) */}
        <div className="px-3 py-2 rounded-[var(--radius-xs)] bg-[var(--bg-surface)] hairline-border flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>
              <strong>Privacy Notice:</strong> Column names, profile statistics, and at most 3 sample values are sent to Google Gemini to write SQL. Full rows are never sent.
            </span>
          </div>
        </div>
      </div>

      {/* Main Response Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Loading Spinner */}
        {isAsking && (
          <div className="py-16 text-center space-y-3">
            <div className="inline-block w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {statusMessage}
              </p>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Elapsed: {elapsedTimer.toFixed(1)}s
              </p>
            </div>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Error Callout */}
        {error && (
          <Callout
            variant="danger"
            title="Analysis Error"
            action={
              <Button size="sm" variant="secondary" onClick={() => setError(null)}>
                Dismiss
              </Button>
            }
          >
            <div className="text-xs font-mono">{error}</div>
          </Callout>
        )}

        {/* Clarification State */}
        {result?.status === 'needs_clarification' && (
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] hairline-border border-[var(--accent)] space-y-3">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  Clarification Needed
                </h4>
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {result.clarification_question}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Please refine or provide more specifics in the question box above and submit again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cannot Answer State */}
        {result?.status === 'cannot_answer' && (
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] hairline-border space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  Cannot Answer From Available Data
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {result.message}
                </p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Terminal className="w-3.5 h-3.5" />}
                    onClick={() => onOpenInSqlBox(`SELECT * FROM ${activeTable} LIMIT 100;`)}
                  >
                    Open in SQL Box
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error with SQL State */}
        {result?.status === 'error' && (
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--danger-subtle)] hairline-border border-[var(--danger)] space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <h4 className="text-sm font-semibold text-[var(--danger)]">
                  Query Execution Failed
                </h4>
                <p className="text-xs text-[var(--text-primary)]">
                  {result.message}
                </p>
                {result.sql && (
                  <div className="space-y-2 pt-2">
                    <pre className="p-2.5 rounded bg-[var(--bg-surface)] hairline-border font-mono text-xs overflow-x-auto text-[var(--text-primary)]">
                      {result.sql}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Terminal className="w-3.5 h-3.5" />}
                      onClick={() => onOpenInSqlBox(result.sql!)}
                    >
                      Open in SQL Box to Edit
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success State: Results Table + SQL Used + Explanation + Assumptions */}
        {result?.status === 'ok' && (
          <div className="space-y-4">
            {/* 1. Results Table Card */}
            <div className="hairline-border rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-surface)] shadow-xs">
              <div className="px-4 py-2.5 hairline-b bg-[var(--bg-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">Query Results</span>
                  {result.result && (
                    <>
                      <Tag variant="neutral" font="mono">
                        {result.result.row_count_returned.toLocaleString()} rows
                      </Tag>
                      <span className="text-[var(--text-muted)] flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3 h-3" />
                        {result.elapsed_seconds}s
                      </span>
                    </>
                  )}
                  {result.retried && (
                    <Tag variant="accent" font="mono">Auto-corrected on retry</Tag>
                  )}
                </div>

                {result.result && result.result.rows.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={handleExportResultCsv}
                    disabled={isExporting}
                  >
                    {isExporting ? 'Exporting...' : 'Download CSV'}
                  </Button>
                )}
              </div>

              {/* Truncation warning if applicable */}
              {result.result?.truncated && (
                <div className="p-3 bg-[var(--accent-subtle)] hairline-b text-xs flex items-center justify-between gap-2">
                  <span className="text-[var(--text-primary)]">
                    Showing first {result.result.row_count_returned.toLocaleString()} rows.
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Download className="w-3 h-3" />}
                    onClick={handleExportResultCsv}
                    disabled={isExporting}
                  >
                    Download Full CSV
                  </Button>
                </div>
              )}

              {/* Table Data */}
              <div className="overflow-x-auto max-h-[320px]">
                {result.result && result.result.rows.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[var(--bg-subtle)] sticky top-0 z-10 hairline-b">
                      <tr>
                        {result.result.columns.map((col, idx) => (
                          <th
                            key={idx}
                            className="px-3.5 py-2 font-mono font-medium text-[var(--text-primary)] hairline-r last:border-r-0 whitespace-nowrap"
                          >
                            <div>{col.name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-normal uppercase">
                              {col.type}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                      {result.result.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3.5 py-2 hairline-r last:border-r-0 text-[var(--text-secondary)] whitespace-nowrap max-w-xs truncate"
                            >
                              {cell === null ? (
                                <span className="text-[var(--text-muted)] italic">null</span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                    Query returned 0 rows.
                  </div>
                )}
              </div>
            </div>

            {/* 2. SQL Used Block */}
            {result.sql && (
              <div className="hairline-border rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-surface)]">
                <div className="px-3.5 py-2 hairline-b bg-[var(--bg-subtle)] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="font-semibold text-[var(--text-primary)]">SQL Query Used</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={copiedSql ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                      onClick={() => handleCopySql(result.sql!)}
                    >
                      {copiedSql ? 'Copied' : 'Copy SQL'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Terminal className="w-3.5 h-3.5" />}
                      onClick={() => onOpenInSqlBox(result.sql!)}
                    >
                      Open in SQL Box
                    </Button>
                  </div>
                </div>
                <div className="p-3 bg-[var(--bg-subtle)]">
                  <pre className="font-mono text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {result.sql}
                  </pre>
                </div>
              </div>
            )}

            {/* 3. Explanation & Assumptions */}
            {(result.explanation || (result.assumptions && result.assumptions.length > 0)) && (
              <div className="p-3.5 rounded-[var(--radius-sm)] hairline-border bg-[var(--bg-surface)] space-y-2 text-xs">
                {result.explanation && (
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">Explanation: </span>
                    <span className="text-[var(--text-secondary)]">{result.explanation}</span>
                  </div>
                )}

                {result.assumptions && result.assumptions.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="font-semibold text-[var(--text-primary)]">Assumptions:</span>
                    <ul className="list-disc list-inside text-[var(--text-secondary)] space-y-0.5">
                      {result.assumptions.map((asm, idx) => (
                        <li key={idx}>{asm}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 4. Safety Disclaimer + Thumbs Feedback */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--text-muted)] pt-1">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>AI-generated query. Check the SQL and assumptions before relying on the result.</span>
              </div>

              <div className="flex items-center gap-2">
                <span>Was this helpful?</span>
                <button
                  type="button"
                  title="Helpful"
                  onClick={() => setUserFeedback('up')}
                  className={`p-1 rounded hairline-border transition-colors cursor-pointer ${
                    userFeedback === 'up'
                      ? 'bg-[var(--accent)] text-white'
                      : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
                  }`}
                >
                  <ThumbsUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="Not helpful"
                  onClick={() => setUserFeedback('down')}
                  className={`p-1 rounded hairline-border transition-colors cursor-pointer ${
                    userFeedback === 'down'
                      ? 'bg-[var(--danger)] text-white'
                      : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
                  }`}
                >
                  <ThumbsDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty Initial State Prompt */}
        {!isAsking && !result && !error && (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Ask Questions in Plain English
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                CleanFlow translates your question into a fast, read-only DuckDB query, executes it safely in the sandbox, and shows you both the answer and the exact SQL used.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
