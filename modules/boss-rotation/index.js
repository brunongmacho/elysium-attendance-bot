/**
 * Boss Rotation System - Module Entry Point
 * Re-exports all functions from sub-modules for backward compatibility.
 */

const { initialize } = require('./initialization');
const {
  getRotationStatus,
  refreshRotationCache,
  incrementRotation,
  setRotation,
  deleteRotationWarning,
  postDailyRotationSchedule,
  deleteDailySchedule,
  restoreDailyScheduleFromMongoDB,
  cleanupOldSchedules,
  checkAndDeleteDailySchedule,
  handleBossKill,
  isRotatingBoss,
  getRotatingBosses,
  getAllRotations
} = require('./schedule-bosses');

const { startSpawnMonitor, checkUpcomingSpawns } = require('./spawn-monitor');

module.exports = {
  initialize,
  getRotationStatus,
  refreshRotationCache,
  incrementRotation,
  setRotation,
  deleteRotationWarning,
  handleBossKill,
  isRotatingBoss,
  getRotatingBosses,
  getAllRotations,
  checkAndDeleteDailySchedule,
  // Additional exports for internal use
  postDailyRotationSchedule,
  deleteDailySchedule,
  restoreDailyScheduleFromMongoDB,
  cleanupOldSchedules,
  startSpawnMonitor,
  checkUpcomingSpawns
};
