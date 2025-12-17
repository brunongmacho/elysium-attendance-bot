/**
 * =============================================================================
 * ATTENDANCE TIMEZONE FIX MIGRATION SCRIPT
 * =============================================================================
 *
 * Purpose: Fix attendance timestamps that were incorrectly stored without
 *          proper GMT+8 to UTC conversion.
 *
 * Problem: Old code did `new Date(data.timestamp)` on strings like "12/17/24 14:39"
 *          JavaScript interpreted these as UTC instead of GMT+8, causing 8-hour offset.
 *
 * Solution: Subtract 8 hours from all attendance timestamps to correct the conversion.
 *
 * Example:
 *   Before: "12/17/24 14:39" stored as 2024-12-17T14:39:00Z (UTC)
 *   After:  "12/17/24 14:39" stored as 2024-12-17T06:39:00Z (UTC, which = 14:39 GMT+8)
 *
 * Usage: node scripts/fix-attendance-timezones.js [--dry-run]
 *
 * =============================================================================
 */

const dbAPI = require('../utils/database-api');

const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('=============================================================================');
  console.log('ATTENDANCE TIMEZONE FIX MIGRATION');
  console.log('=============================================================================\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Timestamps will be updated\n');
  }

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const db = await dbAPI.connect();
    console.log('✅ Connected to MongoDB\n');

    // Get all attendance records
    console.log('📊 Fetching all attendance records...');
    const attendanceRecords = await db.collection('attendance').find({}).toArray();
    console.log(`✅ Found ${attendanceRecords.length} attendance records\n`);

    if (attendanceRecords.length === 0) {
      console.log('ℹ️  No records to process. Exiting.');
      process.exit(0);
    }

    // Process records
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    console.log('🔄 Processing records...\n');

    for (const record of attendanceRecords) {
      try {
        const oldTimestamp = record.timestamp;

        if (!oldTimestamp) {
          console.log(`⚠️  Skipping record ${record._id} - no timestamp`);
          skippedCount++;
          continue;
        }

        // Calculate corrected timestamp (subtract 8 hours)
        const oldDate = new Date(oldTimestamp);
        const newDate = new Date(oldDate.getTime() - TIMEZONE_OFFSET_MS);

        // Show sample of changes
        if (updatedCount < 5) {
          console.log(`📝 Example ${updatedCount + 1}:`);
          console.log(`   Boss: ${record.bossName}`);
          console.log(`   Member: ${record.memberName}`);
          console.log(`   Old: ${oldDate.toISOString()} (${oldDate.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} Manila)`);
          console.log(`   New: ${newDate.toISOString()} (${newDate.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} Manila)`);
          console.log('');
        }

        // Update the record
        if (!DRY_RUN) {
          await db.collection('attendance').updateOne(
            { _id: record._id },
            { $set: { timestamp: newDate } }
          );
        }

        updatedCount++;

      } catch (error) {
        console.error(`❌ Error processing record ${record._id}:`, error.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n=============================================================================');
    console.log('MIGRATION SUMMARY');
    console.log('=============================================================================');
    console.log(`Total Records:   ${attendanceRecords.length}`);
    console.log(`✅ Updated:      ${updatedCount}`);
    console.log(`⏭️  Skipped:      ${skippedCount}`);
    console.log(`❌ Errors:       ${errorCount}`);
    console.log('=============================================================================\n');

    if (DRY_RUN) {
      console.log('🔍 DRY RUN COMPLETE - No changes were made');
      console.log('💡 Run without --dry-run to apply changes\n');
    } else {
      console.log('✅ MIGRATION COMPLETE - All timestamps corrected');
      console.log('💡 Spawn predictions in /rotation status should now show correct times\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the migration
main();
