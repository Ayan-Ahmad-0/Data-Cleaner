import React, { useState } from 'react';
import {
  testConnector,
  importFromConnector,
  exportToConnector,
  type ConnectionTestResult,
  type ConnectorSyncResult,
} from '../../lib/api';
import { Button } from '../ui/Button';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ArrowRight,
  Server,
} from 'lucide-react';

export interface ConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'import' | 'export';
  jobId?: string; // required if mode === 'export'
  privacyMode?: boolean; // passed for import
  defaultFilename?: string; // original uploaded file name, e.g. "corrupted_transactions.csv"
  defaultFormat?: string;   // original detected format, e.g. "csv"
  onImportSuccess?: (jobData: { id: string; name: string; size: string; rowCount: string }) => void;
}

export const ConnectorModal: React.FC<ConnectorModalProps> = ({
  isOpen,
  onClose,
  mode,
  jobId,
  privacyMode = false,
  defaultFilename,
  defaultFormat,
  onImportSuccess,
}) => {
  const [activeConnector, setActiveConnector] = useState<'s3' | 'postgres'>('s3');

  // Normalize default format (matches uploaded dataset format)
  const normalizedDefaultFormat = React.useMemo(() => {
    if (!defaultFormat) return 'csv';
    const fmt = defaultFormat.toLowerCase().trim();
    if (fmt === 'parquet') return 'parquet';
    if (fmt === 'csv') return 'csv';
    if (fmt === 'tsv' || fmt === 'tab') return 'tsv';
    if (fmt === 'json') return 'json';
    if (fmt === 'ndjson' || fmt === 'jsonl') return 'ndjson';
    return 'csv';
  }, [defaultFormat]);

  // S3 form state
  const [s3Config, setS3Config] = useState({
    bucket: '',
    key: '',
    filename: '',
    prefix: '',
    source_uri: '',
    region: 'us-east-1',
    endpoint_url: '',
    access_key_id: '',
    secret_access_key: '',
    export_format: 'csv',
  });

  // Postgres form state
  const [pgConfig, setPgConfig] = useState({
    host: 'localhost',
    port: 5432,
    database: '',
    username: 'postgres',
    password: '',
    schema_name: 'public',
    table_name: '',
    query: '',
    mode: 'overwrite',
  });

  // Status & loading states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ConnectorSyncResult | null>(null);

  // Synchronize destination filename and default format when export modal opens
  React.useEffect(() => {
    if (isOpen && mode === 'export') {
      const initialFormat = normalizedDefaultFormat;
      let initialName = defaultFilename ? defaultFilename.trim() : `dataset.${initialFormat}`;

      // Update extension to match initialFormat if it has a known data extension
      const lastDot = initialName.lastIndexOf('.');
      const lastSlash = Math.max(initialName.lastIndexOf('/'), initialName.lastIndexOf('\\'));
      if (lastDot > lastSlash && lastDot !== -1) {
        const ext = initialName.substring(lastDot + 1).toLowerCase();
        const known = ['parquet', 'csv', 'tsv', 'json', 'ndjson', 'jsonl', 'txt', 'xlsx', 'xls'];
        if (known.includes(ext) && ext !== initialFormat) {
          initialName = `${initialName.substring(0, lastDot)}.${initialFormat}`;
        }
      } else {
        initialName = `${initialName}.${initialFormat}`;
      }

      setS3Config((prev) => ({
        ...prev,
        export_format: initialFormat,
        key: initialName,
        filename: initialName,
      }));
      setTestResult(null);
      setExecutionError(null);
      setExportResult(null);
    }
  }, [isOpen, mode, defaultFilename, normalizedDefaultFormat]);

  // Handle format change and update file extension dynamically
  const handleFormatChange = (newFormat: string) => {
    setS3Config((prev) => {
      let updatedKey = prev.key;
      if (updatedKey) {
        const lastDot = updatedKey.lastIndexOf('.');
        const lastSlash = Math.max(updatedKey.lastIndexOf('/'), updatedKey.lastIndexOf('\\'));
        if (lastDot > lastSlash && lastDot !== -1) {
          updatedKey = `${updatedKey.substring(0, lastDot)}.${newFormat}`;
        } else {
          updatedKey = `${updatedKey}.${newFormat}`;
        }
      } else {
        const base = defaultFilename ? defaultFilename.replace(/\.[^/.]+$/, '') : 'dataset';
        updatedKey = `${base}.${newFormat}`;
      }
      return {
        ...prev,
        export_format: newFormat,
        key: updatedKey,
        filename: updatedKey,
      };
    });
  };

  // Auto-parse full postgresql:// URL if pasted into host input
  const handlePgHostChange = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) {
      try {
        const url = new URL(trimmed.replace(/^postgres(ql)?:\/\//, 'http://'));
        setPgConfig((prev) => ({
          ...prev,
          host: url.hostname || prev.host,
          port: url.port ? Number(url.port) : 5432,
          database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) : prev.database,
          username: url.username ? decodeURIComponent(url.username) : prev.username,
          password: url.password ? decodeURIComponent(url.password) : prev.password,
        }));
        return;
      } catch {
        // Fallback to setting host directly
      }
    }
    setPgConfig((prev) => ({ ...prev, host: val }));
  };

  if (!isOpen) return null;

  const currentConfig = activeConnector === 's3' ? s3Config : pgConfig;

  // Handle live connection testing
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setExecutionError(null);

    try {
      const configToSend = activeConnector === 'postgres'
        ? { ...pgConfig, mode: 'overwrite' }
        : currentConfig;
      const res = await testConnector(activeConnector, configToSend);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed. Check host, credentials, and network reachability.',
      });
    } finally {
      setTesting(false);
    }
  };

  // Handle Import or Export action
  const handleExecute = async () => {
    setExecuting(true);
    setExecutionError(null);
    setExportResult(null);

    try {
      const sanitizedConfig = activeConnector === 'postgres'
        ? {
            ...pgConfig,
            table_name: pgConfig.table_name.trim(),
            query: pgConfig.query.trim().replace(/;+\s*$/, ''),
          }
        : currentConfig;

      if (mode === 'import') {
        if (activeConnector === 'postgres' && !pgConfig.table_name.trim() && !pgConfig.query.trim()) {
          setExecutionError('Please specify the Table Name to import from your PostgreSQL database (e.g. users, transactions), or enter a Custom SQL Select Query.');
          setExecuting(false);
          return;
        }

        const res = await importFromConnector(
          activeConnector,
          sanitizedConfig,
          undefined,
          privacyMode,
        );

        if (onImportSuccess) {
          onImportSuccess({
            id: res.job_id,
            name: res.filename,
            size: `${(res.sync_result?.rows_transferred || 0).toLocaleString()} rows`,
            rowCount: `${(res.rows_imported || 0).toLocaleString()} records`,
          });
        }
        onClose();
      } else {
        if (!jobId) throw new Error('Job ID is missing for export.');
        const res = await exportToConnector(jobId, activeConnector, sanitizedConfig);
        setExportResult(res);
      }
    } catch (err: any) {
      setExecutionError(err.message || 'Action failed.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-2xl border border-[var(--border-hairline)] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent-border)]">
              {activeConnector === 's3' ? <Cloud className="w-5 h-5" /> : <Database className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                {mode === 'import' ? 'Import from Cloud or Database' : 'Export to Cloud or Warehouse'}
              </h2>
              <span className="text-xs text-[var(--text-muted)]">
                {mode === 'import'
                  ? 'Stream external data directly into Datamorph local DuckDB engine'
                  : 'Push cleaned results directly to external storage or warehouse tables'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connector Selector Tabs */}
        <div className="grid grid-cols-2 p-3 gap-2 bg-[var(--bg-app)] border-b border-[var(--border-hairline)]">
          <button
            type="button"
            onClick={() => {
              setActiveConnector('s3');
              setTestResult(null);
              setExecutionError(null);
            }}
            className={`flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeConnector === 's3'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Cloud className="w-4 h-4 text-[#FF4B3E]" />
            <span>AWS S3 / R2 / MinIO</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveConnector('postgres');
              setTestResult(null);
              setExecutionError(null);
            }}
            className={`flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeConnector === 'postgres'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Database className="w-4 h-4 text-[#FF4B3E]" />
            <span>PostgreSQL Warehouse</span>
          </button>
        </div>

        {/* Modal Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
          {/* S3 Configuration Form */}
          {activeConnector === 's3' && (
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Bucket Name <span className="text-[#FF4B3E]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. analytics-lakehouse or my-company-data"
                  value={s3Config.bucket}
                  onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors"
                />
              </div>

              {mode === 'import' ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Object Key or Direct URI
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. raw/2026/events.parquet or s3://my-bucket/orders.csv"
                    value={s3Config.source_uri || s3Config.key}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('s3://')) {
                        setS3Config({ ...s3Config, source_uri: val, key: '' });
                      } else {
                        setS3Config({ ...s3Config, key: val, source_uri: '' });
                      }
                    }}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                  <span className="text-xs text-[var(--text-muted)] mt-1 block">
                    Supports .parquet, .csv, .tsv, .json, and .ndjson formats.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                        Destination File Name / Path
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. data.csv or exports/data.csv"
                        value={s3Config.key}
                        onChange={(e) => {
                          const val = e.target.value;
                          setS3Config({ ...s3Config, key: val, filename: val });
                        }}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                      />
                      <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                        Specify custom filename or path (e.g. <span className="font-mono text-[var(--text-secondary)]">archive/data.csv</span>).
                      </span>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                        Export Format
                      </label>
                      <select
                        value={s3Config.export_format}
                        onChange={(e) => handleFormatChange(e.target.value)}
                        className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none cursor-pointer"
                      >
                        <option value="csv">
                          CSV (Comma-Separated){normalizedDefaultFormat === 'csv' ? ' — Uploaded format' : ''}
                        </option>
                        <option value="parquet">
                          Parquet (ZSTD Compressed){normalizedDefaultFormat === 'parquet' ? ' — Uploaded format' : ''}
                        </option>
                        <option value="tsv">
                          TSV (Tab-Separated){normalizedDefaultFormat === 'tsv' ? ' — Uploaded format' : ''}
                        </option>
                        <option value="json">
                          JSON Array (.json){normalizedDefaultFormat === 'json' ? ' — Uploaded format' : ''}
                        </option>
                        <option value="ndjson">
                          NDJSON (Newline JSON){normalizedDefaultFormat === 'ndjson' ? ' — Uploaded format' : ''}
                        </option>
                      </select>
                      <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                        Defaults to original uploaded format ({normalizedDefaultFormat.toUpperCase()}).
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Region
                  </label>
                  <input
                    type="text"
                    placeholder="us-east-1 (or auto for R2)"
                    value={s3Config.region}
                    onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Custom Endpoint (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank for AWS S3"
                    value={s3Config.endpoint_url}
                    onChange={(e) => setS3Config({ ...s3Config, endpoint_url: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                  <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                    Leave blank for AWS S3. Only for MinIO/R2.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Access Key ID
                  </label>
                  <input
                    type="text"
                    placeholder="Optional if set in environment"
                    value={s3Config.access_key_id}
                    onChange={(e) => setS3Config({ ...s3Config, access_key_id: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Secret Access Key
                  </label>
                  <input
                    type="password"
                    placeholder="Optional if set in environment"
                    value={s3Config.secret_access_key}
                    onChange={(e) => setS3Config({ ...s3Config, secret_access_key: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PostgreSQL Configuration Form */}
          {activeConnector === 'postgres' && (
            <div className="space-y-4 text-left">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Host / Endpoint <span className="text-[#FF4B3E]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. paste postgresql://... or enter hostname"
                    value={pgConfig.host}
                    onChange={(e) => handlePgHostChange(e.target.value)}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                  <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                    Paste your Render or Supabase &quot;Connection URI&quot; to auto-fill all fields
                  </span>
                  {pgConfig.host.includes('.supabase.co') && !pgConfig.host.includes('.pooler.supabase.com') && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                      ⚠️ <strong>Supabase IPv4 Notice:</strong> Direct host <code className="text-amber-200 font-mono">db.[ref].supabase.co</code> is IPv6-only. If your connection reports &quot;Network unreachable&quot;, copy the <strong>Session Pooler URI</strong> (<code className="text-amber-200 font-mono">aws-0-[region].pooler.supabase.com</code>) from Supabase Connect.
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Port
                  </label>
                  <input
                    type="number"
                    value={pgConfig.port}
                    onChange={(e) => setPgConfig({ ...pgConfig, port: Number(e.target.value) || 5432 })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Database Name <span className="text-[#FF4B3E]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. postgres or analytics"
                    value={pgConfig.database}
                    onChange={(e) => setPgConfig({ ...pgConfig, database: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Schema
                  </label>
                  <input
                    type="text"
                    placeholder="public"
                    value={pgConfig.schema_name}
                    onChange={(e) => setPgConfig({ ...pgConfig, schema_name: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Username <span className="text-[#FF4B3E]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="postgres"
                    value={pgConfig.username}
                    onChange={(e) => setPgConfig({ ...pgConfig, username: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={pgConfig.password}
                    onChange={(e) => setPgConfig({ ...pgConfig, password: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  {mode === 'export' ? 'Target Table Name' : 'Table Name to Import'} <span className="text-[#FF4B3E]">*</span>
                </label>
                <input
                  type="text"
                  placeholder={mode === 'export' ? 'e.g. cleaned_orders or customer_events' : 'e.g. users, products, or transactions'}
                  value={pgConfig.table_name}
                  onChange={(e) => setPgConfig({ ...pgConfig, table_name: e.target.value })}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                />
                <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                  {mode === 'export'
                    ? 'The PostgreSQL table where cleaned records will be written.'
                    : 'The table name inside your Render database that you want to import.'}
                </span>
              </div>

              {mode === 'import' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Or Custom SQL Select Query (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="SELECT id, name, email FROM users WHERE created_at >= '2024-01-01'"
                    value={pgConfig.query}
                    onChange={(e) => setPgConfig({ ...pgConfig, query: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-lg px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none font-mono"
                  />
                  <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                    Optional: Run a custom query instead of importing the entire table.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Test Connection Result Alert */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs leading-relaxed text-left ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              )}
              <div className="space-y-1.5 flex-1">
                <span className="font-semibold block">
                  {testResult.success ? 'Connection Validated' : 'Connection Test Failed'}
                  {testResult.latency_ms && ` (${testResult.latency_ms} ms)`}
                </span>
                <span className="opacity-90 block">{testResult.message}</span>

                {testResult.success && testResult.details?.tables && Array.isArray(testResult.details.tables) && testResult.details.tables.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-emerald-500/20">
                    <span className="font-semibold text-emerald-300 block mb-1.5">
                      Discovered Tables (Click to select for import):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {testResult.details.tables.map((tbl: string) => (
                        <button
                          key={tbl}
                          type="button"
                          onClick={() => setPgConfig((prev) => ({ ...prev, table_name: tbl, query: '' }))}
                          className={`px-2.5 py-1 rounded text-xs font-mono transition border ${
                            pgConfig.table_name === tbl
                              ? 'bg-emerald-500 text-black font-semibold border-emerald-400'
                              : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30'
                          }`}
                        >
                          {tbl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Execution Error Banner */}
          {executionError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3 text-left">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Execution Failed</span>
                <span>{executionError}</span>
              </div>
            </div>
          )}

          {/* Export Success Banner */}
          {exportResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-start gap-3 text-left">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block text-base">Export Succeeded!</span>
                <p className="text-xs opacity-90">{exportResult.message}</p>
                <span className="text-xs font-mono bg-black/30 px-2 py-1 rounded inline-block mt-1">
                  Destination: {exportResult.destination_uri}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTestConnection}
            disabled={testing || executing}
            leftIcon={testing ? <Loader2 className="w-4 h-4 animate-spin text-[#FF4B3E]" /> : <Server className="w-4 h-4" />}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={executing}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleExecute}
              disabled={executing || testing}
              leftIcon={executing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <ArrowRight className="w-4 h-4" />}
            >
              {executing
                ? mode === 'import'
                  ? 'Importing...'
                  : 'Exporting...'
                : mode === 'import'
                ? 'Import & Clean'
                : 'Export Now'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
