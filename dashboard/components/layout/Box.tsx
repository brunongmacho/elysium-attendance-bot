"use client";

import { ElementType, ComponentPropsWithoutRef } from 'react';

export type BoxProps<T extends ElementType = 'div'> = {
  as?: T;
  children?: React.ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<T>;

export function Box<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  ...props
}: BoxProps<T>) {
  const Component = as || 'div';

  return (
    <Component className={className} {...props}>
      {children}
    </Component>
  );
}
