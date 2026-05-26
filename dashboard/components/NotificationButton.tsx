/**
 * Notification Button - Toggle browser notifications with settings dropdown
 */

'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNotifications } from '@/contexts/NotificationContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Icon } from './icons'
import Tooltip from './Tooltip'

export default function NotificationButton() {
  const { isSupported, permission, isEnabled, settings, toggleNotifications, updateSettings } =
    useNotifications()
  const { themes, currentTheme } = useTheme()
  const theme = themes[currentTheme]
  const [showSettings, setShowSettings] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number; isMobile: boolean } | null>(null)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Track component mount for SSR compatibility
  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate dropdown position when opened - use layout effect to avoid flicker
  useLayoutEffect(() => {
    if (showSettings && buttonRef.current && typeof window !== 'undefined') {
      const rect = buttonRef.current.getBoundingClientRect()
      const isMobile = window.innerWidth < 640 // sm breakpoint
      const dropdownWidth = isMobile ? window.innerWidth - 32 : 320 // Account for w-[calc(100vw-2rem)] or sm:w-80

      if (isMobile) {
        // On mobile, position with margin to keep within viewport
        setPosition({
          top: rect.bottom + 8,
          right: 0,
          isMobile: true,
        })
      } else {
        // On desktop, ensure dropdown doesn't go off-screen
        const rightEdge = window.innerWidth - rect.right
        const maxRight = Math.max(16, Math.min(rightEdge, window.innerWidth - dropdownWidth - 16))

        setPosition({
          top: rect.bottom + 8,
          right: maxRight,
          isMobile: false,
        })
      }
    } else if (!showSettings) {
      // Reset position when closed
      setPosition(null)
    }
  }, [showSettings])

  // Don't render if not supported (check after all hooks)
  if (!isSupported) {
    return null
  }

  // Calculate how many notification types are enabled
  const enabledCount = isEnabled
    ? [settings.bossSpawns, settings.bossSoon, settings.events].filter(Boolean).length
    : 0

  // Check if all settings are enabled or disabled
  const allEnabled = settings.bossSpawns && settings.bossSoon && settings.events
  const allDisabled = !settings.bossSpawns && !settings.bossSoon && !settings.events

  const handleButtonClick = async () => {
    if (permission === 'denied') {
      alert(
        'Notifications are blocked. Please enable them in your browser settings:\n\n' +
          '1. Click the lock icon in the address bar\n' +
          '2. Find "Notifications" and change to "Allow"\n' +
          '3. Refresh the page'
      )
      return
    }

    // Request permission if not granted
    if (permission === 'default') {
      await toggleNotifications(true)
    }

    // Always show dropdown when clicking
    setShowSettings(!showSettings)
  }

  const handleToggleAll = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (allEnabled) {
      // Disable all
      updateSettings({
        bossSpawns: false,
        bossSoon: false,
        events: false,
      })
      toggleNotifications(false)
    } else {
      // Enable all
      updateSettings({
        bossSpawns: true,
        bossSoon: true,
        events: true,
      })
      toggleNotifications(true)
    }
  }

  const getTooltipText = () => {
    if (permission === 'denied') return 'Notifications blocked - check browser settings'
    if (!isEnabled || enabledCount === 0) return 'Enable notifications for bosses & events'
    if (enabledCount === 1) return '1 notification type enabled - click to configure'
    if (enabledCount === 2) return '2 notification types enabled - click to configure'
    return 'All notifications enabled - click to configure'
  }

  const getIconName = (): 'bell' | 'bell-off' | 'bell-on' => {
    if (permission === 'denied') return 'bell-off'
    if (!isEnabled || enabledCount === 0) return 'bell'
    return 'bell-on'
  }

  // Get glow intensity based on enabled count
  const getGlowIntensity = () => {
    if (!isEnabled || enabledCount === 0) return 'opacity-50'
    if (enabledCount === 1) return 'opacity-70'
    if (enabledCount === 2) return 'opacity-90'
    return 'opacity-100'
  }

  return (
    <>
      <Tooltip content={getTooltipText()} position="bottom">
        <button
          ref={buttonRef}
          onClick={handleButtonClick}
          className={`
            p-2 rounded-md transition-all duration-200 relative
            ${
              enabledCount > 0
                ? 'text-primary hover:text-primary-light bg-primary/10 hover:bg-primary/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }
            ${permission === 'denied' ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          aria-label={enabledCount > 0 ? 'Configure notifications' : 'Enable notifications'}
          aria-expanded={showSettings}
          aria-haspopup="menu"
        >
          <Icon
            name={getIconName()}
            size="md"
            className={`${getGlowIntensity()} ${enabledCount > 0 && !showSettings ? 'animate-pulse' : ''}`}
            style={{
              filter:
                enabledCount > 0 && !showSettings
                  ? `drop-shadow(0 0 ${2 * enabledCount}px ${theme.colors.primary}) drop-shadow(0 0 ${4 * enabledCount}px ${theme.colors.primary})`
                  : 'none',
            }}
          />
        </button>
      </Tooltip>

      {/* Settings Dropdown Portal */}
      {mounted && showSettings && position && permission !== 'denied' && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex: 999999 }}
            onClick={() => setShowSettings(false)}
          />

          {/* Dropdown Menu - Responsive positioning */}
          <div
            className="fixed w-[calc(100vw-2rem)] sm:w-80 max-w-md rounded-lg glass-strong shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              top: `${position.top}px`,
              left: position.isMobile ? '1rem' : 'auto',
              right: position.isMobile ? '1rem' : `${position.right}px`,
              zIndex: 1000000,
              borderColor: `${theme.colors.primary}33`,
              backgroundColor: '#1f2937f0',
            }}
            role="menu"
            aria-label="Notification settings"
          >
            {/* Header */}
            <div className="p-3 border-b border-gray-700">
              <div className="flex items-center justify-between gap-2">
                <div className="text-white font-semibold font-game text-sm sm:text-base">
                  Notification Settings
                </div>
                <button
                  onClick={handleToggleAll}
                  className={`text-xs transition-colors whitespace-nowrap ${
                    allEnabled
                      ? 'text-danger hover:text-danger-light'
                      : 'text-success hover:text-success-light'
                  }`}
                >
                  {allEnabled ? 'Disable All' : 'Enable All'}
                </button>
              </div>
            </div>

            {/* Toggle Switches */}
            <div className="p-4 space-y-3">
              {/* Boss Spawned */}
              <ToggleSwitch
                label="Boss Spawned"
                description="When a boss spawns"
                checked={settings.bossSpawns}
                onChange={(checked) => updateSettings({ bossSpawns: checked })}
                theme={theme}
              />

              {/* Boss Soon */}
              <ToggleSwitch
                label="Boss Soon"
                description="Boss spawning within 30 min"
                checked={settings.bossSoon}
                onChange={(checked) => updateSettings({ bossSoon: checked })}
                theme={theme}
              />

              {/* Events */}
              <ToggleSwitch
                label="Events"
                description="Event starting or active"
                checked={settings.events}
                onChange={(checked) => updateSettings({ events: checked })}
                theme={theme}
              />
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

// Theme-aware Toggle Switch Component
interface ToggleSwitchProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  theme: any
}

function ToggleSwitch({ label, description, checked, onChange, theme }: ToggleSwitchProps) {
  const handleToggle = () => {
    onChange(!checked)
  }

  return (
    <div className="flex items-center justify-between group">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white group-hover:text-primary transition-colors font-game">
          {label}
        </div>
        <div className="text-xs text-gray-400 break-words">{description}</div>
      </div>

      {/* Toggle Switch */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label}`}
        onClick={handleToggle}
        className="relative ml-3 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 rounded-full transition-all duration-200"
        style={{
          width: '44px',
          height: '24px',
          backgroundColor: checked ? theme.colors.primary : '#4B5563',
          boxShadow: checked ? `0 0 10px ${theme.colors.primary}66` : 'none',
          outlineColor: theme.colors.primary,
        }}
      >
        <span
          className="absolute left-0.5 top-0.5 bg-white rounded-full transition-transform duration-200 ease-in-out"
          style={{
            width: '20px',
            height: '20px',
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        />
      </button>
    </div>
  )
}
