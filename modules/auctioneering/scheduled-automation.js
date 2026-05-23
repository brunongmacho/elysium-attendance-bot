/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║       AUCTIONEERING SCHEDULED AUTOMATION - Scheduled Automation          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Scheduled automation: startSession2, scheduleSession2AfterCompletion,
 * scheduleWeeklySundayAuction, schedulePreAuctionSync, resetSessionState.
 *
 * @module modules/auctioneering/scheduled-automation
 */

const { EmbedBuilder } = require("discord.js");
const { state } = require('./state');
const { COLORS, EMOJI, DUAL_SESSION_CONFIG } = require('./constants');

/**
 * Starts Session 2 of the scheduled auction with refreshed points.
 *
 * @param {Discord.Client} client - Discord bot client
 * @param {Object} config - Bot configuration
 * @returns {Promise<void>}
 */
async function startSession2(client, config) {
  state.logger.info(`${EMOJI.AUCTION} Starting Session 2 of scheduled auction...`);

  try {
    if (state.auctionState.active) {
      state.logger.info(`${EMOJI.WARNING} Auction already running, skipping Session 2`);
      return;
    }

    const biddingChannel = await state.discordCache.getChannel('bidding_channel_id');
    if (!biddingChannel) {
      state.logger.error(`${EMOJI.ERROR} Could not fetch bidding channel for Session 2`);
      return;
    }

    const session2Embed = new EmbedBuilder()
      .setColor(COLORS.AUCTION)
      .setTitle(`${EMOJI.AUCTION} Session 2 Starting!`)
      .setDescription(
        '**The second auction session is now starting!**\n\n' +
        '📦 Auctioning leftover items from Session 1\n' +
        '💰 Points have been refreshed\n\n' +
        '**Get ready to bid!**'
      )
      .setTimestamp();

    await biddingChannel.send({
      content: '@everyone',
      embeds: [session2Embed]
    });

    // Refresh points cache before Session 2
    state.logger.info(`${EMOJI.INFO} Refreshing points cache for Session 2...`);

    try {
      const pointsData = await state.sheetAPI.call('getBiddingPoints');
      const members = pointsData.members || pointsData.data?.members || [];
      const points = pointsData.points || pointsData.data?.points || {};

      if (members.length > 0 || Object.keys(points).length > 0) {
        const pointsMap = Object.keys(points).length > 0 ? points : members.reduce((acc, member) => {
          const name = member?.username?.trim();
          if (!name) return acc;
          acc[name] = Number(member?.pointsLeft) || 0;
          return acc;
        }, {});

        const biddingState = state.biddingModule.getBiddingState();
        biddingState.cp = new state.PointsCache(pointsMap);
        biddingState.ct = Date.now();
        state.biddingModule.saveBiddingState();

        state.logger.info(`${EMOJI.SUCCESS} Refreshed ${biddingState.cp.size()} members' points for Session 2`);
      }
    } catch (pointsErr) {
      state.logger.error(`${EMOJI.ERROR} Failed to refresh points for Session 2:`, pointsErr);
      await biddingChannel.send(`${EMOJI.WARNING} Could not refresh points cache. Session 2 will use cached points.`);
    }

    // Start Session 2
    const { startAuctioneering } = require('./session-lifecycle');
    await startAuctioneering(client, config, biddingChannel);
    state.logger.info(`${EMOJI.SUCCESS} Session 2 started successfully`);

  } catch (err) {
    state.logger.error(`${EMOJI.ERROR} Failed to start Session 2:`, err);

    try {
      const adminLogs = await state.discordCache.getChannel('admin_logs_channel_id').catch(() => null);
      if (adminLogs) {
        await adminLogs.send(
          `${EMOJI.ERROR} **Session 2 Failed**\n` +
          `Failed to start Session 2 of the scheduled auction.\n` +
          `**Error:** ${err.message}\n\n` +
          `You can manually start a new auction with \`!startauction\` if needed.`
        );
      }
    } catch (notifyErr) {
      state.logger.error(`${EMOJI.ERROR} Could not notify admin logs:`, notifyErr);
    }
  }
}

/**
 * Monitors Session 1 completion and schedules Session 2.
 */
