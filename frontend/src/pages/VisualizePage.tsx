import React, { useRef, useState } from 'react';
import {
  detectFormat,
  getColumnStats,
  getChartSuggestions,
  uploadForQuery,
  type ChartColumnStats,
  type ChartSpec,
  type QueryUploadResult,
} from '../lib/api';
import { formatBytes, formatNumber } from '../lib/format';
import { SuggestionsGallery } from '../components/explore/SuggestionsGallery';
import { ChartBuilder } from '../components/explore/ChartBuilder';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import {
  BarChart3,
  Upload,
  Info,
  FileSpreadsheet,
} from 'lucide-react';

interface VisualizePageProps {
  onHandoffToQuery: (jobId: string, filename: string) => void;
  onHandoffToClean: (cleanJobId: string, filename: string) => void;
}

export const VisualizePage: React.FC<VisualizePageProps> = ({
  onHandoffToQuery,
  onHandoffToClean,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [datasetInfo, setDatasetInfo] = useState<QueryUploadResult | null>(null);
  const [columns, setColumns] = useState<ChartColumnStats[]>([]);
  const [suggestions, setSuggestions] = useState<ChartSpec[]>([]);
  const [activeSpec, setActiveSpec] = useState<ChartSpec | null>(null);

  // File sheet/table disambiguation
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

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

  const handleFileSelected = async (file: File) => {
    setError(null);
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
      const detectRes = await detectFormat(file);
      if (detectRes.sheets && detectRes.sheets.length > 1) {
        setSheetNames(detectRes.sheets);
        setSelectedSheet(detectRes.sheets[0]);
      } else if (detectRes.tables && detectRes.tables.length > 1) {
        setTableNames(detectRes.tables);
        setSelectedTable(detectRes.tables[0]);
      } else {
        await processAndStageFile(file);
      }
    } catch {
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
      setDatasetInfo(res);

      try {
        const [colStats, chartSuggestions] = await Promise.all([
          getColumnStats(res.query_id),
          getChartSuggestions(res.query_id),
        ]);
        setColumns(colStats);
        setSuggestions(chartSuggestions);
        if (chartSuggestions.length > 0) {
          setActiveSpec(chartSuggestions[0]);
        }
      } catch (err: any) {
        console.error('Failed to load chart suggestions:', err);
      }
    } catch (err: any) {
      clearInterval(timer);
      setError(err.message || 'Failed to prepare dataset for visualization.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setDatasetInfo(null);
    setColumns([]);
    setSuggestions([]);
    setActiveSpec(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`container-shell ${datasetInfo ? 'max-w-7xl' : 'max-w-3xl'} mx-auto pt-6 sm:pt-8 pb-12 sm:pb-16 space-y-7`}>
      {/* Hero Title */}
      <div className="text-left space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
          Visualize Your Data
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          Upload raw datasets up to 10 GB. Instant interactive charts, automatic data distribution graphs, and live chart builder with no cleaning required.
        </p>
      </div>

      {/* Raw-Data Honesty Note (Clean, neutral styling without yellow shading) */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Info className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
        <span>
          Viewing original, uncleaned data. Missing values, duplicates, and unparsed types are included in charts unless filtered out.
        </span>
      </div>

      {/* Error Callout */}
      {error && (
        <Callout variant="danger" title="Upload Failed">
          {error}
        </Callout>
      )}

      {/* Upload & Prepare Area (if no dataset loaded) */}
      {!datasetInfo && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`dropzone-glow bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-10 sm:p-14 text-center transition-all duration-200 border border-dashed ${
            dragActive
              ? 'drag-active border-[var(--accent)] bg-[var(--accent-subtle)]'
              : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
          }`}
          style={{
            backgroundImage: dragActive
              ? undefined
              : 'radial-gradient(ellipse at center top, var(--bg-subtle) 0%, transparent 70%)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.tsv,.parquet,.json,.ndjson,.jsonl,.xlsx,.db,.sqlite"
            onChange={handleFileInputChange}
            id="visualize-file-input"
          />

          {isUploading ? (
            <div className="space-y-5 py-4">
              <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto border border-[var(--accent-border)]">
                <BarChart3 className="w-7 h-7 animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block">
                  Preparing your file (internal zero-copy conversion)...
                </span>
                <span className="text-sm text-[var(--text-muted)] font-mono block">
                  {uploadProgress}% processed
                </span>
              </div>

              <div className="w-64 mx-auto bg-[var(--bg-subtle)] h-1.5 rounded-full overflow-hidden border border-[var(--border-hairline)]">
                <div
                  className="bg-[var(--accent)] h-full transition-all duration-200 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Upload icon with subtle background */}
              <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto border border-[var(--border-hairline)] shadow-[var(--shadow-card)]">
                <BarChart3 className="w-7 h-7 text-[var(--accent)]" />
              </div>

              <div className="space-y-1.5">
                <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block tracking-tight">
                  Drag and drop your data file here to visualize
                </span>
                <span className="text-sm text-[var(--text-muted)] block">
                  CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) up to 10 GB
                </span>
              </div>

              {sheetNames.length > 1 && (
                <div className="flex items-center justify-center gap-2 text-xs pt-1">
                  <span className="text-[var(--text-secondary)] font-medium">Select sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-sm)] px-2.5 py-1 text-xs"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {tableNames.length > 1 && (
                <div className="flex items-center justify-center gap-2 text-xs pt-1">
                  <span className="text-[var(--text-secondary)] font-medium">Select table:</span>
                  <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[var(--radius-sm)] px-2.5 py-1 text-xs"
                  >
                    {tableNames.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Primary CTA Button */}
              <div className="pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  leftIcon={<Upload className="w-4 h-4" />}
                  onClick={() => fileInputRef.current?.click()}
                  className="shadow-[0_2px_12px_rgba(253,66,51,0.18)] hover:shadow-[0_4px_20px_rgba(253,66,51,0.25)] transition-shadow duration-200"
                >
                  Select Dataset File
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Dataset Dashboard */}
      {datasetInfo && (
        <div className="space-y-6">
          {/* Dataset Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[var(--bg-surface)] rounded-[var(--radius-lg)] border border-[var(--border-hairline)] shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[var(--bg-subtle)] rounded-[var(--radius-md)] text-[var(--accent)]">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {datasetInfo.filename}
                </h2>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatBytes(datasetInfo.file_size_bytes)} · {formatNumber(datasetInfo.row_count)} rows · {columns.length} columns
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleReset} className="text-xs">
                Visualize another file
              </Button>
            </div>
          </div>

          {/* Suggested Charts Gallery */}
          {suggestions.length > 0 && (
            <SuggestionsGallery
              suggestions={suggestions}
              columns={columns}
              onSelectSuggestion={(spec) => setActiveSpec(spec)}
            />
          )}

          {/* Interactive Chart Builder */}
          {columns.length > 0 && (
            <ChartBuilder
              jobId={datasetInfo.query_id}
              columns={columns}
              initialSpec={activeSpec}
              onHandoffToQuery={() => onHandoffToQuery(datasetInfo.query_id, datasetInfo.filename)}
              onHandoffToClean={() => onHandoffToClean(datasetInfo.query_id, datasetInfo.filename)}
            />
          )}
        </div>
      )}
    </div>
  );
};
