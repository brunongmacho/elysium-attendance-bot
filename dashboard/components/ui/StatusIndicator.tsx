"use client";

import { forwardRef, HTMLAttributes } from 'react';

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  status: 'online' | 'offline' | 'busy' | 'away' | 'spawned' | 'soon' | 'ready';
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusColors = {
  online: 'bg-success',
  offline: 'bg-gray-500',
  busy: 'bg-danger',
  away: 'bg-warning',
  spawned: 'bg-danger',
  soon: 'bg-warning',
  ready: 'bg-success',
};

const sizes = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  ({
    status,
    label,
    pulse = false,
    size = 'md',
    className = '',
    ...props
  }, ref) => {
    const colorClass = statusColors[status];

    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-2 ${className}`}
        {...props}
      >
        <span className="relative inline-flex">
          {pulse && (
            <span
              className={`
                absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-75 animate-ping
              `}
            />
          )}
          <span
            className={`
              relative inline-flex rounded-full ${sizes[size]} ${colorClass}
            `}
          />
        </span>
        {label && (
          <span className="text-sm font-game text-gray-300">{label}</span>
        )}
      </span>
    );
  }
);

StatusIndicator.displayName = 'StatusIndicator';
