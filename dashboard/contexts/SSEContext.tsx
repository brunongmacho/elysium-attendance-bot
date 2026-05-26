/**
 * SSE Context - Real-time event streaming
 * Manages Server-Sent Events connection for live updates
 */

'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type {
  SSEEventType,
  SSEEvent,
  SSEClientState,
  BossKilledData,
  BossSpawnedData,
  BossSoonData,
  BossUpdatedData,
} from '@/types/sse'

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface SSEContextValue {
  state: SSEClientState
  subscribe: <T = unknown>(eventType: SSEEventType, handler: (data: T) => void) => () => void
  reconnect: () => void
}

// ============================================================================
// CONTEXT
// ============================================================================

const SSEContext = createContext<SSEContextValue | null>(null)

// ============================================================================
// PROVIDER PROPS
// ============================================================================

interface SSEProviderProps {
  children: React.ReactNode
  enabled?: boolean
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function SSEProvider({ children, enabled = true }: SSEProviderProps) {
  const [state, setState] = useState<SSEClientState>({
    connected: false,
    reconnecting: false,
    error: null,
    lastHeartbeat: null,
    connectionAttempts: 0,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const subscribersRef = useRef<Map<SSEEventType, Set<(data: unknown) => void>>>(new Map())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const connectionAttemptsRef = useRef<number>(0)

  /**
   * Connect to SSE endpoint
   */
  const connect = useCallback(() => {
    if (!enabled) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource('/api/sse')
    eventSourceRef.current = eventSource

    // Handle connection open
    eventSource.onopen = () => {
      console.log('[SSE] Connected')
      connectionAttemptsRef.current = 0
      setState((prev) => ({
        ...prev,
        connected: true,
        reconnecting: false,
        error: null,
        connectionAttempts: 0,
      }))
    }

    // Handle generic messages
    eventSource.onmessage = (event) => {
      try {
        const sseEvent: SSEEvent = JSON.parse(event.data)
        handleEvent(sseEvent)
      } catch (error) {
        console.error('[SSE] Failed to parse message:', error)
      }
    }

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error)

      connectionAttemptsRef.current += 1
      const attempts = connectionAttemptsRef.current

      setState((prev) => ({
        ...prev,
        connected: false,
        reconnecting: true,
        error: 'Connection lost',
        connectionAttempts: attempts,
      }))

      // Attempt to reconnect with exponential backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 30000)

      reconnectTimeoutRef.current = setTimeout(() => {
        console.log(`[SSE] Reconnecting in ${backoffDelay}ms...`)
        connect()
      }, backoffDelay)
    }

    // Set up typed event listeners
    eventSource.addEventListener('connected', handleConnected)
    eventSource.addEventListener('heartbeat', handleHeartbeat)
    eventSource.addEventListener('boss:killed', handleBossEvent)
    eventSource.addEventListener('boss:spawned', handleBossEvent)
    eventSource.addEventListener('boss:soon', handleBossEvent)
    eventSource.addEventListener('boss:updated', handleBossEvent)
    eventSource.addEventListener('event:active', handleBossEvent)
    eventSource.addEventListener('event:soon', handleBossEvent)
    eventSource.addEventListener('leaderboard:updated', handleBossEvent)
  }, [enabled])

  /**
   * Handle parsed SSE event
   */
  const handleEvent = useCallback((sseEvent: SSEEvent) => {
    const subscribers = subscribersRef.current.get(sseEvent.type)
    if (subscribers) {
      subscribers.forEach((handler) => {
        try {
          handler(sseEvent.data)
        } catch (error) {
          console.error(`[SSE] Handler error for ${sseEvent.type}:`, error)
        }
      })
    }
  }, [])

  /**
   * Handle connection event
   */
  const handleConnected = useCallback((event: MessageEvent) => {
    try {
      const sseEvent: SSEEvent = JSON.parse(event.data)
      console.log('[SSE] Connected with ID:', sseEvent.data)
    } catch (error) {
      console.error('[SSE] Failed to parse connected event:', error)
    }
  }, [])

  /**
   * Handle heartbeat event
   */
  const handleHeartbeat = useCallback((event: MessageEvent) => {
    try {
      const sseEvent: SSEEvent = JSON.parse(event.data)
      setState((prev) => ({
        ...prev,
        lastHeartbeat: new Date(sseEvent.timestamp),
      }))
    } catch (error) {
      console.error('[SSE] Failed to parse heartbeat:', error)
    }
  }, [])

  /**
   * Handle boss-related events
   */
  const handleBossEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const sseEvent: SSEEvent = JSON.parse(event.data)
        handleEvent(sseEvent)
      } catch (error) {
        console.error('[SSE] Failed to parse boss event:', error)
      }
    },
    [handleEvent]
  )

  /**
   * Subscribe to specific event type
   */
  const subscribe = useCallback(<T = unknown>(
    eventType: SSEEventType,
    handler: (data: T) => void
  ): (() => void) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set())
    }

    const subscribers = subscribersRef.current.get(eventType)!
    subscribers.add(handler as (data: unknown) => void)

    // Return unsubscribe function
    return () => {
      subscribers.delete(handler as (data: unknown) => void)
      if (subscribers.size === 0) {
        subscribersRef.current.delete(eventType)
      }
    }
  }, [])

  /**
   * Manual reconnect
   */
  const reconnect = useCallback(() => {
    console.log('[SSE] Manual reconnect triggered')
    connect()
  }, [connect])

  // Initialize connection on mount
  useEffect(() => {
    if (enabled) {
      connect()
    }

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        const source = eventSourceRef.current
        // Remove all event listeners before closing
        source.removeEventListener('connected', handleConnected)
        source.removeEventListener('heartbeat', handleHeartbeat)
        source.removeEventListener('boss:killed', handleBossEvent)
        source.removeEventListener('boss:spawned', handleBossEvent)
        source.removeEventListener('boss:soon', handleBossEvent)
        source.removeEventListener('boss:updated', handleBossEvent)
        source.removeEventListener('event:active', handleBossEvent)
        source.removeEventListener('event:soon', handleBossEvent)
        source.removeEventListener('leaderboard:updated', handleBossEvent)
        source.close()
        eventSourceRef.current = null
      }
    }
  }, [enabled, connect, handleConnected, handleHeartbeat, handleBossEvent])

  const value: SSEContextValue = {
    state,
    subscribe,
    reconnect,
  }

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Use SSE context
 */
export function useSSE() {
  const context = useContext(SSEContext)
  if (!context) {
    throw new Error('useSSE must be used within SSEProvider')
  }
  return context
}

/**
 * Subscribe to specific SSE event type
 */
export function useSSEEvent<T = unknown>(
  eventType: SSEEventType,
  handler: (data: T) => void,
  deps: React.DependencyList = []
) {
  const { subscribe } = useSSE()

  useEffect(() => {
    const unsubscribe = subscribe<T>(eventType, handler)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, subscribe, ...deps])
}

/**
 * Convenient hooks for specific events
 */
export function useBossKilled(handler: (data: BossKilledData) => void, deps: React.DependencyList = []) {
  useSSEEvent('boss:killed', handler, deps)
}

export function useBossSpawned(handler: (data: BossSpawnedData) => void, deps: React.DependencyList = []) {
  useSSEEvent('boss:spawned', handler, deps)
}

export function useBossSoon(handler: (data: BossSoonData) => void, deps: React.DependencyList = []) {
  useSSEEvent('boss:soon', handler, deps)
}

export function useBossUpdated(handler: (data: BossUpdatedData) => void, deps: React.DependencyList = []) {
  useSSEEvent('boss:updated', handler, deps)
}
