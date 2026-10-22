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
  AlertTriangle,
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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Permanent Raw-Data Honesty Banner */}
      <div className="flex items-center gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-[var(--radius-lg)] text-xs font-medium">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
        <span>
          <strong>Viewing original, uncleaned data.</strong> Missing values, duplicates, and unparsed types are included in these charts unless you filter them out.
        </span>
      </div>

      {/* Upload & Prepare Area (if no dataset loaded) */}
      {!datasetInfo && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`dropzone-glow bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-10 sm:p-14 text-center transition-all duration-200 border border-dotted ${
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
          />

          <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--bg-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto border border-[var(--border-hairline)] shadow-[var(--shadow-card)] mb-4">
            <BarChart3 className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
            Instant Interactive Data Charts
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6">
            Upload CSV, Excel, Parquet, JSON, or SQLite files. View suggested charts and build interactive graphs with zero cleaning or conversion delay.
          </p>

          {sheetNames.length > 1 && (
            <div className="mb-4 flex items-center gap-2 text-xs">
              <span>Select sheet:</span>
              <select
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2 py-1"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {tableNames.length > 1 && (
            <div className="mb-4 flex items-center gap-2 text-xs">
              <span>Select table:</span>
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2 py-1"
              >
                {tableNames.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <Button
            size="lg"
            variant="primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? 'Preparing your file...' : 'Choose File to Visualize'}
          </Button>

          {isUploading && (
            <div className="w-full max-w-xs mt-6 flex flex-col gap-2">
              <div className="w-full bg-[var(--bg-subtle)] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[var(--accent)] h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-xs text-[var(--text-muted)] animate-pulse">
                Preparing your file (internal zero-copy conversion)...
              </span>
            </div>
          )}

          {error && (
            <div className="mt-4 max-w-md">
              <Callout variant="danger" title="Upload Failed">
                {error}
              </Callout>
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
