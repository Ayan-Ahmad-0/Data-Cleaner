import React from 'react';
import { APP_NAME } from '../config';
import { CleanFlowLogo } from './CleanFlowLogo';
import { ThemeToggle } from './ThemeToggle';
import { Stepper, type StepItem } from './ui/Stepper';

interface NavbarProps {
  currentStep: number;
  maxAllowedStep?: number;
  onSelectStep: (step: number) => void;
  appMode?: 'clean' | 'convert' | 'query' | 'visualize';
  onSelectMode?: (mode: 'clean' | 'convert' | 'query' | 'visualize') => void;
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
  maxAllowedStep,
  onSelectStep,
  appMode = 'clean',
  onSelectMode,
  fileName,
  fileSizeFormatted,
  rowCountFormatted,
}) => {
  return (
    <header className="w-full bg-[var(--bg-surface)] hairline-b sticky top-0 z-20">
      <div className="header-shell flex items-center justify-between gap-4">
        {/* Left cluster: Brand & Mode Switcher */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink">
          <button
            type="button"
            onClick={() => {
              if (onSelectMode) onSelectMode('clean');
              onSelectStep(1);
            }}
            aria-label={`Go to ${APP_NAME} home`}
            className="flex items-center shrink-0 cursor-pointer select-none rounded-[var(--radius-xs)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 p-1 text-left"
          >
            <CleanFlowLogo size="md" />
          </button>

          {fileName && appMode === 'clean' && (
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

        {/* Right cluster: Step tabs (if cleaning mode) & Theme toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {appMode === 'clean' && (
            <Stepper
              steps={STEPS}
              currentStep={currentStep}
              maxAllowedStep={maxAllowedStep}
              onSelectStep={onSelectStep}
            />
          )}
          <div className="hairline-l pl-2 sm:pl-3 flex items-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
};
