/**
 * MongoDB Database Type Definitions
 * Based on Elysium Bot MongoDB Schema
 */

import { ObjectId } from "mongodb";

// ============================================================================
// MEMBER TYPES
// ============================================================================

export interface MemberAttendance {
  total: number;
  thisWeek: number;
  thisMonth: number;
  byBoss: Record<string, number>;
  streak: {
    current: number;
    longest: number;
  };
}

export interface Member {
  _id: string; // Discord user ID
  username: string;
  pointsAvailable: number;
  pointsEarned: number;
  pointsSpent: number;
  isActive?: boolean;
  attendance: MemberAttendance;
  joinedAt: Date;
  lastActive: Date;
  lastUpdated?: Date;
}

// ============================================================================
// ATTENDANCE TYPES
// ============================================================================

export interface AttendanceRecord {
  _id: ObjectId;
  memberId: string; // Discord user ID
  memberName: string;
  bossName: string;
  bossPoints: number;
  timestamp: Date;
  weekStartDate: Date;
  weekLabel: string;
  verified: boolean;
  verifiedBy?: string;
  threadId?: string;
  lateSubmission?: boolean;
  lateWarning?: boolean;
  addedBy?: string;
  createdAt: Date;
}

// ============================================================================
// BOSS TIMER TYPES
// ============================================================================

export interface BossTimer {
  _id?: ObjectId;
  bossName: string;
  lastKillTime: string | Date | null;
  nextSpawnTime: string | Date | null;
  killedBy?: string;
  serverDown?: boolean;
  updatedAt: Date;
}

// ============================================================================
// AUCTION TYPES
// ============================================================================

export type AuctionStatus = "pending" | "active" | "sold" | "cancelled";

export interface AuctionItem {
  _id: ObjectId;
  itemName: string;
  startPrice: number;
  duration: number;
  quantity: number;
  boss: string;
  source: string;
  status: AuctionStatus;
  winner: string | null;
  winnerId: string | null;
  winningBid: number | null;
  totalBids: number;
  addedAt: Date;
  auctionStartTime?: Date;
  auctionEndTime?: Date;
  soldAt?: Date;
  sheetRow?: number;
  lastSyncedToSheet?: Date;
}

export interface AuctionSessionItem {
  itemId: ObjectId;
  itemName: string;
  winner: string;
  winnerId: string;
  winningBid: number;
}

export interface MemberSpending {
  memberId: string;
  memberName: string;
  totalSpent: number;
}

export interface AuctionSession {
  _id: ObjectId;
  sessionNumber: number;
  sessionDate: string;
  sessionLabel: string;
  startTime: Date;
  endTime?: Date;
  items: AuctionSessionItem[];
  memberSpending: MemberSpending[];
  totalItemsSold: number;
  totalPointsSpent: number;
  syncedToSheet?: boolean;
  sheetColumn?: string;
}

// ============================================================================
// BOSS ROTATION TYPES
// ============================================================================

export interface RotationGuild {
  name: string;
  index: number;
}

export interface BossRotation {
  _id: ObjectId;
  bossName: string;
  guilds: RotationGuild[];
  currentTurnIndex: number;
  currentGuild: string;
  rotationFrequency?: string;
  lastRotation?: Date;
  nextRotation?: Date;
  lastUpdated: Date;
}

// ============================================================================
// BOT STATE TYPES
// ============================================================================

export interface AttendanceThreadMember {
  userId: string;
  username: string;
  verified: boolean;
}

export interface ActiveSpawn {
  threadId: string;
  channelId: string;
  bossName: string;
  bossPoints: number;
  timestamp: string;
  members: AttendanceThreadMember[];
  createdAt: Date;
  expiresAt: Date;
}

export interface AttendanceState {
  _id: "attendance_state";
  activeSpawns: ActiveSpawn[];
  lastUpdated: Date;
  version: number;
}

