import { useState } from 'react';
import type { JobDetailResponse } from '../lib/api';

interface ApprovalPageProps {
  jobData: JobDetailResponse | null;
  onStartCleaning: () => void;
}

export const ApprovalPage: React.FC<ApprovalPageProps> = ({ jobData, onStartCleaning }) => {
  const [cleaningStarted, setCleaningStarted] = useState(false);
  const plainEnglishRules = jobData?.recipe_plain_english || [];
  const openQuestions = jobData?.open_questions || [];
  const profile = jobData?.profile || {};
  const fileMeta = profile?.file || {};

  const handleApprove = () => {
    setCleaningStarted(true);
    onStartCleaning();
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight">
            Review & Approve Cleaning Recipe
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Rules are restricted to the verified macro library. Free-form SQL generation is strictly prohibited.
          </p>
        </div>
        <button
          onClick={handleApprove}
          disabled={cleaningStarted}
          className="bg-[var(--ok)] hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
        >
          <span>{cleaningStarted ? 'Executing...' : 'Approve & Execute Clean'}</span>
          <span className="mono text-[11px] opacity-80">(DuckDB CTE)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Summary & Execution Parameters */}
        <div className="space-y-4">
          <div className="bg-[var(--surface)] hairline-border p-4 rounded-xs text-xs space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              Engine Configuration
            </span>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>Target Records:</span>
              <span className="text-[var(--text)] font-semibold">{fileMeta.rows ? fileMeta.rows.toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>Memory Limit:</span>
              <span className="text-[var(--text)]">4.0 GB</span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>CPU Threads:</span>
              <span className="text-[var(--text)]">4 Cores</span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)] mono">
              <span>Execution Engine:</span>
              <span className="text-[var(--text)]">DuckDB Vectorized</span>
            </div>
          </div>

          {openQuestions.length > 0 && (
            <div className="bg-[var(--surface)] hairline-border border-l-2 border-l-[var(--warn)] p-4 rounded-xs text-xs space-y-3">
              <span className="font-semibold text-[var(--warn)] uppercase tracking-wider text-[11px] block">
                Required Confirmations ({openQuestions.length})
              </span>
              <div className="space-y-2">
                {openQuestions.map((q, idx) => (
                  <div key={idx} className="p-2 bg-amber-50/50 rounded-xs space-y-1">
                    <p className="text-xs text-[var(--text)] font-medium">{q}</p>
                    <div className="flex items-center space-x-3 text-[11px] text-[var(--text-muted)] mono pt-1">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input type="radio" name={`confirm_${idx}`} defaultChecked className="text-[var(--accent)]" />
                        <span>Accept Default</span>
                      </label>
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input type="radio" name={`confirm_${idx}`} className="text-[var(--accent)]" />
                        <span>Keep Unaltered</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Plain-English Cleaning Plan */}
        <div className="md:col-span-2 space-y-3">
          <div className="bg-[var(--surface)] hairline-border rounded-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Compiled Cleaning Recipe ({plainEnglishRules.length} Steps)
              </span>
              <span className="text-[11px] mono text-[var(--ok)] bg-green-50 px-2 py-0.5 rounded-xs">
                Schema Validated
              </span>
            </div>

            <ol className="space-y-3 text-xs">
              {plainEnglishRules.map((rule, idx) => (
                <li key={idx} className="flex items-start space-x-3 p-2.5 rounded-xs bg-gray-50/40 hairline-border">
                  <span className="w-5 h-5 rounded-full bg-[var(--surface)] hairline-border flex items-center justify-center text-[10px] mono font-semibold text-[var(--text-muted)] flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-[var(--text)] leading-relaxed font-sans">{rule}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
