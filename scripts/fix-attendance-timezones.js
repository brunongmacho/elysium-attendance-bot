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
 * Usage:
 *   node scripts/fix-attendance-timezones.js [--dry-run] [--days=90]
 *
 * Options:
 *   --dry-run    Test mode, no changes made to database
 *   --days=N     Only update records from last N days (default: 90)
 *
 * =============================================================================
 */

const dbAPI = require('../utils/database-api');

const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 1000; // Process in batches of 1000 for performance

// Only update records from the last N days (older records don't affect current predictions)
const DAYS_TO_UPDATE = parseInt(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1]) || 90; // Default 90 days

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

    // Calculate date cutoff
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_UPDATE);

    console.log(`📅 Date filter: Only updating records from last ${DAYS_TO_UPDATE} days`);
    console.log(`   Cutoff date: ${cutoffDate.toISOString()}\n`);

    // Get attendance records from last N days
    console.log('📊 Fetching attendance records...');
    const attendanceRecords = await db.collection('attendance')
      .find({
        timestamp: { $gte: cutoffDate }
      })
      .toArray();
    console.log(`✅ Found ${attendanceRecords.length} attendance records (last ${DAYS_TO_UPDATE} days)\n`);

    if (attendanceRecords.length === 0) {
      console.log('ℹ️  No records to process. Exiting.');
      process.exit(0);
    }

    // Process records in batches
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const totalRecords = attendanceRecords.length;

    console.log('🔄 Processing records in batches...\n');

    // Show first 5 examples
    const exampleRecords = attendanceRecords.slice(0, 5);
    for (const record of exampleRecords) {
      if (!record.timestamp) continue;

      const oldDate = new Date(record.timestamp);
      const newDate = new Date(oldDate.getTime() - TIMEZONE_OFFSET_MS);

      console.log(`📝 Example ${updatedCount + 1}:`);
      console.log(`   Boss: ${record.bossName}`);
      console.log(`   Member: ${record.memberName}`);
      console.log(`   Old: ${oldDate.toISOString()} (${oldDate.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} Manila)`);
      console.log(`   New: ${newDate.toISOString()} (${newDate.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} Manila)`);
      console.log('');
      updatedCount++;
    }

    // Process remaining records in batches
    if (!DRY_RUN) {
      console.log('🚀 Starting batch updates...\n');

      for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
        const batch = attendanceRecords.slice(i, i + BATCH_SIZE);
        const bulkOps = [];

        for (const record of batch) {
          if (!record.timestamp) {
            skippedCount++;
            continue;
          }

          try {
            const oldDate = new Date(record.timestamp);
            const newDate = new Date(oldDate.getTime() - TIMEZONE_OFFSET_MS);

            bulkOps.push({
              updateOne: {
                filter: { _id: record._id },
                update: { $set: { timestamp: newDate } }
              }
            });
          } catch (error) {
            console.error(`❌ Error preparing record ${record._id}:`, error.message);
            errorCount++;
          }
        }

        // Execute batch update
        if (bulkOps.length > 0) {
          try {
            await db.collection('attendance').bulkWrite(bulkOps, { ordered: false });
            updatedCount += bulkOps.length;

            // Show progress
            const progress = Math.min(i + BATCH_SIZE, totalRecords);
            const percentage = ((progress / totalRecords) * 100).toFixed(1);
            console.log(`   ⏳ Progress: ${progress}/${totalRecords} (${percentage}%) - Updated ${updatedCount} records`);
          } catch (error) {
            console.error(`❌ Batch update error:`, error.message);
            errorCount += bulkOps.length;
          }
        }
      }
    } else {
      // Dry run - just count
      updatedCount = totalRecords;
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
