/**
 * =========================================================================
 * MESSAGE CREATE EVENT HANDLER
 * =========================================================================
 *
 * Main message processing pipeline. Handles:
 *
 * 1. Bidding Channel Protection:
 *    - Deletes non-admin messages (except valid member commands)
 *    - Preserves bot and admin messages
 *    - Keeps channel clean for auction announcements
 *
 * 2. Command Routing:
 *    - Resolves aliases (!b -> !bid, !st -> !status)
 *    - Checks permissions (admin vs member commands)
 *    - Routes to appropriate handler in commandHandlers
 *    - Delegates to specialized modules (attendance, bidding, auctioneering)
 *
 * 3. Spawn Thread Management:
 *    - Handles member check-ins in attendance threads
 *    - Manages thread closure (close)
 *
 * 4. Auction Thread Handling:
 *    - Processes !bid commands in auction threads
 *    - Validates bid amounts and user points
 *    - Creates confirmation dialogs
 *
 * Flow:
 * Message -> Channel Check -> Permission Check -> Command Routing -> Handler Execution
 *
 * @module message-handler
 */

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require("discord.js");
const { normalizeUsername, normalizeTimestamp } = require('../utils/common');
const { resolveCommandAlias } = require('../config/command-aliases');
const { createLogger } = require('../utils/logger');
const logger = createLogger('message-handler');

/**
 * Creates the MessageCreate event handler
 * @param {Client} client - Discord Client
 * @param {Object} config - Bot configuration
 * @param {Object} deps - All module dependencies
 * @param {Object} deps.stateManager - Global state manager
 * @param {Object} deps.attendance - Attendance tracking module
 * @param {Object} deps.bidding - Bidding module
 * @param {Object} deps.auctioneering - Auctioneering module
 * @param {Object} deps.bossTimerCommands - Boss timer commands
 * @param {Object} deps.emergencyCommands - Emergency overrides
 * @param {Object} deps.commandHandlers - Command handler functions
 * @param {Object} deps.bossRotation - Boss rotation system
 * @param {Object} deps.bossPoints - Boss point values
 * @param {Object} [deps.activityHeatmap] - Activity heatmap module
 * @param {Object} deps.shutdownManager - Shutdown manager
 * @param {Object} deps.dbAPI - MongoDB database API
 * @param {Object} deps.TIMING - Timing constants
 * @param {Function} deps.isAdmin - Admin check function (member) => boolean
 * @param {Function} deps.hasTenchuRole - Tenchu role check function (member) => boolean
 * @param {Function} deps.addGuildFooter - Guild branding footer utility
 * @param {Function} deps.createDisabledRow - Button disabling utility
 * @param {Function} deps.awaitConfirmation - Confirmation dialog utility
 * @param {string} deps.ALTERFRIEREN_ID - AlterFrieren's Discord user ID
 * @param {string} deps.ROHYPnol_ID - Rohypnol's Discord user ID
 * @param {Object} deps.errorHandler - Centralized error handling
 * @param {Object} [deps.bossTimer] - Boss timer module (getBossType, wasRecentlyHandled)
 * @param {Function} deps.findBossMatch - Boss name fuzzy matcher (input) => string|null
 * @param {Object} deps.lazyAttendance - Lazy attendance module wrapper (createSpawnThreads)
 * @returns {Function} The message handler async function
 */
