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

export interface AnalystAskResult {
  status: 'ok' | 'needs_clarification' | 'cannot_answer' | 'error';
  question: string;
  sql?: string | null;
  explanation?: string | null;
  assumptions: string[];
  clarification_question?: string | null;
  result?: ExploreQueryResult | null;
  retried: boolean;
  message?: string | null;
  elapsed_seconds: number;
}

export async function askAiAnalyst(
  jobId: string,
  question: string,
  userId: string = 'anonymous',
  signal?: AbortSignal,
): Promise<AnalystAskResult> {
  const res = await fetch(`${API_BASE}/api/explore/${jobId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, user_id: userId }),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Ask AI request failed.');
  }
  return res.json();
}

export interface QueryUploadResult {
  query_id: string;
  filename: string;
  row_count: number;
  columns: string[];
  file_size_bytes: number;
  detected_format?: string;
}

export function uploadForQuery(
  file: File,
  options?: Record<string, any>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<QueryUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/query/upload`);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response received from server.'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.detail || 'Failed to upload dataset for querying.'));
        } catch {
          reject(new Error(`Upload failed with HTTP status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload. Ensure the backend server is running.'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload was aborted.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    if (options) {
      formData.append('options', JSON.stringify(options));
    }
    xhr.send(formData);
  });
}

// =========================================================================
// Charts & Visualize Data API
// =========================================================================

export interface ChartColumnStats {
  name: string;
  type: string;
  null_pct: number;
  distinct_approx: number | null;
  min: string | null;
  max: string | null;
  kind: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text_long' | 'id_like';
  parse_hints: {
    as_number_success_pct?: number;
    as_date_success_pct?: number;
  };
}

export interface ChartFieldRef {
  column: string;
  cast_as?: 'number' | 'date' | 'timestamp' | 'text' | null;
  time_bucket?: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'hour_of_day' | 'day_of_week' | null;
  bins?: number | null;
}

export interface ChartFilter {
  column: string;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'between' | 'is_null' | 'not_null';
  value?: any;
}

export type FieldRef = ChartFieldRef;
export type Filter = ChartFilter;

export interface ChartSpec {
  chart_type: 'bar' | 'hbar' | 'line' | 'area' | 'histogram' | 'scatter' | 'pie' | 'donut' | 'box' | 'heatmap' | 'big_number';
  x?: ChartFieldRef | null;
  y?: ChartFieldRef | null;
  color?: ChartFieldRef | null;
  aggregation?: 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'none';
  filters?: ChartFilter[];
  sort?: 'x' | 'y_desc' | 'y_asc';
  top_n?: number | null;
  log_y?: boolean;
  title?: string | null;
  exclude_nulls?: boolean;
  hide_outliers?: boolean;
  custom_color?: string | null;
}

export interface ChartDataResponse {
  spec: ChartSpec;
  columns: string[];
  rows: any[][];
  row_count: number;
  notes: string[];
  warnings: string[];
  elapsed_seconds: number;
}

export interface PageDataOptions {
  cast_overrides: Record<string, string>;
  exclude_missing: boolean;
  hide_outliers: boolean;
  cross_filters?: Record<string, any>;
}

export interface TweakColumnOption {
  name: string;
  type: string;
  kind: string;
  null_pct: number;
  distinct_approx?: number | null;
}

export interface TweakOptionsResponse {
  allowed_chart_types: string[];
  disabled_chart_types: Record<string, string>;
  allowed_aggregations: string[];
  disabled_aggregations: Record<string, string>;
  columns: TweakColumnOption[];
  disabled_reasons: Record<string, string>;
}

export interface ChartRecommendation {
  id: string;
  spec: ChartSpec;
  title: string;
  question_answered: string;
  why: string;
  caveats: string[];
  priority: number;
  source: 'ai' | 'standard';
}

export interface DataPrepTip {
  column?: string | null;
  tip: string;
  action: 'cast_as_date' | 'cast_as_number' | 'exclude_missing' | 'hide_outliers' | 'none';
}

export interface VisualizationPlan {
  summary: string;
  recommendations: ChartRecommendation[];
  prep_tips: DataPrepTip[];
  avoid: string[];
  used_fallback: boolean;
  elapsed_seconds: number;
}

export interface ChartFromTextResult {
  status: 'ok' | 'needs_clarification' | 'cannot_chart' | 'error';
  request: string;
  spec?: ChartSpec | null;
  title?: string | null;
  explanation?: string | null;
  assumptions: string[];
  clarification_question?: string | null;
  message?: string | null;
  data?: ChartDataResponse | null;
  retried: boolean;
  elapsed_seconds: number;
}

export interface AutoVisualizeItem {
  recommendation: ChartRecommendation;
  data?: ChartDataResponse | null;
  error?: string | null;
}

export async function getColumnStats(jobId: string): Promise<ChartColumnStats[]> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/stats`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch column stats.');
  }
  const data = await res.json();
  return data.columns || [];
}

export async function getStarterSpec(jobId: string): Promise<ChartSpec> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/starter-spec`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch starter chart spec.');
  }
  const data = await res.json();
  return data.spec;
}

export async function getTweakOptions(jobId: string, spec?: ChartSpec): Promise<TweakOptionsResponse> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/tweak-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch tweak options.');
  }
  return res.json();
}

export async function getChartSuggestions(jobId: string): Promise<ChartSpec[]> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/suggest`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch chart suggestions.');
  }
  const data = await res.json();
  return data.suggestions || [];
}

