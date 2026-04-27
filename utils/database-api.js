/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - MongoDB Database API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Centralized MongoDB connection and query interface
 * Region: Singapore (ap-southeast-1) - Same as Koyeb
 * Latency: ~5-10ms expected
 *
 * Features:
 * - Connection pooling for performance
 * - Automatic reconnection
 * - Index creation for fast queries
 * - Health monitoring
 * - Error handling
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

// Load config for database name and guild name
let DB_NAME = 'elysium-bot-tpb'; // Default for TrailerParkB
let GUILD_NAME = 'TrailerParkB';
try {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, '..', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.mongodb_database) {
    DB_NAME = config.mongodb_database;
  }
  if (config.guild_name) {
    GUILD_NAME = config.guild_name;
  }
} catch (e) {
  // Use default
}

/**
 * Helper function to get guild-specific collection name
 * All collections use suffix (e.g., attendance-TPB, members-TPB)
 * @param {string} baseName - Base collection name
 * @returns {string} - Guild-specific collection name
 */
function getCollectionName(baseName) {
  const suffix = GUILD_NAME.replace(/\s+/g, '_').toUpperCase();
  return `${baseName}-${suffix}`;
}

class DatabaseAPI {
  constructor() {
    this.client = null;
    this.db = null;
    this.connected = false;
    this.connectAttempts = 0;
    this.maxConnectAttempts = 5;
    this.connectionPromise = null; // CRIT-002 FIX: Mutex to prevent race condition
    this.adminChannel = null; // For alert notifications
  }

  /**
   * Connect to MongoDB Atlas
   * @returns {Promise<Db>} MongoDB database instance
   */
  async connect() {
    // Fast path: Already connected
    if (this.connected && this.db) {
      // Already connected - return existing connection (no logging to reduce noise)
      return this.db;
    }

    // CRIT-002 FIX: Wait for existing connection attempt
    if (this.connectionPromise) {
      console.log('⏳ [MongoDB] Waiting for existing connection attempt...');
      return this.connectionPromise;
    }

    // Create new connection attempt with mutex
    this.connectionPromise = this._performConnection();

    try {
      const result = await this.connectionPromise;
      return result;
    } finally {
      // Clear promise after completion (success or failure)
      this.connectionPromise = null;
    }
  }

