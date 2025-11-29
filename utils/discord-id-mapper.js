/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Discord ID Mapper
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maps Discord user IDs to member documents
 * Handles gradual migration from temp IDs to real Discord IDs
 *
 * Features:
 * - Gradual migration (when users interact with bot)
 * - Automatic temp ID → real Discord ID conversion
 * - Username change handling
 * - Member creation if not exists
 *
 * Migration Strategy:
 * 1. Check if member exists by Discord ID
 * 2. If not, check by username
 * 3. If found with temp ID, migrate to real Discord ID
 * 4. If not found at all, create new member
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('./database-api');

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD ID MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure member exists and has real Discord ID
 * This is the main function to use when a user interacts with the bot
 *
 * @param {Object} discordUser - Discord user object from Discord.js
 * @param {string} discordUser.id - Discord user ID
 * @param {string} discordUser.username - Discord username
 * @returns {Promise<Object>} - Member document with real Discord ID
 */
async function ensureMemberExists(discordUser) {
  const { id, username } = discordUser;

  if (!id || !username) {
    throw new Error('Discord user must have id and username');
  }

  const db = await dbAPI.connect();
  const membersCollection = db.collection('members');

  // Step 1: Try to find by Discord ID first (fastest path)
  let member = await membersCollection.findOne({ _id: id });

  if (member) {
    // Member found with real Discord ID - just update last active
    await membersCollection.updateOne(
      { _id: id },
      {
        $set: {
          lastActive: new Date(),
          username: username // Update username in case it changed
        }
      }
    );

    console.log(`✅ [Discord ID Mapper] Member found: ${username} (${id})`);
    return { ...member, username };
  }

  // Step 2: Try to find by username (migration path)
  member = await membersCollection.findOne({ username });

  if (member && member._id.startsWith('temp_')) {
    // Member exists with temp ID - migrate to real Discord ID
    console.log(`🔄 [Discord ID Mapper] Migrating ${username}: ${member._id} → ${id}`);

    // Create new document with real Discord ID
    const migratedMember = {
      ...member,
      _id: id,
      migratedFrom: member._id,
      migratedAt: new Date(),
      lastActive: new Date()
    };

    // Delete old temp ID document
    await membersCollection.deleteOne({ _id: member._id });

    // Insert with real Discord ID
    await membersCollection.insertOne(migratedMember);

    console.log(`✅ [Discord ID Mapper] Migration complete: ${username} → ${id}`);
    return migratedMember;

  } else if (member && !member._id.startsWith('temp_')) {
    // Member exists with different Discord ID (username changed)
    console.warn(`⚠️ [Discord ID Mapper] Username conflict: ${username} exists with different Discord ID`);

    // This is a new user with same username - create with real ID
    // The old user will keep the old username in their record
    const newMember = createNewMember(id, username);
    await membersCollection.insertOne(newMember);

    console.log(`✅ [Discord ID Mapper] Created new member: ${username} (${id})`);
    return newMember;
  }

  // Step 3: Member doesn't exist at all - create new
  console.log(`➕ [Discord ID Mapper] Creating new member: ${username} (${id})`);

  const newMember = createNewMember(id, username);
  await membersCollection.insertOne(newMember);

  console.log(`✅ [Discord ID Mapper] New member created: ${username} (${id})`);
  return newMember;
}

/**
 * Map Discord ID to existing member by username
 * Use this for one-time migration or manual ID mapping
 *
 * @param {string} username - Member username
 * @param {string} discordId - Real Discord user ID
 * @returns {Promise<Object|null>} - Migrated member or null if not found
 */
async function mapDiscordIdToMember(username, discordId) {
  const db = await dbAPI.connect();
  const membersCollection = db.collection('members');

  // Find member by username
  const member = await membersCollection.findOne({ username });

  if (!member) {
    console.warn(`⚠️ [Discord ID Mapper] Member not found: ${username}`);
    return null;
  }

  // Check if already has real Discord ID
  if (member._id === discordId) {
    console.log(`✅ [Discord ID Mapper] Member already has correct Discord ID: ${username}`);
    return member;
  }

  // Check if it's a temp ID
  if (!member._id.startsWith('temp_')) {
    console.warn(`⚠️ [Discord ID Mapper] Member ${username} already has Discord ID: ${member._id}`);
    return member;
  }

  // Migrate temp ID to real Discord ID
  console.log(`🔄 [Discord ID Mapper] Migrating ${username}: ${member._id} → ${discordId}`);

  const migratedMember = {
    ...member,
    _id: discordId,
    migratedFrom: member._id,
    migratedAt: new Date(),
    lastActive: new Date()
  };

  // Delete old document
  await membersCollection.deleteOne({ _id: member._id });

  // Insert with new ID
  await membersCollection.insertOne(migratedMember);

  console.log(`✅ [Discord ID Mapper] Migration complete: ${username} → ${discordId}`);
  return migratedMember;
}

