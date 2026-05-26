/**
 * Client-side notification triggers
 * Uses countdown timers (like the dashboard displays) to trigger notifications at exact thresholds
 * More accurate than polling API status - no delays from caching or polling intervals
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { swrFetcher } from '@/lib/fetch-utils'
import { useNotifications } from '@/contexts/NotificationContext'
import { showBossSpawnNotification, showEventNotification } from '@/lib/notifications'
import { ALL_EVENTS } from '@/data/eventSchedules'
import { calculateNextOccurrence } from '@/lib/event-utils'
import type { BossTimersResponse } from '@/types/api'

interface BossNotificationState {
  nextSpawnTime: number
  soonNotified: boolean
  spawnedNotified: boolean
}

interface EventState {
  [eventName: string]: 'active' | 'inactive'
}

export interface NotificationMonitoringStatus {
  isMonitoring: boolean
  bossCount: number
  bossStates: { [bossName: string]: string }
  lastUpdate: number | null
}

const THIRTY_MINUTES = 30 * 60 * 1000
const NOTIFICATION_WINDOW = 2000 // 2 second window to trigger notification

/**
 * Hook that monitors boss and event countdowns and triggers notifications at exact thresholds
 */
export function useNotificationTriggers(): NotificationMonitoringStatus {
  const { isEnabled, settings, permission } = useNotifications()
  const [currentTime, setCurrentTime] = useState(Date.now())
  const bossStatesRef = useRef<Map<string, BossNotificationState>>(new Map())
  const previousEventStates = useRef<EventState>({})

  // Fetch boss data once, then refresh every 5 minutes (only to catch manual updates)
  // Always fetch so data is ready when notifications are enabled
  const { data: bossData } = useSWR<BossTimersResponse>(
    '/api/bosses',
    swrFetcher,
    { refreshInterval: 5 * 60 * 1000 } // 5 minutes instead of 10 seconds
  )

  // Update current time every second (like dashboard countdown timers)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Initialize/update boss states when data changes
  useEffect(() => {
    if (!bossData?.bosses) return

    bossData.bosses.forEach((boss) => {
      if (!boss.nextSpawnTime) return

      const nextSpawnTime = new Date(boss.nextSpawnTime).getTime()
      const existing = bossStatesRef.current.get(boss.bossName)

      // If spawn time changed (boss was killed/respawned), reset notification flags
      if (!existing || existing.nextSpawnTime !== nextSpawnTime) {
        bossStatesRef.current.set(boss.bossName, {
          nextSpawnTime,
          soonNotified: false,
          spawnedNotified: false,
        })
      }
    })
  }, [bossData])

  // Check countdown thresholds every second
  useEffect(() => {
    if (!isEnabled || permission !== 'granted' || !bossData?.bosses) return

    bossStatesRef.current.forEach((state, bossName) => {
      const timeRemaining = state.nextSpawnTime - currentTime

      // Boss spawned notification (at 0 minutes, with 2 second window)
      if (
        settings.bossSpawns &&
        !state.spawnedNotified &&
        timeRemaining <= 0 &&
        timeRemaining > -NOTIFICATION_WINDOW
      ) {
        playNotificationSound()
        showBossSpawnNotification(bossName)
        state.spawnedNotified = true
      }

      // Boss soon notification (at 30 minutes, with 2 second window)
      if (
        settings.bossSoon &&
        !state.soonNotified &&
        timeRemaining <= THIRTY_MINUTES &&
        timeRemaining > THIRTY_MINUTES - NOTIFICATION_WINDOW
      ) {
        playNotificationSound()
        showBossSpawnNotification(bossName, timeRemaining)
        state.soonNotified = true
      }
    })
  }, [currentTime, isEnabled, settings, permission, bossData])

  // Check for event state changes (every 10 seconds)
  useEffect(() => {
    if (!isEnabled || permission !== 'granted' || !settings.events) return

    const checkEvents = () => {
      const now = Date.now()

      ALL_EVENTS.forEach((event) => {
        const nextOcc = calculateNextOccurrence(event, now)
        const timeUntil = nextOcc.getTime() - now
        const eventEndTime = nextOcc.getTime() + event.durationMinutes * 60 * 1000
        const isActive = timeUntil < 0 && now < eventEndTime
        const previousState = previousEventStates.current[event.name]
        const currentState = isActive ? 'active' : 'inactive'

        // Detect event became active (state change from inactive to active)
        if (isActive && previousState === 'inactive') {
          // Play notification sound
          playNotificationSound()

          // Show notification
          showEventNotification(event.name)
        }

        // Update previous state
        previousEventStates.current[event.name] = currentState
      })
    }

    // Check immediately
    checkEvents()

    // Then check every 10 seconds
    const interval = setInterval(checkEvents, 10000)

    return () => clearInterval(interval)
  }, [isEnabled, settings.events, permission])

  // Return monitoring status for diagnostics
  const bossStates: { [bossName: string]: string } = {}
  bossStatesRef.current.forEach((state, bossName) => {
    const timeRemaining = state.nextSpawnTime - currentTime
    if (timeRemaining <= 0) {
      bossStates[bossName] = 'spawned'
    } else if (timeRemaining <= THIRTY_MINUTES) {
      bossStates[bossName] = 'soon'
    } else {
      bossStates[bossName] = 'ready'
    }
  })

  return {
    isMonitoring: isEnabled && permission === 'granted',
    bossCount: bossStatesRef.current.size,
    bossStates,
    lastUpdate: bossData ? Date.now() : null,
  }
}

/**
 * Play notification sound
 */
function playNotificationSound() {
  try {
    // Create a simple notification beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800 // Higher pitch for attention
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  } catch (error) {
    console.warn('Could not play notification sound:', error)
  }
}
