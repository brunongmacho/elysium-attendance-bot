/**
 * Boss timer integration - creates attendance threads for scheduled boss spawns.
 */

const { normalizeTimestamp } = require('../../utils/common');
const { createSpawnThreads } = require('./thread-creation');
const bossTimer = require('../../boss-timer.js');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// BOSS TIMER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create attendance thread for boss (called by boss-timer.js)
 * Simplified wrapper around createSpawnThreads for boss timer integration.
 *
 * @param {Client} discordClient - Discord.js client
 * @param {string} bossName - Boss name from boss_spawn_config.json
 * @param {Date} spawnTime - Spawn time
 * @param {boolean} noAutoClose - If true, thread won't auto-close (for maintenance mode)
 * @param {boolean} skipColumnCheck - If true, skips duplicate check (for maintenance - always new)
 * @returns {Promise<Object>} Thread object
 */
async function createThreadForBoss(discordClient, bossName, spawnTime, noAutoClose = false, skipColumnCheck = false) {
  // Format date and time for thread (GMT+8 / Asia/Manila)
  const dateStr = spawnTime.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  }).replace(/\//g, '/'); // MM/DD/YY

  const timeStr = spawnTime.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',      // No zero-padding (matches Google Sheets: 0-23)
    minute: '2-digit',    // Zero-padded minutes
    hour12: false
  }); // H:MM (matches Google Sheets format: no seconds)

  const fullTimestamp = `${dateStr} ${timeStr}`;

  // Create threads using existing function
  const result = await createSpawnThreads(
    discordClient,
    bossName,
    dateStr,
    timeStr,
    fullTimestamp,
    'boss_timer',
    noAutoClose,
    skipColumnCheck
  );

  if (!result.success) {
    throw new Error(`Failed to create thread for ${bossName}: ${result.error}`);
  }

  // Return the attendance thread
  const threadId = Object.keys(state.stateManager.activeSpawns).find(
    id => state.stateManager.activeSpawns[id].boss === bossName && state.stateManager.activeSpawns[id].timestamp === fullTimestamp
  );

  if (!threadId) {
    throw new Error('Thread created but not found in active spawns');
  }

  const guild = await discordClient.guilds.fetch(state.config.main_guild_id);
  const attChannel = await guild.channels.fetch(state.config.attendance_channel_id);
  const thread = await attChannel.threads.fetch(threadId);

  // Clear boss timer entry if thread was created (makes boss available again)
  await bossTimer.clearBossTimerOnSpawn(bossName);

  return thread;
}

module.exports = { createThreadForBoss };
