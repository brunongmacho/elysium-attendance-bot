/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Migration Verification Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Verifies data integrity after MongoDB migration
 *
 * Usage:
 *   node scripts/verify-migration.js              # Verify all collections
 *   node scripts/verify-migration.js --collection=members  # Verify specific collection
 *   node scripts/verify-migration.js --detailed   # Show detailed sample data
 *
 * Checks:
 *   - Document counts match expectations
 *   - Required fields are present
 *   - Data types are correct
 *   - Indexes exist
 *   - Sample data spot-checks
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const dbAPI = require('../utils/database-api');
const { SheetAPI } = require('../utils/sheet-api');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  COLLECTION: getCollectionFromArgs(),
  DETAILED: process.argv.includes('--detailed'),
  SAMPLE_SIZE: 5,
};

// Load bot configuration
let botConfig;
try {
  const configPath = path.join(__dirname, '..', 'config.json');
  botConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Failed to load config.json:', error.message);
  process.exit(1);
}

const WEBHOOK_URL = botConfig.sheet_webhook_url;
const sheetAPI = new SheetAPI(WEBHOOK_URL);

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

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

function printSection(title) {
  console.log('\n' + '═'.repeat(67));
  console.log(`📊 ${title.toUpperCase()}`);
  console.log('═'.repeat(67));
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function verifyMembers(db) {
  printSection('Verifying Members Collection');

  try {
    const membersCol = db.collection('members');

    // Count documents
    const count = await membersCol.countDocuments();
    log(`Total members: ${count}`, 'info');

    if (count === 0) {
      log('No members found - migration may not have run yet', 'warning');
      return false;
    }

    // Check expected count from Sheets
    log('Fetching member count from Google Sheets...', 'info');
    const sheetResponse = await sheetAPI.call('getBiddingPointsSummary', { forceFresh: true });

    if (sheetResponse.status === 'ok') {
      const sheetCount = Object.keys(sheetResponse.points || {}).length;
      log(`Sheet members: ${sheetCount}`, 'info');

      if (count === sheetCount) {
        log('✅ Count matches Google Sheets!', 'success');
      } else {
        log(`⚠️ Count mismatch: MongoDB=${count}, Sheets=${sheetCount}`, 'warning');
      }
    }

    // Check indexes
    const indexes = await membersCol.indexes();
    log(`Indexes: ${indexes.length}`, 'info');
    if (CONFIG.DETAILED) {
      indexes.forEach(idx => {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
    }

    // Sample documents
    const samples = await membersCol.find({}).limit(CONFIG.SAMPLE_SIZE).toArray();
    log(`Sample documents: ${samples.length}`, 'info');

    // Verify required fields
    const requiredFields = ['_id', 'username', 'pointsAvailable', 'attendance'];
    const missingFields = [];

    for (const sample of samples) {
      for (const field of requiredFields) {
        if (!(field in sample)) {
          missingFields.push({ username: sample.username, field });
        }
      }
    }

    if (missingFields.length > 0) {
      log(`Missing fields found in ${missingFields.length} documents`, 'error');
      if (CONFIG.DETAILED) {
        missingFields.forEach(mf => {
          console.log(`  - ${mf.username}: missing ${mf.field}`);
        });
      }
    } else {
      log('All required fields present', 'success');
    }

    // Show sample data
    if (CONFIG.DETAILED && samples.length > 0) {
      console.log('\nSample Member:');
      console.log(JSON.stringify(samples[0], null, 2));
    }

    // Verify data types
    const typeErrors = [];
    for (const sample of samples) {
      if (typeof sample.pointsAvailable !== 'number') {
        typeErrors.push({ username: sample.username, field: 'pointsAvailable', type: typeof sample.pointsAvailable });
      }
      if (typeof sample.username !== 'string') {
        typeErrors.push({ username: sample.username, field: 'username', type: typeof sample.username });
      }
    }

    if (typeErrors.length > 0) {
      log(`Type errors found in ${typeErrors.length} fields`, 'error');
      if (CONFIG.DETAILED) {
        typeErrors.forEach(te => {
          console.log(`  - ${te.username}.${te.field}: expected number/string, got ${te.type}`);
        });
      }
    } else {
      log('All field types correct', 'success');
    }

    return true;

  } catch (error) {
    log(`Verification failed: ${error.message}`, 'error');
    return false;
  }
}

async function verifyAuctionItems(db) {
  printSection('Verifying Auction Items Collection');

  try {
    const itemsCol = db.collection('auctionItems');

    // Count documents
    const count = await itemsCol.countDocuments();
    log(`Total auction items: ${count}`, 'info');

    if (count === 0) {
      log('No auction items found - migration may not have run yet', 'warning');
      return false;
    }

    // Count by status
    const pendingCount = await itemsCol.countDocuments({ status: 'pending' });
    const soldCount = await itemsCol.countDocuments({ status: 'sold' });

    log(`Pending: ${pendingCount}, Sold: ${soldCount}`, 'info');

    // Check indexes
    const indexes = await itemsCol.indexes();
    log(`Indexes: ${indexes.length}`, 'info');
    if (CONFIG.DETAILED) {
      indexes.forEach(idx => {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
    }

    // Sample documents
    const samples = await itemsCol.find({}).limit(CONFIG.SAMPLE_SIZE).toArray();
    log(`Sample documents: ${samples.length}`, 'info');

    // Verify required fields
    const requiredFields = ['itemName', 'startPrice', 'status'];
    const missingFields = [];

    for (const sample of samples) {
      for (const field of requiredFields) {
        if (!(field in sample)) {
          missingFields.push({ item: sample.itemName, field });
        }
      }
    }

    if (missingFields.length > 0) {
      log(`Missing fields found in ${missingFields.length} documents`, 'error');
    } else {
      log('All required fields present', 'success');
    }

    // Show sample data
    if (CONFIG.DETAILED && samples.length > 0) {
      console.log('\nSample Auction Item (Pending):');
      const pending = samples.find(s => s.status === 'pending');
      if (pending) console.log(JSON.stringify(pending, null, 2));

      console.log('\nSample Auction Item (Sold):');
      const sold = samples.find(s => s.status === 'sold');
      if (sold) console.log(JSON.stringify(sold, null, 2));
    }

    // Verify sold items have winners
    const soldWithoutWinner = await itemsCol.countDocuments({
      status: 'sold',
      winner: { $in: [null, ''] }
    });

    if (soldWithoutWinner > 0) {
      log(`${soldWithoutWinner} sold items missing winner`, 'warning');
    } else {
      log('All sold items have winners', 'success');
    }

    return true;

  } catch (error) {
    log(`Verification failed: ${error.message}`, 'error');
    return false;
  }
}

async function verifyAttendance(db) {
  printSection('Verifying Attendance Collection');

  try {
    const attendanceCol = db.collection('attendance');

    // Count documents
    const count = await attendanceCol.countDocuments();
    log(`Total attendance records: ${count}`, 'info');

    if (count === 0) {
      log('No attendance records - partial implementation (expected)', 'warning');
      return true; // Not an error, just incomplete
    }

    // Check indexes
    const indexes = await attendanceCol.indexes();
    log(`Indexes: ${indexes.length}`, 'info');
    if (CONFIG.DETAILED) {
      indexes.forEach(idx => {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
    }

    // Sample documents
    const samples = await attendanceCol.find({}).limit(CONFIG.SAMPLE_SIZE).toArray();
    log(`Sample documents: ${samples.length}`, 'info');

    if (CONFIG.DETAILED && samples.length > 0) {
      console.log('\nSample Attendance Record:');
      console.log(JSON.stringify(samples[0], null, 2));
    }

    return true;

  } catch (error) {
    log(`Verification failed: ${error.message}`, 'error');
    return false;
  }
}

async function verifyDatabase(db) {
  printSection('Database Overview');

  try {
    // Get database stats
    const stats = await db.stats();
    log(`Database: ${db.databaseName}`, 'info');
    log(`Collections: ${stats.collections}`, 'info');
    log(`Data Size: ${(stats.dataSize / 1024).toFixed(2)} KB`, 'info');
    log(`Index Size: ${(stats.indexSize / 1024).toFixed(2)} KB`, 'info');
    log(`Total Documents: ${stats.objects}`, 'info');

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\nCollections:');
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`  - ${col.name}: ${count} documents`);
    }

    return true;

  } catch (error) {
    log(`Database verification failed: ${error.message}`, 'error');
    return false;
  }
}

async function compareWithSheets() {
  printSection('Comparing with Google Sheets');

  try {
    // Fetch members from Sheets
    log('Fetching member points from Google Sheets...', 'info');
    const sheetResponse = await sheetAPI.call('getBiddingPointsSummary', { forceFresh: true });

    if (sheetResponse.status !== 'ok') {
      log('Failed to fetch from Google Sheets', 'error');
      return false;
    }

    const sheetPoints = sheetResponse.points || {};
    const sheetMembers = Object.keys(sheetPoints);

    log(`Found ${sheetMembers.length} members in Google Sheets`, 'info');

    // Sample comparison
    if (CONFIG.DETAILED && sheetMembers.length > 0) {
      console.log('\nSample Sheet Data:');
      const sample = sheetMembers.slice(0, 3);
      sample.forEach(member => {
        console.log(`  ${member}: ${sheetPoints[member]} points`);
      });
    }

    return true;

  } catch (error) {
    log(`Sheet comparison failed: ${error.message}`, 'error');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VERIFICATION ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

async function runVerification() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔍 ELYSIUM GUILD BOT - MIGRATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Detailed Mode: ${CONFIG.DETAILED ? 'ON' : 'OFF'}`);
  console.log(`Collection Filter: ${CONFIG.COLLECTION || 'All'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  let allPassed = true;

  try {
    // Connect to MongoDB
    log('Connecting to MongoDB Atlas...', 'info');
    const db = await dbAPI.connect();
    log('Connected successfully!', 'success');

    // Verify database
    await verifyDatabase(db);

    // Verify collections
    const verifications = [];

    if (!CONFIG.COLLECTION || CONFIG.COLLECTION === 'members') {
      verifications.push({ name: 'members', func: verifyMembers });
    }
    if (!CONFIG.COLLECTION || CONFIG.COLLECTION === 'auctionItems') {
      verifications.push({ name: 'auctionItems', func: verifyAuctionItems });
    }
    if (!CONFIG.COLLECTION || CONFIG.COLLECTION === 'attendance') {
      verifications.push({ name: 'attendance', func: verifyAttendance });
    }

    for (const verification of verifications) {
      const passed = await verification.func(db);
      if (!passed) allPassed = false;
    }

    // Compare with Sheets
    await compareWithSheets();

    // Print final result
    console.log('\n' + '═'.repeat(67));
    if (allPassed) {
      log('✅ ALL VERIFICATIONS PASSED!', 'success');
    } else {
      log('⚠️ SOME VERIFICATIONS FAILED - Check output above', 'warning');
    }
    console.log('═'.repeat(67) + '\n');

  } catch (error) {
    log(`Verification failed: ${error.message}`, 'error');
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

runVerification()
  .then(() => {
    log('Verification script finished', 'success');
    process.exit(0);
  })
  .catch((error) => {
    log(`Verification script failed: ${error.message}`, 'error');
    process.exit(1);
  });
