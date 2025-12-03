/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Startup Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Runs on every bot startup to ensure MongoDB is synced with Google Sheets.
 *
 * Flow:
 * 1. Sync Google Sheets → MongoDB (members, auction items)
 * 2. Import historical attendance (one-time, skips if already done)
 * 3. Start the bot
 *
 * If sync fails, bot still starts (MongoDB may be behind but bot won't crash).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { spawn } = require('child_process');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Start Discord Bot
// ═══════════════════════════════════════════════════════════════════════════

function startBot() {
  const botPath = path.join(__dirname, '..', 'index2.js');
  const botProcess = spawn('node', [
    '--expose-gc',
    '--max-old-space-size=480',
    '--optimize-for-size',
    '--max-semi-space-size=8',
    botPath
  ], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  botProcess.on('close', (botCode) => {
    console.log('');
    console.log('🛑 Bot stopped (exit code: ' + botCode + ')');
    process.exit(botCode);
  });

  botProcess.on('error', (error) => {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
  });
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('🚀 ELYSIUM GUILD BOT - STARTUP');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Sync Google Sheets → MongoDB
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 Step 1/3: Syncing Google Sheets → MongoDB...');
console.log('');

const syncScriptPath = path.join(__dirname, 'sync-sheets-to-mongodb.js');
const syncProcess = spawn('node', [syncScriptPath], {
  stdio: 'inherit', // Show sync script output directly
  cwd: path.join(__dirname, '..') // Run from project root
});

syncProcess.on('close', (syncCode) => {
  console.log('');

  if (syncCode === 0) {
    console.log('✅ Step 1/3: MongoDB sync complete!');
  } else {
    console.log('⚠️  Step 1/3: MongoDB sync failed (exit code: ' + syncCode + ')');
    console.log('⚠️  Continuing anyway...');
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Import Historical Attendance (one-time, auto-skips if done)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('📚 Step 2/3: Importing historical attendance...');
  console.log('');

  const importScriptPath = path.join(__dirname, 'import-historical-attendance.js');
  const importProcess = spawn('node', [importScriptPath], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  importProcess.on('close', (importCode) => {
    console.log('');

    if (importCode === 0) {
      console.log('✅ Step 2/3: Historical import complete (or skipped if already done)!');
    } else {
      console.log('⚠️  Step 2/3: Historical import failed (exit code: ' + importCode + ')');
      console.log('⚠️  Continuing anyway...');
    }

    console.log('');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Start the bot
    // ═══════════════════════════════════════════════════════════════════════

    console.log('🤖 Step 3/3: Starting Discord bot...');
    console.log('');

    startBot();
  });

  importProcess.on('error', (error) => {
    console.error('❌ Failed to run import script:', error.message);
    console.log('⚠️  Starting bot anyway...');
    console.log('');

    // Start bot even if import fails
    startBot();
  });
});

syncProcess.on('error', (error) => {
  console.error('❌ Failed to run sync script:', error.message);
  console.log('⚠️  Starting bot anyway...');
  console.log('');

  // Start bot even if sync fails
  startBot();
});
