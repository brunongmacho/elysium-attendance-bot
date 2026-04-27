/**
 * ============================================================================
 * MEMBER REGISTRY SYSTEM
 * ============================================================================
 *
 * PURPOSE:
 * Maintains a registry of all guild members with:
 * - Discord ID (immutable - used for recognition)
 * - Username (Discord username, may change)
 * - Nickname (IGN - primary display name, defaults to Discord nickname)
 * - Display name (effective display name for embeds)
 * - Join date tracking
 * - Auto-update on nickname changes
 *
 * KEY FEATURES:
 * - Members identified by Discord ID (never changes)
 * - Nickname/IGN is the primary identifier used in records
 * - Auto-updates when member changes nickname
 * - Syncs to MongoDB and Google Sheets
 * - Fallback to username if nickname unavailable
 *
 * @module member-registry
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Discord embed limits
const DISCORD_LIMITS = {
  FIELD_NAME: 256,
  FIELD_VALUE: 1024
};

// ============================================================================
// CONFIGURATION
// ============================================================================

let config = null;
let mongoClient = null;
let db = null;
let membersCollection = null;
let useMongoDB = false;

// Sheet API for Google Sheets sync
let sheetAPI = null;
const SHEET_NAME = 'MemberRegistry';

// Guild identification for data isolation (new guild = new data)
let guildName = 'TrailerParkB';
let guildId = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize member registry module
 * @param {Object} cfg - Bot configuration
 * @param {Object} mongo - MongoDB client instance (optional)
 */
async function initialize(cfg, mongo = null) {
  config = cfg;
  
  // Load guild identification
  guildName = cfg.guild_name || 'TrailerParkB';
  guildId = cfg.main_guild_id || null;
  
  // Try to connect to MongoDB
  if (mongo && cfg.mongodb_uri) {
    try {
      mongoClient = mongo;
      db = mongoClient.db(cfg.mongodb_database || 'guild_bot');
      
      // Use guild-specific collection name with -TPB suffix
      const collectionName = `member_registry-${guildName.replace(/\s+/g, '_').toUpperCase()}`;
      membersCollection = db.collection(collectionName);
      
      // Create indexes for efficient lookups
      await membersCollection.createIndex({ discordId: 1 }, { unique: true });
      await membersCollection.createIndex({ nickname: 1 });
      await membersCollection.createIndex({ username: 1 });
      await membersCollection.createIndex({ lastUpdated: 1 });
      
      useMongoDB = true;
      console.log(`✅ Member Registry: MongoDB connected (collection: ${collectionName})`);
    } catch (err) {
      console.error('❌ Member Registry: MongoDB connection failed:', err.message);
    }
  }
  
  // Initialize Sheet API for backup/fallback
  if (cfg.sheet_webhook_url) {
    sheetAPI = require('./utils/sheet-api');
  }
}

// ============================================================================
// CORE MEMBER FUNCTIONS
// ============================================================================

/**
 * Get or create member record by Discord member object
 * Creates entry if not exists, updates if exists
 *
 * @param {GuildMember} member - Discord guild member
 * @returns {Object} Member record with id, nickname, username, etc.
 */
async function getOrCreateMember(member) {
  if (!member || !member.id) return null;
  
  const discordId = member.id;
  const username = member.user?.username || 'Unknown';
  const globalName = member.user?.globalName || null;
  const nickname = member.nickname || globalName || username;
  const displayName = nickname; // IGN is default display name
  
  // Check if member exists in registry
  let memberRecord = await findByDiscordId(discordId);
  
  if (memberRecord) {
    // Update existing record if nickname changed
    if (memberRecord.nickname !== nickname) {
      memberRecord = await updateNickname(discordId, nickname);
    }
    return memberRecord;
  }
  
  // Create new member record
  return await createMember({
    discordId,
    username,
    globalName,
    nickname,
    displayName,
    joinedAt: member.joinedAt ? new Date(member.joinedAt) : new Date(),
    registeredAt: new Date(),
    lastUpdated: new Date()
  });
}

/**
 * Create a new member record
 * @param {Object} memberData - Member data
 * @returns {Object} Created member record
 */
