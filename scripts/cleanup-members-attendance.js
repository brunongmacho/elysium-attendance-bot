/**
 * Clean ONLY members and attendance collections
 * Safe version - won't touch anything else
 * 
 * Usage:
 *   node scripts/cleanup-members-attendance.js
 * 
 * This will:
 * 1. Delete ALL members
 * 2. Delete ALL attendance records
 * 3. Keep everything else (bossTimers, bossRotation, auctionItems, etc.)
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const MONGODB_URI = envContent.match(/MONGODB_URI=(.+)/)?.[1]?.trim();
const DB_NAME = 'tenchu-bot';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  console.log('\nUsage:');
  console.log('  export MONGODB_URI="your_mongodb_connection_string"');
  console.log('  node scripts/cleanup-members-attendance.js');
  process.exit(1);
}

async function cleanup() {
  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
  });

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected\n');

    const db = client.db(DB_NAME);
    
    // Show current state first
    console.log('📊 Current database state:');
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`   - ${col.name}: ${count} documents`);
    }
    console.log('');

    // ONLY delete these two collections - nothing else
    const collectionsToClean = ['members', 'attendance'];
    
    console.log('⚠️  WARNING: This will DELETE all data in:');
    collectionsToClean.forEach(c => console.log(`   - ${c}`));
    console.log('');
    console.log('✅ Will KEEP all other collections:');
    const otherCollections = collections.map(c => c.name).filter(c => !collectionsToClean.includes(c));
    otherCollections.forEach(c => console.log(`   - ${c}`));
    console.log('');

    console.log('🗑️  Cleaning ONLY members and attendance...');
    console.log('');
    
    for (const collectionName of collectionsToClean) {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments();
      
      if (count === 0) {
        console.log(`   ⏭️  ${collectionName}: already empty`);
        continue;
      }
      
      const result = await collection.deleteMany({});
      console.log(`   ✅ Deleted ${result.deletedCount} from ${collectionName}`);
    }

    console.log('\n✅ Cleanup complete! Next steps:');
    console.log('   1. node scripts/sync-sheets-to-mongodb.js --members --attendance');
    console.log('   2. Restart your bot (it will sync Discord IDs automatically)');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

cleanup();