function scheduleSession2AfterCompletion(client, config) {
  if (!DUAL_SESSION_CONFIG.enabled) {
    state.logger.info(`${EMOJI.INFO} Dual-session auctions disabled, skipping Session 2 scheduling`);
    return;
  }

  if (state.sessionPollInterval) {
    clearInterval(state.sessionPollInterval);
    state.sessionPollInterval = null;
  }

  let pollAttempts = 0;
  state.logger.info(`${EMOJI.CLOCK} Monitoring Session 1 completion for Session 2 scheduling...`);

  state.sessionPollInterval = setInterval(async () => {
    pollAttempts++;

    if (pollAttempts >= DUAL_SESSION_CONFIG.maxPollAttempts) {
      state.logger.info(`${EMOJI.WARNING} Max poll attempts reached, stopping Session 2 monitoring`);
      clearInterval(state.sessionPollInterval);
      state.sessionPollInterval = null;
      return;
    }

    if (!state.auctionState.active && state.auctionState.sessionFinalized) {
      state.logger.info(`${EMOJI.SUCCESS} Session 1 completed and finalized! Scheduling Session 2 after ${DUAL_SESSION_CONFIG.restPeriodMinutes} minute rest...`);

      clearInterval(state.sessionPollInterval);
      state.sessionPollInterval = null;

      try {
        const biddingChannel = await state.discordCache.getChannel('bidding_channel_id');
        const announcementChannel = await state.discordCache.getChannel('guild_announcement_channel_id').catch(() => null);

        const session2StartTime = Date.now() + (DUAL_SESSION_CONFIG.restPeriodMinutes * 60 * 1000);
        const session2Timestamp = Math.floor(session2StartTime / 1000);

        const restEmbed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`${EMOJI.CLOCK} Session 1 Complete - Rest Period`)
          .setDescription(
            '**Session 1 has ended!**\n\n' +
            `⏰ **Session 2 starts:** <t:${session2Timestamp}:R> (<t:${session2Timestamp}:t>)\n\n` +
            '📦 Leftover items from Session 1 will be auctioned\n' +
            '💰 Points will be refreshed before Session 2\n\n' +
            '**Take a break and come back for more bidding!**'
          )
          .setTimestamp();

        if (biddingChannel) {
          await biddingChannel.send({ embeds: [restEmbed] });
        }

        if (announcementChannel) {
          await announcementChannel.send({
            content: '@everyone',
            embeds: [restEmbed]
          });
        }
      } catch (announceErr) {
        state.logger.error(`${EMOJI.ERROR} Failed to announce rest period:`, announceErr);
      }

      const restDelayMs = DUAL_SESSION_CONFIG.restPeriodMinutes * 60 * 1000;

      if (state.session2Timer) {
        clearTimeout(state.session2Timer);
      }

      const warningDelayMs = restDelayMs - (15 * 60 * 1000);
      if (warningDelayMs > 0) {
        setTimeout(async () => {
          try {
            const announcementChannel = await state.discordCache.getChannel('guild_announcement_channel_id').catch(() => null);
            if (announcementChannel) {
              await announcementChannel.send({
                content: '@everyone',
                embeds: [
                  new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle(`${EMOJI.BELL} Session 2 Starting Soon!`)
                    .setDescription('**The second auction session starts in 15 minutes!**\n\nPrepare your points and get ready to bid on leftover items!')
                    .setTimestamp()
                ]
              });
            }
          } catch (warnErr) {
            state.logger.error(`${EMOJI.ERROR} Failed to send Session 2 warning:`, warnErr);
          }
        }, warningDelayMs);
      }

      state.session2Timer = setTimeout(async () => {
        await startSession2(client, config);
        state.session2Timer = null;
      }, restDelayMs);

      state.logger.info(`${EMOJI.SUCCESS} Session 2 scheduled to start in ${DUAL_SESSION_CONFIG.restPeriodMinutes} minutes`);
    }
  }, DUAL_SESSION_CONFIG.pollIntervalMs);
}

/**
 * Schedules automatic weekly auctions based on configuration in bidding-schedule.json.
 */
