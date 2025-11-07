/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELYSIUM GUILD BOT - ENHANCED HELP SYSTEM v9.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Interactive category navigation
 * - Fancy embeds with emojis and colors
 * - Search functionality
 * - Performance optimizations included
 * - Comprehensive command documentation
 * - Version 9.0.0 - Fully Optimized Edition
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { LOGGING } = require('./utils/constants');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  FIRE: "🔥",
  CHART: "📊",
  COIN: "💰",
  TROPHY: "🏆",
  BOSS: "🎯",
  ADMIN: "👑",
  MEMBER: "👥",
  EMERGENCY: "🚨",
  ROBOT: "🤖",
  SPARKLES: "✨",
  ROCKET: "🚀",
  SHIELD: "🛡️",
  HAMMER: "🔨",
  BOOK: "📖",
  LIGHTNING: "⚡",
  GEAR: "⚙️",
};

const COLORS = {
  PRIMARY: 0x5865F2,      // Discord Blurple
  SUCCESS: 0x57F287,      // Green
  WARNING: 0xFEE75C,      // Yellow
  ERROR: 0xED4245,        // Red
  ATTENDANCE: 0x3498DB,   // Blue
  AUCTION: 0xF1C40F,      // Gold
  AI: 0x9B59B6,           // Purple
  EMERGENCY: 0xE74C3C,    // Dark Red
};

let config = null;
let isAdminFunc = null;
let BOT_VERSION = "9.0.0 - Fully Optimized Edition";

