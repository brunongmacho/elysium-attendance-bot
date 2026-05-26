/**
 * Design Tokens - Transitions & Animations
 * Consistent animation timings and easing functions
 */

export const transitions = {
  // Duration tokens
  duration: {
    instant: '0ms',
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
    slowest: '1000ms',
  },

  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    snappy: 'cubic-bezier(0.4, 0, 0.2, 1)',      // Fast interactions
    smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1)',  // Page transitions
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Celebratory
  },

  // Preset transitions (CSS classes)
  presets: {
    fast: 'transition-all duration-150 ease-out',
    base: 'transition-all duration-200 ease-in-out',
    slow: 'transition-all duration-300 ease-in-out',
    smooth: 'transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Framer Motion spring configs
  springs: {
    gentle: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 20,
    },
    bouncy: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 10,
    },
    stiff: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 30,
    },
  },

  // Common animation variants
  variants: {
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slideUp: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 20 },
    },
    slideDown: {
      initial: { opacity: 0, y: -20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -20 },
    },
    scaleIn: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
    },
  },
} as const;

export type TransitionTokens = typeof transitions;
