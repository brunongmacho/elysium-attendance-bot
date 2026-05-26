/**
 * MongoDB Aggregation Utilities
 * Reusable pipeline builders to eliminate code duplication
 */

import { COLLECTIONS } from "@/lib/collections";

// Boss name cleaning pipeline stages
// Removes trailing "#1", "#2" etc. from boss names for proper grouping
export const getBossNameCleaningStages = () => [
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
  }
];

// Date filter builder for GMT+8 timezone
export interface DateFilterOptions {
  period: 'all' | 'monthly' | 'weekly';
  month?: string | null; // YYYY-MM format
  week?: string | null;  // YYYY-MM-DD format
}

export const buildDateFilter = (options: DateFilterOptions): Record<string, any> => {
  const { period, month: monthParam, week: weekParam } = options;
  const now = new Date();
  const gmt8Offset = 8 * 60 * 60 * 1000;

  if (period === 'monthly') {
    if (monthParam) {
      // Parse specific month (YYYY-MM) in GMT+8 timezone
      const [year, month] = monthParam.split('-').map(Number);

      // Month start: 1st day 00:00:00 GMT+8 -> convert to UTC
      const monthStartGMT8 = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const monthStart = new Date(monthStartGMT8.getTime() - gmt8Offset);

      // Month end: last day 23:59:59 GMT+8 -> convert to UTC
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const monthEndGMT8 = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999));
      const monthEnd = new Date(monthEndGMT8.getTime() - gmt8Offset);

      return {
        timestamp: {
          $gte: monthStart,
          $lte: monthEnd
        }
      };
    } else {
      // Current month in GMT+8 - only use lower bound
      const gmtPlusEightNow = new Date(now.getTime() + gmt8Offset);
      const monthStartGMT8 = new Date(Date.UTC(gmtPlusEightNow.getUTCFullYear(), gmtPlusEightNow.getUTCMonth(), 1, 0, 0, 0, 0));
      const monthStart = new Date(monthStartGMT8.getTime() - gmt8Offset);
      return { timestamp: { $gte: monthStart } };
    }
  } else if (period === 'weekly') {
    if (weekParam) {
      // Parse specific week and calculate range in GMT+8
      const [year, month, day] = weekParam.split('-').map(Number);

      const weekStartGMT8 = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const weekStart = new Date(weekStartGMT8.getTime() - gmt8Offset);

      const weekEndGMT8 = new Date(weekStartGMT8);
      weekEndGMT8.setUTCDate(weekEndGMT8.getUTCDate() + 6);
      weekEndGMT8.setUTCHours(23, 59, 59, 999);
      const weekEnd = new Date(weekEndGMT8.getTime() - gmt8Offset);

      return {
        timestamp: {
          $gte: weekStart,
          $lte: weekEnd
        }
      };
    } else {
      // Current week - calculate from current time in GMT+8
      const gmt8Time = new Date(now.getTime() + gmt8Offset);
      const day = gmt8Time.getUTCDay();

      // Calculate Sunday of this week in GMT+8
      const sunday = new Date(gmt8Time);
      sunday.setUTCDate(gmt8Time.getUTCDate() - day);
      sunday.setUTCHours(0, 0, 0, 0);
      const weekStart = new Date(sunday.getTime() - gmt8Offset);

      return { timestamp: { $gte: weekStart } };
    }
  }

  // period === 'all'
  return {};
};

// Attendance aggregation pipeline builder
export const buildAttendancePipeline = (dateFilter: Record<string, any>) => {
  const matchStage = Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : [];

  return [
    ...matchStage,
    ...getBossNameCleaningStages(),
    {
      $group: {
        _id: {
          memberId: "$memberId",
          bossName: "$cleanBossName",
          timestamp: "$timestamp"
        },
        memberName: { $first: "$memberName" }
      }
    },
    {
      $group: {
        _id: "$_id.memberId",
        memberName: { $first: "$memberName" },
        totalKills: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: COLLECTIONS.members,
        localField: "_id",
        foreignField: "_id",
        as: "memberData"
      }
    },
    {
      $unwind: {
        path: "$memberData",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        _id: 1,
        username: { $ifNull: ["$memberData.username", "$memberName"] },
        totalKills: 1,
        pointsEarned: { $ifNull: ["$memberData.pointsEarned", 0] },
        currentStreak: { $ifNull: ["$memberData.attendance.streak.current", 0] }
      }
    },
    { $sort: { totalKills: -1 } }
  ];
};

// Total boss kills count pipeline
export const buildTotalBossKillsPipeline = (dateFilter: Record<string, any>) => {
  const matchStage = Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : [];

  return [
    ...matchStage,
    ...getBossNameCleaningStages(),
    {
      $group: {
        _id: {
          bossName: "$cleanBossName",
          timestamp: "$timestamp"
        }
      }
    },
    {
      $count: "totalBossKills"
    }
  ];
};

// Kill count per boss pipeline
// Returns the number of unique kills for each boss (case-insensitive)
export const buildKillCountPerBossPipeline = (dateFilter?: Record<string, any>) => {
  const matchStage = dateFilter && Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : [];

  return [
    ...matchStage,
    ...getBossNameCleaningStages(),
    {
      $group: {
        _id: {
          bossName: "$cleanBossName",
          timestamp: "$timestamp"
        }
      }
    },
    {
      $group: {
        _id: { $toLower: "$_id.bossName" },
        count: { $sum: 1 }
      }
    }
  ];
};
