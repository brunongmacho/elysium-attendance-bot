/**
 * Auto-close scheduler - prevents cheating by closing threads after 30 minutes.
 */

const { normalizeTimestamp } = require('../../utils/common');
const { checkColumnExists, postToSheet } = require('./sheets');
const { cleanupAllThreadReactions } = require('./reactions');
const bossRotation = require('../../boss-rotation.js');
const errorHandler = require('../../utils/error-handler');
const mongoHelpers = require('../../utils/mongodb-helpers');
const discordIdMapper = require('../../utils/discord-id-mapper');
const { clientCache } = require('../../utils/sheet-api');
const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-CLOSE SCHEDULER (PREVENTS CHEATING)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Auto-closes boss threads that are older than 30 minutes to prevent cheating.
 *
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<Object>} Statistics about closed threads
 */
async function checkAndAutoCloseThreads(client) {
  if (!client || !state.config) return { checked: 0, closed: 0, closedBosses: [] };

  const now = Date.now();
  const autoCloseThreshold = state.TIMING.THREAD_AUTO_CLOSE_MINUTES * 60 * 1000;

  let checked = 0;
  let closed = 0;
  const closedBosses = [];

  try {
    const guild = await client.guilds.fetch(state.config.main_guild_id).catch(() => null);
    if (!guild) return { checked, closed, closedBosses };

    // Check each active spawn for age
    for (const [threadId, spawnInfo] of Object.entries(state.stateManager.activeSpawns)) {
      checked++;

      // Skip protected threads that should never be auto-closed
      if (state.config.protected_thread_ids && state.config.protected_thread_ids.includes(threadId)) {
        console.log(`⏭️ Skipping auto-close for protected thread: ${spawnInfo.boss || 'Unknown'}`);
        continue;
      }

      // Skip if already closed, no creation timestamp, or exempt from autoclose (maintenance)
      if (spawnInfo.closed || !spawnInfo.createdAt || spawnInfo.noAutoClose) continue;

      const threadAge = now - spawnInfo.createdAt;

      // Check if thread is older than 30 minutes
      if (threadAge >= autoCloseThreshold) {
        console.log(`\n⏰ AUTO-CLOSING thread: ${spawnInfo.boss} (${spawnInfo.timestamp})`);
        console.log(`   Thread age: ${Math.floor(threadAge / 60000)} minutes`);

        // Get the thread
        const thread = await guild.channels.fetch(threadId).catch(() => null);
        if (!thread) {
          console.log(`   ⚠️ Thread not found, cleaning up state`);
          delete state.stateManager.activeSpawns[threadId];
          const cleanupKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete state.stateManager.activeColumns[cleanupKey];
          continue;
        }

        // AUTO-VERIFY all pending check-ins for this thread
        console.log(`   🔍 Checking pending verifications for thread ${threadId}`);
        console.log(`   📊 Already verified members BEFORE auto-verification: ${spawnInfo.members.length}`);
        if (spawnInfo.members.length > 0) {
          console.log(`      ├─ Already verified: ${spawnInfo.members.join(', ')}`);
        }
        console.log(`   📋 Total pending verifications in system: ${Object.keys(state.stateManager.pendingVerifications).length}`);

        // RE-CHECK: Verify this thread wasn't closed by manual close while we were processing
        const liveSpawnInfo = state.stateManager.activeSpawns[threadId];
        if (!liveSpawnInfo || liveSpawnInfo.closed) {
          console.log(`   ⚠️ Thread was closed by another process (manual close). Skipping auto-close submission.`);
          closed++;
          closedBosses.push(spawnInfo.boss);
          continue;
        }

        const pendingInThread = Object.entries(state.stateManager.pendingVerifications).filter(
          ([msgId, p]) => p.threadId === threadId
        );

        console.log(`   📋 Pending for this thread: ${pendingInThread.length}`);
        if (pendingInThread.length > 0) {
          console.log(`   ✅ Auto-verifying ${pendingInThread.length} pending member(s)`);

          for (const [msgId, pending] of pendingInThread) {
            // Check for duplicates before adding (normalized username comparison)
            const isDuplicate = spawnInfo.members.some(
              (m) => normalizeUsername(m) === normalizeUsername(pending.author)
            );

            if (!isDuplicate) {
              spawnInfo.members.push(pending.author);
              // Store Discord ID for reliable MongoDB lookup
              if (!spawnInfo.memberIds) spawnInfo.memberIds = {};
              spawnInfo.memberIds[pending.author] = pending.authorId;
              console.log(`      ├─ ✅ ${pending.author}`);
            } else {
              console.log(`      ├─ ⚠️ ${pending.author} (duplicate, skipped)`);
            }

            // Remove from pending
            delete state.stateManager.pendingVerifications[msgId];
          }
          console.log(`   📊 Total verified members AFTER auto-verification: ${spawnInfo.members.length}`);
        } else {
          console.log(`   ℹ️ No pending verifications to auto-verify`);
        }

        console.log(`   📊 Final member count for submission: ${spawnInfo.members.length}`);
        if (spawnInfo.members.length > 0) {
          console.log(`      ├─ Members to submit: ${spawnInfo.members.join(', ')}`);
        }

        // Mark as closed in live state to prevent other processes from submitting
        spawnInfo.closed = true;

        // Remove from stateManager.activeColumns cache BEFORE checking Google Sheets
        const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
        delete state.stateManager.activeColumns[cacheKey];

        // Check if there are any members FIRST (before making API calls)
        if (spawnInfo.members.length === 0) {
          console.log(`   ⚠️ No members to submit (0 verified). Skipping Google Sheets check and submission...`);

          await thread.send(
            `⏰ **AUTO-CLOSED (${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes elapsed)**\n\n` +
            `Attendance window closed. No members verified - no data submitted to Google Sheets.`
          ).catch(err => console.log(`   ⚠️ Could not send notification: ${err.message}`));

          // Even with 0 members, increment boss rotation
          await bossRotation.handleBossKill(spawnInfo.boss, spawnInfo.timestamp);

          // Clean up reactions
          await cleanupAllThreadReactions(thread);

          // Close confirmation thread if it exists
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await errorHandler.safeSend(confirmThread,
                `⏰ **AUTO-CLOSED**: ${spawnInfo.boss} (${spawnInfo.timestamp})\n` +
                `0 members (no submission - thread closed without data)`,
                'auto-close no members confirm notification'
              );
              await errorHandler.safeDelete(confirmThread, 'delete confirm thread no members');
            }
          }

          // Lock and archive the thread
          await thread.setLocked(true, `Auto-locked after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes - no members`).catch(err => errorHandler.silentError(err, 'lock thread no members'));
          await thread.setArchived(true, `Auto-closed after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes - no members`).catch(err => errorHandler.silentError(err, 'archive thread no members'));

          // Delete rotation warning message (prevent channel flooding)
          await bossRotation.deleteRotationWarning(spawnInfo.boss);

          // Check if this was the last boss in daily schedule and delete if so
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          // Clean up state
          delete state.stateManager.activeSpawns[threadId];
          const noMembersKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete state.stateManager.activeColumns[noMembersKey];
          delete state.stateManager.confirmationMessages[threadId];

          closed++;
          closedBosses.push(spawnInfo.boss);

          console.log(`   ✅ Auto-close complete (no members): ${spawnInfo.boss}`);
          continue;
        }

        // Members exist - check if column already exists to prevent duplicate submissions
        console.log(`   🔍 Checking if column already exists for ${spawnInfo.boss} at ${spawnInfo.timestamp}...`);
        const columnExists = await checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

        if (columnExists) {
          // Column already exists - skip submission but still clean up thread
          console.log(`   ⚠️ Column already exists for ${spawnInfo.boss} at ${spawnInfo.timestamp}, skipping submission`);

          await errorHandler.safeSend(thread,
            `⏰ **AUTO-CLOSED (${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes elapsed)**\n\n` +
            `Attendance already submitted for this spawn.\n` +
            `Thread will be archived now.`,
            'auto-close duplicate notification'
          );

          // Clean up reactions
          await cleanupAllThreadReactions(thread);

          // Close confirmation thread if it exists
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await errorHandler.safeSend(confirmThread,
                `⏰ **AUTO-CLOSED**: ${spawnInfo.boss} (${spawnInfo.timestamp})\n` +
                `Attendance already submitted (duplicate prevented)`,
                'auto-close duplicate confirm notification'
              );
              await errorHandler.safeDelete(confirmThread, 'delete confirm thread duplicate');
            }
          }

          // Lock and archive the thread to prevent spam
          await thread.setLocked(true, "Auto-locked - duplicate prevented").catch(err => errorHandler.silentError(err, 'lock thread duplicate'));
          await thread.setArchived(true, `Auto-closed after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes - duplicate prevented`).catch(err => errorHandler.silentError(err, 'archive thread duplicate'));

          // Delete rotation warning message (prevent channel flooding)
          await bossRotation.deleteRotationWarning(spawnInfo.boss);

          // Check if this was the last boss in daily schedule and delete if so
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          // Clean up state
          delete state.stateManager.activeSpawns[threadId];
          const dupKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
          delete state.stateManager.activeColumns[dupKey];
          delete state.stateManager.confirmationMessages[threadId];

          closed++;
          closedBosses.push(spawnInfo.boss);

          console.log(`   ✅ Auto-close complete (duplicate prevented): ${spawnInfo.boss}`);
        } else {
          // Column doesn't exist and members exist - proceed with submission
          console.log(`   ✅ No existing column found, proceeding with submission`);

          // Notify in thread
          await thread.send(
            `⏰ **AUTO-CLOSED (${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes elapsed)**\n\n` +
            `Attendance window closed to prevent cheating.\n` +
            `${spawnInfo.members.length} member(s) verified and submitting to Google Sheets...`
          ).catch(err => console.log(`   ⚠️ Could not send notification: ${err.message}`));

          // Validate data before submission
          if (!spawnInfo.boss || !spawnInfo.timestamp || !spawnInfo.members || spawnInfo.members.length === 0) {
            console.error(`   ❌ Invalid spawn data - skipping submission:`, {
              boss: spawnInfo.boss || 'MISSING',
              timestamp: spawnInfo.timestamp || 'MISSING',
              membersCount: spawnInfo.members ? spawnInfo.members.length : 'MISSING'
            });

            await errorHandler.safeSend(thread,
              `⚠️ **Error**: Cannot submit attendance due to missing data. Please contact an admin.`,
              'auto-close invalid data notification'
            );

            // Clean up and skip
            delete state.stateManager.activeSpawns[threadId];
            const errorKey = `${(spawnInfo.boss || '').toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp || '')}`;
            delete state.stateManager.activeColumns[errorKey];
            continue;
          }

          // ═════════════════════════════════════════════════════════════════
          // MONGODB-FIRST PATH (Phase 4)
          // ═════════════════════════════════════════════════════════════════
          console.log(`📊 AUTO-CLOSE: Submitting ${spawnInfo.members.length} members for ${spawnInfo.boss} (${spawnInfo.timestamp})`);
          console.log(`   ├─ Members: ${spawnInfo.members.join(', ')}`);

          let submitted = false;
          let submissionSource = 'Unknown';

          // ═════════════════════════════════════════════════════════════════
          // PARALLEL SAVE: MongoDB + Google Sheets (SIMULTANEOUS)
          // ═════════════════════════════════════════════════════════════════
          if (state.USE_MONGODB_ATTENDANCE) {
            const startTime = Date.now();

            // Prepare MongoDB save promise
            const mongoSavePromise = (async () => {
              try {
                for (const memberName of spawnInfo.members) {
                  const discordId = spawnInfo.memberIds?.[memberName];

                  // Ensure Discord ID is mapped to nickname in MongoDB
                  if (discordId) {
                    try {
                      await discordIdMapper.ensureMemberExists({
                        id: discordId,
                        username: memberName,
                        nickname: memberName
                      });
                    } catch (mapErr) {
                      console.error(`   ⚠️ Failed to map Discord ID for ${memberName}:`, mapErr.message);
                    }
                  }

                  await mongoHelpers.addAttendance({
                    username: memberName,
                    discordId: discordId,
                    boss: spawnInfo.boss,
                    timestamp: spawnInfo.timestamp,
                    date: spawnInfo.date,
                    time: spawnInfo.time,
                    points: state.bossPoints[spawnInfo.boss]?.points || 1
                  });
                }
                return { success: true, source: 'MongoDB' };
              } catch (error) {
                console.error(`   ❌ [MongoDB] Failed to submit attendance:`, error.message);
                return { success: false, source: 'MongoDB', error };
              }
            })();

            // Prepare Google Sheets save promise
            const sheetSavePromise = (async () => {
              try {
                const payload = {
                  action: "submitAttendance",
                  boss: spawnInfo.boss,
                  date: spawnInfo.date,
                  time: spawnInfo.time,
                  timestamp: spawnInfo.timestamp,
                  members: spawnInfo.members,
                };

                const resp = await postToSheet(payload);

                if (resp.ok) {
                  return { success: true, source: 'Google Sheets' };
                } else {
                  return { success: false, source: 'Google Sheets', error: resp.text || resp.err };
                }
              } catch (error) {
                console.error(`   ❌ [Sheets] Failed to submit attendance:`, error.message);
                return { success: false, source: 'Google Sheets', error };
              }
            })();

            // Execute both saves in parallel
            const [mongoResult, sheetResult] = await Promise.all([
              mongoSavePromise,
              sheetSavePromise
            ]);

            const duration = Date.now() - startTime;

            // Log results
            if (mongoResult.success) {
              console.log(`   ✅ [MongoDB] Submitted ${spawnInfo.members.length} attendance records`);
            }
            if (sheetResult.success) {
              console.log(`   ✅ [Sheets] Submitted ${spawnInfo.members.length} attendance records`);
            }

            console.log(`   ⚡ Total parallel save time: ${duration}ms`);

            // Consider successful if at least one succeeded
            if (mongoResult.success || sheetResult.success) {
              submitted = true;
              submissionSource = [
                mongoResult.success ? 'MongoDB' : null,
                sheetResult.success ? 'Sheets' : null
              ].filter(Boolean).join(' + ');
            } else {
              console.error(`   ❌ Both MongoDB and Sheets failed!`);
            }

          } else {
            // ═════════════════════════════════════════════════════════════════
            // SHEETS ONLY PATH (when MongoDB disabled)
            // ═════════════════════════════════════════════════════════════════
            const payload = {
              action: "submitAttendance",
              boss: spawnInfo.boss,
              date: spawnInfo.date,
              time: spawnInfo.time,
              timestamp: spawnInfo.timestamp,
              members: spawnInfo.members,
            };

            const resp = await postToSheet(payload);

            if (resp.ok) {
              console.log(`   ✅ Submitted ${spawnInfo.members.length} members to Google Sheets`);
              submitted = true;
              submissionSource = 'Google Sheets';
            } else {
              console.log(`   ❌ Failed to submit attendance: ${resp.text || resp.err}`);
            }
          }

          if (submitted) {
            console.log(`   📊 Submission source: ${submissionSource}`);

            // Sync member registry to Google Sheets (fire-and-forget)
            if (spawnInfo.members.length > 0) {
              const registryMembers = spawnInfo.members
                .map(name => ({
                  discordId: spawnInfo.memberIds?.[name],
                  nickname: name
                }))
                .filter(m => m.discordId);

              if (registryMembers.length > 0) {
                postToSheet({
                  action: "syncMemberRegistry",
                  members: registryMembers
                }).catch(err => console.warn(`⚠️ Member registry sync failed:`, err.message));
              }
            }

            // Invalidate client-side cache (attendance data changed)
            clientCache.invalidate('getAllWeeklyAttendance:{}');
            console.log(`🧹 Invalidated client cache (new attendance submitted)`);

            // Auto-increment boss rotation and auto-schedule next spawn
            await bossRotation.handleBossKill(spawnInfo.boss, spawnInfo.timestamp);

            await errorHandler.safeSend(thread,
              `✅ Attendance submitted! (${spawnInfo.members.length} members)\n` +
              `Thread will be archived now.`,
              'auto-close success notification'
            );

            // Clean up reactions
            await cleanupAllThreadReactions(thread);

            // Close confirmation thread if it exists
            if (spawnInfo.confirmThreadId) {
              const confirmThread = await guild.channels
                .fetch(spawnInfo.confirmThreadId)
                .catch(() => null);
              if (confirmThread) {
                await errorHandler.safeSend(confirmThread,
                  `⏰ **AUTO-CLOSED**: ${spawnInfo.boss} (${spawnInfo.timestamp})\n` +
                  `${spawnInfo.members.length} members submitted after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES}-minute window`,
                  'auto-close success confirm notification'
                );
                await errorHandler.safeDelete(confirmThread, 'delete confirm thread success');
              }
            }

            // Lock and archive the thread to prevent spam
            await thread.setLocked(true, `Auto-locked after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes`).catch(err => errorHandler.silentError(err, 'lock thread success'));
            await thread.setArchived(true, `Auto-closed after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes`).catch(err => errorHandler.silentError(err, 'archive thread success'));

            // Delete rotation warning message (prevent channel flooding)
            await bossRotation.deleteRotationWarning(spawnInfo.boss);

            // Check if this was the last boss in daily schedule and delete if so
            await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

            // Clean up state
            delete state.stateManager.activeSpawns[threadId];
            const successKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
            delete state.stateManager.activeColumns[successKey];
            delete state.stateManager.confirmationMessages[threadId];

            closed++;
            closedBosses.push(spawnInfo.boss);

            console.log(`   ✅ Auto-close complete: ${spawnInfo.boss}`);
          } else {
            console.log(`   ❌ Failed to submit attendance to both MongoDB and Google Sheets`);

            await errorHandler.safeSend(thread,
              `⚠️ **AUTO-CLOSE FAILED**\n\n` +
              `Could not submit attendance records.\n\n` +
              `**Members (${spawnInfo.members.length}):** ${spawnInfo.members.join(", ")}\n\n` +
              `Please manually update the records.`,
              'auto-close failure notification'
            );

            // Don't delete state if submission failed, so admin can retry
          }
        } // End of columnExists check
      }
    }

    if (closed > 0) {
      console.log(`\n⏰ Auto-close summary: ${closed} thread(s) closed`);
    }

    return { checked, closed, closedBosses };
  } catch (err) {
    console.error("❌ Error in auto-close checker:", err);
    return { checked, closed, closedBosses };
  }
}

/**
 * Starts the periodic thread age checker that auto-closes threads after 30 minutes.
 *
 * @param {Client} client - Discord.js client instance
 * @returns {NodeJS.Timer} The interval timer (for stopping if needed)
 */
function startAutoCloseScheduler(client) {
  console.log(`✅ Started auto-close scheduler (checks every ${state.TIMING.THREAD_AGE_CHECK_INTERVAL / 1000}s, closes after ${state.TIMING.THREAD_AUTO_CLOSE_MINUTES} minutes)`);

  const timer = setInterval(async () => {
    try {
      await checkAndAutoCloseThreads(client);
    } catch (error) {
      console.error("❌ Error in auto-close scheduler:", error.message);
    }
  }, state.TIMING.THREAD_AGE_CHECK_INTERVAL);

  return timer;
}

/**
 * Normalizes a username for comparison (case-insensitive, trimmed).
 * @param {string} username - Username to normalize
 * @returns {string} Normalized username
 */
function normalizeUsername(username) {
  return (username || '').trim().toLowerCase();
}

module.exports = { checkAndAutoCloseThreads, startAutoCloseScheduler };