function scheduleWeeklySundayAuction(client, config) {
  if (state.weeklyAuctionTimer) {
    state.logger.info(`${EMOJI.WARNING} Weekly auction scheduler already running, skipping initialization`);
    return;
  }

  const scheduleConfig = state.biddingScheduleConfig.auction;
  const targetDay = scheduleConfig.dayOfWeek;
  const targetDayName = scheduleConfig.dayName;
  const targetHour = scheduleConfig.hour;
  const targetMinute = scheduleConfig.minute;

  state.logger.info(`${EMOJI.CLOCK} Initializing weekly ${targetDayName} auction scheduler (${targetHour}:${String(targetMinute).padStart(2, '0')} GMT+8)...`);

  const calculateNextScheduledTime = () => {
    const now = new Date();
    const GMT8_OFFSET = state.biddingScheduleConfig.timezone.offsetHours * 60 * 60 * 1000;
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);
    const targetGMT8 = new Date(nowGMT8);
    targetGMT8.setUTCHours(targetHour, targetMinute, 0, 0);

    const currentDay = targetGMT8.getUTCDay();
    let daysUntilTarget;
    if (currentDay === targetDay) {
      if (targetGMT8.getTime() > nowGMT8.getTime()) {
        daysUntilTarget = 0;
      } else {
        daysUntilTarget = 7;
      }
    } else {
      daysUntilTarget = (targetDay - currentDay + 7) % 7;
      if (daysUntilTarget === 0) daysUntilTarget = 7;
    }

    targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilTarget);
    const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);
    return targetUTC;
  };

  const scheduleNext = () => {
    const nextUTC = calculateNextScheduledTime();
    const now = new Date();
    const delay = nextUTC.getTime() - now.getTime();

    const GMT8_OFFSET = state.biddingScheduleConfig.timezone.offsetHours * 60 * 60 * 1000;
    const displayTime = new Date(nextUTC.getTime() + GMT8_OFFSET);
    const days = Math.floor(delay / 1000 / 60 / 60 / 24);
    const hours = Math.floor((delay / 1000 / 60 / 60) % 24);
    const minutes = Math.floor((delay / 1000 / 60) % 60);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[displayTime.getUTCDay()];

    state.logger.info(`${EMOJI.CLOCK} Next ${targetDayName} auction scheduled for: ${dayName}, ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${days}d ${hours}h ${minutes}m)`);

    const ANNOUNCEMENT_LEAD_TIME = state.biddingScheduleConfig.announcement.leadTimeMinutes * 60 * 1000;
    const announcementDelay = delay - ANNOUNCEMENT_LEAD_TIME;

    if (announcementDelay > 0) {
      setTimeout(async () => {
        try {
          const leadMinutes = state.biddingScheduleConfig.announcement.leadTimeMinutes;
          state.logger.info(`${EMOJI.BELL} Sending ${leadMinutes}-minute auction warning to announcement channel...`);
          const announcementChannel = await state.discordCache.getChannel('guild_announcement_channel_id').catch(() => null);

          if (announcementChannel) {
            await announcementChannel.send({
              content: '@everyone',
              embeds: [
                new EmbedBuilder()
                  .setColor(0xffa500)
                  .setTitle(`${EMOJI.AUCTION} Auction Starting Soon!`)
                  .setDescription(`The weekly auction will begin in **${leadMinutes} minutes**!`)
                  .addFields(
                    { name: '⏰ Start Time', value: '<t:' + Math.floor(nextUTC.getTime() / 1000) + ':R>', inline: true },
                    { name: '📍 Location', value: '<#' + config.bidding_channel_id + '>', inline: true }
                  )
                  .setFooter({ text: 'Prepare your points and get ready to bid!' })
                  .setTimestamp()
              ]
            });
            state.logger.info(`${EMOJI.SUCCESS} Auction announcement sent to announcement channel`);
          } else {
            state.logger.warn(`${EMOJI.WARNING} Could not fetch announcement channel for pre-auction warning`);
          }
        } catch (err) {
          state.logger.error(`${EMOJI.ERROR} Failed to send auction announcement:`, err);
        }
      }, announcementDelay);
    }

    state.weeklyAuctionTimer = setTimeout(async () => {
      state.logger.info(`${EMOJI.AUCTION} ${targetDayName} auction time! Starting auction...`);

      try {
        if (state.auctionState.active) {
          state.logger.info(`${EMOJI.WARNING} Auction already running, skipping scheduled start`);
          scheduleNext();
          return;
        }

        const biddingChannel = await state.discordCache.getChannel('bidding_channel_id');

        if (!biddingChannel) {
          state.logger.error(`${EMOJI.ERROR} Could not fetch bidding channel for scheduled auction`);
          scheduleNext();
          return;
        }

        const { startAuctioneering } = require('./session-lifecycle');
        await startAuctioneering(client, config, biddingChannel);
        state.logger.info(`${EMOJI.SUCCESS} Scheduled ${targetDayName} auction Session 1 started successfully`);

        scheduleSession2AfterCompletion(client, config);
      } catch (err) {
        state.logger.error(`${EMOJI.ERROR} Failed to start scheduled auction:`, err);

        try {
          const adminLogs = await state.discordCache.getChannel('admin_logs_channel_id').catch(() => null);

          if (adminLogs) {
            const timeStr = `${targetHour}:${String(targetMinute).padStart(2, '0')}`;
            await adminLogs.send(
              `${EMOJI.ERROR} **Scheduled Auction Failed**\n` +
              `Failed to start ${targetDayName} auction at ${timeStr} GMT+8.\n` +
              `**Error:** ${err.message}\n\n` +
              `Please check bot logs and try running \`!startauction\` manually.`
            );
          }
        } catch (notifyErr) {
          state.logger.error(`${EMOJI.ERROR} Could not notify admin logs:`, notifyErr);
        }
      }

      scheduleNext();
    }, delay);
  };

  scheduleNext();
  const timeStr = `${targetHour}:${String(targetMinute).padStart(2, '0')}`;
  state.logger.info(`${EMOJI.SUCCESS} Weekly ${targetDayName} auction scheduler initialized (${timeStr} GMT+8)`);
}

