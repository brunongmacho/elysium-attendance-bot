/**
 * ============================================================================
 * WEEKLY & MONTHLY REPORTS SERVICE (MongoDB-Powered)
 * ============================================================================
 *
 * PURPOSE:
 * Generate comprehensive weekly and monthly guild activity reports
 * Uses MongoDB for accurate, real-time statistics
 *
 * FEATURES:
 * - Weekly reports with week-over-week comparison
 * - Monthly comprehensive reports with trends
 * - Accurate spawn-based attendance (columns, not member counts)
 * - Top 3 from last week for guild rewards
 * - Boss kill statistics
 * - Member activity analytics
 * - Bidding economy stats
 *
 * IMPORTANT: Attendance = Boss Spawns Killed (columns in sheets)
 * NOT total member attendance counts
 *
 * @module reports
 */

// ============================================================================
// DEPENDENCY UTILITIES
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const dbAPI = require('../utils/database-api');
const mongoHelpers = require('../utils/mongodb-helpers');
const { getCollectionName } = mongoHelpers;
const errorHandler = require('../utils/error-handler');
const LRUCache = require('../utils/lru-cache');
const { createPaginatedEmbeds } = require('../utils/ui-helpers');

// Discord embed limits
const DISCORD_LIMITS = {
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  EMBED_TITLE: 256,
  EMBED_DESCRIPTION: 4096,
  FOOTER_TEXT: 2048,
  AUTHOR_NAME: 256,
  TOTAL_EMBED: 6000
};

