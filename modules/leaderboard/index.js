/**
 * Leaderboard System - Module Entry Point
 * Re-exports all functions from sub-modules for backward compatibility.
 */

const { SheetAPI } = require('../../utils/sheet-api');
const state = require('./state');
const { initializeLeaderboard } = require('./initialization');
const { displayAttendanceLeaderboard } = require('./attendance-leaderboard');
const { displayBiddingLeaderboard, displayCombinedLeaderboards } = require('./bidding-leaderboard');
const { sendWeeklyReport, sendMonthlyReport } = require('./reports');
const { scheduleWeeklyReport, scheduleMonthlyReport } = require('./scheduling');

module.exports = {
  init: initializeLeaderboard,
  displayAttendanceLeaderboard,
  displayBiddingLeaderboard,
  displayCombinedLeaderboards,
  sendWeeklyReport,
  scheduleWeeklyReport,
  sendMonthlyReport,
  scheduleMonthlyReport
};
