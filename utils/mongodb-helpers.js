/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - MongoDB Helper Functions
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Helper functions for MongoDB operations
 * Provides clean API for common database operations
 *
 * Features:
 * - Member management (get, update, create)
 * - Points management (add, subtract, check)
 * - Auction item management
 * - Attendance management
 * - Bot state management
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('./database-api');
const CircuitBreaker = require('./circuit-breaker');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Circuit breaker for MongoDB operations
const mongoBreaker = new CircuitBreaker({
  threshold: 5,
  timeout: 60000,
  name: 'MongoDB'
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMBER OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get member by username (case-insensitive)
 * @param {string} username - Member username
 * @returns {Promise<Object|null>} - Member document or null
 */
async function getMemberByUsername(username) {
  const db = await dbAPI.connect();
  // Case-insensitive search to prevent duplicates from case variations
  return await db.collection('members').findOne({
    username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  });
}

/**
 * Get member by Discord ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>} - Member document or null
 */
async function getMemberByDiscordId(userId) {
  const db = await dbAPI.connect();
  return await db.collection('members').findOne({ _id: userId });
}

/**
 * Get member by either Discord ID or username (case-insensitive)
 * @param {string} identifier - Discord ID or username
 * @returns {Promise<Object|null>} - Member document or null
 */
async function getMember(identifier) {
  const db = await dbAPI.connect();

  // Try by Discord ID first
  let member = await db.collection('members').findOne({ _id: identifier });

  // If not found, try by username (case-insensitive)
  if (!member) {
    member = await db.collection('members').findOne({
      username: { $regex: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
  }

  return member;
}

/**
 * Get all members
 * @param {Object} filter - Optional filter criteria
 * @returns {Promise<Array>} - Array of member documents
 */
async function getAllMembers(filter = {}) {
  const db = await dbAPI.connect();
  return await db.collection('members').find(filter).toArray();
}

/**
 * Create new member
 * @param {Object} memberData - Member data
 * @returns {Promise<Object>} - Created member document
 */
async function createMember(memberData) {
  const db = await dbAPI.connect();

  const member = {
    _id: memberData.userId || `temp_${memberData.username.toLowerCase().replace(/\s+/g, '_')}`,
    username: memberData.username,
    pointsAvailable: memberData.pointsAvailable || 0,
    pointsEarned: memberData.pointsEarned || 0,
    pointsSpent: memberData.pointsSpent || 0,
    attendance: {
      total: 0,
      thisWeek: 0,
      thisMonth: 0,
      byBoss: {},
      streak: {
        current: 0,
        longest: 0
      }
    },
    joinedAt: new Date(),
    lastActive: new Date()
  };

  await db.collection('members').insertOne(member);
  return member;
}

/**
 * Update member data
 * @param {string} identifier - Discord ID or username
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Update result
 */
async function updateMember(identifier, updates) {
  const db = await dbAPI.connect();

  // Find member first
  const member = await getMember(identifier);
  if (!member) {
    throw new Error(`Member not found: ${identifier}`);
  }

  // Update member
  const result = await db.collection('members').updateOne(
    { _id: member._id },
    { $set: { ...updates, lastActive: new Date() } }
  );

  return result;
}

/**
 * Remove member
 * @param {string} identifier - Discord ID or username
 * @returns {Promise<Object>} - Delete result
 */
async function removeMember(identifier) {
  const db = await dbAPI.connect();

  // Find member first
  const member = await getMember(identifier);
  if (!member) {
    throw new Error(`Member not found: ${identifier}`);
  }

  // Delete member
  const result = await db.collection('members').deleteOne({ _id: member._id });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// POINTS OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get member's available points
 * @param {string} identifier - Discord ID or username
 * @returns {Promise<number>} - Available points
 */
async function getMemberPoints(identifier) {
  const member = await getMember(identifier);
  if (!member) {
    throw new Error(`Member not found: ${identifier}`);
  }
  return member.pointsAvailable || 0;
}

/**
 * Update member points
 * @param {string} identifier - Discord ID or username
 * @param {number} pointsChange - Points to add (positive) or subtract (negative)
 * @param {string} reason - Reason for point change (for tracking)
 * @returns {Promise<Object>} - Updated member
 */
async function updateMemberPoints(identifier, pointsChange, reason = 'Unknown') {
  const db = await dbAPI.connect();

  // Find member first
  const member = await getMember(identifier);
  if (!member) {
    throw new Error(`Member not found: ${identifier}`);
  }

  // Update points
  const updateFields = {
    $inc: {
      pointsAvailable: pointsChange
    },
    $set: {
      lastActive: new Date()
    }
  };

  // Track earned vs spent
  if (pointsChange > 0) {
    updateFields.$inc.pointsEarned = pointsChange;
  } else if (pointsChange < 0) {
    updateFields.$inc.pointsSpent = Math.abs(pointsChange);
  }

  await db.collection('members').updateOne(
    { _id: member._id },
    updateFields
  );

  // Return updated member
  return await getMemberByDiscordId(member._id);
}

/**
 * Check if member has enough points
 * @param {string} identifier - Discord ID or username
 * @param {number} requiredPoints - Points needed
 * @returns {Promise<boolean>} - True if member has enough points
 */
async function hasEnoughPoints(identifier, requiredPoints) {
  const points = await getMemberPoints(identifier);
  return points >= requiredPoints;
}

/**
 * Get all members' points summary
 * @returns {Promise<Object>} - Map of username -> points
 */
async function getAllMemberPoints() {
  const members = await getAllMembers();
  const pointsMap = {};

  for (const member of members) {
    pointsMap[member.username] = member.pointsAvailable || 0;
  }

  return pointsMap;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUCTION OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get auction queue (pending items)
 * @returns {Promise<Array>} - Array of pending auction items
 */
async function getAuctionQueue() {
  const db = await dbAPI.connect();
  return await db.collection('auctionItems')
    .find({ status: 'pending' })
    .sort({ addedAt: 1 })
    .toArray();
}

/**
 * Get next auction item
 * @returns {Promise<Object|null>} - Next item in queue or null
 */
async function getNextAuctionItem() {
  const db = await dbAPI.connect();
  return await db.collection('auctionItems')
    .findOne({ status: 'pending' }, { sort: { addedAt: 1 } });
}

/**
 * Add item to auction queue
 * @param {Object} itemData - Item data
 * @returns {Promise<Object>} - Created item
 */
async function addAuctionItem(itemData) {
  const db = await dbAPI.connect();

  const item = {
    itemName: itemData.itemName,
    startPrice: itemData.startPrice || 0,
    duration: itemData.duration || 30,
    quantity: itemData.quantity || 1,
    boss: itemData.boss || 'Unknown',
    source: itemData.source || 'manual',
    status: 'pending',
    winner: null,
    winnerId: null,
    winningBid: null,
    soldAt: null,
    addedAt: new Date(),
    sheetRow: itemData.sheetRow || null
  };

  const result = await db.collection('auctionItems').insertOne(item);
  return { ...item, _id: result.insertedId };
}

/**
 * Mark auction item as sold
 * @param {string} itemId - Item ID or item name
 * @param {Object} winner - Winner info { username, userId }
 * @param {number} winningBid - Final bid amount
 * @returns {Promise<Object>} - Updated item
 */
async function markItemAsSold(itemId, winner, winningBid) {
  const db = await dbAPI.connect();

  const result = await db.collection('auctionItems').updateOne(
    { _id: itemId },
    {
      $set: {
        status: 'sold',
        winner: winner.username,
        winnerId: winner.userId,
        winningBid: winningBid,
        soldAt: new Date()
      }
    }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Auction item not found: ${itemId}`);
  }

  return await db.collection('auctionItems').findOne({ _id: itemId });
}

/**
 * Get sold auction items
 * @param {number} limit - Max items to return
 * @returns {Promise<Array>} - Array of sold items
 */
async function getSoldItems(limit = 50) {
  const db = await dbAPI.connect();
  return await db.collection('auctionItems')
    .find({ status: 'sold' })
    .sort({ soldAt: -1 })
    .limit(limit)
    .toArray();
}

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add attendance record
 * @param {Object} attendanceData - Attendance data
 * @returns {Promise<Object>} - Created attendance record
 */
async function addAttendanceRecord(attendanceData) {
  const db = await dbAPI.connect();

  const attendance = {
    memberId: attendanceData.memberId,
    memberName: attendanceData.memberName,
    bossName: attendanceData.bossName,
    bossPoints: attendanceData.bossPoints || 0,
    timestamp: attendanceData.timestamp || new Date(),
    weekStartDate: attendanceData.weekStartDate || getWeekStart(),
    weekLabel: attendanceData.weekLabel || getWeekLabel(),
    verified: attendanceData.verified || false,
    threadId: attendanceData.threadId || null,
    createdAt: new Date()
  };

  const result = await db.collection('attendance').insertOne(attendance);
  return { ...attendance, _id: result.insertedId };
}

/**
 * Get member's attendance records
 * @param {string} identifier - Discord ID or username
 * @param {Object} filter - Optional filter (date range, boss, etc.)
 * @returns {Promise<Array>} - Array of attendance records
 */
async function getMemberAttendance(identifier, filter = {}) {
  const db = await dbAPI.connect();

  // Find member
  const member = await getMember(identifier);
  if (!member) {
    throw new Error(`Member not found: ${identifier}`);
  }

  // Build query
  const query = {
    memberId: member._id,
    ...filter
  };

  return await db.collection('attendance')
    .find(query)
    .sort({ timestamp: -1 })
    .toArray();
}

/**
 * Get the last spawn time for a boss from attendance records
 * @param {string} bossName - Boss name to search for
 * @returns {Promise<Object|null>} - Object with {timestamp, threadId} or null if not found
 */
async function getLastBossSpawn(bossName) {
  try {
    const db = await dbAPI.connect();

    // Find the most recent attendance record for this boss
    const lastRecord = await db.collection('attendance')
      .find({ bossName: bossName })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    if (lastRecord && lastRecord.length > 0) {
      return {
        timestamp: lastRecord[0].timestamp,
        threadId: lastRecord[0].threadId,
        weekLabel: lastRecord[0].weekLabel
      };
    }

    return null;
  } catch (error) {
    console.error(`Error getting last spawn for ${bossName}:`, error);
    return null;
  }
}

/**
 * Update member attendance stats
 * @param {string} identifier - Discord ID or username
 * @param {Object} attendanceData - Attendance data
 * @returns {Promise<Object>} - Updated member
 */
async function updateAttendanceStats(identifier, attendanceData) {
  const db = await dbAPI.connect();

  // Find member
  const member = await getMember(identifier);
  if (!member) {
    throw new Error(`Member not found: ${identifier}`);
  }

  const { bossName, bossPoints } = attendanceData;

  // Update stats
  const updateFields = {
    $inc: {
      'attendance.total': 1,
      'attendance.thisWeek': 1,
      'attendance.thisMonth': 1,
      [`attendance.byBoss.${bossName}`]: 1
    },
    $set: {
      lastActive: new Date()
    }
  };

  // Add points if specified
  if (bossPoints && bossPoints > 0) {
    updateFields.$inc.pointsAvailable = bossPoints;
    updateFields.$inc.pointsEarned = bossPoints;
  }

  await db.collection('members').updateOne(
    { _id: member._id },
    updateFields
  );

  return await getMemberByDiscordId(member._id);
}

/**
 * Add attendance (high-level wrapper for attendance.js)
 * This is the main function called when attendance is submitted.
 * It creates the attendance record AND updates the member's stats/points.
 *
 * @param {Object} data - Attendance data
 * @param {string} data.username - Member display name (nickname or username)
 * @param {string} data.discordId - Discord user ID (optional but recommended)
 * @param {string} data.boss - Boss name
 * @param {string} data.timestamp - Timestamp string
 * @param {string} data.date - Date string (MM/DD/YY)
 * @param {string} data.time - Time string (HH:MM)
 * @param {number} data.points - Points to award
 * @param {string} data.threadId - Discord thread ID (optional)
 * @returns {Promise<Object>} - Updated member
 */
async function addAttendance(data) {
  const db = await dbAPI.connect();

  // Step 1: Find member by Discord ID first (most reliable), then by username (case-insensitive)
  let member = null;

  if (data.discordId) {
    member = await getMemberByDiscordId(data.discordId);
  }

  // Fallback to username lookup if Discord ID not provided or not found
  if (!member) {
    member = await getMemberByUsername(data.username);
  }

  if (!member) {
    // Member doesn't exist - create with Discord ID or temp ID
    const memberId = data.discordId || `temp_${data.username.toLowerCase().replace(/\s+/g, '_')}`;
    console.log(`➕ [MongoDB] Creating new member: ${data.username} (ID: ${memberId})`);

    await db.collection('members').insertOne({
      _id: memberId,
      username: data.username,
      pointsAvailable: 0,
      pointsEarned: 0,
      pointsSpent: 0,
      isActive: true,
      attendance: {
        total: 0,
        thisWeek: 0,
        thisMonth: 0,
        byBoss: {},
        streak: { current: 0, longest: 0 }
      },
      joinedAt: new Date(),
      lastUpdated: new Date()
    });

    member = data.discordId ? await getMemberByDiscordId(data.discordId) : await getMemberByUsername(data.username);
  }

  // Step 2: Add attendance record
  // Parse timestamp properly: it's in GMT+8 format (MM/DD/YY HH:MM)
  // Need to convert to UTC for MongoDB storage
  let timestampDate;
  if (data.timestamp instanceof Date) {
    timestampDate = data.timestamp;
  } else {
    // Parse string timestamp (format: "MM/DD/YY HH:MM" or "MM-DD HH:MM")
    const match = data.timestamp.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}))?\s+(\d{1,2}):(\d{2})/);
    if (match) {
      const [_, month, day, year, hours, minutes] = match;
      const fullYear = year ? 2000 + parseInt(year) : new Date().getFullYear();

      // Create timestamp as GMT+8, then convert to UTC
      const gmt8Timestamp = Date.UTC(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), 0, 0);
      const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
      timestampDate = new Date(gmt8Timestamp - TIMEZONE_OFFSET_MS);
    } else {
      // Fallback: use current time if parse fails
      timestampDate = new Date();
      console.warn(`Failed to parse timestamp: ${data.timestamp}, using current time`);
    }
  }

  await addAttendanceRecord({
    memberId: member._id,
    memberName: data.username,
    bossName: data.boss,
    bossPoints: data.points || 0,
    timestamp: timestampDate,
    weekStartDate: getWeekStart(),
    weekLabel: getWeekLabel(),
    verified: true,
    threadId: data.threadId || null
  });

  // Step 3: Update member stats and increment points
  const updatedMember = await updateAttendanceStats(member._id, {
    bossName: data.boss,
    bossPoints: data.points || 0
  });

  console.log(`✅ [MongoDB] Added attendance for ${data.username}: ${data.boss} (+${data.points} pts)`);
  return updatedMember;
}

/**
 * Get member stats (for !stats command)
 * Aggregates attendance, points, and ranking data from MongoDB
 * Returns data in same format as Google Sheets for compatibility
 *
 * @param {string} memberName - Member username (supports fuzzy matching)
 * @returns {Promise<Object>} - Stats object matching Google Sheets format
 */
async function getMemberStats(memberName) {
  const db = await dbAPI.connect();

  // Step 1: Find member (case-insensitive fuzzy match)
  const members = await db.collection('members').find({ isActive: true }).toArray();

  let member = null;
  let actualMemberName = memberName;

  // Try exact match first (case-insensitive)
  member = members.find(m => m.username.toLowerCase() === memberName.toLowerCase());

  // If no exact match, try fuzzy match
  if (!member) {
    const searchLower = memberName.toLowerCase();
    member = members.find(m =>
      m.username.toLowerCase().includes(searchLower) ||
      searchLower.includes(m.username.toLowerCase())
    );
  }

  if (!member) {
    return {
      status: 'error',
      error: `Member not found: ${memberName}`
    };
  }

  actualMemberName = member.username;

  // Step 2: Get attendance records
  const attendanceRecords = await db.collection('attendance')
    .find({ memberId: member._id })
    .sort({ timestamp: -1 })
    .toArray();

  // Step 3: Calculate attendance stats
  const totalKills = attendanceRecords.length;
  const attendancePoints = attendanceRecords.reduce((sum, record) => sum + (record.bossPoints || 1), 0);

  // Get recent bosses (last 5) - include points for display
  const recentBosses = attendanceRecords
    .slice(0, 5)
    .map(record => ({
      boss: record.bossName,
      points: record.bossPoints || 1,
      date: record.timestamp instanceof Date ? record.timestamp.toLocaleDateString() : new Date(record.timestamp).toLocaleDateString()
    }));

  // Calculate boss distribution
  const bossCounts = {};
  attendanceRecords.forEach(record => {
    const boss = record.bossName;
    bossCounts[boss] = (bossCounts[boss] || 0) + 1;
  });

  // Calculate favorite boss (most attended)
  let favoriteBoss = null;
  if (Object.keys(bossCounts).length > 0) {
    const sortedBosses = Object.entries(bossCounts).sort((a, b) => b[1] - a[1]);
    const [bossName, count] = sortedBosses[0];
    favoriteBoss = {
      name: bossName,
      count: count
    };
  }

  // Step 4: Calculate attendance rate based on unique spawns
  // Get total unique spawns (unique bossName + timestamp combinations)
  const uniqueSpawns = await db.collection('attendance').aggregate([
    {
      $group: {
        _id: {
          bossName: '$bossName',
          timestamp: '$timestamp'
        }
      }
    },
    {
      $count: 'total'
    }
  ]).toArray();

  const totalPossibleSpawns = uniqueSpawns.length > 0 ? uniqueSpawns[0].total : 0;

  // Get member's unique spawn attendance (deduplicate by bossName + timestamp)
  const memberUniqueSpawns = await db.collection('attendance').aggregate([
    {
      $match: { memberId: member._id }
    },
    {
      $group: {
        _id: {
          bossName: '$bossName',
          timestamp: '$timestamp'
        }
      }
    },
    {
      $count: 'total'
    }
  ]).toArray();

  const memberSpawnsAttended = memberUniqueSpawns.length > 0 ? memberUniqueSpawns[0].total : 0;

  // Rate = (spawns attended / total spawns) * 100, capped at 100%
  const attendanceRate = totalPossibleSpawns > 0
    ? Math.min(100, Math.round((memberSpawnsAttended / totalPossibleSpawns) * 100))
    : 0;

  // Step 5: Calculate streak
  // TODO: Implement streak calculation from attendance records
  const currentStreak = member.attendance?.streak?.current || 0;

  // Step 6: Get ranking
  const allMembers = members.filter(m => m.isActive);
  const sortedByAttendance = allMembers
    .map(m => ({
      username: m.username,
      total: m.attendance?.total || 0
    }))
    .sort((a, b) => b.total - a.total);

  const rank = sortedByAttendance.findIndex(m => m.username === actualMemberName) + 1;

  // Step 7: Get bidding points
  const pointsLeft = member.pointsAvailable || 0;
  const pointsConsumed = member.pointsSpent || 0;
  const pointsTotal = (member.pointsEarned || 0);
  const consumptionRate = pointsTotal > 0 ? Math.round((pointsConsumed / pointsTotal) * 100) : 0;

  // Return stats in Google Sheets compatible format
  return {
    status: 'ok',
    memberName: actualMemberName,
    attendance: {
      total: totalKills,
      points: attendancePoints,
      rate: attendanceRate,
      streak: currentStreak,
      recentBosses: recentBosses,
      bossCounts: bossCounts,
      favoriteBoss: favoriteBoss
    },
    bidding: {
      left: pointsLeft,
      consumed: pointsConsumed,
      consumptionRate: consumptionRate
    },
    rank: rank,
    totalMembers: allMembers.length
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT STATE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save bot state for crash recovery
 * @param {string} module - Module name (bidding, auction, attendance)
 * @param {Object} state - State data
 * @returns {Promise<Object>} - Saved state
 */
async function saveBotState(module, state) {
  const db = await dbAPI.connect();

  const stateDoc = {
    module,
    state,
    savedAt: new Date()
  };

  await db.collection('botState').updateOne(
    { module },
    { $set: stateDoc },
    { upsert: true }
  );

  return stateDoc;
}

/**
 * Get bot state
 * @param {string} module - Module name
 * @returns {Promise<Object|null>} - Saved state or null
 */
async function getBotState(module) {
  const db = await dbAPI.connect();
  const stateDoc = await db.collection('botState').findOne({ module });
  return stateDoc ? stateDoc.state : null;
}

/**
 * Clear bot state
 * @param {string} module - Module name
 * @returns {Promise<Object>} - Delete result
 */
async function clearBotState(module) {
  const db = await dbAPI.connect();
  return await db.collection('botState').deleteOne({ module });
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSS TIMER OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save boss timer recovery data to MongoDB
 * @param {string} bossName - Boss name
 * @param {Date} killTime - Kill time
 * @param {Date} nextSpawn - Next spawn time
 * @param {string} killedBy - Username
 * @param {boolean} serverDown - Server down state
 * @returns {Promise<Object>} - Save result
 */
async function saveBossTimerData(bossName, killTime, nextSpawn, killedBy, serverDown = false) {
  const db = await dbAPI.connect();

  const timerData = {
    bossName,
    lastKillTime: killTime ? killTime.toISOString() : null,
    nextSpawnTime: nextSpawn ? nextSpawn.toISOString() : null,
    killedBy,
    serverDown,
    updatedAt: new Date()
  };

  // Update or insert the timer data for this boss
  await db.collection('bossTimers').updateOne(
    { bossName },
    { $set: timerData },
    { upsert: true }
  );

  return timerData;
}

/**
 * Get all boss timer recovery data from MongoDB
 * @returns {Promise<Array>} - Array of timer data
 */
async function getAllBossTimers() {
  const db = await dbAPI.connect();
  return await db.collection('bossTimers').find({}).toArray();
}

/**
 * Get specific boss timer data from MongoDB
 * @param {string} bossName - Boss name
 * @returns {Promise<Object|null>} - Timer data or null
 */
async function getBossTimer(bossName) {
  const db = await dbAPI.connect();
  return await db.collection('bossTimers').findOne({ bossName });
}

/**
 * Delete boss timer data from MongoDB
 * @param {string} bossName - Boss name
 * @returns {Promise<Object>} - Delete result
 */
async function deleteBossTimer(bossName) {
  const db = await dbAPI.connect();
  return await db.collection('bossTimers').deleteOne({ bossName });
}

/**
 * Save server down state to MongoDB
 * @param {boolean} isDown - Server down state
 * @returns {Promise<Object>} - Save result
 */
async function saveServerDownState(isDown) {
  const db = await dbAPI.connect();

  await db.collection('botState').updateOne(
    { _id: 'server_state' },
    {
      $set: {
        serverDown: isDown,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  return { serverDown: isDown };
}

/**
 * Get server down state from MongoDB
 * @returns {Promise<boolean>} - Server down state
 */
async function getServerDownState() {
  const db = await dbAPI.connect();
  const state = await db.collection('botState').findOne({ _id: 'server_state' });
  return state ? state.serverDown : false;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT REMINDER OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new event reminder
 * @param {Object} reminderData - Reminder data
 * @returns {Promise<Object>} - Created reminder
 */
async function createReminder(reminderData) {
  const db = await dbAPI.connect();

  const reminder = {
    eventType: reminderData.eventType || 'custom',
    eventName: reminderData.eventName,
    reminderTime: reminderData.reminderTime,
    notifyBefore: reminderData.notifyBefore || 0,
    channelId: reminderData.channelId,
    message: reminderData.message,
    mentionRole: reminderData.mentionRole || null,
    recurring: reminderData.recurring || false,
    recurrenceRule: reminderData.recurrenceRule || null,
    triggered: false,
    lastTriggered: null,
    nextTrigger: reminderData.reminderTime,
    createdBy: reminderData.createdBy,
    createdAt: new Date(),
    active: true
  };

  const result = await db.collection('eventReminders').insertOne(reminder);
  reminder._id = result.insertedId;

  return reminder;
}

/**
 * Get all active reminders
 * @returns {Promise<Array>} - Array of active reminders
 */
async function getActiveReminders() {
  const db = await dbAPI.connect();
  return await db.collection('eventReminders').find({ active: true }).toArray();
}

/**
 * Get due reminders (ready to trigger)
 * @returns {Promise<Array>} - Array of due reminders
 */
async function getDueReminders() {
  const db = await dbAPI.connect();
  return await db.collection('eventReminders').find({
    active: true,
    nextTrigger: { $lte: new Date() }
  }).toArray();
}

/**
 * Get reminder by ID
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object|null>} - Reminder or null
 */
async function getReminder(reminderId) {
  const db = await dbAPI.connect();
  const { ObjectId } = require('mongodb');
  return await db.collection('eventReminders').findOne({ _id: new ObjectId(reminderId) });
}

/**
 * Update reminder after triggering
 * @param {string} reminderId - Reminder ID
 * @param {Date} nextTrigger - Next trigger time (null if not recurring)
 * @returns {Promise<Object>} - Update result
 */
async function updateReminderAfterTrigger(reminderId, nextTrigger) {
  const db = await dbAPI.connect();
  const { ObjectId } = require('mongodb');

  const update = {
    triggered: true,
    lastTriggered: new Date()
  };

  if (nextTrigger) {
    update.nextTrigger = nextTrigger;
    update.triggered = false; // Reset for next occurrence
  } else {
    update.active = false; // Deactivate if not recurring
  }

  return await db.collection('eventReminders').updateOne(
    { _id: new ObjectId(reminderId) },
    { $set: update }
  );
}

/**
 * Delete reminder
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object>} - Delete result
 */
async function deleteReminder(reminderId) {
  const db = await dbAPI.connect();
  const { ObjectId } = require('mongodb');
  return await db.collection('eventReminders').deleteOne({ _id: new ObjectId(reminderId) });
}

/**
 * Deactivate reminder (soft delete)
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object>} - Update result
 */
async function deactivateReminder(reminderId) {
  const db = await dbAPI.connect();
  const { ObjectId } = require('mongodb');
  return await db.collection('eventReminders').updateOne(
    { _id: new ObjectId(reminderId) },
    { $set: { active: false, updatedAt: new Date() } }
  );
}

/**
 * Get reminders by event type
 * @param {string} eventType - Event type (boss_spawn, auction, guild_event, custom)
 * @returns {Promise<Array>} - Array of reminders
 */
async function getRemindersByType(eventType) {
  const db = await dbAPI.connect();
  return await db.collection('eventReminders').find({ eventType, active: true }).toArray();
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get start of current week (Sunday)
 */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  return new Date(now.setDate(diff));
}

/**
 * Get current week label
 */
function getWeekLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const weekNum = getWeekNumber(now);
  return `ELYSIUM_WEEK_${year}_${weekNum}`;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get circuit breaker status
 */
function getCircuitStatus() {
  return mongoBreaker.getStatus();
}

/**
 * Reset circuit breaker
 */
function resetCircuit() {
  mongoBreaker.reset();
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD ID SYNC (Auto-fix temp IDs on startup)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync Discord IDs for members with temp IDs
 * Fetches guild members from Discord and updates MongoDB members + attendance records
 *
 * @param {Guild} guild - Discord guild object
 * @returns {Promise<Object>} - Sync results { updated, failed, skipped }
 */
async function syncDiscordIds(guild) {
  const db = await dbAPI.connect();

  console.log('🔄 [MongoDB] Syncing Discord IDs for members with temp IDs...');

  // Step 1: Find all members with temp IDs
  const tempMembers = await db.collection('members')
    .find({ _id: /^temp_/ })
    .toArray();

  if (tempMembers.length === 0) {
    console.log('✅ [MongoDB] No temp IDs found - all members have real Discord IDs');
    return { updated: 0, failed: 0, skipped: 0 };
  }

  console.log(`   Found ${tempMembers.length} members with temp IDs`);

  // Step 2: Fetch all Discord guild members
  console.log('   Fetching Discord guild members...');
  await guild.members.fetch(); // Ensure cache is populated
  const discordMembers = guild.members.cache;
  console.log(`   Loaded ${discordMembers.size} Discord members`);

  // Debug: Show sample of members with nicknames
  const membersWithNicknames = Array.from(discordMembers.values())
    .filter(m => m.nickname)
    .slice(0, 5);
  if (membersWithNicknames.length > 0) {
    console.log('   Sample members with nicknames:');
    membersWithNicknames.forEach(m => {
      console.log(`     - ${m.user.username} (nick: ${m.nickname}, display: ${m.displayName}, ID: ${m.id})`);
    });
  }

  // Debug: Check if specific known member exists (user: .biogesic, ID: 182081219062661120)
  const testMember = discordMembers.get('182081219062661120');
  if (testMember) {
    console.log(`   ✅ Test user found: ${testMember.user.username} (nick: ${testMember.nickname || 'none'}, display: ${testMember.displayName})`);
  } else {
    console.log(`   ❌ Test user (ID: 182081219062661120) NOT found in fetched members!`);
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  // Step 3: Update each temp member
  const skippedDetails = []; // Track skipped members for detailed logging

  for (const tempMember of tempMembers) {
    try {
      const searchName = tempMember.username.toLowerCase();
      console.log(`\n   🔍 Searching for: "${tempMember.username}" (temp ID: ${tempMember._id})`);

      // Find matching Discord member with multiple strategies
      let discordMember = discordMembers.find(dm => {
        const username = dm.user.username.toLowerCase();
        const nickname = dm.nickname ? dm.nickname.toLowerCase() : null;
        const displayName = dm.displayName.toLowerCase();

        // Strategy 1: Exact match on username
        if (username === searchName) {
          console.log(`      ✅ Exact match on username: ${dm.user.username}`);
          return true;
        }

        // Strategy 2: Exact match on nickname
        if (nickname && nickname === searchName) {
          console.log(`      ✅ Exact match on nickname: ${dm.nickname}`);
          return true;
        }

        // Strategy 3: Exact match on displayName
        if (displayName === searchName) {
          console.log(`      ✅ Exact match on displayName: ${dm.displayName}`);
          return true;
        }

        // Strategy 4: Partial match (contains) - helps with variations
        if (username.includes(searchName) || searchName.includes(username)) {
          console.log(`      ✅ Partial match on username: ${dm.user.username}`);
          return true;
        }
        if (nickname && (nickname.includes(searchName) || searchName.includes(nickname))) {
          console.log(`      ✅ Partial match on nickname: ${dm.nickname}`);
          return true;
        }
        if (displayName.includes(searchName) || searchName.includes(displayName)) {
          console.log(`      ✅ Partial match on displayName: ${dm.displayName}`);
          return true;
        }

        return false;
      });

      if (!discordMember) {
        // Enhanced logging: show similar names to help debug
        // Convert Collection to array for array methods
        const discordMembersArray = Array.from(discordMembers.values());
        const similarMembers = discordMembersArray
          .filter(dm => {
            const username = dm.user.username.toLowerCase();
            const nickname = dm.nickname ? dm.nickname.toLowerCase() : '';
            const displayName = dm.displayName.toLowerCase();

            // Show members that have ANY partial match
            return username.includes(searchName.substring(0, 4)) ||
                   searchName.includes(username.substring(0, 4)) ||
                   nickname.includes(searchName.substring(0, 4)) ||
                   displayName.includes(searchName.substring(0, 4));
          })
          .slice(0, 5)
          .map(dm => `${dm.user.username} (nick: ${dm.nickname || 'none'}, display: ${dm.displayName}, ID: ${dm.id})`)
          .join('\n         ');

        console.log(`      ❌ No Discord match found!`);
        if (similarMembers) {
          console.log(`      💡 Similar Discord members found:`);
          console.log(`         ${similarMembers}`);
        }

        // Store details for summary
        skippedDetails.push({
          mongoUsername: tempMember.username,
          tempId: tempMember._id,
          similarMembers: similarMembers || 'none'
        });

        skipped++;
        continue;
      }

      const realDiscordId = discordMember.id;
      const tempId = tempMember._id;

      // Check if real Discord ID already exists (prevent duplicates)
      const existing = await db.collection('members').findOne({ _id: realDiscordId });
      if (existing) {
        console.log(`   ⚠️ Discord ID ${realDiscordId} already exists, merging data for ${tempMember.username}...`);

        // Merge attendance data
        const tempAttendance = tempMember.attendance || { total: 0, byBoss: {} };
        const existingAttendance = existing.attendance || { total: 0, byBoss: {} };

        // Update existing member with merged data
        await db.collection('members').updateOne(
          { _id: realDiscordId },
          {
            $set: {
              'attendance.total': Math.max(tempAttendance.total, existingAttendance.total),
              'attendance.byBoss': { ...existingAttendance.byBoss, ...tempAttendance.byBoss },
              pointsAvailable: Math.max(tempMember.pointsAvailable || 0, existing.pointsAvailable || 0),
              pointsEarned: Math.max(tempMember.pointsEarned || 0, existing.pointsEarned || 0),
              lastUpdated: new Date()
            }
          }
        );

        // Update attendance records to use real Discord ID
        await db.collection('attendance').updateMany(
          { memberId: tempId },
          { $set: { memberId: realDiscordId } }
        );

        // Delete temp member
        await db.collection('members').deleteOne({ _id: tempId });

        console.log(`   ✅ Merged: ${tempMember.username} (${tempId} → ${realDiscordId})`);
      } else {
        // Simple case: just rename the member ID

        // Step 3a: Update all attendance records to use real Discord ID FIRST
        const attendanceUpdateResult = await db.collection('attendance').updateMany(
          { memberId: tempId },
          { $set: { memberId: realDiscordId } }
        );

        // Check if attendance records already have real Discord ID
        if (attendanceUpdateResult.modifiedCount === 0) {
          const existingRecordsCount = await db.collection('attendance').countDocuments({ memberId: realDiscordId });
          if (existingRecordsCount > 0) {
            console.log(`      ℹ️  Attendance records already use Discord ID (${existingRecordsCount} records with ID ${realDiscordId})`);
          }
        }

        // Step 3b: Delete temp member BEFORE inserting new one (avoids unique constraint violation on username)
        await db.collection('members').deleteOne({ _id: tempId });

        // Step 3c: Insert new member with real Discord ID
        const newMemberDoc = {
          ...tempMember,
          _id: realDiscordId,
          lastUpdated: new Date()
        };

        await db.collection('members').insertOne(newMemberDoc);

        // Log which name matched
        const matchedAs = discordMember.user.username !== tempMember.username
          ? ` [matched as ${discordMember.user.username}]`
          : '';
        const recordsInfo = attendanceUpdateResult.modifiedCount > 0
          ? `${attendanceUpdateResult.modifiedCount} records updated`
          : 'member synced (records already correct)';
        console.log(`      ✅ Updated: ${tempMember.username}${matchedAs} (${tempId} → ${realDiscordId}, ${recordsInfo})`);
      }

      updated++;

    } catch (error) {
      console.error(`   ❌ Failed to update ${tempMember.username}:`, error.message);
      failed++;
    }
  }

  console.log(`\n✅ [MongoDB] Discord ID sync complete: ${updated} updated, ${failed} failed, ${skipped} skipped`);

  // Show detailed summary of skipped members
  if (skippedDetails.length > 0) {
    console.log(`\n⚠️  SKIPPED MEMBERS SUMMARY:`);
    console.log(`   The following ${skippedDetails.length} members could not be matched to Discord:`);
    console.log('');
    skippedDetails.forEach((detail, index) => {
      console.log(`   ${index + 1}. MongoDB username: "${detail.mongoUsername}"`);
      console.log(`      Temp ID: ${detail.tempId}`);
      if (detail.similarMembers !== 'none') {
        console.log(`      Similar Discord members:`);
        detail.similarMembers.split('\n').forEach(line => {
          console.log(`      ${line.trim()}`);
        });
      } else {
        console.log(`      No similar Discord members found`);
      }
      console.log('');
    });
    console.log(`   💡 Possible solutions:`);
    console.log(`      1. Check if these users have left the Discord server`);
    console.log(`      2. Check if usernames have changed in Discord`);
    console.log(`      3. Update usernames in Google Sheets to match Discord`);
    console.log(`      4. Run: node scripts/debug-discord-match.js <username>`);
    console.log('');
  }

  return { updated, failed, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Member operations
  getMemberByUsername,
  getMemberByDiscordId,
  getMember,
  getAllMembers,
  createMember,
  updateMember,
  removeMember,

  // Points operations
  getMemberPoints,
  updateMemberPoints,
  hasEnoughPoints,
  getAllMemberPoints,

  // Auction operations
  getAuctionQueue,
  getNextAuctionItem,
  addAuctionItem,
  markItemAsSold,
  getSoldItems,

  // Attendance operations
  addAttendance,           // High-level wrapper (creates record + updates stats)
  addAttendanceRecord,     // Low-level: just creates record
  getMemberAttendance,
  getLastBossSpawn,        // Get last spawn time for a boss from attendance records
  updateAttendanceStats,
  getMemberStats,          // Get member stats for !stats command

  // Bot state operations
  saveBotState,
  getBotState,
  clearBotState,

  // Boss timer operations
  saveBossTimerData,
  getAllBossTimers,
  getBossTimer,
  deleteBossTimer,
  saveServerDownState,
  getServerDownState,

  // Event reminder operations
  createReminder,
  getActiveReminders,
  getDueReminders,
  getReminder,
  updateReminderAfterTrigger,
  deleteReminder,
  deactivateReminder,
  getRemindersByType,

  // Utilities
  getCircuitStatus,
  resetCircuit,

  // Discord ID sync
  syncDiscordIds
};