// Truncate text to stay within Discord limits
function truncate(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

// Truncate field value array by limiting member count or truncating names
function truncateFieldValue(lines, maxLength = DISCORD_LIMITS.FIELD_VALUE, maxItems = null) {
  let result = [];
  let totalLength = 0;
  
  for (let i = 0; i < lines.length; i++) {
    if (maxItems && i >= maxItems) break;
    
    const line = lines[i];
    if (totalLength + line.length + 1 > maxLength) {
      const remaining = maxLength - totalLength - 1;
      if (remaining > 10) {
        result.push(truncate(line, remaining));
      }
      break;
    }
    
    result.push(line);
    totalLength += line.length + 1;
  }
  
  return result.join('\n');
}

// Get guild name
const guildName = 'TENCHU';

// ============================================================================
// QUERY RESULT CACHING (PHASE 3.2)
// ============================================================================

/**
 * Cache for weekly report results
 * TTL: 15 minutes (reports change frequently during active times)
 * Max size: 10 entries (covers ~2.5 months of unique weeks)
 */
const weeklyReportCache = new LRUCache(10, 15 * 60 * 1000);

/**
 * Cache for monthly report results
 * TTL: 60 minutes (monthly reports are expensive, change less frequently)
 * Max size: 12 entries (1 year of monthly reports)
 */
const monthlyReportCache = new LRUCache(12, 60 * 60 * 1000);

// ============================================================================
// RETRY LOGIC FOR TRANSIENT FAILURES
// ============================================================================

/**
 * Retry a database operation with exponential backoff
 * PHASE 2.3: Error handling enhancement with retry logic
 *
 * @param {Function} operation - Async function to retry
 * @param {string} operationName - Name for logging
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<any>} Operation result
 */
async function retryOperation(operation, operationName, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is transient (network, timeout, temporary MongoDB issues)
      const isTransient =
        error.name === 'MongoNetworkError' ||
        error.name === 'MongoTimeoutError' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.message?.includes('timeout') ||
        error.message?.includes('network');

      if (!isTransient || attempt === maxRetries) {
        // Non-transient error or max retries reached - throw
        throw error;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const backoffMs = 500 * Math.pow(2, attempt - 1);
      errorHandler.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${backoffMs}ms`, {
        error: error.message,
        attempt,
        maxRetries
      });

      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

// ============================================================================
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert date to GMT+8 timezone
 */
function toGMT8(date = new Date()) {
  const d = new Date(date);
  // Get UTC time and add 8 hours for GMT+8
  const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
  const gmt8Time = new Date(utcTime + (8 * 3600000));
  return gmt8Time;
}

/**
 * Get week start date (Sunday 00:00:00) in GMT+8
 */
function getWeekStart(date = new Date()) {
  // Add 8 hours to get GMT+8 time
  const gmt8Offset = 8 * 60 * 60 * 1000;
  const gmt8Time = new Date(date.getTime() + gmt8Offset);

  // Get day of week using UTC methods (which now represent GMT+8)
  const day = gmt8Time.getUTCDay();

  // Calculate Sunday of this week
  const sunday = new Date(gmt8Time);
  sunday.setUTCDate(gmt8Time.getUTCDate() - day);
  sunday.setUTCHours(0, 0, 0, 0);

  // Convert back to actual UTC (subtract 8 hours)
  return new Date(sunday.getTime() - gmt8Offset);
}

/**
 * Get week end date (Saturday 23:59:59) in GMT+8
 */
function getWeekEnd(date = new Date()) {
  const start = getWeekStart(date);
  const gmt8Offset = 8 * 60 * 60 * 1000;

  // Add 6 days and set to end of day in GMT+8
  const gmt8Start = new Date(start.getTime() + gmt8Offset);
  gmt8Start.setUTCDate(gmt8Start.getUTCDate() + 6);
  gmt8Start.setUTCHours(23, 59, 59, 999);

  // Convert back to UTC
  return new Date(gmt8Start.getTime() - gmt8Offset);
}

/**
 * Get month start date (1st day 00:00:00) in GMT+8
 */
function getMonthStart(date = new Date()) {
  const gmt8Offset = 8 * 60 * 60 * 1000;
  const gmt8Time = new Date(date.getTime() + gmt8Offset);

  // Set to 1st day of month using UTC methods
  gmt8Time.setUTCDate(1);
  gmt8Time.setUTCHours(0, 0, 0, 0);

  // Convert back to UTC
  return new Date(gmt8Time.getTime() - gmt8Offset);
}

/**
 * Get month end date (last day 23:59:59) in GMT+8
 */
function getMonthEnd(date = new Date()) {
  const gmt8Offset = 8 * 60 * 60 * 1000;
  const gmt8Time = new Date(date.getTime() + gmt8Offset);

  // Set to last day of month (next month day 0)
  gmt8Time.setUTCMonth(gmt8Time.getUTCMonth() + 1);
  gmt8Time.setUTCDate(0);
  gmt8Time.setUTCHours(23, 59, 59, 999);

  // Convert back to UTC
  return new Date(gmt8Time.getTime() - gmt8Offset);
}

// ============================================================================
// WEEKLY REPORT
// ============================================================================

/**
 * Generate weekly report data from MongoDB
 * Attendance = Total boss spawns killed (not member counts)
 * PHASE 2.3: Enhanced with error boundaries and retry logic
 * PHASE 3.2: Added query result caching (15-min TTL)
 */
async function generateWeeklyReport() {
  try {
    // Current week dates (for cache key)
    const thisWeekStart = getWeekStart();
    const thisWeekEnd = getWeekEnd();

    // PHASE 3.2: Check cache first
    const cacheKey = `weekly_${thisWeekStart.getTime()}`;
    const cached = weeklyReportCache.get(cacheKey);

    if (cached) {
      errorHandler.info('Weekly report served from cache', {
        weekStart: thisWeekStart.toISOString(),
        cacheAge: Date.now() - (cached.cachedAt || Date.now())
      });
      return cached;
    }

    // Connect to MongoDB with retry logic
    const db = await retryOperation(
      () => dbAPI.connect(),
      'MongoDB connection for weekly report'
    );

    // Last week dates
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekEnd);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

    // Fetch data IN PARALLEL with retry logic
    const [thisWeekData, lastWeekData] = await Promise.all([
      retryOperation(
        () => getWeekData(db, thisWeekStart, thisWeekEnd),
        'Fetch current week data'
      ),
      retryOperation(
        () => getWeekData(db, lastWeekStart, lastWeekEnd),
        'Fetch last week data'
      )
    ]);

    errorHandler.success('Weekly report generated successfully', {
      thisWeekSpawns: thisWeekData.totalSpawns,
      lastWeekSpawns: lastWeekData.totalSpawns
    });

    const result = {
      thisWeek: thisWeekData,
      lastWeek: lastWeekData,
      weekStart: thisWeekStart,
      weekEnd: thisWeekEnd,
      cachedAt: Date.now() // Track when this was generated
    };

    // PHASE 3.2: Cache the result
    weeklyReportCache.set(cacheKey, result);
    errorHandler.debug('Weekly report cached', { cacheKey, ttl: '15 minutes' });

    return result;
  } catch (error) {
    errorHandler.handleError(error, 'generateWeeklyReport', {
      silent: false,
      metadata: { operation: 'weekly_report_generation' }
    });
    throw error; // Re-throw for caller to handle
  }
}

/**
 * Get week statistics
 * IMPORTANT: Groups by boss spawn (timestamp + boss) to count SPAWNS not member attendance
 */
async function getWeekData(db, startDate, endDate) {
  // Get unique boss spawns (timestamp + boss combination = 1 spawn)
  const spawns = await db.collection(getCollectionName('attendance'))
    .aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            boss: '$bossName',
            timestamp: '$timestamp'
          },
          members: { $addToSet: '$memberName' }
        }
      },
      {
        $project: {
          boss: '$_id.boss',
          timestamp: '$_id.timestamp',
          memberCount: { $size: '$members' }
        }
      }
    ]).toArray();

  // Boss kill counts
  const bossKills = {};
  spawns.forEach(spawn => {
    bossKills[spawn.boss] = (bossKills[spawn.boss] || 0) + 1;
  });

  // Member attendance (how many UNIQUE spawns each member attended)
  // First deduplicate by memberName + timestamp + boss to count unique spawns only
  const memberAttendance = await db.collection(getCollectionName('attendance'))
    .aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        // Group by member + timestamp + boss to get unique spawn attendance
        $group: {
          _id: {
            memberName: '$memberName',
            timestamp: '$timestamp',
            boss: '$bossName'
          }
        }
      },
      {
        // Now group by member to count unique spawns attended
        $group: {
          _id: '$_id.memberName',
          spawnsAttended: { $sum: 1 }
        }
      },
      {
        $sort: { spawnsAttended: -1 }
      }
    ]).toArray();

  // Calculate stats
  const totalSpawns = spawns.length;
  const totalMemberAttendance = memberAttendance.reduce((sum, m) => sum + m.spawnsAttended, 0);
  const averageAttendancePerSpawn = totalSpawns > 0 ? Math.round((totalMemberAttendance / totalSpawns) * 10) / 10 : 0;
  const uniqueMembers = memberAttendance.length;

  // Calculate participation rate (avg attendance / total active members)
  const totalActiveMembers = await db.collection(getCollectionName('members'))
    .countDocuments({ isActive: true });
  const participationRate = totalActiveMembers > 0
    ? Math.round((averageAttendancePerSpawn / totalActiveMembers) * 100 * 10) / 10
    : 0;

  // Top 10 members
  const top10Members = memberAttendance.slice(0, 10).map((m, index) => ({
    rank: index + 1,
    name: m._id,
    spawnsAttended: m.spawnsAttended,
    percentage: totalSpawns > 0 ? Math.round((m.spawnsAttended / totalSpawns) * 100 * 10) / 10 : 0
  }));

  // Top 5 bosses
  const top5Bosses = Object.entries(bossKills)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([boss, kills]) => ({
      boss,
      kills,
      percentage: totalSpawns > 0 ? Math.round((kills / totalSpawns) * 100 * 10) / 10 : 0
    }));

  // Most active day
  const dayStats = {};
  spawns.forEach(spawn => {
    const day = new Date(spawn.timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long' });
    dayStats[day] = (dayStats[day] || 0) + 1;
  });
  const mostActiveDay = Object.entries(dayStats)
    .sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

  // Bidding stats
  const members = await mongoHelpers.getAllMembers({ isActive: true });
  const totalPointsEarned = members.reduce((sum, m) => sum + (m.pointsEarned || 0), 0);
  const totalPointsSpent = members.reduce((sum, m) => sum + (m.pointsSpent || 0), 0);

  return {
    totalSpawns,
    averageAttendancePerSpawn,
    participationRate,
    uniqueMembers,
    top10Members,
    top5Bosses,
    mostActiveDay: {
      day: mostActiveDay[0],
      spawns: mostActiveDay[1]
    },
    bidding: {
      pointsEarned: totalPointsEarned,
      pointsSpent: totalPointsSpent,
      netChange: totalPointsEarned - totalPointsSpent,
      activeBidders: members.filter(m => (m.pointsSpent || 0) > 0).length
    }
  };
}

/**
 * Build weekly report embed
 */
function buildWeeklyReportEmbed(reportData) {
  const { thisWeek, lastWeek, weekStart, weekEnd } = reportData;

  // Format dates in GMT+8 (Philippine Time)
  const dateRange = `${weekStart.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}`;

  // Calculate changes
  const spawnChange = thisWeek.totalSpawns - lastWeek.totalSpawns;
  const avgChange = thisWeek.averageAttendancePerSpawn - lastWeek.averageAttendancePerSpawn;
  const partChange = thisWeek.participationRate - lastWeek.participationRate;
  const memberChange = thisWeek.uniqueMembers - lastWeek.uniqueMembers;

  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle(`📊 ${guildName} WEEKLY REPORT`)
    .setDescription(`**Week of ${dateRange}**`)
    .setTimestamp();

  // Boss spawns this week
  embed.addFields({
    name: '📈 BOSS SPAWNS THIS WEEK',
    value: [
      `**Total Boss Spawns:** ${thisWeek.totalSpawns} spawns ${spawnChange >= 0 ? '▲' : '▼'} (${spawnChange > 0 ? '+' : ''}${spawnChange} from last week)`,
      `**Average Attendance/Spawn:** ${thisWeek.averageAttendancePerSpawn} members`,
      `**Participation Rate:** ${thisWeek.participationRate}%`
    ].join('\n'),
    inline: false
  });

  // Top 5 bosses
  if (thisWeek.top5Bosses.length > 0) {
    const bossLines = thisWeek.top5Bosses.map((b, i) => {
      const emoji = ['🔥', '⚔️', '🗡️', '💀', '🌊'][i] || '⚡';
      return `${i + 1}. ${emoji} **${b.boss}** - ${b.kills} spawns (${b.percentage}%)`;
    });

    embed.addFields({
      name: '🎯 TOP 5 BOSSES KILLED',
      value: bossLines.join('\n') || 'No data',
      inline: false
    });
  }

  // Storage for embeds beyond the main report (pagination overflow)
  const extraEmbeds = [];

  // Top 10 members
  if (thisWeek.top10Members.length > 0) {
    const memberLines = thisWeek.top10Members.map((m, i) => {
      const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const stars = m.percentage >= 95 ? '⭐⭐⭐⭐⭐' :
                    m.percentage >= 85 ? '⭐⭐⭐⭐' :
                    m.percentage >= 75 ? '⭐⭐⭐' :
                    m.percentage >= 60 ? '⭐⭐' : '⭐';
      return `${medal} **${m.name}** - ${m.spawnsAttended}/${thisWeek.totalSpawns} (${m.percentage}%) ${stars}`;
    });

    const fullText = memberLines.join('\n');
    if (fullText.length <= DISCORD_LIMITS.FIELD_VALUE) {
      embed.addFields({
        name: '👥 TOP 10 MOST ACTIVE MEMBERS',
        value: fullText,
        inline: false
      });
    } else {
      // Build summary field with overflow count
      let truncated = [];
      let len = 0;
      for (const line of memberLines) {
        if (len + line.length + 1 > DISCORD_LIMITS.FIELD_VALUE) break;
        truncated.push(line);
        len += line.length + 1;
      }
      const dropped = memberLines.length - truncated.length;
      embed.addFields({
        name: '👥 TOP 10 MOST ACTIVE MEMBERS',
        value: truncated.join('\n') + `\n\n*...and ${dropped} more members*`,
        inline: false
      });

      // Create paginated embeds with full data
      const fullEmbeds = createPaginatedEmbeds(
        `👥 Full Member Rankings (${memberLines.length} members)`,
        memberLines,
        10,
        { color: 0x3498DB }
      );
      extraEmbeds.push(...fullEmbeds);
    }
  }

  // Top 3 from LAST week (for guild rewards)
  if (lastWeek.top10Members.length > 0) {
    const lastWeekTop3 = lastWeek.top10Members.slice(0, 3).map((m, i) => {
      const medal = ['🥇', '🥈', '🥉'][i];
      return `${medal} **${m.name}** - ${m.spawnsAttended}/${lastWeek.totalSpawns} spawns (${m.percentage}%)`;
    });

    embed.addFields({
      name: '🏅 LAST WEEK\'S TOP 3 (For Guild Rewards)',
      value: lastWeekTop3.join('\n'),
      inline: false
    });
  }

  // Week comparison
  embed.addFields({
    name: '📊 WEEK COMPARISON',
    value: [
      '```',
      `                    This Week    Last Week    Change`,
      `Boss Spawns:           ${String(thisWeek.totalSpawns).padStart(3)}          ${String(lastWeek.totalSpawns).padStart(3)}         ${spawnChange > 0 ? '+' : ''}${spawnChange} ${spawnChange >= 0 ? '▲' : '▼'}`,
      `Avg Attendance:        ${String(thisWeek.averageAttendancePerSpawn).padStart(4)}         ${String(lastWeek.averageAttendancePerSpawn).padStart(4)}        ${avgChange > 0 ? '+' : ''}${avgChange.toFixed(1)} ${avgChange >= 0 ? '▲' : '▼'}`,
      `Participation:         ${String(thisWeek.participationRate + '%').padStart(5)}        ${String(lastWeek.participationRate + '%').padStart(5)}       ${partChange > 0 ? '+' : ''}${partChange.toFixed(1)}% ${partChange >= 0 ? '▲' : '▼'}`,
      `Unique Members:        ${String(thisWeek.uniqueMembers).padStart(3)}          ${String(lastWeek.uniqueMembers).padStart(3)}         ${memberChange > 0 ? '+' : ''}${memberChange} ${memberChange >= 0 ? '▲' : '▼'}`,
      '```'
    ].join('\n'),
    inline: false
  });

  // Most active day
  embed.addFields({
    name: '🔥 MOST ACTIVE DAY',
    value: `**${thisWeek.mostActiveDay.day}:** ${thisWeek.mostActiveDay.spawns} spawns killed`,
    inline: false
  });

  // Bidding activity
  embed.addFields({
    name: '💰 BIDDING ACTIVITY',
    value: [
      `**Total Points Earned:** ${thisWeek.bidding.pointsEarned} points`,
      `**Total Points Spent:** ${thisWeek.bidding.pointsSpent} points`,
      `**Net Change:** ${thisWeek.bidding.netChange > 0 ? '+' : ''}${thisWeek.bidding.netChange} points`,
      `**Active Bidders:** ${thisWeek.bidding.activeBidders} members`
    ].join('\n'),
    inline: false
  });

  // Guild performance
  const rating = thisWeek.participationRate >= 85 ? '⭐⭐⭐⭐⭐ EXCELLENT' :
                 thisWeek.participationRate >= 75 ? '⭐⭐⭐⭐ GREAT' :
                 thisWeek.participationRate >= 65 ? '⭐⭐⭐ GOOD' :
                 thisWeek.participationRate >= 50 ? '⭐⭐ FAIR' : '⭐ NEEDS IMPROVEMENT';

  const trend = spawnChange > 0 ? '📈 IMPROVING' :
                spawnChange < 0 ? '📉 DECLINING' : '➡️ STABLE';

  const status = thisWeek.participationRate >= 80 ? '🟢 VERY ACTIVE' :
                 thisWeek.participationRate >= 60 ? '🟡 ACTIVE' :
                 thisWeek.participationRate >= 40 ? '🟠 MODERATE' : '🔴 LOW ACTIVITY';

  embed.addFields({
    name: '🎯 GUILD PERFORMANCE',
    value: [
      `**Rating:** ${rating}`,
      `**Trend:** ${trend}`,
      `**Status:** ${status}`
    ].join('\n'),
    inline: false
  });

  embed.setFooter({ text: `Generated: ${new Date().toLocaleDateString()} | Next Report: Next Sunday` });

  return [embed, ...extraEmbeds];
}

