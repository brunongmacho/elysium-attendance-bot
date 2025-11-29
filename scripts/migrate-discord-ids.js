#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - Discord ID Migration Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One-time migration script to map temp member IDs to real Discord IDs
 *
 * Usage:
 *   node scripts/migrate-discord-ids.js
 *
 * What it does:
 * 1. Connects to MongoDB and Discord
 * 2. Finds all members with temp IDs (temp_username)
 * 3. Looks up their real Discord IDs from the guild
 * 4. Migrates MongoDB documents from temp ID to real Discord ID
 * 5. Queues background sync to update Sheets
 *
 * Requirements:
 * - Bot must be running or DISCORD_TOKEN in environment
 * - MONGODB_URI in environment
 * - Bot must be in the Discord server
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

// Load configuration
const config = require('../config.json');

// Load MongoDB helpers
const dbAPI = require('../utils/database-api');
const discordIdMapper = require('../utils/discord-id-mapper');
const adminAlerts = require('../utils/admin-alerts');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const GUILD_ID = config.main_guild_id;
const DRY_RUN = process.env.DRY_RUN === 'true';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

async function migrateDiscordIds() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ELYSIUM GUILD BOT - Discord ID Migration');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Initialize Discord client
  console.log('🔌 Initializing Discord client...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Login to Discord
  const token = process.env.DISCORD_TOKEN || config.token;
  if (!token) {
    console.error('❌ DISCORD_TOKEN not found in environment or config.json');
    process.exit(1);
  }

  try {
    await client.login(token);
    console.log('✅ Discord client logged in\n');

    // Wait for client to be ready
    await new Promise((resolve) => {
      client.once('ready', resolve);
    });

    console.log(`✅ Bot ready as ${client.user.tag}\n`);

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const db = await dbAPI.connect();
    console.log('✅ Connected to MongoDB\n');

    // Get current migration stats
    console.log('📊 Checking current migration status...');
    const statsBefore = await discordIdMapper.getMigrationStats();
    console.log(`   Total members: ${statsBefore.total}`);
    console.log(`   With real Discord ID: ${statsBefore.withRealId}`);
    console.log(`   With temp ID: ${statsBefore.withTempId}`);
    console.log(`   Previously migrated: ${statsBefore.migrated}`);
    console.log(`   Migration progress: ${statsBefore.percentComplete}%\n`);

    if (statsBefore.withTempId === 0) {
      console.log('✅ All members already have real Discord IDs!');
      console.log('   Nothing to migrate.\n');
      await client.destroy();
      process.exit(0);
    }

    // Run batch migration
    if (DRY_RUN) {
      console.log('🔍 DRY RUN: Would migrate', statsBefore.withTempId, 'members\n');
    } else {
      console.log(`🚀 Starting batch migration for ${statsBefore.withTempId} members...\n`);

      const migrationStats = await discordIdMapper.batchMigrateAllMembers(client, GUILD_ID);

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  MIGRATION COMPLETE');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`✅ Successfully migrated: ${migrationStats.migrated}`);
      console.log(`❌ Failed: ${migrationStats.failed}`);
      console.log(`⚠️ Not found in Discord: ${migrationStats.notFound}`);
      console.log(`📊 Total processed: ${migrationStats.total}\n`);

      if (migrationStats.errors.length > 0) {
        console.log('❌ Errors encountered:');
        migrationStats.errors.forEach((err) => {
          console.log(`   - ${err.username}: ${err.error}`);
        });
        console.log('');
      }

      // Get updated stats
      console.log('📊 Final migration status:');
      const statsAfter = await discordIdMapper.getMigrationStats();
      console.log(`   Total members: ${statsAfter.total}`);
      console.log(`   With real Discord ID: ${statsAfter.withRealId}`);
      console.log(`   With temp ID: ${statsAfter.withTempId}`);
      console.log(`   Migration progress: ${statsAfter.percentComplete}%\n`);

      if (statsAfter.percentComplete === 100) {
        console.log('🎉 All members successfully migrated to real Discord IDs!\n');
      } else {
        console.log(`⚠️ ${statsAfter.withTempId} members still have temp IDs`);
        console.log('   These members may not be in the Discord server.\n');
      }
    }

    // Cleanup
    console.log('🧹 Cleaning up...');
    await client.destroy();
    console.log('✅ Discord client disconnected');
    console.log('✅ Migration script complete\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);

    if (client) {
      await client.destroy();
    }

    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

// Check for MongoDB URI
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  console.error('   Please set MONGODB_URI before running this script');
  process.exit(1);
}

// Run migration
migrateDiscordIds().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
