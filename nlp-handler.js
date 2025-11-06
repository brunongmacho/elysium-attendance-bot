/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ELYSIUM NLP COMMAND HANDLER                            ║
 * ║          Natural Language Processing System (Multilingual)                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Natural Language Processing for flexible command interpretation
 * Allows users to use natural language instead of strict command syntax.
 * Supports English, Tagalog, and Taglish (code-switching).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. MULTILINGUAL SUPPORT (English, Tagalog, Taglish)
 *    - English: "bid 500" → !bid 500
 *    - Tagalog: "taya 500" → !bid 500
 *    - Taglish: "bid ko 500" → !bid 500
 *    - "ilang points ko?" → !mypoints
 *    - "pusta 1000" → !bid 1000
 *
 * 2. FLEXIBLE COMMAND SYNTAX
 *    - "how many points do i have" → !mypoints
 *    - "show me the leaderboard" → !leaderboard
 *    - "nandito ako" → present
 *
 * 3. SMART INTENT DETECTION
 *    - Understands context and variations
 *    - Works without exact command syntax
 *    - Supports multiple phrasings in all languages
 *
 * 4. SAFE INTEGRATION
 *    - Does NOT interfere with existing ! commands
 *    - Only works in specific channels (admin logs, auction threads)
 *    - Does NOT respond to casual conversation in guild chat
 *
 * 5. CONTEXTUAL AWARENESS
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
// NLP PATTERNS - MULTILINGUAL (English, Tagalog, Taglish)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Multilingual NLP support for Filipino community
 * - English: Standard English phrases
 * - Tagalog (TL): Pure Filipino language
 * - Taglish: Code-switching between English and Tagalog
 */

const NLP_PATTERNS = {
  // Bidding commands (auction threads)
  bid: [
    // English
    /^(?:i\s+)?(?:want\s+to\s+)?bid\s+(\d+)/i,
    /^(?:offer|bidding)\s+(\d+)/i,
    /^(\d+)\s+(?:points?|pts?)/i,
    /^place\s+(?:a\s+)?bid\s+(?:of\s+)?(\d+)/i,

    // Tagalog (TL)
    /^(?:taya|lagay)\s+(?:ko\s+)?(\d+)/i,    // "taya 500" / "taya ko 500"
    /^(?:pusta|pustahan)\s+(?:ng\s+)?(\d+)/i, // "pusta 500" / "pustahan ng 500"
    /^(?:magtaya|maglagay)\s+(?:ako\s+)?(?:ng\s+)?(\d+)/i, // "magtaya 500"
    /^(?:ibabayad|ibabayad ko)\s+(\d+)/i,    // "ibabayad 500"
    /^(\d+)\s+(?:taya|pusta)/i,              // "500 taya"

    // Taglish (code-switching)
    /^bid\s+(?:ko|na|ng)\s+(\d+)/i,          // "bid ko 500"
    /^(?:gusto|gusto kong)\s+(?:bid|mag-?bid)\s+(?:ng\s+)?(\d+)/i, // "gusto kong magbid ng 500"
    /^(?:ako|ako ay)\s+bid\s+(?:ng\s+)?(\d+)/i, // "ako bid 500"
    /^(\d+)\s+(?:lang|lang ako)/i,           // "500 lang"
  ],

  // Points queries
  mypoints: [
    // English
    /^(?:how\s+many|what(?:'s|\s+is)\s+my|check\s+my|show\s+my)\s+points?/i,
    /^(?:my\s+)?(?:points?|balance)/i,
    /^(?:what|how)\s+(?:are|is)\s+my\s+(?:points?|balance)/i,

    // Tagalog (TL)
    /^(?:ilang|ilan)\s+(?:ang\s+)?points?\s+(?:ko|namin)/i,  // "ilang points ko?"
    /^(?:magkano|magkano ang)\s+points?\s+ko/i,  // "magkano points ko?"
    /^(?:tignan|tingnan)\s+(?:ang\s+)?points?\s+ko/i, // "tingnan points ko"
    /^(?:check|chek)\s+points?\s+ko/i,       // "check points ko"
    /^points?\s+ko(?:\s+ba)?/i,              // "points ko" / "points ko ba"
    /^balance\s+ko/i,                        // "balance ko"
    /^(?:pera|pondo)\s+ko/i,                 // "pera ko"

    // Taglish (code-switching)
    /^(?:ano|ano ang)\s+points?\s+ko/i,      // "ano points ko?"
    /^(?:ilan|ilang)\s+(?:na\s+)?points?/i,  // "ilan na points"
    /^(?:show|ipakita)\s+(?:ang\s+)?points?\s+ko/i, // "show points ko"
  ],

  // Attendance commands
  present: [
    // English
    /^(?:mark\s+)?(?:me\s+)?(?:as\s+)?present/i,
    /^(?:i(?:'m|\s+am)\s+)?(?:here|attending)/i,
    /^(?:check\s+in|checkin)/i,

    // Tagalog (TL)
    /^(?:nandito|andito)\s+(?:ako|na ako)/i,  // "nandito ako"
    /^(?:dumating|dumating na)\s+ako/i,       // "dumating ako"
    /^(?:present|nandito)/i,                  // "present"

    // Taglish
    /^(?:present|here)\s+(?:ako|na|po)/i,     // "present ako" / "here na"
  ],

  // Loot commands
  loot: [
    /^(?:show|check|view|display)\s+(?:the\s+)?loot/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?loot/i,
    /^loot\s+(?:list|info|details)/i,
  ],

  // Status queries
  bidstatus: [
    // English
    /^(?:what(?:'s|\s+is)\s+the\s+)?(?:auction\s+)?status/i,
    /^(?:show|check|view)\s+(?:auction\s+)?status/i,
    /^(?:current\s+)?(?:auction|bidding)\s+(?:status|info)/i,

    // Tagalog (TL)
    /^(?:ano|ano ang)\s+(?:status|kalagayan)/i,    // "ano status?"
    /^(?:tignan|tingnan)\s+(?:ang\s+)?status/i,    // "tingnan status"
    /^(?:kamusta|kumusta)\s+(?:na\s+)?(?:ang\s+)?bid/i, // "kumusta na ang bid?"

    // Taglish
    /^status\s+(?:na|ng\s+)?(?:auction|bidding)/i, // "status ng auction"
    /^(?:ano|anu)\s+na\s+(?:sa\s+)?bid/i,          // "ano na sa bid?"
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
    /^extend\s+(?:the\s+)?(?:auction\s+)?(?:timer\s+)?(?:by\s+)?(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))?/i,
    /^add\s+(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))\s+to\s+(?:the\s+)?auction/i,
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
          let params = match.slice(1); // Extract captured groups

          // Special handling for extend command: normalize seconds to minutes
          if (command === 'extend' && params.length >= 1) {
            const amount = parseInt(params[0], 10);
            const unit = params[1] ? params[1].toLowerCase() : 'minutes';
            let minutes = amount;

            // Convert seconds to minutes if needed
            if (unit.startsWith('sec') || unit === 's') {
              minutes = Math.max(1, Math.ceil(amount / 60));
            }

            params = [String(minutes)];
          }

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
