"use client";

import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'solid' | 'outlined' | 'elevated';
  glow?: boolean;
  glowColor?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  hover3d?: boolean;
  interactive?: boolean;
}

const variantStyles = {
  glass: 'glass backdrop-blur-sm',
  solid: 'bg-gray-800 border border-gray-700',
  outlined: 'bg-transparent border border-gray-600',
  elevated: 'glass backdrop-blur-sm shadow-xl',
};

const glowStyles = {
  primary: 'glow-primary',
  accent: 'glow-accent',
  success: 'glow-success',
  warning: 'glow-warning',
  danger: 'glow-danger',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({
    variant = 'glass',
    glow = false,
    glowColor = 'primary',
    hover3d = false,
    interactive = false,
    className = '',
    children,
    ...props
  }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          ${variantStyles[variant]}
          ${glow ? glowStyles[glowColor] : ''}
          ${hover3d ? 'card-3d' : ''}
          ${interactive ? 'card-interactive cursor-pointer' : ''}
          rounded-lg
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card sub-components for composition
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`p-4 sm:p-6 border-b border-gray-700/50 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', children, ...props }, ref) => (
    <h3
      ref={ref}
      className={`text-xl font-bold text-white font-game-decorative ${className}`}
      {...props}
    >
      {children}
    </h3>
  )
);

CardTitle.displayName = 'CardTitle';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`p-4 sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`p-4 sm:p-6 border-t border-gray-700/50 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';
