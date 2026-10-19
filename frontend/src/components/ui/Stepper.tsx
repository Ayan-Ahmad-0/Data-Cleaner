import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: number;
  label: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  maxAllowedStep?: number;
  onSelectStep: (step: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  maxAllowedStep = 5,
  onSelectStep,
  className = '',
}) => {
  return (
    <div className={`flex items-center shrink-0 p-0.5 ${className}`}>
      {/* Below 640 px: Compact interactive step picker */}
      <div className="sm:hidden flex items-center gap-1.5 text-xs font-sans whitespace-nowrap">
        <label htmlFor="mobile-step-select" className="sr-only">
          Select Step
        </label>
        <select
          id="mobile-step-select"
          value={currentStep}
          onChange={(e) => onSelectStep(Number(e.target.value))}
          className="bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium rounded-[var(--radius-xs)] px-2.5 py-1 hairline-border cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] text-xs outline-none"
        >
          {steps.map((s) => (
            <option key={s.id} value={s.id} disabled={s.id > maxAllowedStep}>
              Step {s.id} of {steps.length} · {s.label} {s.id > maxAllowedStep ? '(Locked)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 640 px and up: Full Stepper bar with gated tabs */}
      <nav
        aria-label="Progress Stepper"
        className="hidden sm:flex items-center gap-1.5 lg:gap-2 xl:gap-2.5 p-0.5 flex-nowrap"
      >
        {steps.map((step) => {
          const isDone = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isLocked = step.id > maxAllowedStep;

          return (
            <button
              key={step.id}
              type="button"
              disabled={isLocked}
              onClick={() => {
                if (!isLocked) onSelectStep(step.id);
              }}
              aria-current={isCurrent ? 'step' : undefined}
              className={`group inline-flex items-center gap-1.5 lg:gap-2 px-2.5 py-1.5 lg:px-3 lg:py-1.5 xl:px-3.5 xl:py-1.5 rounded-[var(--radius-sm)] text-xs lg:text-xs xl:text-sm font-sans transition-all select-none outline-none border hairline-border ${
                isLocked
                  ? 'opacity-40 cursor-not-allowed bg-[var(--bg-subtle)] text-[var(--text-placeholder)] border-[var(--border-hairline)]'
                  : isCurrent
                  ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border-transparent font-medium shadow-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
                  : isDone
                  ? 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-hairline)] font-medium cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border-hairline)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-mono shrink-0 transition-colors ${
                  isCurrent
                    ? 'bg-white text-[var(--accent)] font-bold'
                    : isDone
                    ? 'bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] border border-[var(--status-ok-border)] font-semibold'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)] font-normal group-hover:border-[var(--border-strong)]'
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
                  isCurrent ? 'inline text-white font-semibold' : 'hidden lg:inline'
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
