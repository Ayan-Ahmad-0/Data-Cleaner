import React, { useEffect, useState } from 'react';
import { X, Copy, Check, Code2, Database, FileText, Loader2 } from 'lucide-react';
import { exportModelingSchema } from '../../lib/api';
import { Button } from '../ui/Button';

interface SchemaExportModalProps {
  isOpen: boolean;
  sessionId: string;
  onClose: () => void;
}

export const SchemaExportModal: React.FC<SchemaExportModalProps> = ({
  isOpen,
  sessionId,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'mermaid' | 'dbml' | 'sql_ddl'>('mermaid');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sessionId) return;

    const fetchExport = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await exportModelingSchema(sessionId, activeTab);
        setContent(res.content);
      } catch (err: any) {
        setError(err.message || 'Failed to export schema.');
      } finally {
        setLoading(false);
      }
    };

    fetchExport();
  }, [isOpen, sessionId, activeTab]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#FF4B3E]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
              Export Relational Schema & ERD
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Switcher Tabs */}
        <div className="flex items-center border-b border-[var(--border-hairline)] bg-[var(--bg-app)] px-4 pt-2 gap-2 text-xs font-mono">
          {[
            { id: 'mermaid' as const, label: 'Mermaid ERD', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'dbml' as const, label: 'DBML Schema', icon: <Code2 className="w-3.5 h-3.5" /> },
            { id: 'sql_ddl' as const, label: 'SQL DDL (Foreign Keys)', icon: <Database className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'border-[#FF4B3E] text-[var(--text-primary)] bg-[var(--bg-surface)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Preview Block */}
        <div className="flex-1 p-4 overflow-y-auto">
          {loading ? (
            <div className="py-20 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin text-[#FF4B3E]" />
              <span>Generating schema specification...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-red-400 text-center font-mono">
              {error}
            </div>
          ) : (
            <div className="relative">
              <pre className="p-4 rounded-lg bg-[var(--bg-app)] border border-[var(--border-hairline)] text-xs font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre leading-relaxed">
                {content}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {activeTab === 'mermaid' ? 'Paste into GitHub Markdown or Notion' : activeTab === 'dbml' ? 'Compatible with dbdocs.io & dbdiagram.io' : 'PostgreSQL & DuckDB standard DDL'}
          </span>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} className="text-xs">
              Close
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCopy}
              disabled={loading || !content}
              leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              className="text-xs bg-[#FF4B3E] hover:bg-[#E03E32]"
            >
              {copied ? 'Copied to Clipboard' : 'Copy Code'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
