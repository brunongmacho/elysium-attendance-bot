/**
 * Boss Configuration Utilities
 * Load and parse boss spawn configurations
 */

import bossSpawnConfig from "../boss_spawn_config.json";
import bossPointsConfig from "../boss_points.json";
import type { BossSpawnConfig, BossPointsConfig, BossTimerDisplay, BossSchedule } from "@/types/database";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const GMT8_TIMEZONE = "Asia/Manila";

/**
 * Get boss spawn configuration
 */
export function getBossSpawnConfig(): BossSpawnConfig {
  return bossSpawnConfig as unknown as BossSpawnConfig;
}

/**
 * Get boss points configuration
 */
export function getBossPointsConfig(): BossPointsConfig {
  return bossPointsConfig as BossPointsConfig;
}

/**
 * Get boss points by name
 */
export function getBossPoints(bossName: string): number {
  const config = getBossPointsConfig();
  return config[bossName]?.points || 1;
}

/**
 * Check if boss is timer-based
 */
export function isTimerBasedBoss(bossName: string): boolean {
  const config = getBossSpawnConfig();
  return bossName in config.timerBasedBosses;
}

/**
 * Check if boss is schedule-based
 */
export function isScheduleBasedBoss(bossName: string): boolean {
  const config = getBossSpawnConfig();
  return bossName in config.scheduleBasedBosses;
}

/**
 * Get boss spawn interval in hours (for timer-based bosses)
 */
export function getBossSpawnInterval(bossName: string): number | null {
  const config = getBossSpawnConfig();
  return config.timerBasedBosses[bossName]?.spawnIntervalHours || null;
}

/**
 * Get boss schedules (for schedule-based bosses)
 */
export function getBossSchedules(bossName: string): BossSchedule[] | null {
  const config = getBossSpawnConfig();
  return config.scheduleBasedBosses[bossName]?.schedules || null;
}

/**
 * Calculate next spawn time for timer-based boss
 */
export function calculateNextSpawn(bossName: string, lastKillTime: Date): Date | null {
  const interval = getBossSpawnInterval(bossName);
  if (!interval) return null;

  const nextSpawn = new Date(lastKillTime);
  nextSpawn.setHours(nextSpawn.getHours() + interval);
  return nextSpawn;
}

/**
 * Get next schedule-based spawn time
 * Calculates the next occurrence of any schedule for the boss
 */
export function getNextScheduledSpawn(bossName: string, fromTime: Date = new Date()): Date | null {
  const schedules = getBossSchedules(bossName);
  if (!schedules || schedules.length === 0) return null;

  // Convert current time to GMT+8 for comparison
  const nowGMT8 = toZonedTime(fromTime, GMT8_TIMEZONE);
  const nextSpawns: Date[] = [];

  for (const schedule of schedules) {
    const [hours, minutes] = schedule.time.split(":").map(Number);

    // Create a date in GMT+8 timezone
    const nextSpawnGMT8 = new Date(nowGMT8);

    // Calculate days until next occurrence
    const currentDay = nowGMT8.getDay();
    const targetDay = schedule.dayOfWeek;
    let daysUntil = targetDay - currentDay;

    if (daysUntil < 0) {
      daysUntil += 7; // Next week
    } else if (daysUntil === 0) {
      // Same day - check if time has passed
      const todayAtTimeGMT8 = new Date(nowGMT8);
      todayAtTimeGMT8.setHours(hours, minutes, 0, 0);

      if (nowGMT8 > todayAtTimeGMT8) {
        daysUntil = 7; // Next week
      }
    }

    nextSpawnGMT8.setDate(nextSpawnGMT8.getDate() + daysUntil);
    nextSpawnGMT8.setHours(hours, minutes, 0, 0);

    // Convert back to UTC for storage
    const nextSpawnUTC = fromZonedTime(nextSpawnGMT8, GMT8_TIMEZONE);
    nextSpawns.push(nextSpawnUTC);
  }

  // Return the soonest spawn
  if (nextSpawns.length === 0) return null;
  return nextSpawns.reduce((earliest, current) =>
    current < earliest ? current : earliest
  );
}

/**
 * Get all boss names
 */
export function getAllBossNames(): string[] {
  const config = getBossSpawnConfig();
  // Filter out JSON comment fields (keys starting with "_")
  const timerBosses = Object.keys(config.timerBasedBosses).filter(key => !key.startsWith("_"));
  const scheduleBosses = Object.keys(config.scheduleBasedBosses).filter(key => !key.startsWith("_"));
  return [...timerBosses, ...scheduleBosses];
}

/**
 * Calculate time remaining until spawn
 */
export function getTimeRemaining(nextSpawnTime: Date | null): number | null {
  if (!nextSpawnTime) return null;
  const now = new Date();
  return nextSpawnTime.getTime() - now.getTime();
}

/**
 * Get boss status based on time remaining
 */
export function getBossStatus(timeRemaining: number | null): "ready" | "soon" | "spawned" | "unknown" {
  if (timeRemaining === null) return "unknown";

  const thirtyMinutes = 30 * 60 * 1000;

  if (timeRemaining <= 0) return "spawned";
  if (timeRemaining <= thirtyMinutes) return "soon";
  return "ready";
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(milliseconds: number): string {
  if (milliseconds <= 0) return "Spawned!";

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Get boss type ("timer" or "schedule")
 */
export function getBossType(bossName: string): "timer" | "schedule" | null {
  if (isTimerBasedBoss(bossName)) return "timer";
  if (isScheduleBasedBoss(bossName)) return "schedule";
  return null;
}
