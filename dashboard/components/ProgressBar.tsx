"use client";

import { useEffect, useState } from "react";
import { useVisualEffects } from "@/contexts/VisualEffectsContext";

interface ProgressBarProps {
  value: number; // 0-100
  maxValue?: number;
  color?: "success" | "warning" | "danger" | "primary" | "accent" | "info";
  showPercentage?: boolean;
  label?: string;
  className?: string;
  animated?: boolean;
}

export default function ProgressBar({
  value,
  maxValue = 100,
  color = "primary",
  showPercentage = true,
  label,
  className = "",
  animated = true,
}: ProgressBarProps) {
  const { animationsEnabled } = useVisualEffects();
  const [width, setWidth] = useState(0);

  const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  useEffect(() => {
    if (animated && animationsEnabled) {
      // Animate the width
      const timeout = setTimeout(() => setWidth(percentage), 100);
      return () => clearTimeout(timeout);
    } else {
      setWidth(percentage);
    }
  }, [percentage, animated, animationsEnabled]);

  const colorClasses = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    primary: "bg-primary",
    accent: "bg-accent",
    info: "bg-info",
  };

  const glowClasses = {
    success: "glow-success",
    warning: "glow-warning",
    danger: "glow-danger",
    primary: "glow-primary",
    accent: "glow-accent",
    info: "glow-primary",
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-400">{label}</span>
          {showPercentage && (
            <span className="text-xs font-semibold text-white">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}

      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} ${glowClasses[color]} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
