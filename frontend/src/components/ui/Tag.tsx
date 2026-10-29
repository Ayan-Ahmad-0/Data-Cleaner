import React from 'react';

export interface TagProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';
  font?: 'sans' | 'mono';
  dot?: boolean;
  className?: string;
}

export const Tag: React.FC<TagProps> = ({
  children,
  variant = 'neutral',
  font = 'sans',
  dot = false,
  className = '',
}) => {
  const variantStyles = {
    neutral:
      'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-hairline)]',
    ok:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    warn:
      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    danger:
      'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    accent:
      'bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)]',
  }[variant];

  const dotColors = {
    neutral: 'bg-[var(--text-muted)]',
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-red-500',
    accent: 'bg-[var(--accent)]',
  }[variant];

  const fontClass = font === 'mono' ? 'font-mono' : 'font-sans';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium border rounded-full ${variantStyles} ${fontClass} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors}`} />}
      <span>{children}</span>
    </span>
  );
};
