"use client";

import { motion } from 'framer-motion';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useVisualEffects } from '@/contexts/VisualEffectsContext';

export interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  triggerOnce?: boolean;
}

const directionVariants = {
  up: { y: 40, x: 0 },
  down: { y: -40, x: 0 },
  left: { y: 0, x: 40 },
  right: { y: 0, x: -40 },
};

export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  triggerOnce = true,
}: ScrollRevealProps) {
  const { ref, isVisible } = useScrollAnimation({ triggerOnce });
  const { animationsEnabled } = useVisualEffects();

  // If animations are disabled, render without motion
  if (!animationsEnabled) {
    return (
      <div ref={ref as any} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref as any}
      initial={{
        opacity: 0,
        ...directionVariants[direction],
      }}
      animate={
        isVisible
          ? {
              opacity: 1,
              y: 0,
              x: 0,
            }
          : {
              opacity: 0,
              ...directionVariants[direction],
            }
      }
      transition={{
        duration: 0.5,
        delay,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
