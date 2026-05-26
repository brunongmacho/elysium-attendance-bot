"use client";

import { useEffect, useRef, useState, memo } from "react";
import { useVisualEffects } from "@/contexts/VisualEffectsContext";

interface AnimatedCounterProps {
  value: number;
  duration?: number; // milliseconds
  className?: string;
}

const AnimatedCounter = memo(function AnimatedCounter({
  value,
  duration = 1000,
  className = "",
}: AnimatedCounterProps) {
  const { animationsEnabled } = useVisualEffects();
  const [count, setCount] = useState(animationsEnabled ? 0 : value);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Create and manage IntersectionObserver
  useEffect(() => {
    // Skip animation if animations are disabled
    if (!animationsEnabled) {
      setCount(value);
      setHasAnimated(true);
      return;
    }

    // Only create observer if we haven't animated yet
    if (hasAnimated) {
      setCount(value);
      return;
    }

    // Create observer only once
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            setHasAnimated(true);

            const startTime = Date.now();
            const startValue = 0;
            const endValue = value;

            const animate = () => {
              const now = Date.now();
              const progress = Math.min((now - startTime) / duration, 1);

              // Ease out cubic
              const easeOut = 1 - Math.pow(1 - progress, 3);
              const currentCount = Math.floor(startValue + (endValue - startValue) * easeOut);

              setCount(currentCount);

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                setCount(endValue);
              }
            };

            requestAnimationFrame(animate);
          }
        },
        { threshold: 0.1 }
      );
    }

    if (elementRef.current && observerRef.current) {
      observerRef.current.observe(elementRef.current);
    }

    return () => {
      if (observerRef.current && elementRef.current) {
        observerRef.current.unobserve(elementRef.current);
      }
    };
  }, [value, duration, hasAnimated, animationsEnabled]);

  // Update count immediately if value changes after initial animation
  useEffect(() => {
    if (hasAnimated) {
      setCount(value);
    }
  }, [value, hasAnimated]);

  return (
    <span ref={elementRef} className={className}>
      {count}
    </span>
  );
});

export default AnimatedCounter;
