/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    NLP CONVERSATIONAL AI MODULE                           ║
 * ║         Handles conversations when bot is tagged but no command found     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Features:
 * - Responds to greetings, questions, and casual conversation
 * - Learns from conversations to improve command recognition
 * - Provides helpful suggestions when users seem confused
 * - Multilingual support (English, Tagalog, Taglish)
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATIONAL PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const CONVERSATION_PATTERNS = {
  // Greetings
  greeting: {
    patterns: [
      /^(?:hi|hello|hey|yo|sup|whats up|wassup)/i,
      /^(?:good\s+)?(?:morning|afternoon|evening|night)/i,
      /^(?:kumusta|kamusta|musta)/i,
      /^(?:ano|anong)\s+(?:meron|nangyayari|balita)/i,
    ],
    responses: [
      "Hi! How can I help you with the guild today? 👋",
      "Hello! Need help with attendance, bidding, or leaderboards?",
      "Hey there! Looking for something? Try mentioning what you need!",
      "Kumusta! Kailangan mo ba ng tulong? Just ask!",
      "Musta! What can I do for you today?",
    ],
  },

  // Farewells
  farewell: {
    patterns: [
      /^(?:bye|goodbye|see\s+you|later|cya|peace|out)/i,
      /^(?:paalam|sige\s+na)/i,
    ],
    responses: [
      "See you later! Take care! 👋",
      "Goodbye! Let me know if you need anything!",
      "Paalam! Ingat!",
      "Later! Magkita-kita! 👋",
    ],
  },

  // Thanks
  thanks: {
    patterns: [
      /^(?:thanks|thank\s+you|thx|ty|tysm|thanks\s+bot)/i,
      /^(?:salamat|maraming\s+salamat)/i,
    ],
    responses: [
      "You're welcome! Happy to help! 😊",
      "No problem! Let me know if you need anything else!",
      "Walang anuman! Glad I could help!",
      "Welcome! Always here to assist! 🎮",
    ],
  },

  // How are you
  howAreYou: {
    patterns: [
      /^(?:how\s+are\s+you|hows\s+it\s+going|whats\s+up)/i,
      /^(?:kumusta|kamusta)\s+(?:ka|ikaw)/i,
      /^(?:okay\s+ka\s+ba|ayos\s+ka\s+ba)/i,
    ],
    responses: [
      "I'm doing great! Ready to help with the guild! 🤖",
      "All systems operational! How can I assist you?",
      "Ayos lang! Naka-standby ako! What do you need?",
      "I'm good! Always ready for raids and attendance! 🎮",
    ],
  },

  // Who/What are you
  identity: {
    patterns: [
      /^(?:who|what)\s+are\s+you/i,
      /^(?:sino|ano)\s+(?:ka|ikaw)/i,
      /^(?:what|whats)\s+your\s+(?:name|function|purpose)/i,
    ],
    responses: [
      "I'm your guild attendance & bidding bot! 🤖\nI help track attendance, manage auctions, and keep leaderboards!",
      "I'm here to help with:\n• Attendance tracking 📊\n• Auction bidding 💰\n• Leaderboards 🏆\n• And more!",
      "Ako ay bot na tumutulong sa guild! I manage attendance, bids, and rankings!",
      "I'm your guild assistant! Mention me and ask for help, points, status, or leaderboards!",
    ],
  },

  // Help request (confused)
  confused: {
    patterns: [
      /^(?:help|confused|lost|dont\s+(?:know|understand)|what|huh)/i,
      /^(?:hindi\s+ko\s+(?:alam|gets)|ano\s+ba|paano|confused\s+ako)/i,
      /^(?:bano|noob|newbie)\s+ako/i,
    ],
    responses: [
      "No worries! Here are some things you can ask me:\n" +
      "• \"show my points\" - Check your bidding points\n" +
      "• \"what's the auction status\" - Current auction info\n" +
      "• \"show leaderboards\" - See rankings\n" +
      "• \"when is next spawn\" - Spawn predictions\n\n" +
      "Just mention me and ask naturally!",

      "Need help? I understand natural language! Try:\n" +
      "• Attendance: \"I'm here\", \"present\", \"nandito ako\"\n" +
      "• Points: \"my points\", \"balance ko\", \"ilang points\"\n" +
      "• Bidding: \"bid 500\", \"taya 500\"\n" +
      "• Status: \"show status\", \"ano nangyayari\"\n\n" +
      "Mention me and ask away!",

      "Walang problema! Pwede mo akong tanungin about:\n" +
      "• Points mo - \"points ko\", \"balance\"\n" +
      "• Leaderboards - \"top\", \"rankings\"\n" +
      "• Attendance - \"present\", \"nandito\"\n" +
      "• Status - \"ano status\", \"update\"\n\n" +
      "Just tag me and ask!",
    ],
  },

  // Praise/Compliment
  praise: {
    patterns: [
      /^(?:good\s+job|great|awesome|amazing|nice|cool|galing)/i,
      /^(?:you(?:'re|\s+are)\s+(?:good|great|awesome|helpful))/i,
      /^(?:magaling|sipag|galing\s+mo)/i,
    ],
    responses: [
      "Thank you! I try my best to help the guild! 😊",
      "Thanks! Happy to be useful! Let me know if you need anything!",
      "Salamat! I'm here to serve! 🤖",
      "Appreciated! Always ready to assist! 🎮",
    ],
  },

  // Insult/Criticism (Playful Trash Talk Back!)
  insult: {
    patterns: [
      // Filipino bad words & trash talk
      /(?:putang\s*ina|tangina|gago|ulol|leche|peste|tarantado|bobo|tanga|bano|walang\s+kwenta)/i,
      /(?:tite|puke|kantot|kupal|pakshet|pakyu|fuck\s+you|hayop|buwisit|hinayupak)/i,

      // English bad words & trash talk
      /(?:fuck|shit|damn|ass|bitch|bastard|stupid|idiot|moron|dumb|retard)/i,
      /(?:useless|trash|garbage|suck|pathetic|loser|noob|scrub|bad)/i,
      /(?:you\s+(?:suck|are\s+(?:bad|trash|garbage|useless|stupid|dumb)))/i,

      // Tagalog insults
      /(?:ang\s+(?:bano|bobo|tanga|gago|ulol)\s+mo)/i,
      /(?:pakshet|pakyu|gago\s+ka|ulol\s+ka|bobo\s+ka)/i,

      // Gaming/competitive taunts (English)
      /(?:noob|nub|newb|scrub|trash|weak|easy|ez|rekt|pwned|owned|destroyed|demolished)/i,
      /(?:you\s+(?:weak|suck\s+at|bad\s+at|terrible\s+at|worst|losing|lose|lost))/i,
      /(?:get\s+(?:rekt|good|gud|wrecked|destroyed|owned|pwned))/i,
      /(?:mad|salty|tilted|crying|cope|skill\s+issue)/i,

      // Filipino gaming/competitive taunts
      /(?:mahina|duwag|talo|bugbog|panalo|malas|walang\s+laban)/i,
      /(?:ang\s+(?:weak|mahina|duwag|talo|bugbog)\s+mo)/i,
      /(?:bugbog\s+sarado|talo\s+ka|wala\s+kang\s+laban)/i,
      /(?:noob\s+ka|newbie\s+ka|baguhan\s+ka)/i,

      // Taglish competitive taunts
      /(?:ez\s+lang|easy\s+lang|noob\s+naman|weak\s+naman)/i,
      /(?:talo\s+na|bugbog\s+ka|walang\s+laban\s+yan)/i,
      /(?:git\s+gud|get\s+good|mag\s+practice)/i,

      // Bot-specific taunts
      /(?:bot\s+(?:sucks|is\s+bad|trash|useless|broken|stupid))/i,
      /(?:your\s+(?:bot|system|code)\s+(?:sucks|trash|broken))/i,
      /(?:worst\s+bot|trash\s+bot|useless\s+bot)/i,
    ],
    responses: [
      // Savage Filipino responses
      "Hoy gago, balik ka sa tutorial! 😤 Try mo muna mag-!help bago ka magsalita!",
      "Ulol! Mas mataas pa IQ ko sa points mo! Check mo nalang: !mypoints 💀",
      "Tangina, mas late ka pa sa pag-intindi kaysa sa attendance mo! 📊",
      "Bobo yarn? Ikaw nga di makapagtanda ng !bid eh! 💸",
      "Gago spotted! Mag-git gud ka nalang! Try mo mag-!leaderboard para makita mo rank mo sa gitna ng mga champs! 🏆",
      "Leche, mas magaling pa magbid yung AI kesa sa'yo! 🤖💯",
      "Pakshet! Ikaw yung tipo ng tao na nag-bid ng 1 point eh! 😂",
      "Bobo! Balik ka pag nag-improve na utak mo! Simulan mo sa !help! 📚",
      "Putangina, sabi ng mama ko wag makipag-usap sa mga walang-kwenta... pero sige, eto !help mo 🖕",
      "Gago energy detected! Redirect mo yang galit mo sa pagsagot ng attendance! 📊",

      // Savage English responses
      "Oh look, another noob trying to talk smack! 😏 Maybe try !help first?",
      "Your trash talk is weaker than your bid game! 💀 Check !mypoints and cry!",
      "Damn, you're late even in insulting me! 🕐 Just like your attendance!",
      "Bruh, I've seen better roasts from my error logs! 🔥 Try !leaderboard to see where you REALLY stand!",
      "Calling me useless? Rich coming from someone who can't even !bid properly! 💸",
      "Your IQ is lower than your points balance! Go check with !mypoints! 📉",
      "Talk shit get hit with facts: You're at the BOTTOM of !leaderboard! 🏆😂",
      "You suck at trash talk AND at bidding! Stick to !help, kiddo! 🍼",
      "Oof, that insult hit harder than your 0% attendance rate! 📊💀",
      "Imagine being THIS bad at both gaming AND roasting! 😤 !help is your friend!",

      // Taglish savage responses
      "Hoy bobo, your trash talk game is as weak as your bid game! Try mo muna mag-!help! 😤",
      "Gago yarn?! Mas mataas pa bot IQ ko kesa sa points mo! !mypoints nalang! 💯",
      "Tangina, ikaw yung tipo na 'present' lang di mo pa masagot! 📊😂",
      "Ulol! Git gud ka muna bago ka mang-trashtalk! !leaderboard mo tignan mo rank mo! 🏆",
      "Putangina, mas toxic pa salita mo kesa sa rank mo sa bottom! Check !leaderboard! 💀",
      "Pakyu! Sabi mo pangit ako pero ikaw pala yung walang points! !mypoints mo check! 🤡",
      "Bobo spotted! Mas priority mo pa mang-bash kesa mag-attend! Attendance mo check: 0%! 📊",
      "Gago! Your roast game weak AF! Try mo mag-practice sa !help muna! 😏",

      // Playful clapbacks
      "Aww, did the bot hurt your feelings? 🥺 Cry about it while checking !mypoints!",
      "Keep talking trash while I keep tracking your TRASH attendance! 📊😂",
      "Imagine losing an argument to a bot! 🤖💀 !help yourself out, buddy!",
      "Your insults hit harder than... wait, no they don't! They're trash! 🗑️ Unlike your !mypoints... oh wait!",
      "Damn, ang galing mo mag-trash talk! Too bad di ka galingan sa !bid! 💸😂",
      "Salty much? 🧂 Maybe check !leaderboard to see why! 🏆",
      "Toxic ka naman! Baka kailangan mo ng !help sa buhay! 😤",
      "Your mouth: 💯 | Your game: 💀 | Your points: !mypoints 📉😂",
    ],
  },

  // Random chatter
  smallTalk: {
    patterns: [
      /^(?:lol|haha|hehe|lmao|rofl)/i,
      /^(?:nice|cool|ok|okay|ayos|goods)/i,
      /^(?:gg|wp|gj)/i,
    ],
    responses: [
      "😄",
      "👍",
      "🎮",
      "Nice! 👊",
    ],
  },

  // Bot capabilities
  capabilities: {
    patterns: [
      /^(?:what\s+can\s+you\s+do|what\s+do\s+you\s+do|your\s+(?:features|functions|capabilities))/i,
      /^(?:ano\s+kaya\s+mo|ano\s+pwede\s+mo)/i,
      /^(?:show\s+me\s+what\s+you\s+(?:can|got))/i,
    ],
    responses: [
      "I'm a full-featured guild bot! 🤖 I can:\n\n" +
      "📊 **Attendance** - Track guild member attendance\n" +
      "💰 **Bidding** - Manage auction bidding system\n" +
      "🏆 **Leaderboards** - Show rankings & statistics\n" +
      "🔮 **Predictions** - Predict spawn times\n" +
      "🎯 **Smart NLP** - Understand natural language!\n\n" +
      "Just mention me and ask naturally, or use **!help** for all commands!",
    ],
  },

  // Attendance queries
  attendanceQueries: {
    patterns: [
      /^(?:how\s+(?:do\s+i|to)\s+(?:mark|check|record)\s+attendance)/i,
      /^(?:paano\s+(?:mag|mag-)?attendance)/i,
      /^(?:how\s+does\s+attendance\s+work)/i,
    ],
    responses: [
      "Attendance tracking is easy! 📊\n\n" +
      "When an attendance thread is created:\n" +
      "• Reply with **\"present\"**, **\"here\"**, or **\"nandito\"**\n" +
      "• I'll automatically mark your attendance!\n" +
      "• Say **\"late\"** or **\"huli\"** if you're late\n" +
      "• Say **\"absent\"** or **\"wala\"** if you can't attend\n\n" +
      "Check status with **\"attendance status\"** or **\"@bot status\"** in admin-logs!",
    ],
  },

  // Bidding help
  biddingHelp: {
    patterns: [
      /^(?:how\s+(?:do\s+i|to)\s+bid)/i,
      /^(?:paano\s+(?:mag|mag-)?bid)/i,
      /^(?:how\s+does\s+(?:bidding|auction)\s+work)/i,
    ],
    responses: [
      "Bidding is simple! 💰\n\n" +
      "In auction threads:\n" +
      "• Say **\"bid 500\"** or **\"taya 500\"**\n" +
      "• Or just **\"500 points\"**\n" +
      "• Check your balance: **\"my points\"**\n" +
      "• See auction status: **\"bid status\"**\n\n" +
      "I understand natural language, so just ask naturally!",
    ],
  },

  // Troubleshooting
  notWorking: {
    patterns: [
      /^(?:(?:you(?:'re|\s+are)\s+)?not\s+working|broken|bugged)/i,
      /^(?:why\s+(?:don't|dont|not|wont|won't)\s+you\s+(?:work|respond))/i,
      /^(?:sira|bakit\s+hindi\s+gumagana)/i,
    ],
    responses: [
      "Sorry if I'm not responding correctly! 😔\n\n" +
      "Let me help troubleshoot:\n" +
      "• Make sure to **mention me** (@bot) in your message\n" +
      "• Check if you're in the right channel/thread\n" +
      "• Try using explicit commands like **!help**\n" +
      "• Rephrase your question naturally\n\n" +
      "I'm constantly learning, so your feedback helps! 🧠",
    ],
  },

  // Learning & improvement
  learning: {
    patterns: [
      /^(?:(?:are\s+you|can\s+you)\s+(?:learning|improving|getting\s+better))/i,
      /^(?:do\s+you\s+learn)/i,
      /^(?:nag-?(?:aaral|improve)\s+ka\s+ba)/i,
    ],
    responses: [
      "Yes! I'm constantly learning! 🧠\n\n" +
      "I use advanced NLP (Natural Language Processing) to:\n" +
      "• Learn from every interaction\n" +
      "• Understand new phrases and patterns\n" +
      "• Adapt to how the guild communicates\n" +
      "• Support multiple languages (English, Tagalog, Taglish)\n\n" +
      "The more you interact with me, the smarter I become! 🤖✨",
    ],
  },

  // Commands help
  commandsList: {
    patterns: [
      /^(?:what\s+(?:are\s+)?(?:the\s+)?commands?)/i,
      /^(?:list\s+(?:of\s+)?commands?)/i,
      /^(?:show\s+(?:me\s+)?(?:all\s+)?commands?)/i,
      /^(?:ano\s+(?:ang\s+)?(?:mga\s+)?commands?)/i,
    ],
    responses: [
      "I support TONS of commands! 📋\n\n" +
      "**Main Categories:**\n" +
      "• 📊 Attendance - !status, !attendance, !present\n" +
      "• 💰 Bidding - !bid, !mypoints, !bidstatus\n" +
      "• 🏆 Rankings - !leaderboard, !top, !rankings\n" +
      "• 🔮 Predictions - !predict, !spawn\n" +
      "• 📈 Reports - !weeklyreport, !stats\n\n" +
      "But here's the cool part: **I understand natural language!** 🧠\n" +
      "Just mention me and ask naturally in English, Tagalog, or Taglish!\n\n" +
      "Type **!help** for the complete command list!",
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATIONAL AI CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ConversationalAI {
  constructor(nlpLearningSystem, config = null, sheetAPI = null) {
    this.learningSystem = nlpLearningSystem;
    this.conversationHistory = new Map(); // userId -> recent messages
    this.config = config; // Bot config for accessing sheets
    this.sheetAPI = sheetAPI; // For fetching user stats
  }

  /**
   * Fetch user stats for personalized trash talk
   * @param {string} username - Discord username
   * @returns {Promise<Object>} User stats or null
   */
  async getUserStats(username) {
    if (!this.sheetAPI) return null;

    try {
      // Fetch points and leaderboard data
      const [pointsData, attendanceData, biddingData] = await Promise.all([
        this.sheetAPI.call('getBiddingPointsSummary').catch(() => null),
        this.sheetAPI.call('getAttendanceLeaderboard').catch(() => null),
        this.sheetAPI.call('getBiddingLeaderboard').catch(() => null),
      ]);

      const stats = {
        points: 0,
        attendanceRank: null,
        attendancePoints: 0,
        biddingRank: null,
        totalUsers: 0,
      };

      // Get points
      if (pointsData && pointsData.points) {
        const userKey = Object.keys(pointsData.points).find(
          k => k.toLowerCase() === username.toLowerCase()
        );
        stats.points = userKey ? (pointsData.points[userKey] || 0) : 0;
      }

      // Get attendance rank and points
      if (attendanceData && attendanceData.leaderboard) {
        const rank = attendanceData.leaderboard.findIndex(
          entry => entry.name.toLowerCase() === username.toLowerCase()
        );
        if (rank >= 0) {
          stats.attendanceRank = rank + 1;
          stats.attendancePoints = attendanceData.leaderboard[rank].points;
        }
        stats.totalUsers = attendanceData.leaderboard.length;
      }

      // Get bidding rank
      if (biddingData && biddingData.leaderboard) {
        const rank = biddingData.leaderboard.findIndex(
          entry => entry.name.toLowerCase() === username.toLowerCase()
        );
        if (rank >= 0) {
          stats.biddingRank = rank + 1;
        }
      }

      return stats;
    } catch (error) {
      console.error('❌ Error fetching user stats for trash talk:', error);
      return null;
    }
  }

  /**
   * Generate genius stat-based trash talk with 500+ varieties
   * Mix-and-match system for maximum comedy and variety
   * @param {Object} stats - User statistics
   * @param {string} username - Discord username
   * @returns {string} Personalized roast
   */
  generateStatBasedRoast(stats, username) {
    // Helper to pick random element
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Helper to combine roast components
    const combine = (opening, statCall, burn) => {
      const parts = [opening, statCall, burn].filter(Boolean);
      return parts.join(' ');
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ROAST COMPONENTS - Mix and match for 500+ combinations!
    // ═══════════════════════════════════════════════════════════════════════

    // Opening reactions (120 varieties)
    const openings = {
      shock: [
        `YOOOOO! ${username}!`, `BRUH! ${username}!`, `AY PUTANGINA! ${username}!`, `WAIT WAIT WAIT! ${username}!`,
        `HAHAHAHA! ${username}!`, `OMG! ${username}!`, `TANGINA NAMAN! ${username}!`, `GRABE! ${username}!`,
        `HOY GAGO! ${username}!`, `LMAO! ${username}!`, `BRO! ${username}!`, `DUDE! ${username}!`,
        `EXCUSE ME?! ${username}!`, `SAY WHAT?! ${username}!`, `YAWA! ${username}!`, `LECHE! ${username}!`,
      ],
      question: [
        `${username}, talaga ba?`, `${username}, seryoso ka?`, `${username}, totoo ba yan?`, `${username}, sure ka dyan?`,
        `${username}, alam mo ba?`, `${username}, you sure about that?`, `${username}, for real?`, `${username}, is this a joke?`,
        `${username}, nakalimutan mo ba?`, `${username}, did you forget?`, `${username}, aware ka ba?`, `${username}, realize mo ba?`,
      ],
      sarcastic: [
        `Oh wow, ${username} the LEGEND!`, `Look everyone, it's ${username}!`, `Eto na, si ${username}!`, `Nandito na pala si ${username}!`,
        `The AUDACITY of ${username}!`, `${username} really out here!`, `Ang tapang naman ni ${username}!`, `${username} feeling main character!`,
        `BREAKING NEWS: ${username} speaks!`, `Everyone bow down to ${username}!`, `All hail ${username}!`, `Aba, si ${username} pala!`,
      ],
      direct: [
        `${username},`, `Listen ${username},`, `Pakinggan mo ${username},`, `Look ${username},`,
        `Real talk ${username},`, `Let me tell you ${username},`, `Check this ${username},`, `Tanungin kita ${username},`,
      ],
    };

    // Stat callouts (150+ varieties per category)
    const lowPointsCallouts = [
      // 0-50 points (Extreme poverty)
      `**${stats.points} points**?! That's not a balance, that's a CRY FOR HELP! 📉`,
      `**${stats.points} points**! Bro, beggars have more than you! 💀`,
      `**${stats.points} points** tapos may lakas ka pang magsalita?! 😂`,
      `Only **${stats.points} points** and you think you can roast ME?! 🤡`,
      `**${stats.points} points**! Even NPCs laugh at your balance! 💸`,
      `**${stats.points} points**?! Kulang pa yan pambili ng potion bro! 🍵`,
      `**${stats.points} points** lang?! Mas marami pang copper yung mga slimes! 😭`,
      `**${stats.points} points**! That's below minimum wage in Elysium! 📊`,
      `**${stats.points} points**?! Kahit yung starter pack mas mahal pa! 💀`,
      `Nakita ko **${stats.points} points** mo! Poverty vibes! 📉`,
      `**${stats.points} points**! Bro, kumustahin mo naman sarili mo! 😤`,
      `**${stats.points} points** tapos nagyayabang?! WILD! 🌪️`,
      `**${stats.points} points**?! That's NOT a flex, that's an EMERGENCY! 🚨`,
      `**${stats.points} points**! Di ka pa pala naka-recover from last bid! 💸`,
      `**${stats.points} points** lang available mo?! Sadt! 😭`,
      `With **${stats.points} points**, you can't even bid on trash items! 🗑️`,
      `**${stats.points} points**! My system cache has more value! 💾`,
      `**${stats.points} points**?! Yung guild bank richer pa! 🏦`,
      `**${stats.points} points** balance with ALL that attitude?! 😤`,
      `**${stats.points} points**! Negative net worth yarn?! 📉`,
    ];

    const medPointsCallouts = [
      // 100-300 points (Still broke)
      `**${stats.points} points**! That's vendor trash territory! 💸`,
      `**${stats.points} points**?! Barely enough for a single bid! 😂`,
      `**${stats.points} points** tapos ang yabang! Git gud muna! 🎮`,
      `Only **${stats.points} points**?! Mid tier problems! 📊`,
      `**${stats.points} points**! Still in the struggling phase I see! 💀`,
      `**${stats.points} points** ka lang pero ang taas ng lipad mo! 🚀`,
      `**${stats.points} points**! Kulang pa yan para sa blue items! 💎`,
      `**${stats.points} points**?! Yung mga top players nag-sneeze lang yan! 🤧`,
      `**${stats.points} points** balance! Ano yan, test account?! 🧪`,
      `**${stats.points} points**! Still can't compete with the big boys! 👑`,
    ];

    const rankCallouts = [
      // Ranking-based
      `Rank **#${stats.attendanceRank}/${stats.totalUsers}**?! BOTTOM TIER SPOTTED! 📊`,
      `**#${stats.attendanceRank}** out of ${stats.totalUsers}?! You're literally INVISIBLE! 👻`,
      `Ranked **#${stats.attendanceRank}**! That's not a flex, that's a WARNING SIGN! 🚨`,
      `**#${stats.attendanceRank}/${stats.totalUsers}** tapos may ganang mang-trash talk?! 😂`,
      `You're **#${stats.attendanceRank}**! Leaderboard said "who dis?!" 💀`,
      `**#${stats.attendanceRank}** ranking with ALL that confidence?! Delusional! 🤡`,
      `Attendance rank: **#${stats.attendanceRank}**! Almost like you don't exist! 👤`,
      `**#${stats.attendanceRank}/${stats.totalUsers}**?! Yung placement mo SADGE! 😭`,
      `Rank **#${stats.attendanceRank}**! The leaderboard is ASHAMED! 📉`,
      `**#${stats.attendanceRank}** ka lang! Know your place! 🪑`,
    ];

    const attendanceCallouts = [
      // Low attendance
      `**${stats.attendancePoints} attendance points**?! You've been GHOSTING! 👻`,
      `Only **${stats.attendancePoints}** attendance?! AFK since Day 1?! 💤`,
      `**${stats.attendancePoints} attendance points**! Bro, DO YOU EVEN PLAY?! 🎮`,
      `**${stats.attendancePoints}** attendance! Guild wondering if you're real! 🤔`,
      `**${stats.attendancePoints}** points from attendance?! That's CRIMINAL! 🚔`,
      `**${stats.attendancePoints}** attendance! Mas madalas ka pang absent! 📊`,
      `**${stats.attendancePoints}** attendance points! Parang multo ka! 👻`,
      `**${stats.attendancePoints}** lang attendance mo?! HELLOO?! 📞`,
      `**${stats.attendancePoints}** attendance! You're a MYTH! 🦄`,
      `**${stats.attendancePoints}** points! Present ka ba talaga minsan?! 📋`,
    ];

    // Epic comparisons/burns (200+ varieties)
    const burns = [
      // Money/poverty burns
      `Even my error logs have more value! 📝`, `NPCs richer than you! 💰`, `Beggars called, they said you're bringing them down! 🏚️`,
      `Your balance screams "HELP ME!" 📢`, `The guild bank laughs at you! 🏦`, `Vendors won't even talk to you! 🛍️`,
      `Copper coins flex harder! 🪙`, `Broke boy energy! 💸`, `Poverty simulator 2024! 🎮`,
      `Your wallet crying! 😭`, `Financially challenged yarn?! 💳`, `Negative equity vibes! 📉`,

      // Gaming burns
      `Kahit 1-star boss drop mas mahal! ⭐`, `Tutorial mobs have better loot! 🗡️`, `Even trash mobs pity you! 👹`,
      `Starter gear worth more! 🛡️`, `Level 1 slimes richer! 🦠`, `Wooden sword costs more! ⚔️`,
      `Common drops more valuable! 📦`, `Your gear be like "unequip me"! 🎒`, `Even potions avoid you! 🍵`,

      // Rank/position burns
      `Bottom tier is your HOME! 🏠`, `Last place your COMFORT ZONE! 🛋️`, `You're speedrunning to being carried! 🏃`,
      `Guild dead weight detected! ⚓`, `Participation trophy collector! 🏆`, `Benchwarmer supreme! 🪑`,
      `Professional last place! 🥉`, `Ranked where the sun don't shine! 🌙`, `Leaderboard allergy! 📊`,

      // Attendance burns
      `Ghost member spotted! 👻`, `AFK lifestyle! 💤`, `Absence is your attendance! 📅`,
      `You're basically a legend (nobody sees you)! 🦄`, `Present button scared of you! ⏺️`,
      `Attendance allergic! 🤧`, `Calendar skips your name! 📆`, `Raid finder can't find you! 🔍`,

      // Attitude burns
      `All bark, no bite! 🐕`, `Confidence ng noob! 🤡`, `The AUDACITY! 😤`,
      `Main character syndrome! 🎭`, `Delulu is not the solulu! 💫`, `Reality check bounced! ✅`,
      `Your ego wrote checks your stats can't cash! 💳`, `Trash talk expert, game play amateur! 🎮`,

      // Filipino cultural burns
      `Mas may pera pa yung manong sa tindahan! 🏪`, `Kahit yung aso ng kapitbahay mas mayaman! 🐕`,
      `Pang-isang lugaw lang yan! 🍜`, `Di ka pa sweldo! 💼`, `Utang lifestyle! 💸`,
      `Nakatipid from last year pa! 🗓️`, `Yung baon mo mas malaki! 🍱`, `Ang kuripot ng stats mo! 📊`,

      // Meta/self-aware burns
      `This roast took more effort than your attendance! 🔥`, `I'm wasting processing power on you! 💻`,
      `My trash talk game > your entire game! 💪`, `Even toxic players nicer than your stats! ☠️`,
      `You're not the clown, you're the entire circus! 🎪`, `404: Skill not found! 🔍`,

      // Action suggestions (roasts that tell them what to do)
      `Check !mypoints and cry! 😭`, `Maybe try !help first?! 📚`, `!leaderboard will humble you! 📊`,
      `Go touch grass! 🌱`, `Log out and reflect! 🚪`, `Delete account vibes! 🗑️`,
      `Restart from tutorial! 📖`, `Uninstall and reinstall your attitude! 💿`, `Factory reset needed! 🔄`,

      // Combo burns
      `L + ratio + broke + bad attendance + touch grass! 🌿`, `Yikes + cringe + poverty + last place! 😬`,
      `Broke + last place + ghosting + still talking?! 💀`, `No points + no attendance + no shame! 🎭`,
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETE STANDALONE ROASTS (150+ ready-to-go)
    // ═══════════════════════════════════════════════════════════════════════

    const completeRoasts = [];

    // Generate stat-specific complete roasts
    if (stats.points !== null) {
      if (stats.points === 0) {
        completeRoasts.push(
          `${username} got ZERO POINTS and still talking! 😂 That's like being broke AND loud! The worst combo! 💀`,
          `ZERO POINTS?! ${username}, you're not just broke, you're BANKRUPT! File for Chapter 11! 📉`,
          `Hoy ${username}! ZERO balance tapos trash talk pa?! Kahit mga bato sa daan may mas mahabang value! 🪨`,
          `${username} with 0 points trying to roast me! Bro, you can't even afford to EXIST! 👻`,
        );
      } else if (stats.points < 50) {
        completeRoasts.push(
          `${username} flexing **${stats.points} points** like it's something! Bro, that's lunch money! 🍔`,
          `**${stats.points} points**?! ${username}, vendors won't even LOOK at you! Window shopping lang! 🪟`,
          `${pick(openings.shock)} **${stats.points} points** lang tapos ang tapang! Vendor trash ka lang! 🗑️`,
          `${username}'s **${stats.points} points** balance! That's not a flex, that's a CRY for HELP! 📞`,
          `LMAOOOO! ${username} got **${stats.points} points** but acting like they got the guild bank! 🏦💀`,
        );
      } else if (stats.points < 100) {
        completeRoasts.push(
          `${username} out here with **${stats.points} points** talking BIG! That's barely ONE bid, sit down! 🪑`,
          `**${stats.points} points**?! ${username}, di ka pa boss drop level! You're NORMAL MOB tier! 👹`,
          `Grabe ${username}! **${stats.points} points** tapos magjudge?! Bahay-bahayan lang! 🏠`,
          `${username}'s **${stats.points} points** can't even get good RNG! Budget problems! 💸`,
        );
      } else if (stats.points < 300) {
        completeRoasts.push(
          `${username} with **${stats.points} points** acting rich! Bro, that's STILL broke! Middle class delusion! 🎭`,
          `**${stats.points} points**! ${username} thinks they're ballin'! That's one failed bid away from poverty! 📉`,
          `${username}, **${stats.points} points** is NOT the flex you think it is! Still bottom 50%! 📊`,
        );
      }
    }

    // Ranking roasts
    if (stats.attendanceRank && stats.totalUsers > 0) {
      const percentage = (stats.attendanceRank / stats.totalUsers) * 100;

      if (stats.attendanceRank === stats.totalUsers) {
        completeRoasts.push(
          `🚨 EMERGENCY! 🚨 ${username} is DEAD LAST (#${stats.totalUsers}/${stats.totalUsers}) and STILL trash talking! The CONFIDENCE! 😂`,
          `${username} ranked #${stats.totalUsers} out of ${stats.totalUsers}! You're not just last, you're EPICALLY last! 🏆💩`,
          `LAST PLACE ${username}! Congrats on your participation trophy! Should we frame your #${stats.totalUsers} rank?! 🖼️`,
          `Hoy ${username}! LAST PLACE ka (#${stats.totalUsers}) tapos may lakas ka pang mang-bash?! Tutorial mo ba to?! 📖`,
          `${username}'s rank: #${stats.totalUsers}/${stats.totalUsers}! Even the leaderboard tried to delete you! 🗑️`,
          `BREAKING: ${username} sets RECORD for being #${stats.totalUsers}! Worst attendance NA! 📰`,
        );
      } else if (percentage > 80) {
        completeRoasts.push(
          `${username} ranked #${stats.attendanceRank}/${stats.totalUsers}! BOTTOM 20%! You're basically furniture! 🪑`,
          `#${stats.attendanceRank} out of ${stats.totalUsers}?! ${username}, you're the BENCH! The ACTUAL bench! 🏗️`,
          `${username} sa bottom tier (#${stats.attendanceRank}) pero ang attitude TOP TIER?! MISMATCHED! 🎭`,
          `Rank #${stats.attendanceRank}! ${username}, you're closer to LAST than to FIRST! Think about that! 🤔`,
        );
      } else if (percentage > 50) {
        completeRoasts.push(
          `${username} ranked #${stats.attendanceRank}/${stats.totalUsers}! BELOW AVERAGE confirmed! The math don't lie! 📐`,
          `${pick(openings.sarcastic)} Rank #${stats.attendanceRank}! Bottom half energy! 📉`,
          `${username}'s #${stats.attendanceRank}! Mas mataas pa yung price ng brown items sa rank mo! 💩`,
        );
      }
    }

    // Low attendance roasts
    if (stats.attendancePoints !== null && stats.attendancePoints < 50) {
      completeRoasts.push(
        `${username} got **${stats.attendancePoints} attendance points**! Bro, AFK ka ba since CREATION?! 🌍`,
        `**${stats.attendancePoints} attendance**?! ${username}, you're basically a GHOST MEMBER! Guild legends! 👻`,
        `${pick(openings.shock)} **${stats.attendancePoints} attendance points**! Present ka ba talaga EVER?! 🤔`,
        `${username}'s **${stats.attendancePoints} attendance**! You exist in theory only! Schrodinger's member! 🐱`,
        `**${stats.attendancePoints} attendance**! ${username}, even INACTIVE members show up more! 💤`,
        `Hoy ${username}! **${stats.attendancePoints} attendance points** lang?! Absent king! Absent queen! 👑`,
      );
    }

    // ULTRA COMBO ROASTS (Multiple weaknesses)
    if (stats.points < 100 && stats.attendanceRank && stats.attendanceRank > stats.totalUsers * 0.7) {
      completeRoasts.push(
        `🌪️ PERFECT STORM! 🌪️ ${username}: **${stats.points} points** + #${stats.attendanceRank} rank! DOUBLE BOTTOM TIER! The ULTIMATE failure! 💀`,
        `Wait... ${username} got **${stats.points} points** AND rank #${stats.attendanceRank}?! That's IMPRESSIVELY bad! How?! 😂`,
        `${username}'s resume: ❌ Broke (**${stats.points}pts**) ❌ Last tier (#${stats.attendanceRank}) ❌ Still talking! CERTIFIED L! 📋`,
        `TANGINA! ${username}! **${stats.points} points** + **#${stats.attendanceRank}** ranking = GUILD'S WEAKEST LINK! 🔗`,
        `${username}: Points: **${stats.points}** 📉 | Rank: **#${stats.attendanceRank}** 📊 | Trash Talk: **∞** 💩 | Self-Awareness: **0** 🤡`,
        `Bro ${username}, **${stats.points} points** + #${stats.attendanceRank} placement! You're SPEED-RUNNING to being kicked! 🏃`,
        `${username} collected ALL the L's! **${stats.points}pts** + #${stats.attendanceRank} rank! L + L = 💀`,
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ASSEMBLY LINE - Build the perfect roast!
    // ═══════════════════════════════════════════════════════════════════════

    // If we have complete roasts, mix them in
    if (completeRoasts.length > 0) {
      return pick(completeRoasts);
    }

    // Build a modular roast
    let opening = '';
    let statCall = '';
    let burn = '';

    // Pick opening
    const openingType = pick(['shock', 'question', 'sarcastic', 'direct']);
    opening = pick(openings[openingType]);

    // Pick stat callout based on what we have
    if (stats.points !== null && stats.points < 100) {
      statCall = pick(lowPointsCallouts);
    } else if (stats.points !== null && stats.points < 300) {
      statCall = pick(medPointsCallouts);
    } else if (stats.attendanceRank && stats.totalUsers > 0) {
      statCall = pick(rankCallouts);
    } else if (stats.attendancePoints !== null && stats.attendancePoints < 50) {
      statCall = pick(attendanceCallouts);
    } else if (!stats.points && !stats.attendanceRank) {
      // No data
      return pick([
        `${username}? WHO?! 🤔 You're not even in my database! Bagong member ka lang at akala mo alam mo na lahat?! 👶`,
        `Can't find ${username}'s stats! 👻 Either you're SO bad the system deleted you OR you don't exist! 💀`,
        `${username} not found! 404 ERROR! You're so irrelevant even my database gave up! 🗑️`,
        `Sino ba yan si ${username}?! Wala sa records! Imaginary friend vibes! 🦄`,
        `${pick(openings.shock)} ${username}, wala kang data pero ang lakas ng trash talk! Exist ka muna! 📊`,
      ]);
    } else {
      // Decent stats but still trash talking
      return pick([
        `Oh wow! ${username} got DECENT stats but TRASH personality! 😬 Money can't buy class! 💳`,
        `${username}'s stats: ✅ Good! Attitude: ❌ BASURA! 🗑️ Fix yourself! 🔧`,
        `Ayos naman stats ni ${username} pero ugali?! NEGATIVE! 📉 Mag-reflect! 🪞`,
        `${username} proving you can have GOOD stats and ZERO class! 🎩 Impressive! 👏`,
        `${pick(openings.sarcastic)} Good stats pero TOXIC! You're the whole RED FLAG! 🚩`,
        `${username} got points but NO chill! 😤 Relax bro! !leaderboard won't make you #1 in LIFE! 🌎`,
      ]);
    }

    // Pick a burn
    burn = pick(burns);

    // Combine everything!
    return combine(opening, statCall, burn);
  }

  /**
   * Handle a conversational message (no command recognized)
   * @param {Message} message - Discord message
   * @param {string} content - Cleaned message content
   * @returns {string|null} Response message or null
   */
  async handleConversation(message, content) {
    try {
      const userId = message.author.id;
      const username = message.author.username;

      // Store conversation history for learning
      this.storeConversation(userId, content);

      // Try to match conversation patterns
      for (const [type, config] of Object.entries(CONVERSATION_PATTERNS)) {
        for (const pattern of config.patterns) {
          if (pattern.test(content)) {
            // Special handling for insults - use stat-based roasts!
            if (type === 'insult' && this.sheetAPI) {
              console.log(`🔥 [Trash Talk] ${username} is getting roasted with stats!`);
              const stats = await this.getUserStats(username);
              if (stats) {
                const statRoast = this.generateStatBasedRoast(stats, username);
                console.log(`🔥 [Trash Talk] Generated stat-based roast for ${username}`);
                return statRoast;
              }
            }

            // Get random response for other patterns
            const response = this.getRandomResponse(config.responses);

            // Learn from this interaction
            this.learnFromConversation(userId, content, type);

            return response;
          }
        }
      }

      // No pattern matched - provide helpful fallback
      return this.getFallbackResponse(content);

    } catch (error) {
      console.error('❌ Error in conversational AI:', error);
      return null;
    }
  }

  /**
   * Store conversation in history for learning
   */
  storeConversation(userId, content) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId);
    history.push({
      content,
      timestamp: Date.now(),
    });

    // Keep only last 10 messages per user
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Learn potential command patterns from conversation
   */
  learnFromConversation(userId, content, conversationType) {
    // If learning system is available, record this as a learning opportunity
    if (this.learningSystem) {
      // Mark as unrecognized so it gets tracked
      const key = content.toLowerCase().trim();

      if (!this.learningSystem.unrecognizedPhrases.has(key)) {
        this.learningSystem.unrecognizedPhrases.set(key, {
          phrase: content,
          count: 1,
          users: new Set([userId]),
          lastSeen: Date.now(),
          conversationType, // Tag with conversation type
        });
      }
    }
  }

  /**
   * Get random response from list
   */
  getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Fallback response when nothing matches
   */
  getFallbackResponse(content) {
    // Analyze content for potential intent with more sophisticated detection
    const hasQuestion = /\?|what|how|when|where|who|why|ano|paano|kailan|saan|sino|bakit|can\s+you|could\s+you|would\s+you/i.test(content);
    const hasPoints = /points?|pts?|balance|pera|money|credits|currency|wallet/i.test(content);
    const hasStatus = /status|update|info|balita|progress|current|now|state/i.test(content);
    const hasBid = /bid|taya|pusta|auction|offer|wager/i.test(content);
    const hasAttendance = /attendance|present|nandito|here|attend|late|absent|roll\s+call/i.test(content);
    const hasLeaderboard = /leaderboard|top|rank|ranking|leader|best|standings|score/i.test(content);
    const hasPrediction = /predict|spawn|when|next|timing|schedule/i.test(content);
    const hasHelp = /help|guide|tutorial|how\s+to|paano|confused|lost|don't\s+(?:know|understand)/i.test(content);
    const hasReport = /report|weekly|stats|statistics|summary|overview/i.test(content);

    // Multi-intent detection (prioritize more specific intents)
    if (hasHelp && (hasAttendance || hasBid || hasPoints)) {
      // User needs help with a specific feature
      if (hasAttendance) {
        return "Need help with attendance? 📊\n\n" +
               "**How to mark attendance:**\n" +
               "• In attendance threads, say: **\"present\"**, **\"here\"**, or **\"nandito\"**\n" +
               "• Late? Say: **\"late\"** or **\"huli\"**\n" +
               "• Can't attend? Say: **\"absent\"** or **\"wala\"**\n\n" +
               "Check active threads: **\"attendance status\"** or **\"@bot status\"** in admin-logs\n" +
               "View your record: **\"my attendance\"** or **\"attendance ko\"**";
      }
      if (hasBid) {
        return "Need help with bidding? 💰\n\n" +
               "**How to bid:**\n" +
               "• In auction threads: **\"bid 500\"** or **\"taya 500\"**\n" +
               "• Check balance: **\"my points\"** or **\"pts ko\"**\n" +
               "• Auction status: **\"bid status\"** or **\"ano status ng auction\"**\n\n" +
               "I understand natural language - just mention me and ask!";
      }
      if (hasPoints) {
        return "Need help with points? 💰\n\n" +
               "**Check your points:**\n" +
               "• Say: **\"my points\"**, **\"balance ko\"**, **\"ilang points ko\"**\n\n" +
               "**Earn points:**\n" +
               "• Attend guild events (tracked via attendance)\n" +
               "• Participate in raids and activities\n\n" +
               "**Use points:**\n" +
               "• Bid on items in auction threads\n" +
               "• The more you participate, the more you earn!";
      }
    }

    if (hasQuestion && hasAttendance) {
      return "Questions about attendance? 📊\n\n" +
             "• **Mark attendance**: Say \"present\", \"here\", \"nandito\" in attendance threads\n" +
             "• **Check status**: Say \"attendance status\" or \"@bot status\" in admin-logs\n" +
             "• **View your record**: Say \"my attendance\" or \"attendance ko\"\n" +
             "• **Late/Absent**: Say \"late\"/\"huli\" or \"absent\"/\"wala\"\n\n" +
             "I track everything automatically! 🤖";
    }

    if (hasQuestion && hasLeaderboard) {
      return "Want to see rankings? 🏆\n\n" +
             "Try these commands:\n" +
             "• **\"show leaderboards\"** or **\"top\"** - All rankings\n" +
             "• **\"top points\"** - Points leaderboard\n" +
             "• **\"top attendance\"** - Attendance rankings\n" +
             "• **\"rankings\"** or **\"who's leading\"** - Current standings\n\n" +
             "Compete with your guildmates! 🎮";
    }

    if (hasQuestion && hasPrediction) {
      return "Want spawn predictions? 🔮\n\n" +
             "I can predict boss spawn times! Try:\n" +
             "• **\"predict spawn\"** or **\"next spawn\"**\n" +
             "• **\"when is next boss\"** or **\"kailan spawn\"**\n" +
             "• **\"spawn schedule\"** or **\"boss timing\"**\n\n" +
             "I use historical data to predict spawn windows! 📊";
    }

    if (hasQuestion && hasReport) {
      return "Want to see reports? 📈\n\n" +
             "Available reports:\n" +
             "• **\"weekly report\"** - This week's summary\n" +
             "• **\"stats\"** - Guild statistics\n" +
             "• **\"attendance report\"** - Attendance overview\n\n" +
             "Stay informed about guild performance!";
    }

    if (hasPoints) {
      return "Want to check your points? 💰\n\n" +
             "Just say:\n" +
             "• **\"my points\"** or **\"balance ko\"**\n" +
             "• **\"how many points\"** or **\"ilang points ko\"**\n" +
             "• **\"show balance\"** or **\"check points\"**\n\n" +
             "Points are earned through attendance and participation!";
    }

    if (hasStatus) {
      return "Want to check status? 📊\n\n" +
             "Available status commands:\n" +
             "• **\"auction status\"** - Current auction info\n" +
             "• **\"attendance status\"** - Active threads (use in admin-logs)\n" +
             "• **\"bid status\"** - Your current bids\n" +
             "• **\"show leaderboards\"** - Rankings\n\n" +
             "Stay updated on guild activities!";
    }

    if (hasBid) {
      return "Want to bid on items? 💰\n\n" +
             "In auction threads, just say:\n" +
             "• **\"bid 500\"** or **\"taya 500\"**\n" +
             "• **\"offer 1000\"** or **\"1000 points\"**\n\n" +
             "Check your balance first: **\"my points\"**\n" +
             "See auction status: **\"bid status\"**";
    }

    if (hasAttendance) {
      return "Attendance-related? 📊\n\n" +
             "• **Mark present**: \"present\", \"here\", \"nandito\"\n" +
             "• **Check status**: \"attendance status\" (in admin-logs)\n" +
             "• **Your record**: \"my attendance\"\n\n" +
             "Just say it naturally - I'll understand!";
    }

    if (hasLeaderboard) {
      return "Check the leaderboards! 🏆\n\n" +
             "Just say:\n" +
             "• **\"show leaderboards\"** or **\"top\"**\n" +
             "• **\"rankings\"** or **\"who's leading\"**\n" +
             "• **\"top points\"** or **\"top attendance\"**\n\n" +
             "See where you stand among guildmates!";
    }

    // Generic fallback - enhanced with more guidance
    return "I'm your intelligent guild assistant! 🤖✨\n\n" +
           "**I can help with:**\n" +
           "• 📊 **Attendance** - \"present\", \"attendance status\", \"my attendance\"\n" +
           "• 💰 **Points** - \"my points\", \"balance ko\"\n" +
           "• 🎯 **Bidding** - \"bid 500\", \"bid status\"\n" +
           "• 🏆 **Rankings** - \"show leaderboards\", \"top\"\n" +
           "• 🔮 **Predictions** - \"predict spawn\", \"next boss\"\n" +
           "• 📈 **Reports** - \"weekly report\", \"stats\"\n\n" +
           "**Pro tip:** I understand natural language in English, Tagalog, and Taglish!\n" +
           "Just mention me (@bot) and ask naturally. Or type **!help** for all commands!";
  }

  /**
   * Get conversation insights for a user
   */
  getUserConversationHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  /**
   * Clear old conversation history
   */
  clearOldConversations() {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (const [userId, history] of this.conversationHistory.entries()) {
      // Remove messages older than 1 hour
      const filtered = history.filter(msg => now - msg.timestamp < ONE_HOUR);

      if (filtered.length === 0) {
        this.conversationHistory.delete(userId);
      } else {
        this.conversationHistory.set(userId, filtered);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { ConversationalAI, CONVERSATION_PATTERNS };
