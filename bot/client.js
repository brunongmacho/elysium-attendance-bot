const {
  Client,
  GatewayIntentBits,
  Partials,
  Options,
} = require("discord.js");

/**
 * Discord client instance with optimized memory management.
 * Configuration priorities:
 * - Memory efficiency: Aggressive cache sweeping for 256MB environments
 * - Required intents: Guild management, messages, reactions, members
 * - Partial support: Enables handling of uncached entities
 */
const client = new Client({
  // Gateway intents
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],

  // Partials - handle uncached entities
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],

  // WebSocket options
  ws: {
    handshakeTimeout: 60000,
  },

  // REST options
  rest: {
    timeout: 60000,
    retries: 5,
  },

  // Cache size limits
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 200,
    GuildMemberManager: 100,
    UserManager: 100,
    ReactionManager: 50,
    ReactionUserManager: 50,
  }),

  // Memory optimization: Sweep caches regularly
  sweepers: {
    messages: {
      interval: 180,
      lifetime: 300,
    },
    users: {
      interval: 300,
      filter: () => (user) => user.bot && user.id !== client.user?.id,
    },
    guildMembers: {
      interval: 300,
      filter: () => {
        const now = Date.now();
        return (member) => {
          if (member.id === client.user?.id) return false;
          return now - (member._cacheTime || 0) > 600000;
        };
      },
    },
    threads: {
      interval: 600,
      lifetime: 1800,
    },
  },
});

module.exports = client;
