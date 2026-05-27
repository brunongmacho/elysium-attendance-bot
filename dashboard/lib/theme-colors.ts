/**
 * Theme Color Mapping
 * Maps each lore theme name to CSS accent colors for per-member profile theming
 */

interface ThemeColorSet {
  accent: string;
  accentDark: string;
  accentLight: string;
}

// Tailwind default palette hex values (300/500/700 shades)
const PALETTES: Record<string, ThemeColorSet> = {
  slate:   { accent: '#64748b', accentDark: '#334155', accentLight: '#cbd5e1' },
  stone:   { accent: '#78716c', accentDark: '#44403c', accentLight: '#d6d3d1' },
  red:     { accent: '#ef4444', accentDark: '#b91c1c', accentLight: '#fca5a5' },
  orange:  { accent: '#f97316', accentDark: '#c2410c', accentLight: '#fdba74' },
  amber:   { accent: '#f59e0b', accentDark: '#d97706', accentLight: '#fcd34d' },
  yellow:  { accent: '#eab308', accentDark: '#a16207', accentLight: '#fde047' },
  lime:    { accent: '#84cc16', accentDark: '#4d7c0f', accentLight: '#bef264' },
  green:   { accent: '#22c55e', accentDark: '#15803d', accentLight: '#86efac' },
  emerald: { accent: '#10b981', accentDark: '#047857', accentLight: '#6ee7b7' },
  teal:    { accent: '#14b8a6', accentDark: '#0f766e', accentLight: '#5eead4' },
  cyan:    { accent: '#06b6d4', accentDark: '#0e7490', accentLight: '#67e8f9' },
  sky:     { accent: '#0ea5e9', accentDark: '#0369a1', accentLight: '#7dd3fc' },
  blue:    { accent: '#3b82f6', accentDark: '#1d4ed8', accentLight: '#93c5fd' },
  indigo:  { accent: '#6366f1', accentDark: '#4338ca', accentLight: '#a5b4fc' },
  violet:  { accent: '#8b5cf6', accentDark: '#6d28d9', accentLight: '#c4b5fd' },
  purple:  { accent: '#a855f7', accentDark: '#7e22ce', accentLight: '#d8b4fe' },
  fuchsia: { accent: '#d946ef', accentDark: '#a21caf', accentLight: '#f0abfc' },
  pink:    { accent: '#ec4899', accentDark: '#be185d', accentLight: '#f9a8d4' },
  rose:    { accent: '#f43f5e', accentDark: '#be123c', accentLight: '#fda4af' },
};

// Default fallback — teal/cyan, matches the dashboard's default accent
const DEFAULT: ThemeColorSet = { accent: '#14b8a6', accentDark: '#0f766e', accentLight: '#5eead4' };

/**
 * Maps lore theme name to CSS color values for profile page theming.
 * Returns { accent, accentDark, accentLight } hex values.
 */
export function getThemeColors(themeName: string): ThemeColorSet {
  return THEME_COLORS[themeName] || DEFAULT;
}

/**
 * Complete theme-to-color mapping for all 51 lore themes.
 * Each theme is mapped based on its lore personality:
 * - Fire/destructive themes → warm colors (red, orange, rose)
 * - Nature/calm themes → cool colors (green, teal, cyan)
 * - Mystical/magical themes → purple/fuchsia/violet
 * - Dark/shadow themes → slate/purple
 * - Light/divine themes → yellow/amber/sky
 * - Playful/chaotic themes → pink/lime/fuchsia
 */
export const THEME_COLORS: Record<string, ThemeColorSet> = {
  // Existing SPECIAL_USERS themes (preserved exactly)
  quantum: PALETTES.cyan,
  starlight: PALETTES.pink,
  chaos: PALETTES.orange,
  unstable: PALETTES.teal,
  portal: PALETTES.indigo,
  grill: PALETTES.red,
  wrong: PALETTES.amber,
  chrono: PALETTES.blue,
  nightlight: PALETTES.pink,
  ocean: PALETTES.sky,
  snack: PALETTES.rose,
  royal: PALETTES.violet,
  blade: PALETTES.rose,
  tiger: PALETTES.orange,
  boss: PALETTES.red,
  void: PALETTES.purple,
  meme: PALETTES.cyan,
  shadow: PALETTES.slate,
  neon: PALETTES.green,
  chaoscoin: PALETTES.emerald,
  spoon: PALETTES.slate,
  bureaucracy: PALETTES.slate,
  stats: PALETTES.cyan,
  olympus: PALETTES.yellow,
  weather: PALETTES.sky,
  speed: PALETTES.purple,
  morale: PALETTES.pink,
  recycle: PALETTES.lime,
  abyss: PALETTES.purple,
  chaosgun: PALETTES.violet,
  lightning: PALETTES.yellow,
  sonic: PALETTES.rose,
  archive: PALETTES.stone,
  vintage: PALETTES.amber,
  art: PALETTES.pink,
  pancake: PALETTES.orange,
  pharmacy: PALETTES.cyan,
  horn: PALETTES.fuchsia,
  book: PALETTES.amber,
  shadowdance: PALETTES.blue,
  tidal: PALETTES.teal,
  rhythm: PALETTES.fuchsia,
  vanish: PALETTES.slate,
  wisdom: PALETTES.indigo,
  reverse: PALETTES.green,
  dragon: PALETTES.green,
  blur: PALETTES.purple,
  elegance: PALETTES.pink,
  sky: PALETTES.sky,
  cat: PALETTES.purple,
  casino: PALETTES.red,
};

export type { ThemeColorSet };
