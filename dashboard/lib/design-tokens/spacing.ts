/**
 * Design Tokens - Spacing
 * Consistent spacing scale based on 4px base unit
 */

export const spacing = {
  // Base unit (4px)
  unit: 4,

  // Spacing scale
  scale: {
    0: '0',
    1: '0.25rem',  // 4px
    2: '0.5rem',   // 8px
    3: '0.75rem',  // 12px
    4: '1rem',     // 16px
    5: '1.25rem',  // 20px
    6: '1.5rem',   // 24px
    8: '2rem',     // 32px
    10: '2.5rem',  // 40px
    12: '3rem',    // 48px
    16: '4rem',    // 64px
    20: '5rem',    // 80px
    24: '6rem',    // 96px
    32: '8rem',    // 128px
  },

  // Named spacing for common use cases
  named: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
    '2xl': '3rem',  // 48px
    '3xl': '4rem',  // 64px
    '4xl': '6rem',  // 96px
    '5xl': '8rem',  // 128px
  },

  // Component-specific spacing
  components: {
    button: {
      paddingX: {
        sm: '0.75rem',  // 12px
        md: '1rem',     // 16px
        lg: '1.5rem',   // 24px
      },
      paddingY: {
        sm: '0.375rem', // 6px
        md: '0.5rem',   // 8px
        lg: '0.75rem',  // 12px
      },
    },
    card: {
      padding: {
        sm: '0.75rem',  // 12px
        md: '1rem',     // 16px
        lg: '1.5rem',   // 24px
      },
      gap: '1rem',      // 16px
    },
    input: {
      paddingX: '0.75rem', // 12px
      paddingY: '0.5rem',  // 8px
    },
  },
} as const;

export type SpacingTokens = typeof spacing;
