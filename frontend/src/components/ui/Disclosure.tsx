import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export interface DisclosureProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Disclosure: React.FC<DisclosureProps> = ({
  title,
  subtitle,
  defaultOpen = false,
  children,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`border hairline-border rounded-[var(--radius-sm)] bg-[var(--bg-surface)] ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full px-4 py-3 flex items-center justify-between text-left text-xs hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${
              isOpen ? 'rotate-90' : 'rotate-0'
            }`}
          />
          <span className="font-medium text-[var(--text-primary)]">{title}</span>
          {subtitle && <span className="text-[var(--text-muted)]">· {subtitle}</span>}
        </div>
        <span className="text-[11px] text-[var(--text-muted)] font-mono">
          {isOpen ? 'Hide' : 'Show'}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 hairline-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          {children}
        </div>
      )}
    </div>
  );
};
