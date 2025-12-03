/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Historical Attendance Import
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One-time import of historical attendance data from Google Sheets → MongoDB
 *
 * This script:
 * - Checks if already imported (skips if attendance collection has data)
 * - Reads all historical attendance from ELYSIUM_WEEK_* sheets
 * - Maps members to Discord IDs (or temp IDs)
 * - Inserts records into MongoDB attendance collection
 * - Updates member attendance stats
 *
 * Safe to run multiple times (idempotent - won't duplicate data)
 *
 * Usage:
 *   node scripts/import-historical-attendance.js              # Auto-detect
 *   node scripts/import-historical-attendance.js --force      # Force re-import
 *   node scripts/import-historical-attendance.js --dry-run    # Preview only
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
const FORCE_IMPORT = process.argv.includes('--force');

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

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN IMPORT LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function importHistoricalAttendance(db, sheetAPI) {
  const attendanceCollection = db.collection('attendance');
  const membersCollection = db.collection('members');

  // Step 1: Check if already imported (unless --force)
  if (!FORCE_IMPORT) {
    const existingCount = await attendanceCollection.countDocuments();
    if (existingCount > 0) {
      log('ℹ️', `Historical attendance already imported (${existingCount} records)`);
      log('ℹ️', 'Use --force to re-import or skip this step');
      return { imported: 0, skipped: existingCount, alreadyImported: true };
    }
  }

  log('🔄', 'Importing historical attendance from Google Sheets...');

  try {
    // Step 2: Fetch all historical attendance from Sheets
    log('📥', 'Fetching historical attendance data...');
    const response = await sheetAPI.call('getAllWeeklyAttendance');

    if (!response || !Array.isArray(response)) {
      log('⚠️', 'Invalid response from Google Sheets');
      return { imported: 0, skipped: 0, error: 'Invalid response' };
    }

    const attendanceRecords = response;
    log('✅', `Found ${attendanceRecords.length} historical attendance records`);

    if (attendanceRecords.length === 0) {
      log('⚠️', 'No historical attendance found in Google Sheets');
      return { imported: 0, skipped: 0 };
    }

    if (DRY_RUN) {
      log('🔍', '[DRY RUN] Would import records:');
      const sample = attendanceRecords.slice(0, 5);
      sample.forEach(record => {
        log('', `   - ${record.memberName}: ${record.bossName} on ${record.date}`);
      });
      if (attendanceRecords.length > 5) {
        log('', `   ... and ${attendanceRecords.length - 5} more records`);
      }
      return { imported: attendanceRecords.length, skipped: 0, dryRun: true };
    }

    // Step 3: Import records to MongoDB
    let imported = 0;
    let skipped = 0;
    const statsUpdates = new Map(); // Track stats updates per member

    log('💾', 'Importing attendance records to MongoDB...');

    for (const record of attendanceRecords) {
      try {
        // Find member by username (case-insensitive)
        const member = await membersCollection.findOne({
          username: { $regex: new RegExp(`^${record.memberName}$`, 'i') }
        });

        if (!member) {
          log('⚠️', `Member not found: ${record.memberName} - creating with temp ID`);

          // Create member with temp ID
          const tempId = `temp_${record.memberName.toLowerCase().replace(/\s+/g, '_')}`;
          await membersCollection.insertOne({
            _id: tempId,
            username: record.memberName,
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
        }

        // Re-fetch member after potential creation
        const finalMember = await membersCollection.findOne({
          username: { $regex: new RegExp(`^${record.memberName}$`, 'i') }
        });

        // Insert attendance record
        const attendanceDoc = {
          memberId: finalMember._id,
          memberName: record.memberName,
          bossName: record.bossName,
          bossPoints: record.points || 1,
          timestamp: new Date(record.timestamp || record.date),
          weekStartDate: record.weekStartDate ? new Date(record.weekStartDate) : null,
          weekLabel: record.weekLabel || 'Unknown',
          verified: true,
          historical: true, // Mark as historical import
          importedAt: new Date()
        };

        await attendanceCollection.insertOne(attendanceDoc);
        imported++;

        // Track stats for batch update
        if (!statsUpdates.has(finalMember._id)) {
          statsUpdates.set(finalMember._id, {
            total: 0,
            byBoss: {}
          });
        }

        const stats = statsUpdates.get(finalMember._id);
        stats.total++;
        stats.byBoss[record.bossName] = (stats.byBoss[record.bossName] || 0) + 1;

      } catch (error) {
        log('⚠️', `Failed to import record for ${record.memberName}: ${error.message}`);
        skipped++;
      }
    }

    // Step 4: Update member stats (batch update)
    log('📊', 'Updating member attendance stats...');
    for (const [memberId, stats] of statsUpdates.entries()) {
      const updateFields = {
        'attendance.total': stats.total
      };

      // Update per-boss stats
      for (const [boss, count] of Object.entries(stats.byBoss)) {
        updateFields[`attendance.byBoss.${boss}`] = count;
      }

      await membersCollection.updateOne(
        { _id: memberId },
        { $set: updateFields }
      );
    }

    log('✅', `Historical import complete: ${imported} records imported, ${skipped} skipped`);
    log('📊', `Updated stats for ${statsUpdates.size} members`);

    return { imported, skipped, membersUpdated: statsUpdates.size };

  } catch (error) {
    log('❌', `Historical import failed: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📚 HISTORICAL ATTENDANCE IMPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (DRY_RUN) {
    log('🔍', 'DRY RUN MODE - No data will be modified');
    console.log('');
  }

  if (FORCE_IMPORT) {
    log('⚠️', 'FORCE MODE - Will re-import even if data exists');
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

    // Import historical data
    const result = await importHistoricalAttendance(db, sheetAPI);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');

    if (result.alreadyImported) {
      console.log('ℹ️  Historical data already imported - skipped');
    } else if (result.dryRun) {
      console.log(`🔍 DRY RUN: Would import ${result.imported} records`);
    } else {
      console.log(`✅ Imported: ${result.imported} records`);
      console.log(`⚠️  Skipped: ${result.skipped} records`);
      console.log(`📊 Members updated: ${result.membersUpdated || 0}`);
    }

    console.log('');

    process.exit(0);

  } catch (error) {
    console.log('');
    log('❌', 'IMPORT FAILED');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
