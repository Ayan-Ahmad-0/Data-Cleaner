import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import {
  X,
  FileCode,
  Printer,
  Share2,
  Download,
  Copy,
  Check,
  Upload,
  Globe,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import type { QueryUploadResult, PageDataOptions, ChartSpec } from '../../lib/api';
import type { ChartCardItem } from './ChartCard';
import {
  downloadDashboardHtml,
  downloadDashboardJson,
  copyDashboardSnapshotText,
  parseDashboardJsonFile,
  triggerPdfPrint,
} from './exportDashboard';

interface ExportDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetInfo: QueryUploadResult;
  cards: ChartCardItem[];
  pageOptions?: PageDataOptions;
  onImportDashboard?: (importedSpecs: ChartSpec[], pageOptions?: PageDataOptions) => void;
}

export const ExportDashboardModal: React.FC<ExportDashboardModalProps> = ({
  isOpen,
  onClose,
  datasetInfo,
  cards,
  pageOptions,
  onImportDashboard,
}) => {
  const [reportTitle, setReportTitle] = useState(
    `${datasetInfo.filename.replace(/\.[^/.]+$/, '')} Analytics Dashboard`
  );
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadHtml = () => {
    downloadDashboardHtml(reportTitle, datasetInfo, cards, pageOptions);
  };

  const handleDownloadJson = () => {
    downloadDashboardJson(reportTitle, datasetInfo, cards, pageOptions);
  };

  const handleCopySnapshot = async () => {
    const ok = await copyDashboardSnapshotText(reportTitle, datasetInfo, cards, pageOptions);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrintPdf = () => {
    onClose();
    setTimeout(() => {
      triggerPdfPrint();
    }, 200);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setIsImporting(true);
    try {
      const snapshot = await parseDashboardJsonFile(file);
      const specs = snapshot.cards.map((c) => c.spec);
      if (onImportDashboard) {
        onImportDashboard(specs, snapshot.page_options);
      }
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse dashboard file.');
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                Share & Export Dashboard
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Generate standalone interactive HTML reports, print-ready PDF briefings, or share layout snapshots.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            aria-label="Close export dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-5">
          {/* Dashboard Title Customizer */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Report Title
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="e.g. Q4 Executive Intelligence Briefing"
              className="w-full px-3 py-2 text-xs font-medium bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-hidden"
            />
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] pt-0.5">
              <span>Dataset: <strong className="font-mono text-[var(--text-secondary)]">{datasetInfo.filename}</strong></span>
              <span>•</span>
              <span>{cards.length} active charts</span>
              <span>•</span>
              <span>{datasetInfo.row_count ? `${datasetInfo.row_count.toLocaleString()} rows` : ''}</span>
            </div>
          </div>

          {/* Export Options Grid */}
          <div className="grid grid-cols-1 gap-3.5 pt-1">
            {/* Option 1: Standalone HTML Dashboard */}
            <div className="p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    Interactive Standalone HTML Report
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                    Offline Ready
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-md">
                  Single self-contained file with embedded Plotly charts, dark/light theme switch, and full interactivity. Opens in any browser without needing a server.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={handleDownloadHtml}
                className="shrink-0 text-xs py-1.5 px-3.5 shadow-xs"
              >
                Download HTML
              </Button>
            </div>

            {/* Option 2: Print-Ready PDF Briefing */}
            <div className="p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-amber-500" />
                    Executive Briefing PDF Report
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/25">
                    A4 / Letter
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-md">
                  Clean corporate print layout with executive cover header, vector-crisp chart renders, high-contrast tables, and no UI controls or clutter.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Printer className="w-3.5 h-3.5" />}
                onClick={handlePrintPdf}
                className="shrink-0 text-xs py-1.5 px-3.5"
              >
                Print / Save PDF
              </Button>
            </div>

            {/* Option 3: Shareable JSON Configuration */}
            <div className="p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                    Dashboard Configuration Snapshot
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                    JSON Bundle
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-md">
                  Save all custom chart specs, formulas, moving averages, and global filter settings to collaborate with teammates or reload anytime.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  onClick={handleCopySnapshot}
                  className="text-xs py-1.5 px-3"
                  title="Copy snapshot JSON to clipboard"
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleDownloadJson}
                  className="text-xs py-1.5 px-3"
                  title="Download .dashboard.json"
                >
                  Save JSON
                </Button>
              </div>
            </div>
          </div>

          {/* Import Dashboard Layout Drawer */}
          {onImportDashboard && (
            <div className="pt-2 border-t border-[var(--border-hairline)] flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">
                Have a previously saved <code className="font-mono text-[11px] text-[var(--text-secondary)]">.dashboard.json</code> file?
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Upload className="w-3.5 h-3.5" />}
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
                className="text-xs"
              >
                {isImporting ? 'Loading...' : 'Import Dashboard'}
              </Button>
            </div>
          )}

          {importError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs">
              <strong>Import Error:</strong> {importError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-end">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
