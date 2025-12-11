/**
 * Emergency script to sync this week's attendance from MongoDB to Sheets
 * Use when automatic sync queue fails for multiple days
 */

const dbAPI = require('../utils/database-api');
const { SheetAPI } = require('../utils/sheet-api');
const config = require('../config.json');

function getWeekStart(date = new Date()) {
  // Add 8 hours to get GMT+8 time
  const gmt8Offset = 8 * 60 * 60 * 1000;
  const gmt8Time = new Date(date.getTime() + gmt8Offset);

  // Get day of week using UTC methods (which now represent GMT+8)
  const day = gmt8Time.getUTCDay();

  // Calculate Sunday of this week
  const sunday = new Date(gmt8Time);
  sunday.setUTCDate(gmt8Time.getUTCDate() - day);
  sunday.setUTCHours(0, 0, 0, 0);

  // Convert back to actual UTC (subtract 8 hours)
  return new Date(sunday.getTime() - gmt8Offset);
}

function getWeekEnd(date = new Date()) {
  const start = getWeekStart(date);
  const gmt8Offset = 8 * 60 * 60 * 1000;

  // Add 6 days and set to end of day in GMT+8
  const gmt8Start = new Date(start.getTime() + gmt8Offset);
  gmt8Start.setUTCDate(gmt8Start.getUTCDate() + 6);
  gmt8Start.setUTCHours(23, 59, 59, 999);

  // Convert back to UTC
  return new Date(gmt8Start.getTime() - gmt8Offset);
}

async function forceSyncThisWeek() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚨 FORCE SYNC: This Week\'s Attendance → Google Sheets');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const sheetAPI = new SheetAPI(config.sheet_webhook_url);

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const db = await dbAPI.connect();
    const attendanceCollection = db.collection('attendance');

    // Get this week's date range
    const thisWeekStart = getWeekStart();
    const thisWeekEnd = getWeekEnd();

    console.log('📅 Week Range (GMT+8):');
    console.log(`   Start: ${thisWeekStart.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
    console.log(`   End:   ${thisWeekEnd.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
    console.log('');

    console.log(`📥 Fetching attendance records from this week...`);
    const weekAttendance = await attendanceCollection
      .find({
        timestamp: { $gte: thisWeekStart, $lte: thisWeekEnd },
        syncedFromSheet: { $ne: true } // Not from historical import
      })
      .sort({ timestamp: 1 })
      .toArray();

    console.log(`✅ Found ${weekAttendance.length} attendance records this week`);
    console.log('');

    if (weekAttendance.length === 0) {
      console.log('ℹ️  No attendance records found for this week.');
      await dbAPI.close();
      process.exit(0);
    }

    // Group by spawn (boss + timestamp)
    const spawns = new Map();

    weekAttendance.forEach(record => {
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
    let skipped = 0;

    for (const [key, spawn] of spawns) {
      try {
        // Convert to GMT+8 (Philippine Time)
        const spawnDate = new Date(spawn.timestamp);

        // Format date as MM/DD/YY in GMT+8
        const dateStr = spawnDate.toLocaleDateString('en-US', {
          timeZone: 'Asia/Manila',
          month: '2-digit',
          day: '2-digit',
          year: '2-digit'
        });

        // Format time as H:MM in GMT+8 (matches Google Sheets)
        const timeStr = spawnDate.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',
          minute: '2-digit',
          hour12: false
        });

        const formattedTimestamp = `${dateStr} ${timeStr}`;

        console.log(`🔄 Syncing: ${spawn.boss} at ${formattedTimestamp} (${spawn.members.length} members)...`);

        // Use overwriteAttendance to handle duplicates
        const result = await sheetAPI.call('overwriteAttendance', {
          boss: spawn.boss,
          timestamp: formattedTimestamp,
          date: dateStr,
          time: timeStr,
          members: spawn.members
        });

        if (result && result.status === 'ok') {
          if (result.isOverwrite) {
            console.log(`   ♻️  Overwritten existing column`);
            skipped++;
          } else {
            console.log(`   ✅ Created new column`);
            synced++;
          }
        } else {
          console.log(`   ❌ Failed: ${result?.message || 'Unknown error'}`);
          failed++;
        }

      } catch (error) {
        console.error(`   ❌ Error syncing ${spawn.boss}:`, error.message);
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SYNC COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ New spawns synced: ${synced}`);
    console.log(`♻️  Existing spawns updated: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('');

    if (synced > 0) {
      console.log('💡 Check your Google Sheets - the missing attendance should now appear!');
      console.log('   Run the comparison script again to verify:');
      console.log('   node scripts/compare-mongodb-sheets-spawns.js');
    }

    await dbAPI.close();
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    await dbAPI.close();
    process.exit(1);
  }
}

forceSyncThisWeek();
