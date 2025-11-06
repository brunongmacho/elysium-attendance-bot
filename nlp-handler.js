/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ELYSIUM NLP COMMAND HANDLER                            ║
 * ║                  Natural Language Processing System                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Natural Language Processing for flexible command interpretation
 * Allows users to use natural language instead of strict command syntax.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. FLEXIBLE COMMAND SYNTAX
 *    - "bid 500" → !bid 500
 *    - "how many points do i have" → !mypoints
 *    - "show me the leaderboard" → !leaderboard
 *
 * 2. SMART INTENT DETECTION
 *    - Understands context and variations
 *    - Works without exact command syntax
 *    - Supports multiple phrasings
 *
 * 3. SAFE INTEGRATION
 *    - Does NOT interfere with existing ! commands
 *    - Only works in specific channels (admin logs, auction threads)
 *    - Does NOT respond to casual conversation in guild chat
 *
 * 4. CONTEXTUAL AWARENESS
 *    - Understands auction context (in auction threads)
 *    - Understands admin context (in admin logs)
 *    - Provides appropriate responses based on location
 */

const { normalizeUsername } = require('./utils/common');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const NLP_CONFIG = {
  // Channels where NLP is enabled
  enabledChannels: {
    adminLogs: true,          // Admin logs channel
    auctionThreads: true,     // Threads in bidding channel
    guildChat: false,         // NOT in guild chat (casual conversation)
  },

  // Minimum confidence threshold (0-1)
  confidenceThreshold: 0.6,   // 60% similarity required

  // Feature flags
  features: {
    flexibleBidding: true,    // "bid 500" instead of "!bid 500"
    naturalQueries: true,     // "how many points" instead of "!mypoints"
    contextAware: true,       // Different responses based on context
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// NLP PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const NLP_PATTERNS = {
  // Bidding commands (auction threads)
  bid: [
    /^(?:i\s+)?(?:want\s+to\s+)?bid\s+(\d+)/i,
    /^(?:offer|bidding)\s+(\d+)/i,
    /^(\d+)\s+(?:points?|pts?)/i,
    /^place\s+(?:a\s+)?bid\s+(?:of\s+)?(\d+)/i,
  ],

  // Points queries
  mypoints: [
    /^(?:how\s+many|what(?:'s|\s+is)\s+my|check\s+my|show\s+my)\s+points?/i,
    /^(?:my\s+)?(?:points?|balance)/i,
    /^(?:what|how)\s+(?:are|is)\s+my\s+(?:points?|balance)/i,
  ],

  // Attendance commands
  present: [
    /^(?:mark\s+)?(?:me\s+)?(?:as\s+)?present/i,
    /^(?:i(?:'m|\s+am)\s+)?(?:here|attending)/i,
    /^(?:check\s+in|checkin)/i,
  ],

  // Loot commands
  loot: [
    /^(?:show|check|view|display)\s+(?:the\s+)?loot/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?loot/i,
    /^loot\s+(?:list|info|details)/i,
  ],

  // Status queries
  bidstatus: [
    /^(?:what(?:'s|\s+is)\s+the\s+)?(?:auction\s+)?status/i,
    /^(?:show|check|view)\s+(?:auction\s+)?status/i,
    /^(?:current\s+)?(?:auction|bidding)\s+(?:status|info)/i,
  ],

  // Attendance leaderboard (specific - must come first)
  leaderboardattendance: [
    /^(?:show|display|check|view)\s+attendance\s+leaderboard/i,
    /^attendance\s+(?:rankings?|leaderboard|top)/i,
    /^who\s+has\s+the\s+most\s+attendance/i,
  ],

  // Bidding leaderboard (specific - must come first)
  leaderboardbidding: [
    /^(?:show|display|check|view)\s+bidding\s+leaderboard/i,
    /^bidding\s+(?:rankings?|leaderboard|top)/i,
    /^who\s+(?:spent|bid)\s+the\s+most/i,
  ],

  // General leaderboard (must come after specific leaderboards)
  leaderboard: [
    /^(?:show|display|check|view)\s+(?:the\s+)?leaderboard$/i,
    /^(?:top|rankings?|leaderboard)$/i,
    /^who(?:'s|\s+is)\s+(?:on\s+)?top$/i,
  ],

  // Queue list
  queuelist: [
    /^(?:show|display|check|view)\s+(?:the\s+)?queue/i,
    /^(?:auction\s+)?queue\s+(?:list)?/i,
    /^(?:what(?:'s|\s+is)\s+in\s+the\s+)?queue/i,
  ],

  // Admin auction commands
  startauction: [
    /^start\s+(?:the\s+)?auction/i,
    /^begin\s+(?:the\s+)?auction/i,
    /^launch\s+(?:the\s+)?auction/i,
  ],

  pause: [
    /^pause\s+(?:the\s+)?auction/i,
    /^hold\s+(?:the\s+)?auction/i,
  ],

  resume: [
    /^resume\s+(?:the\s+)?auction/i,
    /^continue\s+(?:the\s+)?auction/i,
    /^unpause\s+(?:the\s+)?auction/i,
  ],

  stop: [
    /^stop\s+(?:the\s+)?auction/i,
    /^end\s+(?:the\s+)?auction/i,
    /^cancel\s+(?:the\s+)?auction/i,
  ],

  extend: [
    /^extend\s+(?:the\s+)?(?:auction\s+)?(?:timer\s+)?(?:by\s+)?(\d+)/i,
    /^add\s+(\d+)\s+(?:seconds?|mins?|minutes?)\s+to\s+(?:the\s+)?auction/i,
  ],

  skipitem: [
    /^skip\s+(?:this\s+)?(?:current\s+)?item/i,
    /^next\s+item/i,
    /^move\s+to\s+next\s+item/i,
  ],

  cancelitem: [
    /^cancel\s+(?:this\s+)?(?:current\s+)?item/i,
    /^remove\s+(?:this\s+)?(?:current\s+)?item/i,
  ],

  // Intelligence commands - Price prediction
  predictprice: [
    /^(?:predict|estimate|suggest)\s+price\s+(?:for\s+)?(.+)/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?price\s+(?:for|of)\s+(.+)/i,
    /^how\s+much\s+(?:is|should)\s+(.+)\s+(?:cost|be)/i,
  ],

  // Intelligence commands - Engagement (specific user - must come first)
  engagement: [
    /^(?:check|analyze|show)\s+engagement\s+(?:for\s+)?(.+)/i,
    /^engagement\s+(?:analysis\s+)?(?:for\s+)?(.+)/i,
    /^how\s+engaged\s+is\s+(.+)/i,
  ],

  // Guild-wide engagement (must come after specific user engagement)
  analyzeengagement: [
    /^analyze\s+(?:guild\s+)?engagement$/i,
    /^(?:show|check)\s+(?:guild\s+)?engagement$/i,
    /^engagement\s+(?:analysis|report|summary)$/i,
  ],

  // Intelligence commands - Anomalies
  detectanomalies: [
    /^(?:detect|check|find)\s+anomalies/i,
    /^(?:check\s+for\s+)?fraud/i,
    /^(?:show\s+)?suspicious\s+(?:activity|behavior)/i,
  ],

  // Intelligence commands - Recommendations
  recommendations: [
    /^(?:show|give|get)\s+recommendations/i,
    /^(?:what\s+(?:do\s+)?(?:you\s+)?)?(?:suggest|recommend)/i,
    /^recommendations\s+(?:for\s+)?(?:guild)?/i,
  ],

  // Intelligence commands - Performance
  performance: [
    /^(?:show|check)\s+performance/i,
    /^(?:bot\s+)?performance\s+(?:stats|metrics)/i,
    /^how(?:'s|\s+is)\s+(?:the\s+)?(?:bot\s+)?performance/i,
  ],

  // Intelligence commands - Analyze queue
  analyzequeue: [
    /^analyze\s+(?:the\s+)?(?:auction\s+)?queue/i,
    /^(?:suggest|predict)\s+(?:auction\s+)?prices/i,
    /^(?:check|review)\s+(?:all\s+)?(?:auction\s+)?items/i,
  ],

  // Status (admin)
  status: [
    /^(?:bot\s+)?status/i,
    /^(?:show|check)\s+(?:bot\s+)?status/i,
  ],

  // Help queries
  help: [
    /^(?:help|commands?|what\s+can\s+you\s+do)/i,
    /^(?:how\s+do\s+i|show\s+me)/i,
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// NLP HANDLER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class NLPHandler {
  constructor(config) {
    this.config = config;
  }

  /**
   * Check if NLP should process this message
   * @param {Message} message - Discord message
   * @returns {boolean} True if NLP should process
   */
  shouldProcess(message) {
    // Don't process bot messages
    if (message.author.bot) return false;

    // Don't process messages that start with ! (already a command)
    if (message.content.trim().startsWith('!')) return false;

    // Check if in enabled channel
    const isAdminLogs = message.channel.id === this.config.admin_logs_channel_id ||
                        (message.channel.isThread() && message.channel.parentId === this.config.admin_logs_channel_id);

    const isAuctionThread = message.channel.isThread() &&
                           message.channel.parentId === this.config.bidding_channel_id;

    const isGuildChat = message.channel.id === this.config.elysium_commands_channel_id;

    // Enable in admin logs and auction threads, NOT in guild chat
    if (NLP_CONFIG.enabledChannels.adminLogs && isAdminLogs) return true;
    if (NLP_CONFIG.enabledChannels.auctionThreads && isAuctionThread) return true;
    if (NLP_CONFIG.enabledChannels.guildChat && isGuildChat) return true; // Currently disabled

    return false;
  }

  /**
   * Interpret message and extract intent + parameters
   * @param {Message} message - Discord message
   * @returns {Object|null} Interpreted command or null
   */
  interpretMessage(message) {
    if (!this.shouldProcess(message)) return null;

    const content = message.content.trim();

    // Try each command pattern
    for (const [command, patterns] of Object.entries(NLP_PATTERNS)) {
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const params = match.slice(1); // Extract captured groups
          return {
            command: `!${command}`,
            params,
            originalMessage: content,
            confidence: 1.0,
            source: 'nlp',
          };
        }
      }
    }

    // No pattern matched
    return null;
  }

  /**
   * Calculate string similarity (Levenshtein distance based)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get context-aware response message
   * @param {string} command - Interpreted command
   * @param {Message} message - Original message
   * @returns {string} Context-aware explanation
   */
  getContextMessage(command, message) {
    const isAuctionThread = message.channel.isThread() &&
                           message.channel.parentId === this.config.bidding_channel_id;

    if (command === '!bid' && isAuctionThread) {
      return ''; // No explanation needed for bids in auction
    }

    // For other commands, provide brief feedback
    const commandName = command.replace('!', '');
    return `💡 *Interpreting as \`${command}\`*`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { NLPHandler, NLP_CONFIG, NLP_PATTERNS };
