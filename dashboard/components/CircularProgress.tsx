"use client";

import { useMemo } from "react";
import { calculateBossGlow } from "@/lib/boss-glow";

interface CircularProgressProps {
  percentage: number; // 0-100
  size?: number; // diameter in pixels
  strokeWidth?: number;
  status?: "spawned" | "soon" | "ready" | "unknown";
  timeRemaining?: number | null; // milliseconds until spawn
  showPercentage?: boolean;
  className?: string;
}

export default function CircularProgress({
  percentage,
  size = 120,
  strokeWidth = 8,
  status = "ready",
  timeRemaining = null,
  showPercentage = false,
  className = "",
}: CircularProgressProps) {
  // Add generous padding to accommodate maximum glow effect (up to 30px)
  // Using 40px padding to ensure glow never clips
  const glowPadding = 40;
  const svgSize = size + glowPadding * 2;
  const centerOffset = size / 2 + glowPadding;

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  // Calculate dynamic, theme-aware electric glow based on time remaining
  const { glowColor, glowIntensity, strokeColor, electricFilter } = useMemo(() => {
    const glowData = calculateBossGlow(timeRemaining);
    // Create layered drop-shadow for electric effect on progress ring
    const baseIntensity = glowData.intensity * 0.3; // Scale down for SVG
    const filter = `drop-shadow(0 0 ${baseIntensity}px ${glowData.electricColor}) drop-shadow(0 0 ${baseIntensity * 1.5}px ${glowData.electricColor}) drop-shadow(0 0 ${baseIntensity * 0.5}px ${glowData.electricColor})`;
    return {
      glowColor: glowData.color,
      glowIntensity: glowData.intensity,
      strokeColor: glowData.tailwindStroke,
      electricFilter: filter,
    };
  }, [timeRemaining]);

  return (
    <div className={`relative inline-flex items-center justify-center overflow-visible ${className}`}>
      <svg
        width={svgSize}
        height={svgSize}
        className="transform -rotate-90 overflow-visible"
        style={{ overflow: 'visible' }}
      >
        {/* Background circle */}
        <circle
          cx={centerOffset}
          cy={centerOffset}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-700"
        />

        {/* Progress circle */}
        <circle
          cx={centerOffset}
          cy={centerOffset}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${strokeColor} transition-all duration-1000 ease-out`}
          style={{
            filter: electricFilter,
          }}
        />
      </svg>

      {/* Percentage text */}
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
}
