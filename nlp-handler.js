/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║              ELYSIUM MULTILINGUAL NLP COMMAND HANDLER                     ║
 * ║           Natural Language Processing System (EN/TL/Taglish)              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Multilingual Natural Language Processing for flexible command interpretation
 * Supports English, Tagalog, and Taglish (code-switching) for Filipino users.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. MULTILINGUAL SUPPORT
 *    - English: "bid 500", "how many points do I have?"
 *    - Tagalog: "taya 500", "ilang points ko?"
 *    - Taglish: "bid ko 500", "magkano points ko?"
 *
 * 2. FLEXIBLE COMMAND SYNTAX
 *    - "bid 500" / "taya 500" → !bid 500
 *    - "how many points" / "ilang points" → !mypoints
 *    - "show leaderboard" / "tignan ranking" → !leaderboard
 *
 * 3. SMART INTENT DETECTION
 *    - Understands context and variations
 *    - Works without exact command syntax
 *    - Supports multiple phrasings and slang
 *
 * 4. SAFE INTEGRATION
 *    - Does NOT interfere with existing ! commands
 *    - Only works in specific channels (admin logs, auction threads)
 *    - Does NOT respond to casual conversation in guild chat
 *
 * 5. CONTEXTUAL AWARENESS
 *    - Understands auction context (in auction threads)
 *    - Understands admin context (in admin logs)
 *    - Provides multilingual responses based on detected language
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
// MULTILINGUAL NLP PATTERNS (English, Tagalog, Taglish)
// ═══════════════════════════════════════════════════════════════════════════

