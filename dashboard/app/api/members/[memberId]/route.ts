/**
 * Member Profile API Route
 * GET /api/members/[memberId] - Fetch individual member profile data
 */

import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/collections";
import type { Member, AttendanceRecord } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { memberId: string } }
) {
  try {
    const { memberId } = params;

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

    // Get member rank (based on points available)
    const membersAbove = await db
      .collection(COLLECTIONS.members)
      .countDocuments({
        pointsAvailable: { $gt: member.pointsAvailable }
      });

    const totalMembers = await db.collection(COLLECTIONS.members).countDocuments({});

    const rank = membersAbove + 1;

    // Find previous member (rank - 1)
    let prevMemberId: string | undefined = undefined;
    if (rank > 1) {
      const prevMember = await db
        .collection<Member>(COLLECTIONS.members)
        .findOne(
          { pointsAvailable: { $gt: member.pointsAvailable } },
          {
            sort: { pointsAvailable: 1 },
            projection: { _id: 1 }
          }
        );
      prevMemberId = prevMember?._id;
    }

    // Find next member (rank + 1)
    let nextMemberId: string | undefined = undefined;
    if (rank < totalMembers) {
      const nextMember = await db
        .collection<Member>(COLLECTIONS.members)
        .findOne(
          { pointsAvailable: { $lt: member.pointsAvailable } },
          {
            sort: { pointsAvailable: -1 },
            projection: { _id: 1 }
          }
        );
      nextMemberId = nextMember?._id;
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
