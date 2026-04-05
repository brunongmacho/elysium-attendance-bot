/**
 * Find and remove duplicate attendance records in MongoDB
 * 
 * Usage:
 *   node scripts/find-duplicates.js [--remove]
 * 
 * Options:
 *   --remove   Actually remove duplicates (default is dry-run)
 */

const dbAPI = require('../utils/database-api');

const DRY_RUN = !process.argv.includes('--remove');

async function findDuplicates() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 FINDING DUPLICATE ATTENDANCE RECORDS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'REMOVE DUPLICATES'}`);
  console.log('');

  const db = await dbAPI.connect();
  const attendanceCollection = db.collection('attendance');

  // Find duplicates by grouping on (memberId, bossName, timestamp)
  console.log('🔄 Finding duplicate attendance records...');
  
  const duplicates = await attendanceCollection.aggregate([
    {
      $group: {
        _id: {
          memberId: '$memberId',
          bossName: '$bossName',
          timestamp: '$timestamp'
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray();

  console.log(`\nFound ${duplicates.length} sets of duplicate records`);
  console.log('');

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  // Calculate total duplicates (all but one in each group)
  let totalDuplicates = 0;
  for (const dup of duplicates) {
    totalDuplicates += dup.count - 1;
  }
  console.log(`Total duplicate records to remove: ${totalDuplicates}`);
  console.log('');

  // Show sample duplicates
  console.log('Sample duplicates (first 10):');
  console.log('───────────────────────────────────────────────────────────────');
  
  for (let i = 0; i < Math.min(10, duplicates.length); i++) {
    const dup = duplicates[i];
    const dupIds = dup.ids.slice(1); // Keep first, mark rest for deletion
    
    console.log(`Set ${i + 1}: ${dup._id.memberName || dup._id.memberId} - ${dup._id.bossName}`);
    console.log(`  Boss: ${dup._id.bossName}, Time: ${new Date(dup._id.timestamp).toLocaleString()}`);
    console.log(`  Count: ${dup.count} records, IDs: ${dupIds.join(', ').substring(0, 60)}...`);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('───────────────────────────────────────────────────────────────');
    console.log('💡 Run with --remove to delete duplicates');
    console.log('');
    return;
  }

  // Remove duplicates - keep the first record in each group
  console.log('🗑️  Removing duplicates...');
  
  let removedCount = 0;
  for (const dup of duplicates) {
    const idsToDelete = dup.ids.slice(1); // Keep first, delete rest
    
    const result = await attendanceCollection.deleteMany({
      _id: { $in: idsToDelete }
    });
    
    removedCount += result.deletedCount;
  }

  console.log(`\n✅ Removed ${removedCount} duplicate records`);

  // Verify
  const remainingDuplicates = await attendanceCollection.aggregate([
    {
      $group: {
        _id: {
          memberId: '$memberId',
          bossName: '$bossName',
          timestamp: '$timestamp'
        },
        count: { $sum: 1 }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]).toArray();

  console.log(`Remaining duplicate sets: ${remainingDuplicates.length}`);
  
  // Also check for duplicate members
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING FOR DUPLICATE MEMBERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const membersCollection = db.collection('members');

  // Check for members with same username (case-insensitive)
  const duplicateMembers = await membersCollection.aggregate([
    {
      $group: {
        _id: { $toLower: '$username' },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        usernames: { $push: '$username' }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]).toArray();

  if (duplicateMembers.length === 0) {
    console.log('✅ No duplicate members found!');
  } else {
    console.log(`Found ${duplicateMembers.length} sets of duplicate members:`);
    
    for (const dup of duplicateMembers) {
      console.log(`  Username: "${dup.usernames.join('", "')}" (${dup.count} records)`);
      console.log(`  IDs: ${dup.ids.join(', ')}`);
    }
    
    if (DRY_RUN) {
      console.log('\n💡 Run with --remove to merge duplicates');
    } else {
      // Merge duplicates - keep the one with most attendance
      console.log('\n🗑️  Merging duplicate members...');
      
      for (const dup of duplicateMembers) {
        // Get attendance counts for each member
        const members = await membersCollection.find({ _id: { $in: dup.ids } }).toArray();
        
        // Sort by attendance total descending
        members.sort((a, b) => (b.attendance?.total || 0) - (a.attendance?.total || 0));
        
        const keepMember = members[0];
        const mergeMembers = members.slice(1);
        
        console.log(`  Keeping: ${keepMember.username} (ID: ${keepMember._id})`);
        
        // Update attendance records to use the kept member's ID
        for (const mergeMember of mergeMembers) {
          await attendanceCollection.updateMany(
            { memberId: mergeMember._id },
            { $set: { memberId: keepMember._id } }
          );
          
          // Delete the duplicate member
          await membersCollection.deleteOne({ _id: mergeMember._id });
          console.log(`  Merged: ${mergeMember.username} -> ${keepMember.username}`);
        }
      }
      
      console.log('\n✅ Duplicate members merged!');
    }
  }

  // ============================================================================
  // NEW: Check for temp ID vs Discord ID mismatch (the main issue!)
  // ============================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING FOR TEMP ID vs DISCORD ID MISMATCH');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Find all members with temp_ IDs
  const tempMembers = await membersCollection.find({ _id: { $regex: /^temp_/ } }).toArray();
  
  if (tempMembers.length === 0) {
    console.log('✅ No temp_ members found (all have Discord IDs)');
  } else {
    console.log(`Found ${tempMembers.length} members with temp_ IDs:`);
    
    let mergedCount = 0;
    
    for (const tempMember of tempMembers) {
      // Look for a matching member with real Discord ID (same username)
      const realMember = await membersCollection.findOne({
        _id: { $not: /^temp_/ },
        username: { $regex: new RegExp(`^${tempMember.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      
      if (realMember) {
        console.log(`  "${tempMember.username}": temp_${tempMember._id} -> ${realMember._id}`);
        
        if (!DRY_RUN) {
          // Update all attendance records from temp ID to real Discord ID
          const updateResult = await attendanceCollection.updateMany(
            { memberId: tempMember._id },
            { $set: { memberId: realMember._id } }
          );
          
          // Merge attendance stats
          const tempAttendance = tempMember.attendance || { total: 0, byBoss: {} };
          const realAttendance = realMember.attendance || { total: 0, byBoss: {} };
          
          // Combine byBoss counts
          const mergedByBoss = { ...realAttendance.byBoss };
          for (const [boss, count] of Object.entries(tempAttendance.byBoss || {})) {
            mergedByBoss[boss] = (mergedByBoss[boss] || 0) + count;
          }
          
          await membersCollection.updateOne(
            { _id: realMember._id },
            {
              $set: {
                'attendance.total': Math.max(tempAttendance.total || 0, realAttendance.total || 0),
                'attendance.byBoss': mergedByBoss,
                'pointsAvailable': Math.max(tempMember.pointsAvailable || 0, realMember.pointsAvailable || 0),
                'pointsEarned': Math.max(tempMember.pointsEarned || 0, realMember.pointsEarned || 0),
                lastUpdated: new Date()
              }
            }
          );
          
          // Delete temp member
          await membersCollection.deleteOne({ _id: tempMember._id });
          
          console.log(`    → Updated ${updateResult.modifiedCount} attendance records, merged stats, deleted temp member`);
          mergedCount++;
        }
      } else {
        console.log(`  "${tempMember.username}": ${tempMember._id} -> NO MATCH FOUND (skipping)`);
      }
    }
    
    if (DRY_RUN) {
      console.log('\n💡 Run with --remove to merge temp IDs to Discord IDs');
    } else {
      console.log(`\n✅ Merged ${mergedCount} temp members to their Discord IDs!`);
    }
  }
}

findDuplicates()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