async function createMember(memberData) {
  const record = {
    discordId: memberData.discordId,
    username: memberData.username,
    globalName: memberData.globalName || null,
    nickname: memberData.nickname,
    displayName: memberData.displayName || memberData.nickname,
    joinedAt: memberData.joinedAt || new Date(),
    registeredAt: new Date(),
    lastUpdated: new Date()
  };
  
  if (useMongoDB && membersCollection) {
    await membersCollection.insertOne(record);
    cacheName(record.discordId, record.nickname);
    console.log(`✅ Member registered: ${record.nickname} (${record.discordId})`);
  }
  
  // Sync to Google Sheets
  await syncToSheet(record);
  
  return record;
}

/**
 * Update member's nickname (IGN)
 * @param {string} discordId - Discord user ID
 * @param {string} newNickname - New nickname/IGN
 * @returns {Object} Updated member record
 */
async function updateNickname(discordId, newNickname) {
  const update = {
    $set: {
      nickname: newNickname,
      displayName: newNickname,
      lastUpdated: new Date()
    }
  };
  
  let updatedRecord = null;
  
  if (useMongoDB && membersCollection) {
    updatedRecord = await membersCollection.findOneAndUpdate(
      { discordId },
      update,
      { returnDocument: 'after' }
    );
    if (updatedRecord) {
      cacheName(discordId, updatedRecord.nickname);
    }
  }
  
  if (updatedRecord) {
    console.log(`📝 Member nickname updated: ${updatedRecord.nickname} (${discordId})`);
    await syncToSheet(updatedRecord);
  }
  
  return updatedRecord;
}

/**
 * Update member's username
 * @param {string} discordId - Discord user ID
 * @param {string} newUsername - New username
 */
async function updateUsername(discordId, newUsername) {
  const update = {
    $set: {
      username: newUsername,
      lastUpdated: new Date()
    }
  };
  
  if (useMongoDB && membersCollection) {
    await membersCollection.updateOne({ discordId }, update);
    const record = await findByDiscordId(discordId);
    if (record) {
      cacheName(discordId, record.nickname);
    }
  }
  
  const record = await findByDiscordId(discordId);
  if (record) {
    await syncToSheet(record);
  }
}

// ============================================================================
// FIND FUNCTIONS
// ============================================================================

/**
 * Find member by Discord ID
 * @param {string} discordId - Discord user ID
 * @returns {Object|null} Member record or null
 */
async function findByDiscordId(discordId) {
  if (useMongoDB && membersCollection) {
    return await membersCollection.findOne({ discordId });
  }
  return null;
}

/**
 * Find member by nickname (IGN)
 * @param {string} nickname - Member's nickname/IGN
 * @returns {Object|null} Member record or null
 */
async function findByNickname(nickname) {
  if (useMongoDB && membersCollection) {
    return await membersCollection.findOne({ nickname });
  }
  return null;
}

/**
 * Find member by username
 * @param {string} username - Discord username
 * @returns {Object|null} Member record or null
 */
async function findByUsername(username) {
  if (useMongoDB && membersCollection) {
    return await membersCollection.findOne({ username });
  }
  return null;
}

/**
 * Get all registered members
 * @returns {Array} Array of all member records
 */
async function getAllMembers() {
  if (useMongoDB && membersCollection) {
    return await membersCollection.find({}).toArray();
  }
  return [];
}

// ============================================================================
// LOOKUP CACHE (for sync access within same session)
// ============================================================================

// In-memory cache for quick lookups without async
const nameCache = new Map();

// Simple cache for session-scoped lookups
function cacheName(discordId, nickname) {
  nameCache.set(discordId, nickname.toLowerCase().trim());
}

function getCachedName(discordId) {
  return nameCache.get(discordId) || null;
}

// ============================================================================
// FAST SYNC LOOKUP HELPER
// ============================================================================

/**
 * Get current display name from cache (sync, no DB call)
 * Falls back to normalized raw input if not cached
 * 
 * @param {string} discordId - Discord user ID
 * @param {string} fallbackName - Raw username/nickname as fallback
 * @returns {string} Current display name
 */
