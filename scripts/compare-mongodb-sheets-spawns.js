/**
 * Compare MongoDB spawns with Google Sheets columns
 * to find which spawns are in MongoDB but not in Sheets (or vice versa)
 */

const dbAPI = require('../utils/database-api');
const { SheetAPI } = require('../utils/sheet-api');
const config = require('../config.json');

function getWeekStart(date = new Date()) {
  // Get the date in GMT+8
  const gmt8Date = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

  // Get day of week (0 = Sunday)
  const day = gmt8Date.getDay();

  // Calculate Sunday of this week
  const sunday = new Date(gmt8Date);
  sunday.setDate(gmt8Date.getDate() - day);
  sunday.setHours(0, 0, 0, 0);

  return sunday;
}

function getWeekEnd(date = new Date()) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

async function compareMongoDBvsSheets() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 COMPARE: MongoDB Spawns vs Google Sheets Columns');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const db = await dbAPI.connect();
    const attendanceCollection = db.collection('attendance');
    const sheetAPI = new SheetAPI(config.sheet_webhook_url);

    const thisWeekStart = getWeekStart();
    const thisWeekEnd = getWeekEnd();

    console.log('📅 Week Range (GMT+8):');
    console.log(`   Start: ${thisWeekStart.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
    console.log(`   End:   ${thisWeekEnd.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
    console.log('');

    // Get all columns from Google Sheets
    console.log('📥 Fetching columns from Google Sheets...');
    const sheetsResponse = await sheetAPI.call('getAllSpawnColumns');
    const sheetColumns = sheetsResponse.columns || [];
    console.log(`✅ Found ${sheetColumns.length} columns in Google Sheets`);
    console.log('');

    // Get all spawns from MongoDB
    console.log('📥 Fetching spawns from MongoDB...');
    const mongoSpawns = await attendanceCollection.aggregate([
      {
        $match: {
          timestamp: { $gte: thisWeekStart, $lte: thisWeekEnd }
        }
      },
      {
        $group: {
          _id: {
            boss: '$bossName',
            timestamp: '$timestamp'
          },
          members: { $addToSet: '$memberName' }
        }
      },
      {
        $sort: { '_id.timestamp': 1 }
      }
    ]).toArray();

    console.log(`✅ Found ${mongoSpawns.length} spawns in MongoDB`);
    console.log('');

    // Convert MongoDB spawns to comparable format (boss + timestamp)
    const mongoKeys = new Set();
    const mongoDetails = new Map();

    mongoSpawns.forEach(spawn => {
      const timestamp = new Date(spawn._id.timestamp);

      // Format to match Google Sheets format: MM/DD/YY H:MM
      const dateStr = timestamp.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
      });

      const timeStr = timestamp.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      });

      const key = `${spawn._id.boss}|${dateStr} ${timeStr}`;
      mongoKeys.add(key);
      mongoDetails.set(key, {
        boss: spawn._id.boss,
        timestamp: `${dateStr} ${timeStr}`,
        members: spawn.members.length,
        rawTimestamp: spawn._id.timestamp
      });
    });

    // Convert Google Sheets columns to comparable format
    const sheetKeys = new Set();
    const sheetDetails = new Map();

    sheetColumns.forEach(col => {
      const key = `${col.boss}|${col.timestamp}`;
      sheetKeys.add(key);
      sheetDetails.set(key, {
        boss: col.boss,
        timestamp: col.timestamp,
        column: col.column
      });
    });

    // Find spawns in MongoDB but NOT in Sheets
    console.log('🔍 Spawns in MongoDB but NOT in Google Sheets:');
    const onlyInMongo = [...mongoKeys].filter(k => !sheetKeys.has(k));

    if (onlyInMongo.length === 0) {
      console.log('   ✅ None - all MongoDB spawns are in Sheets');
    } else {
      console.log(`   ⚠️ Found ${onlyInMongo.length} spawns only in MongoDB:`);
      onlyInMongo.forEach(key => {
        const details = mongoDetails.get(key);
        console.log(`      - ${details.boss} at ${details.timestamp} (${details.members} members)`);
      });
    }
    console.log('');

    // Find spawns in Sheets but NOT in MongoDB
    console.log('🔍 Spawns in Google Sheets but NOT in MongoDB:');
    const onlyInSheets = [...sheetKeys].filter(k => !mongoKeys.has(k));

    if (onlyInSheets.length === 0) {
      console.log('   ✅ None - all Sheet spawns are in MongoDB');
    } else {
      console.log(`   ⚠️ Found ${onlyInSheets.length} spawns only in Sheets:`);
      onlyInSheets.forEach(key => {
        const details = sheetDetails.get(key);
        console.log(`      - ${details.boss} at ${details.timestamp} (column ${details.column})`);
      });
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 COMPARISON SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Google Sheets: ${sheetColumns.length} columns`);
    console.log(`MongoDB: ${mongoSpawns.length} spawns`);
    console.log(`In both: ${mongoSpawns.length - onlyInMongo.length} spawns`);
    console.log(`Only in MongoDB: ${onlyInMongo.length} spawns`);
    console.log(`Only in Sheets: ${onlyInSheets.length} spawns`);
    console.log(`Difference: ${mongoSpawns.length - sheetColumns.length} extra spawns in MongoDB`);
    console.log('');

    if (onlyInMongo.length > 0) {
      console.log('💡 These MongoDB spawns need to be synced to Google Sheets');
      console.log('   Run: node scripts/force-sync-recent-attendance.js');
    }

    if (onlyInSheets.length > 0) {
      console.log('💡 These Sheet spawns are missing from MongoDB');
      console.log('   Run: node scripts/sync-sheets-to-mongodb.js --force-attendance');
    }

    await dbAPI.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

compareMongoDBvsSheets();