  /**
   * Internal method to perform actual connection
   * @private
   */
  async _performConnection() {
    try {
      console.log('🔌 Connecting to MongoDB Atlas (Singapore)...');

      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is not set');
      }

      this.client = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,              // Max 10 concurrent connections
        minPoolSize: 2,               // Keep 2 connections ready
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        retryReads: true
      });

      await this.client.connect();
      this.db = this.client.db(DB_NAME);
      this.connected = true;
      this.connectAttempts = 0;

      console.log('✅ MongoDB connected successfully');
      console.log(`📊 Database: ${DB_NAME}`);

      // Create indexes for performance
      await this.createIndexes();

      // Test connection and get stats
      const stats = await this.db.stats();
      console.log(`💾 Storage: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`📦 Collections: ${stats.collections}`);
      console.log(`📝 Documents: ${stats.objects}`);

      // Set up connection event handlers
      this.client.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        this.connected = false;
      });

      this.client.on('close', () => {
        console.log('🔌 MongoDB connection closed');
        this.connected = false;
      });

      return this.db;
    } catch (error) {
      this.connectAttempts++;
      console.error(`❌ MongoDB connection failed (attempt ${this.connectAttempts}/${this.maxConnectAttempts}):`, error.message);
      this.connected = false;

      // Retry connection if under max attempts
      if (this.connectAttempts < this.maxConnectAttempts) {
        console.log(`⏳ Retrying connection in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this._performConnection(); // CRIT-002 FIX: Recursive retry without mutex
      }

      throw error;
    }
  }

  /**
   * Set admin channel for MongoDB failure alerts (CRIT-005)
   * @param {TextChannel} channel - Discord admin channel
   */
  setAdminChannel(channel) {
    this.adminChannel = channel;
    console.log('✅ [MongoDB] Admin channel configured for alerts');
  }

   /**
    * Check if critical indexes already exist (PERF FIX)
    * Prevents redundant index creation during startup
    * @returns {Promise<boolean>} True if all critical indexes exist
    */
   async checkIndexesExist() {
     try {
       // Check a few critical indexes to determine if indexes are already created
       const criticalChecks = [
         { collection: getCollectionName('attendance'), index: 'member_history' },
         { collection: getCollectionName('members'), index: 'username_unique' },
         { collection: getCollectionName('eventReminders'), index: 'due_reminders' },
         { collection: getCollectionName('coreEvaluation'), index: 'evaluation_lookup' },
         { collection: getCollectionName('coreEvaluationState'), index: 'state_type_lookup' }
       ];

       for (const check of criticalChecks) {
         try {
           const indexes = await this.db.collection(check.collection).indexes();
           const exists = indexes.some(idx => idx.name === check.index);
           if (!exists) {
             return false; // At least one critical index missing
           }
         } catch (collectionError) {
           // If collection doesn't exist yet, indexes definitely don't exist
           if (collectionError.message && collectionError.message.includes('ns does not exist')) {
             return false; // Collection doesn't exist, so indexes don't exist
           }
           // For other errors, log and treat as missing indexes
           console.error(`⚠️ Error checking indexes for ${check.collection}:`, collectionError.message);
           return false;
         }
       }

       return true; // All critical indexes exist
     } catch (error) {
       console.error('⚠️ Error checking indexes:', error.message);
       return false; // On error, proceed with creation to be safe
     }
   }

  /**
   * Create database indexes for performance (PHASE 1: CRIT-005 Enhanced)
   * Indexes dramatically improve query speed (100x faster!)
   * Tracks individual index creation and alerts admins on failures
   *
   * @returns {Promise<Object>} Results object with created, failed, and verified indexes
   */
  async createIndexes() {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // PERF FIX: Check if indexes already exist before attempting creation
    // This prevents redundant index operations during startup (sync → import → bot)
    const indexesExist = await this.checkIndexesExist();
    if (indexesExist) {
      console.log('⏭️  Database indexes already exist - skipping creation');
      return { created: [], failed: [], verified: [], skipped: [] };
    }

    console.log('📇 Creating database indexes with enhanced tracking...');

    const indexResults = {
      created: [],
      failed: [],
      verified: [],
      skipped: []
    };

    // Define all indexes with metadata
    const indexDefinitions = [
      // Attendance indexes
      { collection: getCollectionName('attendance'), spec: { memberId: 1, timestamp: -1 }, name: 'member_history', critical: true },
      { collection: getCollectionName('attendance'), spec: { weekStartDate: 1 }, name: 'week_lookup', critical: false },
      { collection: getCollectionName('attendance'), spec: { bossName: 1 }, name: 'boss_lookup', critical: false },
      { collection: getCollectionName('attendance'), spec: { weekLabel: 1 }, name: 'sheet_sync', critical: false },

      // PHASE 3.2: Compound indexes for report optimization
      { collection: getCollectionName('attendance'), spec: { timestamp: -1, bossName: 1 }, name: 'report_spawns', critical: false },
      { collection: getCollectionName('attendance'), spec: { timestamp: -1, memberName: 1, bossName: 1 }, name: 'report_members', critical: false },
      { collection: getCollectionName('attendance'), spec: { timestamp: -1, memberId: 1 }, name: 'member_timeline', critical: false },

      // Members indexes
      { collection: getCollectionName('members'), spec: { username: 1 }, options: { unique: true }, name: 'username_unique', critical: true },
      { collection: getCollectionName('members'), spec: { pointsAvailable: -1 }, name: 'points_leaderboard', critical: false },
      { collection: getCollectionName('members'), spec: { 'attendance.total': -1 }, name: 'attendance_leaderboard', critical: false },

      // PHASE 3.2: Compound indexes for bidding stats in reports
      { collection: getCollectionName('members'), spec: { isActive: 1, pointsEarned: -1 }, name: 'active_top_earners', critical: false },
      { collection: getCollectionName('members'), spec: { isActive: 1, pointsSpent: -1 }, name: 'active_top_spenders', critical: false },

      // Auction items indexes
      { collection: getCollectionName('auctionItems'), spec: { status: 1 }, name: 'status_lookup', critical: false },
      { collection: getCollectionName('auctionItems'), spec: { addedAt: -1 }, name: 'recent_items', critical: false },
      { collection: getCollectionName('auctionItems'), spec: { winnerId: 1, status: 1 }, name: 'winner_items', critical: false },

      // Auction sessions indexes
      { collection: getCollectionName('auctionSessions'), spec: { sessionDate: -1 }, name: 'recent_sessions', critical: false },
      { collection: getCollectionName('auctionSessions'), spec: { sessionNumber: 1 }, options: { unique: true }, name: 'session_number_unique', critical: false },

      // Boss rotation indexes
      { collection: getCollectionName('bossRotation'), spec: { bossName: 1 }, options: { unique: true }, name: 'boss_unique', critical: false },
      { collection: getCollectionName('bossRotation'), spec: { currentGuild: 1 }, name: 'current_turn', critical: false },

      // Event reminders indexes
      { collection: getCollectionName('eventReminders'), spec: { nextTrigger: 1, active: 1 }, name: 'due_reminders', critical: true },
      { collection: getCollectionName('eventReminders'), spec: { eventType: 1 }, name: 'event_type_lookup', critical: false },

      // Boss timers indexes
      { collection: getCollectionName('bossTimers'), spec: { bossName: 1 }, options: { unique: true }, name: 'boss_timer_unique', critical: false },
      { collection: getCollectionName('bossTimers'), spec: { nextSpawnTime: 1 }, name: 'spawn_time_lookup', critical: false },

      // Core Evaluation indexes
      { collection: getCollectionName('coreEvaluation'), spec: { discordId: 1, phase: 1, cycleNumber: -1 }, name: 'evaluation_lookup', critical: false },
      { collection: getCollectionName('coreEvaluation'), spec: { phase: 1, cycleNumber: 1 }, name: 'phase_cycle_lookup', critical: false },
      { collection: getCollectionName('coreEvaluationState'), spec: { type: 1 }, name: 'state_type_lookup', critical: false },
    ];

    // Create indexes with individual error handling
    for (const indexDef of indexDefinitions) {
      try {
        await this.db.collection(indexDef.collection).createIndex(
          indexDef.spec,
          { ...indexDef.options, name: indexDef.name }
        );
        indexResults.created.push({
          collection: indexDef.collection,
          name: indexDef.name,
          critical: indexDef.critical
        });
        console.log(`   ✅ ${indexDef.collection}.${indexDef.name}`);
      } catch (error) {
        // Check if error is "index already exists" (code 85 or 86)
        if (error.code === 85 || error.code === 86 || error.message.includes('already exists')) {
          indexResults.skipped.push({
            collection: indexDef.collection,
            name: indexDef.name,
            reason: 'Already exists'
          });
          console.log(`   ⏭️  ${indexDef.collection}.${indexDef.name} (already exists)`);
        } else {
          indexResults.failed.push({
            collection: indexDef.collection,
            name: indexDef.name,
            error: error.message,
            critical: indexDef.critical
          });
          console.error(`   ❌ ${indexDef.collection}.${indexDef.name}: ${error.message}`);
        }
      }
    }

    // Verify critical indexes exist
    const criticalIndexes = indexDefinitions.filter(idx => idx.critical);
    for (const criticalIdx of criticalIndexes) {
      try {
        const indexes = await this.db.collection(criticalIdx.collection).indexes();
        const exists = indexes.some(idx => idx.name === criticalIdx.name);

        if (exists) {
          indexResults.verified.push({
            collection: criticalIdx.collection,
            name: criticalIdx.name
          });
          console.log(`   ✓ Verified: ${criticalIdx.collection}.${criticalIdx.name}`);
        } else {
          // Critical index missing after creation attempt
          if (!indexResults.failed.some(f => f.collection === criticalIdx.collection && f.name === criticalIdx.name)) {
            indexResults.failed.push({
              collection: criticalIdx.collection,
              name: criticalIdx.name,
              error: 'Index not found after creation',
              critical: true
            });
          }
          console.error(`   ✗ Missing critical index: ${criticalIdx.collection}.${criticalIdx.name}`);
        }
      } catch (error) {
        console.error(`   ⚠️ Could not verify ${criticalIdx.collection}.${criticalIdx.name}: ${error.message}`);
      }
    }

    // Report summary
    const totalIndexes = indexDefinitions.length;
    const successfulIndexes = indexResults.created.length + indexResults.skipped.length;
    const successRate = Math.round((successfulIndexes / totalIndexes) * 100);

    console.log(`✅ Index creation complete: ${successfulIndexes}/${totalIndexes} (${successRate}%)`);
    console.log(`   Created: ${indexResults.created.length}, Skipped: ${indexResults.skipped.length}, Failed: ${indexResults.failed.length}`);

    // Alert if any critical indexes failed
    if (indexResults.failed.length > 0) {
      const criticalFailures = indexResults.failed.filter(f => f.critical);
      if (criticalFailures.length > 0) {
        console.error(`⚠️ CRITICAL: ${criticalFailures.length} critical indexes failed!`);
      }
      await this.alertIndexFailure(indexResults);
    }

    return indexResults;
  }

  /**
   * Alert admins about index creation failures (PHASE 1: CRIT-005)
   * @param {Object} indexResults - Results from createIndexes()
   */
  async alertIndexFailure(indexResults) {
    try {
      if (!this.adminChannel) {
        console.warn('⚠️ Cannot send index failure alert: Admin channel not configured');
        return;
      }

      const { EmbedBuilder } = require('discord.js');
      const criticalFailures = indexResults.failed.filter(f => f.critical);
      const regularFailures = indexResults.failed.filter(f => !f.critical);

      const embed = new EmbedBuilder()
        .setColor(criticalFailures.length > 0 ? 0xFF0000 : 0xFFA500)
        .setTitle('⚠️ MongoDB Index Creation Warning')
        .setDescription(
          criticalFailures.length > 0
            ? '**CRITICAL**: Some critical indexes failed to create. Queries will be 100x slower!'
            : 'Some non-critical indexes failed. Performance may be slightly impacted.'
        )
        .addFields(
          {
            name: '✅ Successfully Created',
            value: indexResults.created.length > 0
              ? `${indexResults.created.length} indexes created successfully`
              : 'None',
            inline: true
          },
          {
            name: '⏭️ Already Existed',
            value: indexResults.skipped.length > 0
              ? `${indexResults.skipped.length} indexes already existed`
              : 'None',
            inline: true
          },
          {
            name: '✓ Verified Critical',
            value: indexResults.verified.length > 0
              ? `${indexResults.verified.length} critical indexes verified`
              : 'None',
            inline: true
          }
        );

      // Add critical failures if any
      if (criticalFailures.length > 0) {
        embed.addFields({
          name: '🔴 Critical Failures',
          value: criticalFailures
            .map(f => `• ${f.collection}.${f.name}\n  Error: ${f.error}`)
            .join('\n')
            .substring(0, 1000),
          inline: false
        });
      }

      // Add regular failures if any
      if (regularFailures.length > 0) {
        embed.addFields({
          name: '⚠️ Non-Critical Failures',
          value: regularFailures
            .map(f => `• ${f.collection}.${f.name}: ${f.error}`)
            .join('\n')
            .substring(0, 1000),
          inline: false
        });
      }

      embed.addFields({
        name: '🔧 Action Required',
        value: criticalFailures.length > 0
          ? '1. Check MongoDB Atlas dashboard for errors\n2. Verify connection and permissions\n3. Run `!mongoindexes` to retry\n4. **Queries will be very slow until fixed!**'
          : '1. Check MongoDB Atlas dashboard\n2. Run `!mongoindexes` to retry\n3. Monitor query performance',
        inline: false
      });

      embed.setTimestamp();

      await this.adminChannel.send({ embeds: [embed] });
      console.log('✅ Index failure alert sent to admin channel');
    } catch (alertError) {
      console.error('❌ Failed to send index failure alert:', alertError.message);
    }
  }

  /**
   * Get database instance
   * @returns {Db} MongoDB database instance
   */
  getDB() {
    if (!this.connected || !this.db) {
      throw new Error('❌ Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get specific collection
   * @param {string} name - Collection name
   * @returns {Collection} MongoDB collection
   */
  collection(name) {
    return this.getDB().collection(name);
  }

  /**
   * Close database connection
   * Gracefully shut down connection (e.g., during bot shutdown)
   */
  async close() {
    if (this.client) {
      try {
        await this.client.close();
        this.connected = false;
        console.log('🔌 MongoDB connection closed gracefully');
      } catch (error) {
        console.error('⚠️ Error closing MongoDB connection:', error.message);
      }
    }
  }

  /**
   * Health check - Test connection and measure latency
   * @returns {Promise<Object>} Health status and latency
   */
  async healthCheck() {
    if (!this.connected || !this.db) {
      return { healthy: false, error: 'Not connected', latency: null };
    }

    try {
      const start = Date.now();
      await this.db.admin().ping();
      const latency = Date.now() - start;

      return {
        healthy: true,
        latency: latency,
        connected: this.connected,
        database: DB_NAME
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        latency: null
      };
    }
  }

  /**
   * Get connection statistics
   * @returns {Promise<Object>} Connection and database stats
   */
  async getStats() {
    if (!this.connected || !this.db) {
      return { connected: false };
    }

    try {
      const dbStats = await this.db.stats();
      const health = await this.healthCheck();

      return {
        connected: true,
        database: DB_NAME,
        collections: dbStats.collections,
        documents: dbStats.objects,
        dataSize: `${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`,
        indexSize: `${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`,
        latency: `${health.latency}ms`,
        healthy: health.healthy
      };
    } catch (error) {
      console.error('⚠️ Error getting stats:', error.message);
      return { connected: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

const dbAPI = new DatabaseAPI();

// Export the singleton instance
module.exports = dbAPI;
