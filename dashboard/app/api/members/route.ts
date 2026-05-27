/**
 * Members/Leaderboard API Route
 * GET /api/members - Fetch leaderboard data (attendance or points)
 */

import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { leaderboardQuerySchema, validateInput } from "@/lib/validation";
import { buildAttendancePipeline, buildTotalBossKillsPipeline, buildDateFilter } from "@/lib/mongodb-utils";
import { LEADERBOARD } from "@/lib/constants";
import { COLLECTIONS } from "@/lib/collections";
import fs from "fs";
import path from "path";
import type {
  AttendanceLeaderboardEntry,
  PointsLeaderboardEntry
} from "@/types/database";

// Force dynamic rendering - this route uses request.url for query parameters
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract and validate query parameters
    const queryParams = {
      type: searchParams.get("type"),
      period: searchParams.get("period"),
      limit: searchParams.get("limit"),
      search: searchParams.get("search"),
      month: searchParams.get("month"),
      week: searchParams.get("week"),
    };

    // Validate input using Zod schema
    const validation = validateInput(leaderboardQuerySchema, queryParams);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          data: [],
        },
        { status: 400 }
      );
    }

    const { type, period, limit, search, month: monthParam, week: weekParam } = validation.data;

    const db = await getDatabase();

    // Read lore member names for filtering (only show members who have lore entries)
    const lorePath = path.resolve(process.cwd(), '../member-lore.json');
    const rawData = fs.readFileSync(lorePath, 'utf-8');
    const memberLore = JSON.parse(rawData);
    const loreMemberNames = new Set(Object.keys(memberLore).map(k => k.toLowerCase()));

    if (type === "attendance") {
      // Build date filter using reusable utility
      const dateFilter = buildDateFilter({
        period,
        month: monthParam,
        week: weekParam,
      });

      // Build aggregation pipeline using reusable utility
      const pipeline = buildAttendancePipeline(dateFilter);

      const attendanceData = await db
        .collection(COLLECTIONS.attendance)
        .aggregate(pipeline)
        .toArray();

      // Count total unique boss kill events using reusable utility
      const totalBossKillsResult = await db
        .collection(COLLECTIONS.attendance)
        .aggregate(buildTotalBossKillsPipeline(dateFilter))
        .toArray();

      const totalBossKills = totalBossKillsResult.length > 0 ? totalBossKillsResult[0].totalBossKills : 1;

      // Calculate leaderboard with ranks for all members
      const allMembersWithRank: AttendanceLeaderboardEntry[] = attendanceData.map((member, index) => {
        const totalKills = member.totalKills || 0;
        const pointsEarned = member.pointsEarned || 0;
        const currentStreak = member.currentStreak || 0;

        // Calculate attendance rate as percentage of total boss kills that occurred
        const attendanceRate = totalBossKills > 0 ? Math.round((totalKills / totalBossKills) * 100) : 0;

        return {
          rank: index + 1,
          username: member.username,
          memberId: member._id,
          totalKills,
          pointsEarned,
          attendanceRate,
          currentStreak,
        };
      });

      // Filter by search if provided
      let leaderboard = allMembersWithRank;
      if (search) {
        const searchLower = search.toLowerCase();
        leaderboard = allMembersWithRank.filter(member =>
          member.username.toLowerCase().includes(searchLower)
        );
      }

      // Only show members who have lore entries
      leaderboard = leaderboard.filter(m => loreMemberNames.has(m.username.toLowerCase()));

      // Apply limit
      if (limit > 0) {
        leaderboard = leaderboard.slice(0, limit);
      }

      return NextResponse.json(
        {
          success: true,
          type: "attendance",
          period,
          count: leaderboard.length,
          total: leaderboard.length,
          data: leaderboard,
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    } else {
      // Fetch points leaderboard from members collection (authoritative source for points)
      // First, get ALL members to calculate true ranks
      const allMembersData = await db
        .collection(COLLECTIONS.members)
        .aggregate([
          {
            $project: {
              _id: 1,
              username: 1,
              pointsAvailable: { $ifNull: ["$pointsAvailable", 0] },
              pointsEarned: { $ifNull: ["$pointsEarned", 0] },
              pointsSpent: { $ifNull: ["$pointsSpent", 0] }
            }
          },
          { $sort: { pointsEarned: -1 } }
        ])
        .toArray();

      // Calculate ranks for all members
      const allMembersWithRank = allMembersData.map((member, index) => {
        const pointsAvailable = member.pointsAvailable || 0;
        const pointsEarned = member.pointsEarned || 0;
        const pointsSpent = member.pointsSpent || 0;

        // Calculate consumption rate
        const consumptionRate = pointsEarned > 0
          ? Math.round((pointsSpent / pointsEarned) * 100)
          : 0;

        return {
          rank: index + 1,
          username: member.username,
          memberId: member._id,
          pointsAvailable,
          pointsEarned,
          pointsSpent,
          consumptionRate,
        };
      });

      // Filter by search if provided
      let leaderboard = allMembersWithRank;
      if (search) {
        const searchLower = search.toLowerCase();
        leaderboard = allMembersWithRank.filter(member =>
          member.username.toLowerCase().includes(searchLower)
        );
      }

      // Only show members who have lore entries
      leaderboard = leaderboard.filter(m => loreMemberNames.has(m.username.toLowerCase()));

      // Apply limit
      if (limit > 0) {
        leaderboard = leaderboard.slice(0, limit);
      }

      return NextResponse.json(
        {
          success: true,
          type: "points",
          period: "all", // Points don't have period filters
          count: leaderboard.length,
          total: leaderboard.length,
          data: leaderboard,
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    }
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        success: false,
        error: isDev && error instanceof Error ? error.message : "Internal server error",
        data: [],
      },
      { status: 500 }
    );
  }
}
