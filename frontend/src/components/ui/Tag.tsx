import React from 'react';

export interface TagProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';
  font?: 'sans' | 'mono';
  className?: string;
}

export const Tag: React.FC<TagProps> = ({
  children,
  variant = 'neutral',
  font = 'sans',
  className = '',
}) => {
  const variantStyles = {
    neutral:
      'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]',
    ok:
      'bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] border-[var(--status-ok-border)]',
    warn:
      'bg-[var(--status-warn-bg)] text-[var(--status-warn-text)] border-[var(--status-warn-border)]',
    danger:
      'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]',
    accent:
      'bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)]',
  }[variant];

  const fontClass = font === 'mono' ? 'font-mono' : 'font-sans';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs sm:text-sm font-medium border rounded-[var(--radius-xs)] ${variantStyles} ${fontClass} ${className}`}
    >
      {children}
    </span>
  );
};
