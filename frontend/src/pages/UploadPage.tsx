import React, { useState } from 'react';

interface UploadPageProps {
  onUploadComplete: (file: { name: string; size: string; rowCount: string }) => void;
}

export const UploadPage: React.FC<UploadPageProps> = ({ onUploadComplete }) => {
  const [dragActive, setDragActive] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSimulatedUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      onUploadComplete({
        name: 'events_2026.csv',
        size: '1.05 GB',
        rowCount: '15,000,000',
      });
    }, 1200);
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

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleSimulatedUpload(); }}
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
                onClick={handleSimulatedUpload}
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
                Staging file to local temporary storage...
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
