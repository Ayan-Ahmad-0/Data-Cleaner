import React, { useRef, useState } from 'react';
import { uploadDataset } from '../lib/api';
import { MAX_FILE_SIZE_BYTES } from '../config';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Tag } from '../components/ui/Tag';
import { Toggle } from '../components/ui/Toggle';
import { formatBytes } from '../lib/format';
import { FileUp, Shield, UploadCloud } from 'lucide-react';

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
    // 1. Check file extension
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError({
        message: 'Invalid file format.',
        recovery: 'Only CSV files (.csv) are supported. Please convert or export your data to CSV format.',
      });
      return;
    }

    // 2. Check empty file
    if (file.size === 0) {
      setError({
        message: 'Empty file detected (0 bytes).',
        recovery: 'The selected CSV file has no content. Please choose a dataset with rows.',
      });
      return;
    }

    // 3. Check max file size (10 GB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError({
        message: `File exceeds maximum size limit (${formatBytes(file.size)}).`,
        recovery: 'The cleaner supports files up to 10 GB on a single machine. Consider partitioning your CSV into smaller batches.',
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

      onUploadComplete({
        id: job.id,
        name: file.name,
        size: formatBytes(file.size),
        rowCount: 'Profiling in progress...',
      });
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
    <div className="container-shell py-12 max-w-2xl mx-auto space-y-6">
      {/* Title */}
      <div className="text-left space-y-1">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
          Upload Raw Dataset
        </h1>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Upload any messy CSV file (from a few kilobytes up to 10 GB). DuckDB will profile the data,
          identify quality anomalies, and draft a verified cleaning plan.
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
        className={`bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-sm)] p-8 sm:p-12 text-center transition-all border-dashed ${
          dragActive
            ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
            : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
          id="csv-file-input"
        />

        {uploading ? (
          <div className="space-y-4 py-4">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto">
              <UploadCloud className="w-5 h-5 animate-pulse" />
            </div>

            <div className="space-y-1">
              <span className="text-sm font-semibold text-[var(--text-primary)] block">
                Uploading and staging dataset...
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono block">
                {uploadProgressPct}% uploaded
              </span>
            </div>

            <div className="w-48 mx-auto bg-[var(--bg-subtle)] h-1.5 rounded-full overflow-hidden hairline-border">
              <div
                className="bg-[var(--accent)] h-full transition-all duration-200"
                style={{ width: `${uploadProgressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center mx-auto">
              <FileUp className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <span className="text-sm font-semibold text-[var(--text-primary)] block">
                Drag and drop your CSV file here
              </span>
              <span className="text-xs text-[var(--text-muted)] block">
                or click to browse your local computer
              </span>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => fileInputRef.current?.click()}
              >
                Select CSV File
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-3 text-[11px] text-[var(--text-muted)] font-mono">
              <Tag variant="neutral">Format: .csv</Tag>
              <span>·</span>
              <Tag variant="neutral">Max Size: 10 GB</Tag>
              <span>·</span>
              <Tag variant="neutral">Text Ingestion</Tag>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Option Card */}
      <div className="bg-[var(--bg-surface)] hairline-border rounded-[var(--radius-sm)] p-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-[var(--text-primary)] block">
              Privacy Mode (Zero Raw Data Transmission)
            </span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              When enabled, sample data values and sensitive strings are withheld.
              The AI recipe generator receives only column names and statistical distributions.
            </p>
          </div>
        </div>

        <Toggle
          checked={privacyMode}
          onChange={setPrivacyMode}
          disabled={uploading}
        />
      </div>
    </div>
  );
};
