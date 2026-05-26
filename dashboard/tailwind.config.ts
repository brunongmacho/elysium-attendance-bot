import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--color-primary)",
          dark: "var(--color-primary-dark)",
          light: "var(--color-primary-light)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          dark: "var(--color-accent-dark)",
          light: "var(--color-accent-light)",
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
        surface: {
          base: "var(--color-bg-primary)",
          raised: "var(--color-bg-secondary)",
          overlay: "var(--color-bg-tertiary)",
        },
      },
      spacing: {
        xs: "0.25rem",   // 4px
        sm: "0.5rem",    // 8px
        md: "1rem",      // 16px
        lg: "1.5rem",    // 24px
        xl: "2rem",      // 32px
        "2xl": "3rem",   // 48px
        "3xl": "4rem",   // 64px
        "4xl": "6rem",   // 96px
        "5xl": "8rem",   // 128px
      },
      fontSize: {
        "fluid-xs": "clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)",
        "fluid-sm": "clamp(0.875rem, 0.8rem + 0.4vw, 1rem)",
        "fluid-base": "clamp(1rem, 0.9rem + 0.5vw, 1.125rem)",
        "fluid-lg": "clamp(1.125rem, 1rem + 0.625vw, 1.5rem)",
        "fluid-xl": "clamp(1.25rem, 1.1rem + 0.75vw, 1.875rem)",
        "fluid-2xl": "clamp(1.5rem, 1.3rem + 1vw, 2.25rem)",
        "fluid-3xl": "clamp(1.875rem, 1.5rem + 1.5vw, 3rem)",
        "fluid-4xl": "clamp(2.25rem, 1.8rem + 2vw, 4rem)",
      },
      lineHeight: {
        tight: "1.25",
        normal: "1.6",
        relaxed: "1.75",
      },
      boxShadow: {
        "elevated-1": "0 1px 3px rgba(0, 0, 0, 0.5)",
        "elevated-2": "0 4px 12px rgba(0, 0, 0, 0.6)",
        "elevated-3": "0 8px 24px rgba(0, 0, 0, 0.7)",
        "glow-sm": "0 0 10px currentColor",
        "glow-md": "0 0 20px currentColor",
        "glow-lg": "0 0 40px currentColor",
      },
      minWidth: {
        touch: "44px",
      },
      minHeight: {
        touch: "44px",
      },
    },
  },
  plugins: [],
  safelist: [
    // Colors
    "text-primary",
    "text-accent",
    "text-success",
    "text-danger",
    "text-warning",
    "border-primary",
    "border-accent",
    "border-success",
    "border-danger",
    "glow-primary",
    "glow-accent",
    "glow-success",
    "glow-danger",
    "glow-warning",
    "glow-gold",
    "glow-silver",
    // Leaderboard tier classes
    "text-primary-light",
    "text-accent-light",
    "text-success-light",
    "text-yellow-400",
    "text-gray-300",
    "text-gray-400",
    "border-primary/30",
    "border-accent/30",
    "border-success/30",
    "border-yellow-500/30",
    "border-gray-400/30",
    "border-gray-600/30",
    "hover:border-primary",
    "hover:border-accent",
    "hover:border-success",
    "hover:border-yellow-500",
    "hover:border-gray-400",
    "hover:border-gray-600",
    "hover:bg-primary/10",
    "hover:bg-accent/10",
    "hover:bg-success/10",
    "hover:bg-yellow-500/10",
    "hover:bg-gray-400/10",
    "hover:bg-gray-600/10",
    // Grid columns for dynamic generation
    {
      pattern: /grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
  ],
};
export default config;
