import React from 'react';
import { APP_NAME } from '../config';
import { Stepper, type StepItem } from './ui/Stepper';

interface NavbarProps {
  currentStep: number;
  onSelectStep: (step: number) => void;
  fileName?: string;
  fileSizeFormatted?: string;
  rowCountFormatted?: string;
}

const STEPS: StepItem[] = [
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
  fileSizeFormatted,
  rowCountFormatted,
}) => {
  return (
    <header className="w-full bg-[var(--bg-surface)] hairline-b sticky top-0 z-20">
      <div className="container-shell h-14 flex items-center justify-between gap-4">
        {/* Brand & File metadata */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-[var(--radius-xs)] bg-[var(--accent)]" />
            <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)] font-sans">
              {APP_NAME}
            </span>
          </div>

          {fileName && (
            <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)] hairline-l pl-3 truncate">
              <span className="font-mono text-[var(--text-primary)] truncate max-w-[200px]" title={fileName}>
                {fileName}
              </span>
              {fileSizeFormatted && <span>· {fileSizeFormatted}</span>}
              {rowCountFormatted && <span>· {rowCountFormatted} rows</span>}
            </div>
          )}
        </div>

        {/* Global Stepper */}
        <Stepper
          steps={STEPS}
          currentStep={currentStep}
          onSelectStep={onSelectStep}
          className="shrink-0"
        />
      </div>
    </header>
  );
};
