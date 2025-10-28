/**
 * Enhanced Help System for ELYSIUM Bot v7.0
 * Updated with all current features and attendance-based auctions
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
};

let config = null;
let isAdminFunc = null;
let BOT_VERSION = null;

function initialize(cfg, adminFunc, version) {
  config = cfg;
  isAdminFunc = adminFunc;
  BOT_VERSION = version;
}

const COMMAND_HELP = {
  // === ATTENDANCE COMMANDS ===
  status: {
    usage: "!status",
    description: "View bot health, active spawns, and system statistics",
    category: "Attendance",
    adminOnly: true,
    example: "!status",
  },

  addthread: {
    usage: "!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)",
    description: "Manually create a spawn thread with custom timestamp",
    category: "Attendance",
    adminOnly: true,
    example: "!addthread Clemantis will spawn in 5 minutes! (2025-10-22 14:30)",
  },

  verify: {
    usage: "!verify @member",
    description: "Manually verify a member for the current spawn",
    category: "Attendance",
    adminOnly: true,
    example: "!verify @Username",
  },

  verifyall: {
    usage: "!verifyall",
    description: "Auto-verify ALL pending members in current spawn thread",
    category: "Attendance",
    adminOnly: true,
    example: "!verifyall",
  },

  resetpending: {
    usage: "!resetpending",
    description: "Clear all pending verifications in current thread",
    category: "Attendance",
    adminOnly: true,
    example: "!resetpending",
  },

  forcesubmit: {
    usage: "!forcesubmit",
    description: "Submit attendance to Sheets WITHOUT closing thread",
    category: "Attendance",
    adminOnly: true,
    example: "!forcesubmit",
  },

  forceclose: {
    usage: "!forceclose",
    description: "Force close spawn ignoring pending verifications",
    category: "Attendance",
    adminOnly: true,
    example: "!forceclose",
  },

  debugthread: {
    usage: "!debugthread",
    description: "Show detailed info about current spawn thread",
    category: "Attendance",
    adminOnly: true,
    example: "!debugthread",
  },

  closeallthread: {
    usage: "!closeallthread",
    description: "Mass close ALL open spawn threads at once",
    category: "Attendance",
    adminOnly: true,
    example: "!closeallthread",
  },

  clearstate: {
    usage: "!clearstate",
    description: "Reset ALL bot memory and state",
    category: "Attendance",
    adminOnly: true,
    example: "!clearstate",
  },

  // === AUCTIONEERING COMMANDS ===
  startauction: {
    usage: "!startauction",
    description: "Start auction session (Sheet items + queue, attendance-filtered)",
    category: "Auctioneering",
    adminOnly: true,
    example: "!startauction",
    aliases: ["!start", "!auc-start", "!begin-auction"],
  },

  startauctionnow: {
    usage: "!startauctionnow",
    description: "Start auction immediately, overriding cooldown",
    category: "Auctioneering",
    adminOnly: true,
    example: "!startauctionnow",
    aliases: ["!auc-now"],
  },

  pause: {
    usage: "!pause",
    description: "Pause active auctioneering session",
    category: "Auctioneering",
    adminOnly: true,
    example: "!pause",
    aliases: ["!auc-pause", "!hold"],
  },

  resume: {
    usage: "!resume",
    description: "Resume paused auctioneering session",
    category: "Auctioneering",
    adminOnly: true,
    example: "!resume",
    aliases: ["!auc-resume", "!continue"],
  },

  stop: {
    usage: "!stop",
    description: "End current item immediately and move to next",
    category: "Auctioneering",
    adminOnly: true,
    example: "!stop",
    aliases: ["!auc-stop", "!end-item"],
  },

  extend: {
    usage: "!extend <minutes>",
    description: "Add time to current auction",
    category: "Auctioneering",
    adminOnly: true,
    example: "!extend 5",
    aliases: ["!ext", "!auc-extend"],
  },

  // === BIDDING COMMANDS (Admin) ===
  auction: {
    usage: "!auction <item> <startPrice> <duration> [quantity]",
    description: "Add item to manual queue (will be auctioned OPEN to all)",
    category: "Bidding",
    adminOnly: true,
    example: "!auction Dragon Sword 500 30",
  },

  queuelist: {
    usage: "!queuelist",
    description: "View auction queue preview (shows sessions)",
    category: "Bidding",
    adminOnly: true,
    example: "!queuelist",
    aliases: ["!ql", "!queue"],
  },

  removeitem: {
    usage: "!removeitem <itemName>",
    description: "Remove item from queue",
    category: "Bidding",
    adminOnly: true,
    example: "!removeitem Dragon Sword",
    aliases: ["!rm"],
  },

  clearqueue: {
    usage: "!clearqueue",
    description: "Remove ALL items from queue (requires confirmation)",
    category: "Bidding",
    adminOnly: true,
    example: "!clearqueue",
  },

  resetbids: {
    usage: "!resetbids",
    description: "Reset entire bidding system (requires confirmation)",
    category: "Bidding",
    adminOnly: true,
    example: "!resetbids",
  },

  forcesubmitresults: {
    usage: "!forcesubmitresults",
    description: "Manually submit auction results to Sheets",
    category: "Bidding",
    adminOnly: true,
    example: "!forcesubmitresults",
  },

  cancelitem: {
    usage: "!cancelitem",
    description: "Cancel current auction item and refund bids",
    category: "Bidding",
    adminOnly: true,
    example: "!cancelitem",
  },

  skipitem: {
    usage: "!skipitem",
    description: 'Skip current item marking as "no sale"',
    category: "Bidding",
    adminOnly: true,
    example: "!skipitem",
  },

  testbidding: {
    usage: "!testbidding",
    description: "Run complete bidding system diagnostics",
    category: "Bidding",
    adminOnly: true,
    example: "!testbidding",
  },

  // === BIDDING COMMANDS (Member) ===
  bid: {
    usage: "!bid <amount>",
    description: "Place bid on current auction item (attendance-checked for boss items)",
    category: "Member",
    adminOnly: false,
    example: "!bid 750",
    aliases: ["!b"],
  },

  bidstatus: {
    usage: "!bidstatus",
    description: "View bidding system status",
    category: "Member",
    adminOnly: false,
    example: "!bidstatus",
    aliases: ["!bstatus", "!bs"],
  },

  mypoints: {
    usage: "!mypoints",
    description: "Check your available bidding points",
    category: "Member",
    adminOnly: false,
    example: "!mypoints",
    aliases: ["!pts", "!mypts", "!mp"],
  },

  // === MEMBER COMMANDS ===
  present: {
    usage: 'present (or "here")',
    description: "Check in for boss spawn attendance",
    category: "Member",
    adminOnly: false,
    example: "present",
  },
};

const CATEGORIES = {
  Attendance: "📋 Attendance System",
  Auctioneering: "🔥 Auctioneering System",
  Bidding: "💰 Bidding System",
  Member: "👤 Member Commands",
};

async function handleHelp(message, args, member) {
  if (!config || !isAdminFunc) {
    console.error("❌ Help system not initialized!");
    return await message.reply("❌ Help system error. Contact admin.");
  }

  const isAdmin = isAdminFunc(member, config);

  // Specific command help
  if (args.length > 0) {
    const cmdName = args[0].toLowerCase().replace("!", "");
    const cmdInfo = COMMAND_HELP[cmdName];

    if (!cmdInfo) {
      return await message.reply(
        `❌ Unknown command: \`${cmdName}\`\n\nUse \`!help\` to see all commands.`
      );
    }

    if (cmdInfo.adminOnly && !isAdmin) {
      return await message.reply(
        `🔒 \`!${cmdName}\` is an admin-only command.\n\nUse \`!help\` to see member commands.`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(cmdInfo.adminOnly ? 0xff6600 : 0x00ff00)
      .setTitle(`📖 Command: !${cmdName}`)
      .setDescription(cmdInfo.description)
      .addFields(
        { name: "📝 Usage", value: `\`${cmdInfo.usage}\``, inline: false },
        { name: "💡 Example", value: `\`${cmdInfo.example}\``, inline: false },
        {
          name: "🎯 Category",
          value: CATEGORIES[cmdInfo.category],
          inline: true,
        },
        {
          name: "🔓 Access",
          value: cmdInfo.adminOnly ? "👑 Admin Only" : "👥 All Members",
          inline: true,
        }
      );

    if (cmdInfo.aliases) {
      embed.addFields({
        name: "🔀 Aliases",
        value: cmdInfo.aliases.join(", "),
        inline: false,
      });
    }

    embed.setFooter({ text: "Use !help to see all commands" });
    embed.setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // General help - categorized list
  if (isAdmin) {
    const attendanceCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => v.category === "Attendance" && v.adminOnly)
      .map(([k, v]) => `\`!${k}\` - ${v.description}`)
      .join("\n");

    const auctioneeringCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => v.category === "Auctioneering" && v.adminOnly)
      .map(([k, v]) => `\`!${k}\` - ${v.description}`)
      .join("\n");

    const biddingCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => v.category === "Bidding" && v.adminOnly)
      .map(([k, v]) => `\`!${k}\` - ${v.description}`)
      .join("\n");

    const memberCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => !v.adminOnly)
      .map(([k, v]) => `\`!${k}\` - ${v.description}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x4a90e2)
      .setTitle("🛡️ ELYSIUM Bot - Admin Commands")
      .setDescription(
        "**New in v7.0:**\n" +
        "✨ Attendance-based auction filtering\n" +
        "✨ Session-based auctions (grouped by boss)\n" +
        "✨ Manual items = OPEN (no attendance required)\n" +
        "✨ Sheet items = ATTENDANCE REQUIRED\n" +
        "✨ Automatic attendance loading per boss\n" +
        "✨ 10-minute cooldown with override\n" +
        "✨ State persistence to Google Sheets\n\n" +
        "**Key Feature:** Only attendees can bid on boss-specific items!"
      )
      .addFields(
        {
          name: "📋 Attendance Management",
          value: attendanceCmds || "None",
          inline: false,
        },
        {
          name: "🔥 Auctioneering (Session-Based)",
          value: auctioneeringCmds || "None",
          inline: false,
        },
        {
          name: "💰 Bidding Management",
          value: biddingCmds || "None",
          inline: false,
        },
        {
          name: "👤 Member Commands",
          value: memberCmds || "None",
          inline: false,
        }
      )
      .setFooter({
        text: `Version ${BOT_VERSION} • ${
          Object.keys(COMMAND_HELP).length
        } commands available`,
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } else {
    const memberCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => !v.adminOnly)
      .map(
        ([k, v]) =>
          `**!${k}** - ${v.description}\n*Example:* \`${v.example}\``
      )
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("📚 ELYSIUM Bot - Member Guide")
      .setDescription(
        "**Available commands for all members**\n\n" +
        "💡 Use `!help <command>` for detailed info\n\n" +
        "**Important:** Boss-specific auction items require attendance!\n" +
        "Only members who attended that boss can bid on its items.\n" +
        "Manual queue items are OPEN to everyone."
      )
      .addFields(
        {
          name: "👥 Your Commands",
          value: memberCmds || "None",
          inline: false,
        },
        {
          name: "📋 Attendance Check-In",
          value:
            "1. Type `present` or `here` in spawn threads\n" +
            "2. Attach screenshot (shows boss + timestamp)\n" +
            "3. Wait for admin ✅ verification\n" +
            "4. Points auto-added + auction eligibility granted",
          inline: false,
        },
        {
          name: "💰 Bidding Process",
          value:
            "1. Wait for auction thread to open\n" +
            "2. Type `!bid <amount>` or `!b <amount>`\n" +
            "3. React ✅ to confirm within 10 seconds\n" +
            "4. **NOTE:** If item is from a boss spawn, only attendees can bid!\n" +
            "5. Winner announced at end",
          inline: false,
        },
        {
          name: "⚠️ Attendance-Based Bidding",
          value:
            "• **Boss Items:** Only attendees can bid\n" +
            "• **Manual Items:** Open to everyone\n" +
            "• Check auction message for restrictions\n" +
            "• Attend boss spawns to unlock more bidding!",
          inline: false,
        }
      )
      .setFooter({ text: "Need help? Ask an admin!" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
}

module.exports = {
  initialize,
  handleHelp,
  COMMAND_HELP,
  CATEGORIES,
};