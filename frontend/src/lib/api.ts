const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface ExportOption {
  format_id: string;
  name: string;
  extension: string;
  mime_type: string;
  available: boolean;
  note?: string;
  is_source_format?: boolean;
}

export interface JobMetadata {
  id: string;
  filename: string;
  status: string;
  progress_pct: number;
  current_stage: string;
  file_size_bytes: number;
  row_count: number;
  privacy_mode: boolean;
  detected_format?: string;
  detected_confidence?: number;
  conversion_report?: any;
  error?: string;
}

export interface JobDetailResponse {
  job: JobMetadata;
  profile?: any;
  report_markdown?: string;
  recipe?: any;
  recipe_plain_english: string[];
  open_questions: string[];
  verification?: any;
  conversion_report?: any;
  export_options?: ExportOption[];
  download_urls: Record<string, string>;
}

export async function detectFormat(file: File): Promise<{
  format: string;
  confidence: number;
  filename: string;
  sheets?: string[];
  tables?: string[];
}> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/formats/detect`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to detect format.');
  }

  return res.json();
}

export async function uploadDataset(
  file: File,
  privacyMode: boolean,
  format?: string,
  options?: Record<string, any>,
): Promise<JobMetadata> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('privacy_mode', String(privacyMode));
  if (format) formData.append('format', format);
  if (options) formData.append('options', JSON.stringify(options));

  const res = await fetch(`${API_BASE}/api/jobs/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload dataset.');
  }

  return res.json();
}

export async function getJobDetail(jobId: string): Promise<JobDetailResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error('Failed to fetch job detail.');
  }
  return res.json();
}

export async function approveAndClean(jobId: string, recipe?: any): Promise<void> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: recipe ? JSON.stringify(recipe) : undefined,
  });

  if (!res.ok) {
    throw new Error('Failed to initiate cleaning.');
  }
}

export function getDownloadUrl(jobId: string, format: string): string {
  return `${API_BASE}/api/jobs/${jobId}/download/${format}`;
}

export interface ConvertResultResponse {
  convert_id: string;
  result: {
    output_files: string[];
    output_filenames: string[];
    source_format: string;
    target_format: string;
    rows: number;
    columns: string[];
    warnings: string[];
    intermediate_parquet?: string;
    elapsed_seconds: number;
  };
}

export async function previewConvert(
  file: File,
  format?: string,
  options?: Record<string, any>,
): Promise<{ preview: any[]; report: any }> {
  const formData = new FormData();
  formData.append('file', file);
  if (format) formData.append('format', format);
  if (options) formData.append('options', JSON.stringify(options));

  const res = await fetch(`${API_BASE}/api/convert`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Preview failed.');
  }

  return res.json();
}

export async function executeConvertOnly(
  file: File,
  targetFormat: string,
  sourceFormat?: string,
  sourceOptions?: Record<string, any>,
  targetOptions?: Record<string, any>,
): Promise<ConvertResultResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('target_format', targetFormat);
  if (sourceFormat) formData.append('source_format', sourceFormat);
  if (sourceOptions) formData.append('source_options', JSON.stringify(sourceOptions));
  if (targetOptions) formData.append('target_options', JSON.stringify(targetOptions));

  const res = await fetch(`${API_BASE}/api/convert/execute`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Conversion failed.');
  }

  return res.json();
}

export function getConvertDownloadUrl(convertId: string): string {
  return `${API_BASE}/api/convert/download/${convertId}`;
}

export async function handoffToClean(convertId: string): Promise<JobMetadata> {
  const res = await fetch(`${API_BASE}/api/convert/${convertId}/handoff-to-clean`, {
    method: 'POST',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Handoff to cleaning failed.');
  }

  return res.json();
}

export interface ExploreColumnInfo {
  name: string;
  type: string;
  sample_values?: any[];
}

export interface ExploreSchemaResponse {
  table: string;
  row_count: number;
  columns: ExploreColumnInfo[];
  tables_available: string[];
}

export interface ExploreQueryResult {
  columns: { name: string; type: string }[];
  rows: any[][];
  row_count_returned: number;
  truncated: boolean;
  elapsed_seconds: number;
  warnings: string[];
}

export async function getExploreSchema(jobId: string, table?: string): Promise<ExploreSchemaResponse> {
  const url = table
    ? `${API_BASE}/api/explore/${jobId}/schema?table=${encodeURIComponent(table)}`
    : `${API_BASE}/api/explore/${jobId}/schema`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to load dataset schema.');
  }
  return res.json();
}

export async function executeExploreQuery(
  jobId: string,
  sql: string,
  rowLimit?: number,
): Promise<ExploreQueryResult> {
  const res = await fetch(`${API_BASE}/api/explore/${jobId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, row_limit: rowLimit }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Query execution failed.');
  }
  return res.json();
}

export async function exportExploreQuery(jobId: string, sql: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/explore/${jobId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Export failed.');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `query_export_${jobId.slice(0, 8)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

