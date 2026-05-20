/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENCHU GUILD BOT - Migration Rollback Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rolls back migration by dropping migrated collections
 *
 * Usage:
 *   node scripts/rollback-migration.js --dry-run    # Preview what will be dropped
 *   node scripts/rollback-migration.js              # Actually drop collections
 *   node scripts/rollback-migration.js --collection=members  # Drop specific collection
 *
 * ⚠️ WARNING: This will DELETE all migrated data from MongoDB!
 * Google Sheets data is NOT affected (safe fallback)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('../utils/database-api');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  DRY_RUN: process.argv.includes('--dry-run'),
  COLLECTION: getCollectionFromArgs(),
};

function getCollectionFromArgs() {
  const collectionArg = process.argv.find(arg => arg.startsWith('--collection='));
  if (!collectionArg) return null;
  return collectionArg.split('=')[1];
}

function log(message, level = 'info') {
  const prefix = {
    info: '📝',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  };
  console.log(`${prefix[level] || '📝'} ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLLBACK FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function rollback() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔄 TENCHU GUILD BOT - MIGRATION ROLLBACK');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${CONFIG.DRY_RUN ? '🧪 DRY-RUN (preview only)' : '⚠️  LIVE ROLLBACK'}`);
  console.log(`Target: ${CONFIG.COLLECTION || 'All migrated collections'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (!CONFIG.DRY_RUN) {
    log('⚠️  WARNING: This will DELETE data from MongoDB!', 'warning');
    log('⚠️  Google Sheets data is NOT affected (safe)', 'warning');
    log('⚠️  Press Ctrl+C within 5 seconds to cancel...', 'warning');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    // Connect to MongoDB
    log('Connecting to MongoDB Atlas...', 'info');
    const db = await dbAPI.connect();
    log('Connected successfully!', 'success');

    // Determine which collections to drop
    const collectionsToRollback = CONFIG.COLLECTION
      ? [CONFIG.COLLECTION]
      : ['members', 'auctionItems', 'attendance', 'eventReminders'];

    log(`Collections to rollback: ${collectionsToRollback.join(', ')}`, 'info');

    // Get current counts
    console.log('\n📊 Current Data:');
    for (const collectionName of collectionsToRollback) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        console.log(`  ${collectionName}: ${count} documents`);
      } catch (error) {
        console.log(`  ${collectionName}: Collection doesn't exist`);
      }
    }

    // Drop collections
    console.log('\n🗑️  Dropping Collections:');
    for (const collectionName of collectionsToRollback) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();

        if (count === 0) {
          log(`${collectionName}: Already empty, skipping`, 'info');
          continue;
        }

        if (CONFIG.DRY_RUN) {
          log(`${collectionName}: Would drop ${count} documents`, 'warning');
        } else {
          await collection.drop();
          log(`${collectionName}: Dropped ${count} documents`, 'success');
        }
      } catch (error) {
        if (error.message.includes('ns not found')) {
          log(`${collectionName}: Collection doesn't exist, skipping`, 'info');
        } else {
          log(`${collectionName}: Error - ${error.message}`, 'error');
        }
      }
    }

    // Verify
    console.log('\n📊 After Rollback:');
    for (const collectionName of collectionsToRollback) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        console.log(`  ${collectionName}: ${count} documents`);
      } catch (error) {
        console.log(`  ${collectionName}: Collection doesn't exist`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    if (CONFIG.DRY_RUN) {
      log('✅ DRY-RUN COMPLETE - No data was deleted', 'success');
      log('Run without --dry-run to actually rollback', 'info');
    } else {
      log('✅ ROLLBACK COMPLETE!', 'success');
      log('MongoDB collections dropped successfully', 'success');
      log('Google Sheets data is unchanged (safe)', 'success');
      log('You can re-run migration scripts to migrate again', 'info');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    log(`Rollback failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await dbAPI.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

rollback()
  .then(() => {
    log('Rollback script finished', 'success');
    process.exit(0);
  })
  .catch((error) => {
    log(`Rollback script failed: ${error.message}`, 'error');
    process.exit(1);
  });
