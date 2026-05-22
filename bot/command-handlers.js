/**
 * Command Handlers - Extracted from index2.js
 * Factory function pattern with dependency injection
 */
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { createLogger } = require('../utils/logger');
const logger = createLogger('command-handlers');
const errorHandler = require('../utils/error-handler');
const { normalizeUsername, findBossMatch, normalizeTimestamp } = require('../utils/common');
const { createDisabledRow, awaitConfirmation } = require('./confirm-utils');
const { clientCache } = require('../utils/sheet-api');
const { execSync } = require('child_process');

/**
 * Creates the command handlers object with all dependencies injected
 * @param {Object} deps - All dependencies (config, client, modules, state, etc.)
 * @returns {Object} commandHandlers object with handler methods
 */
function createCommandHandlers(deps) {
  const {
    // Core references
    config, client, discordCache, sheetAPI,

    // Bot modules used by handlers
    bidding, auctioneering, attendance, bossTimer,
    emergencyCommands, leaderboardSystem, helpSystemV2,
    bossRotation, activityHeatmap,

    // Mutable state variables
    activeSpawns, pendingVerifications, activeColumns,
    pendingClosures, confirmationMessages,

    // Data modules
    memberLore, bossPoints, bossSpawnConfig,

    // Service modules
    reports, mongoHelpers, dbAPI,

    // Functions
    isAdmin,
    findBestMemberMatch, buildStatsEmbed,

    // Constants
    BOT_VERSION, BOT_START_TIME, TIMING, AUCTION_COOLDOWN,
    USE_MONGODB_ATTENDANCE,

    // Mutable state
    lastAuctionEndTime, isRecovering, statsCache,
    lastSheetCall, guildName,
    STATS_CACHE_DURATION,
  } = deps;

  const commandHandlers = {
  help: async (message, member) => {
    // Use new channel-aware help system
    await helpSystemV2.handleHelpCommand(message, member);
  },

  // =========================================================================
  // NEW MEMBER GUIDE - Comprehensive instructions for new members
  // =========================================================================
  newmember: async (message, member) => {
    // Overview embed
    const overviewEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('📚 Welcome to Tenchu! New Member Guide')
      .setDescription(
        '**Welcome to the guild!** This guide will teach you everything you need to know about:\n\n' +
        '1️⃣ **Boss Attendance** - How to get credit for boss kills\n' +
        '2️⃣ **Auctions** - How to bid on boss loot\n\n' +
        'Read both sections carefully to avoid mistakes!'
      )
      .setTimestamp();

    // Boss Attendance Guide
    const attendanceEmbed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('1️⃣ Boss Attendance - Step by Step Guide')
      .setDescription(
        '**When a boss spawns, here\'s what you need to do to get attendance credit:**'
      )
      .addFields(
        {
          name: '📋 STEP 1: Find the Boss Thread',
          value:
            '• The bot automatically creates a thread in the attendance channel\n' +
            '• Thread name format: `[MM/DD/YY HH:MM] Boss Name`\n' +
            '• Example: `[11/13/25 14:30] General Aquleus`\n' +
            '• Look for the newest thread with the boss you killed',
          inline: false
        },
        {
          name: '✅ STEP 2: Post Keyword + Screenshot (ONE MESSAGE)',
          value:
            '• In ONE message, type keyword AND attach screenshot:\n' +
            '  • **Keywords:** `present`, `here`, `attending`, `join`, `checkin`\n' +
            '  • Common typos are auto-corrected (prsnt, hre, etc.)\n' +
            '• **CRITICAL:** Keyword and screenshot MUST be in the SAME message!\n' +
            '• After posting, the bot will reply with verification buttons',
          inline: false
        },
        {
          name: '📸 STEP 3: Screenshot Requirements',
          value:
            '**Your screenshot MUST show:**\n' +
            '✓ Your character name visible\n' +
            '✓ Boss name visible on screen\n' +
            '✓ Combat log or damage numbers (preferred)\n' +
            '✓ Game timestamp/time visible\n\n' +
            '**DO NOT:**\n' +
            '❌ Use fake or old screenshots\n' +
            '❌ Use someone else\'s screenshot\n' +
            '❌ Post screenshot in separate message',
          inline: false
        },
        {
          name: '⏳ STEP 4: Wait for Admin Verification',
          value:
            '• Bot will reply with ✅ **Verify** and ❌ **Deny** buttons\n' +
            '• Admin will review your screenshot and click:\n' +
            '  • ✅ **Verify** → You get attendance credit!\n' +
            '  • ❌ **Deny** → Screenshot rejected, you must resubmit\n' +
            '• Check the thread to see if you were verified\n' +
            '• Green embed = ✅ Verified | Red embed = ❌ Denied',
          inline: false
        },
        {
          name: '⏰ Important Time Limits',
          value:
            '• Threads **auto-close after 20 minutes**\n' +
            '• Submit ASAP after killing the boss\n' +
            '• Late submissions will be rejected\n' +
            '• If thread closes before verification, contact admin',
          inline: false
        },
        {
          name: '⚠️ Common Mistakes to Avoid',
          value:
            '❌ Posting "present" first, then screenshot separately\n' +
            '❌ Posting in the wrong boss thread\n' +
            '❌ Posting in main attendance channel (not the thread)\n' +
            '❌ Submitting after thread closes (20 min)\n' +
            '✅ Type keyword + attach screenshot in ONE message\n' +
            '✅ Post in the correct boss thread\n' +
            '✅ Submit within 20 minutes',
          inline: false
        }
      );

    // Auction Guide
    const auctionEmbed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('2️⃣ Auctions - Step by Step Guide')
      .setDescription(
        '**When loot drops from a boss, items are auctioned to guild members:**'
      )
      .addFields(
        {
          name: '🔨 STEP 1: Watch for Auction Threads',
          value:
            '• Admins create auction threads in the bidding channel\n' +
            '• Thread name shows the item being auctioned\n' +
            '• Pay attention to:\n' +
            '  📦 **Item name** (e.g., "Arcana Mace +5")\n' +
            '  💰 **Starting bid** (minimum bid required)\n' +
            '  ⏱️ **Timer** (how long you have to bid)',
          inline: false
        },
        {
          name: '💵 STEP 2: Place Your Bid',
          value:
            '• **MUST be used inside the auction thread!**\n' +
            '• Use command: **`!bid <amount>`**\n' +
            '• Example: `!bid 1000` (bids 1000 points)\n' +
            '• Your bid must be higher than current highest bid\n' +
            '• Bot will confirm if successful or show error',
          inline: false
        },

        {
          name: '🎯 STEP 5: Winning the Auction',
          value:
            '• Highest bidder when timer expires wins!\n' +
            '• Winner announced in the auction thread\n' +
            '• Points automatically deducted from your balance\n' +
            '• Coordinate with admins to receive your item\n' +
            '• Item will be distributed in-game',
          inline: false
        },
        {
          name: '💡 Smart Bidding Tips',
          value:
            '✅ **Bid in small increments** - Save points\n' +
            '✅ **Watch the timer** - Last-minute bids can win\n' +
            '✅ **Know item values** - Ask experienced members\n' +
            '✅ **Bid only in auction threads** - Main channel won\'t work\n' +
            '❌ **Don\'t bid on items you can\'t use**\n' +
            '❌ **Bids are binding** - Can\'t cancel after placing',
          inline: false
        },
        {
          name: '📋 Available Auction Commands',
          value:
            '**In auction threads:**\n' +
            '• **`!bid <amount>`** - Place a bid (ONLY in threads)\n\n' +
            '**Aliases that work:**\n' +
            '• `!b <amount>` = `!bid <amount>`',
          inline: false
        }
      );

    // Additional Tips
    const tipsEmbed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('💎 Additional Tips for New Members')
      .addFields(
        {
          name: '🎮 How to Earn Points',
          value:
            '• Attend boss kills (submit attendance screenshots)\n' +
            '• Each verified attendance = points added\n' +
            '• More attendance = more points to bid\n' +
            '• Check leaderboards: `!leaderboardattendance`\n' +
            '• Be active and help guild members!',
          inline: false
        },
        {
          name: '📞 Need Help?',
          value:
            '• Type **`!help`** to see all available commands\n' +
            '• Ask admins if you\'re unsure about anything\n' +
            '• Read pinned messages in each channel\n' +
            '• Other members are friendly - don\'t hesitate to ask!',
          inline: false
        },
        {
          name: '⚡ Quick Command Reference',
          value:
            '**Attendance:**\n' +
            '• Type `present` + attach screenshot (ONE message)\n' +
            '• Typos auto-corrected: `prsnt`, `hre`, etc.\n\n' +
            '**Auctions:**\n' +
            '• `!bid <amount>` - Bid in auction thread\n\n' +
            '**Info:**\n' +
            '• `!help` - Full command list\n' +
            '• `!nm` or `!newmember` - This guide\n' +
            '• `!leaderboardattendance` - Attendance rankings',
          inline: false
        }
      )
      .setFooter({ text: 'Good luck and have fun in Tenchu! 🎉' })
      .setTimestamp();

    // Send all embeds
    await message.reply({
      embeds: [overviewEmbed, attendanceEmbed, auctionEmbed, tipsEmbed]
    });
  },

  // =========================================================================
  // UPDATE COMMAND - Git pull and restart (admin only)
  // =========================================================================
  update: async (message, member) => {
    if (!deps.isAdmin(member)) {
      await message.reply({ content: '❌ Admin only command.' });
      return;
    }

    await message.reply({ content: '🔄 Pulling latest updates...' });

    try {
      const output = execSync('git pull origin main 2>&1', {
        cwd: __dirname + '/..',
        timeout: 30000
      }).toString();

      const trimmed = output.trim();
      if (trimmed.includes('Already up to date')) {
        await message.reply({ content: '✅ Already up to date. No update needed.' });
        return;
      }

      console.log(`🔄 Git pull output:\n${trimmed}`);
      await message.reply({
        content: '✅ Updates pulled successfully! Bot restarting in 2 seconds...'
      });

      setTimeout(() => {
        console.log('🔄 Restarting for update...');
        process.exit(0);
      }, 2000);

    } catch (err) {
      console.error('❌ Git pull failed:', err.message);
      await message.reply({
        content: `❌ Update failed: ${err.message}`
      });
    }
  },

  // =========================================================================
  // STATUS COMMAND - Displays bot health and active operations
  // =========================================================================
   status: async (message, member) => {
     if (!message.guild) return;
     const guild = message.guild;
     const uptime = attendance.formatUptime(Date.now() - BOT_START_TIME);
    const timeSinceSheet =
      lastSheetCall > 0
        ? `${Math.floor((Date.now() - lastSheetCall) / 1000)} seconds ago`
        : "Never";

    const totalSpawns = Object.keys(activeSpawns).length;

    // Sort spawns by timestamp (oldest first)
    // This helps admins prioritize closing old spawns
    const activeSpawnEntries = Object.entries(activeSpawns);
    const sortedSpawns = activeSpawnEntries.sort((a, b) => {
      // Parse timestamp format: "MM/DD/YY HH:MM"
      const parseTimestamp = (ts) => {
        const [date, time] = ts.split(" ");
        const [month, day, year] = date.split("/");
        const [hour, minute] = time.split(":");

        // FIXED: Parse Manila timezone timestamp correctly
        // The timestamp is in Manila time (UTC+8), convert to UTC for comparison
        const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

        return Date.UTC(
          2000 + parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        ) - MANILA_OFFSET_MS;
      };
      return parseTimestamp(a[1].timestamp) - parseTimestamp(b[1].timestamp);
    });

    const spawnList = sortedSpawns.slice(0, 10).map(([threadId, info], i) => {
      const spawnTime = (() => {
        const [date, time] = info.timestamp.split(" ");
        const [month, day, year] = date.split("/");
        const [hour, minute] = time.split(":");

        // FIXED: Parse Manila timezone timestamp correctly
        // The timestamp is in Manila time (UTC+8), but we need to create a UTC Date object
        // Subtract 8 hours (28800000ms) to convert Manila time to UTC
        const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

        return Date.UTC(
          2000 + parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        ) - MANILA_OFFSET_MS;
      })();

      const ageMs = Date.now() - spawnTime;
      const ageHours = Math.floor(ageMs / 3600000);
      const ageMinutes = Math.floor((ageMs % 3600000) / 60000);

      // Handle negative ages (future spawns) gracefully
      let ageText;
      if (ageMs < 0) {
        const futureHours = Math.floor(Math.abs(ageMs) / 3600000);
        const futureMinutes = Math.floor((Math.abs(ageMs) % 3600000) / 60000);
        ageText = futureHours > 0 ? `in ${futureHours}h` : `in ${futureMinutes}m`;
      } else {
        ageText = ageHours > 0 ? `${ageHours}h ago` : `${ageMinutes}m ago`;
      }

      return `${i + 1}. **${info.boss}** (${info.timestamp}) - ${
        info.members.length
      } verified - ${ageText} - <#${threadId}>`;
    });

    const spawnListText = spawnList.length > 0 ? spawnList.join("\n") : "None";
    const moreSpawns =
      totalSpawns > 10
        ? `\n\n*+${
            totalSpawns - 10
          } more spawns (sorted oldest first - close old ones first!)*`
        : "";

    const biddingState = bidding.getBiddingState();
    const biddingStatus = biddingState.a
      ? `🔴 Active: **${biddingState.a.item}** (${biddingState.a.curBid}pts)`
      : `🟢 Queue: ${biddingState.q.length} item(s)`;

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("📊 Bot Status")
      .setDescription("✅ **Healthy**")
      .addFields(
        { name: "⏱️ Uptime", value: uptime, inline: true },
        { name: "🤖 Version", value: BOT_VERSION, inline: true },
        {
          name: "💾 Memory",
          value: `${Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024
          )}MB`,
          inline: true,
        },
        { name: "🎯 Active Spawns", value: `${totalSpawns}`, inline: true },
        {
          name: "⏳ Pending Verifications",
          value: `${Object.keys(pendingVerifications).length}`,
          inline: true,
        },
        { name: "📊 Last Sheet Call", value: timeSinceSheet, inline: true },
        {
          name: "🔗 Spawn Threads (Oldest First)",
          value: spawnListText + moreSpawns,
          inline: false,
        },
        { name: "💰 Bidding System", value: biddingStatus, inline: false }
      )
      .setFooter({ text: `Requested by ${member.user.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },



  // =========================================================================
  // STATS COMMAND - Show member statistics
  // =========================================================================
  // Replace the !stats command handler (around line 1380-1469)
  stats: async (message, member, args) => {
  let targetMember = member;
  let targetDisplayName = member.displayName; // For display purposes
  let targetQueryName = member.nickname || member.user.username; // For MongoDB/Sheets query (use nickname to match check-in format)
  let matchInfo = null;

  // Parse target from args
  if (args.length > 0) {
    if (message.mentions.members.size > 0) {
      // @mention provided - highest priority
      targetMember = message.mentions.members.first();
      targetDisplayName = targetMember.displayName;
      targetQueryName = targetMember.nickname || targetMember.user.username;
     } else {
       if (!message.guild) return;
       // User provided a name without @mention - use fuzzy matching
       const searchName = args.join(" ");
       const guild = message.guild;

      if (guild) {
        matchInfo = findBestMemberMatch(searchName, guild);

        if (matchInfo) {
          targetMember = matchInfo.member;
          targetDisplayName = matchInfo.matchedName; // For display
          targetQueryName = matchInfo.member.nickname || matchInfo.member.user.username; // For query (use nickname to match check-in format)

          // Log match quality for debugging
          console.log(`🔍 Stats fuzzy match: "${searchName}" → "${targetDisplayName}" (${matchInfo.matchType}, ${matchInfo.confidence}% confidence)`);
        } else {
          // No match found - use raw search name for both display and query
          targetDisplayName = searchName;
          targetQueryName = searchName;
          targetMember = null;
          console.log(`⚠️ Stats: No Discord match found for "${searchName}", trying database...`);
        }
      } else {
        targetDisplayName = searchName;
        targetQueryName = searchName;
      }
    }
  }
  // If no args provided, show own stats (already set to member above)

  // Check cache first (use normalized name for cache key)
  const cacheKey = targetQueryName.toLowerCase().trim();
  const cached = statsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < STATS_CACHE_DURATION)) {
    console.log(`📦 Using cached stats for ${targetDisplayName}`);

     // CRITICAL FIX: Try to find member by the actual name returned from sheets
     if (!targetMember && message.guild?.id === config.main_guild_id) {
      const actualName = cached.data.memberName;
      const foundMember = message.guild.members.cache.find(
        m => m.displayName.toLowerCase() === actualName.toLowerCase() ||
             m.user.username.toLowerCase() === actualName.toLowerCase()
      );
      if (foundMember) {
        targetMember = foundMember;
      }
    }

    const embed = buildStatsEmbed(cached.data, targetMember);
    const statsMsg = await message.reply({ embeds: [embed] });

    // Delete user's command message immediately
    try {
      await errorHandler.safeDelete(message, 'message deletion');
    } catch (e) {
      console.warn(`⚠️ Could not delete user message: ${e.message}`);
    }

    // Auto-delete after 5 minutes
    setTimeout(async () => {
      try {
        await errorHandler.safeDelete(statsMsg, 'message deletion');
      } catch (e) {
        console.warn(`⚠️ Could not delete stats message: ${e.message}`);
      }
    }, 300000); // 5 minutes

    return;
  }

  // Show loading message
  const loadingMsg = await message.reply(`⏳ Fetching stats for **${targetDisplayName}**...`);

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // MONGODB-FIRST PATH (Phase 4)
    // ═══════════════════════════════════════════════════════════════════════════
    let result;

    if (USE_MONGODB_ATTENDANCE) {
      try {
        // Fetch stats from MongoDB using username (not display name)
        result = await mongoHelpers.getMemberStats(targetQueryName);

        if (result.status !== 'ok') {
          await loadingMsg.edit(`❌ Could not find stats for **${targetDisplayName}**`);
          return;
        }

        console.log(`✅ [MongoDB] Stats fetched for ${result.memberName}`);

      } catch (mongoError) {
        console.error(`❌ [MongoDB] Stats fetch failed, falling back to Sheets:`, mongoError.message);
        // Fall through to Sheets path below
        result = null;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GOOGLE SHEETS PATH (Fallback or when MongoDB disabled)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!result) {
      // Fetch stats from Google Sheets (with fuzzy matching support)
      result = await sheetAPI.call('getMemberStats', { memberName: targetQueryName });

      if (result.status !== 'ok') {
        await loadingMsg.edit(`❌ Could not find stats for **${targetDisplayName}**`);
        return;
      }

      console.log(`✅ [Sheets] Stats fetched for ${result.memberName}`);
    }

    // CRITICAL FIX: Get the actual member name returned from sheets (for fuzzy match cases)
    const actualMemberName = result.memberName;

     // CRITICAL FIX: Try to find the actual Discord member by the returned name
     if (message.guild?.id === config.main_guild_id) {
      const foundMember = message.guild.members.cache.find(
        m => m.displayName.toLowerCase() === actualMemberName.toLowerCase() ||
             m.user.username.toLowerCase() === actualMemberName.toLowerCase()
      );
      if (foundMember) {
        targetMember = foundMember;
        console.log(`✅ Found Discord member for ${actualMemberName}: ${foundMember.displayName}`);
      } else {
        console.log(`⚠️ Could not find Discord member for ${actualMemberName}, using original member`);
      }
    }

    // Cache the result (use the actual name from sheets for cache key)
    const actualCacheKey = actualMemberName.toLowerCase().trim();
    statsCache.set(actualCacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // Build and send embed (now with proper targetMember for lore lookup)
    const embed = buildStatsEmbed(result, targetMember);
    await loadingMsg.edit({ content: null, embeds: [embed] });

    // Delete user's command message immediately
    try {
      await errorHandler.safeDelete(message, 'message deletion');
    } catch (e) {
      console.warn(`⚠️ Could not delete user message: ${e.message}`);
    }

    // Auto-delete after 5 minutes
    setTimeout(async () => {
      try {
        await errorHandler.safeDelete(loadingMsg, 'message deletion');
      } catch (e) {
        console.warn(`⚠️ Could not delete stats message: ${e.message}`);
      }
    }, 300000); // 5 minutes

    console.log(`✅ Stats sent for ${actualMemberName} (searched: ${targetDisplayName})`);

  } catch (error) {
    console.error('Stats error:', error);
    await loadingMsg.edit("❌ Error fetching stats. Please try again later.");
  }
},



  // =========================================================================
  // CLOSEALLTHREAD COMMAND - Mass close all attendance threads
  // =========================================================================
   closeallthread: async (message, member) => {
     if (!message.guild) return;
     const guild = message.guild;
    const attChannel = await guild.channels
      .fetch(config.attendance_channel_id)
      .catch(() => null);
    if (!attChannel) {
      await message.reply("❌ Could not find attendance channel.");
      return;
    }

    const attThreads = await attChannel.threads.fetchActive().catch(() => null);
    if (!attThreads || attThreads.threads.size === 0) {
      await message.reply("🔭 No active threads found in attendance channel.");
      return;
    }

    const openSpawns = [];
    for (const [threadId, thread] of attThreads.threads) {
      const spawnInfo = activeSpawns[threadId];
      if (spawnInfo && !spawnInfo.closed) {
        openSpawns.push({ threadId, thread, spawnInfo });
      }
    }

    if (openSpawns.length === 0) {
      await message.reply("🔭 No open spawn threads found in bot memory.");
      return;
    }

    await awaitConfirmation(
      message,
      member,
      `⚠️ **MASS CLOSE ALL THREADS?**\n\n` +
        `This will:\n` +
        `• Verify ALL pending members in ALL threads\n` +
        `• Close and submit ${openSpawns.length} spawn thread(s)\n` +
        `• Process one thread at a time (to avoid rate limits)\n\n` +
        `**Threads to close:**\n` +
        openSpawns
          .map(
            (s, i) =>
              `${i + 1}. **${s.spawnInfo.boss}** (${s.spawnInfo.timestamp}) - ${
                s.spawnInfo.members.length
              } verified`
          )
          .join("\n") +
        `\n\nClick ✅ Confirm or ❌ Cancel button below.\n\n` +
        `⏱️ This will take approximately ${openSpawns.length * 5} seconds.`,
      async (confirmMsg) => {
        await message.reply(
          `📁 **Starting mass close...**\n\n` +
            `Processing ${openSpawns.length} thread(s) one by one...\n` +
            `Please wait, this may take a few minutes.`
        );

        let successCount = 0,
          failCount = 0;
        const results = [];
        let totalReactionsRemoved = 0,
          totalReactionsFailed = 0;

        for (let i = 0; i < openSpawns.length; i++) {
          const { threadId, thread, spawnInfo } = openSpawns[i];
          const operationStartTime = Date.now();

          try {
            const progress = Math.floor(((i + 1) / openSpawns.length) * 20);
            const progressBar =
              "█".repeat(progress) + "░".repeat(20 - progress);
            const progressPercent = Math.floor(
              ((i + 1) / openSpawns.length) * 100
            );

            await message.channel.send(
              `📋 **[${i + 1}/${
                openSpawns.length
              }]** ${progressBar} ${progressPercent}%\n` +
                `Processing: **${spawnInfo.boss}** (${spawnInfo.timestamp})...`
            );

            const pendingInThread = Object.entries(pendingVerifications).filter(
              ([msgId, p]) => p.threadId === threadId
            );

            if (pendingInThread.length > 0) {
              await message.channel.send(
                `   ├─ Found ${pendingInThread.length} pending verification(s)... Auto-verifying all...`
              );

              const newMembers = pendingInThread.filter(
                ([msgId, p]) =>
                  !spawnInfo.members.some(
                    (m) => normalizeUsername(m) === normalizeUsername(p.author)
                  )
              );

              // Add members and store Discord IDs
              if (!spawnInfo.memberIds) spawnInfo.memberIds = {};
              for (const [msgId, p] of newMembers) {
                spawnInfo.members.push(p.author);
                spawnInfo.memberIds[p.author] = p.authorId;
              }

              const messageIds = pendingInThread.map(([msgId, p]) => msgId);
              const messagePromises = messageIds.map((msgId) =>
                thread.messages.fetch(msgId).catch(() => null)
              );
              const fetchedMessages = await Promise.allSettled(messagePromises);

              const reactionPromises = fetchedMessages.map((result) => {
                if (result.status === "fulfilled" && result.value) {
                  return result.value.reactions.removeAll().catch(err => errorHandler.silentError(err, 'auto-verify reaction cleanup'));
                }
                return Promise.resolve();
              });
              await Promise.allSettled(reactionPromises);

              pendingInThread.forEach(
                ([msgId]) => delete pendingVerifications[msgId]
              );

              await message.channel.send(
                `   ├─ ✅ Auto-verified ${newMembers.length} member(s) (${
                  pendingInThread.length - newMembers.length
                } were duplicates)`
              );
            }

            await thread
              .send(
                `📍 Closing spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})... Submitting ${spawnInfo.members.length} members to Google Sheets...`
              )
              .catch((err) =>
                console.warn(
                  `⚠️ Could not post to spawn thread ${threadId}: ${err.message}`
                )
              );

            spawnInfo.closed = true;

            // Check if there are any members to submit
            if (spawnInfo.members.length === 0) {
              // No members to submit - just close and archive the thread
              await message.channel.send(
                `   ├─ ⚠️ No members to submit (0 verified). Skipping Google Sheets submission...`
              );

              await thread
                .send(
                  `⚠️ Thread closed with no verified members. No data submitted to Google Sheets.`
                )
                .catch((err) =>
                  console.warn(
                    `⚠️ Could not post to spawn thread ${threadId}: ${err.message}`
                  )
                );

              // Even with 0 members, increment boss rotation
              await bossRotation.handleBossKill(spawnInfo.boss);

              // Delete rotation warning message to avoid flooding
              await bossRotation.deleteRotationWarning(spawnInfo.boss);
              await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

              // Close confirmation thread if it exists
              if (spawnInfo.confirmThreadId) {
                const confirmThread = await guild.channels
                  .fetch(spawnInfo.confirmThreadId)
                  .catch(() => null);
                if (confirmThread) {
                  await confirmThread
                    .send(
                      `⚠️ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - 0 members (no submission)`
                    )
                    .catch(err => errorHandler.silentError(err, 'confirm thread zero members notification'));
                  await errorHandler.safeDelete(confirmThread, 'message deletion');
                }
              }

              // Clean up reactions
              await message.channel.send(
                `   ├─ 🧹 Cleaning up reactions from thread...`
              );
              const cleanupStats = await attendance.cleanupAllThreadReactions(
                thread
              );
              totalReactionsRemoved += cleanupStats.success;
              totalReactionsFailed += cleanupStats.failed;

              if (cleanupStats.failed > 0) {
                await message.channel.send(
                  `   ├─ ⚠️ Warning: ${cleanupStats.failed} message(s) still have reactions`
                );
              }

              // Lock and archive the thread
              await thread.setLocked(true, `Mass close by ${member.user.username}`)
                .catch(err => errorHandler.silentError(err, 'mass close lock empty thread'));
              await thread.setArchived(true, `Mass close by ${member.user.username}`)
                .catch(err => errorHandler.silentError(err, 'mass close archive empty thread'));

              // Clean up state
              const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
              delete activeSpawns[threadId];
              delete activeColumns[cacheKey];
              delete confirmationMessages[threadId];

              successCount++;
              results.push(
                `⚠️ **${spawnInfo.boss}** - 0 members (thread closed, no submission)`
              );

              await message.channel.send(
                `   └─ ✅ **Thread closed!** (No submission - 0 members)`
              );

              console.log(
                `📍 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (0 members - no submission)`
              );
            } else {
              // Members exist - remove from activeColumns cache BEFORE checking Google Sheets
              // This prevents false positives where the thread exists but was never submitted
              const cacheKey = `${spawnInfo.boss.toUpperCase()}|${normalizeTimestamp(spawnInfo.timestamp)}`;
              delete activeColumns[cacheKey];

              // Check for duplicates before submitting
              const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);

              if (columnExists) {
                console.log(`⚠️ Duplicate prevented: ${spawnInfo.boss} at ${spawnInfo.timestamp} already exists`);

                await message.channel.send(
                  `   ⚠️ **Attendance already submitted!** Closing thread without duplicate submission.`
                );

                // Skip submission, just close and clean up
                if (spawnInfo.confirmThreadId) {
                  const confirmThread = await guild.channels
                    .fetch(spawnInfo.confirmThreadId)
                    .catch(() => null);
                  if (confirmThread) {
                    await confirmThread.send(
                      `⚠️ Duplicate prevented: **${spawnInfo.boss}** (${spawnInfo.timestamp})`
                    );
                    await errorHandler.safeDelete(confirmThread, 'message deletion');
                  }
                }

                await thread.setLocked(true, `Mass close by ${member.user.username} (duplicate prevented)`)
                  .catch(err => errorHandler.silentError(err, 'mass close lock duplicate thread'));
                await thread.setArchived(true, `Mass close by ${member.user.username} (duplicate prevented)`)
                  .catch(err => errorHandler.silentError(err, 'mass close archive duplicate thread'));

                // Note: activeColumns already removed before check, but keeping for safety
                delete activeSpawns[threadId];
                delete activeColumns[cacheKey];
                delete confirmationMessages[threadId];

                successCount++;
                results.push(
                  `⚠️ **${spawnInfo.boss}** - Duplicate prevented (column already exists)`
                );

                console.log(
                  `📍 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (duplicate prevented)`
                );
              } else {
                // No duplicate - proceed with submission
                await message.channel.send(
                  `   ├─ 📊 Submitting ${spawnInfo.members.length} member(s) to Google Sheets...`
                );

                const payload = {
                  action: "submitAttendance",
                  boss: spawnInfo.boss,
                  date: spawnInfo.date,
                  time: spawnInfo.time,
                  timestamp: spawnInfo.timestamp,
                  members: spawnInfo.members,
                };

                const resp = await attendance.postToSheet(payload);

                if (resp.ok) {
              // Auto-increment boss rotation if it's a rotating boss
              await bossRotation.handleBossKill(spawnInfo.boss);

              // Delete rotation warning message to avoid flooding
              await bossRotation.deleteRotationWarning(spawnInfo.boss);
              await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

              await thread
                .send(
                  `✅ Attendance submitted successfully! Archiving thread...`
                )
                .catch((err) =>
                  console.warn(
                    `⚠️ Could not post success to spawn thread ${threadId}: ${err.message}`
                  )
                );

              if (spawnInfo.confirmThreadId) {
                const confirmThread = await guild.channels
                  .fetch(spawnInfo.confirmThreadId)
                  .catch(() => null);
                if (confirmThread) {
                  await confirmThread
                    .send(
                      `✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members recorded`
                    )
                    .catch(err => errorHandler.silentError(err, 'confirm thread spawn closed notification'));
                  await errorHandler.safeDelete(confirmThread, 'message deletion');
                }
              }

              await message.channel.send(
                `   ├─ 🧹 Cleaning up reactions from thread...`
              );
              const cleanupStats = await attendance.cleanupAllThreadReactions(
                thread
              );
              totalReactionsRemoved += cleanupStats.success;
              totalReactionsFailed += cleanupStats.failed;

              if (cleanupStats.failed > 0) {
                await message.channel.send(
                  `   ├─ ⚠️ Warning: ${cleanupStats.failed} message(s) still have reactions`
                );
              }

              await thread
                .setArchived(true, `Mass close by ${member.user.username}`)
                .catch(err => errorHandler.silentError(err, 'mass close archive thread'));

              delete activeSpawns[threadId];
              delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
              delete confirmationMessages[threadId];

              successCount++;
              results.push(
                `✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted`
              );

              await message.channel.send(
                `   └─ ✅ **Success!** Thread closed and archived.`
              );

              console.log(
                `📍 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`
              );
            } else {
              console.warn(
                `⚠️ First attempt failed for ${spawnInfo.boss}, retrying in 5s...`
              );
              await message.channel.send(
                `   ├─ ⚠️ First attempt failed, retrying in 5 seconds...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, TIMING.RETRY_DELAY)
              );

              const retryResp = await attendance.postToSheet(payload);

              if (retryResp.ok) {
                if (spawnInfo.confirmThreadId) {
                  const confirmThread = await guild.channels
                    .fetch(spawnInfo.confirmThreadId)
                    .catch(() => null);
                  if (confirmThread)
                    await errorHandler.safeDelete(confirmThread, 'message deletion');
                }

                await thread
                  .setArchived(true, `Mass close by ${member.user.username}`)
                  .catch(err => errorHandler.silentError(err, 'mass close archive thread after retry'));

                delete activeSpawns[threadId];
                delete activeColumns[
                  `${spawnInfo.boss}|${spawnInfo.timestamp}`
                ];

                successCount++;
                results.push(
                  `✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted (retry succeeded)`
                );

                await message.channel.send(
                  `   └─ ✅ **Success on retry!** Thread closed and archived.`
                );

                console.log(
                  `📍 Mass close (retry): ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`
                );
              } else {
                failCount++;
                results.push(
                  `❌ **${spawnInfo.boss}** - Failed: ${
                    retryResp.text || retryResp.err
                  } (after retry)`
                );

                await message.channel.send(
                  `   └─ ❌ **Failed after retry!** Error: ${
                    retryResp.text || retryResp.err
                  }\n` + `   Members: ${spawnInfo.members.join(", ")}`
                );

                console.error(
                  `❌ Mass close failed (after retry) for ${spawnInfo.boss}:`,
                  retryResp.text || retryResp.err
                );
              }
            }
              } // End of duplicate check else block
            } // End of members.length > 0 check

            const operationTime = Date.now() - operationStartTime;
            const minDelay = TIMING.MASS_CLOSE_DELAY;
            const remainingDelay = Math.max(0, minDelay - operationTime);

            if (i < openSpawns.length - 1) {
              if (remainingDelay > 0) {
                await message.channel.send(
                  `   ⏳ Waiting ${Math.ceil(
                    remainingDelay / 1000
                  )} seconds before next thread...`
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, remainingDelay)
                );
              } else {
                await message.channel.send(
                  `   ⏳ Operation took ${Math.ceil(
                    operationTime / 1000
                  )}s, proceeding immediately...`
                );
              }
            }
          } catch (err) {
            failCount++;
            results.push(`❌ **${spawnInfo.boss}** - Error: ${err.message}`);
            await message.channel.send(`   └─ ❌ **Error!** ${err.message}`);
            console.error(`❌ Mass close error for ${spawnInfo.boss}:`, err);
          }
        }

        const summaryEmbed = new EmbedBuilder()
          .setColor(successCount === openSpawns.length ? 0x00ff00 : 0xffa500)
          .setTitle("🎉 Mass Close Complete!")
          .setDescription(
            `**Summary:**\n` +
              `✅ Success: ${successCount}\n` +
              `❌ Failed: ${failCount}\n` +
              `📊 Total: ${openSpawns.length}`
          )
          .addFields(
            {
              name: "📋 Detailed Results",
              value: results.join("\n"),
              inline: false,
            },
            {
              name: "🧹 Cleanup Statistics",
              value: `✅ Reactions removed: ${totalReactionsRemoved}\n❌ Failed cleanups: ${totalReactionsFailed}`,
              inline: false,
            }
          )
          .setFooter({ text: `Executed by ${member.user.username}` })
          .setTimestamp();

        await message.reply({ embeds: [summaryEmbed] });

        console.log(
          `🔧 Mass close complete: ${successCount}/${openSpawns.length} successful by ${member.user.username}`
        );
      },
      async (confirmMsg) => {
        await message.reply("❌ Mass close canceled.");
      }
    );
  },







  // =========================================================================
  // OPENTHREAD COMMAND - Reopen a closed attendance thread for manual override
  // =========================================================================
  openthread: async (message, member) => {
    const thread = message.channel;

    // Must be in a thread
    if (!thread.isThread()) {
      await message.reply("⚠️ This command must be used inside an attendance thread.");
      return;
    }

    // Must be in attendance channel
    if (thread.parentId !== config.attendance_channel_id) {
      await message.reply("⚠️ This command only works in attendance threads.");
      return;
    }

    // Parse thread name to get boss and timestamp
    const parsed = attendance.parseThreadName(thread.name);
    if (!parsed) {
      await message.reply("⚠️ Could not parse thread name. Expected formats:\n• Boss: `[MM/DD/YY HH:MM] BOSS_NAME`\n• Event: `GvG MM-DD HH:MM` or `Guild Boss MM-DD HH:MM`");
      return;
    }

    // Check if it's a known event type (GvG, Guild Boss) or a boss spawn
    const EVENT_TYPES = ["GvG", "Guild Boss"];
    const isEventThread = EVENT_TYPES.includes(parsed.boss);
    const bossName = isEventThread ? parsed.boss : attendance.findBossMatch(parsed.boss);

    if (!bossName) {
      await message.reply(`⚠️ Unknown boss or event type: "${parsed.boss}"`);
      return;
    }

    // Check if thread is already in activeSpawns and open
    const existingSpawn = activeSpawns[thread.id];
    if (existingSpawn && !existingSpawn.closed) {
      await message.reply("ℹ️ This thread is already open and active.");
      return;
    }

    const typeLabel = isEventThread ? "Event" : "Boss";
    await awaitConfirmation(
      message,
      member,
      `🔓 **Reopen Closed Thread?**\n\n` +
        `**${typeLabel}:** ${bossName}\n` +
        `**Timestamp:** ${parsed.timestamp}\n\n` +
        `This will:\n` +
        `• Unarchive and unlock the thread\n` +
        `• Re-register the spawn in bot memory\n` +
        `• Allow new check-ins and re-queue all messages as pending verifications\n` +
        `• Use \`!overrideclose\` to close and submit (will overwrite existing column if any)\n\n` +
        `Click ✅ Confirm or ❌ Cancel button below.`,
       async (confirmMsg) => {
         if (!message.guild) return;
         const guild = message.guild;

         // Unarchive and unlock the thread
         try {
           if (thread.archived) {
             await thread.setArchived(false, `Reopened by ${member.user.username}`);
           }
           if (thread.locked) {
             await thread.setLocked(false, `Unlocked by ${member.user.username}`);
           }
         } catch (err) {
           await message.reply(`⚠️ Could not unlock/unarchive thread: ${err.message}`);
           return;
         }

        // Try to load existing members from MongoDB (fast) or Google Sheets (fallback)
        let existingMembers = [];
        if (!existingSpawn) {
          const loadMsg = await message.channel.send(`🔍 Loading existing attendance...`);

          try {
            // FAST PATH: Load from MongoDB first
            if (USE_MONGODB_ATTENDANCE) {
              const db = await dbAPI.connect();

              // Parse timestamp to Date object for MongoDB query
              const timestampDate = new Date(parsed.timestamp);

              // Get all attendance records for this boss + timestamp
              const attendanceRecords = await db.collection('attendance')
                .find({
                  bossName: bossName,
                  timestamp: timestampDate
                })
                .toArray();

              if (attendanceRecords.length > 0) {
                // Extract unique member names
                existingMembers = [...new Set(attendanceRecords.map(r => r.memberName))];
                console.log(`   ✅ Loaded ${existingMembers.length} existing members from MongoDB (${attendanceRecords.length} records)`);
                await loadMsg.edit(`✅ Loaded ${existingMembers.length} existing member(s) from MongoDB`);
              } else {
                console.log(`   ℹ️ No records found in MongoDB for this boss/timestamp`);
              }
            }

            // No Sheets fallback needed - MongoDB is the source of truth for attendance
            if (existingMembers.length === 0) {
              await loadMsg.edit(`ℹ️ No existing attendance found in MongoDB`);
            }
          } catch (err) {
            console.log(`   ⚠️ Could not load existing members: ${err.message}`);
            await loadMsg.edit(`⚠️ Could not load existing members`).catch((err) => console.error('[command-handlers] loadMsg edit failed:', err?.message || err));
          }
        }

        // Re-register spawn in activeSpawns
        activeSpawns[thread.id] = {
          boss: bossName,
          date: parsed.date,
          time: parsed.time,
          timestamp: parsed.timestamp,
          members: existingSpawn ? existingSpawn.members : existingMembers, // Preserve from memory OR load from MongoDB/Sheets
          confirmThreadId: existingSpawn ? existingSpawn.confirmThreadId : null,
          closed: false,
          createdAt: existingSpawn ? existingSpawn.createdAt : Date.now(),
          noAutoClose: true, // Prevent auto-close for manually reopened threads
          reopened: true, // Mark as reopened to prevent rotation increment on close
        };

        // Sync to attendance module
        attendance.setActiveSpawns(activeSpawns);

        // Scan thread for all check-in messages and add them to pending verifications
        await message.channel.send(`🔍 Scanning thread for check-in messages...`);

        const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
        let foundCheckIns = 0;
        let alreadyVerified = 0;
        let deletedCount = 0;
        const spawnInfo = activeSpawns[thread.id];

        if (messages) {
          const exactKeywords = ["present", "here", "join", "checkin", "check-in", "attending"];

          for (const [msgId, msg] of messages) {
            // Skip bot messages
            if (msg.author.bot) continue;

            const content = msg.content.trim().toLowerCase();
            const keyword = content.split(/\s+/)[0];

            // Check if it's a check-in message
            if (exactKeywords.includes(keyword)) {
              const msgMember = await guild.members.fetch(msg.author.id).catch(() => null);
              const username = msgMember ? (msgMember.nickname || msg.author.username) : msg.author.username;

              // Check if already verified
              const isVerified = spawnInfo.members.some(
                (m) => normalizeUsername(m) === normalizeUsername(username)
              );

              if (isVerified) {
                alreadyVerified++;
                continue;
              }

              // Check if already in pending verifications
              if (pendingVerifications[msgId]) {
                continue;
              }

              // Add to pending verifications (late check-ins will also be added)
              pendingVerifications[msgId] = {
                author: username,
                authorId: msg.author.id,
                threadId: thread.id,
                timestamp: msg.createdTimestamp,
                verificationMsgId: null, // No button message for re-queued verifications
              };
              foundCheckIns++;
            }
          }

          // Clean up: delete non-check-in member messages to keep thread tidy
          deletedCount = 0;
          for (const [msgId, msg] of messages) {
            // Skip bot messages (embeds, instructions)
            if (msg.author.bot) continue;

            const content = msg.content.trim().toLowerCase();
            const firstWord = content.split(/\s+/)[0];

            // Skip check-in messages (keep them for admin verification)
            if (exactKeywords.includes(firstWord)) continue;

            // Delete non-check-in member messages
            try {
              await msg.delete();
              deletedCount++;
            } catch (delErr) {
              // If can't delete (e.g., no permission), just log it
              if (delErr.code !== 10008) { // Ignore "Unknown Message" errors
                console.warn(`⚠️ Could not delete message ${msgId}: ${delErr.message}`);
              }
            }
          }
        }

        attendance.setPendingVerifications(pendingVerifications);

        await message.reply(
          `✅ **Thread Reopened!**\n\n` +
            `**${typeLabel}:** ${bossName}\n` +
            `**Timestamp:** ${parsed.timestamp}\n` +
            `**Previously Verified:** ${spawnInfo.members.length} member(s)\n` +
            `**Re-queued for Verification:** ${foundCheckIns} message(s)\n` +
            `**Cleaned Up:** ${deletedCount} non-check-in message(s) deleted\n` +
            `**Already Verified (skipped):** ${alreadyVerified}\n\n` +
            `📝 You can now:\n` +
            `• Verify pending check-ins with ✅/❌ buttons or \`!verify @member\`\n` +
            `• Use \`!verifyall\` to verify all pending at once\n` +
            `• Use \`!overrideclose\` to close and submit (overwrites existing column if any)\n` +
            `• Use \`close\` for normal close (will block if column already exists)`
        );

        console.log(
          `🔓 Thread reopened: ${bossName} (${parsed.timestamp}) by ${member.user.username} - ${foundCheckIns} pending, ${spawnInfo.members.length} verified`
        );
      },
      async (confirmMsg) => {
        await message.reply("❌ Open thread canceled.");
      }
    );
  },

  // =========================================================================
  // OVERRIDECLOSE COMMAND - Close and submit with column overwrite support
  // =========================================================================
  overrideclose: async (message, member) => {
    const spawnInfo = activeSpawns[message.channel.id];
    if (!spawnInfo) {
      await message.reply(
        "⚠️ This thread is not in bot memory. Use `!openthread` first to reopen it."
      );
      return;
    }

    if (spawnInfo.closed) {
      await message.reply("⚠️ This spawn is already closed.");
      return;
    }

    const pendingInThread = Object.entries(pendingVerifications).filter(
      ([msgId, p]) => p.threadId === message.channel.id
    );

    // Check if column already exists
    const columnExists = await attendance.checkColumnExists(spawnInfo.boss, spawnInfo.timestamp);
    const overwriteWarning = columnExists
      ? `\n\n⚠️ **Column already exists!** This will OVERWRITE the existing attendance data.`
      : `\n\n✅ No existing column found. Will create new column.`;

    await awaitConfirmation(
      message,
      member,
      `🔒 **Override Close Spawn?**\n\n` +
        `**Boss:** ${spawnInfo.boss}\n` +
        `**Timestamp:** ${spawnInfo.timestamp}\n` +
        `**Verified Members:** ${spawnInfo.members.length}\n` +
        `**Pending Verifications:** ${pendingInThread.length}` +
        overwriteWarning +
        `\n\n${pendingInThread.length > 0 ? `⚠️ **${pendingInThread.length} pending verification(s) will be AUTO-VERIFIED!**\n\n` : ''}` +
        `Click ✅ Confirm or ❌ Cancel button below.`,
       async (confirmMsg) => {
         if (!message.guild) return;
         const guild = message.guild;

        // Auto-verify all pending check-ins
        if (pendingInThread.length > 0) {
          await message.channel.send(`📋 Auto-verifying ${pendingInThread.length} pending check-in(s)...`);

          for (const [msgId, pending] of pendingInThread) {
            const isDuplicate = spawnInfo.members.some(
              (m) => normalizeUsername(m) === normalizeUsername(pending.author)
            );

            if (!isDuplicate) {
              spawnInfo.members.push(pending.author);
              // Store Discord ID for reliable MongoDB lookup
              if (!spawnInfo.memberIds) spawnInfo.memberIds = {};
              spawnInfo.memberIds[pending.author] = pending.authorId;
            }

            delete pendingVerifications[msgId];
          }

          attendance.setPendingVerifications(pendingVerifications);
        }

        spawnInfo.closed = true;
        attendance.setActiveSpawns(activeSpawns);

        // Check if there are any members to submit
        if (spawnInfo.members.length === 0) {
          await message.channel.send(
            `⚠️ **No members to submit!**\n\nClosing thread without Google Sheets submission.`
          );

          // Clean up
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `⚠️ Override close: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - 0 members`
              );
              await errorHandler.safeDelete(confirmThread, 'override close delete confirm thread');
            }
          }

          await message.channel.setLocked(true, `Override closed by ${member.user.username}`).catch(err => errorHandler.silentError(err, 'override close lock empty'));
          await message.channel.setArchived(true, `Override closed by ${member.user.username}`).catch(err => errorHandler.silentError(err, 'override close archive empty'));

          // Delete rotation warning message (prevent channel flooding)
          await bossRotation.deleteRotationWarning(spawnInfo.boss);
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          delete activeSpawns[message.channel.id];
          const cacheKey = `${spawnInfo.boss.toUpperCase()}|${attendance.getCurrentTimestamp().full}`;
          delete activeColumns[cacheKey];
          delete confirmationMessages[message.channel.id];

          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setConfirmationMessages(confirmationMessages);

          return;
        }

        await message.channel.send(
          `📊 Submitting ${spawnInfo.members.length} members to Google Sheets...` +
            (columnExists ? ` (Overwriting existing column)` : ` (Creating new column)`)
        );

        // Prepare payload - always use overwriteAttendance action for !overrideclose
        // This ensures proper column handling since handleOverwriteAttendance:
        // 1. Finds and overwrites existing column if it exists
        // 2. Creates new column if no existing column found
        // Using submitAttendance when columnExists is false can cause issues if the
        // check result is stale (e.g., activeColumns cache not updated after openthread)
        const payload = {
          action: "overwriteAttendance",
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members,
        };

        const resp = await attendance.postToSheet(payload);

        if (resp.ok) {
          // Invalidate client-side cache (attendance data changed)
          clientCache.invalidate('getAllWeeklyAttendance:{}');
          console.log(`🧹 Invalidated client cache (overwrite attendance)`);

          // Override close should NOT increment rotation (it's for fixing data, not new kills)
          console.log(`⏭️ Skipping rotation increment for ${spawnInfo.boss} (override close - fixing attendance)`);

          // Delete rotation warning message (prevent channel flooding)
          await bossRotation.deleteRotationWarning(spawnInfo.boss);
          await bossRotation.checkAndDeleteDailySchedule(spawnInfo.boss);

          await message.channel.send(
            `✅ **Attendance ${columnExists ? 'overwritten' : 'submitted'} successfully!**\n\n` +
              `${spawnInfo.members.length} member(s) recorded.\n` +
              `Archiving thread...`
          );

          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels
              .fetch(spawnInfo.confirmThreadId)
              .catch(() => null);
            if (confirmThread) {
              await confirmThread.send(
                `✅ Override close: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members ${columnExists ? '(overwritten)' : '(new)'}`
              );
              await errorHandler.safeDelete(confirmThread, 'override close delete confirm thread');
            }
          }

          // Lock and archive the thread
          await message.channel
            .setLocked(true, `Override closed by ${member.user.username}`)
            .catch(err => errorHandler.silentError(err, 'override close lock thread'));
          await message.channel
            .setArchived(true, `Override closed by ${member.user.username}`)
            .catch(err => errorHandler.silentError(err, 'override close archive thread'));

          // Clean up state
          delete activeSpawns[message.channel.id];
          const normalizedKey = `${spawnInfo.boss.toUpperCase()}|${require('../utils/common').normalizeTimestamp(spawnInfo.timestamp)}`;
          delete activeColumns[normalizedKey];
          delete confirmationMessages[message.channel.id];

          attendance.setActiveSpawns(activeSpawns);
          attendance.setActiveColumns(activeColumns);
          attendance.setConfirmationMessages(confirmationMessages);

          console.log(
            `🔒 Override close: ${spawnInfo.boss} at ${spawnInfo.timestamp} by ${member.user.username} (${spawnInfo.members.length} members, ${columnExists ? 'overwritten' : 'new'})`
          );
        } else {
          await message.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
              `Error: ${resp.text || resp.err}\n\n` +
              `**Members list (for manual entry):**\n${spawnInfo.members.join(", ")}`
          );
        }
      },
      async (confirmMsg) => {
        await message.reply("❌ Override close canceled.");
      }
    );
  },

  // =========================================================================
  // STARTAUCTION COMMAND - Initiates auction session with queue
  // =========================================================================
  startauction: async (message, member) => {
    // Prevent auction start during recovery to avoid data conflicts
    if (isRecovering) {
      return await message.reply(
        `⚠️ Bot is recovering from crash, please wait...`
      );
    }

    // Check if auction is already running
    const auctState = auctioneering.getAuctionState();
    if (auctState.active) {
      return await message.reply(`❌ Auction session already running`);
    }

    // Enforce 10-minute cooldown after auction ends
    // This prevents rapid auction restarts and gives admins time to review results
    const now = Date.now();
    const timeSinceLast = now - lastAuctionEndTime;
    const cooldownRemaining = AUCTION_COOLDOWN - timeSinceLast;

    if (timeSinceLast < AUCTION_COOLDOWN) {
      const mins = Math.ceil(cooldownRemaining / 60000);
      return await message.reply(
        `⏱️ Cooldown active. Wait ${mins} more minute(s). Or use \`!startauctionnow\` to override.`
      );
    }

    await auctioneering.startAuctioneering(client, config, message.channel);
    lastAuctionEndTime = Date.now();
  },

  startauctionnow: async (message, member) => {
    if (isRecovering) {
      return await message.reply(
        `⚠️ Bot is recovering from crash, please wait...`
      );
    }

    const auctState = auctioneering.getAuctionState();
    if (auctState.active) {
      return await message.reply(`❌ Auction session already running`);
    }

    await auctioneering.startAuctioneering(client, config, message.channel);
    lastAuctionEndTime = Date.now();
    await message.reply(
      `✅ Auction started immediately. Cooldown reset to 10 minutes.`
    );
  },





  // REPLACE the entire !endauction handler in index2.js commandHandlers object (Line ~450)
  // This version fixes the race condition with double execution

  endauction: async (message, member) => {
    const auctState = auctioneering.getAuctionState();
    if (!auctState.active) {
      return await message.reply(`❌ No active auction to end`);
    }

    // Create confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`⚠️ End Auction Session?`)
      .setDescription(
        `This will immediately end the current auction session and submit all completed items.\n\n` +
          `**Current Item:** ${auctState.currentItem?.item || "None"}\n` +
          `**Completed Items:** ${
            auctState.sessionItems?.filter((s) => s.winner).length || 0
          }\n\n` +
          `Click ✅ End Session or ❌ Cancel button below.`
      )
      .setFooter({ text: `30 seconds to respond` })
      .setTimestamp();

    const confirmButton = new ButtonBuilder()
      .setCustomId(`endauction_confirm_${message.author.id}_${Date.now()}`)
      .setLabel('✅ End Session')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`endauction_cancel_${message.author.id}_${Date.now()}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const confirmMsg = await message.reply({ embeds: [confirmEmbed], components: [row] });

    const collector = confirmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000,
      filter: i => i.user.id === message.author.id
    });

    // Flag to prevent double execution
    let executed = false;

    collector.on('collect', async (interaction) => {
      // Prevent double execution
      if (executed) return;
      executed = true;

      const isConfirm = interaction.customId.startsWith('endauction_confirm_');

      const disabledRow = createDisabledRow(confirmButton, cancelButton);

      await interaction.update({ components: [disabledRow] });

      if (isConfirm) {
        // User confirmed - end the auction
        await message.reply(`🛑 Ending auction session immediately...`);

        // Get bidding channel for finalization (always use parent channel, not thread)
        const biddingChannel = await discordCache.getChannel('bidding_channel_id');

        // Don't call stopCurrentItem() here - endAuctionSession handles it
        // stopCurrentItem() would call itemEnd() which moves to next item,
        // but we want to END the entire session, not move to next item

        // CRITICAL: Always use the parent bidding channel (type 0 or 5), never a thread (type 11)
        // endAuctionSession will handle stopping the current item and finalizing
        await auctioneering.endAuctionSession(client, config, biddingChannel);

        await message.reply(`✅ Auction session ended and results submitted.`);
      } else {
        // User cancelled
        await message.reply(`❌ End auction canceled`);
      }

      collector.stop();
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Prevent double execution
        if (executed) return;
        executed = true;

        const disabledRow = createDisabledRow(confirmButton, cancelButton);

        await errorHandler.safeEdit(confirmMsg, { components: [disabledRow] }, 'auction reset confirmation timeout');
        await message.reply(`⏱️ Confirmation timeout - auction continues`);
      }
    });
  },

  queuelist: async (message, member) => {
    await auctioneering.handleQueueList(message, bidding.getBiddingState());
  },



  // ==========================================
  // MEMBER MANAGEMENT COMMANDS
  // ==========================================

  /**
   * Remove a member from the BiddingPoints sheet
   * Used when members are kicked or banned from the guild
   *
   * Usage: !removemember <member_name>
   * Aliases: !removemem, !rmmember, !delmember
   */
  removemember: async (message, member) => {
    const args = message.content.trim().split(/\s+/).slice(1);

    if (args.length === 0) {
      await message.reply(
        `❌ **Usage:** \`!removemember <member_name>\`\n\n` +
          `**Example:** \`!removemember PlayerName\`\n\n` +
          `**Aliases:** \`!removemem\`, \`!rmmember\`, \`!delmember\`\n\n` +
          `This command removes a member from:\n` +
          `• BiddingPoints sheet\n` +
          `• All attendance week sheets\n\n` +
          `**Exemption:** ForDistribution sheet (historical log) is NOT touched.\n\n` +
          `Use this when a member is kicked or banned from the guild.`
      );
      return;
    }

    const memberName = args.join(" ").trim();

    await awaitConfirmation(
      message,
      member,
      `⚠️ **Remove member from ALL sheets?**\n\n` +
        `**Member:** ${memberName}\n\n` +
        `This will:\n` +
        `• Remove the member from BiddingPoints sheet\n` +
        `• Remove the member from ALL attendance week sheets\n` +
        `• Delete all their point and attendance history\n` +
        `• ForDistribution sheet will NOT be touched (historical log)\n` +
        `• This action cannot be undone\n\n` +
        `Click ✅ Confirm or ❌ Cancel button below.`,
      async (confirmMsg) => {
        try {
          // Call Google Sheets to remove the member
          const result = await sheetAPI.call('removeMember', {
            memberName: memberName,
          });

          if (result.status === "ok" && result.removed) {
            const actualName = result.memberName;
            const pointsLost = result.pointsLeft || 0;
            const biddingRemoved = result.biddingSheetRemoved || false;
            const attendanceRemoved = result.attendanceSheetsRemoved || 0;
            const totalAttendanceRemoved = result.totalAttendanceRemoved || false;
            const totalSheets = result.totalSheetsAffected || 0;
            const totalAttendance = result.totalAttendancePoints || 0;
            const attendanceDetails = result.attendanceSheetsDetails || [];

            // Build detailed description
            let description = `**Member:** ${actualName}\n\n`;

            if (biddingRemoved) {
              description += `**BiddingPoints Sheet:**\n`;
              description += `• Removed (had ${pointsLost} points)\n\n`;
            }

            if (attendanceRemoved > 0) {
              description += `**Attendance Sheets:**\n`;
              description += `• Removed from ${attendanceRemoved} week sheet(s)\n`;
              description += `• Total attendance points: ${totalAttendance}\n\n`;

              if (attendanceDetails.length > 0 && attendanceDetails.length <= 5) {
                description += `**Details:**\n`;
                attendanceDetails.forEach(detail => {
                  description += `• ${detail.sheet}: ${detail.attendancePoints} pts\n`;
                });
              } else if (attendanceDetails.length > 5) {
                description += `**Recent sheets:**\n`;
                attendanceDetails.slice(0, 5).forEach(detail => {
                  description += `• ${detail.sheet}: ${detail.attendancePoints} pts\n`;
                });
                description += `• ... and ${attendanceDetails.length - 5} more\n`;
              }
            }

            if (totalAttendanceRemoved) {
              description += `**TOTAL ATTENDANCE Sheet:**\n`;
              description += `• Removed from aggregated attendance sheet\n\n`;
            }

            description += `\n**Total sheets affected:** ${totalSheets}`;

            const embed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle(`✅ Member Removed Successfully`)
              .setDescription(description)
              .setFooter({ text: `Removed by ${member.user.username}` })
              .setTimestamp();

            await message.reply({ embeds: [embed] });

            // Log to admin-logs channel
            const adminLogsChannel = await discordCache.getChannel('admin_logs_channel_id');

            if (adminLogsChannel) {
              const logEmbed = new EmbedBuilder()
                .setColor(0xff9900)
                .setTitle(`🗑️ Member Removed from All Sheets`)
                .setDescription(
                  `**Removed Member:** ${actualName}\n` +
                    `**Bidding Points Lost:** ${pointsLost}\n` +
                    `**Attendance Points Lost:** ${totalAttendance}\n` +
                    `**Attendance Sheets:** ${attendanceRemoved}\n` +
                    `**Total Sheets:** ${totalSheets}\n` +
                    `**Removed By:** ${member.user.username}`
                )
                .setTimestamp();

              await adminLogsChannel.send({ embeds: [logEmbed] });
            }

            console.log(
              `🗑️ Removed member: ${actualName} from ${totalSheets} sheet(s) (${pointsLost} bidding pts, ${totalAttendance} attendance pts) by ${member.user.username}`
            );
          } else {
            throw new Error(
              result.message || "Member not found"
            );
          }
        } catch (err) {
          console.error("❌ Remove member error:", err);
          await message.reply(
            `❌ **Failed to remove member!**\n\n` +
              `Error: ${err.message}\n\n` +
              `The member might not exist in the sheet, or there was a connection error.`
          );
        }
      },
      async (confirmMsg) => {
        await message.reply("❌ Member removal canceled.");
      }
    );
  },

  // ==========================================
  // LEADERBOARD COMMANDS
  // ==========================================

  leaderboardattendance: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📊 ${member.user.username} requested attendance leaderboard`);
    await leaderboardSystem.displayAttendanceLeaderboard(message);
  },

  leaderboardbidding: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📊 ${member.user.username} requested bidding leaderboard`);
    await leaderboardSystem.displayBiddingLeaderboard(message);
  },

  leaderboards: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📊 ${member.user.username} requested combined leaderboards`);
    await leaderboardSystem.displayCombinedLeaderboards(message);
  },

  // ==========================================
  // WEEKLY & MONTHLY REPORT COMMANDS (Phase 6)
  // ==========================================

  weekly: async (message, member) => {
    try {
      console.log(`📊 ${member.user.username} requested weekly report`);
      await message.channel.send('📊 Generating weekly report...');

      const data = await reports.generateWeeklyReport();
      const embed = reports.buildWeeklyReportEmbed(data);

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Failed to generate weekly report:', error);
      await message.reply('⚠️ Failed to generate weekly report. Please try again later.');
    }
  },

  monthly: async (message, member) => {
    try {
      console.log(`📊 ${member.user.username} requested monthly report`);
      await message.channel.send('📊 Generating monthly report...');

      const data = await reports.generateMonthlyReport();
      const embed = reports.buildMonthlyReportEmbed(data);

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Failed to generate monthly report:', error);
      await message.reply('⚠️ Failed to generate monthly report. Please try again later.');
    }
  },

  weeklyreport: async (message, member) => {
    // Permission check is done in routing logic
    console.log(`📅 ${member.user.username} manually triggered weekly report in channel: ${message.channel?.name || message.channel?.id}`);
    await message.reply({ content: "📊 Generating weekly report...", failIfNotExists: false });

    // Validate channel before passing
    if (!message.channel) {
      console.error('❌ message.channel is null/undefined');
      await message.reply({ content: "❌ Error: Unable to determine channel for report", failIfNotExists: false });
      return;
    }

    // Pass the channel where the command was invoked so report is sent only there
    await leaderboardSystem.sendWeeklyReport(message.channel);
  },

  monthlyreport: async (message, member) => {
    try {
      // Permission check is done in routing logic
      console.log(`📅 ${member.user.username} manually triggered monthly report`);

      // Validate channel exists before proceeding
      if (!message.channel) {
        console.error('❌ message.channel is null/undefined');
        await message.reply({ content: "❌ Error: Unable to determine channel for report", failIfNotExists: false });
        return;
      }

      // Pass the channel where the command was invoked so report is sent only there
      await leaderboardSystem.sendMonthlyReport(message.channel);
      console.log(`✅ Monthly report command completed successfully`);
    } catch (error) {
      console.error(`❌ Error in monthlyreport command:`, error);
      await message.reply(`❌ Error generating monthly report: ${error.message}`).catch(err => errorHandler.silentError(err, 'monthly report error reply'));
    }
  },

  // ==========================================
  // ACTIVITY HEATMAP COMMANDS
  // ==========================================

  activity: async (message, member) => {
    try {
      // Permission check is done in routing logic
      const args = message.content.trim().split(/\s+/).slice(1);
      const mode = args[0]?.toLowerCase();

      console.log(`📊 ${member.user.username} requested activity heatmap${mode ? ` (${mode})` : ''}`);
      await activityHeatmap.displayActivityHeatmap(message, mode);
      console.log(`✅ Activity heatmap command completed successfully`);
    } catch (error) {
      console.error(`❌ Error in activity command:`, error);
      await message.reply(`❌ Error generating activity heatmap: ${error.message}`).catch(err => errorHandler.silentError(err, 'activity heatmap error reply'));
    }
  },


  // =========================================================================
  // STANDALONE EMERGENCY COMMAND HANDLERS
  // =========================================================================
  // These wrap the emergency-commands module for easier access

  /**
   * Force close a specific attendance thread
   * Usage: !forceclosethread | !fct
   */
  forceclosethread: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['close', message.channel.id]);
  },

  // =========================================================================
  // SETUP COMMAND - Configure bot channels and guild (admin only)
  // =========================================================================
  setup: async (message, member, args) => {
    if (!deps.isAdmin(member)) {
      await message.reply('❌ Admin only command.');
      return;
    }

    if (args.length === 0) {
      await message.reply(
        '**Usage:** `!setup <feature>`\n\n' +
        '**Features:**\n' +
        '• `guild` - Set this guild as the main server\n' +
        '• `timer` - Set this channel as the boss timer channel\n' +
        '• `attendance` - Set this channel as the attendance channel\n' +
        '• `bidding` - Set this channel as the bidding channel\n' +
        '• `admin` - Set this channel as the admin logs channel\n' +
        '• `spawn` - Set this channel as the boss spawn announcement channel\n' +
        '• `reminders` - Set this channel for event reminders\n' +
        '• `commands` - Set this channel as the guild commands channel\n' +
        '• `bot` - Set this channel as the bot commands channel\n' +
        '• `adminrole <@role>` - Add a role as admin (@mention the role)\n' +
        '• `adminrole remove <@role>` - Remove a role from admin list\n' +
        '• `view` - Show current configuration\n\n' +
        '💡 Run `!setup <feature>` **in** the channel you want to configure.'
      );
      return;
    }

    const feature = args[0].toLowerCase();
    const channelId = message.channel.id;
    const guildId = message.guild ? message.guild.id : null;

    if (!guildId) {
      await message.reply('❌ This command must be used in a server channel.');
      return;
    }

    try {
      const fs = require('fs');
      const configPath = __dirname + '/../config.json';
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      switch (feature) {
        case 'guild':
          fileConfig.main_guild_id = guildId;
          fileConfig.timer_server_id = guildId;
          config.main_guild_id = guildId;
          config.timer_server_id = guildId;
          await message.reply(`✅ **Guild configured!** This server is now the main guild. Run \`!setup <feature>\` in each channel to complete setup.`);
          break;

        case 'timer':
          fileConfig.boss_timer_channel_id = channelId;
          fileConfig.timer_channel_id = channelId;
          config.boss_timer_channel_id = channelId;
          config.timer_channel_id = channelId;
          await message.reply(`✅ **Timer channel configured!** <#${channelId}> is now the boss timer channel.`);
          break;

        case 'attendance':
          fileConfig.attendance_channel_id = channelId;
          config.attendance_channel_id = channelId;
          await message.reply(`✅ **Attendance channel configured!** <#${channelId}> is now the attendance channel.`);
          break;

        case 'bidding':
          fileConfig.bidding_channel_id = channelId;
          config.bidding_channel_id = channelId;
          await message.reply(`✅ **Bidding channel configured!** <#${channelId}> is now the bidding channel.`);
          break;

        case 'admin':
          fileConfig.admin_logs_channel_id = channelId;
          config.admin_logs_channel_id = channelId;
          await message.reply(`✅ **Admin logs configured!** <#${channelId}> is now the admin logs channel.`);
          break;

        case 'commands':
          fileConfig.tenchu_commands_channel_id = channelId;
          config.tenchu_commands_channel_id = channelId;
          await message.reply(`✅ **Commands channel configured!** <#${channelId}> is now the guild commands channel.`);
          break;

        case 'bot':
          fileConfig.bot_manual_channel_id = channelId;
          config.bot_manual_channel_id = channelId;
          await message.reply(`✅ **Bot commands configured!** <#${channelId}> is now the bot commands channel.`);
          break;

        case 'spawn':
          fileConfig.boss_spawn_announcement_channel_id = channelId;
          config.boss_spawn_announcement_channel_id = channelId;
          await message.reply(`✅ **Spawn announcement channel configured!** <#${channelId}> will now receive 5-minute boss spawn announcements with @everyone pings.`);
          break;

        case 'reminders':
          fileConfig.reminders_channel_id = channelId;
          config.reminders_channel_id = channelId;
          await message.reply(`✅ **Reminders channel configured!** <#${channelId}> will now receive event reminders.`);
          break;

        case 'view':
          const fields = [
            { name: '🏰 Main Guild', value: config.main_guild_id ? `<#${config.main_guild_id}>` : '❌ Not set', inline: true },
            { name: '⏱️ Timer Channel', value: config.boss_timer_channel_id ? `<#${config.boss_timer_channel_id}>` : '❌ Not set', inline: true },
            { name: '🎯 Attendance', value: config.attendance_channel_id ? `<#${config.attendance_channel_id}>` : '❌ Not set', inline: true },
            { name: '💰 Bidding', value: config.bidding_channel_id ? `<#${config.bidding_channel_id}>` : '❌ Not set', inline: true },
            { name: '👑 Admin Logs', value: config.admin_logs_channel_id ? `<#${config.admin_logs_channel_id}>` : '❌ Not set', inline: true },
            { name: '💬 Commands', value: config.tenchu_commands_channel_id ? `<#${config.tenchu_commands_channel_id}>` : '❌ Not set', inline: true },
            { name: '🤖 Bot Commands', value: config.bot_manual_channel_id ? `<#${config.bot_manual_channel_id}>` : '❌ Not set', inline: true },
            { name: '🔔 Spawn Announcements', value: config.boss_spawn_announcement_channel_id ? `<#${config.boss_spawn_announcement_channel_id}>` : '❌ Not set', inline: true },
            { name: '📅 Reminders', value: config.reminders_channel_id ? `<#${config.reminders_channel_id}>` : '❌ Not set', inline: true },
            { name: '👑 Admin Roles', value: config.admin_roles.length > 0 ? config.admin_roles.map(id => `<@&${id}>`).join(', ') : '❌ None configured', inline: false },
          ];
          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📋 Current Configuration')
            .addFields(fields)
            .setFooter({ text: 'Use !setup <feature> in the target channel to configure' })
            .setTimestamp();
          await message.reply({ embeds: [embed] });
          return;

        case 'adminrole':
          if (args.length < 2) {
            await message.reply('Usage: `!setup adminrole <@role>` or `!setup adminrole remove <@role>`\n\nAdd or remove roles that have admin access to the bot. Mention the role with @.');
            return;
          }
          if (args[1] === 'remove') {
            if (args.length < 3) {
              await message.reply('Usage: `!setup adminrole remove <@role>`\n\nRemove a role from admin list. Mention the role with @.');
              return;
            }
            const removeRoleRole = message.mentions.roles.first();
            if (!removeRoleRole) {
              await message.reply('❌ Please mention the role to remove (e.g., `!setup adminrole remove @Leader`).');
              return;
            }
            const roleIndex = fileConfig.admin_roles.indexOf(removeRoleRole.id);
            if (roleIndex === -1) {
              await message.reply(`❌ Role **${removeRoleRole.name}** is not in the admin list.`);
              return;
            }
            fileConfig.admin_roles.splice(roleIndex, 1);
            config.admin_roles = fileConfig.admin_roles;
            await message.reply(`✅ Removed **${removeRoleRole.name}** (\`${removeRoleRole.id}\`) from admin roles.`);
          } else {
            const addRoleRole = message.mentions.roles.first();
            if (!addRoleRole) {
              await message.reply('❌ Please mention the role to add (e.g., `!setup adminrole @Leader`).');
              return;
            }
            if (fileConfig.admin_roles.includes(addRoleRole.id)) {
              await message.reply(`ℹ️ **${addRoleRole.name}** (\`${addRoleRole.id}\`) is already an admin role.`);
              return;
            }
            fileConfig.admin_roles.push(addRoleRole.id);
            config.admin_roles = fileConfig.admin_roles;
            await message.reply(`✅ Added **${addRoleRole.name}** (\`${addRoleRole.id}\`) to admin roles.`);
          }
          // Write updated config to disk (this feature writes immediately, not at end of switch)
          fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2), 'utf8');
          return;

        default:
          await message.reply(`❌ Unknown feature: \`${feature}\`. Try: guild, timer, attendance, bidding, admin, spawn, commands, bot, reminders, adminrole, or view.`);
          return;
      }

      // Write updated config to disk
      fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2), 'utf8');

    } catch (err) {
      console.error('❌ Setup error:', err);
      await message.reply(`❌ Failed to save configuration: ${err.message}`);
    }
  },

  /**
   * Force close ALL attendance threads
   * Usage: !forcecloseallthreads | !fcat
   */
  forcecloseallthreads: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['closeall']);
  },

  /**
   * Force end stuck auction
   * Usage: !forceendauction | !fea
   */
  forceendauction: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['endauction']);
  },

  /**
   * Unlock all locked bidding points
   * Usage: !unlockallpoints | !unlock
   */
  unlockallpoints: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['unlock']);
  },

  /**
   * Clear all pending bid confirmations
   * Usage: !clearallbids | !clearbids
   */
  clearallbids: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['clearbids']);
  },

  /**
   * Show comprehensive state diagnostics
   * Usage: !diagnostics | !diag
   */
  diagnostics: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['diag']);
  },

  /**
   * Force sync state to Google Sheets
   * Usage: !forcesync | !fsync
   */
  forcesync: async (message, member) => {
    await emergencyCommands.handleEmergencyCommand(message, ['sync']);
  },

  /**
   * Boss rotation management commands
   * Usage: !rotation status | !rotation set <boss> <index> | !rotation increment <boss>
   */
  rotation: async (message, member) => {
    if (!isAdmin(member)) {
      await message.reply('❌ Admin-only command.');
      return;
    }

    const args = message.content.trim().split(/\s+/).slice(1); // Remove "!rotation"
    const subcommand = args[0]?.toLowerCase();

    try {
      // !rotation status - Show all rotation statuses with ML predictions
      if (!subcommand || subcommand === 'status') {
        const rotations = await bossRotation.getAllRotations();
        const rotatingBosses = bossRotation.getRotatingBosses();

        if (Object.keys(rotations).length === 0) {
          await message.reply('⚠️ No rotation data available. BossRotation sheet may not be set up.');
          return;
        }

        const embeds = [];
        let embed = new EmbedBuilder()
          .setColor(0x4a90e8)
          .setTitle('🔄 Boss Rotation Status')
          .setDescription('Current rotation for 5-guild system with ML-enhanced spawn predictions')
          .setTimestamp();

        let fieldCount = 0;
        const MAX_FIELDS = 25;

        const bossData = [];

        for (const boss of rotatingBosses) {
          const rotation = rotations[boss];
          if (rotation) {
            const emoji = rotation.isOurTurn ? '🟢' : '🔴';
            const status = rotation.isOurTurn ? `${guildName}'S TURN` : `${rotation.currentGuild}'s turn`;

            // Get spawn time - check boss timer first, then fall back to attendance predictions
            let spawnInfo = '';
            let spawnTimestamp = null;
            let mlWindow = '';
            let isFromTimer = false;

            // First, check boss timer for recorded spawn times
            try {
              const timerData = bossTimer.getNextSpawn(boss);
              if (timerData && timerData.nextSpawn) {
                spawnTimestamp = Math.floor(timerData.nextSpawn.getTime() / 1000);
                isFromTimer = true;
              }
            } catch (timerError) {
              // Silently continue to prediction fallback
            }

            // Fallback: Get last spawn from attendance records
            if (!spawnTimestamp) {
              try {
                const lastSpawn = await mongoHelpers.getLastBossSpawn(boss);
                if (lastSpawn && lastSpawn.timestamp && bossSpawnConfig && bossSpawnConfig.timerBasedBosses[boss]) {
                  const bossConfig = bossSpawnConfig.timerBasedBosses[boss];
                  const intervalMs = bossConfig.spawnIntervalHours * 60 * 60 * 1000;
                  const lastSpawnDate = new Date(lastSpawn.timestamp);
                  const now = new Date();

                  // Calculate next spawn by adding intervals until we get a future time
                  let nextSpawnDate = new Date(lastSpawnDate.getTime() + intervalMs);
                  while (nextSpawnDate < now) {
                    nextSpawnDate = new Date(nextSpawnDate.getTime() + intervalMs);
                  }

                  spawnTimestamp = Math.floor(nextSpawnDate.getTime() / 1000);
                  mlWindow = ' 📋'; // Attendance-based prediction
                }
              } catch (attendanceError) {
                // Silently continue without spawn info
              }
            }

            if (spawnTimestamp) {
              const sourceIndicator = isFromTimer ? ' ⏱️' : mlWindow;
              spawnInfo = `\n📍 Next Spawn: <t:${spawnTimestamp}:R>${sourceIndicator}`;
            }

            const guildCount = rotation.guilds ? rotation.guilds.length : 5;
            const nextGuild = rotation.guilds
              ? rotation.guilds[rotation.currentIndex % guildCount]
              : (rotation.nextGuild || rotation.currentGuild || 'Unknown');

            bossData.push({
              boss,
              emoji,
              status,
              rotation,
              guildCount,
              nextGuild,
              spawnInfo,
              isOurTurn: rotation.isOurTurn || false,
              sortKey: spawnTimestamp ? spawnTimestamp * 1000 : Number.MAX_SAFE_INTEGER
            });
          }
        }

        bossData.sort((a, b) => {
          if (a.isOurTurn !== b.isOurTurn) {
            return b.isOurTurn ? 1 : -1;
          }
          return a.sortKey - b.sortKey;
        });

        for (const data of bossData) {
          if (fieldCount === MAX_FIELDS) {
            embeds.push(embed);
            embed = new EmbedBuilder()
              .setColor(0x4a90e8)
              .setTitle('🔄 Boss Rotation Status (cont.)')
              .setTimestamp();
            fieldCount = 0;
          }

          embed.addFields({
            name: `${data.emoji} ${data.boss}`,
            value: `Guild ${data.rotation.currentIndex}/${data.guildCount} - **${data.status}**\nNext: ${data.nextGuild}${data.spawnInfo}`,
            inline: false
          });
          fieldCount++;
        }

        embeds.push(embed);
        await message.reply({ embeds });
      }
      // !rotation set <boss> <index> - Manually set rotation
      else if (subcommand === 'set') {
        // Parse boss name (can be multi-word like "Baron Braudmore")
        // Last arg should be the index, everything else is the boss name
        if (args.length < 3) {
          await message.reply('❌ Usage: `!rotation set <boss> <index>`\nExample: `!rotation set Baron Braudmore 1`');
          return;
        }

        const newIndex = parseInt(args[args.length - 1]); // Last arg is the index
        const rawBossName = args.slice(1, -1).join(' '); // Everything between subcommand and index

        if (!rawBossName || isNaN(newIndex)) {
          await message.reply('❌ Usage: `!rotation set <boss> <index>`\nExample: `!rotation set Baron Braudmore 1`');
          return;
        }

        // Use fuzzy matching to find the correct boss name
        const bossName = findBossMatch(rawBossName, bossPoints);
        if (!bossName) {
          await message.reply(`❌ Unknown boss: "${rawBossName}"\n💡 Try: Amentis, Baron Braudmore, or General Aquleus`);
          return;
        }

        // Get rotation data to check guild count for this specific boss
        const rotations = await bossRotation.getAllRotations();
        const rotation = rotations[bossName];

        if (!rotation) {
          await message.reply(`❌ **${bossName}** is not a rotating boss`);
          return;
        }

        const guildCount = rotation.guilds ? rotation.guilds.length : 5;

        if (newIndex < 1 || newIndex > guildCount) {
          await message.reply(`❌ Index must be between 1 and ${guildCount} for **${bossName}** (${guildCount}-guild rotation)`);
          return;
        }

        await message.reply(`⚙️ Setting **${bossName}** rotation to index ${newIndex}...`);

        const result = await bossRotation.setRotation(bossName, newIndex);

        if (result.success) {
          const emoji = result.data.isOurTurn ? '🟢' : '🔴';
          const status = result.data.isOurTurn ? `${guildName}'S TURN` : `${result.data.currentGuild}'s turn`;
          await message.reply(
            `✅ **${bossName}** rotation set to index **${newIndex}**\n\n` +
            `${emoji} Status: **${status}**\n` +
            `Guild: ${result.data.currentGuild}`
          );
        } else {
          await message.reply(`❌ ${result.message}`);
        }
      }
      // !rotation increment <boss> - Manually advance rotation
      else if (subcommand === 'increment' || subcommand === 'inc') {
        // Parse boss name (can be multi-word like "Baron Braudmore")
        // Everything after the subcommand is the boss name
        if (args.length < 2) {
          await message.reply('❌ Usage: `!rotation increment <boss>`\nExample: `!rotation increment Baron Braudmore`');
          return;
        }

        const rawBossName = args.slice(1).join(' '); // Join all remaining args

        // Use fuzzy matching to find the correct boss name
        const bossName = findBossMatch(rawBossName, bossPoints);
        if (!bossName) {
          await message.reply(`❌ Unknown boss: "${rawBossName}"\n💡 Try: Amentis, Baron Braudmore, or General Aquleus`);
          return;
        }

        await message.reply(`🔄 Advancing **${bossName}** rotation...`);

        const result = await bossRotation.incrementRotation(bossName);

        if (result.updated !== false) {
          const emoji = result.isNowOurTurn ? '🟢' : '🔴';
          const status = result.isNowOurTurn ? `${guildName}'S TURN` : `${result.newGuild}'s turn`;
          await message.reply(
            `✅ **${bossName}** rotation advanced\n\n` +
            `${result.oldIndex} (${result.oldGuild}) → ${result.newIndex} (${result.newGuild})\n\n` +
            `${emoji} Status: **${status}**`
          );
        } else {
          await message.reply(`❌ ${bossName} is not a rotating boss or update failed`);
        }
      }
      // !rotation refresh - Force reload rotation data from Google Sheets
      else if (subcommand === 'refresh' || subcommand === 'reload') {
        await message.reply('🔄 Refreshing rotation data from Google Sheets...');

        await bossRotation.refreshRotationCache();

        const rotations = await bossRotation.getAllRotations();
        const rotatingBosses = bossRotation.getRotatingBosses();

        if (Object.keys(rotations).length === 0) {
          await message.reply('⚠️ No rotation data found after refresh. BossRotation sheet may not be set up.');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Rotation Data Refreshed')
          .setDescription(`Loaded ${rotatingBosses.length} rotating bosses from Google Sheets`)
          .setTimestamp();

        for (const boss of rotatingBosses) {
          const rotation = rotations[boss];
          if (rotation) {
            const emoji = rotation.isOurTurn ? '🟢' : '🔴';
            const status = rotation.isOurTurn ? `${guildName}'S TURN` : `${rotation.currentGuild}'s turn`;
            embed.addFields({
              name: `${emoji} ${boss}`,
              value: `Guild ${rotation.currentIndex}/${rotation.guilds ? rotation.guilds.length : 5} - **${status}**`,
              inline: false
            });
          }
        }

        await message.reply({ embeds: [embed] });
      }
      else {
        await message.reply(
          `❌ Unknown subcommand: ${subcommand}\n\n` +
          `**Valid commands:**\n` +
          `• \`!rotation\` or \`!rotation status\` - Show all rotation statuses\n` +
          `• \`!rotation set <boss> <index>\` - Set rotation (1-5)\n` +
          `  Example: \`!rotation set Baron Braudmore 3\`\n` +
          `• \`!rotation increment <boss>\` - Advance rotation\n` +
          `  Example: \`!rotation inc General Aquleus\`\n` +
          `• \`!rotation refresh\` - Reload boss data from Google Sheets\n\n` +
          `💡 **Tip:** Boss names support fuzzy matching! Try "baron", "braud", or "aquleus"`
        );
      }
    } catch (error) {
      console.error('[ROTATION] Command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
    },

    // =========================================================================
    // SYNCATTEND - Scan attendance threads for a given week and rebuild data
    // =========================================================================
    syncattend: async (message, member) => {
      if (!isAdmin(member)) {
        await message.reply('❌ Admin-only command.');
        return;
      }

      // Parse args: !syncattend 5/17/2026
      const args = message.content.split(' ').slice(1);
      if (args.length === 0) {
        await message.reply('❌ Usage: `!syncattend <date>` - e.g., `!syncattend 5/17/2026`\nThis will scan all attendance threads for the week containing that date and rebuild the attendance sheet.');
        return;
      }

      const inputDate = new Date(args[0]);
      if (isNaN(inputDate.getTime())) {
        await message.reply('❌ Invalid date. Use format: M/D/YYYY (e.g., `!syncattend 5/17/2026`)');
        return;
      }

      // Calculate week boundaries in Manila timezone
      const manilaOffset = 8 * 60; // Asia/Manila is UTC+8
      const localDate = new Date(inputDate.getTime() + (inputDate.getTimezoneOffset() + manilaOffset) * 60000);

      // Find the Sunday of this week
      const sunday = new Date(localDate);
      sunday.setDate(sunday.getDate() - sunday.getDay()); // Go back to Sunday
      sunday.setHours(0, 0, 0, 0);

      // Saturday (end of week)
      const saturday = new Date(sunday);
      saturday.setDate(saturday.getDate() + 6);
      saturday.setHours(23, 59, 59, 999);

      // Generate week index for sheet name (yyyyMMdd)
      const padNum = (n) => String(n).padStart(2, '0');
      const weekIndex = `${sunday.getFullYear()}${padNum(sunday.getMonth() + 1)}${padNum(sunday.getDate())}`;

      const weekStartStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const weekEndStr = saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const statusMsg = await message.reply(`🔄 Scanning attendance threads for week of **${weekStartStr}** - **${weekEndStr}**...`);

      try {
        const guild = message.guild;
        const attChannel = await guild.channels.fetch(config.attendance_channel_id);
        if (!attChannel) {
          await statusMsg.edit('❌ Attendance channel not found.');
          return;
        }

        // Fetch archived threads (paginate to get enough)
        const allThreads = [];
        let lastId = null;
        let hasMore = true;
        let fetchCount = 0;
        const MAX_FETCH = 500; // Safety limit

        while (hasMore && fetchCount < MAX_FETCH) {
          const options = { limit: 100 };
          if (lastId) options.before = lastId;

          const archived = await attChannel.threads.fetchArchived(options);

          if (archived.threads.size === 0) {
            hasMore = false;
            break;
          }

          for (const [id, thread] of archived.threads) {
            allThreads.push(thread);
            fetchCount++;
          }

          lastId = archived.threads.last()?.id;
        }

        // Also fetch active threads
        const active = await attChannel.threads.fetchActive();
        for (const [id, thread] of active.threads) {
          allThreads.push(thread);
        }

        // Filter threads that fall within our target week (by creation date)
        const weekThreads = allThreads.filter(t => {
          const created = t.createdAt;
          return created >= sunday && created <= saturday;
        });

        if (weekThreads.length === 0) {
          await statusMsg.edit(`ℹ️ No attendance threads found for week of ${weekStartStr} - ${weekEndStr}.`);
          return;
        }

        await statusMsg.edit(`🔄 Found ${weekThreads.length} threads. Scanning messages for check-ins...`);

        // Scan each thread for check-in messages
        const attendanceData = [];
        const checkInKeywords = ['here', 'present', 'join', 'checkin', 'check-in', 'attending'];
        let processed = 0;
        let threadsWithData = 0;

        for (const thread of weekThreads) {
          processed++;

          // Update progress every 5 threads
          if (processed % 5 === 0 || processed === weekThreads.length) {
            await statusMsg.edit(`🔄 Scanning thread ${processed}/${weekThreads.length}: ${threadsWithData} with check-ins found so far...`);
          }

          try {
            // Parse thread name: [MM/DD/YY HH:MM] BossName
            const nameMatch = thread.name.match(/^\[(\d{2}\/\d{2}\/\d{2} \d{1,2}:\d{2})\] (.+)$/);
            if (!nameMatch) continue;

            const timestamp = nameMatch[1]; // "05/17/26 12:00"
            const bossName = nameMatch[2];  // "VALAKAS"

            // Fetch ALL messages by paginating backwards (check-ins are typically the earliest messages)
            // Without 'before', Discord returns the latest messages, so we paginate to get everything
            const allThreadMessages = [];
            let beforeId = undefined;
            let reachedEnd = false;

            for (let page = 0; page < 3 && !reachedEnd; page++) { // Max 3 pages = ~300 messages
              const options = { limit: 100 };
              if (beforeId) options.before = beforeId;

              const batch = await thread.messages.fetch(options).catch(() => null);
              if (!batch || batch.size === 0) break;

              const msgs = [...batch.values()];
              allThreadMessages.push(...msgs);

              if (batch.size < 100) reachedEnd = true;
              else beforeId = msgs[msgs.length - 1].id;
            }

            const checkInMembers = [];
            for (const msg of allThreadMessages) {
              if (msg.author.bot) continue;
              const content = msg.content.toLowerCase().trim();
              if (!content) continue;
              const firstWord = content.split(/\s+/)[0];

              // Strip trailing punctuation for better keyword matching
              const cleanWord = firstWord.replace(/[^a-z0-9-]/g, '');

              if (checkInKeywords.some(kw => cleanWord === kw)) {
                // Get display name — prefer nickname, fallback to displayName, then username
                let displayName;
                try {
                  displayName = msg.member?.nickname || msg.member?.displayName || msg.author.displayName || msg.author.username;
                } catch {
                  displayName = msg.author.displayName || msg.author.username;
                }
                checkInMembers.push(displayName);
              }
            }

            // Deduplicate
            const uniqueMembers = [...new Set(checkInMembers)];

            if (uniqueMembers.length > 0) {
              attendanceData.push({
                boss: bossName,
                timestamp: timestamp,
                members: uniqueMembers
              });
              threadsWithData++;
            }
          } catch (err) {
            console.warn(`⚠️ Error scanning thread "${thread.name}": ${err.message}`);
          }

          // Small delay to avoid rate limits
          if (processed % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (attendanceData.length === 0) {
          await statusMsg.edit(`ℹ️ No check-in data found in ${weekThreads.length} threads for week of ${weekStartStr} - ${weekEndStr}.`);
          return;
        }

        await statusMsg.edit(`🔄 Writing ${attendanceData.length} spawn records (${attendanceData.reduce((sum, s) => sum + s.members.length, 0)} check-ins) to sheet...`);

        // Send to Code.js
        const result = await sheetAPI.call('syncWeekAttendance', {
          weekIndex: weekIndex,
          attendanceData: attendanceData
        });

        await statusMsg.edit(
          `✅ **Week Sync Complete!**\n\n` +
          `**Week:** ${weekStartStr} - ${weekEndStr}\n` +
          `**Threads Scanned:** ${weekThreads.length}\n` +
          `**Spawns Written:** ${attendanceData.length}\n` +
          `**Total Check-ins:** ${attendanceData.reduce((sum, s) => sum + s.members.length, 0)}\n` +
          `**Sheet:** ${result.sheetName || weekIndex}`
        );

        console.log(`✅ SyncAttendance: ${attendanceData.length} spawns, ${weekThreads.length} threads scanned for week ${weekIndex}`);
      } catch (error) {
        console.error('❌ SyncAttendance error:', error);
        await statusMsg.edit(`❌ Sync failed: ${error.message}`);
      }
    },

    // =========================================================================
    // SYNCREGISTRY - Manually sync all guild members to Member Registry
    // =========================================================================
    syncregistry: async (message, member) => {
      if (!isAdmin(member)) {
        await message.reply('❌ Admin-only command.');
        return;
      }

      const statusMsg = await message.reply('🔄 Syncing all guild members to Member Registry...');

      try {
        // Fetch all members from guild
        const guild = message.guild;
        await guild.members.fetch(); // Ensure full cache

        const members = guild.members.cache;
        const registryMembers = [];

        for (const [id, guildMember] of members) {
          // Skip bots
          if (guildMember.user.bot) continue;

          const nickname = guildMember.nickname || guildMember.displayName || guildMember.user.username;
          registryMembers.push({
            discordId: id,
            nickname: nickname,
            discordUsername: guildMember.user.username
          });
        }

        // Send in batches of 50 to avoid payload size limits
        const batchSize = 50;
        let totalAdded = 0;
        let totalUpdated = 0;

        for (let i = 0; i < registryMembers.length; i += batchSize) {
          const batch = registryMembers.slice(i, i + batchSize);
          const result = await sheetAPI.call('syncMemberRegistry', { members: batch });
          if (result.status === 'ok') {
            // Parse result message for counts if available
            const match = result.message?.match(/(\d+) added.*(\d+) updated/);
            if (match) {
              totalAdded += parseInt(match[1]);
              totalUpdated += parseInt(match[2]);
            }
          }
          // Update progress every batch
          if (i % (batchSize * 2) === 0 && i > 0) {
            await statusMsg.edit(`🔄 Syncing... ${Math.min(i + batchSize, registryMembers.length)}/${registryMembers.length} members processed`);
          }
        }

        await statusMsg.edit(
          `✅ **Registry Sync Complete!**\n\n` +
          `**Total Members:** ${registryMembers.length}\n` +
          `**Bots Skipped:** ${members.filter(m => m.user.bot).size}\n\n` +
          `The Member Registry in your Google Sheet now has Discord ID mappings for all guild members.`
        );

        console.log(`✅ Registry sync: ${registryMembers.length} members synced`);
      } catch (error) {
        console.error('❌ Registry sync error:', error);
        await statusMsg.edit(`❌ Sync failed: ${error.message}`);
      }
    },
  };

  return commandHandlers;
}

module.exports = { createCommandHandlers };