"use client";

import { useRef, useEffect, useMemo, memo } from "react";

interface GlowBorderProps {
  intensity: 'low' | 'medium' | 'high' | 'extreme';
  color: string;
}

/**
 * GlowBorder - Traditional CSS glow effect
 * Alternative to ElectricBorder for users who prefer classic glow
 * Glow that intensifies based on proximity with consistent pulse frequency
 */
const GlowBorder = memo(function GlowBorder({ intensity, color }: GlowBorderProps) {
  const animationId = useRef(`glow-${Math.random().toString(36).substr(2, 9)}`);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Map intensity to glow size - all use same animation duration
  const settings = useMemo(() => ({
    low: { blur: 8, spread: 2, opacity: 0.4, borderWidth: 2 },
    medium: { blur: 16, spread: 4, opacity: 0.6, borderWidth: 2.5 },
    high: { blur: 24, spread: 6, opacity: 0.8, borderWidth: 3 },
    extreme: { blur: 32, spread: 8, opacity: 1, borderWidth: 3.5 },
  }[intensity]), [intensity]);

  // Consistent duration across all intensities
  const duration = 4;

  // Memoized keyframes generation
  const keyframes = useMemo(() => `
      @keyframes ${animationId.current} {
        0% {
          box-shadow:
            0 0 ${settings.blur}px ${settings.spread}px ${color}${Math.round(settings.opacity * 0.5 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.5}px ${settings.spread * 0.5}px ${color}${Math.round(settings.opacity * 0.35 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.5}px ${color}${Math.round(settings.opacity * 0.15 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.7 * 255).toString(16).padStart(2, '0')};
        }
        12.5% {
          box-shadow:
            0 0 ${settings.blur * 1.05}px ${settings.spread * 1.05}px ${color}${Math.round(settings.opacity * 0.55 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.575}px ${settings.spread * 0.575}px ${color}${Math.round(settings.opacity * 0.3875 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.55}px ${color}${Math.round(settings.opacity * 0.175 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.75 * 255).toString(16).padStart(2, '0')};
        }
        25% {
          box-shadow:
            0 0 ${settings.blur * 1.1}px ${settings.spread * 1.1}px ${color}${Math.round(settings.opacity * 0.6 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.65}px ${settings.spread * 0.65}px ${color}${Math.round(settings.opacity * 0.425 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.6}px ${color}${Math.round(settings.opacity * 0.2 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.8 * 255).toString(16).padStart(2, '0')};
        }
        37.5% {
          box-shadow:
            0 0 ${settings.blur * 1.15}px ${settings.spread * 1.15}px ${color}${Math.round(settings.opacity * 0.65 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.725}px ${settings.spread * 0.725}px ${color}${Math.round(settings.opacity * 0.4625 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.65}px ${color}${Math.round(settings.opacity * 0.225 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.85 * 255).toString(16).padStart(2, '0')};
        }
        50% {
          box-shadow:
            0 0 ${settings.blur * 1.2}px ${settings.spread * 1.2}px ${color}${Math.round(settings.opacity * 0.7 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.8}px ${settings.spread * 0.8}px ${color}${Math.round(settings.opacity * 0.5 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.7}px ${color}${Math.round(settings.opacity * 0.25 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.9 * 255).toString(16).padStart(2, '0')};
        }
        62.5% {
          box-shadow:
            0 0 ${settings.blur * 1.15}px ${settings.spread * 1.15}px ${color}${Math.round(settings.opacity * 0.65 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.725}px ${settings.spread * 0.725}px ${color}${Math.round(settings.opacity * 0.4625 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.65}px ${color}${Math.round(settings.opacity * 0.225 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.85 * 255).toString(16).padStart(2, '0')};
        }
        75% {
          box-shadow:
            0 0 ${settings.blur * 1.1}px ${settings.spread * 1.1}px ${color}${Math.round(settings.opacity * 0.6 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.65}px ${settings.spread * 0.65}px ${color}${Math.round(settings.opacity * 0.425 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.6}px ${color}${Math.round(settings.opacity * 0.2 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.8 * 255).toString(16).padStart(2, '0')};
        }
        87.5% {
          box-shadow:
            0 0 ${settings.blur * 1.05}px ${settings.spread * 1.05}px ${color}${Math.round(settings.opacity * 0.55 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.575}px ${settings.spread * 0.575}px ${color}${Math.round(settings.opacity * 0.3875 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.55}px ${color}${Math.round(settings.opacity * 0.175 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.75 * 255).toString(16).padStart(2, '0')};
        }
        100% {
          box-shadow:
            0 0 ${settings.blur}px ${settings.spread}px ${color}${Math.round(settings.opacity * 0.5 * 255).toString(16).padStart(2, '0')},
            0 0 ${settings.blur * 1.5}px ${settings.spread * 0.5}px ${color}${Math.round(settings.opacity * 0.35 * 255).toString(16).padStart(2, '0')},
            inset 0 0 ${settings.blur * 0.5}px ${color}${Math.round(settings.opacity * 0.15 * 255).toString(16).padStart(2, '0')};
          border-color: ${color}${Math.round(settings.opacity * 0.7 * 255).toString(16).padStart(2, '0')};
        }
      }
    `, [color, settings.blur, settings.spread, settings.opacity, animationId]);

  useEffect(() => {
    // Inject the style into the document
    const style = document.createElement('style');
    style.textContent = keyframes;
    document.head.appendChild(style);
    styleRef.current = style;

    // Cleanup on unmount or when keyframes change
    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
      }
    };
  }, [keyframes]);

  return (
    <>
      {/* Main glow border - subtle consistent pulse */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `${settings.borderWidth}px solid ${color}`,
          animation: `${animationId.current} ${duration}s ease-in-out infinite`,
          willChange: 'box-shadow, border-color',
          transform: 'translateZ(0)',
        }}
      />

      {/* Background gradient glow */}
      <div
        className="absolute inset-0 rounded-lg -z-10 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${color}15, transparent 70%)`,
          filter: 'blur(16px)',
          transform: 'scale(1.05) translateZ(0)',
          opacity: settings.opacity * 0.3,
          willChange: 'opacity',
        }}
      />
    </>
  );
});

export default GlowBorder;