function getCurrentName(discordId, fallbackName) {
  if (!discordId) return fallbackName || 'Unknown';
  
  const cached = getCachedName(discordId);
  if (cached) return cached;
  
  // Fallback to local normalization of provided name
  if (fallbackName) {
    return localNormalize(fallbackName);
  }
  
  return 'Unknown';
}

// ============================================================================
// DISCRIMINATOR (for duplicate usernames)
// ============================================================================

/**
 * Generate display name with discriminator if needed
 * @param {Object} member - Member record or GuildMember
 * @returns {string} Display name with discriminator if duplicate
 */
function getDisplayName(member) {
  if (!member) return 'Unknown';
  
  const baseName = member.nickname || member.displayName || member.username;
  
  // If member has a discriminator (for username duplicates), append it
  if (member.discriminator && member.discriminator !== '0') {
    return `${baseName}#${member.discriminator}`;
  }
  
  return baseName;
}

// ============================================================================
// GOOGLE SHEETS SYNC
// ============================================================================

/**
 * Sync a single member record to Google Sheets
 * @param {Object} record - Member record to sync
 */
async function syncToSheet(record) {
  if (!sheetAPI || !config?.sheet_webhook_url) return;
  
  try {
    const row = [
      record.discordId,
      record.username,
      record.globalName || '',
      record.nickname,
      record.displayName,
      record.joinedAt ? record.joinedAt.toISOString() : '',
      record.registeredAt ? record.registeredAt.toISOString() : '',
      record.lastUpdated ? record.lastUpdated.toISOString() : ''
    ];
    
    await sheetAPI.call('updateMemberRegistry', {
      action: 'upsert',
      discordId: record.discordId,
      row: row
    });
  } catch (err) {
    console.error('❌ Member sync to sheet failed:', err.message);
  }
}

/**
 * Sync all members to Google Sheets (bulk operation)
 */
async function syncAllToSheet() {
  if (!sheetAPI || !useMongoDB) return;
  
  const members = await getAllMembers();
  
  if (members.length === 0) return;
  
  const sheetData = members.map(m => [
    m.discordId,
    m.username,
    m.globalName || '',
    m.nickname,
    m.displayName,
    m.joinedAt ? m.joinedAt.toISOString() : '',
    m.registeredAt ? m.registeredAt.toISOString() : '',
    m.lastUpdated ? m.lastUpdated.toISOString() : ''
  ]);
  
  try {
    await sheetAPI.call('updateMemberRegistry', {
      action: 'bulk',
      data: sheetData
    });
    console.log(`✅ Synced ${members.length} members to Google Sheets`);
  } catch (err) {
    console.error('❌ Bulk member sync failed:', err.message);
  }
}

// ============================================================================
// DISCORD EVENT HANDLERS
// ============================================================================

/**
 * Handle guild member join - register if not exists
 * @param {GuildMember} member - New guild member
 */
async function onMemberJoin(member) {
  try {
    await getOrCreateMember(member);
  } catch (err) {
    console.error('❌ onMemberJoin error:', err.message);
  }
}

/**
 * Bulk update all records when a member changes nickname
 * Updates MongoDB attendance records and triggers Google Sheets sync
 * 
 * @param {string} discordId - Discord user ID
 * @param {string} oldNickname - Previous nickname
 * @param {string} newNickname - New nickname (IGN)
 */
async function onNicknameChange(member, oldNickname) {
  try {
    const newNickname = member.nickname || member.user?.globalName || member.user?.username;
    
    if (oldNickname !== newNickname) {
      // Update registry first
      await getOrCreateMember(member);
      
      // Bulk update all historical records (MongoDB + Sheets)
      await bulkUpdateAllRecords(member.id, oldNickname, newNickname);
      
      console.log(`📝 Nickname change logged: ${oldNickname || 'None'} → ${newNickname}`);
    }
  } catch (err) {
    console.error('❌ onNicknameChange error:', err.message);
  }
}

/**
 * Bulk update all records with new nickname
 * Updates both MongoDB attendance and triggers Google Sheets sync
 * 
 * @param {string} discordId - Discord user ID
 * @param {string} oldNickname - Previous nickname
 * @param {string} newNickname - New nickname
 */
