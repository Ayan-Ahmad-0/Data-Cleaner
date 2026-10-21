import React, { useRef, useState } from 'react';
import { uploadDataset } from '../lib/api';
import { MAX_FILE_SIZE_BYTES } from '../config';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Toggle } from '../components/ui/Toggle';
import { formatBytes } from '../lib/format';
import { CheckCircle2, FileUp, Shield, UploadCloud } from 'lucide-react';

interface UploadPageProps {
  onUploadComplete: (jobData: { id: string; name: string; size: string; rowCount: string }) => void;
}

export const UploadPage: React.FC<UploadPageProps> = ({ onUploadComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressPct, setUploadProgressPct] = useState<number>(0);
  const [error, setError] = useState<{ message: string; recovery: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndProcessFile = async (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const supportedExts = ['.csv', '.tsv', '.parquet', '.json', '.ndjson', '.jsonl', '.xlsx', '.db', '.sqlite'];

    // 1. Check file extension
    if (!supportedExts.includes(ext)) {
      setError({
        message: 'Unsupported file format.',
        recovery: `File extension '${ext}' is not supported. CleanFlow supports CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), and SQLite (.db).`,
      });
      return;
    }

    // 2. Check empty file
    if (file.size === 0) {
      setError({
        message: 'Empty file detected (0 bytes).',
        recovery: 'The selected file has no content. Please choose a dataset with rows.',
      });
      return;
    }

    // 3. Check max file size (10 GB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError({
        message: `File exceeds maximum size limit (${formatBytes(file.size)}).`,
        recovery: 'The cleaner supports files up to 10 GB on a single machine. Consider partitioning your file into smaller batches.',
      });
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgressPct(15);

    try {
      // Simulate stepped progression for upload feedback
      const progressTimer = setInterval(() => {
        setUploadProgressPct((p) => (p < 85 ? p + 15 : p));
      }, 200);

      const job = await uploadDataset(file, privacyMode);
      clearInterval(progressTimer);
      setUploadProgressPct(100);

      // Smooth transition: give brief visual feedback at 100% before automatically navigating to Step 2
      setTimeout(() => {
        onUploadComplete({
          id: job.id,
          name: file.name,
          size: formatBytes(file.size),
          rowCount: 'Profiling in progress...',
        });
      }, 400);
    } catch (err: any) {
      setError({
        message: err.message || 'Failed to upload dataset.',
        recovery: 'Check that the backend server is running and accessible at http://localhost:8000.',
      });
      setUploading(false);
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
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  return (
    <div className="container-shell pt-6 sm:pt-8 pb-12 sm:pb-16 max-w-3xl mx-auto space-y-8">
      {/* Title */}
      <div className="text-left space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
          Clean Your Data
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Upload any dataset in CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) format.
          DuckDB will standardize it into canonical columnar format, profile the data, identify quality anomalies, and draft a verified cleaning recipe.
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

      {/* Dropzone Container */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
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
          onChange={handleFileChange}
          className="hidden"
          id="dataset-file-input"
        />

        {uploading ? (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto">
              <UploadCloud className="w-7 h-7 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block">
                Uploading, detecting format, and staging dataset...
              </span>
              <span className="text-sm text-[var(--text-muted)] font-mono block">
                {uploadProgressPct}% uploaded
              </span>
            </div>

            <div className="w-64 mx-auto bg-[var(--bg-subtle)] h-2 rounded-full overflow-hidden hairline-border">
              <div
                className="bg-[var(--accent)] h-full transition-all duration-200"
                style={{ width: `${uploadProgressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto">
              <FileUp className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block">
                Drag and drop your data file here
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
                Select Dataset File
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Ingestion & Engine Configuration Table */}
      <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-md)] overflow-hidden">
        <div className="p-3.5 sm:p-4 hairline-b bg-[var(--bg-subtle)] flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Ingestion & Privacy Configurations
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="hairline-b text-[var(--text-muted)] font-medium bg-[var(--bg-surface)]">
                <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider w-[36%] sm:w-[32%]">
                  Configuration / Feature
                </th>
                <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">
                  Description & Operational Scope
                </th>
                <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider text-right w-[20%] sm:w-[18%]">
                  Setting
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              <tr className="hover:bg-[var(--bg-hover)] transition-colors">
                <td className="py-3 px-4 align-middle">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span className="font-semibold text-xs sm:text-sm text-[var(--text-primary)]">
                      Privacy Mode
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[var(--text-muted)] block mt-0.5">
                    scope: raw-value-redaction
                  </span>
                </td>
                <td className="py-3 px-4 align-middle text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  Your data stays private. The AI only sees column names and summary statistics, never your actual values.
                </td>
                <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                  <Toggle
                    checked={privacyMode}
                    onChange={setPrivacyMode}
                    disabled={uploading}
                  />
                </td>
              </tr>

              <tr className="hover:bg-[var(--bg-hover)] transition-colors">
                <td className="py-3 px-4 align-middle">
                  <span className="font-semibold text-xs sm:text-sm text-[var(--text-primary)] block">
                    Execution Isolation
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)] block mt-0.5">
                    engine: duckdb-vectorized
                  </span>
                </td>
                <td className="py-3 px-4 align-middle text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  Processing runs in-process with memory spillover to disk. Zero external storage or database mutation.
                </td>
                <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-ok)] shrink-0" />
                    <span className="text-[var(--status-ok)]">Protected</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
