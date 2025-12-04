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
const DB_NAME = 'elysium-bot';

class DatabaseAPI {
  constructor() {
    this.client = null;
    this.db = null;
    this.connected = false;
    this.connectAttempts = 0;
    this.maxConnectAttempts = 5;
  }

  /**
   * Connect to MongoDB Atlas
   * @returns {Promise<Db>} MongoDB database instance
   */
  async connect() {
    if (this.connected && this.db) {
      console.log('✅ MongoDB already connected');
      return this.db;
    }

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
        return this.connect();
      }

      throw error;
    }
  }

  /**
   * Create database indexes for performance
   * Indexes dramatically improve query speed (100x faster!)
   */
  async createIndexes() {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    console.log('📇 Creating database indexes...');

    try {
      // ─────────────────────────────────────────────────────────────
      // ATTENDANCE COLLECTION INDEXES
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('attendance').createIndex(
        { memberId: 1, timestamp: -1 },
        { name: 'member_history' }
      );
      await this.db.collection('attendance').createIndex(
        { weekStartDate: 1 },
        { name: 'week_lookup' }
      );
      await this.db.collection('attendance').createIndex(
        { bossName: 1 },
        { name: 'boss_lookup' }
      );
      await this.db.collection('attendance').createIndex(
        { weekLabel: 1 },
        { name: 'sheet_sync' }
      );

      // ─────────────────────────────────────────────────────────────
      // MEMBERS COLLECTION INDEXES
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('members').createIndex(
        { username: 1 },
        { unique: true, name: 'username_unique' }
      );
      await this.db.collection('members').createIndex(
        { pointsAvailable: -1 },
        { name: 'points_leaderboard' }
      );
      await this.db.collection('members').createIndex(
        { 'attendance.total': -1 },
        { name: 'attendance_leaderboard' }
      );

      // ─────────────────────────────────────────────────────────────
      // AUCTION ITEMS COLLECTION INDEXES
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('auctionItems').createIndex(
        { status: 1 },
        { name: 'status_lookup' }
      );
      await this.db.collection('auctionItems').createIndex(
        { addedAt: -1 },
        { name: 'recent_items' }
      );
      await this.db.collection('auctionItems').createIndex(
        { winnerId: 1, status: 1 },
        { name: 'winner_items' }
      );

      // ─────────────────────────────────────────────────────────────
      // AUCTION SESSIONS COLLECTION INDEXES
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('auctionSessions').createIndex(
        { sessionDate: -1 },
        { name: 'recent_sessions' }
      );
      await this.db.collection('auctionSessions').createIndex(
        { sessionNumber: 1 },
        { unique: true, name: 'session_number_unique' }
      );

      // ─────────────────────────────────────────────────────────────
      // BOSS ROTATION COLLECTION INDEXES
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('bossRotation').createIndex(
        { bossName: 1 },
        { unique: true, name: 'boss_unique' }
      );
      await this.db.collection('bossRotation').createIndex(
        { currentGuild: 1 },
        { name: 'current_turn' }
      );

      // ─────────────────────────────────────────────────────────────
      // EVENT REMINDERS COLLECTION INDEXES
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('eventReminders').createIndex(
        { nextTrigger: 1, active: 1 },
        { name: 'due_reminders' }
      );
      await this.db.collection('eventReminders').createIndex(
        { eventType: 1 },
        { name: 'event_type_lookup' }
      );

      // ─────────────────────────────────────────────────────────────
      // BOSS TIMERS COLLECTION INDEXES (Phase 8)
      // ─────────────────────────────────────────────────────────────
      await this.db.collection('bossTimers').createIndex(
        { bossName: 1 },
        { unique: true, name: 'boss_timer_unique' }
      );
      await this.db.collection('bossTimers').createIndex(
        { nextSpawnTime: 1 },
        { name: 'spawn_time_lookup' }
      );

      // Bot state collection doesn't need indexes (only 3 documents, queried by _id)

      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.error('⚠️ Error creating indexes:', error.message);
      // Don't throw - indexes are optimization, not critical for functionality
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