/**
 * Schedule pre-auction sync (Sheets → MongoDB) before the weekly auction.
 */
function schedulePreAuctionSync(sheetAPI, bossRotation) {
  if (state.preAuctionSyncTimer) {
    state.logger.info(`${EMOJI.WARNING} Pre-auction sync scheduler already running`);
    return;
  }

  const scheduleConfig = state.biddingScheduleConfig.auction;
  const preAuctionConfig = state.biddingScheduleConfig.preAuctionSync;
  const targetDay = scheduleConfig.dayOfWeek;
  const targetDayName = scheduleConfig.dayName;
  const auctionHour = scheduleConfig.hour;
  const auctionMinute = scheduleConfig.minute;
  const hoursBeforeAuction = preAuctionConfig.hoursBeforeAuction;

  state.logger.info(`${EMOJI.CLOCK} Initializing pre-auction sync scheduler (${hoursBeforeAuction} hour before auction)...`);

  const calculateNextSyncTime = () => {
    const now = new Date();
    const GMT8_OFFSET = state.biddingScheduleConfig.timezone.offsetHours * 60 * 60 * 1000;
    const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);
    const targetGMT8 = new Date(nowGMT8);
    const syncHour = ((auctionHour - hoursBeforeAuction) + 24) % 24;
    targetGMT8.setUTCHours(syncHour, auctionMinute, 0, 0);

    const currentDay = targetGMT8.getUTCDay();
    let daysUntilTarget;

    if (currentDay === targetDay) {
      if (targetGMT8.getTime() > nowGMT8.getTime()) {
        daysUntilTarget = 0;
      } else {
        daysUntilTarget = 7;
      }
    } else {
      daysUntilTarget = (targetDay - currentDay + 7) % 7;
      if (daysUntilTarget === 0) daysUntilTarget = 7;
    }

    targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilTarget);
    return new Date(targetGMT8.getTime() - GMT8_OFFSET);
  };

  const scheduleNext = () => {
    const nextUTC = calculateNextSyncTime();
    const now = new Date();
    const delay = nextUTC.getTime() - now.getTime();

    const GMT8_OFFSET = state.biddingScheduleConfig.timezone.offsetHours * 60 * 60 * 1000;
    const displayTime = new Date(nextUTC.getTime() + GMT8_OFFSET);
    const days = Math.floor(delay / 1000 / 60 / 60 / 24);
    const hours = Math.floor((delay / 1000 / 60 / 60) % 24);
    const minutes = Math.floor((delay / 1000 / 60) % 60);

    state.logger.info(`${EMOJI.CLOCK} Next pre-auction sync scheduled for: ${displayTime.toISOString().replace('T', ' ').substring(0, 19)} GMT+8 (in ${days}d ${hours}h ${minutes}m)`);

    state.preAuctionSyncTimer = setTimeout(async () => {
      try {
        state.logger.info(`${EMOJI.RESET} [PRE-AUCTION SYNC] Starting 1-hour pre-auction sync (Sheets → MongoDB)...`);
        const startTime = Date.now();

        const mongoHelpers = require('../../utils/mongodb-helpers');
        const dbAPI = require('../../utils/database-api');

        try {
          const pointsData = await sheetAPI.call('getBiddingPoints');
          const members = pointsData.members || pointsData.data?.members || [];

          if (members.length === 0) {
            state.logger.warn(`${EMOJI.WARNING} [PRE-AUCTION SYNC] No points data received from Sheets`);
          } else {
            const db = await dbAPI.connect();
            const membersCollection = db.collection('members');
            let syncedCount = 0;

            for (const member of members) {
              const username = member?.username?.trim();
              if (!username) continue;

              const pointsLeft = Number(member?.pointsLeft) || 0;
              const pointsLocked = Number(member?.pointsLocked) || 0;

              await membersCollection.updateOne(
                { username: username },
                {
                  $set: {
                    pointsLeft: pointsLeft,
                    pointsLocked: pointsLocked,
                    lastSyncFromSheets: new Date()
                  }
                },
                { upsert: true }
              );

              syncedCount++;
            }

            state.logger.info(`${EMOJI.SUCCESS} [PRE-AUCTION SYNC] Synced ${syncedCount} member points from Sheets → MongoDB`);
          }
        } catch (pointsError) {
          state.logger.error(`${EMOJI.ERROR} [PRE-AUCTION SYNC] Failed to sync points:`, pointsError.message);
        }

        try {
          await bossRotation.refreshRotationCache();
          state.logger.info(`${EMOJI.SUCCESS} [PRE-AUCTION SYNC] Boss rotation synced`);
        } catch (rotationError) {
          state.logger.error(`${EMOJI.ERROR} [PRE-AUCTION SYNC] Failed to sync rotation:`, rotationError.message);
        }

        const duration = Date.now() - startTime;
        state.logger.info(`${EMOJI.SUCCESS} [PRE-AUCTION SYNC] Sync complete (${duration}ms) - Ready for auction in 1 hour!`);

      } catch (error) {
        state.logger.error(`${EMOJI.ERROR} [PRE-AUCTION SYNC] Failed:`, error.message);
      }

      scheduleNext();
    }, delay);
  };

  scheduleNext();
  const syncHour = ((auctionHour - hoursBeforeAuction) + 24) % 24;
  const timeStr = `${syncHour}:${String(auctionMinute).padStart(2, '0')}`;
  state.logger.info(`${EMOJI.SUCCESS} Pre-auction sync scheduler initialized (${timeStr} GMT+8 every ${targetDayName})`);
}

/**
 * Resets session finalization state and clears Session 2 polling/timers.
 *
 * @returns {Object} Status object with what was reset
 */
function resetSessionState() {
  const status = {
    previousFinalized: state.auctionState.sessionFinalized,
    previousActive: state.auctionState.active,
    clearedPollInterval: false,
    clearedSession2Timer: false,
  };

  state.auctionState.sessionFinalized = true;
  state.auctionState.active = false;

  if (state.sessionPollInterval) {
    clearInterval(state.sessionPollInterval);
    state.sessionPollInterval = null;
    status.clearedPollInterval = true;
  }

  if (state.session2Timer) {
    clearTimeout(state.session2Timer);
    state.session2Timer = null;
    status.clearedSession2Timer = true;
  }

  state.logger.info(`${EMOJI.SUCCESS} Session state reset:`, status);
  return status;
}

module.exports = {
  startSession2,
  scheduleSession2AfterCompletion,
  scheduleWeeklySundayAuction,
  schedulePreAuctionSync,
  resetSessionState,
};