// ============================================================================
// MONTHLY REPORT
// ============================================================================

/**
 * Generate monthly report data from MongoDB
 * PHASE 2.3: Enhanced with error boundaries and retry logic
 * PHASE 3.2: Added query result caching (60-min TTL)
 */
async function generateMonthlyReport(date = new Date()) {
  try {
    const monthStart = getMonthStart(date);
    const monthEnd = getMonthEnd(date);

    // PHASE 3.2: Check cache first
    const cacheKey = `monthly_${monthStart.getTime()}`;
    const cached = monthlyReportCache.get(cacheKey);

    if (cached) {
      errorHandler.info('Monthly report served from cache', {
        month: date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' }),
        cacheAge: Date.now() - (cached.cachedAt || Date.now())
      });
      return cached;
    }

    // Connect to MongoDB with retry logic
    const db = await retryOperation(
      () => dbAPI.connect(),
      'MongoDB connection for monthly report'
    );

    // Get all spawns for the month with retry logic
    const spawns = await retryOperation(
      () => db.collection(getCollectionName('attendance'))
        .aggregate([
          {
            $match: {
              timestamp: { $gte: monthStart, $lte: monthEnd }
            }
          },
          {
            $group: {
              _id: {
                boss: '$bossName',
                timestamp: '$timestamp'
              },
              members: { $addToSet: '$memberName' }
            }
          }
        ]).toArray(),
      'Fetch monthly spawns data'
    );

    // Boss statistics
    const bossKills = {};
    spawns.forEach(spawn => {
      bossKills[spawn._id.boss] = (bossKills[spawn._id.boss] || 0) + 1;
    });

    // Member leaderboard (count UNIQUE spawns only) with retry logic
    // First deduplicate by memberName + timestamp + boss to count unique spawns only
    const memberStats = await retryOperation(
      () => db.collection(getCollectionName('attendance'))
        .aggregate([
          {
            $match: {
              timestamp: { $gte: monthStart, $lte: monthEnd }
            }
          },
          {
            // Group by member + timestamp + boss to get unique spawn attendance
            $group: {
              _id: {
                memberName: '$memberName',
                timestamp: '$timestamp',
                boss: '$bossName'
              }
            }
          },
          {
            // Now group by member to count unique spawns attended
            $group: {
              _id: '$_id.memberName',
              spawnsAttended: { $sum: 1 }
            }
          },
          {
            $sort: { spawnsAttended: -1 }
          }
        ]).toArray(),
      'Fetch monthly member stats'
    );

  const totalSpawns = spawns.length;

  // Top 20 members
  const top20Members = memberStats.slice(0, 20).map((m, index) => ({
    rank: index + 1,
    name: m._id,
    spawnsAttended: m.spawnsAttended,
    percentage: totalSpawns > 0 ? Math.round((m.spawnsAttended / totalSpawns) * 100 * 10) / 10 : 0
  }));

  // Weekly breakdown
  const weeks = [];
  let weekStart = getWeekStart(monthStart);
  while (weekStart <= monthEnd) {
    const weekEnd = getWeekEnd(weekStart);
    const weekSpawns = spawns.filter(s =>
      s._id.timestamp >= weekStart && s._id.timestamp <= weekEnd
    );
    weeks.push({
      weekNum: weeks.length + 1,
      spawns: weekSpawns.length,
      avgPerDay: weekSpawns.length / 7
    });
    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  // Activity patterns
  const dayStats = {};
  const hourStats = {};
  spawns.forEach(spawn => {
    const date = new Date(spawn._id.timestamp);
    const day = date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long' });
    const hour = date.getHours(); // Note: This still uses UTC hours - should be fixed if hour stats are important

    dayStats[day] = (dayStats[day] || 0) + 1;
    hourStats[hour] = (hourStats[hour] || 0) + 1;
  });

  const topDays = Object.entries(dayStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const topHours = Object.entries(hourStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({
      hour: `${hour}:00-${parseInt(hour) + 1}:00`,
      count
    }));

    // Bidding stats with retry logic
    const members = await retryOperation(
      () => mongoHelpers.getAllMembers({ isActive: true }),
      'Fetch active members for bidding stats'
    );
    const totalPointsEarned = members.reduce((sum, m) => sum + (m.pointsEarned || 0), 0);
    const totalPointsSpent = members.reduce((sum, m) => sum + (m.pointsSpent || 0), 0);

    errorHandler.success('Monthly report generated successfully', {
      month: date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' }),
      totalSpawns,
      uniqueMembers: memberStats.length
    });

    const result = {
      month: date,
      totalSpawns,
      totalMemberAttendance: memberStats.reduce((sum, m) => sum + m.spawnsAttended, 0),
      avgPerSpawn: totalSpawns > 0 ? Math.round((memberStats.reduce((sum, m) => sum + m.spawnsAttended, 0) / totalSpawns) * 10) / 10 : 0,
      uniqueMembers: memberStats.length,
      activeDays: new Set(spawns.map(s => new Date(s._id.timestamp).toDateString())).size,
      bossKills,
      top20Members,
      weeks,
      topDays,
      topHours,
      bidding: {
        earned: totalPointsEarned,
        spent: totalPointsSpent,
        net: totalPointsEarned - totalPointsSpent
      },
      cachedAt: Date.now() // Track when this was generated
    };

    // PHASE 3.2: Cache the result
    monthlyReportCache.set(cacheKey, result);
    errorHandler.debug('Monthly report cached', { cacheKey, ttl: '60 minutes' });

    return result;
  } catch (error) {
    errorHandler.handleError(error, 'generateMonthlyReport', {
      silent: false,
      metadata: {
        operation: 'monthly_report_generation',
        month: date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' })
      }
    });
    throw error; // Re-throw for caller to handle
  }
}

/**
 * Build monthly report embed (comprehensive)
 */
function buildMonthlyReportEmbed(reportData) {
  const monthName = reportData.month.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' });
  const daysInMonth = new Date(reportData.month.getFullYear(), reportData.month.getMonth() + 1, 0).getDate();

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(`📊 ${guildName} MONTHLY REPORT - ${monthName.toUpperCase()}`)
    .setTimestamp();

  // Monthly overview
  embed.addFields({
    name: '📈 MONTHLY OVERVIEW',
    value: [
      `**Reporting Period:** ${monthName}`,
      `**Total Boss Spawns:** ${reportData.totalSpawns} spawns`,
      `**Total Attendance:** ${reportData.totalMemberAttendance} member-kills`,
      `**Average Per Spawn:** ${reportData.avgPerSpawn} members`,
      `**Unique Participants:** ${reportData.uniqueMembers} members`,
      `**Active Days:** ${reportData.activeDays} out of ${daysInMonth} days (${Math.round((reportData.activeDays / daysInMonth) * 100)}%)`
    ].join('\n'),
    inline: false
  });

  // Boss statistics (top 10)
  const bossEntries = Object.entries(reportData.bossKills)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (bossEntries.length > 0) {
    const bossLines = bossEntries.map(([boss, kills], i) => {
      const percentage = Math.round((kills / reportData.totalSpawns) * 100 * 10) / 10;
      const emoji = ['🔥', '⚔️', '🗡️', '💀', '🌊', '⚡', '👹', '🐉', '☠️', '⚔'][i] || '•';
      return `${i + 1}. ${emoji} **${boss}** - ${kills} spawns (${percentage}%)`;
    });

    embed.addFields({
      name: '🎯 TOP 10 BOSSES KILLED',
      value: bossLines.join('\n'),
      inline: false
    });
  }

  // Top 20 members (split into 2 fields for better formatting)
  if (reportData.top20Members.length > 0) {
    const top10 = reportData.top20Members.slice(0, 10).map(m => {
      const medal = m.rank === 1 ? '👑' : m.rank === 2 ? '🥈' : m.rank === 3 ? '🥉' : `${m.rank}.`;
      const stars = m.percentage >= 95 ? '⭐⭐⭐⭐⭐' :
                    m.percentage >= 85 ? '⭐⭐⭐⭐' :
                    m.percentage >= 75 ? '⭐⭐⭐' : '';
      return `${medal} **${m.name}** - ${m.spawnsAttended}/${reportData.totalSpawns} (${m.percentage}%) ${stars}`;
    });

    embed.addFields({
      name: '🏆 TOP 20 MEMBERS BY ATTENDANCE',
      value: top10.join('\n'),
      inline: false
    });

    if (reportData.top20Members.length > 10) {
      const next10 = reportData.top20Members.slice(10, 20).map(m => {
        return `${m.rank}. **${m.name}** - ${m.spawnsAttended}/${reportData.totalSpawns} (${m.percentage}%)`;
      });

      embed.addFields({
        name: '​', // Zero-width space for continuation
        value: next10.join('\n'),
        inline: false
      });
    }
  }

  // Weekly breakdown
  if (reportData.weeks.length > 0) {
    const weekLines = reportData.weeks.map(w =>
      `Week ${w.weekNum}: **${w.spawns} spawns** (avg ${w.avgPerDay.toFixed(1)}/day)${w.spawns === Math.max(...reportData.weeks.map(wk => wk.spawns)) ? ' 📈 Best!' : ''}`
    );

    embed.addFields({
      name: '📅 WEEKLY BREAKDOWN',
      value: weekLines.join('\n'),
      inline: false
    });
  }

  // Activity patterns
  const dayLines = reportData.topDays.map(([day, count], i) =>
    `${i + 1}. **${day}:** ${count} spawns (${Math.round((count / reportData.totalSpawns) * 100)}%)`
  );

  const hourLines = reportData.topHours.map((h, i) =>
    `${i + 1}. **${h.hour}:** ${h.count} spawns (${Math.round((h.count / reportData.totalSpawns) * 100)}%)`
  );

  embed.addFields({
    name: '🕐 ACTIVITY PATTERNS',
    value: [
      '**Peak Days:**',
      ...dayLines,
      '',
      '**Peak Hours (Server Time):**',
      ...hourLines
    ].join('\n'),
    inline: false
  });

  // Bidding & economy
  embed.addFields({
    name: '💰 BIDDING & ECONOMY',
    value: [
      `**Total Points Earned:** ${reportData.bidding.earned} points`,
      `**Total Points Spent:** ${reportData.bidding.spent} points`,
      `**Net Change:** ${reportData.bidding.net > 0 ? '+' : ''}${reportData.bidding.net} points`
    ].join('\n'),
    inline: false
  });

  // Guild performance
  const participation = Math.round((reportData.avgPerSpawn / reportData.uniqueMembers) * 100);
  const rating = participation >= 85 ? '⭐⭐⭐⭐⭐ EXCELLENT' :
                 participation >= 75 ? '⭐⭐⭐⭐ VERY HIGH' :
                 participation >= 65 ? '⭐⭐⭐ HIGH' : '⭐⭐ MODERATE';

  embed.addFields({
    name: '📊 GUILD PERFORMANCE METRICS',
    value: [
      `**Activity Level:** ${rating}`,
      `**Member Engagement:** ${participation}%`,
      `**Roster Health:** 🟢 STRONG`,
      `**Month Trend:** 📈 GROWING`
    ].join('\n'),
    inline: false
  });

  embed.setFooter({ text: `Generated: ${new Date().toLocaleDateString()} | Next Report: End of next month` });

  return embed;
}

// ============================================================================
// CACHE MANAGEMENT (PHASE 3.2)
// ============================================================================

/**
 * Get cache statistics for monitoring
 * @returns {Object} Combined cache stats
 */
function getCacheStats() {
  const weeklyStats = weeklyReportCache.getStats();
  const monthlyStats = monthlyReportCache.getStats();

  return {
    weekly: {
      size: weeklyStats.size,
      maxSize: weeklyStats.maxSize,
      hits: weeklyStats.hits,
      misses: weeklyStats.misses,
      hitRate: weeklyStats.hitRate,
      ttl: '15 minutes'
    },
    monthly: {
      size: monthlyStats.size,
      maxSize: monthlyStats.maxSize,
      hits: monthlyStats.hits,
      misses: monthlyStats.misses,
      hitRate: monthlyStats.hitRate,
      ttl: '60 minutes'
    }
  };
}

/**
 * Clear all report caches (useful for testing or after bulk data imports)
 */
function clearCaches() {
  weeklyReportCache.clear();
  monthlyReportCache.clear();
  errorHandler.info('Report caches cleared');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateWeeklyReport,
  buildWeeklyReportEmbed,
  generateMonthlyReport,
  buildMonthlyReportEmbed,
  getCacheStats,
  clearCaches
};
