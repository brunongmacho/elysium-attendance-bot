/**
 * Diagnostic script to check attendance record linkage
 * Run with: node scripts/diagnose-member-attendance.js <memberName>
 */

const dbAPI = require('../utils/database-api');

async function diagnoseMember(memberName) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🔍 DIAGNOSING ATTENDANCE FOR: ${memberName}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = await dbAPI.connect();

  // Step 1: Find member
  console.log('📋 Step 1: Finding member in members collection...');
  const member = await db.collection('members').findOne({
    username: { $regex: new RegExp(`^${memberName}$`, 'i') }
  });

  if (!member) {
    console.log(`❌ Member not found: ${memberName}`);
    process.exit(1);
  }

  console.log(`✅ Found member:`);
  console.log(`   _id: ${member._id}`);
  console.log(`   username: ${member.username}`);
  console.log(`   attendance.total: ${member.attendance?.total || 0}`);
  console.log(`   pointsAvailable: ${member.pointsAvailable}`);
  console.log(`   joinedAt: ${member.joinedAt}`);
  console.log('');

  // Step 2: Check attendance records by memberId
  console.log('📊 Step 2: Checking attendance records by memberId...');
  const recordsByMemberId = await db.collection('attendance')
    .find({ memberId: member._id })
    .toArray();

  console.log(`   Found ${recordsByMemberId.length} records with memberId: ${member._id}`);
  if (recordsByMemberId.length > 0) {
    console.log(`   Sample record:`, recordsByMemberId[0]);
  }
  console.log('');

  // Step 3: Check attendance records by memberName
  console.log('📊 Step 3: Checking attendance records by memberName...');
  const recordsByName = await db.collection('attendance')
    .find({ memberName: { $regex: new RegExp(`^${memberName}$`, 'i') } })
    .toArray();

  console.log(`   Found ${recordsByName.length} records with memberName: ${memberName}`);
  if (recordsByName.length > 0) {
    console.log(`   Sample record:`, recordsByName[0]);

    // Check if memberIds are different
    const uniqueMemberIds = [...new Set(recordsByName.map(r => r.memberId))];
    console.log(`   Unique memberIds in records: ${uniqueMemberIds.join(', ')}`);
  }
  console.log('');

  // Step 4: Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 DIAGNOSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Member ID: ${member._id}`);
  console.log(`Member stats say: ${member.attendance?.total || 0} total kills`);
  console.log(`Records with matching memberId: ${recordsByMemberId.length}`);
  console.log(`Records with matching memberName: ${recordsByName.length}`);
  console.log('');

  if (recordsByName.length > 0 && recordsByMemberId.length === 0) {
    console.log('⚠️ ISSUE DETECTED:');
    console.log('   Attendance records exist with your name, but have a different memberId!');
    console.log('   This is why getMemberStats() returns 0.');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   Run: node scripts/fix-member-id-mismatch.js');
  } else if (recordsByMemberId.length > 0 && member.attendance?.total === 0) {
    console.log('⚠️ ISSUE DETECTED:');
    console.log('   Records are linked correctly, but member.attendance.total is not updated!');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   The stats aggregation needs to be recalculated.');
  } else if (recordsByMemberId.length === 0 && recordsByName.length === 0) {
    console.log('⚠️ ISSUE DETECTED:');
    console.log('   No attendance records found at all!');
  } else {
    console.log('✅ Everything looks correct!');
  }

  await dbAPI.close();
}

// Get member name from command line
const memberName = process.argv[2];
if (!memberName) {
  console.log('Usage: node scripts/diagnose-member-attendance.js <memberName>');
  process.exit(1);
}

diagnoseMember(memberName).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
