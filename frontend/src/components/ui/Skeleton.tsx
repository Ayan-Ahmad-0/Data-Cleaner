import React from 'react';

export interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
}) => {
  return (
    <div
      className={`animate-pulse bg-[var(--bg-hover)] rounded-[var(--radius-xs)] ${className}`}
      style={{
        width: width || undefined,
        height: height || undefined,
      }}
    />
  );
};
