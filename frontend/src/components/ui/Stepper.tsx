import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: number;
  label: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  onSelectStep: (step: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onSelectStep,
  className = '',
}) => {
  const currentStepItem = steps.find((s) => s.id === currentStep) || steps[0];

  return (
    <div className={`flex items-center shrink-0 p-0.5 ${className}`}>
      {/* Below 640 px: Single compact status ("Step 2 of 5 · Profile & Report") */}
      <div className="sm:hidden flex items-center gap-1.5 text-xs font-sans whitespace-nowrap">
        <span className="font-mono text-[var(--accent)] font-semibold">
          Step {currentStep} of {steps.length}
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="font-medium text-[var(--text-primary)]">
          {currentStepItem.label}
        </span>
      </div>

      {/* 640 px and up: Full Stepper bar with responsive labels */}
      <nav
        aria-label="Progress Stepper"
        className="hidden sm:flex items-center gap-1.5 lg:gap-2 xl:gap-2.5 p-0.5 flex-nowrap"
      >
        {steps.map((step) => {
          const isDone = step.id < currentStep;
          const isCurrent = step.id === currentStep;

          return (
            <button
              key={step.id}
              type="button"
              disabled={!isDone}
              onClick={() => isDone && onSelectStep(step.id)}
              aria-current={isCurrent ? 'step' : undefined}
              aria-disabled={!isDone ? 'true' : undefined}
              className={`group inline-flex items-center gap-1.5 lg:gap-2 px-2 py-1 lg:px-2.5 lg:py-1.5 xl:px-3.5 xl:py-1.5 rounded-[var(--radius-sm)] text-xs lg:text-xs xl:text-sm font-sans transition-all select-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 outline-none ${
                isCurrent
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold border hairline-border border-[var(--accent-border)] cursor-default'
                  : isDone
                  ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border hairline-border border-transparent cursor-pointer'
                  : 'text-[var(--text-muted)] opacity-50 border hairline-border border-transparent cursor-default'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-mono shrink-0 transition-colors ${
                  isDone
                    ? 'bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] border border-[var(--status-ok-border)] font-semibold'
                    : isCurrent
                    ? 'bg-[var(--accent)] text-white font-semibold'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)] font-normal'
                }`}
              >
                {isDone ? <Check className="w-3 h-3 stroke-[2.5]" /> : step.id}
              </span>

              {/* Step Label:
                  - 640-1023px: visible ONLY for current step, hidden for others.
                  - 1024px+: visible for all steps.
              */}
              <span
                className={`whitespace-nowrap font-medium text-inherit ${
                  isCurrent ? 'inline' : 'hidden lg:inline'
                }`}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
