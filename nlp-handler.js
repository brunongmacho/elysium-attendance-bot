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

  // Pattern matching priority order (checked first to last)
  // More specific patterns should come before generic ones
  patternPriority: [
    // Attendance-specific (must come first to avoid bid conflicts)
    'attendancestatus',
    'leaderboardattendance',
    'predictattendance',

    // Bidding-specific
    'leaderboardbidding',
    'bidstatus',
    'mypoints',
    'bid',
    'loot',

    // Weekly/spawn predictions
    'weeklyreport',
    'predictspawn',

    // User engagement (specific before general)
    'engagement',
    'analyzeengagement',

    // Admin commands
    'startauction',
    'pause',
    'resume',
    'stop',
    'extend',
    'skipitem',
    'cancelitem',

    // Intelligence
    'predictprice',
    'detectanomalies',
    'recommendations',
    'performance',
    'analyzequeue',

    // General (must come last)
    'queuelist',
    'leaderboard',
    'present',
    'status',
    'help',
  ],
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
    /^(?:my\s+)?(?:points?|balance|pts?)/i,
    /^(?:what|how)\s+(?:are|is)\s+my\s+(?:points?|balance)/i,
    /^how\s+much\s+(?:are|is)\s+my\s+(?:.*?\s+)?points?/i,
    /^how\s+many\s+(?:.*?\s+)?points?\s+(?:do\s+)?(?:i|we)\s+(?:have|got)/i,
    /^(?:check|show|tell|give|display)\s+(?:me\s+)?(?:my\s+)?(?:.*?\s+)?points?/i,
    /^(?:pts|points|pnts|point)$/i,          // Shortcuts
    /^(?:my\s+)?(?:pts?|bp|bidding\s+points?)$/i,
    /^(?:remaining|left|balance)(?:\s+points?)?$/i,
    /^(?:point|pint|pont|pnts)\s+(?:count|balance|left)/i, // Common typos

    // Tagalog (TL)
    /^(?:ilang|ilan|lng|ilng)\s+(?:ang\s+)?points?\s+(?:ko|namin|ko\s+pa)/i,
    /^(?:magkano|magkanu|mgkano)\s+(?:ang\s+)?points?\s+ko/i,
    /^(?:tignan|tingnan|tngin|tingen)\s+(?:ang\s+)?points?\s+ko/i,
    /^(?:check|chek|cek)\s+points?\s+ko/i,
    /^points?\s+ko(?:\s+(?:ba|po|pls|please|naman))?/i,
    /^(?:pts?|balance)\s+ko/i,
    /^(?:pera|pondo|money)\s+ko/i,
    /^(?:natira|natitira|natitirang)\s+(?:points?|pts)/i, // "remaining points"
    /^(?:meron|may|mayroon)\s+(?:pa\s+)?(?:ako|akong)\s+(?:ilang|ilan)/i, // "meron pa ako ilang"
    /^(?:tira|titirang?)\s+(?:points?|ko)/i, // "tira ko"
    /^(?:ilan|ilang)\s+(?:pa|na|na\s+lang)/i, // "ilan pa"
    /^(?:pila|ilang)\s+(?:natira|naiwan)/i,  // "ilang natira"

    // Taglish (code-switching)
    /^(?:ano|anu|ano\s+ba)\s+(?:ang\s+)?points?\s+ko/i,
    /^(?:ilan|ilang|ilng)\s+(?:na\s+)?(?:points?|pts)/i,
    /^(?:show|ipakita|pakita)\s+(?:ang\s+)?points?\s+ko/i,
    /^(?:pts?|points?)\s+(?:ko|ko\s+ba|naman)/i,
    /^(?:check|tingnan)\s+(?:ko|yung)\s+points?/i,
    /^(?:remaining|left)\s+(?:ko|points?\s+ko)/i,
    /^(?:how\s+many|ilan)\s+(?:pa|na)$/i,     // "how many pa"
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
    // English - require auction/bid context OR end of string to avoid matching attendance status
    /^(?:what(?:'s|\s+is)\s+the\s+)?(?:auction|bidding|bid)\s+(?:status|stat)/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?(?:status|stat)(?:\s+(?:of|for)\s+(?:the\s+)?(?:auction|bidding|bid))?$/i,
    /^(?:show|check|view|display)\s+(?:auction|bidding|bid)\s+(?:status|stat)/i,
    /^(?:current\s+)?(?:auction|bidding|bid)\s+(?:status|info|details)/i,
    /^(?:status|stat|info)$/i,               // Shortcuts - single word only
    /^(?:bid\s+)?(?:info|details|update)$/i,
    /^(?:auction|bidding)\s+(?:update|news)/i,
    /^(?:what's|whats)\s+(?:happening|going on)(?:\s+(?:with|in)\s+(?:the\s+)?(?:auction|bidding|bid))?$/i,
    /^(?:status|update)\s+(?:of|for)\s+(?:the\s+)?(?:auction|bidding|bid)/i,

    // Tagalog (TL) - require auction/bid context
    /^(?:ano|anu|ano\s+ba)\s+(?:ang\s+)?(?:status|kalagayan|balita)(?:\s+(?:ng|sa)\s+)?(?:bid|auction)/i,
    /^(?:tignan|tingnan|tngin)\s+(?:ang\s+)?(?:status|balita)(?:\s+(?:ng|sa)\s+)?(?:bid|auction)/i,
    /^(?:kamusta|kumusta|kmusta)\s+(?:na\s+)?(?:ang\s+)?(?:bid|auction)/i,
    /^(?:anong|anu)\s+(?:nangyayari|nangyari|meron)/i, // "anong nangyayari"
    /^(?:may|meron)\s+(?:bid|auction)\s+(?:ba|na)/i, // "may bid ba"
    /^(?:aktibo|active)\s+(?:ba|pa)\s+(?:ang\s+)?(?:bid|auction)/i, // "aktibo ba ang bid"
    /^(?:update|balita|news)(?:\s+(?:ba|po|naman))?$/i,

    // Taglish - require auction/bid context
    /^status\s+(?:na|ng|ba)\s+(?:auction|bidding|bid)/i,
    /^(?:ano|anu)\s+(?:na|nangyari)\s+(?:sa\s+)?(?:bid|auction)/i,
    /^(?:update|balita)\s+(?:naman|please|pls)(?:\s+(?:ng|sa)\s+)?(?:bid|auction)$/i,
    /^(?:kamusta|kumusta)\s+(?:bid|auction)/i,
    /^(?:may|meron)\s+(?:bang\s+)?(?:auction|bid)/i,
  ],

  // Attendance status - Maps to !status which shows attendance thread info
  // MUST come before bidstatus to avoid conflicts
  attendancestatus: [
    // Thread status queries - more specific than general status
    /^(?:what(?:'s|\s+is)\s+the\s+)?status\s+(?:of|for)\s+(?:the\s+)?attendance\s+(?:threads?|system)/i,
    /^(?:show|check|view|display)\s+attendance\s+(?:threads?|status)/i,
    /^attendance\s+(?:threads?|status)(?:\s+(?:please|pls))?/i,
    /^(?:how\s+many|what)\s+attendance\s+threads?\s+(?:are\s+)?(?:open|active|running)/i,
    /^(?:list|show)\s+(?:all\s+)?(?:active\s+)?attendance\s+threads?/i,

    // Tagalog
    /^(?:ano|anu)\s+(?:ang\s+)?status\s+(?:ng|sa)\s+attendance/i,
    /^(?:ilang|ilan)\s+attendance\s+threads?/i,
    /^(?:tignan|tingnan)\s+attendance\s+(?:threads?|status)/i,

    // Taglish
    /^status\s+(?:ng|ng\s+mga)\s+attendance\s+threads?/i,
    /^(?:show|pakita)\s+attendance\s+status/i,
  ],

  // Weekly report
  weeklyreport: [
    // English
    /^(?:show|display|view|check)\s+(?:the\s+)?(?:weekly|week)\s+(?:report|summary|stats?)/i,
    /^(?:weekly|week)\s+(?:report|summary|stats?)/i,
    /^(?:this\s+)?week(?:'s)?\s+(?:report|summary|stats?|performance)/i,
    /^(?:what|how)\s+(?:about|was)\s+(?:this\s+)?week/i,
    /^(?:report|summary)\s+(?:for\s+)?(?:this\s+)?week/i,

    // Tagalog
    /^(?:tignan|tingnan|show)\s+(?:ang\s+)?weekly\s+report/i,
    /^(?:ano|anu)\s+(?:ang\s+)?report\s+(?:ngayong|this)\s+week/i,
    /^week(?:ly)?\s+(?:ba|naman|po)/i,

    // Taglish
    /^(?:pakita|show)\s+(?:yung|ang)\s+weekly/i,
    /^(?:report|summary)\s+(?:ng|ngayong)\s+week/i,
  ],

  // Spawn prediction
  predictspawn: [
    // English
    /^(?:when|what\s+time)\s+(?:is|will\s+be)\s+(?:the\s+)?next\s+spawn/i,
    /^(?:predict|estimate|guess)\s+(?:the\s+)?next\s+spawn/i,
    /^next\s+spawn(?:\s+time)?/i,
    /^(?:when(?:'s|\s+is)|what\s+time\s+is)\s+(?:the\s+)?spawn/i,
    /^(?:spawn\s+)?(?:timer|prediction|estimate)/i,

    // Tagalog
    /^(?:kailan|kalian)\s+(?:ang\s+)?(?:next|susunod)\s+spawn/i,
    /^next\s+spawn\s+(?:ba|po|naman)/i,

    // Taglish
    /^(?:when|kailan)\s+(?:ba|po)\s+(?:next|susunod)\s+spawn/i,
  ],

  // Predict attendance
  predictattendance: [
    // English
    /^(?:predict|estimate|forecast)\s+attendance\s+(?:for\s+)?(.+)/i,
    /^(?:will|can)\s+(.+)\s+(?:attend|make\s+it|come)/i,
    /^attendance\s+(?:prediction|forecast)\s+(?:for\s+)?(.+)/i,
    /^(?:how\s+likely\s+is)\s+(.+)\s+to\s+attend/i,

    // Tagalog
    /^(?:dadalo|aattend)\s+(?:ba|kaya)\s+(.+)/i,
    /^predict\s+attendance\s+(.+)/i,
  ],

  // Attendance leaderboard (specific - must come after attendance status)
  leaderboardattendance: [
    /^(?:show|display|check|view)\s+attendance\s+(?:leaderboard|rankings?|top)/i,
    /^attendance\s+(?:rankings?|leaderboard|top|leaders?)/i,
    /^who\s+has\s+the\s+most\s+attendance/i,
    /^(?:top|best)\s+attendance(?:\s+(?:members?|players?|users?))?/i,
    /^(?:leaderboard|lb|rankings?)\s+(?:for\s+)?attendance/i,

    // Tagalog
    /^(?:sino|who)\s+(?:ang\s+)?(?:may\s+)?(?:pinakamaraming|maraming)\s+attendance/i,
    /^attendance\s+(?:top|leaders?)\s+(?:ba|po|naman)?/i,

    // Taglish
    /^(?:show|pakita)\s+attendance\s+(?:leaderboard|top)/i,
    /^top\s+sa\s+attendance/i,
  ],

  // Bidding leaderboard (specific - must come before general)
  leaderboardbidding: [
    /^(?:show|display|check|view)\s+(?:the\s+)?bidding\s+(?:leaderboard|rankings?|top)/i,
    /^bidding\s+(?:rankings?|leaderboard|top|leaders?)/i,
    /^who\s+(?:spent|bid|used)\s+the\s+most(?:\s+(?:points?|money))?/i,
    /^(?:top|best)\s+(?:bidders?|spenders?)/i,
    /^(?:leaderboard|lb|rankings?)\s+(?:for\s+)?bidding/i,

    // Tagalog
    /^(?:sino|who)\s+(?:ang\s+)?(?:pinakamaraming|maraming)\s+(?:bid|taya|gastos)/i,
    /^bidding\s+(?:top|leaders?)\s+(?:ba|po|naman)?/i,

    // Taglish
    /^(?:show|pakita)\s+bidding\s+(?:leaderboard|top)/i,
    /^top\s+sa\s+bidding/i,
  ],

  // General leaderboard (must come after specific leaderboards)
  leaderboard: [
    /^(?:show|display|check|view)\s+(?:me\s+)?(?:the\s+)?(?:all\s+)?(?:leaderboards?|lb|rankings?)$/i,
    /^(?:top|rankings?|leaderboards?|lb)$/i,
    /^(?:all\s+)?(?:leaderboards?|lb)(?:\s+(?:please|pls))?$/i,
    /^who(?:'s|\s+is)\s+(?:on\s+)?(?:top|leading)(?:\s+overall)?/i,
    /^(?:top\s+)?(?:players?|members?|users?)$/i,
    /^(?:rank|ranking|ranks)$/i,
    /^(?:show|display)\s+(?:all\s+)?(?:rankings?|stats?|scores?)/i,

    // Tagalog
    /^(?:sino|who)\s+(?:ang\s+)?(?:nangungunang|nangunguna|nasa\s+top)/i,
    /^(?:tignan|tingnan)\s+(?:ang\s+)?(?:lahat\s+ng\s+)?(?:leaderboard|ranking)/i,
    /^(?:top|rank|ranking)(?:\s+(?:ba|naman|po))?$/i,

    // Taglish
    /^(?:sino|who)\s+(?:top|nangunguna)(?:\s+sa\s+lahat)?/i,
    /^(?:show|pakita)\s+(?:me\s+)?(?:the\s+)?(?:all\s+)?(?:ranking|leaderboards?)/i,
  ],

  // Queue list
  queuelist: [
    /^(?:show|display|check|view)\s+(?:the\s+)?(?:auction\s+)?queue/i,
    /^(?:auction\s+)?queue\s+(?:list)?/i,
    /^(?:what(?:'s|\s+is)\s+in\s+the\s+)?queue/i,
    /^(?:what(?:'s|\s+is)|show)\s+(?:in\s+)?(?:the\s+)?(?:auction\s+)?(?:queue|lineup)/i,
    /^(?:list|show)\s+(?:all\s+)?(?:auction\s+)?items?/i,
    /^(?:what(?:'s|\s+is)|show)\s+(?:up\s+)?next/i,

    // Tagalog
    /^(?:ano|anu)\s+(?:ang\s+)?(?:nasa\s+)?queue/i,
    /^(?:tignan|tingnan)\s+(?:ang\s+)?queue/i,
    /^(?:ilista|listahan)\s+(?:ng\s+)?items?/i,

    // Taglish
    /^(?:show|pakita)\s+(?:yung|ang)\s+queue/i,
    /^(?:ano|what)\s+(?:ang\s+)?(?:next|susunod)/i,
  ],

  // Admin auction commands
  startauction: [
    /^start\s+(?:the\s+)?auction(?:\s+now)?/i,
    /^begin\s+(?:the\s+)?auction/i,
    /^launch\s+(?:the\s+)?auction/i,
    /^(?:open|commence)\s+(?:the\s+)?auction/i,
    /^auction\s+(?:start|begin)/i,

    // Tagalog
    /^(?:simulan|simula)\s+(?:ang\s+)?auction/i,
    /^(?:mag-?start|magstart)\s+(?:ng\s+)?auction/i,

    // Taglish
    /^(?:start|simula)\s+(?:na|na\s+ang)\s+auction/i,
  ],

  pause: [
    /^pause\s+(?:the\s+)?auction/i,
    /^hold\s+(?:the\s+)?auction/i,
    /^(?:stop|freeze)\s+(?:the\s+)?(?:auction\s+)?(?:timer|countdown)/i,
    /^auction\s+pause/i,

    // Tagalog
    /^(?:ihinto|tigil)\s+(?:muna\s+)?(?:ang\s+)?auction/i,
    /^(?:i-?pause|ipause)\s+auction/i,
  ],

  resume: [
    /^resume\s+(?:the\s+)?auction/i,
    /^continue\s+(?:the\s+)?auction/i,
    /^unpause\s+(?:the\s+)?auction/i,
    /^(?:start|restart)\s+(?:the\s+)?(?:auction\s+)?(?:timer|countdown)/i,
    /^auction\s+(?:resume|continue)/i,

    // Tagalog
    /^(?:ipagpatuloy|ituloy)\s+(?:ang\s+)?auction/i,
    /^(?:i-?resume|iresume)\s+auction/i,
  ],

  stop: [
    /^stop\s+(?:the\s+)?auction/i,
    /^end\s+(?:the\s+)?auction/i,
    /^cancel\s+(?:the\s+)?auction/i,
    /^(?:finish|terminate|close)\s+(?:the\s+)?auction/i,
    /^auction\s+(?:stop|end|cancel)/i,

    // Tagalog
    /^(?:tapusin|tapos)\s+(?:na\s+)?(?:ang\s+)?auction/i,
    /^(?:i-?stop|istop)\s+auction/i,
    /^(?:wakasan|wakas)\s+auction/i,
  ],

  extend: [
    /^extend\s+(?:the\s+)?(?:auction\s+)?(?:timer\s+)?(?:by\s+)?(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))?/i,
    /^add\s+(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))\s+to\s+(?:the\s+)?(?:auction\s+)?(?:timer)?/i,
    /^(?:give|add)\s+(?:me\s+)?(?:more\s+)?(\d+)\s*((?:seconds?|secs?|mins?|minutes?))?/i,
    /^\+(\d+)\s*((?:seconds?|secs?|s|mins?|minutes?))?/i,

    // Tagalog
    /^(?:dagdagan|extend)\s+(?:ng\s+)?(\d+)\s*((?:seconds?|secs?|mins?|minutes?))?/i,
    /^(?:i-?extend|iextend)\s+(\d+)\s*((?:seconds?|secs?|mins?|minutes?))?/i,
  ],

  skipitem: [
    /^skip\s+(?:this\s+)?(?:current\s+)?item/i,
    /^next\s+item(?:\s+please)?/i,
    /^move\s+to\s+(?:the\s+)?next\s+item/i,
    /^(?:go\s+to|move\s+to)\s+next/i,
    /^(?:pass|skip)(?:\s+this)?/i,

    // Tagalog
    /^(?:laktawan|skip)\s+(?:ito|to|item)?/i,
    /^(?:next|susunod)\s+(?:na|item)/i,
    /^(?:lumipat|lipat)\s+sa\s+next/i,
  ],

  cancelitem: [
    /^cancel\s+(?:this\s+)?(?:current\s+)?item/i,
    /^remove\s+(?:this\s+)?(?:current\s+)?item/i,
    /^(?:delete|discard|abort)\s+(?:this\s+)?(?:current\s+)?item/i,

    // Tagalog
    /^(?:i-?cancel|icancel|tanggalin)\s+(?:ito|to|item)?/i,
    /^(?:alisin|wag\s+na)\s+(?:ito|to|item)?/i,
  ],

  // Intelligence commands - Price prediction
  predictprice: [
    /^(?:predict|estimate|suggest|guess)\s+price\s+(?:for\s+)?(.+)/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?(?:predicted|estimated)\s+price\s+(?:for|of)\s+(.+)/i,
    /^how\s+much\s+(?:is|should|would|will)\s+(.+)\s+(?:cost|be|go\s+for)/i,
    /^price\s+(?:prediction|estimate)\s+(?:for\s+)?(.+)/i,

    // Tagalog
    /^(?:magkano|magkanu)\s+(?:kaya|ba)\s+(.+)/i,
    /^(?:predict|estimate)\s+price\s+(.+)/i,
  ],

  // Intelligence commands - Engagement (specific user - must come first)
  engagement: [
    /^(?:check|analyze|show|view)\s+engagement\s+(?:for\s+)?(.+)/i,
    /^engagement\s+(?:analysis\s+)?(?:for\s+)?(.+)/i,
    /^how\s+engaged\s+is\s+(.+)/i,
    /^(.+)(?:'s|\s+)engagement/i,
    /^analyze\s+(.+)(?:'s)?\s+(?:activity|participation)/i,
  ],

  // Guild-wide engagement (must come after specific user engagement)
  analyzeengagement: [
    /^analyze\s+(?:guild|all|everyone|overall)\s+engagement$/i,
    /^(?:show|check|view)\s+(?:guild|all|overall)\s+engagement$/i,
    /^engagement\s+(?:analysis|report|summary|overview)$/i,
    /^(?:guild|overall|everyone)\s+engagement$/i,

    // Tagalog
    /^(?:tignan|check)\s+engagement\s+(?:ng\s+lahat|overall)/i,
  ],

  // Intelligence commands - Anomalies
  detectanomalies: [
    /^(?:detect|check|find|search\s+for)\s+anomalies/i,
    /^(?:check\s+for\s+)?(?:fraud|cheating|suspicious)/i,
    /^(?:show\s+)?suspicious\s+(?:activity|behavior|patterns?)/i,
    /^(?:anomaly|fraud)\s+(?:detection|check)/i,
    /^(?:find|detect)\s+(?:cheaters?|fraudsters?)/i,

    // Tagalog
    /^(?:hanapin|hanap)\s+(?:anomalies|fraud|suspicious)/i,
    /^(?:may|meron)\s+(?:ba\s+)?(?:fraud|cheater)/i,
  ],

  // Intelligence commands - Recommendations
  recommendations: [
    /^(?:show|give|get|provide)\s+(?:me\s+)?recommendations/i,
    /^(?:what\s+(?:do\s+)?(?:you\s+)?)?(?:suggest|recommend)(?:\s+(?:to\s+)?me)?$/i,
    /^recommendations\s+(?:for\s+)?(?:guild|me)?/i,
    /^(?:any\s+)?(?:suggestions?|advice|tips?)/i,

    // Tagalog
    /^(?:ano|anu)\s+(?:ang\s+)?(?:recommend|suggest)/i,
    /^(?:may\s+)?(?:suggestions?|recommendations?)\s+(?:ba|ka)/i,
  ],

  // Intelligence commands - Performance
  performance: [
    /^(?:show|check|view|display)\s+(?:bot\s+)?performance/i,
    /^(?:bot\s+)?performance\s+(?:stats?|metrics?|report)/i,
    /^how(?:'s|\s+is)\s+(?:the\s+)?(?:bot\s+)?(?:performance|performing)/i,
    /^(?:bot\s+)?(?:stats?|statistics?|metrics?)/i,
    /^(?:system|bot)\s+(?:health|status)/i,

    // Tagalog
    /^(?:kamusta|kumusta)\s+(?:ang\s+)?bot/i,
    /^(?:tignan|check)\s+performance/i,
  ],

  // Intelligence commands - Analyze queue
  analyzequeue: [
    /^analyze\s+(?:the\s+)?(?:auction\s+)?queue/i,
    /^(?:suggest|predict)\s+(?:auction\s+)?prices/i,
    /^(?:check|review|analyze)\s+(?:all\s+)?(?:auction\s+)?items/i,
    /^queue\s+analysis/i,
    /^(?:smart|ai)\s+(?:pricing|analysis)/i,

    // Tagalog
    /^(?:analyze|tingnan)\s+queue/i,
  ],

  // Status (admin)
  status: [
    /^(?:bot\s+)?status$/i,
    /^(?:show|check|view|display)\s+(?:bot\s+)?(?:system\s+)?status$/i,
    /^how(?:'s|\s+is)\s+(?:the\s+)?(?:bot|system)(?:\s+doing)?$/i,

    // Tagalog
    /^(?:kamusta|kumusta)\s+(?:ang\s+)?(?:bot|system)/i,
    /^status\s+(?:ng\s+)?bot/i,
  ],

  // Help queries
  help: [
    /^(?:help|commands?|what\s+can\s+you\s+do)/i,
    /^(?:how\s+do\s+i|how\s+to)/i,
    /^show\s+me\s+(?:how|commands?|help|what\s+you\s+can\s+do)/i,
    /^show\s+me$/i,
    /^(?:list|show)\s+(?:all\s+)?commands?/i,
    /^(?:what\s+)?(?:commands?|features?)\s+(?:are\s+)?(?:available|do\s+you\s+have)/i,
    /^(?:i\s+need\s+)?help$/i,

    // Tagalog
    /^(?:tulong|help)\s+(?:po|naman|pls)?/i,
    /^(?:ano|anu)\s+(?:ang\s+)?(?:commands?|pwede)/i,
    /^(?:paano|how)\s+(?:ko\s+)?(?:gagamitin|to)/i,

    // Taglish
    /^(?:help|tulong)\s+(?:naman|please|pls)/i,
    /^(?:ano|what)\s+(?:commands?|pwede)/i,
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
   * @param {boolean} botMentioned - Whether the bot was explicitly mentioned
   * @returns {boolean} True if NLP should process
   */
  shouldProcess(message, botMentioned = false) {
    // Don't process bot messages
    if (message.author.bot) return false;

    // Don't process messages that start with ! (already a command)
    if (message.content.trim().startsWith('!')) return false;

    // Always allow when bot is explicitly mentioned (regardless of channel)
    if (botMentioned) return true;

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
   * @param {boolean} botMentioned - Whether the bot was explicitly mentioned
   * @returns {Object|null} Interpreted command or null
   */
  interpretMessage(message, botMentioned = false) {
    try {
      if (!this.shouldProcess(message, botMentioned)) return null;

      let content = message.content.trim();

      // Strip bot mentions from the beginning (e.g., "<@123456789> how many points")
      // This allows patterns to match properly when bot is mentioned
      content = content.replace(/^<@!?\d+>\s*/g, '').trim();

      // Normalize content for better matching
      content = this.normalizeContent(content);

      // Use priority order for pattern matching (more specific first)
      const commandsToCheck = NLP_CONFIG.patternPriority.length > 0
        ? NLP_CONFIG.patternPriority
        : Object.keys(NLP_PATTERNS);

      // Try each command pattern in priority order
      for (const command of commandsToCheck) {
        const patterns = NLP_PATTERNS[command];
        if (!patterns) continue; // Skip if pattern doesn't exist

        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match) {
            let params = match.slice(1); // Extract captured groups

            // Special parameter handling
            params = this.normalizeParams(command, params);

            return {
              command: `!${command}`,
              params,
              originalMessage: content,
              confidence: 1.0,
              source: 'nlp',
              matchedPattern: pattern.toString(),
            };
          }
        }
      }

      // No pattern matched
      return null;
    } catch (error) {
      console.error('❌ Error in NLP interpretMessage:', error);
      return null; // Fail gracefully
    }
  }

  /**
   * Normalize content for better pattern matching
   * @param {string} content - Message content
   * @returns {string} Normalized content
   */
  normalizeContent(content) {
    // Remove extra whitespace
    content = content.replace(/\s+/g, ' ').trim();

    // Handle common typos and variations
    content = content
      .replace(/whats/gi, "what's")
      .replace(/thats/gi, "that's")
      .replace(/hows/gi, "how's");

    return content;
  }

  /**
   * Normalize parameters based on command type
   * @param {string} command - Command name
   * @param {Array} params - Raw parameters
   * @returns {Array} Normalized parameters
   */
  normalizeParams(command, params) {
    try {
      // Extend command: normalize time units to minutes
      if (command === 'extend' && params.length >= 1) {
        const amount = parseInt(params[0], 10);
        const unit = params[1] ? params[1].toLowerCase() : 'minutes';
        let minutes = amount;

        // Convert seconds to minutes if needed
        if (unit.startsWith('sec') || unit === 's') {
          minutes = Math.max(1, Math.ceil(amount / 60));
        }

        return [String(minutes)];
      }

      // Engagement/prediction commands: normalize usernames
      if (['engagement', 'predictprice', 'predictattendance'].includes(command) && params.length >= 1) {
        params[0] = params[0].trim();
      }

      return params;
    } catch (error) {
      console.error(`❌ Error normalizing params for ${command}:`, error);
      return params; // Return original params on error
    }
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
    const isAdminLogs = message.channel.id === this.config.admin_logs_channel_id;

    // Silent interpretation in auction threads for common commands
    const silentInAuction = ['!bid', '!mypoints', '!bidstatus', '!loot'];
    if (isAuctionThread && silentInAuction.includes(command)) {
      return ''; // No explanation needed
    }

    // Silent interpretation in admin logs for admin commands
    const silentInAdmin = ['!status', '!startauction', '!pause', '!resume', '!stop', '!extend'];
    if (isAdminLogs && silentInAdmin.includes(command)) {
      return ''; // No explanation needed
    }

    // For other commands, provide brief feedback
    const commandName = command.replace('!', '');

    // Friendly context messages
    const contextMessages = {
      '!help': '📖 *Showing available commands...*',
      '!leaderboard': '🏆 *Fetching leaderboards...*',
      '!leaderboardattendance': '📊 *Fetching attendance rankings...*',
      '!leaderboardbidding': '💰 *Fetching bidding rankings...*',
      '!weeklyreport': '📅 *Generating weekly report...*',
      '!attendancestatus': '📋 *Checking attendance threads...*',
      '!predictspawn': '🔮 *Predicting next spawn...*',
      '!performance': '📊 *Checking bot performance...*',
      '!queuelist': '📜 *Showing auction queue...*',
    };

    return contextMessages[command] || `💡 *Interpreting as \`${command}\`*`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { NLPHandler, NLP_CONFIG, NLP_PATTERNS };
