/**
 * ============================================================================
 * COMMAND ALIASES MODULE
 * ============================================================================
 *
 * Maps shorthand commands to their canonical names for user convenience.
 * This allows users to use shortcuts like "!b" instead of "!bid".
 *
 * @module config/command-aliases
 * @author Tenchu Attendance Bot Team
 * @version 1.0
 * ============================================================================
 */

/**
 * Command alias mapping for shorthand commands.
 * Maps user-friendly shortcuts to canonical command names.
 *
 * @type {Object.<string, string>}
 * @constant
 *
 * @example
 * "!st" -> "!status"
 * "!b" -> "!bid"
 */
const COMMAND_ALIASES = {
  // Help commands
  "!?": "!help",
  "!commands": "!help",
  "!cmds": "!help",
  "!nm": "!newmember",

  // Fun commands

  // Member info commands
  "!profile": "!stats",
  "!stat": "!stats",
  "!info": "!stats",
  "!mystats": "!stats",

  // Leaderboard commands
  "!leadatt": "!leaderboardattendance",
  "!leadbid": "!leaderboardbidding",
  "!lbattendance": "!leaderboardattendance",
  "!lba": "!leaderboardattendance",
  "!lbbidding": "!leaderboardbidding",
  "!lbb": "!leaderboardbidding",
  "!leaderboard": "!leaderboards",  // FIX: Map singular to plural for NLP compatibility
  "!lb": "!leaderboards",
  "!week": "!weekly",              // MongoDB-powered weekly report (40-100x faster)
  "!month": "!monthly",            // MongoDB-powered monthly report (40-100x faster)

  // Activity heatmap commands
  "!heatmap": "!activity",
  "!activityheatmap": "!activity",
  "!guildactivity": "!activity",

  // Attendance commands (admin)
  "!st": "!status",
  "!attendancestatus": "!status",  // NLP: Map attendance status queries to general status
  "!closeall": "!closeallthread",
  "!maint": "!maintenance",

  // Boss spawn alias commands
  "!whennext": "!nextspawn",
  "!spawntimer": "!nextspawn",

  // Bidding commands (admin)
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!start": "!startauction",
  "!auction": "!startauction",  // FIX: Add !auction alias
  "!startauc": "!startauction",

  // Emergency commands (admin) - Standalone commands
  "!emerg": "!emergency",
  "!fct": "!forceclosethread",
  "!fcat": "!forcecloseallthreads",
  "!fea": "!forceendauction",
  "!unlock": "!unlockallpoints",
  "!clearbids": "!clearallbids",
  "!diag": "!diagnostics",
  "!fsync": "!forcesync",

  // Member management commands (admin)
  "!removemem": "!removemember",
  "!rmmember": "!removemember",
  "!delmember": "!removemember",

  // Bidding commands (member)
  "!b": "!bid",

  // Auctioneering commands
  "!auc-start": "!startauction",
  "!begin-auction": "!startauction",
  "!auc-now": "!startauctionnow",

  // Auction control commands
  "!auctionend": "!endauction",
  "!end": "!endauction",
};

/**
 * Resolves a command alias to its canonical form.
 *
 * Converts shorthand commands (e.g., "!b", "!st") to their full forms
 * (e.g., "!bid", "!status") using the COMMAND_ALIASES mapping.
 * If no alias exists, returns the command unchanged.
 *
 * @param {string} command - The command to resolve (e.g., "!b")
 * @returns {string} The canonical command name (e.g., "!bid")
 *
 * @example
 * resolveCommandAlias("!b") // returns "!bid"
 * resolveCommandAlias("!bid") // returns "!bid" (already canonical)
 */
function resolveCommandAlias(command) {
  const lowerCmd = command.toLowerCase();
  return COMMAND_ALIASES[lowerCmd] || lowerCmd;
}

module.exports = {
  COMMAND_ALIASES,
  resolveCommandAlias
};