export interface CurrentAuctionItem {
  itemId: ObjectId;
  itemName: string;
  startPrice: number;
  currentBid: number;
  currentBidder: string;
  currentBidderId: string;
  timerEndsAt: Date;
}

export interface AuctionState {
  _id: "auction_state";
  active: boolean;
  sessionNumber: number;
  sessionStartTime: Date;
  currentItem: CurrentAuctionItem | null;
  queue: Array<{ itemId: ObjectId; itemName: string }>;
  itemsSoldThisSession: number;
  lastUpdated: Date;
  version: number;
}

export interface BossTimerState {
  bossName: string;
  lastSpawn: Date;
  nextSpawn: Date;
  notified: boolean;
  channel: string;
}

export interface BossTimersState {
  _id: "boss_timers";
  timers: BossTimerState[];
  lastUpdated: Date;
}

// ============================================================================
// EVENT REMINDER TYPES
// ============================================================================

export type EventType = "boss_spawn" | "auction" | "guild_event" | "custom";

export interface EventReminder {
  _id: ObjectId;
  eventType: EventType;
  eventName: string;
  reminderTime: Date;
  notifyBefore: number;
  channelId: string;
  message: string;
  mentionRole?: string;
  recurring: boolean;
  recurrenceRule?: string;
  triggered: boolean;
  lastTriggered?: Date;
  nextTrigger: Date;
  createdBy: string;
  createdAt: Date;
  active: boolean;
}

// ============================================================================
// BOSS CONFIGURATION TYPES
// ============================================================================

export interface TimerBasedBoss {
  spawnIntervalHours: number;
  description: string;
}

export interface BossSchedule {
  day: string;
  time: string;
  dayOfWeek: number;
}

export interface ScheduleBasedBoss {
  schedules: BossSchedule[];
  description: string;
}

export interface BossSpawnConfig {
  timerBasedBosses: Record<string, TimerBasedBoss>;
  scheduleBasedBosses: Record<string, ScheduleBasedBoss>;
}

export interface BossPoints {
  points: number;
  aliases: string[];
}

export type BossPointsConfig = Record<string, BossPoints>;

// ============================================================================
// LEADERBOARD TYPES
// ============================================================================

export interface AttendanceLeaderboardEntry {
  rank: number;
  username: string;
  memberId: string;
  totalKills: number;
  pointsEarned: number;
  attendanceRate: number;
  currentStreak: number;
}

export interface PointsLeaderboardEntry {
  rank: number;
  username: string;
  memberId: string;
  pointsAvailable: number;
  pointsEarned: number;
  pointsSpent: number;
  consumptionRate: number;
}

// ============================================================================
// DASHBOARD SPECIFIC TYPES
// ============================================================================

export interface BossTimerDisplay {
  bossName: string;
  bossPoints: number;
  type: "timer" | "schedule";
  killedBy?: string;
  lastKillTime?: Date;
  nextSpawnTime?: Date;
  interval?: number; // hours
  schedules?: BossSchedule[];
  timeRemaining?: number; // milliseconds
  status: "ready" | "soon" | "spawned" | "unknown";
  killCount?: number; // Total number of kills from attendance records
  isPredicted?: boolean; // True if spawn time is predicted from attendance, false if from timer
  rotation?: {
    isRotating: boolean;
    currentIndex?: number;
    currentGuild?: string;
    isOurTurn?: boolean;
    guilds?: string[];
    nextGuild?: string;
  };
}

export interface MemberProfile extends Member {
  recentAttendance: AttendanceRecord[];
  auctionWins: AuctionItem[];
  rank: number;
  totalMembers: number;
}

// ============================================================================
// MONGODB AGGREGATION RESULT TYPES
// ============================================================================

export interface KillCountResult {
  _id: string; // lowercase boss name
  count: number;
}

export interface BossRotationDocument {
  _id: string;
  bossName: string;
  currentIndex: number;
  currentGuild: string;
  isOurTurn: boolean;
  guilds: string[];
  nextGuild: string;
  lastUpdated?: Date;
}
