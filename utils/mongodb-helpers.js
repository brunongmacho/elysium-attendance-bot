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
 * Get member by username
 * @param {string} username - Member username
 * @returns {Promise<Object|null>} - Member document or null
 */
async function getMemberByUsername(username) {
  const db = await dbAPI.connect();
  return await db.collection('members').findOne({ username });
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
 * Get member by either Discord ID or username
 * @param {string} identifier - Discord ID or username
 * @returns {Promise<Object|null>} - Member document or null
 */
async function getMember(identifier) {
  const db = await dbAPI.connect();

  // Try by Discord ID first
  let member = await db.collection('members').findOne({ _id: identifier });

  // If not found, try by username
  if (!member) {
    member = await db.collection('members').findOne({ username: identifier });
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
 * @param {string} data.username - Member username
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

  // Step 1: Find or create member by username
  let member = await getMemberByUsername(data.username);

  if (!member) {
    // Member doesn't exist - create with temp ID
    console.log(`➕ [MongoDB] Creating new member: ${data.username}`);
    const tempId = `temp_${data.username.toLowerCase().replace(/\s+/g, '_')}`;

    await db.collection('members').insertOne({
      _id: tempId,
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

    member = await getMemberByUsername(data.username);
  }

  // Step 2: Add attendance record
  await addAttendanceRecord({
    memberId: member._id,
    memberName: data.username,
    bossName: data.boss,
    bossPoints: data.points || 0,
    timestamp: new Date(data.timestamp),
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
  updateAttendanceStats,

  // Bot state operations
  saveBotState,
  getBotState,
  clearBotState,

  // Utilities
  getCircuitStatus,
  resetCircuit
};
