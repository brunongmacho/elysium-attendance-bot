/**
 * Cleanup MongoDB collections before fresh import
 * WARNING: This will delete ALL members and attendance records!
 * 
 * Usage:
 *   node scripts/cleanup-db.js
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'elysium-bot';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  console.log('\nUsage:');
  console.log('  export MONGODB_URI="your_mongodb_connection_string"');
  console.log('  node scripts/cleanup-db.js');
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
    
    // Collections to clean
    const collections = ['members', 'attendance'];
    
    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      
      console.log(`🗑️  Cleaning ${collectionName}...`);
      const result = await collection.deleteMany({});
      console.log(`   ✅ Deleted ${result.deletedCount} documents`);
    }

    // Also clean related collections if they exist
    const optionalCollections = ['bossRotation', 'bossTimers', 'auctionItems'];
    for (const collectionName of optionalCollections) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        if (count > 0) {
          console.log(`🗑️  Cleaning ${collectionName}...`);
          const result = await collection.deleteMany({});
          console.log(`   ✅ Deleted ${result.deletedCount} documents`);
        }
      } catch (e) {
        // Collection might not exist, skip
      }
    }

    console.log('\n✅ Cleanup complete! You can now run the sync script:');
    console.log('   node scripts/sync-sheets-to-mongodb.js --members --attendance');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

cleanup();
