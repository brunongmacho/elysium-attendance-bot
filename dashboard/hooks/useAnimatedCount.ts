/**
 * useAnimatedCount Hook
 * Provides smooth number counting animations
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useVisualEffects } from '@/contexts/VisualEffectsContext'

export interface UseAnimatedCountOptions {
  /**
   * Duration of animation in milliseconds
   * @default 1000
   */
  duration?: number

  /**
   * Decimal places to show
   * @default 0
   */
  decimals?: number

  /**
   * Easing function
   * @default 'easeOutExpo'
   */
  easing?: 'linear' | 'easeOutExpo' | 'easeOutCubic' | 'easeInOutQuad'

  /**
   * Whether to start animation on mount
   * @default true
   */
  autoStart?: boolean

  /**
   * Custom formatting function
   */
  formatter?: (value: number) => string

  /**
   * Callback when animation completes
   */
  onComplete?: () => void
}

/**
 * Easing functions for animations
 */
const easingFunctions = {
  linear: (t: number) => t,
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
}

/**
 * Hook for animated number counting
 */
export function useAnimatedCount(
  end: number,
  options: UseAnimatedCountOptions = {}
): {
  value: number
  formattedValue: string
  start: () => void
  reset: () => void
  isAnimating: boolean
} {
  const {
    duration = 1000,
    decimals = 0,
    easing = 'easeOutExpo',
    autoStart = true,
    formatter,
    onComplete,
  } = options

  const { animationsEnabled } = useVisualEffects()
  const [value, setValue] = useState(autoStart ? 0 : end)
  const [isAnimating, setIsAnimating] = useState(false)
  const startTimeRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  /**
   * Format number with decimals
   */
  const formatValue = (val: number): string => {
    if (formatter) {
      return formatter(val)
    }
    return val.toFixed(decimals)
  }

  /**
   * Animation loop
   */
  const animate = (timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp
    }

    const elapsed = timestamp - startTimeRef.current
    const progress = Math.min(elapsed / duration, 1)

    // Apply easing
    const easingFn = easingFunctions[easing]
    const easedProgress = easingFn(progress)

    // Calculate current value
    const currentValue = end * easedProgress

    setValue(currentValue)

    if (progress < 1) {
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      setValue(end)
      setIsAnimating(false)
      startTimeRef.current = null
      onComplete?.()
    }
  }

  /**
   * Start animation
   */
  const start = () => {
    // Skip animation if animations are disabled
    if (!animationsEnabled) {
      setValue(end)
      setIsAnimating(false)
      return
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setValue(0)
    startTimeRef.current = null
    setIsAnimating(true)
    animationFrameRef.current = requestAnimationFrame(animate)
  }

  /**
   * Reset to end value
   */
  const reset = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setValue(end)
    setIsAnimating(false)
    startTimeRef.current = null
  }

  // Auto-start on mount or when end changes
  useEffect(() => {
    if (autoStart) {
      start()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, autoStart, animationsEnabled])

  return {
    value,
    formattedValue: formatValue(value),
    start,
    reset,
    isAnimating,
  }
}