/**
 * Batch migrate all temp IDs to real Discord IDs
 * Use this for one-time migration of all members
 *
 * @param {Object} discordClient - Discord.js client
 * @param {string} guildId - Discord guild/server ID
 * @returns {Promise<Object>} - Migration statistics
 */
async function batchMigrateAllMembers(discordClient, guildId) {
  console.log(`🔄 [Discord ID Mapper] Starting batch migration for guild: ${guildId}`);

  const db = await dbAPI.connect();
  const membersCollection = db.collection('members');

  // Get all members with temp IDs
  const tempMembers = await membersCollection.find({
    _id: { $regex: /^temp_/ }
  }).toArray();

  console.log(`📊 [Discord ID Mapper] Found ${tempMembers.length} members with temp IDs`);

  const stats = {
    total: tempMembers.length,
    migrated: 0,
    failed: 0,
    notFound: 0,
    errors: []
  };

  // Get guild from Discord
  const guild = await discordClient.guilds.fetch(guildId);
  if (!guild) {
    throw new Error(`Guild not found: ${guildId}`);
  }

  // Fetch all guild members
  await guild.members.fetch();

  // Migrate each member
  for (const member of tempMembers) {
    try {
      // Find Discord member by username
      const discordMember = guild.members.cache.find(
        m => m.user.username.toLowerCase() === member.username.toLowerCase()
      );

      if (!discordMember) {
        console.warn(`⚠️ [Discord ID Mapper] Discord member not found: ${member.username}`);
        stats.notFound++;
        continue;
      }

      // Migrate this member
      await mapDiscordIdToMember(member.username, discordMember.id);
      stats.migrated++;

      console.log(`✅ [Discord ID Mapper] [${stats.migrated}/${stats.total}] Migrated: ${member.username}`);

    } catch (error) {
      console.error(`❌ [Discord ID Mapper] Migration failed for ${member.username}:`, error.message);
      stats.failed++;
      stats.errors.push({
        username: member.username,
        error: error.message
      });
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`✅ [Discord ID Mapper] Batch migration complete!`);
  console.log(`📊 Total: ${stats.total} | Migrated: ${stats.migrated} | Failed: ${stats.failed} | Not Found: ${stats.notFound}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  return stats;
}

/**
 * Get migration statistics
 * @returns {Promise<Object>} - Migration stats
 */
async function getMigrationStats() {
  const db = await dbAPI.connect();
  const membersCollection = db.collection('members');

  const totalMembers = await membersCollection.countDocuments();
  const tempIdMembers = await membersCollection.countDocuments({
    _id: { $regex: /^temp_/ }
  });
  const realIdMembers = totalMembers - tempIdMembers;
  const migratedMembers = await membersCollection.countDocuments({
    migratedFrom: { $exists: true }
  });

  return {
    total: totalMembers,
    withRealId: realIdMembers,
    withTempId: tempIdMembers,
    migrated: migratedMembers,
    percentComplete: Math.round((realIdMembers / totalMembers) * 100)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create new member document
 * @param {string} discordId - Discord user ID
 * @param {string} username - Discord username
 * @returns {Object} - New member document
 */
function createNewMember(discordId, username) {
  return {
    _id: discordId,
    username: username,
    pointsAvailable: 0,
    pointsEarned: 0,
    pointsSpent: 0,
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
}

/**
 * Check if member has real Discord ID
 * @param {string} memberId - Member ID to check
 * @returns {boolean} - True if real Discord ID
 */
function hasRealDiscordId(memberId) {
  return !memberId.startsWith('temp_');
}

/**
 * Generate temp ID from username
 * @param {string} username - Username
 * @returns {string} - Temp ID
 */
function generateTempId(username) {
  return `temp_${username.toLowerCase().replace(/\s+/g, '_')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Main functions
  ensureMemberExists,
  mapDiscordIdToMember,
  batchMigrateAllMembers,

  // Statistics
  getMigrationStats,

  // Utilities
  hasRealDiscordId,
  generateTempId
};
