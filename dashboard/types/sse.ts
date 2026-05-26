/**
 * Server-Sent Events (SSE) Type Definitions
 * Real-time event schema for boss timers, rotations, and notifications
 */

import type { BossTimerDisplay, BossRotationDocument } from './database'

// ============================================================================
// SSE EVENT TYPES
// ============================================================================

export type SSEEventType =
  | 'boss:killed'
  | 'boss:spawned'
  | 'boss:soon'
  | 'boss:updated'
  | 'rotation:changed'
  | 'leaderboard:updated'
  | 'event:active'
  | 'event:soon'
  | 'connected'
  | 'heartbeat'

// ============================================================================
// EVENT DATA PAYLOADS
// ============================================================================

export interface BossKilledData {
  bossName: string
  killedBy: string
  timestamp: string
  nextSpawnTime: string | null
  timeRemaining: number | null
  bossPoints: number
}

export interface BossSpawnedData {
  bossName: string
  nextSpawnTime: string
  bossPoints: number
  status: 'spawned'
}

export interface BossSoonData {
  bossName: string
  nextSpawnTime: string
  timeRemaining: number
  bossPoints: number
  status: 'soon'
}

export interface BossUpdatedData {
  bossName: string
  status: 'ready' | 'soon' | 'spawned' | 'unknown'
  timeRemaining: number | null
  nextSpawnTime: string | null
}

export interface RotationChangedData {
  bossName: string
  previousGuild: string
  currentGuild: string
  isOurTurn: boolean
  nextGuild: string
  guilds: string[]
}

export interface LeaderboardUpdatedData {
  type: 'attendance' | 'points'
  totalMembers: number
  lastUpdated: string
}

export interface EventActiveData {
  eventName: string
  startTime: string
  endTime: string
  durationMinutes: number
}

export interface EventSoonData {
  eventName: string
  startTime: string
  timeRemaining: number
  durationMinutes: number
}

export interface ConnectedData {
  timestamp: string
  clientId: string
}

export interface HeartbeatData {
  timestamp: string
}

// ============================================================================
// SSE EVENT STRUCTURE
// ============================================================================

export interface SSEEvent<T = unknown> {
  type: SSEEventType
  data: T
  timestamp: string
}

// ============================================================================
// TYPED EVENTS
// ============================================================================

export type BossKilledEvent = SSEEvent<BossKilledData>
export type BossSpawnedEvent = SSEEvent<BossSpawnedData>
export type BossSoonEvent = SSEEvent<BossSoonData>
export type BossUpdatedEvent = SSEEvent<BossUpdatedData>
export type RotationChangedEvent = SSEEvent<RotationChangedData>
export type LeaderboardUpdatedEvent = SSEEvent<LeaderboardUpdatedData>
export type EventActiveEvent = SSEEvent<EventActiveData>
export type EventSoonEvent = SSEEvent<EventSoonData>
export type ConnectedEvent = SSEEvent<ConnectedData>
export type HeartbeatEvent = SSEEvent<HeartbeatData>

// ============================================================================
// EVENT UNION TYPE
// ============================================================================

export type AnySSEEvent =
  | BossKilledEvent
  | BossSpawnedEvent
  | BossSoonEvent
  | BossUpdatedEvent
  | RotationChangedEvent
  | LeaderboardUpdatedEvent
  | EventActiveEvent
  | EventSoonEvent
  | ConnectedEvent
  | HeartbeatEvent

// ============================================================================
// SSE CLIENT STATE
// ============================================================================

export interface SSEClientState {
  connected: boolean
  reconnecting: boolean
  error: string | null
  lastHeartbeat: Date | null
  connectionAttempts: number
}

// ============================================================================
// SSE HELPER TYPES
// ============================================================================

export interface SSEEventHandler<T = unknown> {
  (event: SSEEvent<T>): void
}

export type SSEEventMap = {
  [K in SSEEventType]: SSEEventHandler<Extract<AnySSEEvent, { type: K }>['data']>
}

// ============================================================================
// SSE BROADCAST MESSAGE FORMAT
// ============================================================================

export interface SSEBroadcastMessage {
  event: SSEEventType
  data: string // JSON stringified event data
  id?: string
  retry?: number
}
