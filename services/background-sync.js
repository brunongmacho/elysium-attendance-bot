/**
 * ============================================================================
 * BACKGROUND MONGODB → SHEETS SYNC SERVICE
 * ============================================================================
 *
 * PURPOSE:
 * Periodically syncs MongoDB data back to Google Sheets (5-minute interval)
 * Ensures Sheets remain up-to-date for manual viewing/editing
 *
 * FEATURES:
 * - 5-minute sync interval (configurable)
 * - ALL syncs run in PARALLEL for performance
 * - Non-blocking (failures don't crash bot)
 * - Syncs: attendance, points, rotation
 * - Logs sync results and duration
 *
 * SYNC OPERATIONS:
 * 1. Attendance (last 7 days) → Weekly sheets
 * 2. Member points → BiddingPoints sheet
 * 3. Boss rotation → BossRotation sheet
 *
 * All operations run in parallel using Promise.all()
 *
 * @module background-sync
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const dbAPI = require('../utils/database-api');
const mongoHelpers = require('../utils/mongodb-helpers');

// ============================================================================
// BACKGROUND SYNC CLASS
// ============================================================================

class BackgroundSync {
  constructor(config, sheetAPI) {
    this.config = config;
    this.sheetAPI = sheetAPI;
    this.syncInterval = 15 * 60 * 1000; // 15 minutes in milliseconds (optimized for memory)
    this.timer = null;
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncCount = 0;
  }

  /**
   * Start background sync service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Background sync already running');
      return;
    }

    console.log('✅ Background sync service started (interval: 15 minutes)');
    this.isRunning = true;

    // Wait for first interval before running (don't run immediately to reduce startup memory pressure)
    this.timer = setInterval(() => {
      this.runSync();
    }, this.syncInterval);
  }

  /**
   * Main sync function - runs ALL syncs in PARALLEL
   */
  async runSync() {
    const startTime = Date.now();
    this.syncCount++;

    console.log(`🔄 [Sync #${this.syncCount}] Starting background MongoDB → Sheets sync...`);

    try {
      // Run syncs in parallel (bidding/auction removed - now Sheets-only)
      const [attendanceResult, rotationResult] = await Promise.all([
        this.syncAttendanceToSheets().catch(err => ({ error: err.message, synced: 0 })),
        this.syncRotationToSheets().catch(err => ({ error: err.message, synced: 0 }))
      ]);

      const duration = Date.now() - startTime;
      this.lastSyncTime = new Date();

      console.log(`✅ [Sync #${this.syncCount}] Background sync completed in ${duration}ms`);
      console.log(`   📊 Attendance: ${attendanceResult.synced} records ${attendanceResult.error ? `(⚠️ ${attendanceResult.error})` : ''}`);
      console.log(`   🔄 Rotation: ${rotationResult.synced} bosses ${rotationResult.error ? `(⚠️ ${rotationResult.error})` : ''}`);

      // Force garbage collection to reduce memory pressure
      if (global.gc) {
        global.gc();
      }

    } catch (error) {
      console.error('❌ [Background Sync] Critical error:', error.message);
      // Non-critical - will retry in 15 minutes
    }
  }

  /**
   * Sync recent attendance records to weekly sheets
   * Only syncs last 7 days to avoid overload
   */
  async syncAttendanceToSheets() {
    const db = await dbAPI.connect();

    // Get attendance from last 7 days (recent changes only)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentAttendance = await db.collection('attendance')
      .find({ timestamp: { $gte: sevenDaysAgo } })
      .sort({ timestamp: -1 })
      .toArray();

    if (recentAttendance.length === 0) {
      return { synced: 0 };
    }

    // Group by week for batch updates
    const byWeek = {};
    recentAttendance.forEach(record => {
      const week = record.weekLabel || this.getWeekLabel(record.timestamp);
      if (!byWeek[week]) byWeek[week] = [];
      byWeek[week].push({
        memberName: record.memberName,
        bossName: record.bossName,
        timestamp: record.timestamp,
        points: record.bossPoints || 1
      });
    });

    // Sync each week IN PARALLEL
    const syncPromises = Object.entries(byWeek).map(([week, records]) =>
      this.sheetAPI.call('syncWeeklyAttendance', { week, records })
        .catch(err => {
          console.error(`⚠️ Failed to sync week ${week}:`, err.message);
          return { success: false };
        })
    );

    await Promise.all(syncPromises);

    return { synced: recentAttendance.length };
  }

  /**
   * Sync member points to BiddingPoints sheet
   */
  async syncPointsToSheets() {
    const members = await mongoHelpers.getAllMembers({ isActive: true });

    if (members.length === 0) {
      return { synced: 0 };
    }

    // Prepare batch update data
    const pointsData = members.map(m => ({
      username: m.username,
      pointsLeft: m.pointsAvailable || 0,
      pointsConsumed: m.pointsSpent || 0
    }));

    // Single batch update to Sheets
    await this.sheetAPI.call('updateBiddingPoints', { members: pointsData });

    return { synced: members.length };
  }

  /**
   * Sync boss rotation to BossRotation sheet
   */
  async syncRotationToSheets() {
    const db = await dbAPI.connect();
    const rotations = await db.collection('bossRotation').find({}).toArray();

    if (rotations.length === 0) {
      return { synced: 0 };
    }

    // Prepare batch update data
    const rotationData = rotations.map(r => ({
      boss: r.bossName,
      index: r.currentIndex,
      guild: r.currentGuild,
      isOurTurn: r.isOurTurn
    }));

    // Single batch update to Sheets
    await this.sheetAPI.call('updateBossRotation', { rotations: rotationData });

    return { synced: rotations.length };
  }

  /**
   * Get week label from timestamp
   */
  getWeekLabel(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const weekNum = this.getWeekNumber(date);
    return `ELYSIUM_WEEK_${year}_${weekNum}`;
  }

  /**
   * Get ISO week number
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      intervalMinutes: this.syncInterval / (60 * 1000)
    };
  }

  /**
   * Stop background sync
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('⏸️ Background sync service stopped');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = BackgroundSync;
