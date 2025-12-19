/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLEANUP SCRIPT: Remove synced attendance records before re-import
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This script removes all attendance records that were synced from Google Sheets
 * (marked with syncedFromSheet: true) to prepare for a fresh import with correct
 * timezone handling.
 *
 * Usage:
 *   node scripts/cleanup-synced-attendance.js              # Dry run (preview only)
 *   node scripts/cleanup-synced-attendance.js --confirm    # Actually delete
 *
 * After running this script, run the sync script to re-import with correct timestamps:
 *   node scripts/sync-sheets-to-mongodb.js --attendance --force-attendance
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('../utils/database-api');

const CONFIRM = process.argv.includes('--confirm');

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧹 CLEANUP: Remove Synced Attendance Records');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (!CONFIRM) {
    log('🔍', 'DRY RUN MODE - No data will be deleted');
    log('ℹ️', 'Use --confirm flag to actually delete records');
    console.log('');
  }

  try {
    // Connect to MongoDB
    log('🔌', 'Connecting to MongoDB...');
    const db = await dbAPI.connect();
    const attendanceCollection = db.collection('attendance');

    // Get count of all attendance records
    const totalCount = await attendanceCollection.countDocuments();
    log('📊', `Total attendance records in MongoDB: ${totalCount.toLocaleString()}`);

    // Get count of synced records (from Google Sheets)
    const syncedCount = await attendanceCollection.countDocuments({
      syncedFromSheet: true
    });
    log('📋', `Records synced from Google Sheets: ${syncedCount.toLocaleString()}`);

    // Get count of bot-created records (not synced from sheets)
    const botCreatedCount = await attendanceCollection.countDocuments({
      syncedFromSheet: { $ne: true }
    });
    log('🤖', `Records created by bot: ${botCreatedCount.toLocaleString()}`);

    console.log('');
    log('🎯', 'This script will:');
    console.log(`   ✓ DELETE ${syncedCount.toLocaleString()} synced records`);
    console.log(`   ✓ KEEP ${botCreatedCount.toLocaleString()} bot-created records`);
    console.log(`   ✓ After cleanup: ${botCreatedCount.toLocaleString()} records remaining`);
    console.log('');

    if (!CONFIRM) {
      log('ℹ️', 'This is a DRY RUN. To actually delete records, run:');
      console.log('   node scripts/cleanup-synced-attendance.js --confirm');
      console.log('');
      process.exit(0);
    }

    // Confirm deletion
    log('⚠️', `About to DELETE ${syncedCount.toLocaleString()} synced records!`);
    log('⏳', 'Starting deletion in 5 seconds... (Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete synced records
    log('🗑️', 'Deleting synced attendance records...');
    const deleteResult = await attendanceCollection.deleteMany({
      syncedFromSheet: true
    });

    const deletedCount = deleteResult.deletedCount;
    log('✅', `Deleted ${deletedCount.toLocaleString()} synced records`);

    // Verify final count
    const finalCount = await attendanceCollection.countDocuments();
    log('📊', `Final attendance count: ${finalCount.toLocaleString()}`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    log('✅', 'CLEANUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    log('📝', 'Next step: Re-import attendance with correct timezone handling:');
    console.log('   node scripts/sync-sheets-to-mongodb.js --attendance --force-attendance');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.log('');
    log('❌', 'CLEANUP FAILED');
    console.error(error);
    process.exit(1);
  }
}

main();
