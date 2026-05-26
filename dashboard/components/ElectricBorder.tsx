"use client";

import { useRef, useMemo, memo } from 'react';

interface ElectricBorderProps {
  intensity?: 'low' | 'medium' | 'high' | 'extreme';
  color?: string;
  className?: string;
}

const ElectricBorder = memo(function ElectricBorder({
  intensity = 'medium',
  color = '#3b82f6',
  className = ''
}: ElectricBorderProps) {
  const filter1Id = useRef(`electric-filter1-${Math.random().toString(36).substr(2, 9)}`);
  const filter2Id = useRef(`electric-filter2-${Math.random().toString(36).substr(2, 9)}`);
  const filter3Id = useRef(`electric-filter3-${Math.random().toString(36).substr(2, 9)}`);
  const filter4Id = useRef(`electric-filter4-${Math.random().toString(36).substr(2, 9)}`);

  // Intensity settings for turbulence animation
  const settings = useMemo(() => ({
    low: { baseFrequency: 0.015, numOctaves: 8, scale: 4, duration: 10, blur1: 1, blur2: 4, blur3: 8 },
    medium: { baseFrequency: 0.02, numOctaves: 10, scale: 6, duration: 8, blur1: 2, blur2: 6, blur3: 12 },
    high: { baseFrequency: 0.025, numOctaves: 12, scale: 8, duration: 6, blur1: 3, blur2: 8, blur3: 16 },
    extreme: { baseFrequency: 0.03, numOctaves: 14, scale: 10, duration: 4, blur1: 4, blur2: 10, blur3: 20 },
  }[intensity]), [intensity]);

  const gradientColor = useMemo(() => `${color}20`, [color]); // 12% opacity - much more subtle

  // Memoized filter elements
  const filters = useMemo(() => {
    const createTurbulenceFilter = (filterId: string, seed1: number, seed2: number, seed3: number, seed4: number, durationMultiplier: number) => (
    <filter
      id={filterId}
      colorInterpolationFilters="sRGB"
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
    >
      {/* First turbulence */}
      <feTurbulence
        type="turbulence"
        baseFrequency={settings.baseFrequency}
        numOctaves={settings.numOctaves}
        result="noise1"
        seed={seed1}
      />
      <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
        <animate
          attributeName="dx"
          values={`0; 350; 0; -350; 0`}
          dur={`${settings.duration * durationMultiplier}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
        <animate
          attributeName="dy"
          values={`0; -350; 0; 350; 0`}
          dur={`${settings.duration * durationMultiplier}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
      </feOffset>

      {/* Second turbulence */}
      <feTurbulence
        type="turbulence"
        baseFrequency={settings.baseFrequency}
        numOctaves={settings.numOctaves}
        result="noise2"
        seed={seed2}
      />
      <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
        <animate
          attributeName="dx"
          values={`0; -350; 0; 350; 0`}
          dur={`${settings.duration * durationMultiplier}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
        <animate
          attributeName="dy"
          values={`0; 350; 0; -350; 0`}
          dur={`${settings.duration * durationMultiplier}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
      </feOffset>

      {/* Third turbulence */}
      <feTurbulence
        type="turbulence"
        baseFrequency={settings.baseFrequency}
        numOctaves={settings.numOctaves}
        result="noise3"
        seed={seed3}
      />
      <feOffset in="noise3" dx="0" dy="0" result="offsetNoise3">
        <animate
          attributeName="dx"
          values={`0; 250; 0; -250; 0`}
          dur={`${settings.duration * durationMultiplier * 1.3}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
        <animate
          attributeName="dy"
          values={`0; 250; 0; -250; 0`}
          dur={`${settings.duration * durationMultiplier * 1.3}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
      </feOffset>

      {/* Fourth turbulence */}
      <feTurbulence
        type="turbulence"
        baseFrequency={settings.baseFrequency}
        numOctaves={settings.numOctaves}
        result="noise4"
        seed={seed4}
      />
      <feOffset in="noise4" dx="0" dy="0" result="offsetNoise4">
        <animate
          attributeName="dx"
          values={`0; -200; 0; 200; 0`}
          dur={`${settings.duration * durationMultiplier * 0.7}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
        <animate
          attributeName="dy"
          values={`0; -200; 0; 200; 0`}
          dur={`${settings.duration * durationMultiplier * 0.7}s`}
          repeatCount="indefinite"
          calcMode="ease-in-out"
        />
      </feOffset>

      <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
      <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
      <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="combinedNoise"
        scale={settings.scale}
        xChannelSelector="R"
        yChannelSelector="B"
      />
    </filter>
    );

    return [
      createTurbulenceFilter(filter1Id.current, 1, 3, 5, 7, 1.0),
      createTurbulenceFilter(filter2Id.current, 11, 13, 17, 19, 0.9),
      createTurbulenceFilter(filter3Id.current, 23, 29, 31, 37, 1.1),
      createTurbulenceFilter(filter4Id.current, 41, 43, 47, 53, 0.8)
    ];
  }, [settings, filter1Id, filter2Id, filter3Id, filter4Id]);

  return (
    <>
      {/* SVG Filters with animated turbulence - 4 independent filters */}
      <svg className="absolute w-0 h-0 pointer-events-none">
        <defs>
          {filters}
        </defs>
      </svg>

      {/* Layer 4 - Outermost glow with strongest blur (no turbulence) */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `3px solid ${color}`,
          filter: `blur(${settings.blur3}px)`,
          opacity: 0.3,
          willChange: 'filter, opacity',
          transform: 'translateZ(0)',
        }}
      />

      {/* Layer 3 - Medium glow (no turbulence) */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `2.5px solid ${color}`,
          filter: `blur(${settings.blur2}px)`,
          opacity: 0.4,
          willChange: 'filter, opacity',
          transform: 'translateZ(0)',
        }}
      />

      {/* Layer 2 - Subtle glow with light turbulence */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `2px solid ${color}`,
          filter: `url(#${filter2Id.current})`,
          opacity: 0.5,
          willChange: 'filter',
          transform: 'translateZ(0)',
        }}
      />

      {/* Layer 1 - Main electric border with turbulence */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `2px solid ${color}`,
          filter: `url(#${filter1Id.current})`,
          opacity: 1,
          willChange: 'filter',
          transform: 'translateZ(0)',
        }}
      />

      {/* Overlay effects for shimmer */}
      <div
        className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none"
        style={{
          background: 'linear-gradient(-30deg, white, transparent 30%, transparent 70%, white)',
          mixBlendMode: 'overlay',
          transform: 'scale(1.02) translateZ(0)',
          filter: 'blur(12px)',
          opacity: 0.1,
          willChange: 'transform',
        }}
      />

      {/* Background gradient glow */}
      <div
        className="absolute inset-0 rounded-lg -z-10 pointer-events-none"
        style={{
          background: `linear-gradient(-30deg, ${gradientColor}, transparent, ${gradientColor})`,
          filter: 'blur(24px)',
          transform: 'scale(1.08) translateZ(0)',
          opacity: 0.2,
          willChange: 'transform',
        }}
      />
    </>
  );
});

export default ElectricBorder;
