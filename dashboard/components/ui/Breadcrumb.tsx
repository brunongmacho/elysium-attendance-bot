"use client";

import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-2 text-sm font-game ${className}`}>
      <ol className="flex items-center gap-2 flex-wrap">
        {items.map((item, index) => (
          <Fragment key={index}>
            <li className="flex items-center gap-2">
              {item.current || !item.href ? (
                <span
                  className="text-gray-400"
                  aria-current={item.current ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-primary hover:text-primary-light transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
            {index < items.length - 1 && (
              <li className="text-gray-600" aria-hidden="true">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
