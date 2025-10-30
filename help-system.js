/**
 * Enhanced Help System for ELYSIUM Bot v8.0
 * Comprehensive, fancy interface with all commands from codebase
 */

const { EmbedBuilder } = require("discord.js");

const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  FIRE: "🔥",
  LOCK: "🔒",
  CHART: "📊",
  BID: "💰",
  TIME: "⏱️",
  LIST: "📋",
  CLOCK: "🕐",
  TROPHY: "🏆",
  BOSS: "🎯",
  LOOT: "🎁",
  MEMBER: "👤",
  ADMIN: "👑",
  THREAD: "🧵",
  CLOSE: "🔒",
  VERIFY: "✔️",
  TOOLS: "🛠️",
  BOOK: "📖",
  STAR: "⭐",
  SPARKLES: "✨",
  SHIELD: "🛡️",
  ROCKET: "🚀",
};

let config = null;
let isAdminFunc = null;
let BOT_VERSION = null;

function initialize(cfg, adminFunc, version) {
  config = cfg;
  isAdminFunc = adminFunc;
  BOT_VERSION = version;
}

// Complete command definitions from codebase
const COMMAND_HELP = {
  // ========================================
  // ATTENDANCE COMMANDS
  // ========================================
  status: {
    usage: "!status",
    description: "View bot health, active spawns, pending verifications, and system statistics",
    category: "Attendance",
    adminOnly: true,
    example: "!status",
    aliases: ["!st"],
    features: [
      "Bot uptime and memory usage",
      "Active spawn threads (sorted oldest first)",
      "Pending verifications count",
      "Last sheet synchronization time",
      "Bidding system status"
    ]
  },

  addthread: {
    usage: "!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)",
    description: "Manually create a spawn thread with custom timestamp (admin logs only)",
    category: "Attendance",
    adminOnly: true,
    example: "!addthread Clemantis will spawn in 5 minutes! (2025-10-22 14:30)",
    aliases: ["!addth"],
    features: [
      "Custom timestamp support",
      "Boss name fuzzy matching",
      "Auto-creates attendance + confirmation threads",
      "Validates boss names against database"
    ]
  },

  verify: {
    usage: "!verify @member",
    description: "Manually verify a member for attendance in current spawn thread",
    category: "Attendance",
    adminOnly: true,
    example: "!verify @Username",
    aliases: ["!v"],
    features: [
      "Override for missing screenshots",
      "Duplicate detection",
      "Auto-updates confirmation thread",
      "Instant points assignment"
    ]
  },

  verifyall: {
    usage: "!verifyall",
    description: "Auto-verify ALL pending members in current spawn thread (with confirmation)",
    category: "Attendance",
    adminOnly: true,
    example: "!verifyall",
    aliases: ["!vall"],
    features: [
      "Bulk verification",
      "Duplicate filtering",
      "Confirmation prompt",
      "Progress reporting"
    ]
  },

  resetpending: {
    usage: "!resetpending",
    description: "Clear all pending verifications in current thread without adding to verified list",
    category: "Attendance",
    adminOnly: true,
    example: "!resetpending",
    aliases: ["!resetpend"],
    features: [
      "Clears pending queue",
      "Doesn't affect verified members",
      "Allows clean thread closure",
      "Confirmation required"
    ]
  },

  forcesubmit: {
    usage: "!forcesubmit",
    description: "Submit attendance to Google Sheets WITHOUT closing the thread (allows continued check-ins)",
    category: "Attendance",
    adminOnly: true,
    example: "!forcesubmit",
    aliases: ["!fs"],
    features: [
      "Keeps thread open",
      "Submits current verified list",
      "Allows additional check-ins",
      "Shows member list on failure"
    ]
  },

  forceclose: {
    usage: "!forceclose",
    description: "Force close spawn thread ignoring ALL pending verifications",
    category: "Attendance",
    adminOnly: true,
    example: "!forceclose",
    aliases: ["!fc"],
    features: [
      "Bypasses pending verifications",
      "Submits verified members only",
      "Archives thread immediately",
      "Cleanup confirmation thread"
    ]
  },

  debugthread: {
    usage: "!debugthread",
    description: "Show detailed diagnostic information about current spawn thread state",
    category: "Attendance",
    adminOnly: true,
    example: "!debugthread",
    aliases: ["!debug"],
    features: [
      "Thread memory status",
      "Verified members list",
      "Pending verifications count",
      "Confirmation thread link",
      "Closure status"
    ]
  },

  closeallthread: {
    usage: "!closeallthread",
    description: "Mass close ALL open spawn threads at once (processes one by one)",
    category: "Attendance",
    adminOnly: true,
    example: "!closeallthread",
    aliases: ["!closeall"],
    features: [
      "Auto-verifies all pending in each thread",
      "Progress bar display",
      "Rate limit protection (3s delay between threads)",
      "Detailed success/failure reporting",
      "Reaction cleanup",
      "Estimated completion time"
    ]
  },

  clearstate: {
    usage: "!clearstate",
    description: "Reset ALL bot memory and state (nuclear option)",
    category: "Attendance",
    adminOnly: true,
    example: "!clearstate",
    aliases: ["!clear"],
    features: [
      "Clears all active spawns",
      "Clears pending verifications",
      "Clears confirmation messages",
      "Fresh start for bot",
      "Confirmation required"
    ]
  },

  maintenance: {
    usage: "!maintenance",
    description: "Bulk create attendance threads for all maintenance bosses at once",
    category: "Attendance",
    adminOnly: true,
    example: "!maintenance",
    features: [
      "Creates threads for 22+ maintenance bosses",
      "Automatic timestamp detection",
      "Batch thread creation",
      "Saves time during weekly maintenance",
      "Confirmation required"
    ]
  },

  // ========================================
  // LEADERBOARD COMMANDS
  // ========================================
  leaderboardattendance: {
    usage: "!leadatt",
    description: "Display attendance leaderboard showing top members by attendance points",
    category: "Leaderboard",
    adminOnly: true,
    example: "!leadatt",
    aliases: ["!leadatt"],
    features: [
      "Shows top 10 members by attendance",
      "Total attendance points per member",
      "Current week statistics",
      "Visual progress bars",
      "Average attendance calculation"
    ]
  },

  leaderboardbidding: {
    usage: "!leadbid",
    description: "Display bidding points leaderboard showing top members by points left",
    category: "Leaderboard",
    adminOnly: true,
    example: "!leadbid",
    aliases: ["!leadbid"],
    features: [
      "Shows top 10 members by points remaining",
      "Points left and consumed breakdown",
      "Total points distribution statistics",
      "Visual progress bars",
      "Real-time points data"
    ]
  },

  // ========================================
  // AUCTIONEERING COMMANDS
  // ========================================
  startauction: {
    usage: "!startauction",
    description: "Start attendance-based auction session (loads items from BiddingItems sheet)",
    category: "Auctioneering",
    adminOnly: true,
    example: "!startauction",
    aliases: ["!start", "!auc-start", "!begin-auction"],
    features: [
      "10-minute cooldown protection",
      "Loads items from Google Sheets",
      "Groups items by boss (attendance-required sessions)",
      "Sheet items = attendance verification",
      "Auto-loads attendance per boss",
      "Session preview before start"
    ]
  },

  startauctionnow: {
    usage: "!startauctionnow",
    description: "Override cooldown and start auction immediately (emergency use)",
    category: "Auctioneering",
    adminOnly: true,
    example: "!startauctionnow",
    aliases: ["!auc-now"],
    features: [
      "Bypasses 10-minute cooldown",
      "Immediate session start",
      "Resets cooldown timer",
      "Use sparingly"
    ]
  },

  pause: {
    usage: "!pause",
    description: "Pause active auctioneering session (freezes all timers)",
    category: "Auctioneering",
    adminOnly: true,
    example: "!pause",
    aliases: ["!auc-pause", "!hold"],
    features: [
      "Freezes current item timer",
      "Preserves remaining time",
      "Allows admin intervention",
      "Resume with !resume"
    ]
  },

  resume: {
    usage: "!resume",
    description: "Resume paused auctioneering session",
    category: "Auctioneering",
    adminOnly: true,
    example: "!resume",
    aliases: ["!auc-resume", "!continue"],
    features: [
      "Restores remaining time",
      "Extends to 60s if <60s left",
      "Reschedules all timers",
      "Continues where left off"
    ]
  },

  stop: {
    usage: "!stop",
    description: "End current auction item immediately and move to next",
    category: "Auctioneering",
    adminOnly: true,
    example: "!stop",
    aliases: ["!auc-stop", "!end-item"],
    features: [
      "Immediate auction end",
      "Awards current highest bidder",
      "Moves to next item",
      "20-second delay before next"
    ]
  },

  extend: {
    usage: "!extend <minutes>",
    description: "Add extra time to current auction item",
    category: "Auctioneering",
    adminOnly: true,
    example: "!extend 5",
    aliases: ["!ext", "!auc-extend"],
    features: [
      "Adds specified minutes",
      "Resets warning timers",
      "No extension limit",
      "Immediate effect"
    ]
  },

  // ========================================
  // BIDDING COMMANDS (Admin)
  // ========================================
  queuelist: {
    usage: "!queuelist",
    description: "View complete auction queue preview (shows all sessions)",
    category: "Bidding",
    adminOnly: true,
    example: "!queuelist",
    aliases: ["!ql", "!queue"],
    features: [
      "Shows boss-grouped sessions",
      "Attendee counts per session",
      "Item details (price, duration)",
      "Total session/item counts",
      "Order preview for !startauction"
    ]
  },

  removeitem: {
    usage: "!removeitem <itemName>",
    description: "Remove specific item from auction queue",
    category: "Bidding",
    adminOnly: true,
    example: "!removeitem Dragon Sword",
    aliases: ["!rm"],
    features: [
      "Case-insensitive search",
      "Shows remaining count",
      "Confirmation of removal"
    ]
  },

  clearqueue: {
    usage: "!clearqueue",
    description: "Manual queue has been deprecated - items must be added via Google Sheets",
    category: "Bidding",
    adminOnly: true,
    example: "!clearqueue",
    aliases: ["!clearq"],
    features: [
      "Shows deprecation message",
      "All items must be added to BiddingItems sheet"
    ]
  },

  resetbids: {
    usage: "!resetbids",
    description: "Reset entire bidding system (queue, cache, locked points, history)",
    category: "Bidding",
    adminOnly: true,
    example: "!resetbids",
    aliases: ["!resetb"],
    features: [
      "Nuclear option",
      "Clears all queues",
      "Clears locked points",
      "Clears cache",
      "Clears history",
      "Requires confirmation"
    ]
  },

  forcesubmitresults: {
    usage: "!forcesubmitresults",
    description: "Manually submit auction results to Google Sheets (recovery tool)",
    category: "Bidding",
    adminOnly: true,
    example: "!forcesubmitresults",
    aliases: ["!forcesubmit"],
    features: [
      "Recovery mechanism",
      "Submits current session history",
      "Shows data before submission",
      "Confirmation required",
      "Updates BiddingPoints sheet"
    ]
  },

  cancelitem: {
    usage: "!cancelitem",
    description: "Cancel current auction item and refund all locked points",
    category: "Bidding",
    adminOnly: true,
    example: "!cancelitem",
    aliases: ["!cancel"],
    features: [
      "Refunds all bids",
      "Unlocks points",
      "Moves to next item",
      "Confirmation required"
    ]
  },

  skipitem: {
    usage: "!skipitem",
    description: "Skip current item marking as 'no sale' (no refunds needed)",
    category: "Bidding",
    adminOnly: true,
    example: "!skipitem",
    aliases: ["!skip"],
    features: [
      "Marks as no sale",
      "Unlocks points",
      "Moves to next item",
      "Confirmation required"
    ]
  },

  // ========================================
  // LOOT SYSTEM (Admin)
  // ========================================
  loot: {
    usage: "!loot <boss> <date> <time>",
    description: "Process loot screenshots with OCR and log to Google Sheets (admin-logs threads only)",
    category: "Loot",
    adminOnly: true,
    example: "!loot EGO 10/27/2025 5:57:00\n!loot LADY DALIA 10/27/2025 3:32:00\n!loot GUILD BOSS 10/27/2025 21:00:00",
    features: [
      "OCR screenshot reading",
      "Auto-filters blacklisted items",
      "Boss name validation",
      "Quantity detection",
      "Multi-screenshot support",
      "Preview before submission",
      "Adds to BiddingItems sheet",
      "Source tagging (Loot/Guild Boss)"
    ]
  },

  // ========================================
  // MEMBER COMMANDS
  // ========================================
  present: {
    usage: 'present (or "here")',
    description: "Check in for boss spawn attendance (requires screenshot for non-admins)",
    category: "Member",
    adminOnly: false,
    example: "present\nhere\njoin\ncheckin",
    aliases: ["here", "join", "checkin", "check-in"],
    features: [
      "Screenshot verification (non-admins)",
      "Duplicate detection",
      "Admin fast-track (no screenshot)",
      "React ✅/❌ for admin verification",
      "Auto-points assignment on verify",
      "Updates confirmation thread"
    ]
  },

  bid: {
    usage: "!bid <amount> OR !b <amount>",
    description: "Place bid on current auction item (attendance-checked for boss items)",
    category: "Member",
    adminOnly: false,
    example: "!bid 750\n!b 1000",
    aliases: ["!b"],
    features: [
      "10-second confirmation window",
      "Attendance verification (boss items)",
      "Points validation",
      "Self-overbid support",
      "Locked points tracking",
      "3-second rate limit",
      "Auto-extension if bid in last 10s",
      "Highest bidder notification"
    ]
  },

  bidstatus: {
    usage: "!bidstatus",
    description: "View bidding system status (queue, active item, time left)",
    category: "Member",
    adminOnly: false,
    example: "!bidstatus",
    aliases: ["!bstatus", "!bs"],
    features: [
      "Active auction info",
      "Current bid amount",
      "Time remaining",
      "Queue preview",
      "Remaining items count"
    ]
  },

  mypoints: {
    usage: "!mypoints",
    description: "Check your available bidding points (bidding channel only, NOT during auction)",
    category: "Member",
    adminOnly: false,
    example: "!mypoints",
    aliases: ["!pts", "!mypts", "!mp"],
    features: [
      "Fresh fetch from Google Sheets",
      "Shows available points",
      "Auto-deletes in 30s",
      "Deletes command message",
      "Only works in bidding channel (not threads)",
      "Disabled during active auctions"
    ]
  },

  close: {
    usage: "close",
    description: "Admin command in spawn threads to close and submit attendance",
    category: "Attendance",
    adminOnly: true,
    example: "close",
    features: [
      "Validates no pending verifications",
      "Shows pending count if any remain",
      "Submits to Google Sheets",
      "Archives thread",
      "Cleans up confirmation thread",
      "Requires ✅ confirmation"
    ]
  },

  // ========================================
  // EMERGENCY COMMANDS
  // ========================================
  emergency: {
    usage: "!emergency <subcommand>",
    description: "🚨 Emergency recovery commands for stuck states (REQUIRES CONFIRMATION)",
    category: "Emergency",
    adminOnly: true,
    example: "!emergency diag\n!emergency closeall\n!emergency endauction",
    aliases: ["!emerg"],
    features: [
      "Force close all attendance threads",
      "Force close specific thread by ID",
      "Force end stuck auctions",
      "Unlock all locked points",
      "Clear pending bid confirmations",
      "State diagnostics",
      "Force sync to Google Sheets",
      "All commands require confirmation",
      "Use when normal commands fail"
    ]
  },
};

