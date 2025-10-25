/**
 * Enhanced Help System for ELYSIUM Bot v6.0
 * Updated with all new features and command aliases
 */

const { EmbedBuilder } = require("discord.js");

// Module-level variables (initialized later)
let config = null;
let isAdminFunc = null;
let BOT_VERSION = null;

// Initialize function (called from index2.js)
function initialize(cfg, adminFunc, version) {
  config = cfg;
  isAdminFunc = adminFunc;
  BOT_VERSION = version;
}

// Detailed command descriptions
const COMMAND_HELP = {
  // === ATTENDANCE COMMANDS ===
  status: {
    usage: "!status",
    description: "View bot health, active spawns, and system statistics",
    category: "Attendance",
    adminOnly: true,
    example: "!status",
    details:
      "Shows:\n• Bot uptime and version\n• Active spawn threads (sorted oldest first)\n• Pending verifications\n• Memory usage\n• Last sheet sync time\n• Bidding system status",
  },

  addthread: {
    usage: "!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)",
    description: "Manually create a spawn thread with custom timestamp",
    category: "Attendance",
    adminOnly: true,
    example: "!addthread Clemantis will spawn in 5 minutes! (2025-10-22 14:30)",
    details:
      "Creates spawn thread even if timer bot is down.\n• Boss name must match database\n• Timestamp must be in format (YYYY-MM-DD HH:MM)\n• Auto-creates verification thread",
  },

  verify: {
    usage: "!verify @member",
    description: "Manually verify a member for the current spawn",
    category: "Attendance",
    adminOnly: true,
    example: "!verify @Username",
    details:
      "Use when:\n• Member's screenshot was valid but bot failed\n• Admin override needed\n• Member had technical issues",
  },

  verifyall: {
    usage: "!verifyall",
    description: "Auto-verify ALL pending members in current spawn thread",
    category: "Attendance",
    adminOnly: true,
    example: "!verifyall",
    details:
      "Bulk verification tool:\n• Shows confirmation with member list\n• Skips duplicates automatically\n• Updates confirmation thread\n• Use when mass approval needed",
  },

  resetpending: {
    usage: "!resetpending",
    description: "Clear all pending verifications in current thread",
    category: "Attendance",
    adminOnly: true,
    example: "!resetpending",
    details:
      "Emergency cleanup:\n• Removes ALL pending check-ins\n• Does NOT add them to verified list\n• Allows thread closure\n• Use when verifications stuck",
  },

  forcesubmit: {
    usage: "!forcesubmit",
    description: "Submit attendance to Sheets WITHOUT closing thread",
    category: "Attendance",
    adminOnly: true,
    example: "!forcesubmit",
    details:
      "Submits current verified members:\n• Thread stays open\n• Can add more members after\n• Use for early submission\n• Does NOT archive thread",
  },

  forceclose: {
    usage: "!forceclose",
    description: "Force close spawn ignoring pending verifications",
    category: "Attendance",
    adminOnly: true,
    example: "!forceclose",
    details:
      "Emergency closure:\n• Submits verified members only\n• Ignores ALL pending verifications\n• Deletes confirmation thread\n• Archives spawn thread\n• Use when stuck",
  },

  debugthread: {
    usage: "!debugthread",
    description: "Show detailed info about current spawn thread",
    category: "Attendance",
    adminOnly: true,
    example: "!debugthread",
    details:
      "Displays:\n• Boss name and timestamp\n• Verified member count and list\n• Pending verification count\n• Thread status (open/closed)\n• Confirmation thread link",
  },

  closeallthread: {
    usage: "!closeallthread",
    description: "Mass close ALL open spawn threads at once",
    category: "Attendance",
    adminOnly: true,
    example: "!closeallthread",
    details:
      "Bulk closure tool:\n• Auto-verifies all pending in ALL threads\n• Processes one at a time (3s delay)\n• Shows progress bar\n• Submits each to Sheets\n• Archives all threads\n• Use at end of session",
  },

  clearstate: {
    usage: "!clearstate",
    description: "Reset ALL bot memory and state",
    category: "Attendance",
    adminOnly: true,
    example: "!clearstate",
    details:
      "DANGER - Full reset:\n• Clears active spawns\n• Removes pending verifications\n• Deletes column cache\n• Fresh start\n• Does NOT affect Sheets\n• Use only if bot corrupted",
  },

  // === BIDDING COMMANDS ===
  auction: {
    usage: "!auction <item> <startPrice> <duration> [quantity]",
    description: "Add item to auction queue (supports batch auctions)",
    category: "Bidding",
    adminOnly: true,
    example: "!auction Dragon Sword 500 30 3",
    details:
      "Queue management:\n• Item name (spaces allowed)\n• Start price (integer only)\n• Duration in minutes\n• Quantity (optional, default 1)\n• Batch auctions: Top N bidders win\n• Items auction sequentially\n• Max 15-minute extensions\n• Max 10 items per batch",
  },

  queuelist: {
    usage: "!queuelist (or !ql, !queue)",
    description: "View all items in auction queue",
    category: "Bidding",
    adminOnly: true,
    example: "!ql",
    details:
      "Shows:\n• Item names\n• Start prices\n• Durations\n• Quantities (for batch auctions)\n• Queue position\n• Total count\n\nAliases: !ql, !queue",
  },

  removeitem: {
    usage: "!removeitem <itemName> (or !rm)",
    description: "Remove item from queue",
    category: "Bidding",
    adminOnly: true,
    example: "!rm Dragon Sword",
    details:
      "Removes before auction starts:\n• Cannot remove during active auction\n• Full item name required\n• Updates queue positions\n\nAlias: !rm",
  },

  clearqueue: {
    usage: "!clearqueue",
    description: "Remove ALL items from queue (requires confirmation)",
    category: "Bidding",
    adminOnly: true,
    example: "!clearqueue",
    details:
      "Emergency clear:\n• Cannot clear during auction\n• Requires ✅ confirmation\n• Clears entire queue\n• Does NOT refund points",
  },

  startauction: {
    usage: "!startauction (or !start)",
    description: "Begin auction session with queued items",
    category: "Bidding",
    adminOnly: true,
    example: "!start",
    details:
      "Starts session:\n• Loads points cache (instant bidding)\n• Auto-refreshes cache every 30min\n• Shows preview of items\n• 30-second item preview\n• Processes items one-by-one\n• Auto-submits at end\n• Concurrent start protection\n\nAlias: !start",
  },

  bid: {
    usage: "!bid <amount> (or !b)",
    description: "Place bid on current auction item",
    category: "Bidding",
    adminOnly: false,
    example: "!b 750",
    details:
      "Bidding rules:\n• Integers only (no decimals)\n• Must exceed current bid\n• 10-second confirmation with countdown\n• 3-second rate limit\n• Self-overbid = incremental locking\n• Last 10s bids pause timer\n• Max 15 extensions\n• Batch auctions: Top N bidders win\n\nAlias: !b",
  },

  bidstatus: {
    usage: "!bidstatus (or !bstatus)",
    description: "View bidding system status",
    category: "Bidding",
    adminOnly: false,
    example: "!bstatus",
    details:
      "Shows:\n• Cache status and age\n• Auto-refresh status\n• Queue items (first 5)\n• Active auction item\n• Current bid and winner\n• Time remaining\n• Dry run mode indicator\n\nAlias: !bstatus",
  },

  mypoints: {
    usage: "!mypoints (or !pts)",
    description: "Check your available bidding points",
    category: "Bidding",
    adminOnly: false,
    example: "!pts",
    details:
      'Personal points check:\n• Use ONLY in bidding channel (not threads)\n• Cannot use during active auction\n• Fetches fresh from Sheets\n• Auto-deletes after 30 seconds\n• Shows "Not found" if not in system\n\nAlias: !pts',
  },

  dryrun: {
    usage: "Automatic - No command needed",
    description: "Dry run mode shows yellow embeds automatically",
    category: "Bidding",
    adminOnly: true,
    example: "N/A - Visual distinction only",
    details:
      "Dry run visual indicators:\n• Bright YELLOW embed borders (#FFFF00)\n• ⚠️ DRY RUN MODE in footers\n• Uses TestBiddingPoints sheet\n• No manual toggle needed\n• Automatic visual distinction",
  },

  cancelitem: {
    usage: "!cancelitem",
    description: "Cancel current auction item and refund bids",
    category: "Bidding",
    adminOnly: true,
    example: "!cancelitem",
    details:
      "Cancels auction:\n• Use in auction thread only\n• Refunds ALL locked points\n• Archives thread\n• Moves to next item\n• Use if item unavailable",
  },

  skipitem: {
    usage: "!skipitem",
    description: 'Skip current item marking as "no sale"',
    category: "Bidding",
    adminOnly: true,
    example: "!skipitem",
    details:
      "Skips to next:\n• Use in auction thread only\n• Refunds locked points\n• Does NOT record in history\n• Archives thread\n• Use if no bids received",
  },

  resetbids: {
    usage: "!resetbids",
    description: "Reset entire bidding system (requires confirmation)",
    category: "Bidding",
    adminOnly: true,
    example: "!resetbids",
    details:
      "DANGER - Full reset:\n• Requires ✅ confirmation\n• Clears queue\n• Stops active auction\n• Unlocks all points\n• Clears history\n• Deletes cache\n• Stops auto-refresh\n• Does NOT submit to Sheets",
  },

  forcesubmitresults: {
    usage: "!forcesubmitresults",
    description: "Manually submit auction results to Sheets (requires confirmation)",
    category: "Bidding",
    adminOnly: true,
    example: "!forcesubmitresults",
    details:
      "Manual submission:\n• Shows current results\n• Requires ✅ confirmation\n• Auto-populates 0 for non-winners\n• Updates ALL members in sheet\n• Clears cache after\n• Stops auto-refresh\n• Use if auto-submit failed",
  },

  testbidding: {
    usage: "!testbidding",
    description: "Run complete bidding system diagnostics",
    category: "Bidding",
    adminOnly: true,
    example: "!testbidding",
    details:
      "Full diagnostic:\n• Tests webhook connection\n• Fetches sample points\n• Checks channel access\n• Verifies cache system\n• Shows configuration\n• Troubleshooting guide",
  },

  // === MEMBER COMMANDS ===
  present: {
    usage: 'present (or "here")',
    description: "Check in for boss spawn attendance",
    category: "Member",
    adminOnly: false,
    example: "present",
    details:
      "Check-in process:\n• Must attach screenshot (admins exempt)\n• Shows boss name and points\n• Creates pending verification\n• Wait for admin ✅ reaction\n• Cannot check in twice for same spawn",
  },
};

