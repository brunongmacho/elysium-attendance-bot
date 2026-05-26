"use client";

import { forwardRef, HTMLAttributes } from 'react';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: number | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number; '2xl'?: number };
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  rows?: number | 'auto';
  autoFit?: boolean; // Auto-fit columns with minimum width
  minColWidth?: string; // Minimum column width for auto-fit (e.g., '250px', '20rem')
}

const gaps = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-12',
};

function getColumnClasses(columns: GridProps['columns']): string {
  if (typeof columns === 'number') {
    return `grid-cols-${columns}`;
  }

  if (typeof columns === 'object') {
    const classes: string[] = [];
    if (columns.xs) classes.push(`grid-cols-${columns.xs}`);
    if (columns.sm) classes.push(`sm:grid-cols-${columns.sm}`);
    if (columns.md) classes.push(`md:grid-cols-${columns.md}`);
    if (columns.lg) classes.push(`lg:grid-cols-${columns.lg}`);
    if (columns.xl) classes.push(`xl:grid-cols-${columns.xl}`);
    if (columns['2xl']) classes.push(`2xl:grid-cols-${columns['2xl']}`);
    return classes.join(' ');
  }

  return 'grid-cols-1';
}

export const Grid = forwardRef<HTMLDivElement, GridProps>(
  ({
    columns = { xs: 1, sm: 2, md: 3, lg: 4 },
    gap = 'md',
    rows = 'auto',
    autoFit = false,
    minColWidth = '250px',
    className = '',
    children,
    ...props
  }, ref) => {
    const columnClasses = autoFit ? '' : getColumnClasses(columns);
    const rowClasses = typeof rows === 'number' ? `grid-rows-${rows}` : '';

    const gridStyle = autoFit
      ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(${minColWidth}, 100%), 1fr))` }
      : {};

    return (
      <div
        ref={ref}
        style={gridStyle}
        className={`
          grid
          ${columnClasses}
          ${rowClasses}
          ${gaps[gap]}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Grid.displayName = 'Grid';
