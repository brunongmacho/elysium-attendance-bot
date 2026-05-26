/**
 * Design Tokens - Typography
 * Fluid typography scale and font families
 */

export const typography = {
  // Font families
  fonts: {
    game: 'var(--font-cinzel), serif',
    gameDecorative: 'var(--font-cinzel-decorative), serif',
    body: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },

  // Fluid font sizes (responsive)
  sizes: {
    fluid: {
      xs: 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
      sm: 'clamp(0.875rem, 0.8rem + 0.4vw, 1rem)',
      base: 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)',
      lg: 'clamp(1.125rem, 1rem + 0.625vw, 1.5rem)',
      xl: 'clamp(1.25rem, 1.1rem + 0.75vw, 1.875rem)',
      '2xl': 'clamp(1.5rem, 1.3rem + 1vw, 2.25rem)',
      '3xl': 'clamp(1.875rem, 1.5rem + 1.5vw, 3rem)',
      '4xl': 'clamp(2.25rem, 1.8rem + 2vw, 4rem)',
    },
    fixed: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem',    // 48px
    },
  },

  // Line heights
  lineHeights: {
    tight: 1.25,
    normal: 1.6,
    relaxed: 1.75,
    loose: 2,
  },

  // Font weights
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },

  // Text styles (combinations)
  styles: {
    display: {
      fontSize: 'clamp(2.25rem, 1.8rem + 2vw, 4rem)',
      fontWeight: 900,
      lineHeight: 1.25,
      fontFamily: 'var(--font-cinzel-decorative), serif',
    },
    h1: {
      fontSize: 'clamp(1.875rem, 1.5rem + 1.5vw, 3rem)',
      fontWeight: 700,
      lineHeight: 1.25,
      fontFamily: 'var(--font-cinzel-decorative), serif',
    },
    h2: {
      fontSize: 'clamp(1.5rem, 1.3rem + 1vw, 2.25rem)',
      fontWeight: 600,
      lineHeight: 1.25,
      fontFamily: 'var(--font-cinzel-decorative), serif',
    },
    h3: {
      fontSize: 'clamp(1.25rem, 1.1rem + 0.75vw, 1.875rem)',
      fontWeight: 600,
      lineHeight: 1.25,
      fontFamily: 'var(--font-cinzel), serif',
    },
    body: {
      fontSize: 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)',
      fontWeight: 400,
      lineHeight: 1.6,
      fontFamily: 'var(--font-cinzel), serif',
    },
  },
} as const;

export type TypographyTokens = typeof typography;
