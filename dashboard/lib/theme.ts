/**
 * Guild Theme Configuration
 * Customize colors, fonts, and styling to match your guild's branding
 */

export const guildTheme = {
  // Primary guild colors
  colors: {
    // Main brand color (change to your guild's primary color)
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',  // Main primary color
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
    },

    // Accent color (for highlights and CTAs)
    accent: {
      50: '#fdf4ff',
      100: '#fae8ff',
      200: '#f5d0fe',
      300: '#f0abfc',
      400: '#e879f9',
      500: '#d946ef',  // Main accent color
      600: '#c026d3',
      700: '#a21caf',
      800: '#86198f',
      900: '#701a75',
    },

    // Status colors
    success: '#10b981',  // Green for ready/positive states
    warning: '#f59e0b',  // Yellow for soon/warnings
    danger: '#ef4444',   // Red for spawned/critical
    info: '#3b82f6',     // Blue for information

    // Background colors
    background: {
      primary: '#111827',    // Main background
      secondary: '#1f2937',  // Cards/panels
      tertiary: '#374151',   // Elevated elements
    },

    // Text colors
    text: {
      primary: '#f9fafb',    // Main text
      secondary: '#d1d5db',  // Secondary text
      tertiary: '#9ca3af',   // Muted text
    },
  },

  // Guild name and branding
  branding: {
    name: 'ELYSIUM',
    tagline: 'Guild Dashboard',
    logo: '/icon.png', // Your guild icon
  },

  // Typography
  fonts: {
    heading: 'var(--font-geist-sans)',
    body: 'var(--font-geist-sans)',
  },

  // Border radius
  borderRadius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
    glow: '0 0 20px rgba(59, 130, 246, 0.5)', // Primary color glow
  },
};

// CSS custom properties for easy theme customization
export const getCSSVariables = () => {
  return {
    '--color-primary': guildTheme.colors.primary[500],
    '--color-primary-dark': guildTheme.colors.primary[700],
    '--color-primary-light': guildTheme.colors.primary[300],

    '--color-accent': guildTheme.colors.accent[500],
    '--color-accent-dark': guildTheme.colors.accent[700],
    '--color-accent-light': guildTheme.colors.accent[300],

    '--color-success': guildTheme.colors.success,
    '--color-warning': guildTheme.colors.warning,
    '--color-danger': guildTheme.colors.danger,
    '--color-info': guildTheme.colors.info,

    '--color-bg-primary': guildTheme.colors.background.primary,
    '--color-bg-secondary': guildTheme.colors.background.secondary,
    '--color-bg-tertiary': guildTheme.colors.background.tertiary,

    '--color-text-primary': guildTheme.colors.text.primary,
    '--color-text-secondary': guildTheme.colors.text.secondary,
    '--color-text-tertiary': guildTheme.colors.text.tertiary,
  };
};

/**
 * Quick theme presets - uncomment to use
 */

// DARK PURPLE THEME (Epic/Mythic vibe)
// export const guildTheme = {
//   colors: {
//     primary: { 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
//     accent: { 500: '#ec4899', 600: '#db2777', 700: '#be185d' },
//     // ... rest of config
//   }
// };

// GOLDEN/ROYAL THEME (Prestige vibe)
// export const guildTheme = {
//   colors: {
//     primary: { 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
//     accent: { 500: '#fbbf24', 600: '#f59e0b', 700: '#d97706' },
//     // ... rest of config
//   }
// };

// CRIMSON/BLOOD THEME (War/PvP vibe)
// export const guildTheme = {
//   colors: {
//     primary: { 500: '#dc2626', 600: '#b91c1c', 700: '#991b1b' },
//     accent: { 500: '#f97316', 600: '#ea580c', 700: '#c2410c' },
//     // ... rest of config
//   }
// };

// EMERALD/NATURE THEME (Life/Growth vibe)
// export const guildTheme = {
//   colors: {
//     primary: { 500: '#10b981', 600: '#059669', 700: '#047857' },
//     accent: { 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
//     // ... rest of config
//   }
// };

// CYBER/NEON THEME (Tech/Futuristic vibe)
// export const guildTheme = {
//   colors: {
//     primary: { 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
//     accent: { 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce' },
//     // ... rest of config
//   }
// };
