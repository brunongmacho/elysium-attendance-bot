/**
 * BossSpawnParticles Component
 * Particle effect triggered when a boss spawns
 */

'use client'

import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

export interface BossSpawnParticlesProps {
  /**
   * Trigger the particle effect
   */
  trigger: boolean

  /**
   * Boss status
   */
  status: 'spawned' | 'soon' | 'ready' | 'unknown'

  /**
   * Primary color for particles
   */
  primaryColor?: string

  /**
   * Secondary color for particles
   */
  secondaryColor?: string
}

export function BossSpawnParticles({
  trigger,
  status,
  primaryColor = '#dc2626',
  secondaryColor = '#f97316',
}: BossSpawnParticlesProps) {
  const previousStatus = useRef<string>(status)

  useEffect(() => {
    // Check if boss just spawned (transition to 'spawned' state)
    const justSpawned = previousStatus.current !== 'spawned' && status === 'spawned'

    if (trigger && justSpawned) {
      // Create particle burst effect
      const count = 150
      const defaults = {
        origin: { y: 0.7 },
        zIndex: 9999,
      }

      const fire = (particleRatio: number, opts: confetti.Options) => {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
          colors: [primaryColor, secondaryColor, '#fbbf24', '#ffffff'],
        })
      }

      // Multi-burst effect
      fire(0.25, {
        spread: 26,
        startVelocity: 55,
      })

      fire(0.2, {
        spread: 60,
      })

      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      })

      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      })

      fire(0.1, {
        spread: 120,
        startVelocity: 45,
      })
    }

    previousStatus.current = status
  }, [trigger, status, primaryColor, secondaryColor])

  return null
}
