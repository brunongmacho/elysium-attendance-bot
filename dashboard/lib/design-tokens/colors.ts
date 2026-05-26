/**
 * Design Tokens - Colors
 * Centralized color system for consistent theming
 */

export const colors = {
  // Semantic color tokens
  semantic: {
    background: {
      primary: 'var(--color-bg-primary)',
      secondary: 'var(--color-bg-secondary)',
      tertiary: 'var(--color-bg-tertiary)',
    },
    text: {
      primary: 'var(--color-text-primary)',
      secondary: 'var(--color-text-secondary)',
      tertiary: 'var(--color-text-tertiary)',
    },
    interactive: {
      primary: 'var(--color-primary)',
      primaryDark: 'var(--color-primary-dark)',
      primaryLight: 'var(--color-primary-light)',
      accent: 'var(--color-accent)',
      accentDark: 'var(--color-accent-dark)',
      accentLight: 'var(--color-accent-light)',
    },
    status: {
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      danger: 'var(--color-danger)',
      info: 'var(--color-info)',
    },
  },

  // Component-specific tokens
  components: {
    card: {
      background: 'rgba(31, 41, 55, 0.7)', // bg-gray-800/70
      border: 'rgba(220, 38, 38, 0.2)',    // border-primary/20
      shadow: '0 4px 12px rgba(0, 0, 0, 0.6)',
    },
    button: {
      primary: {
        background: 'var(--color-primary)',
        backgroundHover: 'var(--color-primary-dark)',
        text: '#ffffff',
      },
      secondary: {
        background: 'rgba(31, 41, 55, 0.7)',
        backgroundHover: 'rgba(31, 41, 55, 0.9)',
        text: 'var(--color-text-secondary)',
      },
    },
    input: {
      background: 'var(--color-bg-tertiary)',
      border: 'var(--color-bg-tertiary)',
      borderFocus: 'var(--color-primary)',
      text: 'var(--color-text-primary)',
    },
  },
} as const;

export type ColorTokens = typeof colors;
