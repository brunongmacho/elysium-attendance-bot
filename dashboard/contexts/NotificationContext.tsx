/**
 * Notification Context - Browser push notifications
 * Integrates with SSE to show notifications for boss spawns and events
 */

'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  areNotificationsEnabled,
  setNotificationsEnabled,
  showBossSpawnNotification,
  showEventNotification,
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationPermissionStatus,
  type NotificationSettings,
} from '@/lib/notifications'
import { useSSE, useBossSpawned, useBossSoon, useSSEEvent } from './SSEContext'
import type { BossSpawnedData, BossSoonData, EventActiveData, EventSoonData } from '@/types/sse'

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface NotificationContextValue {
  isSupported: boolean
  permission: NotificationPermissionStatus
  isEnabled: boolean
  settings: NotificationSettings
  requestPermission: () => Promise<NotificationPermissionStatus>
  toggleNotifications: (enabled: boolean) => void
  updateSettings: (settings: Partial<NotificationSettings>) => void
}

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationContext = createContext<NotificationContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface NotificationProviderProps {
  children: React.ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermissionStatus>('default')
  const [isEnabled, setIsEnabled] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>({
    bossSpawns: true,
    bossSoon: true,
    events: true,
  })

  // Initialize notification state
  useEffect(() => {
    setIsSupported(isNotificationSupported())
    setPermission(getNotificationPermission())
    setIsEnabled(areNotificationsEnabled())
    setSettings(getNotificationSettings())
  }, [])

  // Handle boss spawned events
  const handleBossSpawned = useCallback(
    (data: BossSpawnedData) => {
      if (!isEnabled || !settings.bossSpawns || permission !== 'granted') return

      showBossSpawnNotification(data.bossName)
    },
    [isEnabled, settings.bossSpawns, permission]
  )

  // Handle boss soon events (< 30 min)
  const handleBossSoon = useCallback(
    (data: BossSoonData) => {
      if (!isEnabled || !settings.bossSoon || permission !== 'granted') return

      showBossSpawnNotification(data.bossName, data.timeRemaining)
    },
    [isEnabled, settings.bossSoon, permission]
  )

  // Handle event active notifications
  const handleEventActive = useCallback(
    (data: EventActiveData) => {
      if (!isEnabled || !settings.events || permission !== 'granted') return

      showEventNotification(data.eventName)
    },
    [isEnabled, settings.events, permission]
  )

  // Handle event soon notifications (< 15 min)
  const handleEventSoon = useCallback(
    (data: EventSoonData) => {
      if (!isEnabled || !settings.events || permission !== 'granted') return

      showEventNotification(data.eventName, data.timeRemaining)
    },
    [isEnabled, settings.events, permission]
  )

  // Subscribe to SSE events
  useBossSpawned(handleBossSpawned, [isEnabled, settings.bossSpawns, permission])
  useBossSoon(handleBossSoon, [isEnabled, settings.bossSoon, permission])
  useSSEEvent('event:active', handleEventActive, [isEnabled, settings.events, permission])
  useSSEEvent('event:soon', handleEventSoon, [isEnabled, settings.events, permission])

  // Request permission
  const handleRequestPermission = useCallback(async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      setIsEnabled(true)
      setNotificationsEnabled(true)
    }
    return result
  }, [])

  // Toggle notifications
  const toggleNotifications = useCallback(
    (enabled: boolean) => {
      setIsEnabled(enabled)
      setNotificationsEnabled(enabled)

      // If enabling and no permission, request it
      if (enabled && permission !== 'granted') {
        handleRequestPermission()
      }
    },
    [permission, handleRequestPermission]
  )

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings }
      saveNotificationSettings(updated)

      // If any setting is enabled, ensure notifications are globally enabled
      const anyEnabled = updated.bossSpawns || updated.bossSoon || updated.events
      if (anyEnabled && !isEnabled) {
        setIsEnabled(true)
        setNotificationsEnabled(true)
      }

      return updated
    })
  }, [isEnabled])

  const value: NotificationContextValue = {
    isSupported,
    permission,
    isEnabled,
    settings,
    requestPermission: handleRequestPermission,
    toggleNotifications,
    updateSettings,
  }

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

// ============================================================================
// HOOK
// ============================================================================

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}
