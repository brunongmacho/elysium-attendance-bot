/**
 * ============================================================================
 * ACTIVITY HEATMAP SYSTEM
 * ============================================================================
 *
 * PURPOSE:
 * Provides 24-hour activity visualization to help schedule events at optimal
 * times when guild members are most active.
 *
 * FEATURES:
 * - 24-hour activity visualization using ASCII heatmap
 * - Message frequency tracking across all channels
 * - Peak activity time identification
 * - Optimal event scheduling recommendations
 * - Activity trend analysis
 * - Timezone-aware display (GMT+8)
 *
 * COMMANDS:
 * - !activity: Display 24-hour activity heatmap
 * - !heatmap: Alias for !activity
 * - !activity week: Display weekly activity patterns
 *
 * DATA COLLECTION:
 * - Tracks messages per hour over rolling 24-hour period
 * - Stores activity data in memory (resets on bot restart)
 * - Updates in real-time as messages are sent
 *
 * VISUALIZATION:
 * Uses ASCII characters to represent activity intensity:
 * ░ = Low activity (0-25%)
 * ▒ = Medium activity (25-50%)
 * ▓ = High activity (50-75%)
 * █ = Very high activity (75-100%)
 *
 * OPTIMAL SCHEDULING:
 * Recommends best times for:
 * - Boss spawns
 * - Guild events
 * - Auctions
 * - Announcements
 *
 * @module activity-heatmap
 * @author Elysium Attendance Bot Team
 * @version 1.0
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { EmbedBuilder } = require('discord.js');

// ============================================================================
// MODULE STATE
// ============================================================================

/**
 * Module configuration and Discord client
 */
let client = null;  // Discord.js client instance
let config = null;  // Bot configuration from config.json

/**
 * Activity tracking data structure.
 * Maps hour (0-23) to message count in that hour.
 * @type {Map<number, number>}
 */
const hourlyActivity = new Map();

/**
 * Day of week activity tracking (0=Sunday, 6=Saturday).
 * Maps day to total message count.
 * @type {Map<number, number>}
 */
const dailyActivity = new Map();

/**
 * Last reset timestamp for rolling 24-hour window.
 * @type {number}
 */
let lastResetTime = Date.now();

