/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Startup Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Runs on every bot startup to ensure MongoDB is synced with Google Sheets.
 *
 * Flow:
 * 1. Sync Google Sheets → MongoDB (keeps MongoDB in sync with backup)
 * 2. Start the bot
 *
 * If sync fails, bot still starts (MongoDB may be behind but bot won't crash).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🚀 ELYSIUM GUILD BOT - STARTUP');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Sync Google Sheets → MongoDB
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 Step 1/2: Syncing Google Sheets → MongoDB...');
console.log('');

const syncScriptPath = path.join(__dirname, 'sync-sheets-to-mongodb.js');
const syncProcess = spawn('node', [syncScriptPath], {
  stdio: 'inherit', // Show sync script output directly
  cwd: path.join(__dirname, '..') // Run from project root
});

syncProcess.on('close', (code) => {
  console.log('');

  if (code === 0) {
    console.log('✅ Step 1/2: MongoDB sync complete!');
  } else {
    console.log('⚠️  Step 1/2: MongoDB sync failed (exit code: ' + code + ')');
    console.log('⚠️  Bot will start anyway - MongoDB may be behind Google Sheets');
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Start the bot
  // ═══════════════════════════════════════════════════════════════════════

  console.log('🤖 Step 2/2: Starting Discord bot...');
  console.log('');

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
});

syncProcess.on('error', (error) => {
  console.error('❌ Failed to run sync script:', error.message);
  console.log('⚠️  Starting bot anyway...');
  console.log('');

  // Start bot even if sync fails
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
    process.exit(botCode);
  });
});
