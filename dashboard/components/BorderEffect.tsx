"use client";

import { useVisualEffects } from "@/contexts/VisualEffectsContext";
import GlowBorder from "./GlowBorder";

interface BorderEffectProps {
  intensity: 'low' | 'medium' | 'high' | 'extreme';
  color: string;
}

/**
 * BorderEffect - Wrapper component that renders the appropriate effect based on user preference
 * Switches between GlowBorder or nothing based on context
 * Waits for preferences to load to prevent flickering on navigation
 */
export default function BorderEffect({ intensity, color }: BorderEffectProps) {
  const { effectMode, isLoaded } = useVisualEffects();

  // Don't render until preferences are loaded to prevent flickering
  if (!isLoaded) {
    return null;
  }

  if (effectMode === "off") {
    return null;
  }

  // Always use glow effect - electric removed due to performance
  return <GlowBorder intensity={intensity} color={color} />;
}
