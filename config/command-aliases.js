/**
 * ============================================================================
 * COMMAND ALIASES MODULE
 * ============================================================================
 *
 * Maps shorthand commands to their canonical names for user convenience.
 * This allows users to use shortcuts like "!b" instead of "!bid".
 *
 * @module config/command-aliases
 * @author Elysium Attendance Bot Team
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
  "!8ball": "!eightball",
  "!8b": "!eightball",
  "!magic": "!eightball",
  "!sampal": "!slap",
  "!hampas": "!slap",

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
  "!week": "!weeklyreport",
  "!weekly": "!weeklyreport",
  "!month": "!monthlyreport",
  "!monthly": "!monthlyreport",

  // Activity heatmap commands
  "!heatmap": "!activity",
  "!activityheatmap": "!activity",
  "!guildactivity": "!activity",

  // Attendance commands (admin)
  "!st": "!status",
  "!attendancestatus": "!status",  // NLP: Map attendance status queries to general status
  "!addth": "!addthread",
  "!v": "!verify",
  "!vall": "!verifyall",
  "!resetpend": "!resetpending",
  "!fs": "!forcesubmit",
  "!fc": "!forceclose",
  "!debug": "!debugthread",
  "!closeall": "!closeallthread",
  "!clear": "!clearstate",
  "!maint": "!maintenance",

  // Bidding commands (admin)
  "!ql": "!queuelist",
  "!queue": "!queuelist",
  "!start": "!startauction",
  "!auction": "!startauction",  // FIX: Add !auction alias
  "!startauc": "!startauction",
  "!resetb": "!resetbids",
  "!forcesubmit": "!forcesubmitresults",
  "!fixlocked": "!fixlockedpoints",
  "!audit": "!auctionaudit",
  "!resetauc": "!resetauction",
  "!recover": "!recoverauction",

  // Emergency commands (admin) - Standalone commands
  "!emerg": "!emergency",
  "!forceclosethread": "!forceclosethread",
  "!fct": "!forceclosethread",
  "!forcecloseallthreads": "!forcecloseallthreads",
  "!fcat": "!forcecloseallthreads",
  "!forceendauction": "!forceendauction",
  "!fea": "!forceendauction",
  "!unlockallpoints": "!unlockallpoints",
  "!unlock": "!unlockallpoints",
  "!clearallbids": "!clearallbids",
  "!clearbids": "!clearallbids",
  "!diagnostics": "!diagnostics",
  "!diag": "!diagnostics",
  "!forcesync": "!forcesync",
  "!fsync": "!forcesync",
  "!testmilestones": "!testmilestones",
  "!tm": "!testmilestones",

  // Intelligence engine commands (admin)
  "!predict": "!predictprice",
  "!suggestprice": "!predictprice",
  "!suggestauction": "!analyzequeue",
  "!aq": "!analyzequeue",
  "!auctionqueue": "!analyzequeue",
  "!bootstrap": "!bootstraplearning",
  "!learnhistory": "!bootstraplearning",
  "!engage": "!engagement",
  "!analyze": "!engagement",  // FIX: Change from !analyzeengagement to !engagement (single member)
  "!analyzeall": "!analyzeengagement",  // NEW: For all members analysis
  "!guildanalyze": "!analyzeengagement",
  "!anomaly": "!detectanomalies",
  "!fraud": "!detectanomalies",
  "!recommend": "!recommendations",
  "!suggest": "!recommendations",
  "!perf": "!performance",
  "!nextspawn": "!predictspawn",
  "!whennext": "!predictspawn",
  "!spawntimer": "!predictspawn",
  "!predatt": "!predictattendance",  // NEW: Short alias for predictattendance

  // Member management commands (admin)
  "!removemem": "!removemember",
  "!rmmember": "!removemember",
  "!delmember": "!removemember",

  // Bidding commands (member)
  "!b": "!bid",
  "!bstatus": "!bidstatus",
  "!bs": "!bidstatus",
  "!pts": "!mypoints",
  "!mypts": "!mypoints",
  "!mp": "!mypoints",

  // Auctioneering commands
  "!auc-start": "!startauction",
  "!begin-auction": "!startauction",
  "!auc-pause": "!pause",
  "!pauseauction": "!pause",  // FIX: Add !pauseauction alias
  "!hold": "!pause",
  "!auc-resume": "!resume",
  "!resumeauction": "!resume",  // FIX: Add !resumeauction alias
  "!continue": "!resume",
  "!auc-stop": "!stop",
  "!end-item": "!stop",
  "!auc-extend": "!extend",
  "!ext": "!extend",
  "!auc-now": "!startauctionnow",

  // Auction control commands
  "!cancel": "!cancelitem",
  "!cancelitem": "!cancelitem",
  "!skip": "!skipitem",
  "!skipitem": "!skipitem",
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
