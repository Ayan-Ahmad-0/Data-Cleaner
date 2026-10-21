import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

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
    <div className={`flex items-center shrink-0 ${className}`}>
      {/* Below 640px: Compact interactive step picker */}
      <div className="sm:hidden flex items-center gap-1.5 text-xs font-sans whitespace-nowrap">
        <label htmlFor="mobile-step-select" className="sr-only">
          Select Step
        </label>
        <select
          id="mobile-step-select"
          value={currentStep}
          onChange={(e) => onSelectStep(Number(e.target.value))}
          className="bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium rounded-[var(--radius-sm)] px-2.5 py-1 hairline-border cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] text-xs outline-none"
        >
          {steps.map((s) => (
            <option key={s.id} value={s.id} disabled={s.id > maxAllowedStep}>
              {s.label} {s.id > maxAllowedStep ? '(Locked)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 640px+: Sleek breadcrumb-style progress tracker */}
      <nav
        aria-label="Progress Stepper"
        className="hidden sm:flex items-center gap-0.5"
      >
        {steps.map((step, index) => {
          const isDone = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isLocked = step.id > maxAllowedStep;

          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (!isLocked) onSelectStep(step.id);
                }}
                aria-current={isCurrent ? 'step' : undefined}
                className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] text-xs font-sans transition-all select-none outline-none whitespace-nowrap ${
                  isLocked
                    ? 'opacity-30 cursor-not-allowed text-[var(--text-placeholder)]'
                    : isCurrent
                    ? 'text-[var(--text-primary)] font-semibold cursor-pointer hover:bg-[var(--bg-hover)]'
                    : isDone
                    ? 'text-[var(--text-secondary)] font-medium cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {/* Numbered badge / check */}
                <span
                  className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-mono shrink-0 transition-all ${
                    isCurrent
                      ? 'bg-[var(--accent)] text-white font-bold shadow-[0_0_8px_rgba(253,66,51,0.35)]'
                      : isDone
                      ? 'bg-[var(--status-ok)]/15 text-[var(--status-ok)] border border-[var(--status-ok)]/30'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]'
                  }`}
                >
                  {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : step.id}
                </span>

                {/* Step Label: show for current + on lg+ for all */}
                <span
                  className={`${
                    isCurrent ? 'inline' : 'hidden lg:inline'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {/* Chevron separator between steps */}
              {index < steps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-[var(--text-placeholder)] shrink-0 mx-0.5" />
              )}
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
};
