"use client";

import { forwardRef, HTMLAttributes } from 'react';

export interface FilterChipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onRemove'> {
  label: string;
  onRemove?: () => void;
  color?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  icon?: React.ReactNode;
}

const colorStyles = {
  primary: 'bg-primary/10 border-primary/30 text-primary-bright hover:bg-primary/20',
  accent: 'bg-accent/10 border-accent/30 text-accent-bright hover:bg-accent/20',
  success: 'bg-success/10 border-success/30 text-success-bright hover:bg-success/20',
  warning: 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/20',
  danger: 'bg-danger/10 border-danger/30 text-danger-bright hover:bg-danger/20',
};

export const FilterChip = forwardRef<HTMLDivElement, FilterChipProps>(
  ({
    label,
    onRemove,
    color = 'primary',
    icon,
    className = '',
    ...props
  }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5
          rounded-full border font-game text-sm
          transition-all duration-200
          ${colorStyles[color]}
          ${className}
        `}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="font-medium">{label}</span>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="flex-shrink-0 ml-1 hover:opacity-70 transition-opacity tap-target p-0.5 -m-0.5"
            aria-label={`Remove ${label} filter`}
            type="button"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

FilterChip.displayName = 'FilterChip';
