import React, { useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Tag } from '../components/ui/Tag';
import { formatBytes, formatNumber } from '../lib/format';
import {
  detectFormat,
  executeConvertOnly,
  getConvertDownloadUrl,
  previewConvert,
  type ConvertResultResponse,
} from '../lib/api';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  RefreshCw,
} from 'lucide-react';

interface ConvertPageProps {
  onHandoffToClean: (jobId: string, filename: string) => void;
}

const TARGET_FORMATS = [
  { id: 'parquet', label: 'Parquet (Columnar, ZSTD)', ext: '.parquet', note: 'Recommended for big data & fastest queries' },
  { id: 'csv', label: 'CSV (Comma-Separated)', ext: '.csv', note: 'Universal compatibility with spreadsheets' },
  { id: 'tsv', label: 'TSV (Tab-Separated)', ext: '.tsv', note: 'Tab-delimited text' },
  { id: 'ndjson', label: 'NDJSON (Newline JSON)', ext: '.ndjson', note: 'Ideal for streaming & line-by-line processing' },
  { id: 'json', label: 'JSON (Array)', ext: '.json', note: 'Standard JSON array format' },
  { id: 'xlsx', label: 'Excel Workbook (.xlsx)', ext: '.xlsx', note: 'Splits automatically into parts if >1,048,575 rows' },
];

