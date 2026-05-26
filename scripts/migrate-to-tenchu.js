/**
 * MongoDB Collection Migration Script
 * Migrates collections from -TRAILERPARKB suffix to -tenchu suffix
 *
 * This script:
 * 1. Copies collections that only exist as -TRAILERPARKB to -tenchu
 * 2. Lists what exists and what needs manual cleanup
 *
 * Usage: node scripts/migrate-to-tenchu.js
 * Requires MONGODB_URI environment variable
 * Optionally set MONGODB_DB_NAME to specify the database (default: tenchu-bot)
 */

const { MongoClient } = require('mongodb');

const SUFFIX_OLD = 'TRAILERPARKB';
const SUFFIX_NEW = 'tenchu';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'tenchu-bot';

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(MONGODB_DB_NAME);
    console.log(`Using database: ${MONGODB_DB_NAME}`);
    const allCollections = await db.listCollections().toArray();
    const collectionNames = allCollections.map(c => c.name);

    console.log('Existing collections:');
    collectionNames.sort().forEach(name => console.log(`  - ${name}`));
    console.log();

    const oldSuffixCollections = collectionNames.filter(n => n.endsWith(`-${SUFFIX_OLD}`));
    const newSuffixCollections = collectionNames.filter(n => n.endsWith(`-${SUFFIX_NEW}`));
    const plainCollections = collectionNames.filter(n => {
      if (n.startsWith('system.')) return false;
      if (n.includes(`-${SUFFIX_OLD}`) || n.includes(`-${SUFFIX_NEW}`)) return false;
      return true;
    });

    console.log(`Found ${oldSuffixCollections.length} -TRAILERPARKB collections`);
    console.log(`Found ${newSuffixCollections.length} -tenchu collections`);
    console.log(`Found ${plainCollections.length} plain collections\n`);

    // Step 1: Copy collections that only exist as -TRAILERPARKB (no -tenchu equivalent)
    console.log('=== Step 1: Copying orphaned -TRAILERPARKB collections to -tenchu ===');
    for (const oldName of oldSuffixCollections) {
      const baseName = oldName.replace(`-${SUFFIX_OLD}`, '');
      const newName = `${baseName}-${SUFFIX_NEW}`;

      if (newSuffixCollections.includes(newName)) {
        console.log(`  Skipping ${oldName} -> ${newName} (already exists)`);
      } else {
        console.log(`  Copying ${oldName} -> ${newName}...`);
        const docs = await db.collection(oldName).find({}).toArray();
        if (docs.length > 0) {
          await db.collection(newName).insertMany(docs);
          console.log(`    Copied ${docs.length} documents`);
        } else {
          console.log(`    ${oldName} is empty, created empty ${newName}`);
        }
      }
    }

    // Step 2: Handle plain collections without suffix
    console.log('\n=== Step 2: Plain collections (no suffix) ===');
    for (const name of plainCollections) {
      const count = await db.collection(name).countDocuments();
      if (count > 0) {
        const newName = `${name}-${SUFFIX_NEW}`;
        if (newSuffixCollections.includes(newName)) {
          console.log(`  ${name} has ${count} docs, ${newName} already exists - skip merge`);
        } else {
          console.log(`  ${name} has ${count} docs but no -tenchu equivalent - possible legacy data`);
        }
      } else {
        console.log(`  ${name} is empty - can be dropped`);
      }
    }

    // Step 3: Review old collections for deletion
    console.log('\n=== Step 3: Review old collections for deletion ===');
    for (const oldName of oldSuffixCollections) {
      const baseName = oldName.replace(`-${SUFFIX_OLD}`, '');
      const newName = `${baseName}-${SUFFIX_NEW}`;
      const oldCount = await db.collection(oldName).countDocuments();
      const newCount = newSuffixCollections.includes(newName)
        ? await db.collection(newName).countDocuments()
        : 0;

      console.log(`  ${oldName}: ${oldCount} docs -> ${newName}: ${newCount} docs`);
      console.log(`    Run this to drop: db.collection("${oldName}").drop()`);
    }

    console.log('\nMigration preparation complete!');
    console.log('Review the output above, then manually drop old collections if desired.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
