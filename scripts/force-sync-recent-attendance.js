/**
 * Emergency script to manually sync recent attendance from MongoDB to Sheets
 * Use when automatic sync queue fails
 */

const dbAPI = require('../utils/database-api');
const { SheetAPI } = require('../utils/sheet-api');
const config = require('../config.json');

async function forceSyncRecentAttendance() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚨 FORCE SYNC: Recent Attendance → Google Sheets');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const sheetAPI = new SheetAPI(config.sheet_webhook_url);

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const db = await dbAPI.connect();
    const attendanceCollection = db.collection('attendance');

    // Get attendance from last 24 hours that hasn't been synced
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    console.log(`📥 Fetching attendance records from last 24 hours...`);
    const recentAttendance = await attendanceCollection
      .find({
        timestamp: { $gte: yesterday },
        syncedFromSheet: { $ne: true } // Not from historical import
      })
      .sort({ timestamp: -1 })
      .toArray();

    console.log(`✅ Found ${recentAttendance.length} recent attendance records`);
    console.log('');

    if (recentAttendance.length === 0) {
      console.log('ℹ️  No unsaved attendance found. All data is already in Sheets.');
      process.exit(0);
    }

    // Group by spawn (boss + timestamp)
    const spawns = new Map();

    recentAttendance.forEach(record => {
      const key = `${record.bossName}|${new Date(record.timestamp).toISOString()}`;
      if (!spawns.has(key)) {
        spawns.set(key, {
          boss: record.bossName,
          timestamp: record.timestamp,
          members: []
        });
      }
      spawns.get(key).members.push(record.memberName);
    });

    console.log(`📊 Found ${spawns.size} distinct spawns to sync`);
    console.log('');

    // Sync each spawn to Sheets (with duplicate check & overwrite)
    let synced = 0;
    let failed = 0;

    for (const [key, spawn] of spawns) {
      try {
        console.log(`🔄 Syncing: ${spawn.boss} (${spawn.members.length} members)...`);

        // Convert to GMT+8 (Philippine Time) using proper timezone conversion
        const spawnDate = new Date(spawn.timestamp);

        // Format date as MM/DD/YY in GMT+8
        const dateStr = spawnDate.toLocaleDateString('en-US', {
          timeZone: 'Asia/Manila',
          month: '2-digit',
          day: '2-digit',
          year: '2-digit'
        });

        // Format time as H:MM in GMT+8 (matches Google Sheets: no seconds, no zero-padding for hours)
        const timeStr = spawnDate.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',      // No zero-padding (0-23, matches Google Sheets)
          minute: '2-digit',    // Zero-padded minutes
          hour12: false
        });

        const formattedTimestamp = `${dateStr} ${timeStr}`;

        console.log(`   📅 Timestamp: ${formattedTimestamp} (GMT+8)`);

        // Use overwriteAttendance to handle duplicates (overwrites if exists)
        const result = await sheetAPI.call('overwriteAttendance', {
          boss: spawn.boss,
          timestamp: formattedTimestamp,
          date: dateStr,
          time: timeStr,
          members: spawn.members
        });

        if (result && result.status === 'ok') {
          console.log(`   ✅ Synced: ${spawn.boss} (${spawn.members.length} members) - ${result.isOverwrite ? 'Overwritten' : 'Created'}`);
          synced++;
        } else {
          console.log(`   ❌ Failed: ${result?.message || 'Unknown error'}`);
          failed++;
        }

      } catch (error) {
        console.error(`   ❌ Error syncing ${spawn.boss}:`, error.message);
        failed++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SYNC COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Synced: ${synced} spawns`);
    console.log(`❌ Failed: ${failed} spawns`);
    console.log('');

    if (synced > 0) {
      console.log('💡 Check your Google Sheets - the missing attendance should now appear!');
    }

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

forceSyncRecentAttendance();
