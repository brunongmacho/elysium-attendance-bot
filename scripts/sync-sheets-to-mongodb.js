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
 * - ⏳ Phase 4.3: Attendance records (coming soon)
 * - ⏳ Phase 4.4: Boss rotation (coming soon)
 *
 * Usage:
 *   node scripts/sync-sheets-to-mongodb.js              # Sync all modules
 *   node scripts/sync-sheets-to-mongodb.js --members    # Sync members only
 *   node scripts/sync-sheets-to-mongodb.js --items      # Sync auction items only
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
         process.argv.includes('--items');
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
    lines.push(`👥 Members: ${results.members.synced} synced, ${results.members.skipped} skipped`);
  }

  if (results.items) {
    lines.push(`🎁 Auction Items: ${results.items.synced} synced`);
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
    const membersData = await sheetAPI.call('getBiddingPointsSummary');

    // Validate response is an array
    if (!membersData) {
      log('⚠️', 'No response from Google Sheets (null/undefined)');
      return { synced: 0, skipped: 0 };
    }

    if (!Array.isArray(membersData)) {
      log('⚠️', `Invalid response from Google Sheets (expected array, got ${typeof membersData})`);
      log('⚠️', `Response: ${JSON.stringify(membersData).substring(0, 200)}`);
      return { synced: 0, skipped: 0 };
    }

    if (membersData.length === 0) {
      log('⚠️', 'No members found in Google Sheets (empty array)');
      return { synced: 0, skipped: 0 };
    }

    log('✅', `Found ${membersData.length} members in Google Sheets`);

    if (DRY_RUN) {
      log('🔍', '[DRY RUN] Would sync members:');
      // Filter out invalid members for preview
      const validMembers = membersData.filter(m => m && m.username && m.username.trim() !== '');
      const preview = formatPreview(
        validMembers,
        m => `   - ${m.username}: ${m.pointsAvailable || 0} pts`,
        'members'
      );
      console.log(preview);
      const skipped = membersData.length - validMembers.length;
      if (skipped > 0) {
        log('⚠️', `Would skip ${skipped} members with invalid/missing usernames`);
      }
      return { synced: validMembers.length, skipped };
    }

    // Update MongoDB
    const membersCollection = db.collection('members');
    let synced = 0;
    let skipped = 0;

    for (const memberData of membersData) {
      try {
        // Skip if username is missing or invalid
        if (!memberData || !memberData.username || memberData.username.trim() === '') {
          log('⚠️', `Skipping member with invalid/missing username: ${JSON.stringify(memberData)}`);
          skipped++;
          continue;
        }

        // Find member by username (will be Discord ID after migration)
        const existingMember = await membersCollection.findOne({
          username: memberData.username
        });

        if (existingMember) {
          // Update existing member's points
          await membersCollection.updateOne(
            { _id: existingMember._id },
            {
              $set: {
                pointsAvailable: memberData.pointsAvailable || 0,
                pointsEarned: memberData.pointsEarned || 0,
                pointsSpent: memberData.pointsSpent || 0,
                username: memberData.username,
                lastUpdated: new Date()
              }
            }
          );
          synced++;
        } else {
          // Create new member (shouldn't happen after initial migration)
          await membersCollection.insertOne({
            _id: `temp_${memberData.username}`,
            username: memberData.username,
            pointsAvailable: memberData.pointsAvailable || 0,
            pointsEarned: memberData.pointsEarned || 0,
            pointsSpent: memberData.pointsSpent || 0,
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
          synced++;
        }
      } catch (error) {
        const username = memberData?.username || 'unknown';
        log('⚠️', `Failed to sync ${username}: ${error.message}`);
        skipped++;
      }
    }

    log('✅', `Members synced: ${synced}, skipped: ${skipped}`);
    return { synced, skipped };

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
    const itemsData = await sheetAPI.call('getBiddingItems');

    // Validate response is an array
    if (!itemsData) {
      log('⚠️', 'No response from Google Sheets (null/undefined)');
      return { synced: 0, skipped: 0 };
    }

    if (!Array.isArray(itemsData)) {
      log('⚠️', `Invalid response from Google Sheets (expected array, got ${typeof itemsData})`);
      log('⚠️', `Response: ${JSON.stringify(itemsData).substring(0, 200)}`);
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
