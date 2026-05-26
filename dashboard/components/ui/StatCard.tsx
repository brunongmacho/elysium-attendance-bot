"use client";

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

const trendColors = {
  up: 'text-success',
  down: 'text-danger',
  neutral: 'text-gray-400',
};

const trendIcons = {
  up: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  ),
  down: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  ),
  neutral: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
    </svg>
  ),
};

export const StatCard = memo(function StatCard({
  label,
  value,
  change,
  trend = 'neutral',
  icon,
  className = '',
}: StatCardProps) {
  return (
    <Card variant="glass" className={`p-6 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400 font-game mb-1">
            {label}
          </p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl sm:text-3xl font-bold text-white font-game-decorative"
          >
            {value}
          </motion.p>
          {change && (
            <div className={`flex items-center gap-1 mt-2 text-sm font-game ${trendColors[trend]}`}>
              {trendIcons[trend]}
              <span>{change}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 p-3 rounded-lg glass">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
});
