"use client";

import { motion } from 'framer-motion';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: string;
  illustration?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  icon = '📭',
  illustration,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        glass backdrop-blur-sm rounded-lg border border-gray-700
        p-8 sm:p-12 text-center
        ${className}
      `}
    >
      {illustration || (
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="text-6xl sm:text-7xl mb-4"
        >
          {icon}
        </motion.div>
      )}

      <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 font-game-decorative">
        {title}
      </h3>

      <p className="text-gray-400 mb-6 font-game max-w-md mx-auto text-sm sm:text-base">
        {description}
      </p>

      {action && (
        action.href ? (
          <a href={action.href}>
            <Button variant="primary" size="md">
              {action.label}
            </Button>
          </a>
        ) : (
          <Button onClick={action.onClick} variant="primary" size="md">
            {action.label}
          </Button>
        )
      )}
    </motion.div>
  );
}
