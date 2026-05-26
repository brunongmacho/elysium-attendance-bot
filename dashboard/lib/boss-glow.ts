/**
 * Boss Electric Animation Utility
 * Dynamically calculates electric animation intensity and colors based on time remaining
 * Uses theme colors for consistent styling
 */

interface GlowResult {
  color: string;
  intensity: number;
  borderColor: string;
  tailwindStroke: string;
  electricClass: string;
  electricColor: string;
}

/**
 * Gets CSS variable value from document root
 */
function getCSSVariable(variableName: string): string {
  if (typeof window === 'undefined') {
    // Server-side fallback values
    const fallbacks: Record<string, string> = {
      '--color-primary': '#3b82f6',
      '--color-primary-dark': '#1d4ed8',
      '--color-primary-light': '#93c5fd',
      '--color-accent': '#d946ef',
      '--color-accent-dark': '#a21caf',
      '--color-accent-light': '#f0abfc',
      '--color-success': '#10b981',
      '--color-warning': '#f59e0b',
      '--color-danger': '#ef4444',
      '--color-text-primary': '#f9fafb',
    };
    return fallbacks[variableName] || '#ffffff';
  }
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
}

/**
 * Converts hex color to rgba with custom opacity
 */
function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.startsWith('#') ? hex : `#${hex}`;
  const r = parseInt(cleanHex.slice(1, 3), 16);
  const g = parseInt(cleanHex.slice(3, 5), 16);
  const b = parseInt(cleanHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Interpolates between two hex colors
 * @param color1 Starting color (hex)
 * @param color2 Ending color (hex)
 * @param factor Interpolation factor (0-1)
 */
function interpolateColor(color1: string, color2: string, factor: number): string {
  const cleanColor1 = color1.startsWith('#') ? color1 : `#${color1}`;
  const cleanColor2 = color2.startsWith('#') ? color2 : `#${color2}`;

  const r1 = parseInt(cleanColor1.slice(1, 3), 16);
  const g1 = parseInt(cleanColor1.slice(3, 5), 16);
  const b1 = parseInt(cleanColor1.slice(5, 7), 16);

  const r2 = parseInt(cleanColor2.slice(1, 3), 16);
  const g2 = parseInt(cleanColor2.slice(3, 5), 16);
  const b2 = parseInt(cleanColor2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Calculates dynamic glow properties based on time remaining
 * Time brackets become progressively shorter as spawn approaches
 * Uses full theme palette (primary, accent, danger) for visual cohesion
 */
export function calculateBossGlow(timeRemaining: number | null): GlowResult {
  // Read full theme palette from CSS variables
  const primaryLight = getCSSVariable('--color-primary-light');
  const primary = getCSSVariable('--color-primary');
  const primaryDark = getCSSVariable('--color-primary-dark');
  const accentLight = getCSSVariable('--color-accent-light');
  const accent = getCSSVariable('--color-accent');
  const accentDark = getCSSVariable('--color-accent-dark');
  const danger = getCSSVariable('--color-danger');

  // Already spawned - maximum intensity danger with accent blend
  if (!timeRemaining || timeRemaining <= 0) {
    return {
      color: danger,
      intensity: 30,
      borderColor: 'border-danger',
      tailwindStroke: 'stroke-danger',
      electricClass: 'electric-extreme',
      electricColor: danger,
    };
  }

  const minutesRemaining = timeRemaining / (1000 * 60);

  // Imminent: 0-5 minutes - Pure danger, very high intensity
  if (minutesRemaining < 5) {
    return {
      color: danger,
      intensity: 25,
      borderColor: 'border-danger',
      tailwindStroke: 'stroke-danger',
      electricClass: 'electric-extreme',
      electricColor: danger,
    };
  }

  // Very soon: 5-10 minutes - Blend danger to accent-dark (intense warning)
  if (minutesRemaining < 10) {
    const factor = (minutesRemaining - 5) / 5; // 0 to 1
    const blendedColor = interpolateColor(danger, accentDark, factor);
    return {
      color: blendedColor,
      intensity: 22,
      borderColor: 'border-danger',
      tailwindStroke: 'stroke-danger',
      electricClass: 'electric-high',
      electricColor: blendedColor,
    };
  }

  // Soon: 10-20 minutes - Blend accent-dark to accent (vibrant urgency)
  if (minutesRemaining < 20) {
    const factor = (minutesRemaining - 10) / 10; // 0 to 1
    const blendedColor = interpolateColor(accentDark, accent, factor);
    return {
      color: blendedColor,
      intensity: 18,
      borderColor: 'border-accent-dark',
      tailwindStroke: 'stroke-accent-dark',
      electricClass: 'electric-high',
      electricColor: blendedColor,
    };
  }

  // Approaching: 20-30 minutes - Pure accent (high visibility)
  if (minutesRemaining < 30) {
    return {
      color: accent,
      intensity: 15,
      borderColor: 'border-accent',
      tailwindStroke: 'stroke-accent',
      electricClass: 'electric-high',
      electricColor: accent,
    };
  }

  // Medium-close: 30-60 minutes - Blend accent to accent-light
  if (minutesRemaining < 60) {
    const factor = (minutesRemaining - 30) / 30; // 0 to 1
    const blendedColor = interpolateColor(accent, accentLight, factor);
    return {
      color: blendedColor,
      intensity: 12,
      borderColor: 'border-accent',
      tailwindStroke: 'stroke-accent',
      electricClass: 'electric-medium',
      electricColor: blendedColor,
    };
  }

  // Medium: 1-2 hours - Blend accent-light to primary-dark
  if (minutesRemaining < 120) {
    const factor = (minutesRemaining - 60) / 60; // 0 to 1
    const blendedColor = interpolateColor(accentLight, primaryDark, factor);
    return {
      color: blendedColor,
      intensity: 10,
      borderColor: 'border-accent-light',
      tailwindStroke: 'stroke-accent-light',
      electricClass: 'electric-medium',
      electricColor: blendedColor,
    };
  }

  // Medium-far: 2-4 hours - Blend primary-dark to primary
  if (minutesRemaining < 240) {
    const factor = (minutesRemaining - 120) / 120; // 0 to 1
    const blendedColor = interpolateColor(primaryDark, primary, factor);
    return {
      color: blendedColor,
      intensity: 8,
      borderColor: 'border-primary-dark',
      tailwindStroke: 'stroke-primary-dark',
      electricClass: 'electric-medium',
      electricColor: blendedColor,
    };
  }

  // Far: 4-8 hours - Blend primary to primary-light
  if (minutesRemaining < 480) {
    const factor = (minutesRemaining - 240) / 240; // 0 to 1
    const blendedColor = interpolateColor(primary, primaryLight, factor);
    return {
      color: blendedColor,
      intensity: 6,
      borderColor: 'border-primary',
      tailwindStroke: 'stroke-primary',
      electricClass: 'electric-low',
      electricColor: blendedColor,
    };
  }

  // Very far: 8-24 hours - Subtle primary-light
  if (minutesRemaining < 1440) {
    return {
      color: primaryLight,
      intensity: 4,
      borderColor: 'border-primary-light',
      tailwindStroke: 'stroke-primary-light',
      electricClass: 'electric-low',
      electricColor: primaryLight,
    };
  }

  // Extremely far: >24 hours - Very subtle primary-light glow
  return {
    color: primaryLight,
    intensity: 3,
    borderColor: 'border-primary-light',
    tailwindStroke: 'stroke-primary-light',
    electricClass: 'electric-low',
    electricColor: primaryLight,
  };
}

/**
 * Generates box-shadow string with multiple layers for depth
 */
export function generateGlowStyle(color: string, baseIntensity: number): string {
  const layers = [
    `0 0 ${baseIntensity}px ${hexToRgba(color, 0.8)}`,
    `0 0 ${baseIntensity * 2}px ${hexToRgba(color, 0.5)}`,
    `0 0 ${baseIntensity * 3}px ${hexToRgba(color, 0.3)}`,
  ];

  return layers.join(', ');
}

/**
 * Generates drop-shadow filter string for SVG elements
 */
export function generateDropShadow(color: string, intensity: number): string {
  return `drop-shadow(0 0 ${intensity}px ${color}) drop-shadow(0 0 ${intensity * 0.5}px ${color})`;
}
