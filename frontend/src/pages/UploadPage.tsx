import React, { useRef, useState } from 'react';
import { uploadDataset } from '../lib/api';

interface UploadPageProps {
  onUploadComplete: (jobData: { id: string; name: string; size: string; rowCount: string }) => void;
}

export const UploadPage: React.FC<UploadPageProps> = ({ onUploadComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please select a valid CSV file.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const job = await uploadDataset(file, privacyMode);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      onUploadComplete({
        id: job.id,
        name: file.name,
        size: `${sizeMb} MB`,
        rowCount: 'Pending Profile...',
      });
    } catch (err: any) {
      setError(err.message || 'Error uploading file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--text)] tracking-tight">
          Upload Raw Dataset
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Single-machine processing for 1–10 GB CSVs. The AI never reads raw data records; it reviews a concise statistical profile.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 hairline-border border-red-200 text-xs text-[var(--danger)] rounded-xs">
          {error}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`bg-[var(--surface)] hairline-border rounded-xs p-10 text-center transition-all ${
          dragActive ? 'border-[var(--accent)] bg-blue-50/20' : ''
        }`}
      >
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-10 h-10 mx-auto rounded-xs bg-gray-100 flex items-center justify-center text-[var(--text-muted)] mono text-sm">
            CSV
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">
              Drag and drop your CSV file here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-[var(--accent)] hover:underline font-medium cursor-pointer"
              >
                browse filesystem
              </button>
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Supports UTF-8 CSVs up to 10 GB. Converted automatically to partitioned Parquet text staging.
            </p>
          </div>

          {uploading && (
            <div className="pt-4 space-y-2">
              <div className="w-full bg-gray-100 h-1.5 rounded-xs overflow-hidden">
                <div className="bg-[var(--accent)] h-full w-2/3 animate-pulse"></div>
              </div>
              <p className="text-xs mono text-[var(--text-muted)]">
                Uploading and staging file in DuckDB engine...
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between p-4 bg-[var(--surface)] hairline-border rounded-xs">
        <div>
          <span className="text-xs font-medium text-[var(--text)] block">
            Privacy Mode
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Disables sample values. The LLM only receives aggregated statistical metadata and column schemas.
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={privacyMode}
            onChange={(e) => setPrivacyMode(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)]"></div>
        </label>
      </div>
    </div>
  );
};
