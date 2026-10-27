import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
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
      setTimeout(() => {
        fetchFindings();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to apply PII masking.');
    } finally {
      setApplying(false);
    }
  };

  const getEntityBadge = (entity: string) => {
    switch (entity.toLowerCase()) {
      case 'credit_card':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">CREDIT_CARD</span>;
      case 'ssn':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">US_SSN</span>;
      case 'email':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">EMAIL</span>;
      case 'phone':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">PHONE</span>;
      case 'ip':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">IP_ADDR</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">{entity.toUpperCase()}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
          <span>Scanning dataset for sensitive identifiers...</span>
        </div>
      </div>
    );
  }

  const hasPii = findings.length > 0;

  // When clean (no PII detected): Keep it ultra-compact, sleek, and understated (no AI slop)
  if (!hasPii) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium text-[var(--text-secondary)]">Privacy Compliance:</span>
          <span>No sensitive PII detected (GDPR & HIPAA compliant)</span>
        </div>
        <button
          type="button"
          onClick={fetchFindings}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Re-run PII scanner"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Re-scan</span>
        </button>
      </div>
    );
  }

  // When PII is detected: Present a high-density, authoritative data governance audit table
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl overflow-hidden shadow-2xs">
      <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-subtle)] border-b border-[var(--border-hairline)]">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
            Sensitive Data & PII Detection
          </h3>
          <Tag variant="warn" font="mono">
            {findings.length} columns flagged
          </Tag>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchFindings}
            disabled={loading || applying}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-scan</span>
          </button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleApplyMasking}
            disabled={applying}
            leftIcon={applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
            className="text-xs h-7 px-3 bg-[#FF4B3E] hover:bg-[#E03E32]"
          >
            {applying ? 'Masking...' : 'Anonymize Flagged Columns'}
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 font-sans">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-2 font-sans">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-[var(--text-muted)] font-medium bg-[var(--bg-surface)]">
              <th className="py-2 px-4 font-semibold uppercase tracking-wider font-mono text-[11px]">Column</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider font-mono text-[11px]">Entity</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider font-mono text-[11px]">Confidence</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider font-mono text-[11px]">Masked Sample</th>
              <th className="py-2 px-4 font-semibold uppercase tracking-wider font-mono text-[11px] text-right">Strategy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)] font-mono text-xs">
            {findings.map((f) => (
              <tr key={f.column_name} className="hover:bg-[var(--bg-hover)] transition-colors">
                <td className="py-2 px-4 font-semibold text-[var(--text-primary)]">
                  {f.column_name}
                </td>
                <td className="py-2 px-4">
                  {getEntityBadge(f.entity_type)}
                </td>
                <td className="py-2 px-4 text-[var(--text-secondary)]">
                  {Math.round(f.confidence * 100)}%
                </td>
                <td className="py-2 px-4 text-[var(--text-muted)]">
                  <span className="bg-[var(--bg-subtle)] px-2 py-0.5 rounded border border-[var(--border-hairline)]">
                    {f.sample_preview_masked}
                  </span>
                </td>
                <td className="py-2 px-4 text-right">
                  <select
                    value={strategies[f.column_name] || f.suggested_strategy}
                    onChange={(e) =>
                      setStrategies({
                        ...strategies,
                        [f.column_name]: e.target.value as 'partial_mask' | 'sha256_hash' | 'redact',
                      })
                    }
                    className="bg-[var(--bg-app)] border border-[var(--border-hairline)] focus:border-[#FF4B3E] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    <option value="partial_mask">Partial Mask (***-1234)</option>
                    <option value="sha256_hash">SHA-256 Hash</option>
                    <option value="redact">Redact ([REDACTED])</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
