const API_BASE = 'http://localhost:8000';

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
