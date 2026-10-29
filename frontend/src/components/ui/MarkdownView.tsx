import React from 'react';
import ReactMarkdown from 'react-markdown';

export interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-view text-sm sm:text-base leading-relaxed text-[var(--text-secondary)] font-sans ${className}`}>
      <ReactMarkdown
        skipHtml={true}
        components={{
          h1: ({ children }) => (
            <h2 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] mt-5 mb-2.5 first:mt-0 hairline-b pb-2">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mt-4 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mt-3.5 mb-1.5">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-2.5 leading-relaxed text-[var(--text-secondary)] last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 pl-5 list-disc space-y-1.5 text-[var(--text-secondary)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 pl-5 list-decimal space-y-1.5 text-[var(--text-secondary)]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="font-mono text-xs sm:text-sm bg-[var(--bg-subtle)] text-[var(--text-primary)] px-1.5 py-0.5 rounded-[var(--radius-xs)] hairline-border">
                {children}
              </code>
            ) : (
              <pre className="font-mono text-xs sm:text-sm bg-[var(--bg-subtle)] text-[var(--text-primary)] p-4 rounded-[var(--radius-sm)] hairline-border overflow-x-auto my-3">
                <code>{children}</code>
              </pre>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 hairline-border rounded-[var(--radius-sm)]">
              <table className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--bg-subtle)] hairline-b text-[var(--text-muted)] font-medium">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 hairline-t border-[var(--border-subtle)]">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="hairline-l border-l-2 border-[var(--accent)] pl-3 my-2 text-[var(--text-muted)] italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
