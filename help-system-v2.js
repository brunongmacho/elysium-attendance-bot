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
      description: "Check in for boss spawn (screenshot required for non-admins)",
      aliases: ["here", "join", "checkin"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
    close: {
      usage: "close",
      description: "Close and submit attendance (admins only)",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
    forcesubmit: {
      usage: "!forcesubmit or !fs",
      description: "Submit attendance without closing thread",
      aliases: ["!fs"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
    forceclose: {
      usage: "!forceclose or !fc",
      description: "Force close thread (ignores pending)",
      aliases: ["!fc"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
    verify: {
      usage: "!verify @member or !v @member",
      description: "Manually verify a member",
      aliases: ["!v"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
    debugthread: {
      usage: "!debugthread or !debug",
      description: "Show thread state and debug info",
      aliases: ["!debug"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    },
    resetpending: {
      usage: "!resetpending",
      description: "Clear all pending verifications",
      aliases: ["!resetpend"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ATTENDANCE_THREAD],
      category: "Attendance"
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUCTION THREAD COMMANDS (inside auction threads only)
  // ─────────────────────────────────────────────────────────────────────────
  auction_thread: {
    bid: {
      usage: "!bid <amount> or just: bid 500",
      description: "Place a bid on the current item (instant bidding)",
      aliases: ["!b", "bid [amount]"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.AUCTION_THREAD],
      category: "Auction"
    },
    mybids: {
      usage: "!mybids",
      description: "Show your bidding history in this auction",
      aliases: [],
      adminOnly: false,
      channels: [CHANNEL_TYPES.AUCTION_THREAD],
      category: "Auction"
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN LOGS COMMANDS (admin channel)
  // ─────────────────────────────────────────────────────────────────────────
  admin_logs: {
    status: {
      usage: "!status or !st",
      description: "View bot health, active spawns, and system stats",
      aliases: ["!st", "!attendancestatus"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    addthread: {
      usage: "!addthread <Boss> will spawn in X minutes!",
      description: "Manually create spawn thread",
      aliases: ["!addth"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    closeallthread: {
      usage: "!closeallthread or !closeall",
      description: "Close and submit ALL open spawn threads",
      aliases: ["!closeall"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    maintenance: {
      usage: "!maintenance or !maint",
      description: "Create threads for all maintenance bosses",
      aliases: ["!maint"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    serverdown: {
      usage: "!serverdown",
      description: "Pause boss attendance (maintenance mode)",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    clearstate: {
      usage: "!clearstate or !clear",
      description: "Clear ALL attendance state (nuclear option)",
      aliases: ["!clear"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Admin"
    },
    auction: {
      usage: "!auction or !startauction",
      description: "Start auction session (loads from Google Sheets)",
      aliases: ["!startauction", "!start"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    pauseauction: {
      usage: "!pauseauction or !pause",
      description: "Pause active auction",
      aliases: ["!pause"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    resumeauction: {
      usage: "!resumeauction or !resume",
      description: "Resume paused auction",
      aliases: ["!resume"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    extend: {
      usage: "!extend <minutes>",
      description: "Add time to current auction item",
      aliases: ["!ext"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    skip: {
      usage: "!skip or !skipitem",
      description: "Skip current item (refunds bids)",
      aliases: ["!skipitem"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    cancel: {
      usage: "!cancel or !cancelitem",
      description: "Cancel item (refunds bids)",
      aliases: ["!cancelitem"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    endauction: {
      usage: "!endauction",
      description: "End entire auction session",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    queuelist: {
      usage: "!queuelist or !ql",
      description: "View full auction queue",
      aliases: ["!ql", "!queue"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Auction Admin"
    },
    emergency: {
      usage: "!emergency <subcommand>",
      description: "Emergency recovery toolkit",
      aliases: ["!emerg"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    diagnostics: {
      usage: "!diagnostics or !diag",
      description: "System diagnostics and state inspection",
      aliases: ["!diag"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    forcesync: {
      usage: "!forcesync or !fsync",
      description: "Force state sync to Google Sheets",
      aliases: ["!fsync"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Emergency"
    },
    rotation: {
      usage: "!rotation <status|set|increment>",
      description: "Manage boss rotation (5-guild system)",
      aliases: [],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Boss Management"
    },
    weeklyreport: {
      usage: "!weeklyreport or !weekly",
      description: "Force generate weekly report",
      aliases: ["!weekly", "!week"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Reports"
    },
    monthlyreport: {
      usage: "!monthlyreport or !monthly",
      description: "Force generate monthly report",
      aliases: ["!monthly", "!month"],
      adminOnly: true,
      channels: [CHANNEL_TYPES.ADMIN_LOGS],
      category: "Reports"
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BOT COMMANDS CHANNEL (member commands)
  // ─────────────────────────────────────────────────────────────────────────
  bot_commands: {
    mypoints: {
      usage: "!mypoints or !pts",
      description: "Check your current points balance",
      aliases: ["!pts", "!mp", "!mypts"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: "Member"
    },
    bidstatus: {
      usage: "!bidstatus or !bs",
      description: "View current auction status",
      aliases: ["!bs", "!bstatus"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: "Member"
    },
    stats: {
      usage: "!stats [@member]",
      description: "View member statistics and history",
      aliases: ["!profile", "!info"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOT_COMMANDS],
      category: "Member"
    },
    eightball: {
      usage: "!eightball <question> or !8ball",
      description: "Magic 8-Ball predictions",
      aliases: ["!8ball", "!8b", "!magic"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOT_COMMANDS],
      category: "Fun"
    },
    slap: {
      usage: "!slap @member",
      description: "Slap someone with a random object",
      aliases: ["!sampal", "!hampas"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.BOT_COMMANDS],
      category: "Fun"
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GUILD CHAT COMMANDS (limited, mostly analytics)
  // ─────────────────────────────────────────────────────────────────────────
  guild_chat: {
    leaderboards: {
      usage: "!leaderboards or !lb",
      description: "Show both attendance and bidding leaderboards",
      aliases: ["!lb", "!leaderboard"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: "Leaderboards"
    },
    leaderboardattendance: {
      usage: "!leaderboardattendance or !lba",
      description: "Show attendance rankings (top 10)",
      aliases: ["!lba", "!leadatt"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: "Leaderboards"
    },
    leaderboardbidding: {
      usage: "!leaderboardbidding or !lbb",
      description: "Show bidding rankings (top 10 by points)",
      aliases: ["!lbb", "!leadbid"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: "Leaderboards"
    },
    activity: {
      usage: "!activity [week]",
      description: "Guild activity heatmap (24-hour visualization)",
      aliases: ["!heatmap", "!guildactivity"],
      adminOnly: false,
      channels: [CHANNEL_TYPES.GUILD_CHAT, CHANNEL_TYPES.BOT_COMMANDS, CHANNEL_TYPES.ADMIN_LOGS],
      category: "Analytics"
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIVERSAL COMMANDS (work everywhere)
  // ─────────────────────────────────────────────────────────────────────────
  universal: {
    help: {
      usage: "!help [category]",
      description: "Show this help message (context-aware!)",
      aliases: ["!?", "!commands"],
      adminOnly: false,
      channels: "all",
      category: "Help"
    }
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
      value: 'Try using `!help` in other channels to see more commands!',
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