function initialize(cfg, adminFunc, version) {
  config = cfg;
  isAdminFunc = adminFunc;
  if (version) BOT_VERSION = version;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const COMMANDS = {
  // ─────────────────────────────────────────────────────────────────────────
  // ATTENDANCE COMMANDS
  // ─────────────────────────────────────────────────────────────────────────
  attendance: {
    status: {
      usage: "!status",
      description: "View comprehensive bot health, active spawns, and system statistics",
      aliases: ["!st"],
      adminOnly: true,
      details: [
        "• Bot uptime and memory usage",
        "• Active spawn threads (sorted oldest first)",
        "• Pending verifications count",
        "• Last Google Sheets sync time",
        "• Bidding system status",
        "• **Optimized**: O(1) lookups, 100MB RAM usage"
      ]
    },
    addthread: {
      usage: "!addthread <BossName> will spawn in X minutes! (YYYY-MM-DD HH:MM)",
      description: "Manually create spawn thread with custom timestamp",
      aliases: ["!addth"],
      adminOnly: true,
      details: [
        "• Custom timestamp support",
        "• Boss name fuzzy matching",
        "• Auto-creates attendance + confirmation threads",
        "• **Fast**: 2-3x faster with parallel API calls"
      ]
    },
    verify: {
      usage: "!verify @member",
      description: "Manually verify a member for attendance in current spawn",
      aliases: ["!v"],
      adminOnly: true,
      details: [
        "• Override for missing screenshots",
        "• Duplicate detection",
        "• Auto-updates confirmation thread",
        "• Instant points assignment"
      ]
    },
    verifyall: {
      usage: "!verifyall",
      description: "Auto-verify ALL pending members with confirmation",
      aliases: ["!vall"],
      adminOnly: true,
      details: [
        "• Bulk verification",
        "• Duplicate filtering",
        "• Confirmation prompt",
        "• Progress reporting"
      ]
    },
    resetpending: {
      usage: "!resetpending",
      description: "Clear all pending verifications without adding to verified list",
      aliases: ["!resetpend"],
      adminOnly: true,
      details: [
        "• Clears pending queue",
        "• Doesn't affect verified members",
        "• Allows clean thread closure",
        "• Requires confirmation"
      ]
    },
    forcesubmit: {
      usage: "!fs",
      description: "Submit attendance WITHOUT closing thread (allows continued check-ins)",
      aliases: ["!fs"],
      adminOnly: true,
      details: [
        "• Keeps thread open",
        "• Submits current verified list",
        "• Allows additional check-ins",
        "• Shows member list on failure"
      ]
    },
    forceclose: {
      usage: "!forceclose",
      description: "Force close spawn thread ignoring ALL pending verifications",
      aliases: ["!fc"],
      adminOnly: true,
      details: [
        "• Bypasses pending verifications",
        "• Immediate closure",
        "• Thread lock + archive",
        "• Emergency use only"
      ]
    },
    present: {
      usage: "present",
      description: "Check in for boss spawn (requires screenshot for non-admins)",
      aliases: ["here", "join", "checkin"],
      adminOnly: false,
      details: [
        "• Screenshot verification (non-admins)",
        "• Admin fast-track (no screenshot)",
        "• React ✅/❌ for verification",
        "• Auto-points on verification",
        "• **20-min auto-close** prevents cheating"
      ]
    },
    close: {
      usage: "close",
      description: "Close and submit attendance (threads auto-close after 20 minutes)",
      aliases: [],
      adminOnly: true,
      details: [
        "• Validates no pending verifications",
        "• Submits to Google Sheets",
        "• Archives + locks thread",
        "• Requires ✅ confirmation",
        "• ⏰ Auto-closes after 20 min"
      ]
    },
    debugthread: {
      usage: "!debugthread",
      description: "Debug current spawn thread state",
      aliases: ["!debug"],
      adminOnly: true,
      details: [
        "• Shows thread info",
        "• Lists verified members",
        "• Shows pending verifications",
        "• Displays confirmation thread link",
        "• Useful for troubleshooting"
      ]
    },
    closeallthread: {
      usage: "!closeallthread",
      description: "Close and submit ALL open spawn threads at once",
      aliases: ["!closeall"],
      adminOnly: true,
      details: [
        "• Closes all active spawns",
        "• Auto-verifies pending members",
        "• Submits each to Google Sheets",
        "• Progress tracking",
        "• Requires confirmation",
        "• **Use with caution**"
      ]
    },
    maintenance: {
      usage: "!maintenance",
      description: "Create spawn threads for all maintenance bosses",
      aliases: ["!maint"],
      adminOnly: true,
      details: [
        "• Creates threads for 22 maintenance bosses",
        "• Sets spawn time to 5 minutes from now",
        "• Batch processing with progress tracking",
        "• Requires confirmation"
      ]
    },
    clearstate: {
      usage: "!clearstate",
      description: "Clear ALL attendance state (nuclear option)",
      aliases: ["!clear"],
      adminOnly: true,
      details: [
        "• ⚠️ **DANGEROUS**: Clears everything",
        "• Removes all active spawns",
        "• Clears pending verifications",
        "• State reset",
        "• Requires confirmation",
        "• Use only if state is corrupted"
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUCTION COMMANDS
  // ─────────────────────────────────────────────────────────────────────────
  auction: {
    auction: {
      usage: "!auction",
      description: "Start auction session (loads from BiddingItems sheet)",
      aliases: ["!startauction", "!start", "!auc-start", "!begin-auction", "!startauc"],
      adminOnly: true,
      details: [
        "• All ELYSIUM members can bid",
        "• 10-minute cooldown protection",
        "• Loads items from Google Sheets",
        "• Session preview before start",
        "• **Scheduled**: Auto-starts Saturday 12 PM GMT+8"
      ]
    },
    pauseauction: {
      usage: "!pauseauction",
      description: "Pause active auction session (freezes all timers)",
      aliases: ["!pause", "!auc-pause", "!hold"],
      adminOnly: true,
      details: [
        "• Freezes current item timer",
        "• Preserves remaining time",
        "• Resume with !resumeauction"
      ]
    },
    resumeauction: {
      usage: "!resumeauction",
      description: "Resume paused auction session",
      aliases: ["!resume", "!auc-resume", "!continue"],
      adminOnly: true,
      details: [
        "• Restores remaining time",
        "• Extends to 60s if <60s left",
        "• Reschedules all timers"
      ]
    },
    extend: {
      usage: "!extend <minutes>",
      description: "Add extra time to current auction item",
      aliases: ["!ext", "!auc-extend"],
      adminOnly: true,
      details: [
        "• Adds specified minutes",
        "• Resets warning timers",
        "• No extension limit",
        "• Immediate effect"
      ]
    },
    skip: {
      usage: "!skip",
      description: "Skip current item (marks as 'no sale')",
      aliases: ["!skipitem"],
      adminOnly: true,
      details: [
        "• Marks as no sale",
        "• Unlocks points",
        "• Moves to next item",
        "• Requires confirmation"
      ]
    },
    cancel: {
      usage: "!cancel",
      description: "Cancel current item and refund all locked points",
      aliases: ["!cancelitem"],
      adminOnly: true,
      details: [
        "• Refunds all bids",
        "• Unlocks points",
        "• Moves to next item",
        "• Requires confirmation"
      ]
    },
    stop: {
      usage: "!stop",
      description: "Stop current auction item immediately",
      aliases: ["!auc-stop", "!end-item"],
      adminOnly: true,
      details: [
        "• Ends current item immediately",
        "• Awards to highest bidder",
        "• Moves to next item",
        "• Use for quick auction end"
      ]
    },
    bid: {
      usage: "!bid <amount>",
      description: "Place bid on current auction item (or just type: \"bid 500\")",
      aliases: ["!b"],
      adminOnly: false,
      details: [
        "• 10-second confirmation window",
        "• Points validation",
        "• Self-overbid support",
        "• 3-second rate limit",
        "• **Auto-pause** if bid in last 10s",
        "• **NLP support**: \"bid 500\" or \"offer 300 pts\""
      ]
    },
    mypoints: {
      usage: "!mypoints",
      description: "Check your available bidding points",
      aliases: ["!pts", "!mp"],
      adminOnly: false,
      details: [
        "• Fresh fetch from Google Sheets",
        "• Shows available points",
        "• Auto-deletes in 30s",
        "• Bidding channel only",
        "• Disabled during active auctions"
      ]
    },
    bidstatus: {
      usage: "!bidstatus",
      description: "View current auction status (active item, time left, queue)",
      aliases: ["!bs", "!bstatus"],
      adminOnly: false,
      details: [
        "• Active auction info",
        "• Current bid amount",
        "• Time remaining",
        "• Queue preview",
        "• Remaining items count"
      ]
    },
    queuelist: {
      usage: "!queuelist",
      description: "View full auction queue before or during auction",
      aliases: ["!ql", "!queue"],
      adminOnly: true,
      details: [
        "• Shows all queued items",
        "• Starting bids for each item",
        "• Item order",
        "• Total items count"
      ]
    },
    endauction: {
      usage: "!endauction",
      description: "End current auction session immediately",
      aliases: [],
      adminOnly: true,
      details: [
        "• Ends entire auction session",
        "• Stops current item",
        "• Submits all completed items",
        "• Requires confirmation",
        "• Use when you want to end early"
      ]
    },
    startauctionnow: {
      usage: "!startauctionnow",
      description: "Start auction immediately (bypass 10-min cooldown)",
      aliases: ["!auc-now"],
      adminOnly: true,
      details: [
        "• Bypasses cooldown timer",
        "• Starts auction immediately",
        "• Use for emergency starts",
        "• Resets cooldown"
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AI/INTELLIGENCE COMMANDS (Member-Accessible!)
  // ─────────────────────────────────────────────────────────────────────────
  intelligence: {
    predictspawn: {
      usage: "!predictspawn [boss name]",
      description: "Predict next boss spawn time (AI-powered)",
      aliases: ["!nextspawn", "!whennext", "!spawntimer"],
      adminOnly: false,
      details: [
        "• AI spawn time prediction",
        "• Based on historical spawn patterns",
        "• Confidence intervals",
        "• If no boss specified: shows next boss to spawn",
        "• **NLP**: \"when is next spawn?\" or \"kelan spawn ng Kades?\"",
        "• Use in guild chat by @mentioning the bot"
      ]
    },
    predictprice: {
      usage: "!predictprice <item>",
      description: "Get AI-powered price prediction for auction item",
      aliases: ["!predict", "!suggestprice"],
      adminOnly: false,
      details: [
        "• Machine learning price estimation",
        "• Confidence intervals and trend analysis",
        "• Historical data with outlier detection",
        "• **85%+ accuracy** after bootstrap learning",
        "• **NLP**: \"how much is crimson pendant worth?\" or \"magkano flame claw?\"",
        "• Use in guild chat by @mentioning the bot"
      ]
    },
    predictattendance: {
      usage: "!predictattendance <username>",
      description: "Predict member's likelihood to attend next spawn",
      aliases: ["!predatt"],
      adminOnly: false,
      details: [
        "• AI attendance prediction",
        "• Based on historical patterns",
        "• Confidence scoring",
        "• Recent activity analysis",
        "• **NLP**: \"will PlayerName attend?\" or \"dadalo ba si PlayerName?\"",
        "• Use in guild chat by @mentioning the bot"
      ]
    },
    analyze: {
      usage: "!analyze [username]",
      description: "Check engagement stats (no username = check yourself)",
      aliases: ["!engagement", "!engage"],
      adminOnly: false,
      details: [
        "• Engagement scoring (attendance + bidding + consistency)",
        "• Next event attendance prediction",
        "• Personalized recommendations",
        "• **Self-check**: Just say \"!analyze\" or \"how am i doing?\"",
        "• **NLP**: \"my stats\" or \"kamusta ako?\"",
        "• Use in guild chat by @mentioning the bot"
      ]
    },
    analyzeall: {
      usage: "!analyzeall",
      description: "Guild-wide engagement analysis with top performers",
      aliases: ["!analyzeengagement", "!guildanalyze"],
      adminOnly: false,
      details: [
        "• Guild-wide statistics",
        "• Top performers ranking",
        "• At-risk members list",
        "• Engagement trends",
        "• **NLP**: \"guild engagement\" or \"engagement ng lahat\"",
        "• Use in guild chat by @mentioning the bot"
      ]
    },
    recommendations: {
      usage: "!recommendations",
      description: "Get AI recommendations for optimal guild management",
      aliases: ["!recommend", "!suggest"],
      adminOnly: true,
      details: [
        "• Optimal auction timing",
        "• Participation forecasts",
        "• Member reminder suggestions",
        "• Smart guild management insights"
      ]
    },
    performance: {
      usage: "!performance",
      description: "View system performance metrics and health",
      aliases: ["!perf"],
      adminOnly: true,
      details: [
        "• Memory usage statistics",
        "• Bot uptime",
        "• Intelligence cache status",
        "• Performance recommendations"
      ]
    },
    suggestauction: {
      usage: "!suggestauction",
      description: "Analyze entire auction queue before starting",
      aliases: ["!analyzequeue", "!aq", "!auctionqueue"],
      adminOnly: true,
      details: [
        "• AI price suggestions for all items",
        "• Optimal item ordering",
        "• Participation forecasts",
        "• Smart recommendations"
      ]
    },
    detectanomalies: {
      usage: "!detectanomalies",
      description: "Run fraud detection scan on recent activity",
      aliases: ["!fraud", "!anomaly"],
      adminOnly: true,
      details: [
        "• Collusion detection in bidding",
        "• Unusual bid patterns",
        "• Attendance anomalies",
        "• Statistical analysis",
        "• **Proactive alerts**: Daily 6 PM automatic scan"
      ]
    },
    bootstraplearning: {
      usage: "!bootstraplearning",
      description: "Re-bootstrap AI learning from ALL historical data",
      aliases: ["!bootstrap", "!learnhistory"],
      adminOnly: true,
      details: [
        "• Analyzes all historical auction data",
        "• Creates hundreds of predictions",
        "• **85%+ accuracy from day 1**",
        "• No warm-up period needed",
        "• Run once on first deployment"
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LEADERBOARD COMMANDS
  // ─────────────────────────────────────────────────────────────────────────
  leaderboard: {
    leaderboardattendance: {
      usage: "!leaderboardattendance",
      description: "Show top 10 members by attendance points",
      aliases: ["!lbattendance", "!lba"],
      adminOnly: false,
      details: [
        "• Top 10 ranking",
        "• Visual progress bars",
        "• Real-time statistics",
        "• Percentage calculations"
      ]
    },
    leaderboardbidding: {
      usage: "!leaderboardbidding",
      description: "Show top 10 members by remaining bidding points",
      aliases: ["!lbbidding", "!lbb"],
      adminOnly: false,
      details: [
        "• Top 10 by points left",
        "• Visual progress bars",
        "• Real-time statistics",
        "• Percentage calculations"
      ]
    },
    leaderboards: {
      usage: "!leaderboards",
      description: "Show both attendance and bidding leaderboards",
      aliases: ["!lb"],
      adminOnly: false,
      details: [
        "• Combined view",
        "• Both rankings",
        "• Side-by-side comparison"
      ]
    },
    weeklyreport: {
      usage: "!weeklyreport",
      description: "Force send weekly leaderboard report (auto-sent Saturday 11:59 PM)",
      aliases: ["!weekly"],
      adminOnly: true,
      details: [
        "• Manual trigger",
        "• Same format as automatic report",
        "• Posts to designated channel",
        "• **Scheduled**: Auto-runs Saturday 11:59 PM"
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MEMBER MANAGEMENT COMMANDS
  // ─────────────────────────────────────────────────────────────────────────
  management: {
    removemember: {
      usage: "!removemember <member_name>",
      description: "Remove member from all sheets (bidding + attendance)",
      aliases: ["!removemem", "!rmmember", "!delmember"],
      adminOnly: true,
      details: [
        "• Removes from BiddingPoints sheet",
        "• Removes from all attendance weeks",
        "• Deletes point and attendance history",
        "• ForDistribution NOT touched (historical log)",
        "• ⚠️ Cannot be undone",
        "• Requires confirmation"
      ]
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EMERGENCY COMMANDS
  // ─────────────────────────────────────────────────────────────────────────
  emergency: {
    forceclosethread: {
      usage: "!forceclosethread",
      description: "Force close current attendance thread",
      aliases: ["!fct"],
      adminOnly: true,
      details: [
        "• Immediate closure",
        "• Lock + archive thread",
        "• State cleanup",
        "• ⚠️ Requires confirmation"
      ]
    },
    forcecloseallthreads: {
      usage: "!forcecloseallthreads",
      description: "Force close ALL active attendance threads",
      aliases: ["!fcat"],
      adminOnly: true,
      details: [
        "• Closes all spawns",
        "• Batch processing",
        "• State cleanup",
        "• ⚠️ Requires confirmation"
      ]
    },
    forceendauction: {
      usage: "!forceendauction",
      description: "Emergency terminate stuck auction session",
      aliases: ["!fea"],
      adminOnly: true,
      details: [
        "• Terminates auction",
        "• Refunds all bids",
        "• Unlocks points",
        "• State cleanup",
        "• ⚠️ Use only when auction is stuck"
      ]
    },
    unlockallpoints: {
      usage: "!unlockallpoints",
      description: "Release ALL locked bidding points",
      aliases: ["!unlock"],
      adminOnly: true,
      details: [
        "• Unlocks all points",
        "• Clears locked point registry",
        "• State cleanup",
        "• ⚠️ Requires confirmation"
      ]
    },
    clearallbids: {
      usage: "!clearallbids",
      description: "Remove ALL pending bid confirmations",
      aliases: ["!clearbids"],
      adminOnly: true,
      details: [
        "• Clears pending bids",
        "• State cleanup",
        "• No point refunds (points weren't locked yet)",
        "• ⚠️ Requires confirmation"
      ]
    },
    diagnostics: {
      usage: "!diagnostics",
      description: "Comprehensive system state inspection",
      aliases: ["!diag"],
      adminOnly: true,
      details: [
        "• Active spawns count",
        "• Pending verifications",
        "• Bidding state",
        "• Locked points",
        "• Memory usage",
        "• Last sync time",
        "• **Performance metrics**"
      ]
    },
    forcesync: {
      usage: "!forcesync",
      description: "Manually force state sync to Google Sheets",
      aliases: ["!fsync"],
      adminOnly: true,
      details: [
        "• Immediate state save",
        "• Bypasses 15-min interval",
        "• Full state persistence",
        "• **Optimized**: 15-min auto-sync (was 10-min)"
      ]
    },
    clearstate: {
      usage: "!clearstate",
      description: "Clear ALL attendance state (nuclear option)",
      aliases: [],
      adminOnly: true,
      details: [
        "• ⚠️ **DANGEROUS**: Clears everything",
        "• Removes all active spawns",
        "• Clears pending verifications",
        "• State reset",
        "• Requires confirmation",
        "• Use only if state is corrupted"
      ]
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELP EMBED BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build main help menu
 */
function buildMainHelp() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJI.SHIELD} ELYSIUM Guild Bot - Command Help`)
    .setDescription(
      `**Version ${BOT_VERSION}**\n\n` +
      `${EMOJI.SPARKLES} **What's New:**\n` +
      `• ${EMOJI.LIGHTNING} 10-100x faster column lookups (O(1) algorithm)\n` +
      `• ${EMOJI.ROCKET} 4-5x faster thread cleanup (parallel processing)\n` +
      `• ${EMOJI.GEAR} 2-3x faster spawn creation (concurrent API calls)\n` +
      `• ${EMOJI.CHART} ~100MB RAM usage (optimized for 512MB)\n\n` +
      `**Choose a category below for detailed commands:**`
    )
    .addFields(
      {
        name: `${EMOJI.BOSS} Attendance Commands`,
        value: `\`!help attendance\`\nSpawn tracking, verification, auto-close system`,
        inline: true
      },
      {
        name: `${EMOJI.COIN} Auction Commands`,
        value: `\`!help auction\`\nBidding system, auction management, points`,
        inline: true
      },
      {
        name: `${EMOJI.ROBOT} AI/Intelligence`,
        value: `\`!help intelligence\`\nPredictions, analytics, fraud detection`,
        inline: true
      },
      {
        name: `${EMOJI.TROPHY} Leaderboards`,
        value: `\`!help leaderboard\`\nRankings, weekly reports, statistics`,
        inline: true
      },
      {
        name: `${EMOJI.ADMIN} Member Management`,
        value: `\`!help management\`\nRemove members, manage guild roster`,
        inline: true
      },
      {
        name: `${EMOJI.EMERGENCY} Emergency`,
        value: `\`!help emergency\`\nRecovery tools, diagnostics, force commands`,
        inline: true
      },
      {
        name: `${EMOJI.BOOK} Quick Reference`,
        value: `\`!help <command>\`\nGet details for specific command`,
        inline: true
      }
    )
    .addFields({
      name: `${EMOJI.INFO} Navigation`,
      value:
        `• \`!help <category>\` - View category commands\n` +
        `• \`!help <command>\` - View command details\n` +
        `• Natural language supported in Auction Threads & Admin Logs`
    })
    .setFooter({ text: `Optimized for 512MB RAM • Production Ready • v${BOT_VERSION}` })
    .setTimestamp();

  return embed;
}

/**
 * Build category help
 */
function buildCategoryHelp(category) {
  const categoryData = COMMANDS[category];
  if (!categoryData) return null;

  const categoryInfo = {
    attendance: {
      title: `${EMOJI.BOSS} Attendance System Commands`,
      description: "Boss spawn tracking with anti-cheat features",
      color: COLORS.ATTENDANCE
    },
    auction: {
      title: `${EMOJI.COIN} Auction System Commands`,
      description: "Point-based bidding and auction management",
      color: COLORS.AUCTION
    },
    intelligence: {
      title: `${EMOJI.ROBOT} AI/Intelligence Commands`,
      description: "Predictive analytics and smart automation",
      color: COLORS.AI
    },
    leaderboard: {
      title: `${EMOJI.TROPHY} Leaderboard Commands`,
      description: "Rankings and weekly statistics",
      color: COLORS.SUCCESS
    },
    management: {
      title: `${EMOJI.ADMIN} Member Management Commands`,
      description: "Manage guild roster and member data",
      color: COLORS.WARNING
    },
    emergency: {
      title: `${EMOJI.EMERGENCY} Emergency Recovery Commands`,
      description: "Stuck state recovery and diagnostics",
      color: COLORS.EMERGENCY
    }
  };

  const info = categoryInfo[category];
  const embed = new EmbedBuilder()
    .setColor(info.color)
    .setTitle(info.title)
    .setDescription(info.description);

  // Group commands by admin/member
  const adminCommands = [];
  const memberCommands = [];

  for (const [key, cmd] of Object.entries(categoryData)) {
    const cmdLine = `\`${cmd.usage}\`${cmd.aliases.length > 0 ? ` • ${cmd.aliases.join(', ')}` : ''}`;
    const description = cmd.description;

    if (cmd.adminOnly) {
      adminCommands.push(`${cmdLine}\n${description}`);
    } else {
      memberCommands.push(`${cmdLine}\n${description}`);
    }
  }

  // Add fields
  if (adminCommands.length > 0) {
    embed.addFields({
      name: `${EMOJI.ADMIN} Admin Commands`,
      value: adminCommands.join('\n\n')
    });
  }

  if (memberCommands.length > 0) {
    embed.addFields({
      name: `${EMOJI.MEMBER} Member Commands`,
      value: memberCommands.join('\n\n')
    });
  }

  embed.setFooter({ text: `Use !help <command> for detailed information • v${BOT_VERSION}` });

  return embed;
}

/**
 * Build command-specific help
 */
function buildCommandHelp(commandName) {
  // Search for command in all categories
  for (const [category, commands] of Object.entries(COMMANDS)) {
    for (const [key, cmd] of Object.entries(commands)) {
      // Match by command name or aliases
      if (
        key === commandName.toLowerCase() ||
        cmd.usage.toLowerCase().includes(commandName.toLowerCase()) ||
        cmd.aliases.some(alias => alias.toLowerCase().includes(commandName.toLowerCase()))
      ) {
        const color = cmd.adminOnly ? COLORS.WARNING : COLORS.SUCCESS;
        const accessIcon = cmd.adminOnly ? EMOJI.ADMIN : EMOJI.MEMBER;
        const accessText = cmd.adminOnly ? "Admin Only" : "All Members";

        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(`${accessIcon} ${cmd.usage}`)
          .setDescription(cmd.description)
          .addFields({
            name: `${EMOJI.INFO} Details`,
            value: cmd.details.join('\n')
          });

        if (cmd.aliases.length > 0) {
          embed.addFields({
            name: `${EMOJI.BOOK} Aliases`,
            value: cmd.aliases.map(a => `\`${a}\``).join(', ')
          });
        }

        embed.addFields({
          name: `${EMOJI.GEAR} Access`,
          value: accessText,
          inline: true
        });

        embed.setFooter({ text: `Category: ${category.charAt(0).toUpperCase() + category.slice(1)} • v${BOT_VERSION}` });

        return embed;
      }
    }
  }

  return null;
}

/**
 * Build error embed for unknown command/category
 */
function buildErrorEmbed(query) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`${EMOJI.ERROR} Command Not Found`)
    .setDescription(
      `Could not find help for: \`${query}\`\n\n` +
      `**Available categories:**\n` +
      `• \`!help attendance\`\n` +
      `• \`!help auction\`\n` +
      `• \`!help intelligence\`\n` +
      `• \`!help leaderboard\`\n` +
      `• \`!help emergency\`\n\n` +
      `Or try \`!help\` for the main menu.`
    )
    .setFooter({ text: `v${BOT_VERSION}` });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HELP HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle help command
 */
async function handleHelp(message, args, member) {
  try {
    // No args = main help
    if (!args || args.length === 0) {
      const embed = buildMainHelp();
      await message.reply({ embeds: [embed] });
      return;
    }

    const query = args[0].toLowerCase();

    // Check if it's a category
    if (COMMANDS[query]) {
      const embed = buildCategoryHelp(query);
      if (embed) {
        await message.reply({ embeds: [embed] });
        return;
      }
    }

    // Check if it's a specific command
    const cmdEmbed = buildCommandHelp(query);
    if (cmdEmbed) {
      await message.reply({ embeds: [cmdEmbed] });
      return;
    }

    // Not found
    const errorEmbed = buildErrorEmbed(query);
    await message.reply({ embeds: [errorEmbed] });

  } catch (error) {
    LOGGING.error('[HELP] Error handling help command:', error);
    await message.reply(`${EMOJI.ERROR} An error occurred while generating help. Please try again.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  initialize,
  handleHelp,
};
