"use client";

import { ElementType, ComponentPropsWithoutRef } from 'react';

export type TypographyVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body'
  | 'small'
  | 'caption';

export type TypographyProps<T extends ElementType = 'p'> = {
  as?: T;
  variant?: TypographyVariant;
  className?: string;
  children: React.ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'variant'>;

const variantStyles: Record<TypographyVariant, string> = {
  display: 'text-fluid-4xl font-bold font-game-decorative leading-tight',
  h1: 'text-fluid-3xl font-bold font-game-decorative leading-tight',
  h2: 'text-fluid-2xl font-semibold font-game-decorative leading-tight',
  h3: 'text-fluid-xl font-semibold font-game leading-tight',
  h4: 'text-fluid-lg font-medium font-game leading-normal',
  body: 'text-fluid-base font-game leading-normal',
  small: 'text-fluid-sm font-game leading-normal',
  caption: 'text-fluid-xs font-game text-gray-400 leading-normal',
};

const defaultElements: Record<TypographyVariant, ElementType> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  body: 'p',
  small: 'p',
  caption: 'span',
};

export function Typography<T extends ElementType = 'p'>({
  as,
  variant = 'body',
  className = '',
  children,
  ...props
}: TypographyProps<T>) {
  const Component = as || defaultElements[variant];

  return (
    <Component
      className={`${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
