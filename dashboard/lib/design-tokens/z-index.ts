/**
 * Design Tokens - Z-Index Scale
 * Organized layering system for consistent stacking
 */

export const zIndex = {
  // Base layer
  base: 0,

  // Content layers
  content: {
    below: -1,
    base: 0,
    raised: 1,
  },

  // Interactive elements
  dropdown: 10,
  sticky: 20,
  fixed: 30,

  // Overlays
  backdrop: 40,
  overlay: 50,
  drawer: 60,

  // Modals and dialogs
  modal: 70,
  popover: 80,

  // Notifications
  toast: 90,
  tooltip: 100,

  // Maximum
  max: 9999,
} as const;

export type ZIndexTokens = typeof zIndex;

/**
 * Helper function to get z-index value
 * @example
 * style={{ zIndex: getZIndex('modal') }}
 */
export function getZIndex(layer: keyof typeof zIndex | keyof typeof zIndex.content): number {
  if (layer in zIndex) {
    return zIndex[layer as keyof typeof zIndex] as number;
  }
  if (layer in zIndex.content) {
    return zIndex.content[layer as keyof typeof zIndex.content];
  }
  return zIndex.base;
}
