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

  // Insult/Criticism
  insult: {
    patterns: [
      /^(?:bad|terrible|useless|stupid|sucks|bobo|bano|tanga)/i,
      /^(?:you\s+(?:suck|are\s+bad|dont\s+work))/i,
      /^(?:ang\s+(?:bano|bobo|tanga)\s+mo)/i,
    ],
    responses: [
      "Sorry if I didn't understand! Try asking differently, or type '!help' for commands.",
      "My bad! I'm still learning. Can you rephrase that? Or try !help for command list.",
      "Pasensya na! Learning pa ako. Try mo ulit or type !help for commands.",
      "I apologize! Let me know what you need and I'll do my better! 🤖",
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
};

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATIONAL AI CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ConversationalAI {
  constructor(nlpLearningSystem) {
    this.learningSystem = nlpLearningSystem;
    this.conversationHistory = new Map(); // userId -> recent messages
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

      // Store conversation history for learning
      this.storeConversation(userId, content);

      // Try to match conversation patterns
      for (const [type, config] of Object.entries(CONVERSATION_PATTERNS)) {
        for (const pattern of config.patterns) {
          if (pattern.test(content)) {
            // Get random response
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
    // Analyze content for potential intent
    const hasQuestion = /\?|what|how|when|where|who|why|ano|paano|kailan|saan|sino|bakit/i.test(content);
    const hasPoints = /points?|pts?|balance|pera|money/i.test(content);
    const hasStatus = /status|update|info|balita/i.test(content);
    const hasBid = /bid|taya|pusta|auction/i.test(content);

    if (hasQuestion) {
      return "I'm not sure what you're asking, but I can help with:\n" +
             "• **Points & Balance** - \"my points\", \"balance ko\"\n" +
             "• **Auction Status** - \"auction status\", \"ano status\"\n" +
             "• **Leaderboards** - \"show leaderboards\", \"top rankings\"\n" +
             "• **Attendance** - \"present\", \"nandito ako\"\n\n" +
             "Try asking naturally or type **!help** for all commands!";
    }

    if (hasPoints) {
      return "Want to check your points? Try saying:\n" +
             "• \"my points\" or \"balance ko\"\n" +
             "• \"how many points\" or \"ilang points ko\"\n" +
             "• \"show balance\" or \"check points\"";
    }

    if (hasStatus) {
      return "Want to check status? Try:\n" +
             "• \"auction status\" - Current auction info\n" +
             "• \"attendance status\" - Active threads\n" +
             "• \"show leaderboards\" - Rankings";
    }

    if (hasBid) {
      return "Want to bid? In auction threads, just say:\n" +
             "• \"bid 500\" or \"taya 500\"\n" +
             "• \"offer 1000\"\n" +
             "• Or just \"500 points\"";
    }

    // Generic fallback
    return "I'm here to help! 🤖\n\n" +
           "Mention me and ask about:\n" +
           "• **Points/Balance** - \"my points\", \"pts ko\"\n" +
           "• **Leaderboards** - \"show top\", \"rankings\"\n" +
           "• **Auction** - \"bid 500\", \"status\"\n" +
           "• **Attendance** - \"present\", \"nandito\"\n\n" +
           "Or type **!help** for full command list!";
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