async function bulkUpdateAllRecords(discordId, oldNickname, newNickname) {
  if (!discordId || !oldNickname || !newNickname) return;
  
  console.log(`🔄 Bulk updating all records: "${oldNickname}" → "${newNickname}"`);
  
  try {
    // 1. Update MongoDB attendance records
    if (useMongoDB && membersCollection) {
      await updateMongoDBRecords(discordId, oldNickname, newNickname);
    }
    
    // 2. Trigger Google Sheets bulk update
    if (sheetAPI) {
      await triggerSheetsBulkUpdate(discordId, oldNickname, newNickname);
    }
    
    console.log(`✅ Bulk update complete for ${newNickname} (${discordId})`);
  } catch (err) {
    console.error('❌ Bulk update failed:', err.message);
  }
}

/**
 * Update all MongoDB records for a member
 * Updates the nickname field in all records, NOT doing string replacement
 * This preserves the original username while keeping display names current
 * 
 * @param {string} discordId - Discord user ID
 * @param {string} oldNickname - Previous nickname
 * @param {string} newNickname - New nickname
 */
async function updateMongoDBRecords(discordId, oldNickname, newNickname) {
  if (!db) return;
  
  try {
    // Update all collections that store member names
    const collectionName = `attendance-${guildName.replace(/\s+/g, '_').toUpperCase()}`;
    const collections = [collectionName, `member_stats-${guildName.replace(/\s+/g, '_').toUpperCase()}`, `attendance_history-${guildName.replace(/\s+/g, '_').toUpperCase()}`];
    
    let totalUpdated = 0;
    
    for (const collName of collections) {
      try {
        const collection = db.collection(collName);
        
        // Find documents by Discord ID and update the nickname field
        // This is idempotent - won't break if nickname already matches
        const filter = { 
          memberId: discordId
        };
        
        const update = {
          $set: {
            nickname: newNickname,
            displayName: newNickname,
            lastNicknameUpdate: new Date()
          }
        };
        
        const result = await collection.updateMany(filter, update);
        if (result.modifiedCount > 0) {
          console.log(`   📝 Updated ${result.modifiedCount} records in ${collName}`);
          totalUpdated += result.modifiedCount;
        }
      } catch (e) {
        // Collection might not exist - skip
        console.log(`   ⚠️ Skipped ${collName}: ${e.message}`);
      }
    }
    
    // Also update the members collection nickname
    try {
      const membersCollection = db.collection('members');
      const memberUpdate = await membersCollection.updateOne(
        { _id: discordId },
        { 
          $set: { 
            nickname: newNickname,
            displayName: newNickname,
            lastNicknameUpdate: new Date()
          } 
        }
      );
      if (memberUpdate.modifiedCount > 0) {
        console.log(`   📝 Updated member record in members collection`);
        totalUpdated += memberUpdate.modifiedCount;
      }
    } catch (e) {
      console.log(`   ⚠️ Skipped members collection: ${e.message}`);
    }
    
    console.log(`   ✅ MongoDB: Updated ${totalUpdated} records with new nickname`);
    return totalUpdated;
  } catch (err) {
    console.error('   ❌ MongoDB bulk update error:', err.message);
    return 0;
  }
}

/**
 * Trigger Google Sheets bulk update for nickname change
 * 
 * @param {string} discordId - Discord user ID
 * @param {string} oldNickname - Previous nickname
 * @param {string} newNickname - New nickname
 */
async function triggerSheetsBulkUpdate(discordId, oldNickname, newNickname) {
  try {
    await sheetAPI.call('bulkUpdateNickname', {
      discordId: discordId,
      oldNickname: oldNickname,
      newNickname: newNickname
    });
    console.log(`   ✅ Google Sheets: Bulk update triggered`);
  } catch (err) {
    console.error('   ❌ Sheets bulk update error:', err.message);
  }
}

/**
 * Handle member username change - update registry
 * @param {User} user - Discord user object
 * @param {User} newUser - Updated user object
 */
