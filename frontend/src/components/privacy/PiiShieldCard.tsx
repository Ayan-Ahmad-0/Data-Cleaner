import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { detectJobPii, applyJobPiiMasking, type PiiFinding } from '../../lib/api';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';

interface PiiShieldCardProps {
  jobId: string;
  onMaskApplied?: (maskedCount: number) => void;
}

export const PiiShieldCard: React.FC<PiiShieldCardProps> = ({ jobId, onMaskApplied }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [findings, setFindings] = useState<PiiFinding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Record<string, 'partial_mask' | 'sha256_hash' | 'redact'>>({});

  const fetchFindings = async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await detectJobPii(jobId);
      setFindings(res.findings || []);
      const initStrats: Record<string, 'partial_mask' | 'sha256_hash' | 'redact'> = {};
      res.findings.forEach((f) => {
        initStrats[f.column_name] = f.suggested_strategy || 'partial_mask';
      });
      setStrategies(initStrats);
    } catch (err: any) {
      setError(err.message || 'Failed to scan for PII.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFindings();
  }, [jobId]);

  const handleApplyMasking = async () => {
    if (findings.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const payload: Record<string, { strategy: string; entity_type?: string }> = {};
      findings.forEach((f) => {
        payload[f.column_name] = {
          strategy: strategies[f.column_name] || f.suggested_strategy || 'partial_mask',
          entity_type: f.entity_type,
        };
      });

      const res = await applyJobPiiMasking(jobId, payload);
      setSuccessMessage(res.message);
      onMaskApplied?.(findings.length);
      // Re-scan after masking
      setTimeout(() => {
        fetchFindings();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to apply PII masking.');
    } finally {
      setApplying(false);
    }
  };

  const getEntityBadge = (entity: string) => {
    switch (entity.toLowerCase()) {
      case 'credit_card':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Credit Card</span>;
      case 'ssn':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">US SSN</span>;
      case 'email':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Email</span>;
      case 'phone':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Phone</span>;
      case 'ip':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">IP Address</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">{entity}</span>;
    }
  };

  if (loading) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 flex items-center justify-center gap-3 text-sm text-[var(--text-muted)] shadow-2xs">
        <Loader2 className="w-4 h-4 animate-spin text-[#FF4B3E]" />
        <span>Scanning dataset for GDPR/HIPAA sensitive identifiers...</span>
      </div>
    );
  }

  const hasPii = findings.length > 0;

  return (
    <div className={`bg-[var(--bg-surface)] border rounded-xl overflow-hidden shadow-2xs transition-all ${
      hasPii ? 'border-amber-500/30' : 'border-[var(--border-hairline)]'
    }`}>
      {/* Header banner */}
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-subtle)] border-b border-[var(--border-hairline)]">
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            hasPii
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          }`}>
            {hasPii ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                GDPR & HIPAA Privacy Shield
              </h3>
              <Tag variant={hasPii ? 'warn' : 'ok'} font="mono">
                {hasPii ? `${findings.length} PII Columns Flagged` : 'Compliance Ready'}
              </Tag>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {hasPii
                ? 'Automatic pattern detection identified sensitive identifiers in this dataset.'
                : 'No unmasked credit cards, SSNs, phone numbers, or emails detected.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchFindings}
            disabled={loading || applying}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Re-scan
          </Button>
          {hasPii && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleApplyMasking}
              disabled={applying}
              leftIcon={applying ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
              className="bg-[#FF4B3E] hover:bg-[#E03E32] text-xs font-semibold shadow-xs"
            >
              {applying ? 'Masking in DuckDB...' : 'One-Click Anonymize'}
            </Button>
          )}
        </div>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Findings table */}
      {hasPii ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[var(--text-muted)] font-medium bg-[var(--bg-surface)]">
                <th className="py-2.5 px-4 font-semibold uppercase tracking-wider font-mono">Column</th>
                <th className="py-2.5 px-4 font-semibold uppercase tracking-wider">Entity Type</th>
                <th className="py-2.5 px-4 font-semibold uppercase tracking-wider">Confidence</th>
                <th className="py-2.5 px-4 font-semibold uppercase tracking-wider">Sample Preview</th>
                <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-right">Masking Strategy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {findings.map((f) => (
                <tr key={f.column_name} className="hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="py-2.5 px-4 font-mono font-medium text-[var(--text-primary)]">
                    {f.column_name}
                  </td>
                  <td className="py-2.5 px-4">
                    {getEntityBadge(f.entity_type)}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[var(--text-secondary)]">
                    {Math.round(f.confidence * 100)}%
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-[var(--text-muted)]">
                    <span className="bg-[var(--bg-subtle)] px-2 py-0.5 rounded border border-[var(--border-hairline)] inline-block">
                      {f.sample_preview_masked}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <select
                      value={strategies[f.column_name] || f.suggested_strategy}
                      onChange={(e) =>
                        setStrategies({
                          ...strategies,
                          [f.column_name]: e.target.value as 'partial_mask' | 'sha256_hash' | 'redact',
                        })
                      }
                      className="bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded-md px-2 py-1 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="partial_mask">Partial Mask (***-1234)</option>
                      <option value="sha256_hash">SHA-256 Hash (Unique Joins)</option>
                      <option value="redact">Full Redact ([REDACTED])</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-xs text-[var(--text-secondary)] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All dataset columns conform to standard privacy rules. You can safely export to cloud or database targets.</span>
        </div>
      )}
    </div>
  );
};
