/**
 * Design Tokens
 * Centralized design system tokens for colors, spacing, typography, etc.
 */

import { colors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { transitions } from './transitions';
import { zIndex } from './z-index';

export { colors } from './colors';
export type { ColorTokens } from './colors';

export { spacing } from './spacing';
export type { SpacingTokens } from './spacing';

export { typography } from './typography';
export type { TypographyTokens } from './typography';

export { transitions } from './transitions';
export type { TransitionTokens } from './transitions';

export { zIndex, getZIndex } from './z-index';
export type { ZIndexTokens } from './z-index';

// Re-export all tokens as a single object
export const tokens = {
  colors,
  spacing,
  typography,
  transitions,
  zIndex,
} as const;

export type DesignTokens = typeof tokens;
