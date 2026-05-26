/**
 * Boss Timers API Route
 * GET /api/bosses - Fetch all boss timers with calculated spawn times
 */

import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { buildKillCountPerBossPipeline } from "@/lib/mongodb-utils";
import { BOSS_TIMER } from "@/lib/constants";
import {
  getAllBossNames,
  getBossPoints,
  getBossType,
  getBossSpawnInterval,
  calculateNextSpawn,
  getNextScheduledSpawn,
  getTimeRemaining,
  getBossStatus,
} from "@/lib/boss-config";
import { COLLECTIONS } from "@/lib/collections";
import type { BossTimer, BossTimerDisplay, KillCountResult, BossRotationDocument } from "@/types/database";

// Force dynamic rendering - ensures route is not statically generated
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDatabase();

    // Get all boss names from configuration
    const allBossNames = getAllBossNames();

    // Fetch all existing boss timers from MongoDB
    const bossTimers = await db
      .collection<BossTimer>(COLLECTIONS.bossTimers)
      .find({})
      .toArray();

    // Create a map for quick lookup
    const timerMap = new Map<string, BossTimer>();
    bossTimers.forEach((timer) => {
      timerMap.set(timer.bossName, timer);
    });

    // Calculate kill counts for all bosses (case-insensitive, remove #1 suffix)
    const killCountResults = await db
      .collection(COLLECTIONS.attendance)
      .aggregate<KillCountResult>(buildKillCountPerBossPipeline())
      .toArray();

    const killCountMap = new Map<string, number>();
    killCountResults.forEach((result) => {
      killCountMap.set(result._id, result.count);
    });

    // Fetch rotation data for all bosses
    const rotationCollection = db.collection<BossRotationDocument>(COLLECTIONS.bossRotation);
    const allRotations = await rotationCollection.find({}).toArray();
    const rotationMap = new Map<string, BossTimerDisplay['rotation']>();
    allRotations.forEach((rotation) => {
      rotationMap.set(rotation.bossName, {
        isRotating: true,
        currentIndex: rotation.currentIndex,
        currentGuild: rotation.currentGuild,
        isOurTurn: rotation.isOurTurn,
        guilds: rotation.guilds,
        nextGuild: rotation.nextGuild,
      });
    });

    // OPTIMIZATION: Fetch all last attendance records at once to avoid N+1 queries
    // Build regex patterns for case-insensitive matching of all boss names
    const lastAttendanceResults = await db
      .collection(COLLECTIONS.attendance)
      .aggregate([
        {
          $match: {
            bossName: {
              $in: allBossNames.map(name => new RegExp(`^${name}$`, "i"))
            }
          }
        },
        {
          $sort: { timestamp: -1 }
        },
        {
          $group: {
            _id: { $toLower: "$bossName" },
            lastAttendance: { $first: "$$ROOT" }
          }
        }
      ])
      .toArray();

    // Create a map for quick lookup of last attendance by boss name
    const lastAttendanceMap = new Map<string, typeof lastAttendanceResults[0]['lastAttendance']>();
    lastAttendanceResults.forEach((result) => {
      if (result?._id && result?.lastAttendance) {
        lastAttendanceMap.set(result._id, result.lastAttendance);
      }
    });

    // Build display data for each boss
    const bossDisplayData: BossTimerDisplay[] = [];

    for (const bossName of allBossNames) {
      const bossType = getBossType(bossName);
      if (!bossType) continue;

      const bossPoints = getBossPoints(bossName);
      const timer = timerMap.get(bossName);

      let nextSpawnTime: Date | null = null;
      let lastKillTime: Date | null = null;
      let killedBy: string | undefined;

      let isPredicted = false;

      if (bossType === "timer") {
        // Timer-based boss
        let useTimer = false;

        if (timer && timer.nextSpawnTime) {
          // Check if we're still within the grace period
          const now = new Date();
          const spawnTime = new Date(timer.nextSpawnTime);
          const gracePeriodEnd = new Date(spawnTime.getTime() + BOSS_TIMER.GRACE_PERIOD);

          // Use timer data if we're still within grace period
          if (now <= gracePeriodEnd) {
            useTimer = true;
            isPredicted = false;
            nextSpawnTime = spawnTime;
            lastKillTime = timer.lastKillTime ? new Date(timer.lastKillTime) : null;
            killedBy = timer.killedBy;
          }
        }

        // If no timer or past grace period, fallback to attendance collection
        if (!useTimer) {
          // OPTIMIZATION: Use pre-fetched map instead of individual query
          const lastAttendance = lastAttendanceMap.get(bossName.toLowerCase());

          if (lastAttendance) {
            isPredicted = true;
            lastKillTime = new Date(lastAttendance.timestamp);
            killedBy = lastAttendance.memberName;
            nextSpawnTime = calculateNextSpawn(bossName, lastKillTime);

            // Auto-advance predicted spawn if it has already passed AND grace period expired
            // Only add intervals if we're past the grace period of the calculated spawn
            const now = new Date();
            const interval = getBossSpawnInterval(bossName);
            if (nextSpawnTime && interval) {
              while (nextSpawnTime.getTime() <= now.getTime()) {
                // Check if we're still within grace period of this spawn time
                const gracePeriodEnd = new Date(nextSpawnTime.getTime() + BOSS_TIMER.GRACE_PERIOD);

                // If we're still within grace period, keep this spawn time (don't advance)
                if (now <= gracePeriodEnd) {
                  break;
                }

                // Past grace period, advance to next interval
                nextSpawnTime = new Date(nextSpawnTime.getTime() + interval * 60 * 60 * 1000);
              }
            }
          }
        }
      } else {
        // Schedule-based boss
        isPredicted = false;
        nextSpawnTime = getNextScheduledSpawn(bossName);
      }

      const timeRemaining = getTimeRemaining(nextSpawnTime);
      const status = getBossStatus(timeRemaining);

      // Get kill count (case-insensitive)
      const killCount = killCountMap.get(bossName.toLowerCase()) || 0;

      // Get rotation data if available
      const rotation = rotationMap.get(bossName) || { isRotating: false };

      bossDisplayData.push({
        bossName,
        bossPoints,
        type: bossType,
        killedBy,
        lastKillTime: lastKillTime || undefined,
        nextSpawnTime: nextSpawnTime || undefined,
        interval: bossType === "timer" ? getBossSpawnInterval(bossName) || undefined : undefined,
        timeRemaining: timeRemaining || undefined,
        status,
        killCount,
        isPredicted,
        rotation,
      });
    }

    // Sort by next spawn time (soonest first)
    bossDisplayData.sort((a, b) => {
      if (!a.nextSpawnTime) return 1;
      if (!b.nextSpawnTime) return -1;
      return a.nextSpawnTime.getTime() - b.nextSpawnTime.getTime();
    });

    return NextResponse.json(
      {
        success: true,
        count: bossDisplayData.length,
        bosses: bossDisplayData,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error("Error fetching boss timers:", error);
    const isDev = process.env.NODE_ENV === 'development';

    return NextResponse.json(
      {
        success: false,
        error: isDev && error instanceof Error ? error.message : "Internal server error",
        bosses: [],
      },
      { status: 500 }
    );
  }
}
