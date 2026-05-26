"use client";

import { useVisualEffects, type EffectMode } from "@/contexts/VisualEffectsContext";

export default function EffectModeToggle() {
  const { effectMode, setEffectMode, isLoaded } = useVisualEffects();

  const modes: { value: EffectMode; label: string; icon: string }[] = [
    { value: "glow", label: "Glow", icon: "✨" },
    { value: "off", label: "Off", icon: "○" },
  ];

  return (
    <div className="flex items-center gap-2 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-2">
      <span className="text-xs text-gray-400 font-medium px-2">Effects:</span>
      <div className="flex gap-1">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setEffectMode(mode.value)}
            disabled={!isLoaded}
            className={`
              px-3 py-1.5 rounded text-xs font-medium transition-all duration-200
              ${
                isLoaded && effectMode === mode.value
                  ? "bg-primary text-white shadow-lg"
                  : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 hover:text-gray-200"
              }
              ${!isLoaded ? "opacity-50 cursor-wait" : ""}
            `}
            title={`Switch to ${mode.label} effect`}
          >
            <span className="mr-1">{mode.icon}</span>
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