const CATEGORIES = {
  Attendance: "📋 Attendance System",
  Bidding: "💰 Bidding System",
  Member: "👤 Member Commands",
};

// Main help command handler
async function handleHelp(message, args, member) {
  if (!config || !isAdminFunc) {
    console.error(
      "❌ Help system not initialized! Call helpSystem.initialize() first."
    );
    return await message.reply("❌ Help system error. Contact admin.");
  }

  const isAdmin = isAdminFunc(member, config);

  // Specific command help: !help <command>
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
        { name: "📚 Details", value: cmdInfo.details, inline: false },
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
      )
      .setFooter({ text: "Use !help to see all commands" })
      .setTimestamp();

    return await message.reply({ embeds: [embed] });
  }

  // General help - categorized list
  if (isAdmin) {
    const attendanceCmds = Object.entries(COMMAND_HELP)
      .filter(([k, v]) => v.category === "Attendance" && v.adminOnly)
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
        "**Comprehensive command reference**\n\n💡 Use `!help <command>` for detailed info\n\n**New Features in v6.0:**\n✨ Cache auto-refresh every 30min\n✨ Extended 30s preview\n✨ Countdown timers on confirmations\n✨ Command aliases (!b, !ql, !bstatus, !pts, etc.)\n✨ Batch auctions (multiple items)\n✨ Concurrent start protection\n✨ Yellow embeds for dry run mode"
      )
      .addFields(
        {
          name: "📋 Attendance Management",
          value: attendanceCmds || "None",
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
        },
        {
          name: "📖 Quick Tips",
          value:
            "• Type `present` in spawn threads to check in\n• Use `!bid <amount>` or `!b <amount>` in auction threads\n• Commands are case-insensitive\n• Admin commands work in admin logs only\n• Many commands now have shortcuts!",
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
        ([k, v]) => `**!${k}** - ${v.description}\n*Example:* \`${v.example}\``
      )
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("📚 ELYSIUM Bot - Member Guide")
      .setDescription(
        "**Available commands for all members**\n\n💡 Use `!help <command>` for detailed info\n\n**New Shortcuts:**\n• !b = !bid\n• !bstatus = !bidstatus\n• !pts = !mypoints"
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
            "1. Type `present` or `here` in spawn threads\n2. Attach screenshot (shows boss + timestamp)\n3. Wait for admin ✅ verification\n4. Points auto-added to your account",
          inline: false,
        },
        {
          name: "💰 Bidding Process",
          value:
            "1. Wait for auction thread to open\n2. Type `!bid <amount>` or `!b <amount>`\n3. React ✅ to confirm within 10 seconds (countdown shown)\n4. Winner announced at end\n5. Batch auctions: Top N bidders win!",
          inline: false,
        },
        {
          name: "⚠️ Important Rules",
          value:
            "• Screenshot required for attendance\n• Bids must be integers (no decimals)\n• 3-second cooldown between bids\n• Can overbid yourself (pays difference)\n• Last 10s bids pause timer\n• Confirmations have countdown timers",
          inline: false,
        }
      )
      .setFooter({ text: "Need help? Ask an admin!" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
}

// Export for use in index2.js
module.exports = {
  initialize,
  handleHelp,
  COMMAND_HELP,
  CATEGORIES,
};