// Initialize maps
for (let hour = 0; hour < 24; hour++) {
  hourlyActivity.set(hour, 0);
}
for (let day = 0; day < 7; day++) {
  dailyActivity.set(day, 0);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the activity heatmap system with Discord client and config.
 *
 * Must be called before any activity commands.
 *
 * @param {Client} discordClient - Discord.js client instance
 * @param {Object} botConfig - Bot configuration object from config.json
 *
 * @example
 * init(client, config);
 */
function init(discordClient, botConfig) {
  client = discordClient;
  config = botConfig;

  console.log('📊 Activity Heatmap System initialized');
}

// ============================================================================
// ACTIVITY TRACKING
// ============================================================================

/**
 * Track a message for activity statistics.
 *
 * Called by the main message handler to record message activity.
 * Updates hourly and daily activity counters.
 *
 * @param {Message} message - Discord message object
 */
function trackMessage(message) {
  // Skip bot messages
  if (message.author.bot) return;

  // Get current time in GMT+8
  const now = new Date();
  const gmt8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const hour = gmt8Time.getUTCHours();
  const day = gmt8Time.getUTCDay();

  // Update hourly activity
  const currentCount = hourlyActivity.get(hour) || 0;
  hourlyActivity.set(hour, currentCount + 1);

  // Update daily activity
  const currentDayCount = dailyActivity.get(day) || 0;
  dailyActivity.set(day, currentDayCount + 1);

  // Reset if 24 hours have passed (rolling window)
  if (Date.now() - lastResetTime > 24 * 60 * 60 * 1000) {
    resetOldData();
  }
}

/**
 * Reset old activity data for rolling 24-hour window.
 * Called automatically by trackMessage.
 */
function resetOldData() {
  // Decay old data rather than hard reset
  // Reduce all counts by 50% to maintain some historical context
  for (const [hour, count] of hourlyActivity) {
    hourlyActivity.set(hour, Math.floor(count * 0.5));
  }

  lastResetTime = Date.now();
  console.log('📊 Activity data decayed (rolling 24-hour window)');
}

// ============================================================================
// HEATMAP VISUALIZATION
// ============================================================================

/**
 * Generate ASCII heatmap visualization of 24-hour activity.
 *
 * @returns {string} ASCII heatmap string
 */
function generateHeatmap() {
  // Find max activity for normalization
  let maxActivity = 0;
  for (const count of hourlyActivity.values()) {
    if (count > maxActivity) maxActivity = count;
  }

  // If no activity, show empty heatmap
  if (maxActivity === 0) {
    return '░░░░░░░░░░░░░░░░░░░░░░░░ (No recent activity)';
  }

  // Generate heatmap string
  let heatmap = '';
  for (let hour = 0; hour < 24; hour++) {
    const count = hourlyActivity.get(hour) || 0;
    const intensity = count / maxActivity;

    // Choose character based on intensity
    let char;
    if (intensity <= 0.25) {
      char = '░';  // Low activity
    } else if (intensity <= 0.50) {
      char = '▒';  // Medium activity
    } else if (intensity <= 0.75) {
      char = '▓';  // High activity
    } else {
      char = '█';  // Very high activity
    }

    heatmap += char;
  }

  return heatmap;
}

/**
 * Generate hour labels for heatmap.
 *
 * @returns {string} Hour labels string
 */
function generateHourLabels() {
  let labels = '';
  for (let hour = 0; hour < 24; hour++) {
    if (hour % 3 === 0) {
      labels += `${hour.toString().padStart(2, '0')}  `;
    }
  }
  return labels;
}

/**
 * Find peak activity hours.
 *
 * @param {number} count - Number of peak hours to find
 * @returns {Array<{hour: number, count: number}>} Peak hours sorted by activity
 */
function findPeakHours(count = 3) {
  const hours = Array.from(hourlyActivity.entries())
    .map(([hour, activity]) => ({ hour, count: activity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, count);

  return hours;
}

/**
 * Format hour in 12-hour format with AM/PM.
 *
 * @param {number} hour - Hour in 24-hour format (0-23)
 * @returns {string} Formatted hour string
 */
function formatHour(hour) {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * Generate day of week labels.
 *
 * @returns {string} Day labels
 */
function generateDayLabels() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.join('  ');
}

/**
 * Generate weekly activity heatmap.
 *
 * @returns {string} Weekly heatmap string
 */
function generateWeeklyHeatmap() {
  // Find max activity for normalization
  let maxActivity = 0;
  for (const count of dailyActivity.values()) {
    if (count > maxActivity) maxActivity = count;
  }

  // If no activity, show empty heatmap
  if (maxActivity === 0) {
    return '░░░░░░░ (No recent activity)';
  }

  // Generate heatmap string
  let heatmap = '';
  for (let day = 0; day < 7; day++) {
    const count = dailyActivity.get(day) || 0;
    const intensity = count / maxActivity;

    // Choose character based on intensity
    let char;
    if (intensity <= 0.25) {
      char = '░░';
    } else if (intensity <= 0.50) {
      char = '▒▒';
    } else if (intensity <= 0.75) {
      char = '▓▓';
    } else {
      char = '██';
    }

    heatmap += char + ' ';
  }

  return heatmap;
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * Display 24-hour activity heatmap.
 *
 * Shows visualization of guild activity over the past 24 hours with
 * peak time identification and scheduling recommendations.
 *
 * @param {Message} message - Discord message object
 * @param {string} [mode='day'] - Display mode: 'day' or 'week'
 */
async function displayActivityHeatmap(message, mode = 'day') {
  try {
    if (mode === 'week') {
      await displayWeeklyActivity(message);
      return;
    }

    // Generate heatmap visualization
    const heatmap = generateHeatmap();
    const hourLabels = generateHourLabels();

    // Find peak activity hours
    const peakHours = findPeakHours(3);
    const peakTimesStr = peakHours
      .map((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        return `${medal} ${formatHour(p.hour)} - ${p.count} messages`;
      })
      .join('\n');

    // Calculate total activity
    const totalMessages = Array.from(hourlyActivity.values()).reduce((sum, count) => sum + count, 0);
    const avgPerHour = (totalMessages / 24).toFixed(1);

    // Find optimal scheduling window (consecutive high activity hours)
    const optimalWindow = findOptimalWindow();

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('📊 Guild Activity Heatmap (24 Hours)')
      .setDescription(
        '```' +
        hourLabels + '\n' +
        heatmap + '\n' +
        '```\n' +
        '**Legend:** ' +
        '`░` Low · ' +
        '`▒` Medium · ' +
        '`▓` High · ' +
        '`█` Very High'
      )
      .addFields(
        {
          name: '🔥 Peak Activity Times',
          value: peakHours.length > 0 && peakHours[0].count > 0
            ? peakTimesStr
            : 'No significant activity recorded',
          inline: false
        },
        {
          name: '⏰ Optimal Event Scheduling',
          value: optimalWindow
            ? `Best time window: **${formatHour(optimalWindow.start)}** to **${formatHour(optimalWindow.end)}**\n` +
              `Expected turnout: **${optimalWindow.activity}** messages/hour`
            : 'Need more data to recommend optimal times',
          inline: false
        },
        {
          name: '📈 Statistics',
          value: `Total Messages: **${totalMessages}**\n` +
                 `Average/Hour: **${avgPerHour}**\n` +
                 `Timezone: **GMT+8**`,
          inline: false
        }
      )
      .setColor(0x00AE86)
      .setFooter({ text: 'Use !activity week for weekly patterns' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error displaying activity heatmap:', error);
    await message.reply('❌ Error generating activity heatmap. Please try again.');
  }
}

/**
 * Display weekly activity patterns.
 *
 * @param {Message} message - Discord message object
 */
async function displayWeeklyActivity(message) {
  try {
    // Generate weekly heatmap
    const heatmap = generateWeeklyHeatmap();
    const dayLabels = generateDayLabels();

    // Find most active day
    let maxDay = 0;
    let maxCount = 0;
    for (const [day, count] of dailyActivity) {
      if (count > maxCount) {
        maxDay = day;
        maxCount = count;
      }
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const totalMessages = Array.from(dailyActivity.values()).reduce((sum, count) => sum + count, 0);

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('📅 Weekly Activity Patterns')
      .setDescription(
        '```' +
        dayLabels + '\n' +
        heatmap + '\n' +
        '```\n' +
        '**Legend:** ' +
        '`░` Low · ' +
        '`▒` Medium · ' +
        '`▓` High · ' +
        '`█` Very High'
      )
      .addFields(
        {
          name: '🔥 Most Active Day',
          value: maxCount > 0
            ? `**${dayNames[maxDay]}** with ${maxCount} messages`
            : 'No significant activity recorded',
          inline: false
        },
        {
          name: '📊 Weekly Total',
          value: `**${totalMessages}** messages this week`,
          inline: false
        }
      )
      .setColor(0x00AE86)
      .setFooter({ text: 'Use !activity for 24-hour heatmap' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error displaying weekly activity:', error);
    await message.reply('❌ Error generating weekly activity. Please try again.');
  }
}

/**
 * Find optimal 3-hour window for event scheduling.
 *
 * @returns {Object|null} Optimal window with start, end, and activity
 */
function findOptimalWindow() {
  let maxActivity = 0;
  let bestStart = 0;

  // Find best consecutive 3-hour window
  for (let start = 0; start < 24; start++) {
    let windowActivity = 0;
    for (let i = 0; i < 3; i++) {
      const hour = (start + i) % 24;
      windowActivity += hourlyActivity.get(hour) || 0;
    }

    if (windowActivity > maxActivity) {
      maxActivity = windowActivity;
      bestStart = start;
    }
  }

  if (maxActivity === 0) return null;

  return {
    start: bestStart,
    end: (bestStart + 3) % 24,
    activity: Math.round(maxActivity / 3)
  };
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  init,
  trackMessage,
  displayActivityHeatmap,

  // For testing
  _internal: {
    hourlyActivity,
    dailyActivity,
    resetOldData,
  },
};
