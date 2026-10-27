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
    sm: 'w-7 h-7 sm:w-8 sm:h-8',
    md: 'w-8.5 h-8.5 sm:w-9.5 sm:h-9.5',
    lg: 'w-11 h-11 sm:w-12 sm:h-12',
  }[size];

  const textSizes = {
    sm: 'text-xl sm:text-2xl',
    md: 'text-2xl sm:text-[26px]',
    lg: 'text-3xl sm:text-4xl',
  }[size];

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
      {/* Datamorph 4-petal geometric icon */}
      <img
        src="/datamorph-icon.png"
        alt="Datamorph"
        className={`${iconDimensions} shrink-0 object-contain`}
      />

      {!iconOnly && (
        <div className="flex items-center gap-2.5 sm:gap-3.5 leading-none">
          <div className={`font-bold tracking-tight font-sans flex items-baseline ${textSizes}`}>
            <span className="text-[var(--text-primary)]">Data</span>
            <span className="text-[var(--accent)]">morph</span>
          </div>
          {showTagline && (
            <span className="hidden md:inline-flex items-center text-xs lg:text-sm font-normal text-[var(--text-muted)] tracking-normal pl-2.5 sm:pl-3.5 hairline-l whitespace-nowrap">
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
