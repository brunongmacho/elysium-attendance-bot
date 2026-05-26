"use client";

import { forwardRef, HTMLAttributes } from 'react';

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-primary/20 text-primary-bright border-primary/50',
  secondary: 'bg-gray-700/50 text-gray-300 border-gray-600/50',
  success: 'bg-success/20 text-success-bright border-success/50',
  warning: 'bg-accent/20 text-accent-bright border-accent/50',
  danger: 'bg-danger/20 text-danger-bright border-danger/50',
  info: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

const dotColors: Record<BadgeVariant, string> = {
  primary: 'bg-primary-bright',
  secondary: 'bg-gray-400',
  success: 'bg-success-bright',
  warning: 'bg-accent-bright',
  danger: 'bg-danger-bright',
  info: 'bg-blue-400',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      dot = false,
      pulse = false,
      removable = false,
      onRemove,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1.5
          rounded-full border font-game font-medium
          transition-all duration-200
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {dot && (
          <span className="relative inline-flex">
            {pulse && (
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${dotColors[variant]}`}
              />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColors[variant]}`} />
          </span>
        )}
        {children}
        {removable && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center justify-center hover:bg-white/10 rounded-full p-0.5 transition-colors"
            aria-label="Remove"
          >
            <svg
              className="w-3 h-3"
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
      </span>
    );
  }
);

Badge.displayName = 'Badge';
