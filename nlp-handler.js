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
    guildChat: false,         // Guild chat: ONLY when bot is @mentioned
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

    // Spawn predictions (specific before general)
    'predictspawn',

    // Bidding-specific
    'leaderboardbidding',
    'bidstatus',
    'mypoints',
    'bid',
    'loot',

    // Weekly reports
    'weeklyreport',

    // User engagement (specific before general)
    'engagement',
    'analyzeengagement',

    // Price predictions
    'predictprice',

    // Admin commands
    'startauction',
    'pause',
    'resume',
    'stop',
    'extend',
    'skipitem',
    'cancelitem',

    // Admin intelligence
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

    // Gaming terms
    /^(?:i(?:'ll|\s+will)\s+)?(?:put|throw\s+in|go)\s+(\d+)/i,
    /^(?:going|putting)\s+(\d+)\s+(?:on\s+(?:this|it))?/i,
    /^(\d+)\s+(?:here|for\s+(?:this|it|me))/i,
    /^(?:i\s+)?(?:call|raise)\s+(\d+)/i,
    /^(?:spend|use|drop)\s+(\d+)/i,

    // Tagalog (TL)
    /^(?:taya|lagay)\s+(?:ko\s+)?(\d+)/i,    // "taya 500" / "taya ko 500"
    /^(?:pusta|pustahan)\s+(?:ng\s+)?(\d+)/i, // "pusta 500" / "pustahan ng 500"
    /^(?:magtaya|maglagay)\s+(?:ako\s+)?(?:ng\s+)?(\d+)/i, // "magtaya 500"
    /^(?:ibabayad|ibabayad ko)\s+(\d+)/i,    // "ibabayad 500"
    /^(\d+)\s+(?:taya|pusta)/i,              // "500 taya"
    /^(?:gastos|gugulin)\s+(?:ko\s+)?(\d+)/i, // "gastos ko 500"

    // Taglish (code-switching)
    /^bid\s+(?:ko|na|ng)\s+(\d+)/i,          // "bid ko 500"
    /^(?:gusto|gusto kong)\s+(?:bid|mag-?bid)\s+(?:ng\s+)?(\d+)/i, // "gusto kong magbid ng 500"
    /^(?:ako|ako ay)\s+bid\s+(?:ng\s+)?(\d+)/i, // "ako bid 500"
    /^(\d+)\s+(?:lang|lang ako|muna)/i,      // "500 lang" / "500 muna"
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

    // Gaming currency terms
    /^(?:how\s+much|what(?:'s|\s+is)\s+my)\s+(?:currency|dkp|credits?|coins?|gold)/i,
    /^(?:my\s+)?(?:currency|dkp|credits?|coins?|gold|money|cash|wallet)$/i,
    /^(?:check|show)\s+(?:my\s+)?(?:currency|dkp|credits?|balance|wallet)/i,
    /^(?:what\s+)?(?:can\s+i|i\s+can)\s+(?:spend|afford|buy)/i,
    /^(?:how\s+much|what)\s+(?:do\s+i|can\s+i)\s+(?:have|spend|afford)/i,

    // Tagalog (TL)
    /^(?:ilang|ilan|lng|ilng)\s+(?:ang\s+)?points?\s+(?:ko|namin|ko\s+pa)/i,
    /^(?:magkano|magkanu|mgkano)\s+(?:ang\s+)?points?\s+ko/i,
    /^(?:tignan|tingnan|tngin|tingen)\s+(?:ang\s+)?points?\s+ko/i,
    /^(?:check|chek|cek)\s+points?\s+ko/i,
    /^points?\s+ko(?:\s+(?:ba|po|pls|please|naman))?/i,
    /^(?:pts?|balance)\s+ko/i,
    /^(?:pera|pondo|money|salapi)\s+ko/i,
    /^(?:natira|natitira|natitirang)\s+(?:points?|pts)/i, // "remaining points"
    /^(?:meron|may|mayroon)\s+(?:pa\s+)?(?:ako|akong)\s+(?:ilang|ilan)/i, // "meron pa ako ilang"
    /^(?:tira|titirang?)\s+(?:points?|ko)/i, // "tira ko"
    /^(?:ilan|ilang)\s+(?:pa|na|na\s+lang)/i, // "ilan pa"
    /^(?:pila|ilang)\s+(?:natira|naiwan)/i,  // "ilang natira"
    /^(?:magkano|ilang)\s+(?:pwede|kaya)\s+(?:ko|kong)\s+(?:gastusin|bilhin)/i, // "how much can i spend"

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
    /^(?:check\s+in|checkin|checking\s+in)/i,

    // Gaming terms
    /^(?:i(?:'m|\s+am)\s+)?(?:online|ready|available)/i,
    /^(?:i(?:'m|\s+am)\s+)?(?:in|at)\s+(?:the\s+)?(?:raid|spawn|boss)/i,
    /^(?:count\s+me\s+)?in/i,
    /^(?:i(?:'m|\s+am)\s+)?(?:joining|coming)/i,
    /^(?:i\s+)?(?:can\s+)?(?:attend|make\s+it|participate)/i,

    // Tagalog (TL)
    /^(?:nandito|andito)\s+(?:ako|na ako)/i,  // "nandito ako"
    /^(?:dumating|dumating na)\s+ako/i,       // "dumating ako"
    /^(?:present|nandito)/i,                  // "present"
    /^(?:sumama|sasama)\s+ako/i,              // "sumama ako" (join)
    /^(?:online|ready)\s+(?:na\s+)?ako/i,     // "online ako"

    // Taglish
    /^(?:present|here)\s+(?:ako|na|po)/i,     // "present ako" / "here na"
    /^(?:game|ready|online)\s+(?:na|ako)/i,   // "game na" / "ready ako"
    /^(?:sali|sama)\s+ako/i,                  // "sali ako" (join me)
  ],

  // Loot commands
  loot: [
    // Standard loot queries
    /^(?:show|check|view|display)\s+(?:the\s+)?loot/i,
    /^(?:what(?:'s|\s+is)\s+the\s+)?loot/i,
    /^loot\s+(?:list|info|details)/i,

    // Gaming terminology
    /^(?:show|check|view)\s+(?:the\s+)?(?:drops?|rewards?|items?)/i,
    /^(?:what(?:'s|\s+is)|what\s+are)\s+(?:the\s+)?(?:drops?|rewards?)/i,
    /^(?:what\s+)?(?:can\s+)?(?:i|we)\s+(?:get|win|obtain)/i,
    /^(?:what(?:'s|\s+is)|show)\s+(?:the\s+)?(?:prize|rewards?|goodies)/i,
    /^(?:show|list)\s+(?:available\s+)?(?:items?|gear|equipment)/i,

    // Tagalog
    /^(?:ano|anu)\s+(?:ang\s+)?(?:loot|drops?|rewards?)/i,
    /^(?:tignan|tingnan)\s+(?:ang\s+)?(?:loot|items?)/i,
    /^(?:ano|what)\s+(?:makukuha|nakuha)/i, // "what can get"

    // Taglish
    /^(?:show|pakita)\s+(?:yung|ang)\s+(?:loot|drops?|items?)/i,
    /^(?:ano|what)\s+(?:yung|ang)\s+(?:loot|drops?)/i,
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

    // Gaming terminology
    /^(?:what(?:'s|\s+is)|show)\s+(?:the\s+)?(?:current|active)\s+(?:item|loot|drop)/i,
    /^(?:what\s+are\s+we\s+)?(?:bidding\s+on|raiding)/i,
    /^(?:show|check)\s+(?:current|active)\s+(?:auction|bid|item)/i,

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

    // Gaming terminology - boss/raid related
    /^(?:when|what\s+time)\s+(?:is|will)\s+(?:the\s+)?(?:next|upcoming)\s+(?:boss|raid|rb|epic)/i,
    /^(?:next|upcoming)\s+(?:boss|raid|rb|epic|world\s+boss)(?:\s+(?:spawn|time))?/i,
    /^(?:when(?:'s|\s+is)|what\s+time)\s+(?:boss|raid|rb|epic)\s+(?:spawn|up|respawn)/i,
    /^(?:boss|raid|rb|epic)\s+(?:timer|schedule|window|respawn)/i,
    /^(?:when\s+)?(?:does|will)\s+(?:it|boss|rb)\s+(?:spawn|respawn|pop)/i,
    /^(?:respawn|spawn)\s+(?:time|timer|window)/i,

    // Tagalog
    /^(?:kailan|kalian)\s+(?:ang\s+)?(?:next|susunod)\s+(?:spawn|boss|raid)/i,
    /^next\s+(?:spawn|boss|raid)\s+(?:ba|po|naman)/i,
    /^(?:kelan|kailan)\s+(?:lalabas|lilitaw)\s+(?:ang\s+)?(?:boss|raid)/i,

    // Taglish
    /^(?:when|kailan)\s+(?:ba|po)\s+(?:next|susunod)\s+(?:spawn|boss|raid)/i,
    /^(?:spawn|boss|raid)\s+(?:time|timer)\s+(?:ba|naman)/i,
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

    // Gaming terms
    /^(?:most|top)\s+(?:active|dedicated|consistent)\s+(?:players?|members?|raiders?)/i,
    /^who\s+(?:shows\s+up|attends|participates)\s+(?:the\s+)?most/i,
    /^(?:show|list)\s+(?:top|best)\s+(?:raiders?|participants?)/i,

    // Tagalog
    /^(?:sino|who)\s+(?:ang\s+)?(?:may\s+)?(?:pinakamaraming|maraming)\s+attendance/i,
    /^attendance\s+(?:top|leaders?)\s+(?:ba|po|naman)?/i,
    /^(?:sino|who)\s+(?:ang\s+)?(?:pinaka-?sipag|sipag|aktibo)/i,

    // Taglish
    /^(?:show|pakita)\s+attendance\s+(?:leaderboard|top)/i,
    /^top\s+sa\s+attendance/i,
    /^(?:sino|who)\s+(?:yung|ang)\s+(?:top|nangunguna)\s+(?:sa\s+)?attendance/i,
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

    // Gaming terms
    /^(?:guild|clan)\s+(?:rankings?|stats?|leaderboard)/i,
    /^(?:show|view)\s+(?:guild|clan|team)\s+(?:members?|players?|roster)/i,
    /^(?:who(?:'s|\s+is)|show)\s+(?:the\s+)?(?:mvp|best|top\s+players?)/i,
    /^(?:hall\s+of\s+)?(?:fame|legends?)/i,

    // Tagalog
    /^(?:sino|who)\s+(?:ang\s+)?(?:nangungunang|nangunguna|nasa\s+top)/i,
    /^(?:tignan|tingnan)\s+(?:ang\s+)?(?:lahat\s+ng\s+)?(?:leaderboard|ranking)/i,
    /^(?:top|rank|ranking)(?:\s+(?:ba|naman|po))?$/i,
    /^(?:sino|who)\s+(?:ang\s+)?(?:mga\s+)?(?:mahuhusay|magagaling)/i, // "who are the skilled ones"

    // Taglish
    /^(?:sino|who)\s+(?:top|nangunguna|mvp)(?:\s+sa\s+lahat)?/i,
    /^(?:show|pakita)\s+(?:me\s+)?(?:the\s+)?(?:all\s+)?(?:ranking|leaderboards?)/i,
    /^(?:guild|clan)\s+(?:members?|players?|rankings?)/i,
  ],

  // Queue list
  queuelist: [
    /^(?:show|display|check|view)\s+(?:the\s+)?(?:auction\s+)?queue/i,
    /^(?:auction\s+)?queue\s+(?:list)?/i,
    /^(?:what(?:'s|\s+is)\s+in\s+the\s+)?queue/i,
    /^(?:what(?:'s|\s+is)|show)\s+(?:in\s+)?(?:the\s+)?(?:auction\s+)?(?:queue|lineup)/i,
    /^(?:list|show)\s+(?:all\s+)?(?:auction\s+)?items?/i,
    /^(?:what(?:'s|\s+is)|show)\s+(?:up\s+)?next/i,

    // Gaming terminology
    /^(?:show|list|check)\s+(?:all\s+)?(?:the\s+)?(?:loot|drops?|items?|rewards?)/i,
    /^(?:what\s+)?(?:items?|loot|drops?)\s+(?:are\s+)?(?:available|up|coming)/i,
    /^(?:show|view)\s+(?:the\s+)?(?:loot\s+)?(?:table|pool|list)/i,
    /^(?:what(?:'s|\s+is)|show)\s+(?:in\s+)?(?:the\s+)?(?:pot|pool)/i,
    /^(?:upcoming|next)\s+(?:items?|loot|auctions?)/i,

    // Tagalog
    /^(?:ano|anu)\s+(?:ang\s+)?(?:nasa\s+)?queue/i,
    /^(?:tignan|tingnan)\s+(?:ang\s+)?queue/i,
    /^(?:ilista|listahan)\s+(?:ng\s+)?(?:items?|loot)/i,
    /^(?:ano|anu)\s+(?:ang\s+)?(?:mga\s+)?(?:loot|items?)/i,

    // Taglish
    /^(?:show|pakita)\s+(?:yung|ang)\s+(?:queue|loot|items?)/i,
    /^(?:ano|what)\s+(?:ang\s+)?(?:next|susunod|nasa\s+queue)/i,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // INTELLIGENCE COMMANDS - Now Member-Accessible with Rich NLP Support!
  // ═══════════════════════════════════════════════════════════════════════════

  // Intelligence - Predict next spawn time (FILIPINO-FOCUSED)
  predictspawn: [
    // TAGALOG/BISAYA - General (PRIORITY - 80%)
    /^(?:kelan|kailan|kilan|kan-o|klan)\s+(?:na\s+)?(?:ang\s+)?(?:next|susunod|sunod)\s+(?:na\s+)?spawn/i,
    /^(?:kelan|kailan|kilan|kan-o)\s+(?:ang\s+)?(?:boss|spawn|mvp)/i,
    /^(?:kelan|kailan|kilan)\s+(?:ba|kaya|na|pa)\s+(?:ang\s+)?(?:boss|spawn|mvp)/i,
    /^(?:kelan|kailan)\s+(?:ulit|muli|uli)\s+(?:mag-?spawn|lalabas|dadating)/i,
    /^(?:may|meron|mern|mern\s+ba)\s+(?:ba\s+)?(?:spawn|boss|mvp)\s+(?:ba|na|pa)/i,
    /^(?:anong\s+oras|anu\s+oras|ano\s+oras|oras\s+na)\s+(?:ba\s+)?(?:ang\s+)?(?:next\s+)?spawn/i,
    /^(?:oras|time|sked)\s+(?:ng|ng\s+)?spawn/i,
    /^spawn\s+(?:time|oras|schedule|sked|kelan|kailan)/i,
    /^(?:kelan|kailan)\s+(?:pwede|dapat|kailangan)\s+(?:mag-?online|naka-?online|online)/i,
    /^(?:kelan|kailan)\s+(?:ko|ako)\s+(?:dapat|kailangan|need)\s+(?:mag-?online|online)/i,
    /^(?:lalabas|dadating|magsspawn|mag-?spawn|sasabog)\s+(?:ba|na|pa)\s+(?:ang\s+)?boss/i,
    /^(?:sasabog|lalabas|dadating|spawn)\s+(?:na\s+ba|ba|na)/i,
    /^(?:susugod|mag-?sugod|magpunta|punta)\s+(?:ba|na|tayo|ako|kami)/i,
    /^(?:laban|raid|hunt|gank)\s+(?:ba|na|tayo|ulit)/i,
    /^(?:anong|ano|anu)\s+(?:oras|time)\s+(?:ba|na|ng)\s+(?:spawn|boss|mvp)/i,
    /^(?:ilan|ilang|pila)\s+(?:oras|minuto|min)\s+(?:pa|na)/i,

    // TAGALOG - Specific boss
    /^(?:kelan|kailan|kilan)\s+(?:ang\s+)?(.+?)\s+(?:spawn|lalabas|dadating|sasabog)/i,
    /^(?:kelan|kailan)\s+(?:ba|kaya|na)\s+(?:yung|ang|si)\s+(.+?)/i,
    /^(.+?)\s+(?:kelan|kailan|anu\s+oras|anong\s+oras)/i,
    /^(.+?)\s+(?:lalabas|spawn|dadating)\s+(?:na\s+ba|ba|kelan|kailan)/i,
    /^(?:may|meron)\s+(?:ba\s+)?(.+?)\s+(?:later|mamaya|mamayang|bukas)/i,
    /^(.+?)\s+(?:na\s+ba|ba|na)/i,

    // TAGLISH (Filipino-English mix - 10%)
    /^(?:kelan|kailan)\s+(?:na\s+)?next\s+spawn/i,
    /^next\s+spawn\s+(?:kailan|kelan|na|ba)/i,
    /^(?:anong\s+time|anu\s+time|ano\s+time)\s+(?:yung|ang|ng)\s+spawn/i,
    /^spawn\s+(?:na|ba|kailan|kelan|anong\s+oras)/i,
    /^(?:kelan|kailan)\s+(?:yung|yang|ang)\s+(.+?)\s+spawn/i,
    /^(?:meron|may)\s+(?:bang\s+)?spawn\s+(?:later|mamaya|soon|mamayang)/i,
    /^(?:next|susunod)\s+boss\s+(?:kailan|kelan|anong\s+time)/i,
    /^boss\s+(?:na\s+ba|ba|kailan)/i,

    // ENGLISH - General (10% only)
    /^(?:when|what\s+time)\s+(?:is|does)\s+(?:the\s+)?next\s+(?:boss\s+)?spawn/i,
    /^next\s+spawn(?:\s+time)?/i,
    /^(?:any\s+)?boss\s+(?:coming|soon)/i,

    // ENGLISH - Specific boss
    /^(?:when|what\s+time)\s+(?:is|does|will)\s+(.+?)\s+spawn/i,
    /^(.+?)\s+spawn\s+time/i,
  ],

  // Intelligence - Predict item price (FILIPINO-FOCUSED)
  predictprice: [
    // TAGALOG - Price questions (PRIORITY - 80%)
    /^(?:magkano|magkanu|mkano|mgkano)\s+(?:kaya|ba|ang|yung|yang)\s+(.+)/i,
    /^(?:magkano|magkanu)\s+(?:na\s+)?(.+)/i,
    /^(?:presyo|halaga|value|bili)\s+(?:ng|para\s+sa|ng\s+)?(.+)/i,
    /^(?:ilang|ilan|pila)\s+(?:points?|pts|pesos)\s+(?:ang\s+)?(.+)/i,
    /^(?:ilang|ilan|pila)\s+(?:ang\s+)?(.+)/i,
    /^(?:hulaan|predict|estimate)\s+(?:price|presyo|halaga)\s+(?:ng|para\s+sa|ng\s+)?(.+)/i,
    /^(?:magkano|magkanu)\s+(?:dapat|pwede|kaya)\s+(?:ko|kong|naming)\s+(?:i-?bid|taya|ibid)\s+(?:sa|para\s+sa|sa\s+)?(.+)/i,
    /^(?:worth|halaga|value)\s+(?:ba|kaya)\s+(?:ng|ang)\s+(.+)/i,
    /^(?:sulit|mahal|mura)\s+(?:ba|kaya)\s+(?:ang\s+)?(.+)/i,
    /^(.+?)\s+(?:magkano|mkano|ilan|pila)/i,
    /^(.+?)\s+(?:worth|halaga|presyo|bili)/i,
    /^(?:ilan|ilang)\s+(?:ba|kaya)\s+(?:ang\s+)?(.+)/i,
    /^(?:ano|anu|anong)\s+(?:presyo|price|halaga)\s+(?:ng|ng\s+)?(.+)/i,
    /^(?:tignan|tingnan|check)\s+(?:presyo|price)\s+(?:ng|ng\s+)?(.+)/i,
    /^(?:abot|kaya|afford)\s+(?:ko|natin|ba)\s+(?:ang\s+)?(.+)/i,

    // TAGLISH (Filipino-English mix - 10%)
    /^(?:magkano|magkanu)\s+(?:kaya|ba)\s+ang\s+(.+)/i,
    /^price\s+(?:ng|para\s+sa|ng\s+)?(.+)/i,
    /^(?:ilang|ilan)\s+(?:ang|ba)\s+(?:price|presyo)\s+(?:ng|ng\s+)?(.+)/i,
    /^(.+?)\s+(?:magkano|worth|value|price)/i,
    /^(?:check|tignan)\s+price\s+(?:ng|ng\s+)?(.+)/i,
    /^worth\s+(?:ba|kaya)\s+(.+)/i,

    // ENGLISH (10% only)
    /^how\s+much\s+(?:is|should)\s+(.+)\s+(?:cost|worth)/i,
    /^(?:what(?:'s|\s+is))\s+(.+?)\s+worth/i,
    /^price\s+(?:of|for)\s+(.+)/i,
    /^(?:good|fair)\s+price\s+for\s+(.+)/i,
  ],

  // Intelligence - Predict attendance for user (FILIPINO-FOCUSED)
  predictattendance: [
    // TAGALOG - Attendance predictions (PRIORITY - 80%)
    /^(?:darating|dadalo|dadating|susugod|sasama|pupunta)\s+(?:ba|kaya|pa)\s+(?:si\s+)?(.+)/i,
    /^(?:pupunta|darating|dadalo)\s+(.+)\s+(?:ba|kaya)/i,
    /^(?:online|naka-?online|mag-?online)\s+(?:ba|kaya)\s+(?:si\s+)?(.+)/i,
    /^(?:si|yung|yang)\s+(.+?)\s+(?:darating|dadalo|susugod|online)\s+(?:ba|kaya)/i,
    /^(.+?)\s+(?:darating|dadalo|susugod|pupunta|online)\s+(?:ba|kaya|pa)/i,
    /^(?:predict|hulaan|tantiya)\s+(?:attendance|punta)\s+(?:ni|ng)\s+(.+)/i,
    /^(?:kasama|sama)\s+(?:ba|kaya)\s+(?:si\s+)?(.+)/i,
    /^(.+?)\s+(?:sasama|pupunta|online)\s+(?:ba|kaya)/i,
    /^(?:attend|dadalo)\s+(?:ba|kaya)\s+(.+)/i,
    /^(?:check|tignan)\s+(?:attendance|punta)\s+(?:ni|ng)\s+(.+)/i,

    // TAGLISH (10%)
    /^(?:darating|dadalo)\s+(?:ba|kaya)\s+si\s+(.+)/i,
    /^predict\s+(.+?)\s+attendance/i,
    /^(.+?)\s+dadalo\s+(?:ba|kaya)/i,
    /^online\s+(?:ba|kaya)\s+(.+)/i,

    // ENGLISH (10% only)
    /^(?:will|is)\s+(.+?)\s+(?:attend|come|join)/i,
    /^predict\s+attendance\s+(.+)/i,
  ],

  // Intelligence - Engagement analysis (FILIPINO-FOCUSED)
  engagement: [
    // TAGALOG - Self-check (PRIORITY - 50%)
    /^(?:kamusta|kumusta|kmusta)\s+(?:na\s+)?(?:ako|ko)/i,
    /^(?:ano|anu|anong)\s+(?:stats?|performance|score)\s+ko/i,
    /^(?:tignan|tingnan|check|tngin)\s+(?:stats?|engagement|performance)\s+ko/i,
    /^(?:stats?|engagement|activity|performance)\s+ko(?:\s+(?:ba|naman|please))?/i,
    /^(?:paano|pano|kumusta)\s+(?:na\s+)?(?:ako|performance\s+ko)/i,
    /^(?:ok|ayos|goods)\s+(?:ba|pa)\s+(?:ako|performance\s+ko)/i,
    /^(?:gano|gaano)\s+(?:ako|ko)\s+(?:ka-?active|active)/i,
    /^(?:mabuti|goods)\s+(?:ba|pa)\s+ako/i,

    // TAGALOG - Check others (30%)
    /^(?:tignan|tingnan|check|tngin)\s+(?:engagement|stats?|performance)\s+(?:ni|ng)\s+(.+)/i,
    /^(?:kamusta|kumusta|kmusta)\s+(?:si|ang|yung|yang)\s+(.+)/i,
    /^(?:kamusta|kumusta)\s+(?:na\s+)?(.+)/i,
    /^engagement\s+(?:ni|ng)\s+(.+)/i,
    /^(?:stats?|activity|performance)\s+(?:ni|ng)\s+(.+)/i,
    /^(?:ano|anu)\s+(?:stats?|performance)\s+(?:ni|ng)\s+(.+)/i,
    /^(.+?)\s+(?:kamusta|kumusta|ok\s+ba)/i,
    /^(?:ok|ayos|goods)\s+(?:ba|pa)\s+(?:si\s+)?(.+)/i,

    // TAGLISH (10%)
    /^(?:check|tingnan)\s+engagement\s+(?:ni|ng|ni\s+)?(.+)/i,
    /^(.+?)(?:'s|\s+)stats?\s+(?:naman|please)/i,
    /^(?:kamusta|kumusta)\s+(?:ang\s+)?engagement\s+(?:ni|ng)\s+(.+)/i,
    /^(?:show|pakita)\s+(?:stats?|engagement)\s+(?:ni|ng)\s+(.+)/i,
    /^(?:kamusta|kumusta)\s+ako/i,
    /^check\s+(?:stats?|engagement)\s+ko/i,
    /^my\s+(?:stats?|engagement)\s+naman/i,

    // ENGLISH (10% only)
    /^(?:my|check\s+my|show\s+my)\s+(?:engagement|stats?|activity|performance)/i,
    /^(?:how\s+am\s+i|how(?:'m|\s+am)\s+i)\s+doing/i,
    /^check\s+engagement\s+(.+)/i,
    /^(.+?)\s+engagement/i,
    /^how\s+engaged\s+is\s+(.+)/i,
  ],

  // Guild-wide engagement (FILIPINO-FOCUSED)
  analyzeengagement: [
    // TAGALOG (PRIORITY - 80%)
    /^(?:tignan|tingnan|check|tngin)\s+(?:engagement|stats?|performance)\s+(?:ng\s+lahat|overall|ng\s+buong\s+guild|lahat)/i,
    /^(?:lahat|buong\s+guild|guild)\s+(?:engagement|stats?|performance)/i,
    /^(?:sino|sinu|anu|ano)\s+(?:ang\s+)?(?:pinaka-?engaged|nangunguna|top|mataas)/i,
    /^(?:sino|sinu)\s+(?:ang\s+)?(?:nangunguna|nanalo|mataas)/i,
    /^(?:engagement|stats?|performance)\s+(?:ng\s+lahat|overall)/i,
    /^(?:lahat|everyone|all)\s+(?:na\s+)?(?:ba|naman)/i,
    /^(?:tignan|check)\s+(?:lahat|all|everyone)/i,
    /^guild\s+(?:stats?|engagement|performance)/i,

    // TAGLISH (10%)
    /^engagement\s+(?:ng\s+lahat|overall)/i,
    /^(?:check|tingnan)\s+(?:all|lahat)\s+engagement/i,
    /^(?:sino|who)\s+(?:top|nangunguna)\s+sa\s+engagement/i,
    /^guild\s+engagement/i,

    // ENGLISH (10% only)
    /^(?:show|check)\s+(?:guild|all|everyone)\s+engagement$/i,
    /^guild\s+(?:stats?|analytics)$/i,
    /^who(?:'s|\s+is)\s+top/i,
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

    // Gaming terms
    /^(?:bot\s+)?(?:guide|tutorial|instructions?)/i,
    /^(?:how\s+)?(?:does\s+)?(?:this|the\s+bot)\s+work/i,
    /^(?:i(?:'m|\s+am)\s+)?(?:lost|confused|new|noob|newbie)/i,

    // Tagalog
    /^(?:tulong|help)\s+(?:po|naman|pls)?/i,
    /^(?:ano|anu)\s+(?:ang\s+)?(?:commands?|pwede)/i,
    /^(?:paano|how)\s+(?:ko\s+)?(?:gagamitin|to)/i,
    /^(?:bago|baguhan|newbie)\s+(?:ako|po)/i, // "i'm new"

    // Taglish
    /^(?:help|tulong)\s+(?:naman|please|pls)/i,
    /^(?:ano|what)\s+(?:commands?|pwede)/i,
    /^(?:bano|noob|newbie)\s+(?:ako|pa\s+ako)/i, // "i'm a noob"
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

    // Enable in admin logs and auction threads (always active)
    if (NLP_CONFIG.enabledChannels.adminLogs && isAdminLogs) return true;
    if (NLP_CONFIG.enabledChannels.auctionThreads && isAuctionThread) return true;

    // Guild chat: ONLY when bot is mentioned (handled by botMentioned check above)

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

      // Context-aware interpretation: "status" in admin-logs = attendance status
      const isAdminLogs = message.channel.id === this.config.admin_logs_channel_id ||
                          (message.channel.isThread() && message.channel.parentId === this.config.admin_logs_channel_id);

      // If in admin-logs and user says just "status", map to attendance status
      if (isAdminLogs && /^status$/i.test(content)) {
        console.log('🧠 [NLP Context] "status" in admin-logs → attendancestatus');
        return {
          command: '!attendancestatus',
          params: [],
          originalMessage: content,
          confidence: 1.0,
          source: 'nlp-context',
          matchedPattern: 'admin-logs context rule',
        };
      }

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
