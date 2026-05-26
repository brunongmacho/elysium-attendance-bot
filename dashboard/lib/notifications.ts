/**
 * Browser Notification Utilities
 * Handles push notifications for boss spawns and events
 */

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported'

/**
 * Check if notifications are supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (!isNotificationSupported()) {
    return 'unsupported'
  }
  return Notification.permission as NotificationPermissionStatus
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNotificationSupported()) {
    return 'unsupported'
  }

  try {
    const permission = await Notification.requestPermission()
    return permission as NotificationPermissionStatus
  } catch (error) {
    console.error('Error requesting notification permission:', error)
    return 'denied'
  }
}

/**
 * Show a notification
 */
export function showNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null
  }

  try {
    return new Notification(title, {
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      ...options,
    })
  } catch (error) {
    console.error('Error showing notification:', error)
    return null
  }
}

/**
 * Show a boss spawn notification
 */
export function showBossSpawnNotification(bossName: string, timeRemaining?: number): void {
  const options: NotificationOptions = {
    body: timeRemaining
      ? `${bossName} will spawn in ${formatTimeForNotification(timeRemaining)}`
      : `${bossName} has spawned!`,
    icon: `/bosses/${bossName.toLowerCase().replace(/\s+/g, '-')}.png`,
    badge: '/icon-96x96.png',
    tag: `boss-${bossName}`,
    requireInteraction: false,
  }

  const notification = showNotification(`🔥 ${bossName}`, options)

  if (notification) {
    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000)

    // Click to focus window
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }
}

/**
 * Show an event notification
 */
export function showEventNotification(eventName: string, timeRemaining?: number): void {
  const options: NotificationOptions = {
    body: timeRemaining
      ? `${eventName} starts in ${formatTimeForNotification(timeRemaining)}`
      : `${eventName} is now active!`,
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: `event-${eventName}`,
    requireInteraction: false,
  }

  const notification = showNotification(`📅 ${eventName}`, options)

  if (notification) {
    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000)

    // Click to focus window
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }
}

/**
 * Format time remaining for notifications
 */
function formatTimeForNotification(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  return `${minutes}m`
}

/**
 * Check if notifications are enabled in localStorage
 */
export function areNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('notifications-enabled') === 'true'
}

/**
 * Set notification preference
 */
export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('notifications-enabled', enabled.toString())
}

/**
 * Get notification settings
 */
export interface NotificationSettings {
  bossSpawns: boolean
  bossSoon: boolean // Boss spawning within 30 min
  events: boolean
}

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') {
    return { bossSpawns: true, bossSoon: true, events: true }
  }

  const stored = localStorage.getItem('notification-settings')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      // Invalid JSON, use defaults
    }
  }

  return { bossSpawns: true, bossSoon: true, events: true }
}

/**
 * Save notification settings
 */
export function saveNotificationSettings(settings: NotificationSettings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('notification-settings', JSON.stringify(settings))
}
