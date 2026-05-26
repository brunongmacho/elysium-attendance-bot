/**
 * BackgroundParticles Component
 * Theme-aware animated particle background
 */

'use client'

import { useMemo, useState, useEffect, memo } from 'react'
import Particles from '@tsparticles/react'
import type { ISourceOptions } from '@tsparticles/engine'
import { useTheme } from '@/contexts/ThemeContext'

export interface BackgroundParticlesProps {
  /**
   * Particle density (number of particles)
   * @default 50
   */
  density?: number

  /**
   * Particle speed
   * @default 1
   */
  speed?: number

  /**
   * Enable links between particles
   * @default true
   */
  enableLinks?: boolean

  /**
   * Opacity of particles
   * @default 0.5
   */
  opacity?: number

  /**
   * Custom z-index
   * @default -1
   */
  zIndex?: number
}

export const BackgroundParticles = memo(function BackgroundParticles({
  density = 50,
  speed = 1,
  enableLinks = true,
  opacity = 0.5,
  zIndex = -1,
}: BackgroundParticlesProps) {
  const { currentTheme, themes } = useTheme()
  const theme = themes[currentTheme]
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile devices for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  /**
   * Particle configuration based on current theme and device
   */
  const particlesOptions = useMemo<ISourceOptions>(() => {
    // Get theme colors
    const primaryColor = theme.colors.primary
    const accentColor = theme.colors.accent

    // Reduce particle count and effects on mobile for better performance
    const mobileDensity = Math.floor(density / 3) // 1/3 particles on mobile
    const mobileSpeed = speed * 0.5 // Slower movement
    const mobileFpsLimit = 30 // Lower FPS on mobile

    return {
      background: {
        opacity: 0, // Transparent background
      },
      fpsLimit: isMobile ? mobileFpsLimit : 60,
      particles: {
        number: {
          value: isMobile ? mobileDensity : density,
          density: {
            enable: true,
            width: 1920,
            height: 1080,
          },
        },
        color: {
          value: [primaryColor, accentColor],
        },
        shape: {
          type: 'circle',
        },
        opacity: {
          value: opacity,
          random: {
            enable: true,
            minimumValue: 0.1,
          },
          animation: {
            enable: true,
            speed: 0.5,
            minimumValue: 0.1,
            sync: false,
          },
        },
        size: {
          value: { min: 1, max: 3 },
          random: {
            enable: true,
            minimumValue: 1,
          },
          animation: {
            enable: true,
            speed: 2,
            minimumValue: 0.5,
            sync: false,
          },
        },
        links: enableLinks && !isMobile
          ? {
              enable: true,
              color: primaryColor,
              distance: 150,
              opacity: 0.2,
              width: 1,
            }
          : {
              enable: false,
            },
        move: {
          enable: true,
          speed: isMobile ? mobileSpeed : speed,
          direction: 'none',
          random: true,
          straight: false,
          outModes: {
            default: 'out',
          },
          attract: {
            enable: false,
          },
        },
      },
      interactivity: {
        detectsOn: 'window',
        events: {
          onHover: {
            enable: !isMobile, // Disable hover effects on mobile
            mode: 'grab',
          },
          resize: {
            enable: true,
            delay: 0.5,
          },
        },
        modes: {
          grab: {
            distance: 140,
            links: {
              opacity: 0.3,
            },
          },
        },
      },
      detectRetina: true,
    }
  }, [theme, density, speed, enableLinks, opacity, isMobile])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex,
        pointerEvents: 'none',
      }}
    >
      <Particles
        id="background-particles"
        options={particlesOptions}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  )
})
