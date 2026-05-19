/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - CHANNEL-AWARE HELP SYSTEM v10.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Channel-specific command filtering
 * - Only shows commands available in current channel
 * - Admin vs Member permission filtering
 * - Context-aware help messages
 * - Clear channel indicators
 * - Optimized for user experience
 */

const { EmbedBuilder } = require("discord.js");

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
 // ═══════════════════════════════════════════════════════════════════════════

const EMOJI = {
  SUCCESS: "✅",
  INFO: "ℹ️",
  BOSS: "🎯",
  ADMIN: "👑",
  MEMBER: "👥",
  COIN: "💰",
  ROBOT: "🤖",
  BOOK: "📖",
  LIGHTNING: "⚡",
  SHIELD: "🛡️",
  HAMMER: "🔨",
  CHART: "📊",
  TROPHY: "🏆",
  EMERGENCY: "🚨",
};

const COLORS = {
  PRIMARY: 0x5865F2,      // Discord Blurple
  SUCCESS: 0x57F287,      // Green
  ATTENDANCE: 0x3498DB,   // Blue
  AUCTION: 0xF1C40F,      // Gold
  AI: 0x9B59B6,           // Purple
  EMERGENCY: 0xE74C3C,    // Dark Red
  INFO: 0x95A5A6,         // Gray
};

// Channel types enum
const CHANNEL_TYPES = {
  ADMIN_LOGS: 'admin_logs',
  ATTENDANCE: 'attendance',
  ATTENDANCE_THREAD: 'attendance_thread',
  BIDDING: 'bidding',
  AUCTION_THREAD: 'auction_thread',
  GUILD_CHAT: 'guild_chat',
  BOT_COMMANDS: 'bot_commands',
  BOSS_TIMER: 'boss_timer',
  UNKNOWN: 'unknown'
};

let config = null;
let isAdminFunc = null;
let BOT_VERSION = "10.0.0 - Channel-Aware Edition";

