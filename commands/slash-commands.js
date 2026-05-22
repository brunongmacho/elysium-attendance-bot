/**
 * =============================================================================
 * SLASH COMMAND DEFINITIONS
 * =============================================================================
 *
 * Defines all slash commands for registration with Discord API.
 * Organized by system: Attendance, Boss Timer, Boss Rotation, Auction, Stats, Emergency.
 *
 * Command descriptions are dynamically generated with actual channel names on bot startup.
 *
 * @module commands/slash-commands
 * @author TENCHU Development Team
 */

const { ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');

/**
 * Generate attendance commands with dynamic channel names
 *
 * @param {string} attendanceChannelName - Name of attendance channel (e.g., "attendance")
 * @returns {Array} Attendance command definitions
 */
function generateAttendanceCommands(attendanceChannelName = 'attendance channel') {
  const threadContext = `(use inside #${attendanceChannelName} threads)`;
  const channelContext = `(use in #${attendanceChannelName})`;

  return [
    {
      name: 'close',
      description: `Close an attendance thread ${threadContext}`,
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
      options: [
        {
          name: 'thread',
          type: ApplicationCommandOptionType.Channel,
          description: 'Thread to close (defaults to current thread)',
          required: false
        }
      ]
    },
    {
      name: 'closeall',
      description: `Close all open attendance threads ${channelContext}`,
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false
    },
  ];
}

/**
 * Generate attendance override commands
 *
 * @param {string} attendanceChannelName - Name of attendance channel (e.g., "attendance")
 * @returns {Array} Attendance override command definitions
 */
function generateAttendanceOverrideCommands(attendanceChannelName = 'attendance channel') {
  const threadContext = `(use inside #${attendanceChannelName} threads)`;

  return [
    {
      name: 'openthread',
      description: `Reopen a closed attendance thread for manual corrections ${threadContext}`,
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false
    },
    {
      name: 'overrideclose',
      description: `Close thread and overwrite existing attendance data ${threadContext}`,
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false
    }
  ];
}

/**
 * Generate boss timer commands with dynamic channel names
 *
 * @param {string} bossTimerChannelName - Name of boss timer channel (e.g., "boss-timer")
 * @returns {Array} Boss timer command definitions
 */
function generateBossTimerCommands(bossTimerChannelName = 'boss timer channel') {
  const channelContext = `(use in #${bossTimerChannelName})`;

  return [
    {
      name: 'killed',
      description: `Mark a boss as killed ${channelContext}`,
      dm_permission: false,
      options: [
        {
          name: 'boss',
          type: ApplicationCommandOptionType.String,
          description: 'Boss name',
          required: true,
          autocomplete: true
        },
        {
          name: 'timestamp',
          type: ApplicationCommandOptionType.String,
          description: 'Time killed (HH:MM format or "now")',
          required: false
        }
      ]
    },
    {
      name: 'spawned',
      description: `Mark a boss as spawned ${channelContext}`,
      dm_permission: false,
      options: [
        {
          name: 'boss',
          type: ApplicationCommandOptionType.String,
          description: 'Boss name',
          required: true,
          autocomplete: true
        }
      ]
    },
    {
      name: 'nextspawn',
      description: `Check the next boss spawn time ${channelContext}`,
      dm_permission: false
    },
    {
      name: 'setboss',
      description: `Set a boss status manually ${channelContext}`,
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
      options: [
        {
          name: 'boss',
          type: ApplicationCommandOptionType.String,
          description: 'Boss name',
          required: true,
          autocomplete: true
        },
        {
          name: 'status',
          type: ApplicationCommandOptionType.String,
          description: 'Status',
          required: true,
          choices: [
            { name: 'Alive', value: 'alive' },
            { name: 'Killed', value: 'killed' },
            { name: 'Spawned', value: 'spawned' }
          ]
        }
      ]
    },
    {
      name: 'maintenance',
      description: 'Spawn all bosses after server maintenance (admin command)',
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false
    },
    {
      name: 'clearkills',
      description: 'Clear all boss kill records (admin command)',
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false
    },
    {
      name: 'status',
      description: 'View bot health, active spawns, and system stats',
      default_member_permissions: '8',
      dm_permission: false
    },
    {
      name: 'remove-member',
      description: 'Remove a member from all sheets (BiddingPoints + attendance)',
      default_member_permissions: '8',
      dm_permission: false,
      options: [
        {
          name: 'member',
          type: 3,
          description: 'Member name to remove',
          required: true
        }
      ]
    }
  ];
}

/**
 * Generate boss rotation commands
 *
 * @returns {Array} Boss rotation command definitions
 */
function generateRotationCommands() {
  return [
    {
      name: 'rotation',
      description: 'Manage boss rotation system (admin command)',
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
      options: [
        {
          name: 'status',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'View current rotation for all bosses'
        },
        {
          name: 'set',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'Set rotation index for a boss',
          options: [
            {
              name: 'boss',
              type: ApplicationCommandOptionType.String,
              description: 'Boss name (Amentis, General Aquleus, Baron Braudmore)',
              required: true,
              autocomplete: true
            },
            {
              name: 'position',
              type: ApplicationCommandOptionType.Integer,
              description: 'Guild position (1-5)',
              required: true,
              min_value: 1,
              max_value: 5
            }
          ]
        },
        {
          name: 'increment',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'Advance rotation to next guild',
          options: [
            {
              name: 'boss',
              type: ApplicationCommandOptionType.String,
              description: 'Boss name to increment',
              required: true,
              autocomplete: true
            }
          ]
        },
        {
          name: 'refresh',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'Reload rotation data from Google Sheets'
        }
      ]
    }
  ];
}

/**
 * Generate auction system commands with dynamic channel names
 *
 * @param {string} biddingChannelName - Name of bidding channel (e.g., "bidding")
 * @returns {Array} Auction command definitions
 */
function generateAuctionCommands(biddingChannelName = 'bidding') {
  const channelContext = `(use in #${biddingChannelName})`;
  const threadContext = `(use in #${biddingChannelName} threads)`;

  return [
    // /bid command - Member command
    {
      name: 'bid',
      description: `Place a bid on the current auction item ${threadContext}`,
      dm_permission: false,
      options: [
        {
          name: 'amount',
          type: ApplicationCommandOptionType.Integer,
          description: 'Bid amount in points',
          required: true,
          min_value: 1
        }
      ]
    },

    // /auction subcommands - Admin commands
    {
      name: 'auction',
      description: `Manage auction sessions ${channelContext}`,
      default_member_permissions: PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
      options: [
        {
          name: 'start',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'Start an auction session manually'
        },
        {
          name: 'forceend',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'Emergency auction termination (force submit results)'
        },
        {
          name: 'start-now',
          type: 1,
          description: 'Start auction immediately bypassing cooldown'
        },
        {
          name: 'end',
          type: 1,
          description: 'End current auction session'
        }
      ]
    },

    // /bidding fix-points admin command
    {
      name: 'bidding',
      description: 'Manage bidding system',
      default_member_permissions: '8',
      dm_permission: false,
      options: [
        {
          name: 'fix-points',
          type: 1,
          description: 'Audit and clear stuck locked points'
        }
      ]
    },

    // /queue subcommand - View queue only (items managed in Google Sheets)
    {
      name: 'queue',
      description: `View auction queue ${channelContext}`,
      dm_permission: false,
      options: [
        {
          name: 'list',
          type: ApplicationCommandOptionType.Subcommand,
          description: 'Show current auction queue'
        }
      ]
    }
  ];
}

/**
 * Generate stats and reports commands
 *
 * @returns {Array} Stats command definitions
 */
function generateStatsCommands() {
  return [
    // /stats command - Member statistics lookup
    {
      name: 'stats',
      description: 'View member statistics (attendance, points, activity)',
      dm_permission: false,
      options: [
        {
          name: 'member',
          type: ApplicationCommandOptionType.String,
          description: 'Member to lookup (leave empty for yourself)',
          required: false,
          autocomplete: true
        }
      ]
    },

    // /weekly command - Weekly report
    {
      name: 'weekly',
      description: 'Generate weekly activity report',
      dm_permission: false
    },

    // /monthly command - Monthly report
    {
      name: 'monthly',
      description: 'Generate monthly activity report',
      dm_permission: false
    },

  ];
}

/**
 * Generate member-facing commands (help, info, leaderboards, activity)
 *
 * @returns {Array} Member command definitions
 */
function generateMemberCommands() {
  return [
    {
      name: 'help',
      description: 'Show context-aware help message',
      dm_permission: false
    },
    {
      name: 'newmember',
      description: 'Show new member guide with instructions',
      dm_permission: false
    },
    {
      name: 'leaderboards',
      description: 'Show guild leaderboards (attendance, bidding, or combined)',
      dm_permission: false,
      options: [
        {
          name: 'type',
          type: 3,
          description: 'Leaderboard type to display',
          required: true,
          choices: [
            { name: 'Attendance', value: 'attendance' },
            { name: 'Bidding', value: 'bidding' },
            { name: 'Combined', value: 'combined' }
          ]
        }
      ]
    },
    {
      name: 'activity',
      description: 'Show guild activity heatmap visualization',
      dm_permission: false,
      options: [
        {
          name: 'week',
          type: 3,
          description: 'Week number (optional, defaults to current week)',
          required: false
        }
      ]
    }
  ];
}

/**
 * Generate emergency recovery commands (admin only)
 *
 * @returns {Array} Emergency command definitions
 */
function generateEmergencyCommand() {
  return [
    {
      name: 'emergency',
      description: 'Emergency recovery toolkit (admin only)',
      default_member_permissions: '8',
      dm_permission: false,
      options: [
        {
          name: 'close',
          type: 1,
          description: 'Force close a specific attendance thread',
          options: [
            {
              name: 'thread',
              type: 7,
              description: 'Thread to force close (defaults to current channel)',
              required: false
            }
          ]
        },
        {
          name: 'close-all',
          type: 1,
          description: 'Force close ALL active attendance threads'
        },
        {
          name: 'end-auction',
          type: 1,
          description: 'Force end a stuck auction session'
        },
        {
          name: 'unlock-points',
          type: 1,
          description: 'Unlock all locked bidding points'
        },
        {
          name: 'clear-bids',
          type: 1,
          description: 'Clear all pending bid confirmations'
        },
        {
          name: 'diagnostics',
          type: 1,
          description: 'Show comprehensive state diagnostics'
        },
        {
          name: 'force-sync',
          type: 1,
          description: 'Force state sync to Google Sheets'
        }
      ]
    }
  ];
}

/**
 * Generate webhook URL update command (admin only)
 *
 * @returns {Array} Weburl command definition
 */
function generateWeburlCommand() {
  return [
    {
      name: 'weburl',
      description: 'Update Google Sheets webhook URL and restart bot (admin only)',
      default_member_permissions: '8',
      dm_permission: false,
      options: [
        {
          name: 'url',
          type: 3,
          description: 'New Google Apps Script webhook URL (must start with https://)',
          required: true
        }
      ]
    }
  ];
}

/**
 * Generate all commands with dynamic channel names
 *
 * @param {Object} channelNames - Object containing channel names
 * @param {string} channelNames.attendance - Attendance channel name
 * @param {string} channelNames.bossTimer - Boss timer channel name
 * @param {string} channelNames.bidding - Bidding channel name
 * @returns {Object} Object containing command arrays
 */
function generateAllCommands(channelNames = {}) {
  const { attendance = 'attendance', bossTimer = 'boss-timer', bidding = 'bidding' } = channelNames;

  const attendanceCommands = generateAttendanceCommands(attendance);
  const attendanceOverrideCommands = generateAttendanceOverrideCommands(attendance);
  const bossTimerCommands = generateBossTimerCommands(bossTimer);
  const rotationCommands = generateRotationCommands();
  const auctionCommands = generateAuctionCommands(bidding);
  const statsCommands = generateStatsCommands();
  const memberCommands = generateMemberCommands();
  const emergencyCommand = generateEmergencyCommand();
  const weburlCommand = generateWeburlCommand();

  return {
    attendanceCommands,
    attendanceOverrideCommands,
    bossTimerCommands,
    rotationCommands,
    auctionCommands,
    statsCommands,
    memberCommands,
    emergencyCommand,
    weburlCommand,
    allCommands: [
      ...attendanceCommands,
      ...attendanceOverrideCommands,
      ...bossTimerCommands,
      ...rotationCommands,
      ...auctionCommands,
      ...statsCommands,
      ...memberCommands,
      ...emergencyCommand,
      ...weburlCommand
    ]
  };
}

module.exports = {
   generateAllCommands,
   generateAttendanceCommands,
   generateAttendanceOverrideCommands,
   generateBossTimerCommands,
   generateRotationCommands,
   generateAuctionCommands,
   generateStatsCommands,
   generateMemberCommands,
   generateEmergencyCommand,
   generateWeburlCommand,
};


