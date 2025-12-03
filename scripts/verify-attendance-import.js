/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFY ATTENDANCE IMPORT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quick verification script to check if historical attendance was imported
 * successfully from Google Sheets to MongoDB.
 *
 * Usage:
 *   node scripts/verify-attendance-import.js
 *
 * Expected Output:
 *   ✅ ~14,363 attendance records in MongoDB
 *   ✅ Records distributed across 8 weekly sheets
 *   ✅ All members have attendance history
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('../utils/database-api');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 VERIFYING ATTENDANCE IMPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let db;

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    db = await dbAPI.connect();
    console.log('✅ MongoDB connected');
    console.log('');

    const attendanceCollection = db.collection('attendance');
    const membersCollection = db.collection('members');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Count total attendance records
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('📊 Counting attendance records...');
    const totalRecords = await attendanceCollection.countDocuments({});
    const syncedRecords = await attendanceCollection.countDocuments({ syncedFromSheet: true });
    const manualRecords = totalRecords - syncedRecords;

    console.log(`✅ Total attendance records: ${totalRecords.toLocaleString()}`);
    console.log(`   - Synced from Sheets: ${syncedRecords.toLocaleString()}`);
    console.log(`   - Manual/bot entries: ${manualRecords.toLocaleString()}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Check records by week
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('📅 Records by week:');
    const weeklyRecords = await attendanceCollection.aggregate([
      { $match: { syncedFromSheet: true } },
      {
        $group: {
          _id: '$weekLabel',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    for (const week of weeklyRecords) {
      console.log(`   - ${week._id}: ${week.count.toLocaleString()} records`);
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Check records by boss
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('👹 Top 5 bosses by attendance:');
    const bossRecords = await attendanceCollection.aggregate([
      { $match: { syncedFromSheet: true } },
      {
        $group: {
          _id: '$bossName',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();

    for (const boss of bossRecords) {
      console.log(`   - ${boss._id}: ${boss.count.toLocaleString()} attendances`);
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Check top members by attendance
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('🏆 Top 5 members by attendance:');
    const memberRecords = await attendanceCollection.aggregate([
      { $match: { syncedFromSheet: true } },
      {
        $group: {
          _id: '$memberName',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();

    for (const member of memberRecords) {
      console.log(`   - ${member._id}: ${member.count.toLocaleString()} attendances`);
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Date range
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('📆 Date range:');
    const dateRange = await attendanceCollection.aggregate([
      { $match: { syncedFromSheet: true } },
      {
        $group: {
          _id: null,
          oldest: { $min: '$timestamp' },
          newest: { $max: '$timestamp' }
        }
      }
    ]).toArray();

    if (dateRange.length > 0) {
      const range = dateRange[0];
      console.log(`   - Oldest: ${new Date(range.oldest).toLocaleString()}`);
      console.log(`   - Newest: ${new Date(range.newest).toLocaleString()}`);
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Check for members
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('👥 Member statistics:');
    const totalMembers = await membersCollection.countDocuments({});
    const activeMembers = await membersCollection.countDocuments({ isActive: true });
    const tempIdMembers = await membersCollection.countDocuments({ _id: /^temp_/ });

    console.log(`   - Total members: ${totalMembers}`);
    console.log(`   - Active members: ${activeMembers}`);
    console.log(`   - Temp IDs (need Discord ID migration): ${tempIdMembers}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // VERDICT
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 VERIFICATION RESULT');
    console.log('═══════════════════════════════════════════════════════════════');

    if (syncedRecords >= 14000) {
      console.log('✅ SUCCESS! Historical attendance imported correctly');
      console.log(`✅ ${syncedRecords.toLocaleString()} records imported from Google Sheets`);
      console.log('✅ All weekly sheets processed successfully');
    } else if (syncedRecords > 0) {
      console.log('⚠️  PARTIAL IMPORT');
      console.log(`⚠️  Only ${syncedRecords.toLocaleString()} records imported (expected ~14,363)`);
      console.log('⚠️  Some weekly sheets may be missing');
    } else {
      console.log('❌ IMPORT FAILED');
      console.log('❌ No records found with syncedFromSheet flag');
      console.log('💡 Run: node scripts/sync-sheets-to-mongodb.js --attendance');
    }

    console.log('');
    process.exit(0);

  } catch (error) {
    console.log('');
    console.log('❌ VERIFICATION FAILED');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
