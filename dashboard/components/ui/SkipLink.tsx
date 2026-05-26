"use client";

import { forwardRef, AnchorHTMLAttributes } from 'react';

export interface SkipLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  targetId: string;
  label?: string;
}

export const SkipLink = forwardRef<HTMLAnchorElement, SkipLinkProps>(
  ({
    targetId,
    label = 'Skip to main content',
    className = '',
    ...props
  }, ref) => {
    return (
      <a
        ref={ref}
        href={`#${targetId}`}
        className={`
          skip-link
          absolute -top-10 left-0 z-[100]
          bg-primary text-white px-4 py-2
          font-game font-semibold
          rounded-br-lg
          focus:top-0
          transition-all duration-200
          ${className}
        `}
        {...props}
      >
        {label}
      </a>
    );
  }
);

SkipLink.displayName = 'SkipLink';
