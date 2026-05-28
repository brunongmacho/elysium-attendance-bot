/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAILERPARKB GUILD BOT - Sync Google Sheets → MongoDB
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Syncs latest data from Google Sheets to MongoDB for all MongoDB-enabled modules.
 * Uses guild-specific database for data isolation.
 *
 * Modules synced:
 * - Members (bidding points) - USE_MONGODB_BIDDING
 * - Auction Items - USE_MONGODB_AUCTIONEERING
 * - Boss Rotation - Boss rotation tracking
 * - Attendance records - USE_MONGODB_ATTENDANCE (historical import)
 * - Member Registry - Nickname tracking and updates
 *
 * Usage:
 *   node scripts/sync-sheets-to-mongodb.js                # Sync all modules
 *   node scripts/sync-sheets-to-mongodb.js --members      # Sync members only
 *   node scripts/sync-sheets-to-mongodb.js --items        # Sync auction items only
 *   node scripts/sync-sheets-to-mongodb.js --rotation     # Sync boss rotation only
 *   node scripts/sync-sheets-to-mongodb.js --attendance   # Sync attendance only
 *   node scripts/sync-sheets-to-mongodb.js --registry    # Sync member registry
 *   node scripts/sync-sheets-to-mongodb.js --dry-run      # Test without writing
 *
 * Note: Output is Discord-safe (stays under 2000 char limit) by limiting
 *       preview to first 5 items and using compact summary formatting.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// Load .env file FIRST to ensure MONGODB_URI is set (skip if not found in production)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
} else {
  console.log('📝 .env file not found - using environment variables from deployment');
}

const dbAPI = require('../utils/database-api');
const { SheetAPI } = require('../utils/sheet-api');
const https = require('https');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DRY_RUN = process.argv.includes('--dry-run');
const SYNC_MEMBERS = process.argv.includes('--members') || !hasModuleFlag();
const SYNC_ITEMS = process.argv.includes('--items') || !hasModuleFlag();
const SYNC_ROTATION = process.argv.includes('--rotation') || !hasModuleFlag();

// Allow skipping attendance sync via environment variable (useful during deployment/emergency)
const SKIP_ATTENDANCE = process.env.SKIP_ATTENDANCE_SYNC === 'true';
const SYNC_ATTENDANCE = (process.argv.includes('--attendance') || !hasModuleFlag()) && !SKIP_ATTENDANCE;

// Member Registry sync (always included in full sync)
const SYNC_REGISTRY = process.argv.includes('--registry') || (!hasModuleFlag() && !DRY_RUN);

// Load bot configuration
let config;
let guildName = 'TENCHU';
try {
  const configPath = path.join(__dirname, '..', 'config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Failed to load config.json:', error.message);
  process.exit(1);
}

// Get MongoDB database name from config
const DB_NAME = config.mongodb_database || `tenchu-bot-${guildName.toLowerCase().replace(/\s+/g, '-')}`;

// Load Discord ID mapping (nickname -> Discord ID)
let discordIdMap = {};
try {
  const mappingPath = path.join(__dirname, '..', 'config', 'discord-id-mapping.json');
  discordIdMap = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  console.log(`📋 Loaded ${Object.keys(discordIdMap).length} Discord ID mappings`);
} catch (error) {
  console.log('ℹ️  No discord-id-mapping.json found, will use temp IDs');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_PREVIEW_ITEMS = 5; // Limit preview to avoid Discord 2000 char limit

/**
 * Make a GET request to the Discord REST API with bot authentication
 */
function discordApiGet(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Authorization': `Bot ${token}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'] || '1') * 1000;
          console.log(`⏳ Discord API rate limited, waiting ${retryAfter}ms...`);
          setTimeout(() => discordApiGet(url, token).then(resolve).catch(reject), retryAfter);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Discord API returned ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Discord API response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch all Discord guild members via REST API
 * Builds nickname → Discord ID mapping to eliminate temp_ IDs
 */
