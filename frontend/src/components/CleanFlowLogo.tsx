import React from 'react';

export interface CleanFlowLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
  iconOnly?: boolean;
}

export const CleanFlowLogo: React.FC<CleanFlowLogoProps> = ({
  size = 'md',
  showTagline = true,
  className = '',
  iconOnly = false,
}) => {
  const iconDimensions = {
    sm: 'w-6 h-6 sm:w-8 sm:h-8',
    md: 'w-7 h-7 sm:w-9 sm:h-9',
    lg: 'w-10 h-10 sm:w-12 sm:h-12',
  }[size];

  const textSizes = {
    sm: 'text-base sm:text-2xl',
    md: 'text-lg sm:text-[24px]',
    lg: 'text-xl sm:text-4xl',
  }[size];

  return (
    <div className={`flex items-center gap-2 sm:gap-3 select-none ${className}`}>
      {/* Datamorph 4-petal geometric icon */}
      <img
        src="/datamorph-icon.png"
        alt="Datamorph"
        className={`${iconDimensions} shrink-0 object-contain`}
      />

      {!iconOnly && (
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3.5 leading-tight sm:leading-none min-w-0">
          <div className={`font-bold tracking-tight font-sans flex items-baseline ${textSizes}`}>
            <span className="text-[var(--text-primary)]">Data</span>
            <span className="text-[var(--accent)]">morph</span>
          </div>
          {showTagline && (
            <span className="inline-flex items-center text-[10px] sm:text-xs lg:text-sm font-normal text-[var(--text-muted)] tracking-tight sm:tracking-normal sm:pl-3.5 sm:hairline-l whitespace-nowrap mt-0.5 sm:mt-0">
              Transform &bull; Clean &bull; Prepare &bull; Visualize
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const DatamorphLogo = CleanFlowLogo;
export type DatamorphLogoProps = CleanFlowLogoProps;
