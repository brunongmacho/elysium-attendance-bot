/**
 * Debug script to show what the weekly report is actually querying
 */

const dbAPI = require('../utils/database-api');

async function debugWeeklyReport() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 DEBUG WEEKLY REPORT DATE RANGES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const today = new Date();
  console.log(`📅 Today (UTC): ${today.toISOString()} (${today.toLocaleDateString()})`);

  // Convert to GMT+8
  function toGMT8(date = new Date()) {
    const d = new Date(date);
    const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
    const gmt8Time = new Date(utcTime + (8 * 3600000));
    return gmt8Time;
  }

  const todayGMT8 = toGMT8(today);
  console.log(`📅 Today (GMT+8): ${todayGMT8.toISOString()} (${todayGMT8.toLocaleDateString()})`);
  console.log('');

  // Replicate the getWeekStart logic (using GMT+8)
  function getWeekStart(date = new Date()) {
    const d = toGMT8(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekEnd(date = new Date()) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  const thisWeekStart = getWeekStart();
  const thisWeekEnd = getWeekEnd();

  console.log('📊 Calculated Week Range:');
  console.log(`   Start: ${thisWeekStart.toISOString()} (${thisWeekStart.toLocaleDateString()})`);
  console.log(`   End:   ${thisWeekEnd.toISOString()} (${thisWeekEnd.toLocaleDateString()})`);
  console.log(`   Day of week for start: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][thisWeekStart.getDay()]}`);
  console.log('');

  // Connect to MongoDB
  console.log('🔌 Connecting to MongoDB...');
  const db = await dbAPI.connect();
  console.log('✅ Connected\n');

  // Count total attendance records in this date range
  const totalRecords = await db.collection('attendance').countDocuments({
    timestamp: { $gte: thisWeekStart, $lte: thisWeekEnd }
  });

  console.log(`📝 Total attendance records in range: ${totalRecords}`);
  console.log('');

  // Count unique spawns (boss + timestamp combinations)
  const uniqueSpawns = await db.collection('attendance')
    .aggregate([
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
          }
        }
      }
    ]).toArray();

  console.log(`🎯 Unique boss spawns in range: ${uniqueSpawns.length}`);
  console.log('');

  // Show breakdown by boss
  const bossCounts = {};
  uniqueSpawns.forEach(spawn => {
    const boss = spawn._id.boss;
    bossCounts[boss] = (bossCounts[boss] || 0) + 1;
  });

  console.log('📊 Boss spawn breakdown:');
  Object.entries(bossCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([boss, count]) => {
      console.log(`   ${boss}: ${count} spawns`);
    });
  console.log('');

  // Show breakdown by day
  const dayBreakdown = {};
  uniqueSpawns.forEach(spawn => {
    const date = new Date(spawn._id.timestamp);
    const dayStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    dayBreakdown[dayStr] = (dayBreakdown[dayStr] || 0) + 1;
  });

  console.log('📅 Spawns by day:');
  Object.entries(dayBreakdown)
    .forEach(([day, count]) => {
      console.log(`   ${day}: ${count} spawns`);
    });
  console.log('');

  // Sample some recent attendance records
  const sampleRecords = await db.collection('attendance')
    .find({
      timestamp: { $gte: thisWeekStart, $lte: thisWeekEnd }
    })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();

  console.log('📋 Sample recent attendance records:');
  sampleRecords.forEach(record => {
    const date = new Date(record.timestamp);
    console.log(`   ${date.toISOString()} - ${record.bossName} - ${record.memberName}`);
  });
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ Debug complete');
  console.log('═══════════════════════════════════════════════════════════════');

  await dbAPI.close();
  process.exit(0);
}

debugWeeklyReport().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
