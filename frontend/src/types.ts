export type JobState =
  | 'UPLOADED'
  | 'CONVERTING'
  | 'PROFILING'
  | 'PROFILED'
  | 'DRAFTING_RECIPE'
  | 'AWAITING_APPROVAL'
  | 'CLEANING'
  | 'VERIFYING'
  | 'DONE'
  | 'DONE_WITH_WARNINGS'
  | 'FAILED'
  | 'CANCELLED';

export interface FileMetadata {
  rows: number;
  columns: number;
  size_bytes: number;
  size_gb: number;
}

export interface ColumnProfile {
  inferred_type: string;
  nulls: number;
  null_pct: number;
  distinct: number;
  candidate_key: boolean;
  null_tokens?: Record<string, number>;
  whitespace_issues?: number;
  casing_issues?: number;
  min?: number;
  max?: number;
  median?: number;
  negatives?: number;
  negative_pct?: number;
  formats?: Array<{ format: string; match_pct: number }>;
  timezone_evidence?: string;
  day_month_ambiguous?: boolean;
  sample_values?: string[];
}

export interface DatasetProfile {
  file: FileMetadata;
  columns: Record<string, ColumnProfile>;
  duplicates: {
    exact_rows: number;
    exact_pct: number;
  };
  profile_duration_seconds: number;
}
