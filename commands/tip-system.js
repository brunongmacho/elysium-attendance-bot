/**
 * =============================================================================
 * TIP SYSTEM - Slash Command Adoption Tracking
 * =============================================================================
 *
 * Tracks which users have tried slash commands and provides tips to encourage
 * adoption without being intrusive.
 *
 * @module commands/tip-system
 * @author ELYSIUM Development Team
 */

/**
 * In-memory tracking of slash command usage per user
 * Structure: Map<userId, Set<commandName>>
 */
const slashCommandUsage = new Map();

/**
 * Users who have disabled tips
 * Structure: Set<userId>
 */
const tipsDisabled = new Set();

/**
 * Command to slash command mapping
 * Maps prefix commands to their slash equivalents
 */
const commandTipMapping = {
  // Boss Timer Commands (High Priority - Autocomplete is huge win)
  '!killed': {
    slash: '/killed',
    benefit: 'autocomplete for boss names'
  },
  '!spawned': {
    slash: '/spawned',
    benefit: 'autocomplete for boss names'
  },
  '!unkill': {
    slash: '/unkill',
    benefit: 'autocomplete for boss names'
  },
  '!setboss': {
    slash: '/setboss',
    benefit: 'autocomplete for boss names'
  },
  '!nospawn': {
    slash: '/nospawn',
    benefit: 'autocomplete for boss names'
  },
  '!nextspawn': {
    slash: '/nextspawn',
    benefit: 'cleaner interface'
  },
  '!maintenance': {
    slash: '/maintenance',
    benefit: 'one-click spawning'
  },
  '!serverdown': {
    slash: '/serverdown',
    benefit: 'cleaner interface'
  },
  '!clearkills': {
    slash: '/clearkills',
    benefit: 'cleaner interface'
  },

  // Boss Rotation Commands
  '!rotation': {
    slash: '/rotation',
    benefit: 'cleaner subcommands and autocomplete'
  },

  // Attendance Commands (Autocomplete for pending members)
  '!verify': {
    slash: '/verify',
    benefit: 'autocomplete for pending members'
  },
  '!deny': {
    slash: '/deny',
    benefit: 'autocomplete for pending members'
  },
  '!verifyall': {
    slash: '/verifyall',
    benefit: 'cleaner interface'
  },
  '!denyall': {
    slash: '/denyall',
    benefit: 'cleaner interface'
  },
  '!closeall': {
    slash: '/closeall',
    benefit: 'cleaner interface'
  },
  '!resetpending': {
    slash: '/resetpending',
    benefit: 'cleaner interface'
  },
};

/**
 * Track that a user has used a specific slash command
 *
 * @param {string} userId - Discord user ID
 * @param {string} commandName - Slash command name (without /)
 */
function trackSlashCommandUsage(userId, commandName) {
  if (!slashCommandUsage.has(userId)) {
    slashCommandUsage.set(userId, new Set());
  }
  slashCommandUsage.get(userId).add(commandName);
}

/**
 * Check if a user should see a tip for a specific command
 *
 * @param {string} userId - Discord user ID
 * @param {string} prefixCommand - Prefix command (e.g., '!killed')
 * @returns {boolean} True if tip should be shown
 */
function shouldShowTip(userId, prefixCommand) {
  // Check if tips are disabled for this user
  if (tipsDisabled.has(userId)) {
    return false;
  }

  // Check if this command has a slash equivalent
  const mapping = commandTipMapping[prefixCommand];
  if (!mapping) {
    return false;
  }

  // Extract command name from slash command (e.g., '/killed' -> 'killed')
  const slashCommandName = mapping.slash.substring(1);

  // Check if user has already tried this slash command
  const userCommands = slashCommandUsage.get(userId);
  if (userCommands && userCommands.has(slashCommandName)) {
    return false;
  }

  return true;
}

/**
 * Get tip message for a specific command
 *
 * @param {string} prefixCommand - Prefix command (e.g., '!killed')
 * @returns {string|null} Tip message or null if no tip available
 */
function getTipMessage(prefixCommand) {
  const mapping = commandTipMapping[prefixCommand];
  if (!mapping) {
    return null;
  }

  return `\n\n💡 **Tip:** Try \`${mapping.slash}\` for ${mapping.benefit}!`;
}

/**
 * Add tip to a message if appropriate
 *
 * @param {string} userId - Discord user ID
 * @param {string} prefixCommand - Prefix command used
 * @param {string|Object} message - Message content or embed object
 * @returns {string|Object} Message with tip appended (if appropriate)
 */
function addTipToMessage(userId, prefixCommand, message) {
  if (!shouldShowTip(userId, prefixCommand)) {
    return message;
  }

  const tip = getTipMessage(prefixCommand);
  if (!tip) {
    return message;
  }

  // Handle string messages
  if (typeof message === 'string') {
    return message + tip;
  }

  // Handle embed objects
  if (message && typeof message === 'object') {
    // If message has content, append tip
    if (message.content) {
      return {
        ...message,
        content: message.content + tip
      };
    }

    // If message only has embeds, add tip as content
    if (message.embeds) {
      return {
        ...message,
        content: tip.trim()
      };
    }
  }

  return message;
}

/**
 * Disable tips for a user
 *
 * @param {string} userId - Discord user ID
 */
function disableTips(userId) {
  tipsDisabled.add(userId);
}

/**
 * Enable tips for a user
 *
 * @param {string} userId - Discord user ID
 */
function enableTips(userId) {
  tipsDisabled.delete(userId);
}

/**
 * Check if tips are disabled for a user
 *
 * @param {string} userId - Discord user ID
 * @returns {boolean} True if tips are disabled
 */
function areTipsDisabled(userId) {
  return tipsDisabled.has(userId);
}

/**
 * Get statistics about tip system usage
 *
 * @returns {Object} Statistics object
 */
function getStatistics() {
  return {
    totalUsersTracked: slashCommandUsage.size,
    totalUsersWithTipsDisabled: tipsDisabled.size,
    commandsWithTips: Object.keys(commandTipMapping).length,
    averageSlashCommandsPerUser: slashCommandUsage.size > 0
      ? Array.from(slashCommandUsage.values()).reduce((sum, set) => sum + set.size, 0) / slashCommandUsage.size
      : 0
  };
}

module.exports = {
  trackSlashCommandUsage,
  shouldShowTip,
  getTipMessage,
  addTipToMessage,
  disableTips,
  enableTips,
  areTipsDisabled,
  getStatistics,
  commandTipMapping
};
