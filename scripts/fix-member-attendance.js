/**
 * Fix member attendance stats by recalculating from attendance records
 * Handles both memberId mismatches and incorrect aggregation
 *
 * Run with: node scripts/fix-member-attendance.js <memberName>
 * Or: node scripts/fix-member-attendance.js --all (to fix all members)
 */

const dbAPI = require('../utils/database-api');

async function fixMemberAttendance(memberName) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🔧 FIXING ATTENDANCE FOR: ${memberName}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = await dbAPI.connect();

  // Step 1: Find member
  console.log('📋 Finding member...');
  const member = await db.collection('members').findOne({
    username: { $regex: new RegExp(`^${memberName}$`, 'i') }
  });

  if (!member) {
    console.log(`❌ Member not found: ${memberName}`);
    return { success: false, error: 'Member not found' };
  }

  console.log(`✅ Found member: ${member.username} (${member._id})`);
  console.log(`   Current stats: ${member.attendance?.total || 0} total kills\n`);

  // Step 2: Find all attendance records by memberName (in case memberId is wrong)
  console.log('📊 Finding attendance records...');
  const records = await db.collection('attendance')
    .find({ memberName: { $regex: new RegExp(`^${member.username}$`, 'i') } })
    .toArray();

  console.log(`   Found ${records.length} attendance records\n`);

  if (records.length === 0) {
    console.log('⚠️ No attendance records found for this member');
    return { success: false, error: 'No records found' };
  }

  // Step 3: Fix memberId in all records if needed
  console.log('🔧 Fixing memberId in attendance records...');
  const incorrectRecords = records.filter(r => r.memberId !== member._id);

  if (incorrectRecords.length > 0) {
    console.log(`   Fixing ${incorrectRecords.length} records with incorrect memberId...`);

    const result = await db.collection('attendance').updateMany(
      { memberName: { $regex: new RegExp(`^${member.username}$`, 'i') } },
      { $set: { memberId: member._id } }
    );

    console.log(`   ✅ Updated ${result.modifiedCount} records\n`);
  } else {
    console.log(`   ✅ All records already have correct memberId\n`);
  }

  // Step 4: Recalculate stats
  console.log('📊 Recalculating attendance stats...');

  const totalKills = records.length;
  const totalPoints = records.reduce((sum, r) => sum + (r.bossPoints || 1), 0);

  // Calculate per-boss stats
  const byBoss = {};
  records.forEach(r => {
    byBoss[r.bossName] = (byBoss[r.bossName] || 0) + 1;
  });

  // Calculate this week/month
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisWeek = records.filter(r => {
    const recordDate = new Date(r.timestamp);
    return recordDate >= weekStart;
  }).length;

  const thisMonth = records.filter(r => {
    const recordDate = new Date(r.timestamp);
    return recordDate >= monthStart;
  }).length;

  console.log(`   Total kills: ${totalKills}`);
  console.log(`   Total points: ${totalPoints}`);
  console.log(`   This week: ${thisWeek}`);
  console.log(`   This month: ${thisMonth}`);
  console.log(`   Bosses: ${Object.keys(byBoss).length}\n`);

  // Step 5: Update member document
  console.log('💾 Updating member stats...');

  const updateResult = await db.collection('members').updateOne(
    { _id: member._id },
    {
      $set: {
        'attendance.total': totalKills,
        'attendance.thisWeek': thisWeek,
        'attendance.thisMonth': thisMonth,
        'attendance.byBoss': byBoss,
        'lastUpdated': new Date()
      }
    }
  );

  console.log(`   ✅ Member stats updated\n`);

  // Step 6: Verify
  const updatedMember = await db.collection('members').findOne({ _id: member._id });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ FIX COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Member: ${updatedMember.username}`);
  console.log(`Total kills: ${updatedMember.attendance.total}`);
  console.log(`This week: ${updatedMember.attendance.thisWeek}`);
  console.log(`This month: ${updatedMember.attendance.thisMonth}`);
  console.log('');

  return {
    success: true,
    member: updatedMember.username,
    totalKills,
    recordsFixed: incorrectRecords.length
  };
}

async function fixAllMembers() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔧 FIXING ATTENDANCE FOR ALL MEMBERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = await dbAPI.connect();
  const members = await db.collection('members').find({ isActive: true }).toArray();

  console.log(`Found ${members.length} active members\n`);

  let fixed = 0;
  let skipped = 0;

  for (const member of members) {
    try {
      const result = await fixMemberAttendance(member.username);
      if (result.success) {
        fixed++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`❌ Error fixing ${member.username}:`, error.message);
      skipped++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped: ${skipped}`);
  console.log('');

  await dbAPI.close();
}

// Main
const arg = process.argv[2];

if (!arg) {
  console.log('Usage:');
  console.log('  node scripts/fix-member-attendance.js <memberName>');
  console.log('  node scripts/fix-member-attendance.js --all');
  process.exit(1);
}

if (arg === '--all') {
  fixAllMembers().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
} else {
  fixMemberAttendance(arg)
    .then(() => dbAPI.close())
    .catch(err => {
      console.error('❌ Error:', err);
      process.exit(1);
    });
}