export const ConvertPage: React.FC<ConvertPageProps> = ({ onHandoffToClean }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<string>('');
  const [overrideFormat, setOverrideFormat] = useState<string>('');
  const [detectedConfidence, setDetectedConfidence] = useState<number>(0);

  // Source options
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');

  // Preview & Schema
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewReport, setPreviewReport] = useState<any | null>(null);

  // Target format & Conversion
  const [targetFormat, setTargetFormat] = useState<string>('parquet');
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<ConvertResultResponse | null>(null);
  const [error, setError] = useState<{ message: string; recovery: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setConvertResult(null);

    try {
      const det = await detectFormat(file);
      setDetectedFormat(det.format);
      setOverrideFormat(det.format);
      setDetectedConfidence(det.confidence);
      if (det.sheets && det.sheets.length > 0) {
        setSheetNames(det.sheets);
        setSelectedSheet(det.sheets[0]);
      }
      if (det.tables && det.tables.length > 0) {
        setTableNames(det.tables);
        setSelectedTable(det.tables[0]);
      }

      // Load preview
      await fetchPreview(file, det.format, {
        sheet: det.sheets?.[0],
        table: det.tables?.[0],
      });
    } catch (err: any) {
      setError({
        message: err.message || 'Format detection failed',
        recovery: 'You can choose the format manually below.',
      });
    }
  };

  const fetchPreview = async (file: File, fmt: string, opts?: Record<string, any>) => {
    try {
      const res = await previewConvert(file, fmt, opts);
      setPreviewRows(res.preview || []);
      setPreviewReport(res.report || null);
    } catch (err: any) {
      console.warn('Preview error:', err);
    }
  };

  const handleExecuteConvert = async () => {
    if (!selectedFile) return;
    setConverting(true);
    setError(null);

    const srcOpts: Record<string, any> = {};
    if (selectedSheet) srcOpts.sheet = selectedSheet;
    if (selectedTable) srcOpts.table = selectedTable;

    try {
      const res = await executeConvertOnly(
        selectedFile,
        targetFormat,
        overrideFormat || detectedFormat,
        Object.keys(srcOpts).length > 0 ? srcOpts : undefined,
      );
      setConvertResult(res);
    } catch (err: any) {
      setError({
        message: err.message || 'Conversion failed',
        recovery: 'Verify input dataset validity or pick another target format like Parquet or CSV.',
      });
    } finally {
      setConverting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setConvertResult(null);
    setPreviewRows([]);
    setPreviewReport(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="container-shell py-8 sm:py-12 max-w-4xl mx-auto space-y-8">
      {/* Title & Mode Switch Note */}
      <div className="space-y-1.5 pb-4 hairline-b">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
            Convert Format Only
          </h1>
          <Tag variant="neutral" font="mono">No Cleaning / Pure Streaming</Tag>
        </div>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          High-performance, in-process format conversion powered by DuckDB.
          Converts large datasets between CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), and SQLite without running profiling or altering values.
        </p>
      </div>

      {/* Error Callout */}
      {error && (
        <Callout
          variant="danger"
          title={error.message}
          action={
            <Button size="sm" variant="secondary" onClick={() => setError(null)}>
              Dismiss
            </Button>
          }
        >
          {error.recovery}
        </Callout>
      )}

      {/* 1. File Upload / Dropzone */}
      {!selectedFile ? (
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFile(e.dataTransfer.files[0]);
            }
          }}
          className={`bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-10 sm:p-14 text-center transition-all border-dashed ${
            dragActive
              ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
              : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.parquet,.json,.ndjson,.jsonl,.xlsx,.db,.sqlite"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
            className="hidden"
            id="convert-file-input"
          />

          <div className="space-y-5">
            <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto">
              <FileUp className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block">
                Drag and drop your dataset here to convert
              </span>
              <span className="text-sm text-[var(--text-muted)] block">
                CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) up to 10 GB
              </span>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
              >
                Select File to Convert
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* 2. File Selected, Preview, Options & Target Picker */
        <div className="space-y-6">
          {/* File Header Bar */}
          <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-sm sm:text-base font-semibold text-[var(--text-primary)] truncate block" title={selectedFile.name}>
                  {selectedFile.name}
                </span>
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  {formatBytes(selectedFile.size)} · Detected: <strong className="text-[var(--text-primary)] uppercase">{detectedFormat}</strong> ({Math.round(detectedConfidence * 100)}% confidence)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleReset} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                Choose Different File
              </Button>
            </div>
          </div>

          {/* Options (Sheet / Table selector if applicable) */}
          {sheetNames.length > 1 && (
            <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-4 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Select Excel Sheet to Convert:
              </span>
              <select
                value={selectedSheet}
                onChange={(e) => {
                  setSelectedSheet(e.target.value);
                  fetchPreview(selectedFile, overrideFormat || detectedFormat, { sheet: e.target.value });
                }}
                className="bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm rounded-[var(--radius-sm)] px-3 py-1.5 hairline-border outline-none"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {tableNames.length > 1 && (
            <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-4 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Select SQLite Table to Convert:
              </span>
              <select
                value={selectedTable}
                onChange={(e) => {
                  setSelectedTable(e.target.value);
                  fetchPreview(selectedFile, overrideFormat || detectedFormat, { table: e.target.value });
                }}
                className="bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm rounded-[var(--radius-sm)] px-3 py-1.5 hairline-border outline-none"
              >
                {tableNames.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Target Format Grid */}
          {!convertResult && (
            <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-5 sm:p-6 space-y-4">
              <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                Choose Target Format
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {TARGET_FORMATS.map((tgt) => {
                  const isSelected = targetFormat === tgt.id;
                  return (
                    <button
                      key={tgt.id}
                      type="button"
                      onClick={() => setTargetFormat(tgt.id)}
                      className={`text-left p-3.5 rounded-[var(--radius-sm)] transition-all cursor-pointer border ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                          : 'hairline-border bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {tgt.label}
                        </span>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />}
                      </div>
                      <span className="text-xs text-[var(--text-muted)] block leading-snug">
                        {tgt.note}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Action Button */}
              <div className="pt-2 flex items-center justify-end">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={converting}
                  onClick={handleExecuteConvert}
                  leftIcon={<ArrowRight className="w-5 h-5" />}
                >
                  {converting ? 'Converting Dataset...' : `Convert to ${targetFormat.toUpperCase()}`}
                </Button>
              </div>
            </div>
          )}

          {/* 3. Conversion Completed Screen */}
          {convertResult && (
            <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                    Conversion Successful
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-mono">
                    {formatNumber(convertResult.result.rows)} rows converted in {convertResult.result.elapsed_seconds}s
                  </p>
                </div>
              </div>

              {/* Fidelity Warnings */}
              {convertResult.result.warnings.length > 0 && (
                <div className="bg-[var(--bg-subtle)] hairline-border rounded-[var(--radius-md)] p-4 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                    Fidelity & Schema Notices:
                  </span>
                  <ul className="text-xs sm:text-sm text-[var(--text-secondary)] space-y-1 list-disc pl-4">
                    {convertResult.result.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Download & Handoff Actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 hairline-t">
                <div className="flex items-center gap-3">
                  <a
                    href={getConvertDownloadUrl(convertResult.convert_id)}
                    download
                    className="inline-block"
                  >
                    <Button
                      variant="primary"
                      size="lg"
                      leftIcon={<Download className="w-5 h-5" />}
                    >
                      Download Converted File ({convertResult.result.target_format.toUpperCase()})
                    </Button>
                  </a>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => onHandoffToClean(convertResult.convert_id, selectedFile.name)}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Clean this file too
                  </Button>
                </div>
              </div>

              {/* Privacy Line */}
              <p className="text-xs text-[var(--text-muted)] text-center pt-2">
                Your converted files are kept isolated in temporary workspace storage and deleted automatically within 24 hours.
              </p>
            </div>
          )}

          {/* 4. Preview Table (first 100 rows) */}
          {previewRows.length > 0 && (
            <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] overflow-hidden">
              <div className="p-4 hairline-b bg-[var(--bg-subtle)] flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Dataset Sample Preview (First 100 Rows)
                </span>
                {previewReport && (
                  <span className="text-xs text-[var(--text-muted)] font-mono">
                    Total: {formatNumber(previewReport.rows)} rows · {previewReport.columns.length} columns
                  </span>
                )}
              </div>

              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[var(--bg-subtle)] hairline-b text-[var(--text-muted)] font-medium">
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((col) => (
                        <th key={col} className="py-2.5 px-3 font-semibold uppercase tracking-wider">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)] font-mono">
                    {previewRows.slice(0, 10).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[var(--bg-hover)]">
                        {Object.values(row).map((val: any, cIdx) => (
                          <td key={cIdx} className="py-2 px-3 text-[var(--text-secondary)] truncate max-w-[200px]">
                            {val !== null && val !== undefined ? String(val) : <span className="text-[var(--text-placeholder)]">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
