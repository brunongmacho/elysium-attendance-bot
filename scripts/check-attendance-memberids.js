/**
 * Check what memberIds are in attendance records vs members collection
 */

const dbAPI = require('../utils/database-api');

async function checkMemberIds() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING ATTENDANCE MEMBER IDS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = await dbAPI.connect();

  // Get all unique memberIds from attendance collection
  const uniqueMemberIds = await db.collection('attendance')
    .distinct('memberId');

  console.log(`Found ${uniqueMemberIds.length} unique memberIds in attendance collection\n`);

  // Sample a few
  console.log('Sample memberIds from attendance:');
  uniqueMemberIds.slice(0, 10).forEach(id => {
    console.log(`  - ${id} (${id.startsWith('temp_') ? 'TEMP ID' : 'Real Discord ID'})`);
  });
  console.log('');

  // Count temp vs real
  const tempIds = uniqueMemberIds.filter(id => String(id).startsWith('temp_'));
  const realIds = uniqueMemberIds.filter(id => !String(id).startsWith('temp_'));

  console.log(`📊 Summary:`);
  console.log(`   Temp IDs: ${tempIds.length}`);
  console.log(`   Real IDs: ${realIds.length}`);
  console.log('');

  // Get all members from members collection
  const members = await db.collection('members').find().toArray();
  const memberTempIds = members.filter(m => String(m._id).startsWith('temp_'));
  const memberRealIds = members.filter(m => !String(m._id).startsWith('temp_'));

  console.log(`📊 Members collection:`);
  console.log(`   Temp IDs: ${memberTempIds.length}`);
  console.log(`   Real IDs: ${memberRealIds.length}`);
  console.log('');

  // Check for orphaned attendance records (memberId not in members)
  console.log('🔍 Checking for orphaned attendance records...\n');

  const memberIds = new Set(members.map(m => String(m._id)));
  const orphanedIds = uniqueMemberIds.filter(id => !memberIds.has(String(id)));

  if (orphanedIds.length > 0) {
    console.log(`⚠️ Found ${orphanedIds.length} memberIds in attendance that don't have member documents:\n`);

    for (const orphanId of orphanedIds.slice(0, 10)) {
      const count = await db.collection('attendance')
        .countDocuments({ memberId: orphanId });

      const sample = await db.collection('attendance')
        .findOne({ memberId: orphanId });

      console.log(`   ${orphanId}: ${count} records (memberName: "${sample.memberName}")`);
    }

    if (orphanedIds.length > 10) {
      console.log(`   ... and ${orphanedIds.length - 10} more`);
    }
  } else {
    console.log('✅ No orphaned attendance records found');
  }

  await dbAPI.close();
}

checkMemberIds().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
