import React from 'react';

interface NavbarProps {
  currentStep: number;
  onSelectStep: (step: number) => void;
  fileName?: string;
  fileSize?: string;
  rowCount?: string;
}

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Profile & Report' },
  { id: 3, label: 'Approval' },
  { id: 4, label: 'Progress' },
  { id: 5, label: 'Results' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentStep,
  onSelectStep,
  fileName,
  fileSize,
  rowCount,
}) => {
  return (
    <header className="w-full bg-[var(--surface)] hairline-border border-t-0 border-x-0 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 bg-[var(--accent)] rounded-xs inline-block"></span>
          <span className="font-semibold text-sm tracking-tight text-[var(--text)]">
            AI Data Cleaner
          </span>
          <span className="text-xs text-[var(--text-muted)] px-1.5 py-0.5 bg-gray-100 rounded-xs mono">
            DuckDB Core
          </span>
        </div>

        {fileName && (
          <div className="hidden md:flex items-center space-x-2 text-xs text-[var(--text-muted)] border-l border-[var(--border)] pl-4">
            <span className="mono font-medium text-[var(--text)]">{fileName}</span>
            {fileSize && <span>· {fileSize}</span>}
            {rowCount && <span>· {rowCount} rows</span>}
          </div>
        )}
      </div>

      <nav className="flex items-center space-x-1">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          const isDone = currentStep > step.id;
          return (
            <button
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              className={`text-xs px-2.5 py-1 rounded-xs transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white font-medium'
                  : isDone
                  ? 'text-[var(--text)] hover:bg-gray-100 font-medium'
                  : 'text-[var(--text-muted)] hover:bg-gray-50'
              }`}
            >
              <span className="mono mr-1">{step.id}.</span>
              {step.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
