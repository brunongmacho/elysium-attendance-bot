"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type EffectMode = "glow" | "off";

interface VisualEffectsContextType {
  effectMode: EffectMode;
  setEffectMode: (mode: EffectMode) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  isLoaded: boolean;
}

const VisualEffectsContext = createContext<VisualEffectsContextType | undefined>(undefined);

const STORAGE_KEY = "elysium-visual-effects";
const ANIMATIONS_STORAGE_KEY = "elysium-animations-enabled";

export function VisualEffectsProvider({ children }: { children: ReactNode }) {
  const [effectMode, setEffectModeState] = useState<EffectMode>("glow");
  const [animationsEnabled, setAnimationsEnabledState] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === "glow" || saved === "off")) {
      setEffectModeState(saved as EffectMode);
    }

    const savedAnimations = localStorage.getItem(ANIMATIONS_STORAGE_KEY);
    if (savedAnimations !== null) {
      setAnimationsEnabledState(savedAnimations === "true");
    }

    setIsLoaded(true);
  }, []);

  // Apply animations preference to document
  useEffect(() => {
    if (isLoaded) {
      if (animationsEnabled) {
        document.documentElement.classList.remove('no-animations');
      } else {
        document.documentElement.classList.add('no-animations');
      }
    }
  }, [animationsEnabled, isLoaded]);

  const setEffectMode = (mode: EffectMode) => {
    setEffectModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  const setAnimationsEnabled = (enabled: boolean) => {
    setAnimationsEnabledState(enabled);
    localStorage.setItem(ANIMATIONS_STORAGE_KEY, String(enabled));
  };

  return (
    <VisualEffectsContext.Provider value={{ effectMode, setEffectMode, animationsEnabled, setAnimationsEnabled, isLoaded }}>
      {children}
    </VisualEffectsContext.Provider>
  );
}

export function useVisualEffects() {
  const context = useContext(VisualEffectsContext);
  if (!context) {
    throw new Error("useVisualEffects must be used within VisualEffectsProvider");
  }
  return context;
}
