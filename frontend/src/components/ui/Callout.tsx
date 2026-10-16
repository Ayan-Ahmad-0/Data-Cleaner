import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export interface CalloutProps {
  title?: string;
  children: React.ReactNode;
  variant?: 'info' | 'warn' | 'danger' | 'ok';
  className?: string;
  action?: React.ReactNode;
}

export const Callout: React.FC<CalloutProps> = ({
  title,
  children,
  variant = 'info',
  className = '',
  action,
}) => {
  const styles = {
    info: {
      container: 'bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--text-primary)]',
      icon: <Info className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />,
      titleColor: 'text-[var(--accent-text)]',
    },
    warn: {
      container: 'bg-[var(--status-warn-bg)] border-[var(--status-warn-border)] text-[var(--text-primary)]',
      icon: <AlertTriangle className="w-5 h-5 text-[var(--status-warn)] shrink-0 mt-0.5" />,
      titleColor: 'text-[var(--status-warn-text)]',
    },
    danger: {
      container: 'bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--text-primary)]',
      icon: <AlertCircle className="w-5 h-5 text-[var(--status-danger)] shrink-0 mt-0.5" />,
      titleColor: 'text-[var(--status-danger-text)]',
    },
    ok: {
      container: 'bg-[var(--status-ok-bg)] border-[var(--status-ok-border)] text-[var(--text-primary)]',
      icon: <CheckCircle2 className="w-5 h-5 text-[var(--status-ok)] shrink-0 mt-0.5" />,
      titleColor: 'text-[var(--status-ok-text)]',
    },
  }[variant];

  return (
    <div
      role="alert"
      className={`p-4 border hairline-border rounded-[var(--radius-md)] flex items-start gap-3.5 text-sm leading-relaxed ${styles.container} ${className}`}
    >
      {styles.icon}
      <div className="flex-1 min-w-0">
        {title && <h4 className={`font-semibold text-sm sm:text-base mb-1 ${styles.titleColor}`}>{title}</h4>}
        <div className="text-[var(--text-secondary)]">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
