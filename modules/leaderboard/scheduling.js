/**
 * Report scheduling: weekly and monthly report timers.
 */

const shutdownManager = require('../../utils/shutdown-manager');
const state = require('./state');
const { sendWeeklyReport, sendMonthlyReport } = require('./reports');

// ============================================================================
// WEEKLY REPORT SCHEDULER
// ============================================================================

/**
 * Schedules weekly reports for every Monday at 2:59am GMT+8
 */
function scheduleWeeklyReport() {
  // DUPLICATE PREVENTION
  if (state.weeklyReportTimer) {
    console.log('⚠️ Weekly report scheduler already running, skipping initialization');
    return;
  }

  const calculateNextMonday259AM = () => {
    const now = new Date();
    const GMT8_OFFSET = 8 * 60 * 60 * 1000;
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);
    const currentDay = nowGMT8.getUTCDay();

    let daysUntilMonday = (1 - currentDay + 7) % 7;

    if (daysUntilMonday === 0 && (nowGMT8.getUTCHours() > 2 || (nowGMT8.getUTCHours() === 2 && nowGMT8.getUTCMinutes() >= 59))) {
      daysUntilMonday = 7;
    }

    const targetGMT8 = new Date(nowGMT8);
    targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilMonday);
    targetGMT8.setUTCHours(2, 59, 0, 0);

    const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);

    return targetUTC;
  };

  const scheduleNext = () => {
    const nextMondayUTC = calculateNextMonday259AM();
    const now = new Date();
    const delay = nextMondayUTC.getTime() - now.getTime();

    const displayTime = new Date(nextMondayUTC.getTime() + 8 * 60 * 60 * 1000);
    const hours = Math.floor(delay / 1000 / 60 / 60);

    state.logger.info(`📅 Next weekly report scheduled for: ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${hours} hours)`);

    if (state.crashRecovery) {
      state.crashRecovery.saveLeaderboardReportSchedule(nextMondayUTC).catch(err => {
        state.logger.error('⚠️ Failed to save report schedule to crash recovery:', err.message);
      });
    }

    state.weeklyReportTimer = setTimeout(async () => {
      await sendWeeklyReport();
      scheduleNext();
    }, delay);

    shutdownManager.registerTimeout('weekly-report-timer', state.weeklyReportTimer, { nextReport: displayTime.toISOString() });
  };

  scheduleNext();
  state.logger.info('✅ Weekly report scheduler initialized (Monday 2:59am GMT+8)');
}

// ============================================================================
// MONTHLY REPORT SCHEDULER
// ============================================================================

/**
 * Schedules monthly reports for the LAST day of each month at 11:59pm GMT+8.
 */
function scheduleMonthlyReport() {
  if (state.monthlyReportTimer) {
    console.log('⚠️ Monthly report scheduler already running, skipping initialization');
    return;
  }

  const MAX_TIMEOUT_DELAY = 24 * 24 * 60 * 60 * 1000;

  const calculateNextLastDayOfMonth1159PM = () => {
    const now = new Date();
    const GMT8_OFFSET = 8 * 60 * 60 * 1000;
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

    const currentDate = nowGMT8.getUTCDate();
    const currentMonth = nowGMT8.getUTCMonth();
    const currentYear = nowGMT8.getUTCFullYear();

    const nextMonth = (currentMonth + 1) % 12;
    const nextMonthYear = nextMonth === 0 ? currentYear + 1 : currentYear;
    const firstDayOfNextMonth = new Date(Date.UTC(nextMonthYear, nextMonth, 1, 0, 0, 0, 0));
    const lastDayOfCurrentMonth = new Date(firstDayOfNextMonth.getTime() - (24 * 60 * 60 * 1000));
    const lastDateOfMonth = lastDayOfCurrentMonth.getUTCDate();

    let targetMonth, targetYear, targetDay;

    if (currentDate === lastDateOfMonth && (nowGMT8.getUTCHours() > 23 || (nowGMT8.getUTCHours() === 23 && nowGMT8.getUTCMinutes() >= 59))) {
      targetMonth = nextMonth;
      targetYear = nextMonthYear;
      const monthAfterNext = (nextMonth + 1) % 12;
      const monthAfterNextYear = monthAfterNext === 0 ? nextMonthYear + 1 : nextMonthYear;
      const firstDayOfMonthAfterNext = new Date(Date.UTC(monthAfterNextYear, monthAfterNext, 1, 0, 0, 0, 0));
      const lastDayOfNextMonth = new Date(firstDayOfMonthAfterNext.getTime() - (24 * 60 * 60 * 1000));
      targetDay = lastDayOfNextMonth.getUTCDate();
    } else {
      targetMonth = currentMonth;
      targetYear = currentYear;
      targetDay = lastDateOfMonth;
    }

    const targetGMT8 = new Date(Date.UTC(targetYear, targetMonth, targetDay, 23, 59, 0, 0));
    const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);

    return targetUTC;
  };

  const scheduleNext = () => {
    const nextLastDayUTC = calculateNextLastDayOfMonth1159PM();
    const now = new Date();
    const totalDelay = nextLastDayUTC.getTime() - now.getTime();

    const displayTime = new Date(nextLastDayUTC.getTime() + 8 * 60 * 60 * 1000);
    const hours = Math.floor(totalDelay / 1000 / 60 / 60);
    const days = Math.floor(hours / 24);

    console.log(`📅 Next monthly report scheduled for: ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${days} days, ${hours} hours)`);

    const scheduleWithOverflowProtection = (remainingDelay) => {
      if (remainingDelay <= 0) {
        console.log('📅 Monthly report time reached, generating report...');
        sendMonthlyReport().then(() => {
          scheduleNext();
        }).catch(err => {
          console.error('❌ Error sending monthly report:', err);
          scheduleNext();
        });
        return;
      }

      if (remainingDelay > MAX_TIMEOUT_DELAY) {
        const intermediateDays = Math.floor(MAX_TIMEOUT_DELAY / (24 * 60 * 60 * 1000));
        state.logger.info(`⏳ Delay exceeds safe limit (${days} days). Scheduling intermediate checkpoint in ${intermediateDays} days...`);

        state.monthlyReportTimer = setTimeout(() => {
          state.logger.info(`✅ Intermediate checkpoint reached. Recalculating remaining delay...`);
          const newNow = new Date();
          const newRemainingDelay = nextLastDayUTC.getTime() - newNow.getTime();
          scheduleWithOverflowProtection(newRemainingDelay);
        }, MAX_TIMEOUT_DELAY);

        shutdownManager.registerTimeout('monthly-report-timer', state.monthlyReportTimer, { type: 'intermediate-checkpoint' });
      } else {
        state.monthlyReportTimer = setTimeout(async () => {
          state.logger.info('📅 Monthly report time reached, generating report...');
          await sendMonthlyReport();
          scheduleNext();
        }, remainingDelay);

        shutdownManager.registerTimeout('monthly-report-timer', state.monthlyReportTimer, { type: 'final', nextReport: nextLastDayUTC.toISOString() });
      }
    };

    scheduleWithOverflowProtection(totalDelay);
  };

  scheduleNext();
  state.logger.info('✅ Monthly report scheduler initialized (last day of month 11:59pm GMT+8)');
}

module.exports = {
  scheduleWeeklyReport,
  scheduleMonthlyReport
};