function createMessageHandler(client, config, deps) {
  return async (message) => {
    try {
      // 👑 SPECIAL DM FORWARDING: Forward Alter's replies to Hesu

      // Handle DMs to the bot
      if (!message.guild) {
        // If Alter replies to the bot's DM, forward to Hesu
        if (message.author.id === deps.ALTERFRIEREN_ID) {
          try {
            const rohypnolUser = await client.users.fetch(deps.ROHYPnol_ID);
            await rohypnolUser.send(`💬 AlterFrieren replied: ${message.content}`).catch(err => console.error(`💬 Failed to forward DM to Rohypnol: ${err.message}`));
          } catch (e) {
            console.error(`💬 Error forwarding DM: ${e.message}`);
          }
        }
        // Hesu can send secret replies to AlterFrieren using !reply command
        else if (message.author.id === deps.ROHYPnol_ID) {
          const content = message.content.trim();
          if (content.startsWith('!reply ')) {
            const replyMsg = content.slice(7).trim();
            if (replyMsg) {
              const alterUser = await client.users.fetch(deps.ALTERFRIEREN_ID);
              await alterUser.send(replyMsg).catch(err => console.error(`💬 Failed to send secret reply to Alter: ${err.message}`));
              console.log(`💬 Secret reply sent to AlterFrieren: "${replyMsg}"`);
            }
          }
        }
        return; // Stop processing DMs
      }

      // ⚡ PERFORMANCE: Early returns for irrelevant messages
      // Allows timer server bot to create spawn threads before being blocked
      // Allow !setup commands even when guild is not yet configured
      const guildConfigured = config.main_guild_id && config.timer_server_id;
      if (guildConfigured) {
        if (message.guild.id !== config.main_guild_id && message.guild.id !== config.timer_server_id) return;
      } else if (!message.content.trim().toLowerCase().startsWith('!setup')) {
        // Guild not configured - only allow !setup commands
        return;
      }

      // 📊 ACTIVITY TRACKING: Track message for activity heatmap
      // Skip bot messages for more accurate member activity data
      if (deps.activityHeatmap && !message.author.bot) {
        try {
          deps.activityHeatmap.trackMessage(message);
        } catch (error) {
          console.error(`❌ Activity tracking error: ${error.message}`);
        }
      }

      // 🧹 BIDDING CHANNEL PROTECTION: Delete non-admin messages immediately
      // OPTIMIZED: Check command first, only fetch member if needed
      // Skip for bot messages (will be handled later)
      if (
        message.channel.id === config.bidding_channel_id &&
        !message.author.bot
      ) {
        const content = message.content.trim().toLowerCase();
        const memberCommands = ['!bid', '!b', '!help', '!?', '!commands', '!cmds', '!stats', '!status', '!update', '!setup'];

         // Check if it's a member command BEFORE fetching member (faster)
         const isMemberCommand = memberCommands.some(cmd => content.startsWith(cmd));

         // Only fetch member if it's NOT a member command (will be deleted)
         if (!isMemberCommand && message.guild?.id === config.main_guild_id) {
          const member = await message.guild.members
            .fetch(message.author.id)
            .catch(() => null);

          // If not an admin, delete the message
          if (member && !deps.isAdmin(member)) {
            try {
              await deps.errorHandler.safeDelete(message, 'message deletion');
              console.log(
                `🧹 Deleted non-admin message from ${message.author.username} in bidding channel`
              );
            } catch (e) {
              console.warn(
                `⚠️ Could not delete message from ${message.author.username}: ${e.message}`
              );
            }
            return; // Stop processing
          }
        }
        // If it IS a member command, continue processing below
      }
      // Debug for !bid detection
      if (
        message.content.startsWith("!bid") ||
        message.content.startsWith("!b")
      ) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🔔 BID COMMAND DETECTED");
        console.log(
          `👤 Author: ${message.author.username} (${message.author.id})`
        );
        console.log(`📝 Content: ${message.content}`);
        console.log(
          `📍 Channel: ${message.channel.name} (${message.channel.id})`
        );
        console.log(`🤖 Is Bot: ${message.author.bot}`);
        console.log(`🏰 Guild: ${message.guild?.name}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      }

      // ═══════════════════════════════════════════════════════════════════
      // TIMER SERVER SPAWN DETECTION
      // ═══════════════════════════════════════════════════════════════════
      // Handles boss spawn announcements from external timer bots
      // (e.g. "BossName will spawn in X minutes!")
      if (message.guild && message.guild.id === config.timer_server_id) {
        if (
          config.timer_channel_id &&
          message.channel.id === config.timer_channel_id
        ) {
          if (/will spawn in.*minutes?!/i.test(message.content)) {
            let detectedBoss = null;
            let timestamp = null;

            const timestampMatch = message.content.match(
              /\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/
            );
            if (timestampMatch) timestamp = timestampMatch[1];

            const matchBold = message.content.match(
              /[⚠️🔔⏰]*\s*\*\*(.*?)\*\*\s*will spawn/i
            );
            if (matchBold) {
              detectedBoss = matchBold[1].trim();
            } else {
              const matchEmoji = message.content.match(
                /[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn/i
              );
              if (matchEmoji) {
                detectedBoss = matchEmoji[1].trim();
              } else {
                const matchPlain = message.content.match(
                  /^([A-Za-z\s]+?)\s*will spawn/i
                );
                if (matchPlain) detectedBoss = matchPlain[1].trim();
              }
            }

            if (!detectedBoss) {
              console.log(`⚠️ Could not extract boss name from: ${message.content}`);
              return;
            }

            const bossName = deps.findBossMatch(detectedBoss);
            if (!bossName) {
              console.log(`⚠️ Unknown boss: ${detectedBoss}`);
              return;
            }

            // Format timestamp
            let dateStr = null;
            let timeStr = null;
            let fullTimestamp = null;

            if (timestamp) {
              const ts = timestamp;
              const datePart = ts.split(' ')[0];
              const timePart = ts.split(' ')[1];
              dateStr = datePart;
              timeStr = timePart;
              fullTimestamp = dateStr + ' ' + timeStr;
            }

            // Get boss type from bossTimer
            const bossType = deps.bossTimer?.getBossType?.(bossName);
            if (bossType === 'schedule') {
              console.log(`⏭️ Skipping scheduled boss from timer server: ${bossName}`);
              return;
            }

            // Check if recently handled by timer system
            const recentlyHandled = deps.bossTimer?.wasRecentlyHandled?.(bossName);
            if (recentlyHandled) {
              console.log(`⏭️ Boss recently handled by timer, skipping: ${bossName}`);
              return;
            }

            // Create spawn thread via attendance module
            const result = await deps.lazyAttendance.createSpawnThreads(
              bossName,
              dateStr,
              timeStr,
              fullTimestamp,
              message,
              client,
              config
            );

            // Also populate recentlyHandled cache so internal timer won't create a duplicate
            if (result && result.success && deps.bossTimer?.addToRecentlyHandled) {
              // Convert fullTimestamp string to Date for the cache
              const [datePart, timePart] = fullTimestamp.split(' ');
              const [y, m, d] = datePart.split('-').map(Number);
              const [h, min] = timePart.split(':').map(Number);
              const spawnDate = new Date(y, m - 1, d, h, min);
              deps.bossTimer.addToRecentlyHandled(bossName, spawnDate, result.threadId);
            }

            return;
          }
        }
      }

      // Second bot check after timer server handling
      // Allow bot messages in attendance threads (for other bots posting check-ins)
      // BUT process them separately and exit early (don't allow NLP/command processing)
      if (message.author.bot) {
        const inAttendanceThread = message.channel.isThread() &&
          message.channel.parentId === config.attendance_channel_id;
        if (inAttendanceThread) {
          // Bot messages in attendance threads are allowed for reading only
          // Don't process them further (no NLP, no commands, no responses)
          // Future: Add logic here to parse attendance data from bot messages
          return;
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // ATTENDANCE THREAD CHECK-IN DETECTION
      // ═══════════════════════════════════════════════════════════════════
      // Detects member check-in messages ("here", "present") in attendance threads
      // Adds them as pending verifications for admin review (via reaction)
      if (
        !message.author.bot &&
        message.channel.isThread() &&
        message.channel.parentId === config.attendance_channel_id
      ) {
        const content = message.content.trim().toLowerCase();
        const checkInKeywords = ['here', 'present', 'join', 'checkin', 'check-in', 'attending'];
        const isCheckIn = checkInKeywords.some(keyword => content.startsWith(keyword));

        if (isCheckIn) {
          console.log(`📋 Check-in detected from ${message.author.username} in thread ${message.channel.name}`);

          try {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            const discordName = member?.nickname || member?.displayName || message.author.displayName || message.author.username;

            // SCREENSHOT CHECK: Non-admin members must attach an image
            // (Admins are exempt as stated in the thread instructions)
            if (member && deps.isAdmin && !deps.isAdmin(member)) {
              const hasImage = message.attachments.size > 0 &&
                message.attachments.some(a => a.contentType?.startsWith('image/'));

              if (!hasImage) {
                await message.reply({
                  content: `📸 **Screenshot Required**, <@${message.author.id}>!\n\nPlease reply with \`here\` and attach a **screenshot** of the boss kill/loot to confirm your attendance.\n\n💡 Admins are exempt from this requirement.`,
                  allowedMentions: { repliedUser: true }
                });
                return; // Don't process — no screenshot attached
              }
            }

            // Look up registered name from Member Registry (Google Sheets)
            let displayName = discordName;
            if (deps.sheetAPI && message.author.id) {
              try {
                const result = await deps.sheetAPI.call('lookupMemberName', { discordId: message.author.id });
                if (result?.nickname) {
                  displayName = result.nickname;
                  console.log(`   📋 Using registered name "${displayName}" from Member Registry for ${message.author.id}`);
                }
              } catch (lookupErr) {
                // Non-critical - fall back to Discord name
                console.warn(`⚠️ Registry lookup failed for ${message.author.id}: ${lookupErr.message}`);
              }
            }

            // Add to pending verifications via stateManager
            if (deps.stateManager && deps.stateManager.pendingVerifications) {
              deps.stateManager.pendingVerifications[message.id] = {
                threadId: message.channel.id,
                author: displayName,
                authorId: message.author.id,
                messageId: message.id,
              };
              console.log(`   ✅ Added ${displayName} (${message.author.id}) to pending verifications for thread ${message.channel.id}`);
            }

            // Add bot reaction to acknowledge the check-in was seen
            try {
              await message.react('👀');
            } catch (reactErr) {
              // Reaction failures are non-critical
            }

            // Send acknowledgment reply to the member
            try {
              await message.reply({
                content: `✅ Check-in recorded, <@${message.author.id}>! An admin will verify your attendance shortly.`,
                allowedMentions: { repliedUser: true }
              });
            } catch (replyErr) {
              console.warn(`⚠️ Could not send check-in acknowledgment: ${replyErr.message}`);
            }
          } catch (err) {
            console.error(`❌ Error processing check-in for ${message.author.username}:`, err.message);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // PREFIX COMMAND ROUTING
      // ═══════════════════════════════════════════════════════════════════
      if (!message.author.bot && message.content.startsWith('!')) {
        try {
          const content = message.content.trim();
          const rest = content.slice(1); // Remove leading !
          const parts = rest.split(/\s+/);

          // Edge case: just "!" or "! " with nothing after
          if (!rest || parts.length === 0 || parts[0] === '') return;

          let commandName = '!' + parts[0].toLowerCase();
          const args = parts.slice(1);

          // Resolve aliases (!b -> !bid, !st -> !status, etc.)
          commandName = resolveCommandAlias(commandName);

          // Strip leading ! for dispatch
          const cmd = commandName.slice(1);

          // Fetch guild member for permission checks
          const member = await message.guild.members.fetch(message.author.id).catch(() => null);
          if (!member) {
            console.log(`⚠️ Could not fetch member for command: ${message.content}`);
            return;
          }

          // ── Dispatch ────────────────────────────────────────────────
          // Special handler modules that don't use standard commandHandlers signature

          // Bidding handler (!bid, !b)
          if (cmd === 'bid') {
            await deps.bidding.handleCommand('!' + cmd, message, args, client, config);
            return;
          }

          // Emergency commands (!emergency <subcommand>)
          if (cmd === 'emergency') {
            await deps.emergencyCommands.handleEmergencyCommand(message, args);
            return;
          }

          // Boss timer commands (!killed, !setboss, !nextspawn, !spawned, !maintenance, !clearkills, !timers, !nospawn, !unkill)
          if (cmd === 'killed') {
            await deps.bossTimerCommands.handleKilled(message, args, config);
            return;
          }
          if (cmd === 'setboss') {
            await deps.bossTimerCommands.handleSetBoss(message, args, config);
            return;
          }
          if (cmd === 'nextspawn') {
            await deps.bossTimerCommands.handleNextSpawn(message);
            return;
          }
          if (cmd === 'spawned') {
            await deps.bossTimerCommands.handleSpawned(message, args, config);
            return;
          }
          if (cmd === 'maintenance') {
            await deps.bossTimerCommands.handleMaintenance(message);
            return;
          }
          if (cmd === 'clearkills') {
            await deps.bossTimerCommands.handleClearKills(message);
            return;
          }
          if (cmd === 'timers') {
            await deps.bossTimerCommands.handleHelp(message);
            return;
          }


          // ── Standard commandHandlers dispatch ───────────────────────
          // All these have signature: async (message, member) or async (message, member, args)
          // commandHandlers.stats is the only one using the args parameter
          if (deps.commandHandlers && typeof deps.commandHandlers[cmd] === 'function') {
            await deps.commandHandlers[cmd](message, member, args);
            return;
          }

          // Unknown command
          console.log(`⚠️ Unknown prefix command: !${cmd}`);

        } catch (routeErr) {
          console.error(`❌ Command routing error for "${message.content}":`, routeErr);
        }
        return;
      }

    } catch (err) {
      console.error("❌ Message handler error:", err);
    }
  };
}

module.exports = { createMessageHandler };
