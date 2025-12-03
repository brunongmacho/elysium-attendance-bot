/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Sync Google Sheets → MongoDB
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Syncs latest data from Google Sheets to MongoDB for all MongoDB-enabled modules.
 *
 * As Phase 4 progresses, this script is updated to include new modules:
 * - ✅ Phase 4.1: Members (bidding points) - USE_MONGODB_BIDDING
 * - ✅ Phase 4.2: Auction Items - USE_MONGODB_AUCTIONEERING
 * - ✅ Phase 4.3: Boss Rotation - Boss rotation tracking
 * - ✅ Phase 4.4: Attendance records - USE_MONGODB_ATTENDANCE (historical import)
 *
 * Usage:
 *   node scripts/sync-sheets-to-mongodb.js              # Sync all modules
 *   node scripts/sync-sheets-to-mongodb.js --members    # Sync members only
 *   node scripts/sync-sheets-to-mongodb.js --items      # Sync auction items only
 *   node scripts/sync-sheets-to-mongodb.js --rotation   # Sync boss rotation only
 *   node scripts/sync-sheets-to-mongodb.js --dry-run    # Test without writing
 *
 * Note: Output is Discord-safe (stays under 2000 char limit) by limiting
 *       preview to first 5 items and using compact summary formatting.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('../utils/database-api');
const { SheetAPI } = require('../utils/sheet-api');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DRY_RUN = process.argv.includes('--dry-run');
const SYNC_MEMBERS = process.argv.includes('--members') || !hasModuleFlag();
const SYNC_ITEMS = process.argv.includes('--items') || !hasModuleFlag();
const SYNC_ROTATION = process.argv.includes('--rotation') || !hasModuleFlag();

// Load bot configuration
let config;
try {
  const configPath = path.join(__dirname, '..', 'config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Failed to load config.json:', error.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_PREVIEW_ITEMS = 5; // Limit preview to avoid Discord 2000 char limit

function hasModuleFlag() {
  return process.argv.includes('--members') ||
         process.argv.includes('--items') ||
         process.argv.includes('--rotation');
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
    const membersCollection = db.collection('members');
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
                lastUpdated: new Date()
              }
            }
          );
          synced++;
        } else {
          // Create new member with temp ID (will be migrated to Discord ID when they first interact)
          const tempId = `temp_${username.toLowerCase().replace(/\s+/g, '_')}`;
          await membersCollection.insertOne({
            _id: tempId,
            username: username,
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
          log('➕', `Created new member: ${username} with temp ID (will migrate to Discord ID on first interaction)`);
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
    const itemsCollection = db.collection('auctionItems');

    log('🗑️', 'Clearing old auction items...');
    await itemsCollection.deleteMany({});

    log('💾', 'Inserting fresh auction items...');
    const itemDocs = itemsData.map((item, index) => ({
      _id: `item_${Date.now()}_${index}`,
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

    // Clear existing rotation and insert fresh data
    const rotationCollection = db.collection('bossRotation');

    log('🗑️', 'Clearing old boss rotation data...');
    await rotationCollection.deleteMany({});

    log('💾', 'Inserting fresh boss rotation data...');
    const result = await rotationCollection.insertMany(rotationData, { ordered: false });
    const synced = result.insertedCount;

    log('✅', `Boss rotation synced: ${synced} bosses`);
    return { synced, skipped: 0 };

  } catch (error) {
    log('❌', `Boss rotation sync failed: ${error.message}`);
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
