"use client";

import { forwardRef, HTMLAttributes } from 'react';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  direction?: 'vertical' | 'horizontal';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
}

const gaps = {
  xs: 'gap-1',    // 4px
  sm: 'gap-2',    // 8px
  md: 'gap-4',    // 16px
  lg: 'gap-6',    // 24px
  xl: 'gap-8',    // 32px
  '2xl': 'gap-12', // 48px
};

const alignments = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifications = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export const Stack = forwardRef<HTMLDivElement, StackProps>(
  ({
    gap = 'md',
    direction = 'vertical',
    align = 'stretch',
    justify = 'start',
    wrap = false,
    className = '',
    children,
    ...props
  }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          flex
          ${direction === 'vertical' ? 'flex-col' : 'flex-row'}
          ${gaps[gap]}
          ${alignments[align]}
          ${justifications[justify]}
          ${wrap ? 'flex-wrap' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Stack.displayName = 'Stack';