const CATEGORIES = {
  Attendance: `${EMOJI.THREAD} Attendance System`,
  Leaderboard: `${EMOJI.TROPHY} Leaderboard & Reports`,
  Auctioneering: `${EMOJI.FIRE} Auctioneering System`,
  Bidding: `${EMOJI.BID} Bidding System`,
  Loot: `${EMOJI.LOOT} Loot Recognition`,
  Member: `${EMOJI.MEMBER} Member Commands`,
  Emergency: `🚨 Emergency Recovery`,
};

const CATEGORY_DESCRIPTIONS = {
  Attendance: "Manage boss spawn check-ins, verifications, and Google Sheets submission",
  Leaderboard: "View attendance and bidding leaderboards, automatic weekly reports",
  Auctioneering: "Session-based auction system with attendance filtering per boss",
  Bidding: "Point-based auction management with queue and item tracking",
  Loot: "OCR-powered loot screenshot processing and automatic logging",
  Member: "Commands available to all ELYSIUM members",
  Emergency: "⚠️ ADMIN ONLY: Force recovery from stuck states (requires confirmation)",
};

async function handleHelp(message, args, member) {
  if (!config || !isAdminFunc) {
    console.error("❌ Help system not initialized!");
    return await message.reply("❌ Help system error. Contact admin.");
  }

  const isAdmin = isAdminFunc(member, config);

  // ========================================
  // SPECIFIC COMMAND HELP
  // ========================================
  if (args.length > 0) {
    const cmdName = args[0].toLowerCase().replace("!", "");
    let cmdInfo = COMMAND_HELP[cmdName];

    if (!cmdInfo) {
      // Try to find by alias
      let foundCmd = null;
      for (const [name, info] of Object.entries(COMMAND_HELP)) {
        if (info.aliases && info.aliases.some(a => a.replace("!", "") === cmdName)) {
          foundCmd = { name, info };
          break;
        }
      }

      if (!foundCmd) {
        return await message.reply(
          `${EMOJI.ERROR} Unknown command: \`${cmdName}\`\n\n` +
          `Use \`!help\` to see all commands.`
        );
      }

      cmdInfo = foundCmd.info;
    }

    if (cmdInfo.adminOnly && !isAdmin) {
      return await message.reply(
        `${EMOJI.LOCK} \`!${cmdName}\` is an admin-only command.\n\n` +
        `Use \`!help\` to see member commands.`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(cmdInfo.adminOnly ? 0xff6600 : 0x00ff00)
      .setTitle(`${EMOJI.BOOK} Command: !${cmdName}`)
      .setDescription(`${cmdInfo.description}`)
      .addFields(
        { 
          name: `${EMOJI.TOOLS} Usage`, 
          value: `\`\`\`${cmdInfo.usage}\`\`\``, 
          inline: false 
        },
        { 
          name: `${EMOJI.STAR} Example`, 
          value: `\`\`\`${cmdInfo.example}\`\`\``, 
          inline: false 
        },
        {
          name: `${EMOJI.CHART} Category`,
          value: CATEGORIES[cmdInfo.category],
          inline: true,
        },
        {
          name: `${EMOJI.SHIELD} Access`,
          value: cmdInfo.adminOnly ? `${EMOJI.ADMIN} Admin Only` : `${EMOJI.MEMBER} All Members`,
          inline: true,
        }
      );

    if (cmdInfo.aliases && cmdInfo.aliases.length > 0) {
      embed.addFields({
        name: `${EMOJI.SPARKLES} Aliases`,
        value: cmdInfo.aliases.map(a => `\`${a}\``).join(", "),
        inline: false,
      });
    }

    if (cmdInfo.features && cmdInfo.features.length > 0) {
      embed.addFields({
        name: `${EMOJI.ROCKET} Features`,
        value: cmdInfo.features.map(f => `• ${f}`).join("\n"),
        inline: false,
      });
    }

    embed.setFooter({ text: `Use !help to see all commands • Version ${BOT_VERSION}` });
    embed.setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // ========================================
  // GENERAL HELP - ADMIN VIEW
  // ========================================
  if (isAdmin) {
    const embeds = [];

    // Main overview embed
    const overviewEmbed = new EmbedBuilder()
      .setColor(0x4a90e2)
      .setTitle(`${EMOJI.SHIELD} ELYSIUM Bot - Complete Command Reference`)
      .setDescription(
        `${EMOJI.SPARKLES} **Version ${BOT_VERSION}** - Full-Featured Guild Management Bot\n\n` +
        `${EMOJI.INFO} **Navigation:**\n` +
        `• Use \`!help <command>\` for detailed info\n` +
        `• Scroll through pages for all categories\n` +
        `• Commands organized by function\n\n` +
        `${EMOJI.ROCKET} **New in v8.0:**\n` +
        `${EMOJI.SUCCESS} Attendance-based auction filtering\n` +
        `${EMOJI.SUCCESS} Session-based auctions (grouped by boss)\n` +
        `${EMOJI.SUCCESS} Sheet items = ATTENDANCE REQUIRED\n` +
        `${EMOJI.SUCCESS} OCR-powered loot logging\n` +
        `${EMOJI.SUCCESS} State persistence to Google Sheets\n` +
        `${EMOJI.SUCCESS} 10-minute auction cooldown\n` +
        `${EMOJI.SUCCESS} Auto-bidding channel cleanup (12h)\n` +
        `${EMOJI.SUCCESS} Maintenance bulk thread creation`
      )
      .addFields({
        name: `${EMOJI.CHART} Quick Stats`,
        value: 
          `${EMOJI.LIST} Total Commands: ${Object.keys(COMMAND_HELP).length}\n` +
          `${EMOJI.ADMIN} Admin Commands: ${Object.values(COMMAND_HELP).filter(c => c.adminOnly).length}\n` +
          `${EMOJI.MEMBER} Member Commands: ${Object.values(COMMAND_HELP).filter(c => !c.adminOnly).length}`,
        inline: false
      })
      .setFooter({ text: `Page 1/${Object.keys(CATEGORIES).length + 1} • Full access (Admin)` })
      .setTimestamp();

    embeds.push(overviewEmbed);

    // Category embeds
    for (const [category, displayName] of Object.entries(CATEGORIES)) {
      const cmdsInCategory = Object.entries(COMMAND_HELP)
        .filter(([k, v]) => v.category === category);

      if (cmdsInCategory.length === 0) continue;

      const categoryEmbed = new EmbedBuilder()
        .setColor(category === "Member" ? 0x00ff00 : 0xff6600)
        .setTitle(displayName)
        .setDescription(CATEGORY_DESCRIPTIONS[category]);

      // Group commands
      for (const [cmdName, cmdInfo] of cmdsInCategory) {
        const aliases = cmdInfo.aliases ? ` (${cmdInfo.aliases.map(a => `\`${a}\``).join(", ")})` : "";
        const access = cmdInfo.adminOnly ? `${EMOJI.ADMIN}` : `${EMOJI.MEMBER}`;
        
        categoryEmbed.addFields({
          name: `${access} !${cmdName}${aliases}`,
          value: `${cmdInfo.description}\n\`${cmdInfo.usage}\``,
          inline: false
        });
      }

      categoryEmbed.setFooter({ 
        text: `Page ${embeds.length + 1}/${Object.keys(CATEGORIES).length + 1} • ${cmdsInCategory.length} command(s)` 
      });
      categoryEmbed.setTimestamp();

      embeds.push(categoryEmbed);
    }

    // Send all embeds
    for (const embed of embeds) {
      await message.reply({ embeds: [embed] });
    }

  } else {
    // ========================================
    // GENERAL HELP - MEMBER VIEW
    // ========================================
    const memberCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => !v.adminOnly);

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${EMOJI.BOOK} ELYSIUM Bot - Member Guide`)
      .setDescription(
        `${EMOJI.SPARKLES} **Version ${BOT_VERSION}**\n\n` +
        `${EMOJI.INFO} Use \`!help <command>\` for detailed info\n\n` +
        `${EMOJI.WARNING} **Important:** Boss-specific auction items require attendance!\n` +
        `Only members who attended that boss can bid on its items.`
      );

    // Group by category
    for (const [category, displayName] of Object.entries(CATEGORIES)) {
      const cmdsInCat = memberCmds.filter(([k, v]) => v.category === category);
      
      if (cmdsInCat.length === 0) continue;

      const cmdList = cmdsInCat
        .map(([name, info]) => {
          const aliases = info.aliases ? ` / ${info.aliases.map(a => `\`${a}\``).join(", ")}` : "";
          return `**!${name}**${aliases}\n${info.description}`;
        })
        .join("\n\n");

      embed.addFields({
        name: displayName,
        value: cmdList,
        inline: false
      });
    }

    // Add guides
    embed.addFields(
      {
        name: `${EMOJI.THREAD} Attendance Check-In`,
        value:
          "1. Type `present` or `here` in spawn threads\n" +
          "2. Attach screenshot (shows boss + timestamp)\n" +
          "3. Wait for admin ✅ verification\n" +
          "4. Points auto-added + auction eligibility granted",
        inline: false,
      },
      {
        name: `${EMOJI.BID} Bidding Process`,
        value:
          "1. Wait for auction thread to open\n" +
          "2. Type `!bid <amount>` or `!b <amount>`\n" +
          "3. React ✅ to confirm within 10 seconds\n" +
          "4. **NOTE:** If item is from a boss spawn, only attendees can bid!\n" +
          "5. Winner announced at end",
        inline: false,
      },
      {
        name: `${EMOJI.FIRE} Attendance-Based Bidding`,
        value:
          `${EMOJI.BOSS} **Boss Items:** Only attendees can bid\n` +
          `${EMOJI.INFO} Check auction message for restrictions\n` +
          `${EMOJI.TROPHY} Attend boss spawns to unlock more bidding!`,
        inline: false,
      }
    );

    embed.setFooter({ 
      text: `${memberCmds.length} commands available • Need help? Ask an admin!` 
    });
    embed.setTimestamp();

    await message.reply({ embeds: [embed] });
  }
}

module.exports = {
  initialize,
  handleHelp,
  COMMAND_HELP,
  CATEGORIES,
  CATEGORY_DESCRIPTIONS,
};