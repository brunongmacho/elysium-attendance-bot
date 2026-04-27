/**
 * ============================================================================
 * COMMON VALIDATION UTILITIES (PHASE 3.4)
 * ============================================================================
 *
 * Centralized validation functions to replace scattered validation logic:
 * - Discord channel/role/user validation
 * - Numeric value validation
 * - Permission checks
 * - Input sanitization
 *
 * @module utils/validators
 */

const config = require('../config.json');

// ============================================================================
// DISCORD ENTITY VALIDATION
// ============================================================================

/**
 * Check if user has admin permissions.
 *
 * @param {Object} member - Discord GuildMember object
 * @returns {boolean} True if user is admin
 *
 * @example
 * if (!isAdmin(message.member)) {
 *   return message.reply('❌ This command is restricted to administrators.');
 * }
 */
function isAdmin(member) {
  if (!member) return false;

  // Get role IDs from config.role_ids and role names from config.admin_roles
  const roleIds = Object.values(config.role_ids || {});
  const roleNames = config.admin_roles || [];

  return member.roles.cache.some((r) => 
    roleNames.includes(r.name) || 
    roleIds.includes(r.id)
  );
}

/**
 * Validate Discord channel exists and is accessible.
 *
 * @param {Object} channel - Discord channel object
 * @returns {boolean} True if channel is valid
 *
 * @example
 * const channel = await client.channels.fetch(channelId);
 * if (!isValidChannel(channel)) {
 *   console.error('Invalid channel');
 * }
 */
function isValidChannel(channel) {
  return channel !== null && channel !== undefined;
}

/**
 * Check if channel is text-based (can send messages).
 *
 * @param {Object} channel - Discord channel object
 * @returns {boolean} True if channel supports text messages
 *
 * @example
 * if (isTextChannel(channel)) {
 *   await channel.send('Hello!');
 * }
 */
function isTextChannel(channel) {
  return channel && typeof channel.isTextBased === 'function' && channel.isTextBased();
}

/**
 * Check if channel is a thread.
 *
 * @param {Object} channel - Discord channel object
 * @returns {boolean} True if channel is a thread
 *
 * @example
 * if (isThread(channel)) {
 *   await channel.setArchived(false);
 * }
 */
function isThread(channel) {
  return channel && channel.isThread && channel.isThread();
}

/**
 * Check if user exists and is valid.
 *
 * @param {Object} user - Discord User object
 * @returns {boolean} True if user is valid
 */
function isValidUser(user) {
  return user !== null && user !== undefined && !user.bot;
}

// ============================================================================
// NUMERIC VALIDATION
// ============================================================================

/**
 * Check if value is a positive integer.
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if value is positive integer
 *
 * @example
 * isPositiveInteger('5');      // true
 * isPositiveInteger(10);       // true
 * isPositiveInteger('-5');     // false
 * isPositiveInteger('abc');    // false
 */
function isPositiveInteger(value) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0 && Number.isInteger(num);
}

/**
 * Check if value is a non-negative integer (>= 0).
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if value is non-negative integer
 *
 * @example
 * isNonNegativeInteger(0);     // true
 * isNonNegativeInteger('5');   // true
 * isNonNegativeInteger(-1);    // false
 */
function isNonNegativeInteger(value) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= 0 && Number.isInteger(num);
}

/**
 * Validate numeric value is within range.
 *
 * @param {number} value - Value to check
 * @param {number} min - Minimum allowed value (inclusive)
 * @param {number} max - Maximum allowed value (inclusive)
 * @returns {boolean} True if value is in range
 *
 * @example
 * isInRange(5, 1, 10);    // true
 * isInRange(0, 1, 10);    // false
 * isInRange(15, 1, 10);   // false
 */