async function fetchDiscordMemberMap(token, guildId) {
  if (!token || !guildId) {
    console.log('ℹ️ No DISCORD_TOKEN or guild ID available for Discord member fetch');
    return {};
  }

  console.log('🌐 Fetching Discord guild members via API...');

  const allMembers = [];
  let after = '0';

  while (true) {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`;
    const members = await discordApiGet(url, token);
    if (!Array.isArray(members) || members.length === 0) break;
    allMembers.push(...members);
    after = members[members.length - 1].user.id;
    console.log(`⏳ Fetched ${allMembers.length} Discord members so far...`);
  }

  // Build nickname → Discord ID map (lowercased for case-insensitive matching)
  const map = {};
  for (const member of allMembers) {
    if (member.user?.bot) continue;
    const nickname = member.nick || member.user?.global_name || member.user?.username || '';
    if (nickname) {
      map[nickname.toLowerCase()] = member.user.id;
    }
  }

  console.log(`✅ Fetched ${Object.keys(map).length} Discord members via API`);
  return map;
}

function hasModuleFlag() {
  return process.argv.includes('--members') ||
         process.argv.includes('--items') ||
         process.argv.includes('--rotation') ||
         process.argv.includes('--attendance');
}

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

/**
 * Format a list preview with Discord message length limits in mind
 */
function formatPreview(items, formatFn, label = 'items') {
  if (items.length === 0) {
    return `   (No ${label})`;
  }

  const preview = items.slice(0, MAX_PREVIEW_ITEMS).map(formatFn).join('\n');
  const remaining = items.length - MAX_PREVIEW_ITEMS;

  if (remaining > 0) {
    return preview + `\n   ... and ${remaining} more ${label}`;
  }

  return preview;
}

/**
 * Parse timestamp string from Google Sheets as Manila time (GMT+8) and convert to UTC
 * Handles two formats:
 * 1. "MM/DD/YY HH:MM" (manual format)
 * 2. "Sat Nov 01 2025 03:16:00 GMT+0800 (Philippine Standard Time)" (Google Sheets Date toString)
 * @param {string} timestampStr - Timestamp string from Google Sheets
 * @returns {Date} UTC Date object
 */
function parseManilaTimeToUTC(timestampStr) {
  const str = timestampStr.trim();

  // Format 1: Try "MM/DD/YY HH:MM" pattern first
  const shortMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (shortMatch) {
    const [_, month, day, year, hour, minute] = shortMatch;
    const fullYear = 2000 + parseInt(year);
    const manilaDate = new Date(Date.UTC(
      fullYear,
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      0,
      0
    ));
    // Subtract 8 hours to convert Manila time to UTC
    const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
    return new Date(manilaDate.getTime() - MANILA_OFFSET_MS);
  }

  // Format 2: Google Sheets Date toString format (already includes timezone)
  // Example: "Sat Nov 01 2025 03:16:00 GMT+0800 (Philippine Standard Time)"
  // This format already has timezone offset, so JavaScript Date() will parse correctly
  const date = new Date(str);

  if (isNaN(date.getTime())) {
    console.warn(`⚠️ Failed to parse timestamp: "${str}"`);
    return new Date(); // Fallback to current time
  }

  return date; // Already in correct UTC after parsing GMT+0800
}

/**
 * Format summary output (Discord-safe)
 * Keeps output under 1500 chars to stay well below Discord's 2000 limit
 */
function formatSummary(results) {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '📊 SYNC SUMMARY',
    '═══════════════════════════════════════════════════════════════'
  ];

  if (results.members) {
    const createdStr = results.members.created > 0 ? ` (${results.members.created} new)` : '';
    lines.push(`👥 Members: ${results.members.synced} synced${createdStr}, ${results.members.skipped} skipped`);
    if (results.members.deactivated > 0) {
      lines.push(`⚠️ Inactive: ${results.members.deactivated} members (removed from Sheets)`);
    }
    if (results.members.created > 0) {
      lines.push(`ℹ️  New members will auto-migrate to Discord ID on first bot interaction`);
    }
  }

  if (results.items) {
    lines.push(`🎁 Auction Items: ${results.items.synced} synced`);
  }

  if (results.rotation) {
    lines.push(`🔄 Boss Rotation: ${results.rotation.synced} bosses synced`);
  }

  if (results.attendance) {
    lines.push(`📅 Attendance: ${results.attendance.synced} new records, ${results.attendance.skipped} already existed`);
  }

  lines.push('');

  if (DRY_RUN) {
    lines.push('🔍 DRY RUN COMPLETE - No changes were made');
  } else {
    lines.push('✅ SYNC COMPLETE - MongoDB is now up to date with Google Sheets');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC MODULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync members (bidding points) from Sheets → MongoDB
 * Maps to: USE_MONGODB_BIDDING feature flag
 */
async function syncMembers(db, sheetAPI) {
  log('🔄', 'Syncing members (bidding points)...');

  try {
    // Fetch latest data from Google Sheets
    log('📥', 'Fetching members from Google Sheets...');
    const response = await sheetAPI.call('getBiddingPoints');

    // Validate response structure
    if (!response || response.status !== 'ok') {
      log('⚠️', `Invalid response from Google Sheets: ${JSON.stringify(response).substring(0, 200)}`);
      return { synced: 0, skipped: 0, deactivated: 0 };
    }

    const membersData = response.members || [];

    if (!Array.isArray(membersData)) {
      log('⚠️', `Invalid members data (expected array, got ${typeof membersData})`);
      return { synced: 0, skipped: 0, deactivated: 0 };
    }

    if (membersData.length === 0) {
      log('⚠️', 'No members found in Google Sheets (empty array)');
      return { synced: 0, skipped: 0, deactivated: 0 };
    }

    log('✅', `Found ${membersData.length} members in Google Sheets`);

    if (DRY_RUN) {
      log('🔍', '[DRY RUN] Would sync members:');
      // Filter out invalid members for preview
      const validMembers = membersData.filter(m => m && m.username && m.username.trim() !== '');
      const preview = formatPreview(
        validMembers,
        m => `   - ${m.username}: ${m.pointsLeft || 0} left, ${m.pointsConsumed || 0} spent`,
        'members'
      );
      console.log(preview);
      const skipped = membersData.length - validMembers.length;
      if (skipped > 0) {
        log('⚠️', `Would skip ${skipped} members with invalid/missing usernames`);
      }
      return { synced: validMembers.length, skipped, deactivated: 0 };
    }

    // Update MongoDB
    const collectionName = `members-${guildName.toLowerCase().replace(/\s+/g, '-')}`;
    const membersCollection = db.collection(collectionName);
    let synced = 0;
    let skipped = 0;
    let created = 0;

    // Step 1: Mark all existing members as inactive
    log('🔄', 'Marking existing members as inactive...');
    await membersCollection.updateMany(
      {},
      { $set: { isActive: false } }
    );

    // Step 2: Update/create members from Sheets (marking as active)
    for (const memberData of membersData) {
      try {
        // Skip if username is missing or invalid
        if (!memberData || !memberData.username || memberData.username.trim() === '') {
          log('⚠️', `Skipping member with invalid/missing username: ${JSON.stringify(memberData)}`);
          skipped++;
          continue;
        }

        const username = memberData.username.trim();
        const pointsAvailable = memberData.pointsLeft || 0;
        const pointsSpent = memberData.pointsConsumed || 0;
        const pointsEarned = pointsAvailable + pointsSpent; // Total earned = left + spent

        // Find member by username (case-insensitive)
        const existingMember = await membersCollection.findOne({
          username: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (existingMember) {
          // Check if we have a Discord ID for this member
          const discordId = discordIdMap[username];
          
          // Update existing member's points and mark as active
          await membersCollection.updateOne(
            { _id: existingMember._id },
            {
              $set: {
                pointsAvailable: pointsAvailable,
                pointsEarned: pointsEarned,
                pointsSpent: pointsSpent,
                username: username, // Update to current casing
                isActive: true,  // Re-activate member
                discordId: discordId || existingMember.discordId, // Add Discord ID if available
                lastUpdated: new Date()
              }
            }
          );
          
          // If member has temp ID but we have Discord ID, migrate them properly
          if (existingMember._id.startsWith('temp_') && discordId) {
            // Delete old temp member and create new with Discord ID
            const memberData = {
              _id: discordId,
              username: username,
              discordId: discordId,
              pointsAvailable: pointsAvailable,
              pointsEarned: pointsEarned,
              pointsSpent: pointsSpent,
              isActive: true,
              attendance: existingMember.attendance || { total: 0, thisWeek: 0, thisMonth: 0, byBoss: {}, streak: { current: 0, longest: 0 } },
              joinedAt: existingMember.joinedAt || new Date(),
              lastUpdated: new Date()
            };
            
            // Update attendance records first
            await db.collection('attendance').updateMany(
              { memberId: existingMember._id },
              { $set: { memberId: discordId } }
            );
            
            // Delete old and insert new
            await membersCollection.deleteOne({ _id: existingMember._id });
            await membersCollection.insertOne(memberData);
            log('🎯', `Migrated ${username} from temp ID to Discord ID: ${discordId}`);
          }
          synced++;
        } else {
          // Create new member - check if we have Discord ID
          const discordId = discordIdMap[username];
          const memberId = discordId || `temp_${username.toLowerCase().replace(/\s+/g, '_')}`;
          
          await membersCollection.insertOne({
            _id: memberId,
            username: username,
            discordId: discordId || null,
            pointsAvailable: pointsAvailable,
            pointsEarned: pointsEarned,
            pointsSpent: pointsSpent,
            isActive: true,  // New members are active
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
          created++;
          synced++;
          
          if (discordId) {
            log('🎯', `Created member ${username} with Discord ID: ${discordId}`);
          } else {
            log('➕', `Created new member: ${username} (no Discord nickname match — will migrate on first interaction)`);
          }
        }
      } catch (error) {
        const username = memberData?.username || 'unknown';
        log('⚠️', `Failed to sync ${username}: ${error.message}`);
        skipped++;
      }
    }

    // Step 3: Count deactivated members (not in current Sheets)
    const inactiveCount = await membersCollection.countDocuments({ isActive: false });

    log('✅', `Members synced: ${synced} (${created} new), skipped: ${skipped}`);
    if (inactiveCount > 0) {
      log('ℹ️', `Inactive members (removed from Sheets): ${inactiveCount}`);
    }

    return { synced, skipped, deactivated: inactiveCount, created };

  } catch (error) {
    log('❌', `Member sync failed: ${error.message}`);
    throw error;
  }
}

/**
 * Sync auction items from Sheets → MongoDB
 * Maps to: USE_MONGODB_AUCTIONEERING feature flag
 */
async function syncAuctionItems(db, sheetAPI) {
  log('🔄', 'Syncing auction items...');

  try {
    // Fetch latest data from Google Sheets
    log('📥', 'Fetching auction items from Google Sheets...');
    const response = await sheetAPI.call('getBiddingItems');

    // Validate response structure
    if (!response || response.status !== 'ok') {
      log('⚠️', `Invalid response from Google Sheets: ${JSON.stringify(response).substring(0, 200)}`);
      return { synced: 0, skipped: 0 };
    }

    const itemsData = response.items || [];

    if (!Array.isArray(itemsData)) {
      log('⚠️', `Invalid items data (expected array, got ${typeof itemsData})`);
      return { synced: 0, skipped: 0 };
    }

    if (itemsData.length === 0) {
      log('⚠️', 'No auction items found in Google Sheets (empty array)');
      return { synced: 0, skipped: 0 };
    }

    log('✅', `Found ${itemsData.length} auction items in Google Sheets`);

    if (DRY_RUN) {
      log('🔍', '[DRY RUN] Would sync items:');
      const preview = formatPreview(
        itemsData,
        item => `   - ${item.item} (${item.startPrice} pts)`,
        'items'
      );
      console.log(preview);
      return { synced: itemsData.length, skipped: 0 };
    }

    // Clear existing items and insert fresh data
    const collectionName = `auctionItems-${guildName.toLowerCase().replace(/\s+/g, '-')}`;
    const itemsCollection = db.collection(collectionName);

    log('🗑️', 'Clearing old auction items...');
    await itemsCollection.deleteMany({});

    log('💾', 'Inserting fresh auction items...');
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const itemDocs = itemsData.map((item, index) => ({
      _id: `item_${timestamp}_${randomSuffix}_${index}`,
      itemName: item.item,
      startPrice: parseInt(item.startPrice) || 0,
      duration: parseInt(item.duration) || 60,
      quantity: parseInt(item.quantity) || 1,
      boss: item.boss || 'Unknown',
      source: item.source || 'Google Sheets',
      status: 'pending',
      addedAt: new Date(),
      sheetRow: index + 2 // Sheet row number (1-indexed + header)
    }));

    const result = await itemsCollection.insertMany(itemDocs, { ordered: false });
    const synced = result.insertedCount;

    log('✅', `Auction items synced: ${synced}`);
    return { synced, skipped: 0 };

  } catch (error) {
    log('❌', `Auction items sync failed: ${error.message}`);
    throw error;
  }
}

/**
 * Sync boss rotation from Sheets → MongoDB
 * Maps to: Boss rotation tracking feature
 */
async function syncBossRotation(db, sheetAPI) {
  log('🔄', 'Syncing boss rotation...');

  try {
    // Fetch list of rotating bosses from Google Sheets
    log('📥', 'Fetching rotating bosses from Google Sheets...');
    const bossesResponse = await sheetAPI.call('getAllRotatingBosses');

    // Validate response structure
    if (!bossesResponse || bossesResponse.status !== 'ok') {
      log('⚠️', `Invalid response from Google Sheets: ${JSON.stringify(bossesResponse).substring(0, 200)}`);
      return { synced: 0, skipped: 0 };
    }

    const rotatingBosses = bossesResponse.bosses || [];

    if (!Array.isArray(rotatingBosses)) {
      log('⚠️', `Invalid bosses data (expected array, got ${typeof rotatingBosses})`);
      return { synced: 0, skipped: 0 };
    }

    if (rotatingBosses.length === 0) {
      log('⚠️', 'No rotating bosses found in Google Sheets (empty array)');
      return { synced: 0, skipped: 0 };
    }

    log('✅', `Found ${rotatingBosses.length} rotating bosses in Google Sheets`);

    // Fetch rotation status for each boss
    const rotationData = [];
    for (const bossName of rotatingBosses) {
      try {
        const rotationResponse = await sheetAPI.call('getBossRotation', { bossName });

        if (rotationResponse && rotationResponse.status === 'ok' && rotationResponse.isRotating) {
          rotationData.push({
            _id: bossName.toLowerCase().replace(/\s+/g, '_'),
            bossName: rotationResponse.bossName,
            currentIndex: rotationResponse.currentIndex || 1,
            currentGuild: rotationResponse.currentGuild || 'Unknown',
            isOurTurn: rotationResponse.isOurTurn || false,
            guilds: rotationResponse.guilds || [],
            nextGuild: rotationResponse.nextGuild || 'Unknown',
            lastUpdated: new Date()
          });
        }
      } catch (bossError) {
        log('⚠️', `Failed to fetch rotation for ${bossName}: ${bossError.message}`);
      }
    }

    if (rotationData.length === 0) {
      log('⚠️', 'No rotation data fetched from Google Sheets');
      return { synced: 0, skipped: 0 };
    }

    if (DRY_RUN) {
      log('🔍', '[DRY RUN] Would sync rotation data:');
      const preview = formatPreview(
        rotationData,
        rotation => `   - ${rotation.bossName}: Index ${rotation.currentIndex} (${rotation.currentGuild}) ${rotation.isOurTurn ? '🟢 OUR TURN' : '🔴'}`,
        'bosses'
      );
      console.log(preview);
      return { synced: rotationData.length, skipped: 0 };
    }

// Upsert rotation data (update existing, insert new) - prevents duplicate key errors
    const collectionName = `bossRotation-${guildName.toLowerCase().replace(/\s+/g, '-')}`;
    const rotationCollection = db.collection(collectionName);

    log('💾', 'Upserting boss rotation data...');
    const bulkOps = rotationData.map(rotation => ({
      updateOne: {
        filter: { _id: rotation._id },
        update: {
          $set: {
            bossName: rotation.bossName,
            currentIndex: rotation.currentIndex,
            currentGuild: rotation.currentGuild,
            isOurTurn: rotation.isOurTurn,
            guilds: rotation.guilds,
            nextGuild: rotation.nextGuild,
            lastUpdated: rotation.lastUpdated
          }
        },
        upsert: true
      }
    }));

    const result = await rotationCollection.bulkWrite(bulkOps, { ordered: false });
    const synced = result.upsertedCount + result.modifiedCount;

    log('✅', `Boss rotation synced: ${synced} bosses`);
    return { synced, skipped: 0 };

  } catch (error) {
    log('❌', `Boss rotation sync failed: ${error.message}`);
    throw error;
  }
}

/**
 * Sync attendance records from Sheets → MongoDB (non-duplicating)
 * Uses unique key (memberName + bossName + timestamp) to prevent duplicates
 * Safe to run multiple times - only inserts new records
 *
 * OPTIMIZED VERSION: Uses batching and bulk operations to handle large datasets (14k+ records)
 */
async function syncAttendance(db, sheetAPI) {
  log('🔄', 'Syncing attendance records...');

try {
    // PERF FIX: Smart check - compare counts and timestamps
    const collectionName = `attendance-${guildName.toLowerCase().replace(/\s+/g, '-')}`;
    const attendanceCollection = db.collection(collectionName);
    const existingCount = await attendanceCollection.countDocuments();

    // If we have a lot of records, check if there are NEW ones before doing expensive fetch
    if (existingCount > 14000 && !process.argv.includes('--force-attendance')) {
      // Quick check: Get latest timestamp in MongoDB
      const latestRecord = await attendanceCollection
        .find({})
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();

      const latestTimestamp = latestRecord.length > 0 ? latestRecord[0].timestamp : null;

      if (latestTimestamp) {
        const hoursSinceLastSync = (Date.now() - new Date(latestTimestamp).getTime()) / (1000 * 60 * 60);

        // If last record is less than 1 hour old, likely no new spawns yet
        if (hoursSinceLastSync < 1) {
          log('⏭️', `Attendance recently synced (${existingCount} records, last: ${new Date(latestTimestamp).toLocaleString()})`);
          log('ℹ️', 'Use --force-attendance flag to force re-sync');
          return { synced: 0, skipped: existingCount };
        } else {
          log('🔍', `Checking for new attendance records (last sync: ${hoursSinceLastSync.toFixed(1)}h ago)...`);
        }
      }
    }

    // Fetch all attendance from Google Sheets
    log('📥', 'Fetching attendance from Google Sheets...');
    const response = await sheetAPI.call('getAllWeeklyAttendance');

    // Validate response structure
    if (!response || !Array.isArray(response)) {
      log('⚠️', `Invalid response from Google Sheets: ${JSON.stringify(response).substring(0, 200)}`);
      return { synced: 0, skipped: 0 };
    }

    const attendanceRecords = response;

    if (attendanceRecords.length === 0) {
      log('⚠️', 'No attendance records found in Google Sheets (empty array)');
      return { synced: 0, skipped: 0 };
    }

    log('✅', `Found ${attendanceRecords.length} attendance records in Google Sheets`);

    if (DRY_RUN) {
      log('🔍', '[DRY RUN] Would sync attendance records:');
      const preview = formatPreview(
        attendanceRecords,
        record => `   - ${record.memberName}: ${record.bossName} on ${new Date(record.timestamp || record.date).toLocaleDateString()}`,
        'records'
      );
      console.log(preview);
      return { synced: attendanceRecords.length, skipped: 0 };
    }

    // Reuse attendanceCollection from above (already declared with guild suffix)
    const membersCollectionName = `members-${guildName.toLowerCase().replace(/\s+/g, '-')}`;
    const membersCollection = db.collection(membersCollectionName);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Pre-fetch all members and build username → member map (1 query)
    // ═══════════════════════════════════════════════════════════════════════════
    log('📥', 'Pre-fetching all members...');
    const allMembers = await membersCollection.find({}).toArray();
    const memberMap = new Map();
    for (const member of allMembers) {
      memberMap.set(member.username.toLowerCase(), member);
    }
    log('✅', `Loaded ${allMembers.length} members into memory`);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Identify missing members and batch create them
    // ═══════════════════════════════════════════════════════════════════════════
    const missingMembers = new Set();
    for (const record of attendanceRecords) {
      if (!memberMap.has(record.memberName.toLowerCase())) {
        missingMembers.add(record.memberName);
      }
    }

    if (missingMembers.size > 0) {
      log('➕', `Creating ${missingMembers.size} missing members...`);
      const newMemberDocs = Array.from(missingMembers).map(username => {
        // Check if we have a Discord ID for this nickname
        const discordId = discordIdMap[username];
        
        return {
          _id: discordId || `temp_${username.toLowerCase().replace(/\s+/g, '_')}`,
          username: username,
          discordId: discordId || null,
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
        };
      });

      // Log which members will get Discord IDs
      const withDiscordId = newMemberDocs.filter(m => m.discordId);
      if (withDiscordId.length > 0) {
        log('🎯', `${withDiscordId.length} members will use Discord IDs:`);
        withDiscordId.forEach(m => {
          console.log(`   - ${m.username}: ${m.discordId}`);
        });
      }

      try {
        await membersCollection.insertMany(newMemberDocs, { ordered: false });
        log('✅', `Created ${missingMembers.size} new members`);

        // Update member map with new members
        for (const newMember of newMemberDocs) {
          memberMap.set(newMember.username.toLowerCase(), newMember);
        }
      } catch (error) {
        // Some members may have been created by concurrent processes, ignore duplicates
        if (error.code !== 11000) { // Not a duplicate key error
          log('⚠️', `Warning: Some members may not have been created: ${error.message}`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Batch upsert attendance records (500 at a time)
    // ═══════════════════════════════════════════════════════════════════════════
    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(attendanceRecords.length / BATCH_SIZE);
    let totalSynced = 0;
    let totalSkipped = 0;

    log('💾', `Upserting attendance in ${totalBatches} batches of ${BATCH_SIZE}...`);

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const start = batchNum * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, attendanceRecords.length);
      const batch = attendanceRecords.slice(start, end);

      // Build bulk operations for this batch
      const bulkOps = batch.map(record => {
        const member = memberMap.get(record.memberName.toLowerCase());
        if (!member) {
          log('⚠️', `Member not found in map: ${record.memberName}`);
          return null;
        }

        // Parse timestamp as Manila time (GMT+8) and convert to UTC
        const timestamp = parseManilaTimeToUTC(record.timestamp || record.date);
        const uniqueKey = {
          memberId: member._id,
          memberName: record.memberName,
          bossName: record.bossName,
          timestamp: timestamp
        };

        return {
          updateOne: {
            filter: uniqueKey,
            update: {
              $set: {
                memberId: member._id,
                memberName: record.memberName,
                bossName: record.bossName,
                bossPoints: record.points || 1,
                timestamp: timestamp,
                weekStartDate: record.weekStartDate ? parseManilaTimeToUTC(record.weekStartDate) : null,
                weekLabel: record.weekLabel || 'Unknown',
                verified: true,
                syncedFromSheet: true,
                syncedAt: new Date()
              }
            },
            upsert: true
          }
        };
      }).filter(op => op !== null);

      if (bulkOps.length === 0) {
        continue;
      }

      try {
        const result = await attendanceCollection.bulkWrite(bulkOps, { ordered: false });
        const synced = result.upsertedCount || 0;
        const skipped = bulkOps.length - synced;

        totalSynced += synced;
        totalSkipped += skipped;

        // Progress logging every 5 batches
        if ((batchNum + 1) % 5 === 0 || batchNum === totalBatches - 1) {
          const progress = Math.round(((batchNum + 1) / totalBatches) * 100);
          log('⏳', `Progress: ${progress}% (${batchNum + 1}/${totalBatches} batches) - ${totalSynced} new, ${totalSkipped} existing`);
        }
      } catch (error) {
        log('⚠️', `Batch ${batchNum + 1} failed: ${error.message}`);
      }
    }

    log('✅', `Attendance synced: ${totalSynced} new records, ${totalSkipped} already existed`);
    return { synced: totalSynced, skipped: totalSkipped };

  } catch (error) {
    log('❌', `Attendance sync failed: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔄 GOOGLE SHEETS → MONGODB SYNC');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (DRY_RUN) {
    log('🔍', 'DRY RUN MODE - No data will be modified');
    console.log('');
  }

  const sheetAPI = new SheetAPI(config.sheet_webhook_url);
  let db;

  try {
    // Connect to MongoDB
    log('🔌', 'Connecting to MongoDB...');
    db = await dbAPI.connect();
    log('✅', 'MongoDB connected');
    console.log('');

    // Try to fetch Discord members via API for real Discord IDs
    // This eliminates temp_ IDs for members who are in the Discord server
    const discordToken = process.env.DISCORD_TOKEN;
    if (discordToken && config.main_guild_id) {
      try {
        const discordMemberMap = await fetchDiscordMemberMap(discordToken, config.main_guild_id);
        const oldCount = Object.keys(discordIdMap).length;
        discordIdMap = { ...discordIdMap, ...discordMemberMap };
        const newCount = Object.keys(discordIdMap).length;
        console.log(`📋 Discord ID mappings: ${newCount} total (${newCount - oldCount} from API, ${oldCount} from file)`);
      } catch (error) {
        console.log(`⚠️ Failed to fetch Discord members: ${error.message}`);
        console.log('ℹ️ Will use static mapping + temp IDs as fallback');
      }
    } else {
      console.log('ℹ️ DISCORD_TOKEN not found in environment — will use temp IDs for members without mapping');
    }

    const results = {};

    // Sync members (bidding points)
    if (SYNC_MEMBERS) {
      results.members = await syncMembers(db, sheetAPI);
      console.log('');
    }

    // Sync auction items
    if (SYNC_ITEMS) {
      results.items = await syncAuctionItems(db, sheetAPI);
      console.log('');
    }

    // Sync boss rotation
    if (SYNC_ROTATION) {
      results.rotation = await syncBossRotation(db, sheetAPI);
      console.log('');
    }

    // Sync attendance records
    if (SYNC_ATTENDANCE) {
      results.attendance = await syncAttendance(db, sheetAPI);
      console.log('');
    } else if (SKIP_ATTENDANCE) {
      log('⏭️', 'Skipping attendance sync (SKIP_ATTENDANCE_SYNC=true)');
      console.log('');
    }

    // Summary (Discord-safe formatting)
    console.log(formatSummary(results));

    process.exit(0);

  } catch (error) {
    console.log('');
    log('❌', 'SYNC FAILED');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
