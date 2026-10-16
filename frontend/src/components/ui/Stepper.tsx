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
  return (
    <nav aria-label="Progress Stepper" className={`flex items-center gap-1 sm:gap-2 ${className}`}>
      {steps.map((step) => {
        const isDone = step.id < currentStep;
        const isCurrent = step.id === currentStep;
        const isUpcoming = step.id > currentStep;

        return (
          <button
            key={step.id}
            type="button"
            disabled={isUpcoming}
            onClick={() => isDone && onSelectStep(step.id)}
            aria-current={isCurrent ? 'step' : undefined}
            className={`group inline-flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-[var(--radius-xs)] text-xs font-sans transition-colors ${
              isCurrent
                ? 'bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold border hairline-border border-[var(--accent-border)]'
                : isDone
                ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer'
                : 'text-[var(--text-placeholder)] cursor-default'
            }`}
          >
            <span
              className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-mono shrink-0 ${
                isDone
                  ? 'bg-[var(--status-ok-bg)] text-[var(--status-ok-text)]'
                  : isCurrent
                  ? 'bg-[var(--accent)] text-white font-medium'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-placeholder)]'
              }`}
            >
              {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : step.id}
            </span>

            {/* Label: Always available to screen readers, visible on sm+ screens */}
            <span className="sr-only sm:not-sr-only sm:inline whitespace-nowrap">
              {step.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
