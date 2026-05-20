/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENCHU GUILD BOT - Fast Startup Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Optimized startup that gets the bot online ASAP.
 *
 * Flow:
 * 1. Start Discord bot immediately (non-blocking)
 * 2. Run sync in background (parallel, won't delay bot startup)
 *
 * This is ~10-30 seconds faster than the regular startup.js!
 *
 * Usage:
 *   node scripts/startup-fast.js                    # Fast startup with background sync
 *   SKIP_BACKGROUND_SYNC=true node scripts/startup-fast.js  # Skip sync entirely (fastest)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { spawn } = require('child_process');
const path = require('path');

const SKIP_SYNC = process.env.SKIP_BACKGROUND_SYNC === 'true';

// ═══════════════════════════════════════════════════════════════════════════
// Start Discord Bot Immediately
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('🚀 TENCHU GUILD BOT - FAST STARTUP');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const botPath = path.join(__dirname, '..', 'index2.js');
const botProcess = spawn('node', [
  '--expose-gc',
  '--max-old-space-size=360',
  '--max-semi-space-size=40',
  botPath
], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

console.log('🤖 Discord bot starting immediately...');
console.log('');

botProcess.on('close', (code) => {
  console.log('');
  console.log('🛑 Bot stopped (exit code: ' + code + ')');
  process.exit(code);
});

botProcess.on('error', (error) => {
  console.error('❌ Failed to start bot:', error.message);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════════════
// Run Sync in Background (Non-Blocking)
// ═══════════════════════════════════════════════════════════════════════════

if (!SKIP_SYNC) {
  // Wait 5 seconds for bot to fully initialize before starting background sync
  setTimeout(() => {
    console.log('📋 Starting background sync (Google Sheets → MongoDB)...');
    console.log('   This won\'t affect bot performance.');
    console.log('');

    const syncScriptPath = path.join(__dirname, 'sync-sheets-to-mongodb.js');
    const syncProcess = spawn('node', [syncScriptPath], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    syncProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Background sync complete!');
      } else {
        console.log('⚠️  Background sync failed (exit code: ' + code + ')');
      }
    });

    syncProcess.on('error', (error) => {
      console.error('⚠️  Background sync error:', error.message);
    });
  }, 5000); // 5 second delay
} else {
  console.log('⏭️  Background sync skipped (SKIP_BACKGROUND_SYNC=true)');
  console.log('');
}