async function onUsernameChange(user, newUser) {
  try {
    if (user.username !== newUser.username) {
      const record = await findByDiscordId(user.id);
      if (record) {
        await updateUsername(user.id, newUser.username);
        console.log(`📝 Username change logged: ${user.username} → ${newUser.username}`);
      }
    }
  } catch (err) {
    console.error('❌ onUsernameChange error:', err.message);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Fast sync lookup for name by Discord ID (uses cache)
 * @param {string} discordId - Discord user ID
 * @returns {string|null} Normalized nickname or null
 */
function getNameById(discordId) {
  if (!discordId) return null;
  
  // Check cache first (instant)
  const cached = getCachedName(discordId);
  if (cached) return cached;
  
  // If not in cache, return null (caller should use async version)
  return null;
}

/**
 * Get member display name for use in embeds
 * Uses nickname (IGN) as primary, falls back to username
 * @param {GuildMember|string} memberOrDiscordId - Member object or Discord ID
 * @returns {string} Display name (IGN)
 */
async function getMemberDisplayName(memberOrDiscordId) {
  let record = null;
  
  if (typeof memberOrDiscordId === 'string') {
    record = await findByDiscordId(memberOrDiscordId);
  } else if (memberOrDiscordId && memberOrDiscordId.id) {
    // It's a GuildMember - try to get/create record first
    record = await getOrCreateMember(memberOrDiscordId);
  }
  
  if (record) {
    return record.nickname || record.username;
  }
  
  // Fallback to raw member object
  if (memberOrDiscordId && memberOrDiscordId.nickname) {
    return memberOrDiscordId.nickname;
  }
  if (memberOrDiscordId && memberOrDiscordId.user?.globalName) {
    return memberOrDiscordId.user.globalName;
  }
  if (memberOrDiscordId && memberOrDiscordId.user?.username) {
    return memberOrDiscordId.user.username;
  }
  if (memberOrDiscordId && memberOrDiscordId.username) {
    return memberOrDiscordId.username;
  }
  
  return 'Unknown';
}

/**
 * Normalize username for database lookups
 * Checks registry for Discord ID first, then normalizes locally
 * @param {string} name - Raw username/nickname or Discord ID
 * @param {string} discordId - Optional Discord ID for direct lookup
 * @returns {string} Normalized name (lowercase, trimmed)
 */
function normalizeName(name, discordId = null) {
  if (!name) return '';
  
  // If we have a Discord ID, try to find the canonical nickname from registry
  if (discordId) {
    return findByDiscordId(discordId)
      .then(record => {
        if (record) {
          return record.nickname.toLowerCase().trim();
        }
        // Fall through to local normalization
        return localNormalize(name);
      })
      .catch(() => localNormalize(name));
  }
  
  return localNormalize(name);
}

/**
 * Local normalization helper (sync)
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name
 */
function localNormalize(name) {
  if (!name) return '';
  // Remove discriminator if present
  const withoutDiscriminator = name.split('#')[0];
  return withoutDiscriminator.toLowerCase().trim();
}

/**
 * Sync version of normalizeName for use in sync contexts
 * @param {string} name - Name to normalize
 * @param {string} discordId - Optional Discord ID
 * @returns {string} Normalized name
 */
function normalizeNameSync(name, discordId = null) {
  if (!name) return '';
  
  // Try local normalization first (always available)
  return localNormalize(name);
}

/**
 * Get member stats
 * @returns {Object} Registry statistics
 */
async function getStats() {
  const total = useMongoDB && membersCollection 
    ? await membersCollection.countDocuments() 
    : 0;
  
  return {
    totalMembers: total,
    mongoDBConnected: useMongoDB,
    sheetSyncEnabled: !!sheetAPI
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  initialize,
  getOrCreateMember,
  createMember,
  updateNickname,
  updateUsername,
  findByDiscordId,
  findByNickname,
  findByUsername,
  getAllMembers,
  getDisplayName,
  getMemberDisplayName,
  getNameById,
  getCurrentName,
  cacheName,
  syncToSheet,
  syncAllToSheet,
  onMemberJoin,
  onNicknameChange,
  onUsernameChange,
  bulkUpdateAllRecords,
  updateMongoDBRecords,
  normalizeName,
  normalizeNameSync,
  localNormalize,
  getStats
};