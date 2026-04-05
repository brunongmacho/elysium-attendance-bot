/**
 * Add unique compound index to prevent future attendance duplicates
 * 
 * Usage:
 *   node scripts/add-unique-index.js
 */

const dbAPI = require('../utils/database-api');

async function addUniqueIndex() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔧 ADDING UNIQUE INDEX TO PREVENT FUTURE DUPLICATES');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const db = await dbAPI.connect();
  const attendanceCollection = db.collection('attendance');

  // Check existing indexes
  console.log('📋 Current attendance indexes:');
  const indexes = await attendanceCollection.indexes();
  indexes.forEach(idx => {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
  });
  console.log('');

  // Check if unique index already exists
  const hasUniqueIndex = indexes.some(idx => 
    idx.name === 'member_boss_timestamp_unique' ||
    (idx.key && idx.key.memberId && idx.key.bossName && idx.key.timestamp && idx.unique)
  );

  if (hasUniqueIndex) {
    console.log('✅ Unique index already exists!');
    return;
  }

  // Create unique compound index
  console.log('🔄 Creating unique compound index on (memberId, bossName, timestamp)...');
  
  try {
    await attendanceCollection.createIndex(
      { memberId: 1, bossName: 1, timestamp: 1 },
      { 
        unique: true, 
        name: 'member_boss_timestamp_unique',
        background: true
      }
    );
    console.log('✅ Unique index created successfully!');
    console.log('');
    console.log('💡 Future attendance syncs will now automatically reject duplicates.');
  } catch (error) {
    if (error.code === 85 || error.code === 86 || error.message.includes('already exists')) {
      console.log('⏭️  Index already exists (was created in another process)');
    } else {
      console.error('❌ Failed to create index:', error.message);
      console.log('');
      console.log('This may indicate existing duplicate data. Run:');
      console.log('  node scripts/find-duplicates.js --remove');
      console.log('to remove duplicates first, then try again.');
    }
  }
}

addUniqueIndex()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
