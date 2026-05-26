"use client";

import { forwardRef, HTMLAttributes } from 'react';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'default' | 'lg' | 'full';
  noPadding?: boolean;
}

const sizes = {
  sm: 'max-w-3xl',        // 768px
  default: 'max-w-7xl',   // 1280px
  lg: 'max-w-[1440px]',   // 1440px
  full: 'max-w-full',     // 100%
};

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ size = 'default', noPadding = false, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          ${sizes[size]}
          mx-auto
          ${noPadding ? '' : 'px-4 sm:px-6 lg:px-8'}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = 'Container';