function initialize(cfg, adminFunc, version) {
  config = cfg;
  isAdminFunc = adminFunc;
  if (version) BOT_VERSION = version;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detects which channel type the message is in
 * @param {Message} message - Discord message object
 * @returns {string} Channel type from CHANNEL_TYPES
 */
function detectChannelType(message) {
  const channelId = message.channel.id;
  const parentId = message.channel.isThread() ? message.channel.parentId : null;

  // Admin logs
  if (channelId === config.admin_logs_channel_id || parentId === config.admin_logs_channel_id) {
    return CHANNEL_TYPES.ADMIN_LOGS;
  }

  // Attendance (thread check first)
  if (message.channel.isThread() && parentId === config.attendance_channel_id) {
    return CHANNEL_TYPES.ATTENDANCE_THREAD;
  }
  if (channelId === config.attendance_channel_id) {
    return CHANNEL_TYPES.ATTENDANCE;
  }

  // Bidding/Auction (thread check first)
  if (message.channel.isThread() && parentId === config.bidding_channel_id) {
    return CHANNEL_TYPES.AUCTION_THREAD;
  }
  if (channelId === config.bidding_channel_id) {
    return CHANNEL_TYPES.BIDDING;
  }

  // Guild chat
  if (channelId === config.elysium_commands_channel_id || parentId === config.elysium_commands_channel_id) {
    return CHANNEL_TYPES.GUILD_CHAT;
  }

  // Bot commands channel
  if (channelId === config.bot_manual_channel_id || parentId === config.bot_manual_channel_id) {
    return CHANNEL_TYPES.BOT_COMMANDS;
  }

  // Boss timer channel
  if (channelId === config.boss_timer_channel_id) {
    return CHANNEL_TYPES.BOSS_TIMER;
  }

  return CHANNEL_TYPES.UNKNOWN;
}

/**
 * Gets user-friendly channel name
 * @param {string} channelType - Channel type from CHANNEL_TYPES
 * @returns {string} Friendly channel name
 */
function getChannelName(channelType) {
  const names = {
    [CHANNEL_TYPES.ADMIN_LOGS]: "Admin Logs",
    [CHANNEL_TYPES.ATTENDANCE]: "Attendance Channel",
    [CHANNEL_TYPES.ATTENDANCE_THREAD]: "Attendance Thread",
    [CHANNEL_TYPES.BIDDING]: "Bidding Channel",
    [CHANNEL_TYPES.AUCTION_THREAD]: "Auction Thread",
    [CHANNEL_TYPES.GUILD_CHAT]: "Guild Chat",
    [CHANNEL_TYPES.BOT_COMMANDS]: "Bot Commands",
    [CHANNEL_TYPES.BOSS_TIMER]: "Boss Timer Channel",
    [CHANNEL_TYPES.UNKNOWN]: "This Channel"
  };
  return names[channelType] || "Unknown Channel";
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND DEFINITIONS WITH CHANNEL RESTRICTIONS
// ═══════════════════════════════════════════════════════════════════════════

const COMMANDS = {
  // ─────────────────────────────────────────────────────────────────────────
  // ATTENDANCE THREAD COMMANDS (inside threads only)
  // ─────────────────────────────────────────────────────────────────────────
  attendance_thread: {
    present: {
      usage: "present",
      description: "Check in for boss attendance. Type the keyword AND attach a screenshot of the boss kill in ONE message. 💡 Accepted keywords: present, here, join, checkin (typos auto-corrected). The keyword and screenshot MUST be in the SAME message or verification will fail. Admins will see confirm buttons to verify you.",
      aliases: ["here", "join", "checkin"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUCTION THREAD COMMANDS (inside auction threads only)
  // ─────────────────────────────────────────────────────────────────────────
  auction_thread: {
    bid: {
      usage: "!bid <amount> / /bid <amount>",
      description: "Place a bid on the current auction item. 💡 Only works inside auction threads. The !b alias is faster. Your bid must be higher than the current highest bid. Bids are binding and deduct from your point balance if you win. Example: !bid 1000 bids 1000 points.",
      aliases: ["!b"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.AUCTION_THREAD],
      category: "Auction"
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BOSS TIMER COMMANDS (boss timer channel only)
  // ─────────────────────────────────────────────────────────────────────────
  boss_timer: {
    killed: {
      usage: "!killed <boss> [time]",
      description: "Record a boss kill with optional kill time. 💡 Boss names are fuzzy-matched (\"ven\" → \"Venatus\"). Times default to now if not specified. Example: !killed venatus 5:27pm. Use !killed in the boss timer channel after each boss kill to update spawn tracking.",
      aliases: [],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOSS_TIMER],
      category: "Boss Management"
    },
    spawned: {
      usage: "!spawned <boss>",
      description: "Confirm a boss has spawned and automatically create an attendance thread. 💡 Use after a timer boss appears in-game to open the attendance thread for members. Example: !spawned venatus creates a new attendance thread for Venatus.",
      aliases: [],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOSS_TIMER],
      category: "Boss Management"
    },
    nextspawn: {
      usage: "!nextspawn",
      description: "View all bosses expected to spawn in the next 24 hours with their predicted spawn times. 💡 Shows estimated spawn times based on kill history and scheduled timers. Use to plan attendance for upcoming bosses.",
      aliases: ["!whennext", "!spawntimer"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOSS_TIMER],
      category: "Boss Management"
    },
    setboss: {
      usage: "!setboss <boss> <status>",
      description: "Manually set a boss spawn status. 💡 Status options: alive (spawning soon), killed (recently killed), spawned (already appeared). Example: !setboss venatus killed marks Venatus as killed for timer tracking.",
      aliases: [],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOSS_TIMER],
      category: "Boss Management"
    },
    clearkills: {
      usage: "!clearkills",
      description: "Clear ALL recorded boss kills and timers from the system. 💡 Admin only. Use after a server reset or when the timer data has become inaccurate. This resets all spawn predictions.",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.BOSS_TIMER],
      category: "Boss Management"
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN LOGS COMMANDS (admin channel)
  // ─────────────────────────────────────────────────────────────────────────
  admin_logs: {
    closeallthread: {
      usage: "!closeallthread / /closeall",
      description: "Close and submit ALL open spawn threads. All pending members are auto-verified, submitted to Google Sheets, and threads are locked/archived. 💡 Use after raid night or when cleaning up old spawns. The !closeall alias is faster for quick admin work.",
      aliases: ["!closeall"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    update: {
      usage: "!update",
      description: "Git pull latest code from GitHub and restart the bot. 💡 Admin only. Use after pushing updates to the repository. The bot will pull changes, confirm success, and restart automatically after 2 seconds. PM2 brings it back online.",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    maintenance: {
      usage: "!maintenance / /maintenance",
      description: "Create spawn threads for ALL active maintenance bosses in the config list. 💡 Use when server comes back from maintenance. Threads are created without auto-close timers so members can check in at any time. The !maint alias is faster for quick use.",
      aliases: ["!maint"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    openthread: {
      usage: "!openthread <boss> / /openthread",
      description: "Manually open a new attendance thread for a specific boss. 💡 Use when a boss spawns outside normal timer system or to create a thread for manual tracking. Boss name is fuzzy-matched.",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    overrideclose: {
      usage: "!overrideclose / /overrideclose",
      description: "Forcibly close the CURRENT thread immediately, bypassing the 20-minute auto-close timer. 💡 Use on threads that need to be closed before the timer expires. All pending members are verified and submitted.",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    weeklyreport: {
      usage: "!weekly / /weekly",
      description: "Generate and post the weekly attendance report. 💡 Data is drawn from Google Sheets. The !week alias is faster. Reports are posted in the admin logs channel with member attendance statistics.",
      aliases: ["!week"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Reports"
    },
    monthlyreport: {
      usage: "!monthly / /monthly",
      description: "Generate and post the monthly attendance report. 💡 The !month alias is faster. Shows broader attendance trends across the month for all members.",
      aliases: ["!month"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Reports"
    },
    status: {
      usage: "!status / /status",
      description: "Show comprehensive bot health dashboard: uptime, version, memory usage, all active spawn threads sorted by age (oldest first) with member counts, pending verifications, Google Sheets sync status, and bidding system state (active auction or queue count). 💡 The !st alias is faster. Check this first when troubleshooting — it shows everything at a glance.",
      aliases: ["!st"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    removemember: {
      usage: "!removemember <member> / /remove-member <member>",
      description: "Remove a member from the attendance system. Clears their attendance records and bidding data. 💡 Use when a member leaves the guild. Member name or @mention works. The !removemem alias is faster for quick use.",
      aliases: ["!removemem", "!rmmember", "!delmember"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    rotation: {
      usage: "!rotation / /rotation <status|set|increment|refresh>",
      description: "Manage the 5-guild boss rotation system. 💡 status: show current rotation state. set: assign a boss to a position. increment: advance to next boss in rotation. refresh: reload rotation from config. This controls which guild's boss is active.",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Boss Management"
    },
    startauction: {
      usage: "!startauction / /auction start",
      description: "Start a new auction session by loading items from Google Sheets into the queue. 💡 Use after the item sheet is updated. The !auction alias is more intuitive. Items are queued up and ready for manual start.",
      aliases: ["!auction", "!start", "!startauc"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    startauctionnow: {
      usage: "!startauctionnow / /auction start-now",
      description: "Start an auction immediately without loading from the sheet queue. 💡 Use for impromptu auctions or when you need to start before sheet data is ready. Items are handled on the fly.",
      aliases: ["!auc-now", "!begin-auction"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    endauction: {
      usage: "!endauction / /auction end",
      description: "End the current auction session immediately. All completed items are submitted, the current active item is stopped, and results are saved to Google Sheets. 💡 Cannot be undone — confirm before using. Completed items are finalized before shutdown.",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    queuelist: {
      usage: "!queuelist / /queue list",
      description: "Display the full auction queue showing all items loaded from Google Sheets in order. 💡 Use to see what's coming up next. The !ql alias is quick for repeated checks.",
      aliases: ["!ql", "!queue"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    emergency: {
      usage: "!emergency <subcommand> / /emergency <subcommand>",
      description: "Emergency recovery toolkit with 7 subcommands. 💡 The !emerg alias is faster. Use these when normal command flows break — they bypass safety checks. ERROR: These override normal safeguards, use with extreme care.",
      aliases: ["!emerg"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencyclose: {
      usage: "!forceclosethread [thread] / /emergency close [thread]",
      description: "Force-close a specific attendance thread by ID. Auto-verifies all pending members, submits to Google Sheets, and archives the thread. 💡 Use !fct alias for speed. If no thread ID provided, closes the current channel. Use when normal close fails or thread is stuck open past auto-close.",
      aliases: ["!fct"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencycloseall: {
      usage: "!forcecloseallthreads / /emergency close-all",
      description: "Force-close EVERY open attendance thread in bot memory. Processes all threads sequentially with auto-verification, sheet submission, and archival. 💡 The !fcat alias is faster. Includes progress tracking. Use after major recovery or mass cleanup. WARNING: This is destructive — all pending verifications are auto-approved.",
      aliases: ["!fcat"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencyendauction: {
      usage: "!forceendauction / /emergency end-auction",
      description: "Emergency auction termination. Force-ends the current auction even if stuck in an abnormal state. 💡 The !fea alias is faster. All results up to that point are finalized. Use when /auction end fails or the auction state is corrupted.",
      aliases: ["!fea"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencyunlockpoints: {
      usage: "!unlockallpoints / /emergency unlock-points",
      description: "Unlock ALL locked bidding points across all users. 💡 The !unlock alias is faster. Only affects points locked by the bidding system during active auctions. Normal point balances are untouched. Use when bids are stuck and preventing new bids.",
      aliases: ["!unlock"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencyclearbids: {
      usage: "!clearallbids / /emergency clear-bids",
      description: "Clear all pending bid confirmations from bot memory. 💡 The !clearbids alias is faster. Use when confirmation buttons are stuck and preventing new bids from being processed. Only affects pending confirmations — completed bids are preserved.",
      aliases: ["!clearbids"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencydiagnostics: {
      usage: "!diagnostics / /emergency diagnostics",
      description: "Show comprehensive bot state diagnostics: active spawns, pending verifications, auction state, bidding queue, pending closures, and confirmation messages. 💡 The !diag alias is faster. Use this first when debugging issues — it reveals stuck state or corrupted data.",
      aliases: ["!diag"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    emergencyforcesync: {
      usage: "!forcesync / /emergency force-sync",
      description: "Force full state synchronization to Google Sheets. Pushes all in-memory data (attendance, bidding, auction results) to the sheet. 💡 The !fsync alias is faster. Use after recovery or when sheets appear out of sync with bot state. Overwrites sheet data with current memory state.",
      aliases: ["!fsync"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BOT COMMANDS CHANNEL (member commands)
  // ─────────────────────────────────────────────────────────────────────────
  bot_commands: {
    stats: {
      usage: "!stats [member] / /stats [member]",
      description: "View your own or another member's statistics: total attendance count, bidding points earned, attendance history, and recent boss kills. 💡 Use !profile or !info aliases for convenience. @mention another member or type their name to view their stats.",
      aliases: ["!profile", "!info", "!mystats"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS],
      category: "Member"
    },
    newmember: {
      usage: "!newmember / /newmember",
      description: "Show the comprehensive new member guide with step-by-step instructions for attendance submission, auction participation, and bidding. 💡 Perfect for new guild members. The !nm alias is faster. Covers screenshot requirements, time limits, and common mistakes.",
      aliases: ["!nm"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS],
      category: "Member"
    },
    help: {
      usage: "!help / /help",
      description: "Show a context-aware help message filtered by your current channel and role. 💡 Commands shown depend on where you are (admin logs, guild chat, attendance thread, etc.) and whether you're an admin. Try in different channels to see different command sets.",
      aliases: ["!?", "!commands", "!cmds"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ATTENDANCE_THREAD, CHANNEL_TYPES.AUCTION_THREAD, CHANNEL_TYPES.ADMIN_LOGS],
      category: 'Help'
    },
  },
  // ─────────────────────────────────────────────────────────────────────────
  // GUILD CHAT COMMANDS (limited, mostly analytics)
  // ─────────────────────────────────────────────────────────────────────────
  guild_chat: {
    leaderboards: {
      usage: "!leaderboardattendance / !leaderboardbidding / !leaderboards / /leaderboards <type>",
      description: "Display guild leaderboards. Choose from: attendance (top 10 by boss kills), bidding (top 10 by points earned), or combined (both side by side). 💡 Use !leadatt, !lba, or !lbattendance for quick attendance rankings. Use !leadbid, !lbb, or !lbbidding for bidding rankings. Use !leaderboard or !lb for the combined view.",
      aliases: ["!lbattendance", "!lba", "!leadatt", "!lbbidding", "!lbb", "!leadbid", "!leaderboard", "!lb"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS],
      category: 'Leaderboards'
    },
    activity: {
      usage: "!activity [week] / /activity [week]",
      description: "Show a 24-hour guild activity heatmap visualization for the current week or a specific historical week. 💡 Use !heatmap or !guildactivity aliases. The heatmap shows peak activity hours across all channels. Optional week param lets you view past data.",
      aliases: ["!heatmap", "!guildactivity", "!activityheatmap"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: 'Analytics'
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIVERSAL COMMANDS (work everywhere)
  // ─────────────────────────────────────────────────────────────────────────
  universal: {
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELP DISPLAY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get commands available in specific channel
 * @param {string} channelType - Channel type from CHANNEL_TYPES
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {Array} Array of command objects
 */
function getAvailableCommands(channelType, isAdmin) {
  const available = [];

  // Add universal commands
  Object.entries(COMMANDS.universal).forEach(([key, cmd]) => {
    if (!cmd.adminOnly || isAdmin) {
      available.push({ key, ...cmd });
    }
  });

  // Add channel-specific commands
  Object.entries(COMMANDS).forEach(([group, commands]) => {
    if (group === 'universal') return; // Already added

    Object.entries(commands).forEach(([key, cmd]) => {
      // Check if command is available in this channel
      const channelMatch = cmd.channels === "all" ||
                          (Array.isArray(cmd.channels) && cmd.channels.includes(channelType));

      // Check admin permission
      const permissionMatch = !cmd.adminOnly || isAdmin;

      if (channelMatch && permissionMatch) {
        available.push({ key, ...cmd });
      }
    });
  });

  return available;
}

/**
 * Generate help embed for current channel
 * @param {Message} message - Discord message
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {EmbedBuilder} Help embed
 */
async function generateChannelHelp(message, isAdmin) {
  const channelType = detectChannelType(message);
  const channelName = getChannelName(channelType);
  const commands = getAvailableCommands(channelType, isAdmin);

  // Group commands by category
  const grouped = {};
  commands.forEach(cmd => {
    if (!grouped[cmd.category]) {
      grouped[cmd.category] = [];
    }
    grouped[cmd.category].push(cmd);
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJI.BOOK} Commands Available in ${channelName}`)
    .setDescription(
      `Showing **${commands.length} command(s)** available here.\n` +
      `${isAdmin ? `${EMOJI.ADMIN} **Admin Mode** - You can see all commands.\n` : ''}\n` +
      `💡 **Tip:** Commands shown are filtered for this channel!`
    )
    .setFooter({ text: `Bot Version ${BOT_VERSION} • Context-Aware Help System` })
    .setTimestamp();

  // Add commands by category
  Object.entries(grouped).sort().forEach(([category, cmds]) => {
    const commandList = cmds.map(cmd => {
      const aliasText = cmd.aliases && cmd.aliases.length > 0
        ? ` (${cmd.aliases.join(', ')})`
        : '';
      const adminBadge = cmd.adminOnly ? ` ${EMOJI.ADMIN}` : '';
      return `• \`${cmd.usage}\`${aliasText}${adminBadge}\n  ${cmd.description}`;
    }).join('\n\n');

    // Get emoji for category
    const categoryEmoji = {
      'Attendance': EMOJI.BOSS,
      'Auction': EMOJI.COIN,
      'Auction Admin': `${EMOJI.COIN}${EMOJI.ADMIN}`,
      'Admin': EMOJI.ADMIN,
      'Emergency': EMOJI.EMERGENCY,
      'Member': EMOJI.MEMBER,
      'Fun': '🎮',
      'Leaderboards': EMOJI.TROPHY,
      'Analytics': EMOJI.CHART,
      'Reports': '📋',
      'Boss Management': '🐉',
      'Help': EMOJI.BOOK
    }[category] || EMOJI.INFO;

    embed.addFields({
      name: `${categoryEmoji} ${category}`,
      value: commandList,
      inline: false
    });
  });

  // Add channel guidance
  if (channelType === CHANNEL_TYPES.UNKNOWN) {
    embed.addFields({
      name: '⚠️ Unknown Channel',
      value: 'This channel may not be configured for bot commands. Try using bot commands in:\n' +
             '• Admin Logs (admins only)\n' +
             '• Guild Chat\n' +
             '• Bot Commands Channel\n' +
             '• Attendance/Auction threads',
      inline: false
    });
  } else if (commands.length === 1) {
    // Only help command available
    embed.addFields({
      name: '💡 More Commands Available',
      value: 'Try using `/help` in other channels to see more commands!',
      inline: false
    });
  }

  return embed;
}

/**
 * Handle help command
 * @param {Message} message - Discord message
 * @param {GuildMember} member - Guild member
 * @returns {Promise<void>}
 */
async function handleHelpCommand(message, member) {
  const isAdmin = isAdminFunc ? isAdminFunc(member) : false;
  const embed = await generateChannelHelp(message, isAdmin);
  await message.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  initialize,
  handleHelpCommand,
  detectChannelType,
  getAvailableCommands,
  CHANNEL_TYPES,
  COMMANDS,
  BOT_VERSION
};
