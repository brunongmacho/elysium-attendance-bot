"use client";

import { forwardRef, HTMLAttributes, ReactNode } from 'react';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  spacing?: 'tight' | 'default' | 'relaxed' | 'spacious';
  as?: 'section' | 'div' | 'article';
}

const spacings = {
  tight: 'py-4',
  default: 'py-8',
  relaxed: 'py-12',
  spacious: 'py-16',
};

export const Section = forwardRef<HTMLElement, SectionProps>(
  ({
    title,
    description,
    action,
    spacing = 'default',
    as: Component = 'section',
    className = '',
    children,
    ...props
  }, ref) => {
    return (
      <Component
        ref={ref as any}
        className={`${spacings[spacing]} ${className}`}
        {...props}
      >
        {(title || description || action) && (
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div className="flex-1">
              {title && (
                <h2 className="text-fluid-2xl font-bold text-white mb-2 font-game-decorative">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-fluid-sm text-gray-400 font-game leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {action && (
              <div className="flex-shrink-0">
                {action}
              </div>
            )}
          </div>
        )}
        {children}
      </Component>
    );
  }
);

Section.displayName = 'Section';
