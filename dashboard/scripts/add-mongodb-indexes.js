/**
 * Automated MongoDB Index Creation Script
 *
 * This script safely adds performance indexes to your MongoDB collections.
 * It's idempotent - running it multiple times is safe (won't create duplicates).
 *
 * SAFE FOR ALL REPOS: Other applications using this database will benefit automatically.
 *
 * Usage:
 *   node scripts/add-mongodb-indexes.js
 */

const { MongoClient } = require('mongodb');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || process.env.DB_NAME || 'elysium-dashboard';

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI not found in environment variables');
  console.error('Make sure .env.local exists with MONGODB_URI');
  process.exit(1);
}

async function createIndexes() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    const db = client.db(DB_NAME);

    // Track results
    const results = {
      created: [],
      existing: [],
      errors: []
    };

    // Define all indexes to create
    const indexes = [
      // Members collection
      {
        collection: 'members-tenchu',
        indexes: [
          { key: { memberId: 1 }, name: 'memberId_1', unique: true, sparse: true },
          { key: { username: 1 }, name: 'username_1' },
          { key: { discordId: 1 }, name: 'discordId_1', sparse: true },
        ]
      },

      // Bosses collection
      {
        collection: 'bosses-tenchu',
        indexes: [
          { key: { bossName: 1 }, name: 'bossName_1', unique: true },
          { key: { nextSpawnTime: 1 }, name: 'nextSpawnTime_1' },
          { key: { status: 1 }, name: 'status_1' },
          { key: { type: 1 }, name: 'type_1' },
          { key: { status: 1, nextSpawnTime: 1 }, name: 'status_nextSpawn_compound' },
        ]
      },

      // Attendance collection
      {
        collection: 'attendance-tenchu',
        indexes: [
          { key: { memberId: 1 }, name: 'memberId_1' },
          { key: { bossName: 1 }, name: 'bossName_1' },
          { key: { killTime: -1 }, name: 'killTime_desc' },
          { key: { memberId: 1, bossName: 1 }, name: 'member_boss_compound' },
          { key: { memberId: 1, killTime: -1 }, name: 'member_killTime_compound' },
          { key: { bossName: 1, killTime: -1 }, name: 'boss_killTime_compound' },
        ]
      },

      // Points collection (if exists)
      {
        collection: 'points-tenchu',
        indexes: [
          { key: { memberId: 1 }, name: 'memberId_1', unique: true },
          { key: { pointsEarned: -1 }, name: 'pointsEarned_desc' },
          { key: { pointsAvailable: -1 }, name: 'pointsAvailable_desc' },
        ]
      },

      // Bids collection (if exists)
      {
        collection: 'bids-tenchu',
        indexes: [
          { key: { memberId: 1 }, name: 'memberId_1' },
          { key: { itemName: 1 }, name: 'itemName_1' },
          { key: { bidAmount: -1 }, name: 'bidAmount_desc' },
          { key: { createdAt: -1 }, name: 'createdAt_desc' },
        ]
      }
    ];

    // Create indexes for each collection
    for (const { collection: collectionName, indexes: indexList } of indexes) {
      console.log(`📊 Processing collection: ${collectionName}`);

      const collection = db.collection(collectionName);

      // Check if collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        console.log(`   ⚠️  Collection doesn't exist yet, skipping...\n`);
        continue;
      }

      // Get existing indexes
      const existingIndexes = await collection.indexes();
      const existingIndexNames = existingIndexes.map(idx => idx.name);

      for (const indexSpec of indexList) {
        const indexName = indexSpec.name;

        try {
          if (existingIndexNames.includes(indexName)) {
            console.log(`   ✓ Index "${indexName}" already exists`);
            results.existing.push(`${collectionName}.${indexName}`);
          } else {
            const options = { name: indexName };
            if (indexSpec.unique) options.unique = true;
            if (indexSpec.sparse) options.sparse = true;

            await collection.createIndex(indexSpec.key, options);
            console.log(`   ✅ Created index "${indexName}"`);
            results.created.push(`${collectionName}.${indexName}`);
          }
        } catch (error) {
          console.log(`   ❌ Error creating index "${indexName}": ${error.message}`);
          results.errors.push(`${collectionName}.${indexName}: ${error.message}`);
        }
      }

      console.log('');
    }

    // Print summary
    console.log('═'.repeat(60));
    console.log('📈 INDEX CREATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Created:  ${results.created.length} new indexes`);
    console.log(`✓  Existing: ${results.existing.length} indexes (already present)`);
    console.log(`❌ Errors:   ${results.errors.length} errors`);
    console.log('═'.repeat(60));

    if (results.created.length > 0) {
      console.log('\n🎉 New indexes created:');
      results.created.forEach(idx => console.log(`   • ${idx}`));
    }

    if (results.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      results.errors.forEach(err => console.log(`   • ${err}`));
    }

    console.log('\n✅ Index optimization complete!');
    console.log('📊 Your queries will now be much faster!');
    console.log('🔒 All other repos using this DB will also benefit.\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the script
createIndexes().catch(console.error);
