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
   * Generate genius stat-based trash talk
   * @param {Object} stats - User statistics
   * @param {string} username - Discord username
   * @returns {string} Personalized roast
   */
  generateStatBasedRoast(stats, username) {
    const roasts = [];

    // Low points roasts (0-100 points)
    if (stats.points !== null && stats.points < 100) {
      roasts.push(
        `LMAO! ${username} out here trash talking with only **${stats.points} points**! 😂 Even my error logs have more value than your balance!`,
        `Hoy ${username}! **${stats.points} points** lang meron ka tapos ang yabang mo! 💀 Kahit 1-star boss drop mas mahal pa sa'yo!`,
        `Imagine having **${stats.points} points** and thinking you can roast ME! 🤡 Check !mypoints and cry, buddy!`,
        `${username} really said that with **${stats.points} points** in the bank! 🏦💀 Poverty called, they want their spokesperson back!`,
        `Putangina ${username}, **${stats.points} points** lang tapos trash talk pa! 😤 Mag-attend ka muna ng raids para may pambili ka ng respect!`
      );
    }

    // Medium-low points (100-300)
    if (stats.points !== null && stats.points >= 100 && stats.points < 300) {
      roasts.push(
        `${username} talkin' big with **${stats.points} points**! 💸 That's barely enough for a vendor trash item, bro!`,
        `Gago! **${stats.points} points** ka lang pero ang taas ng tingin mo sa sarili mo! 😂 Git gud muna!`,
        `**${stats.points} points** and you're THIS confident? 🤣 The audacity! Check !leaderboard to see where you REALLY stand!`
      );
    }

    // Bottom 50% ranking roasts
    if (stats.attendanceRank && stats.totalUsers > 0) {
      const percentage = (stats.attendanceRank / stats.totalUsers) * 100;

      if (percentage > 50) {
        roasts.push(
          `You're ranked **#${stats.attendanceRank}** out of ${stats.totalUsers} in attendance! 📊💀 Bottom half energy right here!`,
          `Rank **#${stats.attendanceRank}/${stats.totalUsers}**?! 😭 ${username}, you're literally in the bottom tier! Attendance please!`,
          `Hala! **#${stats.attendanceRank}** ka lang sa attendance pero ang tapang mo! 🤡 Mag-present ka muna consistently bago ka mang-bash!`,
          `Bottom ${Math.round(100 - percentage)}% ka pa sa rankings tapos ganyan ka magsalita?! 💀 Know your place, **#${stats.attendanceRank}**!`
        );
      }

      // Last place special roasts
      if (stats.attendanceRank === stats.totalUsers) {
        roasts.push(
          `🚨 DEAD LAST ALERT! 🚨 **#${stats.attendanceRank}/${stats.totalUsers}** and you're out here talking smack?! 😂😂😂`,
          `Grabe! LAST PLACE ka **#${stats.totalUsers}** tapos ang yabang mo pa! 💀 Baka kailangan mo ng tutorial sa pag-attend!`,
          `Congrats ${username}! You're **DEAD LAST** in attendance! 🏆💩 Here's your participation trophy for being consistently ABSENT!`
        );
      }
    }

    // Low attendance points
    if (stats.attendancePoints !== null && stats.attendancePoints < 50) {
      roasts.push(
        `**${stats.attendancePoints} attendance points**?! 😂 You've been ghosting more than attending! Saan ka na?!`,
        `${stats.attendancePoints} attendance points... Bro, AFK ka ba since Day 1?! 📊💀 Present naman minsan!`,
        `With **${stats.attendancePoints} attendance points**, you're basically a myth! 👻 Guild members wondering if you even exist!`
      );
    }

    // Combined low stats roasts
    if (stats.points < 100 && stats.attendanceRank && stats.attendanceRank > stats.totalUsers * 0.7) {
      roasts.push(
        `PERFECT STORM! 🌪️ **${stats.points} points** + Rank **#${stats.attendanceRank}**! You're speed-running to becoming the guild's weakest link! 💀`,
        `Let me get this straight: **${stats.points} points**, rank **#${stats.attendanceRank}**, and you're STILL talking shit?! 😂 The confidence of a noob!`,
        `Tangina ${username}! **${stats.points} points** + **#${stats.attendanceRank}** ranking = CERTIFIED CARRIED! 🤡 Sana all may audacity!`,
        `Your stats: Points: **${stats.points}** 📉 Rank: **#${stats.attendanceRank}** 📊 Trash Talk: **100** 💩 Bro, focus on ONE thing!`
      );
    }

    // No data found roasts
    if (!stats.points && !stats.attendanceRank) {
      roasts.push(
        `${username}? Who dis?! 🤔 You're not even in my database! Baka bagong salta ka lang at akala mo alam mo na lahat!`,
        `Can't find your stats, ${username}! 👻 Either you're a ghost member or so irrelevant the system forgot you! 💀`,
        `LOL! Wala ka pa sa records ko pero may lakas ka pang mang-trashtalk! 😂 Mag-exist ka muna sa guild bago ka sumagot!`
      );
    }

    // If we have roasts based on stats, return one
    if (roasts.length > 0) {
      return roasts[Math.floor(Math.random() * roasts.length)];
    }

    // Default: user has decent stats but still trash talking
    const defaultRoasts = [
      `Oh, someone with ACTUAL stats is talking trash! 😏 Too bad your game sense is still trash! Check !help to improve!`,
      `Ayos stats mo pero personality mo? BASURA! 🗑️ Bili ka ng class sa pagiging mabuting tao!`,
      `You got stats but zero chill! 😤 Mag-relax ka lang at mag-!leaderboard para makita mo hindi ka pa rin #1!`
    ];

    return defaultRoasts[Math.floor(Math.random() * defaultRoasts.length)];
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
