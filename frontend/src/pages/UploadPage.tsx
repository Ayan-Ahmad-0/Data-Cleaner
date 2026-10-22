import React, { useRef, useState } from 'react';
import { uploadDataset } from '../lib/api';
import { MAX_FILE_SIZE_BYTES } from '../config';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Toggle } from '../components/ui/Toggle';
import { formatBytes } from '../lib/format';
import { CheckCircle2, FileUp, Shield, UploadCloud, Zap } from 'lucide-react';

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
    <div className="container-shell pt-6 sm:pt-8 pb-12 sm:pb-16 space-y-7">
      {/* Hero Title */}
      <div className="text-left space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
          Clean Your Data
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          Upload raw datasets up to 10 GB. Fast out-of-core profiling and AI-assisted cleaning rules.
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

      {/* Dropzone Container — Tactile, with radial glow */}
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
          accept=".csv,.tsv,.parquet,.json,.ndjson,.jsonl,.xlsx,.db,.sqlite"
          onChange={handleFileChange}
          className="hidden"
          id="dataset-file-input"
        />

        {uploading ? (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto border border-[var(--accent-border)]">
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

            <div className="w-64 mx-auto bg-[var(--bg-subtle)] h-1.5 rounded-full overflow-hidden border border-[var(--border-hairline)]">
              <div
                className="bg-[var(--accent)] h-full transition-all duration-200 rounded-full"
                style={{ width: `${uploadProgressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Upload icon with subtle background */}
            <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto border border-[var(--border-hairline)] shadow-[var(--shadow-card)]">
              <FileUp className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block tracking-tight">
                Drag and drop your data file here
              </span>
              <span className="text-sm text-[var(--text-muted)] block">
                CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) up to 10 GB
              </span>
            </div>

            {/* Primary CTA */}
            <div className="pt-1">
              <Button
                variant="primary"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                className="shadow-[0_2px_12px_rgba(253,66,51,0.18)] hover:shadow-[0_4px_20px_rgba(253,66,51,0.25)] transition-shadow duration-200"
              >
                Select Dataset File
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy & Engine Settings — Clean Toggle Cards */}
      <div className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
          Privacy & Processing
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Privacy Mode Card */}
          <div
            className={`rounded-[var(--radius-lg)] border p-4 sm:p-5 transition-all duration-200 cursor-pointer ${
              privacyMode
                ? 'bg-[var(--accent-subtle)] border-[var(--accent-border)]'
                : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
            }`}
            onClick={() => !uploading && setPrivacyMode(!privacyMode)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 transition-colors ${
                  privacyMode
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                }`}>
                  <Shield className="w-4 h-4" />
                </div>
                <div className="space-y-1 min-w-0">
                  <span className="text-sm font-semibold text-[var(--text-primary)] block">
                    Privacy Mode
                  </span>
                  <span className="text-xs text-[var(--text-muted)] leading-relaxed block">
                    Your data stays private. The AI only sees column names and summary statistics, never your actual values.
                  </span>
                </div>
              </div>
              <div className="shrink-0 pt-0.5">
                <Toggle
                  checked={privacyMode}
                  onChange={setPrivacyMode}
                  disabled={uploading}
                />
              </div>
            </div>
          </div>

          {/* Execution Isolation Card */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 border border-[var(--border-hairline)]">
                <Zap className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    Execution Isolation
                  </span>
                  <div className="inline-flex items-center gap-1.5 font-medium text-xs shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-ok)] shrink-0" />
                    <span className="text-[var(--status-ok)]">Protected</span>
                  </div>
                </div>
                <span className="text-xs text-[var(--text-muted)] leading-relaxed block">
                  Processing runs in-process with memory spillover to disk. Zero external storage or database mutation.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