function isInRange(value, min, max) {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Parse and validate bid amount.
 *
 * @param {string} input - User input for bid amount
 * @param {number} maxAmount - Maximum allowed bid
 * @returns {Object} Result with { valid: boolean, amount: number, error: string }
 *
 * @example
 * const result = validateBidAmount('100', 1000);
 * if (!result.valid) {
 *   return message.reply(result.error);
 * }
 * const bidAmount = result.amount;
 */
function validateBidAmount(input, maxAmount = 999999) {
  const amount = parseInt(input, 10);

  if (isNaN(amount)) {
    return { valid: false, amount: 0, error: '❌ Invalid bid amount. Please enter a valid number.' };
  }

  if (amount <= 0) {
    return { valid: false, amount: 0, error: '❌ Bid amount must be greater than 0.' };
  }

  if (amount > maxAmount) {
    return { valid: false, amount: 0, error: `❌ Bid amount cannot exceed ${maxAmount}.` };
  }

  return { valid: true, amount, error: null };
}

// ============================================================================
// STRING VALIDATION
// ============================================================================

/**
 * Check if string is empty or only whitespace.
 *
 * @param {string} str - String to check
 * @returns {boolean} True if string is empty/whitespace
 *
 * @example
 * isEmpty('');         // true
 * isEmpty('   ');      // true
 * isEmpty('hello');    // false
 */
function isEmpty(str) {
  return !str || str.trim().length === 0;
}

/**
 * Validate string length is within bounds.
 *
 * @param {string} str - String to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if length is valid
 *
 * @example
 * isValidLength('hello', 1, 10);    // true
 * isValidLength('', 1, 10);         // false
 * isValidLength('x'.repeat(100), 1, 10);  // false
 */
function isValidLength(str, minLength, maxLength) {
  if (!str) return false;
  const len = str.trim().length;
  return len >= minLength && len <= maxLength;
}

/**
 * Sanitize user input (remove potentially harmful characters).
 *
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized input
 *
 * @example
 * sanitizeInput('Hello @everyone');  // 'Hello everyone'
 * sanitizeInput('<script>alert()</script>'); // 'scriptalert()script'
 */
function sanitizeInput(input) {
  if (!input) return '';

  return input
    .toString()
    .replace(/@everyone/gi, 'everyone')
    .replace(/@here/gi, 'here')
    .replace(/[<>]/g, '')  // Remove angle brackets
    .trim();
}

// ============================================================================
// DATE/TIME VALIDATION
// ============================================================================

/**
 * Validate timestamp format (MM/DD/YY HH:MM).
 *
 * @param {string} timestamp - Timestamp to validate
 * @returns {boolean} True if format is valid
 *
 * @example
 * isValidTimestamp('10/29/25 09:22');  // true
 * isValidTimestamp('1/5/25 9:22');     // false (not zero-padded)
 * isValidTimestamp('invalid');         // false
 */
function isValidTimestamp(timestamp) {
  if (!timestamp) return false;
  return /^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(timestamp.toString().trim());
}

/**
 * Check if date is in the past.
 *
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is in the past
 *
 * @example
 * isPastDate(new Date('2020-01-01'));  // true
 * isPastDate(new Date('2030-01-01'));  // false
 */
function isPastDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

/**
 * Check if date is in the future.
 *
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is in the future
 */
function isFutureDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  return date.getTime() > Date.now();
}

// ============================================================================
// COMMAND VALIDATION
// ============================================================================

/**
 * Validate command has minimum required arguments.
 *
 * @param {Array<string>} args - Command arguments
 * @param {number} minArgs - Minimum required arguments
 * @returns {boolean} True if args meet minimum
 *
 * @example
 * if (!hasMinimumArgs(args, 2)) {
 *   return message.reply('Usage: !command <arg1> <arg2>');
 * }
 */
function hasMinimumArgs(args, minArgs) {
  return Array.isArray(args) && args.length >= minArgs;
}

/**
 * Validate command execution context.
 *
 * @param {Object} message - Discord message object
 * @param {Object} options - Validation options
 * @param {boolean} options.requireGuild - Require guild context
 * @param {boolean} options.requireAdmin - Require admin permissions
 * @param {string} options.requiredChannel - Required channel ID
 * @returns {Object} Result with { valid: boolean, error: string }
 *
 * @example
 * const validation = validateCommandContext(message, {
 *   requireGuild: true,
 *   requireAdmin: true,
 *   requiredChannel: config.bidding_channel_id
 * });
 * if (!validation.valid) {
 *   return message.reply(validation.error);
 * }
 */
function validateCommandContext(message, options = {}) {
  const { requireGuild = false, requireAdmin = false, requiredChannel = null } = options;

  // Check guild requirement
  if (requireGuild && !message.guild) {
    return { valid: false, error: '❌ This command can only be used in a server.' };
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin(message.member)) {
    return { valid: false, error: '❌ This command is restricted to administrators.' };
  }

  // Check channel requirement
  if (requiredChannel && message.channel.id !== requiredChannel) {
    return { valid: false, error: '❌ This command can only be used in the designated channel.' };
  }

  return { valid: true, error: null };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Discord entity validation
  isAdmin,
  isValidChannel,
  isTextChannel,
  isThread,
  isValidUser,

  // Numeric validation
  isPositiveInteger,
  isNonNegativeInteger,
  isInRange,
  validateBidAmount,

  // String validation
  isEmpty,
  isValidLength,
  sanitizeInput,

  // Date/time validation
  isValidTimestamp,
  isPastDate,
  isFutureDate,

  // Command validation
  hasMinimumArgs,
  validateCommandContext,
};
