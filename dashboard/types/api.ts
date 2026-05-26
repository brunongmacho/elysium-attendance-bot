/**
 * API Response Type Definitions
 */

import type { BossTimerDisplay, AttendanceLeaderboardEntry, PointsLeaderboardEntry } from './database';

// Base API response
export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  timestamp?: string;
}

// Boss timers API
export interface BossTimersResponse extends ApiResponse {
  count: number;
  bosses: BossTimerDisplay[];
}

// Leaderboard API
export interface LeaderboardResponse extends ApiResponse {
  type: 'attendance' | 'points';
  period: string;
  count: number;
  total: number;
  data: AttendanceLeaderboardEntry[] | PointsLeaderboardEntry[];
}

// Member profile API
export interface MemberProfileResponse extends ApiResponse {
  member: {
    _id: string;
    username: string;
    pointsAvailable: number;
    pointsEarned: number;
    pointsSpent: number;
    consumptionRate: number;
    lore?: {
      primaryClass?: string;
      secondaryClass?: string;
      race?: string;
      level?: number;
      guild?: string;
      backstory?: string;
      skills?: string[];
    };
  };
  attendance: {
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
}

// Boss kill update response
export interface BossKillResponse extends ApiResponse {
  data: {
    bossName: string;
    lastKillTime: string;
    nextSpawnTime: string;
    killedBy: string;
  };
  message?: string;
  modified?: boolean;
  upserted?: boolean;
}

// Discord types (to replace 'as any' casts)
export interface DiscordProfile {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar: string | null;
  email?: string;
  verified?: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordMember {
  user: DiscordProfile;
  nick: string | null;
  roles: string[];
  joined_at: string;
}
