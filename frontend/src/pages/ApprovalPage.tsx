import React, { useMemo, useState } from 'react';
import type { JobDetailResponse } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Disclosure } from '../components/ui/Disclosure';
import { Tag } from '../components/ui/Tag';
import { Toggle } from '../components/ui/Toggle';
import { cleanRuleSentence, formatNumber, pluralize } from '../lib/format';
import { Check, CheckSquare, Sliders } from 'lucide-react';

interface ApprovalPageProps {
  jobData: JobDetailResponse | null;
  onStartCleaning: (customRecipe?: any) => void;
  onGoToUpload?: () => void;
}

export const ApprovalPage: React.FC<ApprovalPageProps> = ({ jobData, onStartCleaning, onGoToUpload }) => {
  const profile = jobData?.profile;
  const fileMeta = profile?.file || {};
  const duplicates = profile?.duplicates || {};
  const columnsProfile = profile?.columns || {};
  const initialRecipe = jobData?.recipe;
  const initialOpenQuestions = jobData?.open_questions || [];

  // Track editable recipe copy
  const [recipe, setRecipe] = useState<any>(() => {
    return initialRecipe ? JSON.parse(JSON.stringify(initialRecipe)) : null;
  });

  // Track answers to open questions: questionIndex -> answer
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>(() => {
    return {};
  });

  const [cleaningTriggered, setCleaningTriggered] = useState(false);

  // Check if all questions have been addressed
  const allQuestionsAnswered = useMemo(() => {
    const questions = jobData?.open_questions || [];
    if (questions.length === 0) return true;
    return questions.every((_, idx) => Boolean(questionAnswers[idx]));
  }, [jobData?.open_questions, questionAnswers]);

  // Projected impact computed strictly from real profile metrics
  const projectedImpact = useMemo(() => {
    const dups = profile?.duplicates || {};
    const colsProf = profile?.columns || {};
    const items: Array<{ title: string; count: number; detail: string; severity: 'ok' | 'warn' | 'danger' }> = [];

    // Duplicates
    if (recipe?.dedupe && dups.exact_rows > 0) {
      items.push({
        title: 'Duplicate Row Removal',
        count: dups.exact_rows,
        detail: `${formatNumber(dups.exact_rows)} exact duplicates will be removed`,
        severity: 'ok',
      });
    }

    // Column-level impacts
    if (recipe?.columns) {
      Object.entries(recipe.columns).forEach(([colName, colRule]: [string, any]) => {
        const colProf = colsProf[colName] || {};

        // Drop rows on null
        if (colRule.handle_nulls?.strategy === 'drop_row' && colProf.nulls > 0) {
          items.push({
            title: `Row Filter on ${colName}`,
            count: colProf.nulls,
            detail: `${formatNumber(colProf.nulls)} rows with missing ${colName} will be dropped`,
            severity: 'warn',
          });
        }

        // Fill nulls
        if (colRule.handle_nulls && colRule.handle_nulls.strategy !== 'drop_row' && colProf.nulls > 0) {
          const strat = colRule.handle_nulls.strategy.replace('fill_', '');
          items.push({
            title: `Missing Value Imputation (${colName})`,
            count: colProf.nulls,
            detail: `${formatNumber(colProf.nulls)} empty values will be filled with column ${strat}`,
            severity: 'ok',
          });
        }

        // Whitespace & Tokens
        if (colRule.trim_and_normalize && colProf.whitespace_issues > 0) {
          items.push({
            title: `Whitespace Trim (${colName})`,
            count: colProf.whitespace_issues,
            detail: `${formatNumber(colProf.whitespace_issues)} values with stray spacing will be trimmed`,
            severity: 'ok',
          });
        }

        // Outlier bounds
        if (colRule.clip_outliers && colProf.negatives > 0) {
          const action = colRule.clip_outliers.action === 'clamp' ? 'clamped to 0' : 'set to null';
          items.push({
            title: `Outlier Normalization (${colName})`,
            count: colProf.negatives,
            detail: `${formatNumber(colProf.negatives)} negative values will be ${action}`,
            severity: 'ok',
          });
        }
      });
    }

    return items;
  }, [recipe, profile]);

  // Toggle column rule
  const handleToggleColumn = (colName: string, enabled: boolean) => {
    if (!recipe) return;
    const nextRecipe = { ...recipe };
    nextRecipe.columns = { ...nextRecipe.columns };

    if (!enabled) {
      delete nextRecipe.columns[colName];
    } else if (initialRecipe?.columns?.[colName]) {
      nextRecipe.columns[colName] = JSON.parse(JSON.stringify(initialRecipe.columns[colName]));
    }
    setRecipe(nextRecipe);
  };

  // Toggle dedupe
  const handleToggleDedupe = (enabled: boolean) => {
    if (!recipe) return;
    const nextRecipe = { ...recipe };
    if (!enabled) {
      delete nextRecipe.dedupe;
    } else if (initialRecipe?.dedupe) {
      nextRecipe.dedupe = JSON.parse(JSON.stringify(initialRecipe.dedupe));
    } else {
      nextRecipe.dedupe = { keys: [Object.keys(columnsProfile)[0] || 'id'], keep: 'latest' };
    }
    setRecipe(nextRecipe);
  };

  // Change null handling strategy
  const handleNullStrategyChange = (colName: string, strategy: string) => {
    if (!recipe?.columns?.[colName]) return;
    const nextRecipe = { ...recipe };
    nextRecipe.columns[colName] = {
      ...nextRecipe.columns[colName],
      handle_nulls: {
        strategy,
        value: strategy === 'fill_value' ? 'unknown' : undefined,
      },
    };
    setRecipe(nextRecipe);
  };

  // Trigger execution
  const handleApprove = () => {
    setCleaningTriggered(true);
    onStartCleaning(recipe);
  };

  if (!jobData) {
    return (
      <div className="container-shell py-16 sm:py-24 max-w-2xl mx-auto text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto hairline-border">
          <CheckSquare className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
            No Cleaning Plan Compiled Yet
          </h2>
          <p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-lg mx-auto">
            After uploading a CSV file in Step 1, the AI compiles a deterministic cleaning recipe
            for you to review, customize parameters, and approve before execution.
          </p>
        </div>
        {onGoToUpload && (
          <Button size="lg" variant="primary" onClick={onGoToUpload}>
            Go to Upload (Step 1)
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="container-shell py-8 sm:py-12 space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 hairline-b">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
              Review & Approve Cleaning Plan
            </h1>
            <Tag variant="ok" font="mono">
              Vectorized Safe Execution
            </Tag>
          </div>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1.5 max-w-2xl leading-relaxed">
            Review proposed transformation rules, answer confirmation questions, and tailor parameters.
            Your original CSV file is never modified or overwritten.
          </p>
        </div>

        <Button
          variant="primary"
          size="lg"
          disabled={!allQuestionsAnswered || cleaningTriggered}
          onClick={handleApprove}
        >
          {cleaningTriggered
            ? 'Starting Cleaning...'
            : !allQuestionsAnswered
            ? 'Answer Human Confirmations Below'
            : 'Approve & Start Cleaning'}
        </Button>
      </div>

      {/* 1. Open Questions Banner (if any questions required) */}
      {initialOpenQuestions.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
              Required Human Confirmations
            </h2>
            <Tag variant={allQuestionsAnswered ? 'ok' : 'warn'}>
              {allQuestionsAnswered ? 'All answered' : `${initialOpenQuestions.length} pending`}
            </Tag>
          </div>

          <div className="space-y-3">
            {initialOpenQuestions.map((q, idx) => {
              const isAnswered = Boolean(questionAnswers[idx]);
              return (
                <div
                  key={idx}
                  className={`p-5 rounded-[var(--radius-md)] border hairline-border transition-colors ${
                    isAnswered ? 'bg-[var(--bg-surface)]' : 'bg-[var(--status-warn-bg)] border-[var(--status-warn-border)]'
                  }`}
                >
                  <p className="text-sm sm:text-base font-medium text-[var(--text-primary)] leading-relaxed mb-3.5">
                    {cleanRuleSentence(q)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 text-sm">
                    <button
                      type="button"
                      onClick={() => setQuestionAnswers((prev) => ({ ...prev, [idx]: 'standard' }))}
                      className={`px-4 py-2 rounded-[var(--radius-sm)] border text-sm font-sans transition-colors cursor-pointer ${
                        questionAnswers[idx] === 'standard'
                          ? 'bg-[var(--accent)] text-white border-transparent font-medium'
                          : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      Accept Recommended Fix
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestionAnswers((prev) => ({ ...prev, [idx]: 'preserve' }))}
                      className={`px-4 py-2 rounded-[var(--radius-sm)] border text-sm font-sans transition-colors cursor-pointer ${
                        questionAnswers[idx] === 'preserve'
                          ? 'bg-[var(--accent)] text-white border-transparent font-medium'
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      Keep Original Token As-Is
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive Rules List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2.5 hairline-b">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                Proposed Cleaning Rules
              </h2>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                Toggle rules on or off, or customize how nulls and formats are treated.
              </p>
            </div>
            <span className="text-sm font-mono text-[var(--text-muted)]">
              {recipe ? (Object.keys(recipe.columns || {}).length + (recipe.dedupe ? 1 : 0)) : 0} active
            </span>
          </div>

          <div className="space-y-3.5">
            {/* Rule 1: Deduplication Rule */}
            {initialRecipe?.dedupe && (
              <div
                className={`p-5 rounded-[var(--radius-md)] border hairline-border bg-[var(--bg-surface)] transition-all ${
                  recipe?.dedupe ? '' : 'opacity-60 bg-[var(--bg-subtle)]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-[var(--bg-subtle)] hairline-border flex items-center justify-center text-xs font-mono font-medium text-[var(--text-muted)] shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                          Deduplicate Records
                        </span>
                        <Tag variant="neutral" font="mono">
                          {recipe?.dedupe?.keys.join(', ')}
                        </Tag>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        Remove exact and duplicate records partitioned by primary key{' '}
                        <code className="font-mono text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                          {recipe?.dedupe?.keys.join(', ')}
                        </code>
                        {recipe?.dedupe?.order_by ? `, keeping the latest record ordered by ${recipe.dedupe.order_by}` : ''}.
                      </p>
                      <span className="text-xs sm:text-sm text-[var(--text-muted)] block">
                        Why: Ingested dataset contains {formatNumber(duplicates.exact_rows || 0)} duplicate records ({duplicates.exact_pct || 0}%).
                      </span>
                    </div>
                  </div>

                  <Toggle
                    checked={Boolean(recipe?.dedupe)}
                    ariaLabel="Toggle record deduplication rule"
                    onChange={(checked) => handleToggleDedupe(checked)}
                  />
                </div>
              </div>
            )}

            {/* Column Transformation Rules */}
            {initialRecipe?.columns &&
              Object.entries(initialRecipe.columns).map(([colName, originalRule]: [string, any], idx) => {
                const isActive = Boolean(recipe?.columns?.[colName]);
                const activeRule = recipe?.columns?.[colName] || originalRule;
                const colProfile = columnsProfile[colName] || {};
                const ruleNumber = idx + (initialRecipe.dedupe ? 2 : 1);

                return (
                  <div
                    key={colName}
                    className={`p-5 rounded-[var(--radius-md)] border hairline-border bg-[var(--bg-surface)] transition-all ${
                      isActive ? '' : 'opacity-60 bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-[var(--bg-subtle)] hairline-border flex items-center justify-center text-xs font-mono font-medium text-[var(--text-muted)] shrink-0 mt-0.5">
                          {ruleNumber}
                        </span>

                        <div className="space-y-2.5 flex-1 min-w-0">
                          {/* Column header & type */}
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                              {colName}
                            </span>
                            <Tag variant="neutral" font="mono">
                              {colProfile.inferred_type || 'string'}
                            </Tag>
                          </div>

                          {/* Rule description */}
                          <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                            {activeRule.trim_and_normalize && (
                              <p>
                                Trim whitespace and normalize empty placeholder tokens ('N/A', 'null', '-') to null.
                              </p>
                            )}
                            {activeRule.parse_timestamp && (
                              <p>
                                Parse date/time using verified patterns, standardized in{' '}
                                <code className="font-mono text-xs sm:text-sm">{activeRule.parse_timestamp.source_tz || 'UTC'}</code> timezone.
                              </p>
                            )}
                            {activeRule.clip_outliers && (
                              <p>
                                Restrict values outside bounds [{activeRule.clip_outliers.min ?? '—'}, {activeRule.clip_outliers.max ?? '—'}] ({activeRule.clip_outliers.action}).
                              </p>
                            )}
                            {activeRule.handle_nulls && (
                              <div className="flex items-center gap-2.5 pt-1">
                                <span className="text-[var(--text-muted)] text-sm">Null strategy:</span>
                                <select
                                  disabled={!isActive}
                                  value={activeRule.handle_nulls.strategy}
                                  aria-label={`Null handling strategy for ${colName}`}
                                  onChange={(e) => handleNullStrategyChange(colName, e.target.value)}
                                  className="text-sm font-sans px-3 py-1.5 rounded-[var(--radius-sm)] border hairline-border bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer"
                                >
                                  <option value="drop_row">Drop row if null</option>
                                  <option value="fill_median">Fill with median</option>
                                  <option value="fill_mode">Fill with mode</option>
                                  <option value="fill_value">Fill with default value</option>
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Diagnostic Reason */}
                          <div className="text-xs sm:text-sm text-[var(--text-muted)] pt-1.5 hairline-t border-[var(--border-subtle)]">
                            Why: Column contains {pluralize(colProfile.nulls || 0, 'null', 'nulls')}
                            {colProfile.whitespace_issues ? `, ${formatNumber(colProfile.whitespace_issues)} whitespace anomalies` : ''}
                            {colProfile.negatives ? `, ${formatNumber(colProfile.negatives)} negative values` : ''}.
                          </div>
                        </div>
                      </div>

                      <Toggle
                        checked={isActive}
                        ariaLabel={`Toggle ${colName} cleaning rule`}
                        onChange={(checked) => handleToggleColumn(colName, checked)}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Column: Projected Impact & Reassurance (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Projected Impact Panel */}
          <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3.5 hairline-b">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                  Projected Cleaning Impact
                </h3>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                Derived from Profile
              </span>
            </div>

            {projectedImpact.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic">
                No active rules currently alter record counts or cell values.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {projectedImpact.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-[var(--status-ok)]">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </span>
                    <div className="space-y-0.5">
                      <span className="font-semibold text-[var(--text-primary)] block">
                        {item.title}
                      </span>
                      <span className="text-[var(--text-secondary)] block text-xs sm:text-sm leading-relaxed">
                        {item.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Safety Guarantee Callout */}
          <Callout variant="ok" title="Original Data Preserved">
            Your original CSV file is never altered or replaced. DuckDB builds the cleaned analytical
            dataset in a dedicated destination path. You can safely inspect and export without risk of data loss.
          </Callout>

          {/* Advanced Technical Details (Collapsed by default) */}
          <Disclosure
            title="Advanced Execution Parameters"
            subtitle="DuckDB in-process memory & threads"
            defaultOpen={false}
          >
            <div className="space-y-2 pt-2 text-sm font-mono">
              <div className="flex justify-between py-1 hairline-b border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)]">Memory Allocation</span>
                <span className="text-[var(--text-primary)] font-medium">4.0 GB Max</span>
              </div>
              <div className="flex justify-between py-1 hairline-b border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)]">Worker Threads</span>
                <span className="text-[var(--text-primary)] font-medium">4 Cores (SIMD)</span>
              </div>
              <div className="flex justify-between py-1 hairline-b border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)]">Target Dataset Size</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {fileMeta.rows ? `${formatNumber(fileMeta.rows)} records` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--text-muted)]">Pipeline Isolation</span>
                <span className="text-[var(--text-primary)] font-medium">Single Vectorized CTE</span>
              </div>
            </div>
          </Disclosure>
        </div>
      </div>
    </div>
  );
};
