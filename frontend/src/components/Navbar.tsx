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
      <div className="header-shell flex items-center justify-between gap-4">
        {/* Left cluster: Brand & File metadata */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink">
          <button
            type="button"
            onClick={() => onSelectStep(1)}
            aria-label={`Go to ${APP_NAME} home`}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer select-none rounded-[var(--radius-xs)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 p-0.5 text-left"
          >
            <span className="w-2.5 h-2.5 rounded-[var(--radius-xs)] bg-[var(--accent)] shrink-0" />
            <span className="text-base font-semibold tracking-tight text-[var(--text-primary)] font-sans">
              {APP_NAME}
            </span>
          </button>

          {fileName && (
            <div className="hidden sm:flex items-center gap-2 text-xs md:text-sm text-[var(--text-muted)] hairline-l pl-3 sm:pl-4 min-w-0">
              <span
                className="font-mono text-[var(--text-primary)] font-medium truncate max-w-[120px] md:max-w-[180px] lg:max-w-[260px]"
                title={fileName}
              >
                {fileName}
              </span>
              {fileSizeFormatted && <span className="shrink-0">· {fileSizeFormatted}</span>}
              {rowCountFormatted && <span className="shrink-0 hidden md:inline">· {rowCountFormatted} rows</span>}
            </div>
          )}
        </div>

        {/* Right cluster: Step tabs */}
        <div className="shrink-0">
          <Stepper
            steps={STEPS}
            currentStep={currentStep}
            onSelectStep={onSelectStep}
          />
        </div>
      </div>
    </header>
  );
};