const NLP_PATTERNS = {
  // ══════════════════════════════════════════════════════════════════════════
  // BIDDING COMMANDS (Auction Threads)
  // ══════════════════════════════════════════════════════════════════════════
  bid: [
    // English
    /^(?:i\s+)?(?:want\s+to\s+)?bid\s+(\d+)/i,
    /^(?:offer|bidding)\s+(\d+)/i,
    /^place\s+(?:a\s+)?bid\s+(?:of\s+)?(\d+)/i,

    // Tagalog
    /^(?:taya|lagay)\s+(?:ko\s+)?(\d+)/i,                    // "taya 500" / "taya ko 500"
    /^(?:alok|offer)\s+(?:ko\s+)?(\d+)/i,                   // "alok ko 500"
    /^(?:bayad|singil)\s+(\d+)/i,                           // "bayad 500" (slang)
    /^(?:taasan|dagdag)\s+(\d+)/i,                          // "taasan 500" (increase bid)

    // Taglish (code-switching)
    /^bid\s+(?:ko|na|ng)\s+(\d+)/i,                         // "bid ko 500" / "bid na 500"
    /^(\d+)\s+(?:lang|na\s+lang|nalang)/i,                  // "500 lang"
    /^(\d+)\s+(?:points?|pts?|pesos?)/i,                    // "500 points"
    /^(?:mag|gusto)\s*-?\s*bid\s+(?:ng|ng\s+)?(\d+)/i,     // "mag-bid ng 500"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // POINTS QUERIES
  // ══════════════════════════════════════════════════════════════════════════
  mypoints: [
    // English
    /^(?:how\s+many|what(?:'s|\s+is)\s+my|check\s+my|show\s+my)\s+(?:points?|balance)/i,
    /^(?:my\s+)?(?:points?|balance)$/i,
    /^(?:what|how)\s+(?:are|is)\s+my\s+(?:points?|balance)/i,

    // Tagalog
    /^(?:ilang|ilan)\s+(?:ang\s+)?points?\s+(?:ko|namin)/i,      // "ilang points ko?"
    /^points?\s+ko\s+(?:ilang|ilan)/i,                           // "points ko ilang?"
    /^(?:magkano|gaano)\s+(?:ang\s+)?points?\s+ko/i,             // "magkano points ko?"
    /^(?:tignan|check|tingnan)\s+(?:ang\s+)?points?\s+ko/i,      // "tignan points ko"
    /^balance\s+ko/i,                                             // "balance ko"
    /^(?:pera|poins)\s+ko$/i,                                     // "pera ko" (slang)

    // Taglish
    /^(?:my|ko)\s+points?\s+(?:ilang|magkano|how\s+many)/i,      // "my points ilang?"
    /^check\s+(?:ko|ng)\s+points?/i,                             // "check ko points"
    /^(?:show|display)\s+(?:ang\s+)?points?\s+ko/i,              // "show points ko"
    /^gaano\s+(?:karami|kadami)\s+(?:ang\s+)?points?\s+ko/i,     // "gaano karami points ko?"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE COMMANDS
  // ══════════════════════════════════════════════════════════════════════════
  present: [
    // English
    /^(?:mark\s+)?(?:me\s+)?(?:as\s+)?present/i,
    /^(?:i(?:'m|\s+am)\s+)?(?:here|attending)/i,
    /^(?:check\s+in|checkin)/i,

    // Tagalog
    /^(?:nandito|andito|narito)(?:\s+(?:po|ako|na))?/i,         // "nandito" / "nandito po" / "nandito ako"
    /^(?:dumating|sumali|nag-?attend)(?:\s+(?:po|na|ako))?/i,   // "dumating na" / "sumali"
    /^present\s+(?:po|na)/i,                                     // "present po"
    /^(?:nandito|andito)\s+na\s+(?:po|ako)/i,                   // "nandito na po"

    // Taglish
    /^(?:here|nandito)\s+na/i,                                   // "here na" / "nandito na"
    /^attend(?:ing)?\s+(?:po|na)/i,                             // "attending po"
    /^present\s+(?:naman|din)/i,                                // "present naman"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // LOOT COMMANDS
  // ══════════════════════════════════════════════════════════════════════════
  loot: [
    // English
    /^(?:show|check|view|display)\s+(?:the\s+)?loot/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?loot/i,
    /^loot\s+(?:list|info|details)/i,

    // Tagalog
    /^(?:tignan|tingnan|pakita)\s+(?:ang\s+)?loot/i,               // "tignan loot"
    /^(?:ano|anong)\s+(?:ang\s+)?loot/i,                           // "ano ang loot"
    /^loot\s+(?:lista|listahan)/i,                                 // "loot lista"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS QUERIES
  // ══════════════════════════════════════════════════════════════════════════
  bidstatus: [
    // English
    /^(?:what(?:'s|\s+is)\s+the\s+)?(?:auction\s+)?status/i,
    /^(?:show|check|view)\s+(?:auction\s+)?status/i,
    /^(?:current\s+)?(?:auction|bidding)\s+(?:status|info)/i,
    /^(?:what(?:'s|\s+is)\s+)?happening/i,                        // "what's happening"

    // Tagalog
    /^(?:ano|anong)\s+(?:ang\s+)?(?:status|sitwasyon)/i,          // "ano ang status"
    /^(?:saan|nasaan)\s+(?:na|ang\s+auction)/i,                   // "saan na" / "nasaan na auction"
    /^(?:ano\s+)?(?:nangyayari|meron)/i,                          // "ano nangyayari" / "ano meron"
    /^(?:kamusta|kumusta)\s+(?:ang\s+)?auction/i,                 // "kumusta auction"

    // Taglish
    /^status\s+(?:na|ng\s+auction)/i,                             // "status na"
    /^ano\s+update/i,                                              // "ano update"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // LEADERBOARDS
  // ══════════════════════════════════════════════════════════════════════════

  // Attendance leaderboard (specific - must come first)
  leaderboardattendance: [
    // English
    /^(?:show|display|check|view)\s+attendance\s+leaderboard/i,
    /^attendance\s+(?:rankings?|leaderboard|top)/i,
    /^who\s+has\s+the\s+most\s+attendance/i,

    // Tagalog
    /^(?:tignan|pakita)\s+attendance\s+(?:ranking|leaderboard)/i,     // "tignan attendance ranking"
    /^(?:sino|sinong)\s+(?:ang\s+)?(?:pinaka-?mataas|nangunguna)\s+(?:sa\s+)?attendance/i,  // "sino nangunguna sa attendance"
    /^attendance\s+(?:listahan|ranking)/i,                            // "attendance listahan"
  ],

  // Bidding leaderboard (specific - must come first)
  leaderboardbidding: [
    // English
    /^(?:show|display|check|view)\s+bidding\s+leaderboard/i,
    /^bidding\s+(?:rankings?|leaderboard|top)/i,
    /^who\s+(?:spent|bid)\s+the\s+most/i,

    // Tagalog
    /^(?:tignan|pakita)\s+bidding\s+(?:ranking|leaderboard)/i,        // "tignan bidding ranking"
    /^(?:sino|sinong)\s+(?:ang\s+)?(?:pinaka-?mataas|nag-?spend)\s+(?:sa\s+)?(?:bidding|points)/i,  // "sino nag-spend ng pinakamarami"
    /^bidding\s+(?:listahan|ranking)/i,                               // "bidding listahan"
  ],

  // General leaderboard (must come after specific leaderboards)
  leaderboard: [
    // English
    /^(?:show|display|check|view)\s+(?:the\s+)?leaderboard$/i,
    /^(?:top|rankings?|leaderboard)$/i,
    /^who(?:'s|\s+is)\s+(?:on\s+)?top$/i,

    // Tagalog
    /^(?:tignan|pakita)\s+(?:ang\s+)?(?:ranking|leaderboard|listahan)$/i,  // "tignan ranking"
    /^(?:sino|sinong)\s+(?:ang\s+)?(?:top|nangunguna|pinakamataas)$/i,     // "sino ang top"
    /^(?:ranking|leaderboard|listahan)$/i,                                 // "ranking"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // QUEUE LIST
  // ══════════════════════════════════════════════════════════════════════════
  queuelist: [
    // English
    /^(?:show|display|check|view)\s+(?:the\s+)?queue/i,
    /^(?:auction\s+)?queue\s+(?:list)?/i,
    /^(?:what(?:'s|\s+is)\s+in\s+the\s+)?queue/i,

    // Tagalog
    /^(?:tignan|pakita)\s+(?:ang\s+)?(?:queue|pila)/i,                    // "tignan queue"
    /^(?:ano|anong)\s+(?:ang\s+)?(?:nasa\s+)?(?:queue|pila)/i,            // "ano ang nasa queue"
    /^(?:listahan|lista)\s+(?:ng\s+)?(?:auction|items)/i,                 // "listahan ng items"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN AUCTION COMMANDS
  // ══════════════════════════════════════════════════════════════════════════

  startauction: [
    // English
    /^start\s+(?:the\s+)?auction/i,
    /^begin\s+(?:the\s+)?auction/i,
    /^launch\s+(?:the\s+)?auction/i,

    // Tagalog
    /^(?:simula|simulan|umpisa|umpisahan)\s+(?:ang\s+)?auction/i,     // "simula auction"
    /^(?:start|begin)\s+(?:na|na\s+ang)\s+auction/i,                  // "start na auction"
  ],

  pause: [
    // English
    /^pause\s+(?:the\s+)?auction/i,
    /^hold\s+(?:the\s+)?auction/i,

    // Tagalog
    /^(?:hinto|tigil)\s+(?:muna|sandali)(?:\s+(?:ang\s+)?auction)?/i,  // "hinto muna" / "hinto muna auction"
    /^(?:pause|hold)\s+(?:muna|lang)/i,                                 // "pause muna"
  ],

  resume: [
    // English
    /^resume\s+(?:the\s+)?auction/i,
    /^continue\s+(?:the\s+)?auction/i,
    /^unpause\s+(?:the\s+)?auction/i,

    // Tagalog
    /^(?:tuloy|ituloy|resume)\s+(?:ang\s+)?auction/i,                 // "tuloy auction"
    /^(?:ituloy|tuloy)$/i,                                             // "ituloy"
    /^(?:continue|tuloy)\s+(?:na|na\s+naman)/i,                       // "continue na"
  ],

  stop: [
    // English
    /^stop\s+(?:the\s+)?auction/i,
    /^end\s+(?:the\s+)?auction/i,
    /^cancel\s+(?:the\s+)?auction/i,

    // Tagalog
    /^(?:tigil|hinto|stop)\s+(?:na|ang)\s+auction/i,                  // "tigil na auction"
    /^(?:tapos|end)\s+(?:na|ang)\s+auction/i,                         // "tapos na auction"
    /^(?:cancel|kansela|kanselahin)\s+(?:ang\s+)?auction/i,           // "cancel auction"
  ],

  extend: [
    // English
    /^extend\s+(?:the\s+)?(?:auction\s+)?(?:timer\s+)?(?:by\s+)?(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))?/i,
    /^add\s+(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))\s+to\s+(?:the\s+)?auction/i,

    // Tagalog
    /^(?:dagdag|extend)\s+(?:ng\s+)?(\d+)\s*((?:segundo|sandali|minuto|mins?))?/i,  // "dagdag ng 5 minuto"
    /^(?:palawakin|extend)\s+(?:ang\s+)?(?:oras|time)\s+(?:ng\s+)?(\d+)/i,          // "extend ang oras ng 5"
  ],

  skipitem: [
    // English
    /^skip\s+(?:this\s+)?(?:current\s+)?item/i,
    /^next\s+item/i,
    /^move\s+to\s+next\s+item/i,

    // Tagalog
    /^(?:laktaw|skip)\s+(?:ang\s+)?(?:item|ito)/i,                    // "laktaw item"
    /^(?:sunod|next)\s+(?:na|item)/i,                                 // "sunod na" / "next item"
    /^(?:lipat|move)\s+(?:sa\s+)?(?:next|susunod)/i,                  // "lipat sa next"
  ],

  cancelitem: [
    // English
    /^cancel\s+(?:this\s+)?(?:current\s+)?item/i,
    /^remove\s+(?:this\s+)?(?:current\s+)?item/i,

    // Tagalog
    /^(?:cancel|kansela|kanselahin)\s+(?:ang\s+)?(?:item|ito)/i,      // "cancel item"
    /^(?:tanggalin|alisin|remove)\s+(?:ang\s+)?(?:item|ito)/i,        // "tanggalin item"
    /^(?:wag|huwag)\s+(?:na|na\s+lang)\s+(?:ito|to)/i,                // "wag na ito"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // INTELLIGENCE COMMANDS
  // ══════════════════════════════════════════════════════════════════════════

  // Price prediction
  predictprice: [
    // English
    /^(?:predict|estimate|suggest)\s+price\s+(?:for\s+)?(.+)/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?price\s+(?:for|of)\s+(.+)/i,
    /^how\s+much\s+(?:is|should)\s+(.+)\s+(?:cost|be)/i,

    // Tagalog
    /^(?:magkano|ilan)\s+(?:ang\s+)?(?:presyo|price)\s+(?:ng|para\s+sa)\s+(.+)/i,  // "magkano price ng item"
    /^(?:predict|tantiya)\s+(?:ng\s+)?(?:presyo|price)\s+(?:ng|para)\s+(.+)/i,     // "tantiya ng presyo"
    /^(?:estimate|taya)\s+(?:ng\s+)?(.+)/i,                                         // "estimate ng item"
  ],

  // Engagement (specific user - must come first)
  engagement: [
    // English
    /^(?:check|analyze|show)\s+engagement\s+(?:for\s+)?(.+)/i,
    /^engagement\s+(?:analysis\s+)?(?:for\s+)?(.+)/i,
    /^how\s+engaged\s+is\s+(.+)/i,

    // Tagalog
    /^(?:tignan|check)\s+(?:ang\s+)?engagement\s+(?:ni|ng)\s+(.+)/i,               // "tignan engagement ni user"
    /^(?:gaano|paano)\s+ka-?active\s+(?:si|ang)\s+(.+)/i,                          // "gaano kaactive si user"
    /^(?:analyze|suriin)\s+(?:si|ang)\s+(.+)/i,                                    // "analyze si user"
  ],

  // Guild-wide engagement (must come after specific user engagement)
  analyzeengagement: [
    // English
    /^analyze\s+(?:guild\s+)?engagement$/i,
    /^(?:show|check)\s+(?:guild\s+)?engagement$/i,
    /^engagement\s+(?:analysis|report|summary)$/i,

    // Tagalog
    /^(?:analyze|suriin)\s+(?:ang\s+)?(?:guild|lahat)$/i,                          // "analyze guild"
    /^(?:tignan|pakita)\s+(?:ang\s+)?engagement\s+(?:ng\s+guild)?$/i,              // "tignan engagement"
  ],

  // Anomalies
  detectanomalies: [
    // English
    /^(?:detect|check|find)\s+anomalies/i,
    /^(?:check\s+for\s+)?fraud/i,
    /^(?:show\s+)?suspicious\s+(?:activity|behavior)/i,

    // Tagalog
    /^(?:hanapin|tignan)\s+(?:ang\s+)?(?:anomaly|anomalya|kakaiba)/i,             // "hanapin anomaly"
    /^(?:check|tignan)\s+(?:kung\s+may\s+)?(?:fraud|pandaraya|daya)/i,            // "check fraud"
    /^(?:suspicious|kaduda-duda)\s+(?:activity|gawa)/i,                            // "kaduda-duda activity"
  ],

  // Recommendations
  recommendations: [
    // English
    /^(?:show|give|get)\s+recommendations/i,
    /^(?:what\s+(?:do\s+)?(?:you\s+)?)?(?:suggest|recommend)/i,
    /^recommendations\s+(?:for\s+)?(?:guild)?/i,

    // Tagalog
    /^(?:pakita|bigay)\s+(?:ang\s+)?(?:recommendation|suggestion)/i,               // "pakita recommendation"
    /^(?:ano|anong)\s+(?:ang\s+)?(?:suggest|recommendation)/i,                     // "ano suggest"
    /^(?:suggest|recommend|mungkahi)\s+(?:mo)?/i,                                  // "suggest mo"
  ],

  // Performance
  performance: [
    // English
    /^(?:show|check)\s+performance/i,
    /^(?:bot\s+)?performance\s+(?:stats|metrics)/i,
    /^how(?:'s|\s+is)\s+(?:the\s+)?(?:bot\s+)?performance/i,

    // Tagalog
    /^(?:tignan|pakita)\s+(?:ang\s+)?performance/i,                                // "tignan performance"
    /^(?:kamusta|kumusta)\s+(?:ang\s+)?(?:bot|performance)/i,                      // "kumusta bot"
    /^performance\s+(?:stats|ng\s+bot)/i,                                          // "performance stats"
  ],

  // Analyze queue
  analyzequeue: [
    // English
    /^analyze\s+(?:the\s+)?(?:auction\s+)?queue/i,
    /^(?:suggest|predict)\s+(?:auction\s+)?prices/i,
    /^(?:check|review)\s+(?:all\s+)?(?:auction\s+)?items/i,

    // Tagalog
    /^(?:analyze|suriin)\s+(?:ang\s+)?(?:queue|pila|items)/i,                      // "analyze queue"
    /^(?:suggest|predict)\s+(?:ng\s+)?(?:presyo|prices)/i,                         // "suggest ng presyo"
    /^(?:tignan|review)\s+(?:lahat\s+ng\s+)?(?:items|auction)/i,                   // "tignan lahat ng items"
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS & HELP
  // ══════════════════════════════════════════════════════════════════════════

  // Status (admin)
  status: [
    // English
    /^(?:bot\s+)?status/i,
    /^(?:show|check)\s+(?:bot\s+)?status/i,

    // Tagalog
    /^(?:kamusta|kumusta)\s+(?:ang\s+)?bot/i,                                      // "kumusta bot"
    /^(?:status|kalagayan)\s+(?:ng\s+)?bot/i,                                      // "status ng bot"
  ],

  // Help queries
  help: [
    // English
    /^(?:help|commands?|what\s+can\s+you\s+do)/i,
    /^(?:how\s+do\s+i|show\s+me)/i,

    // Tagalog
    /^(?:tulong|help|tulungan)/i,                                                  // "tulong"
    /^(?:paano|pano)\s+(?:ba|ko|ako|gamitin|gumamit)/i,                           // "paano ba" / "paano ako"
    /^(?:ano|anong)\s+(?:ang\s+)?(?:commands?|pwede|magagawa)/i,                  // "ano commands" / "ano pwede"
    /^(?:show|pakita)\s+(?:ng\s+)?(?:commands?|help)/i,                           // "pakita ng commands"
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
   * Detect language from message content
   * @param {string} content - Message content
   * @returns {string} Language code ('en', 'tl', 'taglish')
   */
  detectLanguage(content) {
    const lowerContent = content.toLowerCase();

    // Tagalog-specific words (common particles and verbs)
    const tagalogKeywords = [
      'nandito', 'andito', 'narito', 'ako', 'ko', 'ang', 'ng', 'na',
      'po', 'taya', 'alok', 'ilang', 'magkano', 'tignan', 'tingnan',
      'pakita', 'ano', 'sino', 'kumusta', 'kamusta', 'tulong', 'paano',
      'gaano', 'pano', 'ba', 'tuloy', 'hinto', 'tigil', 'simula',
      'tapos', 'wag', 'huwag', 'meron', 'nangyayari', 'nangunguna',
      'pinakamarami', 'pinakamataas', 'listahan', 'pila', 'oras',
      'dagdag', 'tanggalin', 'alisin', 'laktaw', 'sunod', 'suriin',
      'mungkahi', 'pera', 'poins', 'lang', 'naman', 'din', 'muna',
    ];

    // Count Tagalog keywords
    let tagalogCount = 0;
    for (const keyword of tagalogKeywords) {
      if (lowerContent.includes(keyword)) {
        tagalogCount++;
      }
    }

    // English-only words (no Tagalog mixing)
    const englishOnly = /^(?:bid|offer|points?|balance|status|help|show|check|view)\s+\d+$/i.test(content) ||
                        /^(?:present|here|attending|my\s+points?)$/i.test(content);

    // Determine language
    if (tagalogCount >= 2) return 'tl';      // Pure Tagalog (2+ keywords)
    if (tagalogCount === 1) return 'taglish'; // Code-switching (1 keyword)
    if (englishOnly) return 'en';             // Pure English
    return 'en';                               // Default to English
  }

  /**
   * Get multilingual response messages
   * @param {string} command - Interpreted command
   * @param {string} language - Detected language ('en', 'tl', 'taglish')
   * @returns {object} Response messages in different languages
   */
  getMultilingualResponses(command, language) {
    const responses = {
      bid: {
        en: '💰 Bid placed',
        tl: '💰 Nag-bid na',
        taglish: '💰 Bid placed na',
      },
      mypoints: {
        en: '💡 *Checking your points...*',
        tl: '💡 *Tinitingnan ang points mo...*',
        taglish: '💡 *Checking points mo...*',
      },
      present: {
        en: '✅ *Marking attendance...*',
        tl: '✅ *Nag-mark ng attendance...*',
        taglish: '✅ *Marking attendance na...*',
      },
      leaderboard: {
        en: '📊 *Showing leaderboard...*',
        tl: '📊 *Pinapakita ang ranking...*',
        taglish: '📊 *Showing ranking na...*',
      },
      bidstatus: {
        en: '📋 *Checking auction status...*',
        tl: '📋 *Tinitingnan ang status ng auction...*',
        taglish: '📋 *Checking auction status...*',
      },
      help: {
        en: '❓ *Showing help...*',
        tl: '❓ *Pinapakita ang tulong...*',
        taglish: '❓ *Showing help na...*',
      },
      default: {
        en: `💡 *Interpreting as \`!COMMAND\`*`,
        tl: `💡 *Naintindihan bilang \`!COMMAND\`*`,
        taglish: `💡 *Interpreting as \`!COMMAND\` na*`,
      },
    };

    const commandName = command.replace('!', '');
    const responseSet = responses[commandName] || responses.default;

    // Replace COMMAND placeholder in default response
    const response = responseSet[language] || responseSet.en;
    return response.replace('COMMAND', commandName);
  }

  /**
   * Get context-aware response message
   * @param {string} command - Interpreted command
   * @param {Message} message - Original message
   * @returns {string} Context-aware multilingual explanation
   */
  getContextMessage(command, message) {
    const isAuctionThread = message.channel.isThread() &&
                           message.channel.parentId === this.config.bidding_channel_id;

    // No explanation needed for bids in auction (silent bidding)
    if (command === '!bid' && isAuctionThread) {
      return '';
    }

    // Detect language and provide appropriate response
    const language = this.detectLanguage(message.content);
    return this.getMultilingualResponses(command, language);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { NLPHandler, NLP_CONFIG, NLP_PATTERNS };
