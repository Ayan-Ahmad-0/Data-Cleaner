import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-xs sm:text-sm px-3 py-1.5 gap-1.5 h-8 font-medium',
    md: 'text-sm sm:text-base px-4.5 py-2 gap-2 h-10 font-medium',
    lg: 'text-base px-6 py-2.5 gap-2.5 h-12 font-semibold',
  }[size];

  const variantClasses = {
    primary:
      'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border-transparent font-medium shadow-none',
    secondary:
      'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-hairline)] font-medium',
    ghost:
      'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-transparent',
    danger:
      'bg-[var(--status-danger)] hover:bg-red-800 text-white border-transparent font-medium',
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center border hairline-border rounded-[var(--radius-sm)] transition-colors cursor-pointer select-none font-sans whitespace-nowrap ${sizeClasses} ${variantClasses} ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
      } ${className}`}
      {...props}
    >
      {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
      <span className="whitespace-nowrap">{children}</span>
      {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
};
