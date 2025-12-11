/**
 * Debug script to investigate weekly spawn count discrepancy
 * Google Sheets: 92 spawns
 * MongoDB: 113 spawns
 */

const dbAPI = require('../utils/database-api');

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

async function debugWeeklySpawns() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 DEBUG: Weekly Spawn Count Discrepancy');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const db = await dbAPI.connect();
    const attendanceCollection = db.collection('attendance');

    const thisWeekStart = getWeekStart();
    const thisWeekEnd = getWeekEnd();

    console.log('📅 Week Range (GMT+8):');
    console.log(`   Start: ${thisWeekStart.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
    console.log(`   End:   ${thisWeekEnd.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
    console.log('');

    // Method 1: Group by boss + exact timestamp (current method)
    console.log('📊 Method 1: Group by boss + exact timestamp (MongoDB current logic)');
    const spawnsExact = await attendanceCollection.aggregate([
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
          members: { $addToSet: '$memberName' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.timestamp': 1 }
      }
    ]).toArray();

    console.log(`   Total unique spawns: ${spawnsExact.length}`);
    console.log('');

    // Method 2: Group by boss + timestamp rounded to nearest minute
    console.log('📊 Method 2: Group by boss + timestamp rounded to minute');
    const spawnsRounded = await attendanceCollection.aggregate([
      {
        $match: {
          timestamp: { $gte: thisWeekStart, $lte: thisWeekEnd }
        }
      },
      {
        $addFields: {
          timestampRounded: {
            $dateFromParts: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' },
              hour: { $hour: '$timestamp' },
              minute: { $minute: '$timestamp' }
            }
          }
        }
      },
      {
        $group: {
          _id: {
            boss: '$bossName',
            timestamp: '$timestampRounded'
          },
          members: { $addToSet: '$memberName' },
          exactTimestamps: { $addToSet: '$timestamp' }
        }
      },
      {
        $sort: { '_id.timestamp': 1 }
      }
    ]).toArray();

    console.log(`   Total unique spawns (rounded): ${spawnsRounded.length}`);
    console.log('');

    // Check for duplicates (same boss + timestamp within 1 minute)
    console.log('🔍 Looking for potential duplicates (same boss within 1 minute)...');
    let duplicateCount = 0;

    for (let i = 0; i < spawnsExact.length - 1; i++) {
      const current = spawnsExact[i];
      const next = spawnsExact[i + 1];

      if (current._id.boss === next._id.boss) {
        const timeDiff = Math.abs(
          new Date(next._id.timestamp).getTime() -
          new Date(current._id.timestamp).getTime()
        ) / 1000; // seconds

        if (timeDiff < 60) {
          duplicateCount++;
          console.log(`   ⚠️ Potential duplicate: ${current._id.boss}`);
          console.log(`      Time 1: ${new Date(current._id.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (${current.members.length} members, ${current.count} records)`);
          console.log(`      Time 2: ${new Date(next._id.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (${next.members.length} members, ${next.count} records)`);
          console.log(`      Difference: ${timeDiff.toFixed(0)} seconds`);
          console.log('');
        }
      }
    }

    if (duplicateCount === 0) {
      console.log('   ✅ No obvious duplicates found');
    } else {
      console.log(`   ⚠️ Found ${duplicateCount} potential duplicate pairs`);
    }
    console.log('');

    // Show spawns with multiple records (same boss + timestamp with different member records)
    console.log('🔍 Spawns with multiple attendance records (unusual):');
    const multiRecordSpawns = spawnsExact.filter(s => s.count > s.members.length);
    if (multiRecordSpawns.length > 0) {
      multiRecordSpawns.forEach(s => {
        console.log(`   ⚠️ ${s._id.boss} at ${new Date(s._id.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
        console.log(`      ${s.count} records but only ${s.members.length} unique members`);
      });
    } else {
      console.log('   ✅ No spawns with duplicate member records');
    }
    console.log('');

    // Breakdown by day
    console.log('📊 Spawn count by day:');
    const byDay = {};
    spawnsExact.forEach(spawn => {
      const date = new Date(spawn._id.timestamp);
      const dayKey = date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: '2-digit',
        day: '2-digit'
      });
      byDay[dayKey] = (byDay[dayKey] || 0) + 1;
    });

    Object.entries(byDay).sort().forEach(([day, count]) => {
      console.log(`   ${day}: ${count} spawns`);
    });
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Google Sheets: 92 spawns (expected)`);
    console.log(`MongoDB (exact): ${spawnsExact.length} spawns`);
    console.log(`MongoDB (rounded): ${spawnsRounded.length} spawns`);
    console.log(`Difference: ${spawnsExact.length - 92} extra spawns`);
    console.log('');

    if (duplicateCount > 0) {
      console.log('💡 Recommendation: Run deduplication to merge spawns within 1 minute of each other');
    }

    await dbAPI.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugWeeklySpawns();