export async function buildChart(
  jobId: string,
  spec: ChartSpec,
  pageOptions?: PageDataOptions,
  signal?: AbortSignal,
): Promise<ChartDataResponse> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec, page_options: pageOptions }),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to build chart.');
  }
  return res.json();
}

export async function exportChartCsv(jobId: string, spec: ChartSpec): Promise<void> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to export chart data.');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chart_data_${jobId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function getChartAiStatus(jobId: string): Promise<{ enabled: boolean; model: string }> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/ai/status`);
  if (!res.ok) {
    return { enabled: false, model: '' };
  }
  return res.json();
}

export async function getVisualizationPlan(
  jobId: string,
  pageOptions?: PageDataOptions,
  forceRefresh: boolean = false,
): Promise<VisualizationPlan> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/ai/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_options: pageOptions, force_refresh: forceRefresh }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to generate visualization plan.');
  }
  return res.json();
}

export async function autoVisualizeCharts(
  jobId: string,
  pageOptions?: PageDataOptions,
  maxCharts: number = 6,
  forceRefresh: boolean = false,
): Promise<AutoVisualizeItem[]> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/ai/auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_options: pageOptions, max_charts: maxCharts, force_refresh: forceRefresh }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to auto-visualize charts.');
  }
  const data = await res.json();
  return data.items || [];
}

export async function askChartFromText(
  jobId: string,
  request: string,
  pageOptions?: PageDataOptions,
): Promise<ChartFromTextResult> {
  const res = await fetch(`${API_BASE}/api/charts/${jobId}/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, page_options: pageOptions }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to ask for chart.');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Cloud Storage & Database Connectors API
// ---------------------------------------------------------------------------

export interface ConnectorConfigField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
  options?: string[];
  secret?: boolean;
}

export interface ConnectorMetadata {
  id: string;
  display_name: string;
  description: string;
  category: string;
  supported_formats: string[];
  supports_import: boolean;
  supports_export: boolean;
  config_fields: ConnectorConfigField[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms?: number;
  details?: Record<string, any>;
}

export interface ConnectorSyncResult {
  success: boolean;
  rows_transferred: number;
  destination_uri: string;
  elapsed_seconds: number;
  message: string;
  details?: Record<string, any>;
}

export interface ConnectorImportResponse {
  job_id: string;
  filename: string;
  status: string;
  rows_imported: number;
  sync_result: ConnectorSyncResult;
}

export async function fetchConnectors(): Promise<ConnectorMetadata[]> {
  const res = await fetch(`${API_BASE}/api/connectors`);
  if (!res.ok) throw new Error('Failed to load connectors.');
  return res.json();
}

export async function testConnector(
  connectorType: string,
  config: Record<string, any>,
): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE}/api/connectors/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connector_type: connectorType, config }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Connection test failed.');
  }
  return res.json();
}

export async function importFromConnector(
  connectorType: string,
  config: Record<string, any>,
  filename?: string,
  privacyMode: boolean = false,
  options?: Record<string, any>,
): Promise<ConnectorImportResponse> {
  const res = await fetch(`${API_BASE}/api/connectors/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connector_type: connectorType,
      config,
      filename,
      privacy_mode: privacyMode,
      options: options || {},
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Connector import failed.');
  }
  return res.json();
}

export async function exportToConnector(
  jobId: string,
  connectorType: string,
  config: Record<string, any>,
  options?: Record<string, any>,
): Promise<ConnectorSyncResult> {
  const res = await fetch(`${API_BASE}/api/connectors/export/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connector_type: connectorType,
      config,
      options: options || {},
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Export to connector failed.');
  }
  return res.json();
}
