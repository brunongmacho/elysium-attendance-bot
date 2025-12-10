/**
 * =============================================================================
 * SLASH COMMAND DEFINITIONS
 * =============================================================================
 *
 * Defines all slash commands for registration with Discord API.
 * Organized by system: Attendance, Boss Timer, Boss Rotation, Auction, Stats, Emergency.
 *
 * @module commands/slash-commands
 * @author ELYSIUM Development Team
 */

const { ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');

/**
 * Phase 1A: Attendance System Commands
 */
const attendanceCommands = [
  {
    name: 'verify',
    description: 'Verify a member\'s attendance submission (use inside attendance thread)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false,
    options: [
      {
        name: 'member',
        type: ApplicationCommandOptionType.String,
        description: 'Member to verify',
        required: true,
        autocomplete: true
      }
    ]
  },
  {
    name: 'deny',
    description: 'Deny a member\'s attendance submission (use inside attendance thread)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false,
    options: [
      {
        name: 'member',
        type: ApplicationCommandOptionType.String,
        description: 'Member to deny',
        required: true,
        autocomplete: true
      },
      {
        name: 'reason',
        type: ApplicationCommandOptionType.String,
        description: 'Reason for denial',
        required: false
      }
    ]
  },
  {
    name: 'verifyall',
    description: 'Verify all pending submissions in thread (use inside attendance thread)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  },
  {
    name: 'denyall',
    description: 'Deny all pending submissions in thread (use inside attendance thread)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  },
  {
    name: 'close',
    description: 'Close an attendance thread (use inside attendance thread)',
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
    description: 'Close all open attendance threads (use in attendance channel)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  },
  {
    name: 'resetpending',
    description: 'Clear the pending attendance queue (use in attendance channel)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  }
];

/**
 * Phase 1B: Boss Timer System Commands
 */
const bossTimerCommands = [
  {
    name: 'killed',
    description: 'Mark a boss as killed (use in boss timer channel)',
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
    description: 'Mark a boss as spawned (use in boss timer channel)',
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
    description: 'Check the next boss spawn time (use in boss timer channel)',
    dm_permission: false
  },
  {
    name: 'unkill',
    description: 'Undo a boss kill record (use in boss timer channel)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
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
    name: 'setboss',
    description: 'Set a boss status manually (use in boss timer channel)',
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
    name: 'nospawn',
    description: 'Mark a boss as not spawning (use in boss timer channel)',
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
    name: 'maintenance',
    description: 'Spawn all bosses after server maintenance (admin command)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  },
  {
    name: 'serverdown',
    description: 'Handle server downtime (admin command)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  },
  {
    name: 'clearkills',
    description: 'Clear all boss kill records (admin command)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    dm_permission: false
  }
];

/**
 * Phase 1C: Boss Rotation System Commands
 */
const rotationCommands = [
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

/**
 * Export all Phase 1 commands
 */
module.exports = {
  // Individual command arrays
  attendanceCommands,
  bossTimerCommands,
  rotationCommands,

  // Combined array for registration
  allCommands: [
    ...attendanceCommands,
    ...bossTimerCommands,
    ...rotationCommands
  ]
};
