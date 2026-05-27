/**
 * Member Profile API Route
 * GET /api/members/[memberId] - Fetch individual member profile data
 */

import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/collections";
import fs from "fs";
import path from "path";
import type { Member, AttendanceRecord } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: "Member ID is required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    // Fetch member data
    const member = await db
      .collection<Member>(COLLECTIONS.members)
      .findOne({ _id: memberId });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // Read lore to filter non-lore members
    const lorePath = path.resolve(process.cwd(), '../member-lore.json');
    const rawData = fs.readFileSync(lorePath, 'utf-8');
    const memberLore = JSON.parse(rawData);
    const loreMemberNames = new Set(Object.keys(memberLore).map(k => k.toLowerCase()));

    // If member doesn't have lore, they don't exist on the website
    if (member && !loreMemberNames.has(member.username?.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // Get all members sorted for prev/next navigation (filtered to lore-only)
    const allMembers = await db
      .collection(COLLECTIONS.members)
      .find({})
      .project({ _id: 1, pointsEarned: 1, username: 1 })
      .sort({ pointsEarned: -1 })
      .toArray();

    const loreFiltered = allMembers.filter(m => loreMemberNames.has(m.username?.toLowerCase() || ''));
    const totalMembers = loreFiltered.length;

    // Calculate actual attendance totals from attendance collection
    // Total attendance (all time) - count unique boss kills
    // Use member._id to ensure case-insensitive matching works correctly
    const totalAttendancePipeline = [
      { $match: { memberId: member._id } },
      {
        $addFields: {
          regexMatch: { $regexFind: { input: "$bossName", regex: "\\s*#\\d+\\s*$" } },
        }
      },
      {
        $addFields: {
          cleanBossName: {
            $cond: {
              if: "$regexMatch",
              then: {
                $trim: {
                  input: { $substr: ["$bossName", 0, "$regexMatch.idx"] }
                }
              },
              else: "$bossName"
            }
          }
        }
      },
      {
        $group: {
          _id: {
            bossName: "$cleanBossName",
            timestamp: "$timestamp"
          }
        }
      },
      { $count: "total" }
    ];

    const totalAttendanceResult = await db
      .collection(COLLECTIONS.attendance)
      .aggregate(totalAttendancePipeline)
      .toArray();

    const totalAttendance = totalAttendanceResult.length > 0 ? totalAttendanceResult[0].total : 0;

    // This week attendance (using GMT+8 timezone)
    const gmt8Offset = 8 * 60 * 60 * 1000;
    const now = new Date();
    const gmt8Time = new Date(now.getTime() + gmt8Offset);
    const day = gmt8Time.getUTCDay();
    const sunday = new Date(gmt8Time);
    sunday.setUTCDate(gmt8Time.getUTCDate() - day);
    sunday.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(sunday.getTime() - gmt8Offset);

    const thisWeekPipeline = [
      {
        $match: {
          memberId: member._id,
          timestamp: { $gte: weekStart }
        }
      },
      {
        $addFields: {
          regexMatch: { $regexFind: { input: "$bossName", regex: "\\s*#\\d+\\s*$" } },
        }
      },
      {
        $addFields: {
          cleanBossName: {
            $cond: {
              if: "$regexMatch",
              then: {
                $trim: {
                  input: { $substr: ["$bossName", 0, "$regexMatch.idx"] }
                }
              },
              else: "$bossName"
            }
          }
        }
      },
      {
        $group: {
          _id: {
            bossName: "$cleanBossName",
            timestamp: "$timestamp"
          }
        }
      },
      { $count: "total" }
    ];

    const thisWeekResult = await db
      .collection(COLLECTIONS.attendance)
      .aggregate(thisWeekPipeline)
      .toArray();

    const thisWeek = thisWeekResult.length > 0 ? thisWeekResult[0].total : 0;

    // This month attendance (using GMT+8 timezone)
    const gmtPlusEightNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const monthStartGMT8 = new Date(Date.UTC(gmtPlusEightNow.getUTCFullYear(), gmtPlusEightNow.getUTCMonth(), 1, 0, 0, 0, 0));
    const monthStart = new Date(monthStartGMT8.getTime() - (8 * 60 * 60 * 1000));

    const thisMonthPipeline = [
      {
        $match: {
          memberId: member._id,
          timestamp: { $gte: monthStart }
        }
      },
      {
        $addFields: {
          regexMatch: { $regexFind: { input: "$bossName", regex: "\\s*#\\d+\\s*$" } },
        }
      },
      {
        $addFields: {
          cleanBossName: {
            $cond: {
              if: "$regexMatch",
              then: {
                $trim: {
                  input: { $substr: ["$bossName", 0, "$regexMatch.idx"] }
                }
              },
              else: "$bossName"
            }
          }
        }
      },
      {
        $group: {
          _id: {
            bossName: "$cleanBossName",
            timestamp: "$timestamp"
          }
        }
      },
      { $count: "total" }
    ];

    const thisMonthResult = await db
      .collection(COLLECTIONS.attendance)
      .aggregate(thisMonthPipeline)
      .toArray();

    const thisMonth = thisMonthResult.length > 0 ? thisMonthResult[0].total : 0;

    // Find current member's position in the lore-filtered points leaderboard (sorted by pointsEarned like the leaderboard)
    const currentIdx = loreFiltered.findIndex(m => m._id === memberId);

    // Rank based on position in the lore-filtered leaderboard (matching the leaderboard page)
    // Members above = those with higher pointsEarned in the filtered list
    let rank = 1;
    if (currentIdx >= 0) {
      rank = currentIdx + 1;
    } else {
      // If somehow not in the filtered list, fall back to raw position
      const rawIdx = allMembers.findIndex(m => m._id === memberId);
      rank = rawIdx >= 0 ? rawIdx + 1 : loreFiltered.length + 1;
    }

    let prevMemberId: string | undefined = undefined;
    let nextMemberId: string | undefined = undefined;

    if (currentIdx >= 0) {
      if (currentIdx > 0) {
        prevMemberId = loreFiltered[currentIdx - 1]._id;
      }
      if (currentIdx < loreFiltered.length - 1) {
        nextMemberId = loreFiltered[currentIdx + 1]._id;
      }
    }

    // Build profile response with calculated attendance values
    const profile = {
      ...member,
      attendance: {
        total: totalAttendance,
        thisWeek: thisWeek,
        thisMonth: thisMonth,
        byBoss: member.attendance?.byBoss || {},
        streak: member.attendance?.streak || { current: 0, longest: 0 }
      },
      rank,
      totalMembers,
      prevMemberId,
      nextMemberId
    };

    return NextResponse.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching member profile:", error);
    const isDev = process.env.NODE_ENV === 'development';

    return NextResponse.json(
      {
        success: false,
        error: isDev && error instanceof Error ? error.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}
