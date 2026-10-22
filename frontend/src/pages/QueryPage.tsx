import React, { useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Tag } from '../components/ui/Tag';
import { formatBytes, formatNumber } from '../lib/format';
import {
  detectFormat,
  uploadForQuery,
  type QueryUploadResult,
} from '../lib/api';
import {
  ArrowRight,
  Bot,
  Database,
  FileText,
  FileUp,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { SqlQueryBox } from '../components/explore/SqlQueryBox';

interface QueryPageProps {
  onHandoffToClean: (jobId: string, filename: string) => void;
}

export const QueryPage: React.FC<QueryPageProps> = ({ onHandoffToClean }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const [queryResult, setQueryResult] = useState<QueryUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file: File) => {
    setError(null);
    setSelectedFile(file);
    setSheetNames([]);
    setSelectedSheet('');
    setTableNames([]);
    setSelectedTable('');

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const supportedExts = ['.csv', '.tsv', '.parquet', '.json', '.ndjson', '.jsonl', '.xlsx', '.db', '.sqlite'];

    if (!supportedExts.includes(ext)) {
      setError(`Unsupported file type '${ext}'. Please upload a CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) file.`);
      return;
    }

    try {
      // Fast format detection to sniff sheets or tables
      const detectRes = await detectFormat(file);
      setDetectedFormat(detectRes.format);

      if (detectRes.sheets && detectRes.sheets.length > 1) {
        setSheetNames(detectRes.sheets);
        setSelectedSheet(detectRes.sheets[0]);
      } else if (detectRes.tables && detectRes.tables.length > 1) {
        setTableNames(detectRes.tables);
        setSelectedTable(detectRes.tables[0]);
      } else {
        // Direct staging if no sheet/table disambiguation needed
        await processAndStageFile(file);
      }
    } catch {
      // If sniff fails, proceed with default direct staging
      await processAndStageFile(file);
    }
  };

  const processAndStageFile = async (
    file: File,
    customOptions?: { sheet?: string; table?: string }
  ) => {
    setError(null);
    setIsUploading(true);
    setUploadProgress(20);

    const timer = setInterval(() => {
      setUploadProgress((prev) => (prev < 85 ? prev + 15 : prev));
    }, 200);

    try {
      const options = customOptions || (
        selectedSheet ? { sheet: selectedSheet } : selectedTable ? { table: selectedTable } : undefined
      );

      const res = await uploadForQuery(file, options);
      clearInterval(timer);
      setUploadProgress(100);
      setQueryResult(res);
    } catch (err: any) {
      clearInterval(timer);
      setError(err.message || 'Failed to stage dataset for querying.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setQueryResult(null);
    setDetectedFormat('');
    setSheetNames([]);
    setTableNames([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container-shell py-8 sm:py-12 space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 hairline-b">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
              Query Your Data
            </h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Upload any dataset to ask questions in natural English with our AI Analyst or write sandboxed DuckDB SQL queries directly against your data without cleaning or converting.
          </p>
        </div>

        {queryResult && (
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="secondary"
              size="md"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={handleReset}
            >
              Query Different File
            </Button>
            <Button
              variant="secondary"
              size="md"
              rightIcon={<ArrowRight className="w-4 h-4" />}
              onClick={() => onHandoffToClean(queryResult.query_id, queryResult.filename)}
            >
              Clean this file too
            </Button>
          </div>
        )}
      </div>

      {/* Error Callout */}
      {error && (
        <Callout
          variant="danger"
          title="Upload or Staging Error"
          action={
            <Button size="sm" variant="secondary" onClick={() => setError(null)}>
              Dismiss
            </Button>
          }
        >
          <p className="text-xs">{error}</p>
        </Callout>
      )}

      {/* 1. Upload & Staging View (when no dataset is loaded yet) */}
      {!queryResult ? (
        <div className="space-y-6">
          {/* Disambiguation for multi-sheet Excel / multi-table SQLite */}
          {selectedFile && !isUploading && (sheetNames.length > 1 || tableNames.length > 1) && (
            <div className="p-5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] hairline-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Database className="w-4 h-4 text-[var(--accent)]" />
                <span>
                  {sheetNames.length > 1
                    ? 'Select an Excel Sheet to Query:'
                    : 'Select a SQLite Table to Query:'}
                </span>
                {detectedFormat && (
                  <Tag variant="neutral" font="mono">
                    {detectedFormat.toUpperCase()}
                  </Tag>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedSheet || selectedTable}
                  onChange={(e) => {
                    if (sheetNames.length > 1) setSelectedSheet(e.target.value);
                    else setSelectedTable(e.target.value);
                  }}
                  className="bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm rounded-[var(--radius-sm)] px-3.5 py-2 hairline-border outline-none"
                >
                  {(sheetNames.length > 1 ? sheetNames : tableNames).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => processAndStageFile(selectedFile)}
                >
                  Start Exploring
                </Button>
              </div>
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`dropzone-glow bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-10 sm:p-14 text-center transition-all duration-200 border border-dotted cursor-pointer ${
              dragActive
                ? 'drag-active border-[var(--accent)] bg-[var(--accent-subtle)]'
                : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
            }`}
            style={{
              backgroundImage: dragActive
                ? undefined
                : 'radial-gradient(ellipse at center top, var(--bg-subtle) 0%, transparent 70%)',
            }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileInputChange}
              accept=".csv,.tsv,.parquet,.json,.ndjson,.jsonl,.xlsx,.db,.sqlite"
            />

            {isUploading ? (
              <div className="py-8 space-y-4 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin mx-auto" />
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-[var(--text-primary)] block">
                    Staging dataset into DuckDB sandbox...
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-mono block">
                    {uploadProgress}% completed
                  </span>
                </div>
                <div className="w-full bg-[var(--bg-subtle)] h-1.5 rounded-full overflow-hidden hairline-border">
                  <div
                    className="bg-[var(--accent)] h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="w-14 h-14 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto hairline-border shadow-2xs">
                  <FileUp className="w-7 h-7 text-[var(--accent)]" />
                </div>

                <div className="space-y-1.5">
                  <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block">
                    Drag and drop your dataset here to query
                  </span>
                  <span className="text-sm text-[var(--text-muted)] block">
                    CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) up to 10 GB
                  </span>
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Select File to Query
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Prominent Feature Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="p-5 rounded-xl bg-[#141517] border border-zinc-800 hover:border-zinc-700/80 transition-all space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#FF4B3E]/15 text-[#FF4B3E] flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#FF4B3E] text-white">
                  Interactive AI
                </span>
              </div>
              <div>
                <span className="text-sm font-semibold text-white block">
                  Ask AI Analyst
                </span>
                <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                  Query in natural English. AI writes, verifies, and executes read-only SQL against your uploaded data, auto-correcting any errors.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#141517] border border-zinc-800 hover:border-zinc-700/80 transition-all space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-zinc-850 border border-zinc-750 text-zinc-200 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-zinc-300" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide bg-zinc-800 text-zinc-300 border border-zinc-750">
                  DuckDB
                </span>
              </div>
              <div>
                <span className="text-sm font-semibold text-white block">
                  SQL Query Box
                </span>
                <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                  Full-featured SQL terminal with quick starters, 1-click schema insertion, query history, and instant CSV export.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#141517] border border-zinc-800 hover:border-zinc-700/80 transition-all space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-zinc-850 border border-zinc-750 text-zinc-400 flex items-center justify-center">
                  <Database className="w-5 h-5 text-zinc-400" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wide bg-zinc-850 text-zinc-400 border border-zinc-800">
                  Sandboxed
                </span>
              </div>
              <div>
                <span className="text-sm font-semibold text-white block">
                  Zero Conversion Delay
                </span>
                <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                  Immediate indexing into a local in-process memory sandbox. Fast queries, strictly private, auto-purged within 24h.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 2. Active Query & Exploration Workspace */
        <div className="space-y-6">
          {/* Active Dataset Stat Bar */}
          <div className="bg-[#141517] border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-zinc-850 border border-zinc-750 text-[#FF4B3E] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-semibold text-white truncate block tracking-tight" title={queryResult.filename}>
                    {queryResult.filename}
                  </span>
                  <Tag variant="neutral" font="mono">
                    {queryResult.detected_format ? queryResult.detected_format.toUpperCase() : 'DATASET'}
                  </Tag>
                </div>
                <span className="text-xs text-zinc-400 font-mono">
                  {formatBytes(queryResult.file_size_bytes)} · {formatNumber(queryResult.row_count)} rows · {queryResult.columns.length} columns
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw className="w-3.5 h-3.5 text-zinc-400" />}
                onClick={handleReset}
              >
                Query Another File
              </Button>
              <Button
                size="sm"
                variant="secondary"
                rightIcon={<ArrowRight className="w-3.5 h-3.5 text-zinc-400" />}
                onClick={() => onHandoffToClean(queryResult.query_id, queryResult.filename)}
              >
                Clean this file too
              </Button>
            </div>
          </div>

          {/* Main SQL & AI Analyst Explorer Component */}
          <SqlQueryBox
            jobId={queryResult.query_id}
            datasetName={queryResult.filename}
            initialMode="ask_ai"
          />
        </div>
      )}
    </div>
  );
};
