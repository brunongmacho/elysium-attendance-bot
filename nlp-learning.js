/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ELYSIUM NLP LEARNING SYSTEM                            ║
 * ║              Self-Improving Natural Language Processing                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Learning NLP that improves over time by learning from user interactions
 *
 * FEATURES:
 * - Passive learning: Listens to all messages without responding
 * - Active responses: Only responds when bot is mentioned or in specific contexts
 * - Pattern learning: Learns new phrases from user confirmations
 * - User preferences: Remembers individual language preferences
 * - Confidence scoring: Improves accuracy over time
 * - Google Sheets storage: Persistent learning data
 */

const { makeSheetRequest } = require('./utils/sheet-api');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEARNING_CONFIG = {
  // Activation modes
  activationModes: {
    alwaysRespond: false,           // Always respond to NLP (OFF - prevents spam)
    respondOnMention: true,         // Only respond when bot is mentioned
    respondInAuctionThreads: true,  // Auto-respond to bids in auction threads
    respondInAdminLogs: true,       // Admin logs for admin commands
  },

  // Learning modes
  learningModes: {
    passiveLearning: true,          // Learn from all messages (even without responding)
    activeConfirmation: true,       // Ask users to confirm unrecognized phrases
    autoApplyHighConfidence: true,  // Auto-apply patterns with >90% confidence
  },

  // Thresholds
  thresholds: {
    minConfidence: 0.6,             // Minimum confidence to suggest pattern
    autoApplyConfidence: 0.9,       // Auto-apply without asking
    minUsageForLearning: 3,         // Minimum confirmations before learning
    maxUnrecognizedCache: 100,      // Max unrecognized phrases to cache
  },

  // Storage
  storage: {
    learnedPatternsCache: 1000,     // Keep top 1000 patterns in memory
    recentMessagesCache: 100,       // Keep last 100 messages for context
    syncInterval: 5 * 60 * 1000,    // Sync to Google Sheets every 5 minutes
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHES
// ═══════════════════════════════════════════════════════════════════════════

class NLPLearningSystem {
  constructor() {
    // Learned patterns cache (hot storage)
    this.learnedPatterns = new Map(); // phrase → { command, confidence, usageCount }

    // User preferences cache
    this.userPreferences = new Map(); // userId → { language, shortcuts, learningEnabled }

    // Recent messages (for passive learning)
    this.recentMessages = []; // Ring buffer of last 100 messages

    // Unrecognized phrases (for admin review)
    this.unrecognizedPhrases = new Map(); // phrase → { count, users, lastSeen }

    // Pending confirmations (waiting for user response)
    this.pendingConfirmations = new Map(); // messageId → { userId, phrase, suggestedCommand }

    // Last sync timestamp
    this.lastSync = 0;

    // Bot user ID (set during initialization)
    this.botUserId = null;
  }

  /**
   * Initialize the learning system
   * @param {Client} client - Discord client
   */
  async initialize(client) {
    this.botUserId = client.user.id;
    console.log('🧠 NLP Learning System initialized');

    // Load learned patterns from Google Sheets
    await this.loadLearnedPatterns();

    // Load user preferences
    await this.loadUserPreferences();

    // Start periodic sync
    this.startPeriodicSync();
  }

  /**
   * Check if bot should respond to this message
   * @param {Message} message - Discord message
   * @returns {boolean} True if bot should respond
   */
  shouldRespond(message) {
    // Always respond to ! commands (handled elsewhere)
    if (message.content.startsWith('!')) {
      return false; // Let existing command handler take over
    }

    // Check if bot is mentioned
    const botMentioned = message.mentions.users.has(this.botUserId);
    if (botMentioned && LEARNING_CONFIG.activationModes.respondOnMention) {
      return true;
    }

    // Check if in auction thread (for bids)
    const isAuctionThread = message.channel.isThread() &&
                           message.channel.parentId === message.client.config?.bidding_channel_id;
    if (isAuctionThread && LEARNING_CONFIG.activationModes.respondInAuctionThreads) {
      return true;
    }

    // Check if in admin logs (for admin commands)
    const isAdminLogs = message.channel.id === message.client.config?.admin_logs_channel_id ||
                       (message.channel.isThread() &&
                        message.channel.parentId === message.client.config?.admin_logs_channel_id);
    if (isAdminLogs && LEARNING_CONFIG.activationModes.respondInAdminLogs) {
      return true;
    }

    // Don't respond by default (passive learning only)
    return false;
  }

  /**
   * Process message for learning (always runs, even without responding)
   * @param {Message} message - Discord message
   */
  async learnFromMessage(message) {
    if (!LEARNING_CONFIG.learningModes.passiveLearning) return;

    // Store message in recent cache (ring buffer)
    this.recentMessages.push({
      content: message.content,
      userId: message.author.id,
      username: message.author.username,
      timestamp: Date.now(),
      channelId: message.channel.id,
      botMentioned: message.mentions.users.has(this.botUserId),
    });

    // Keep only last N messages
    if (this.recentMessages.length > LEARNING_CONFIG.storage.recentMessagesCache) {
      this.recentMessages.shift();
    }

    // Detect language preference for this user
    this.updateUserLanguagePreference(message.author.id, message.content);

    // Check if this is an unrecognized phrase (potential learning opportunity)
    // We'll track these for admin review
    const { NLPHandler } = require('./nlp-handler');
    const nlp = new NLPHandler(message.client.config || {});
    const interpreted = nlp.interpretMessage(message);

    if (!interpreted) {
      // Unrecognized phrase - track it
      this.trackUnrecognizedPhrase(message.content, message.author.id);
    }
  }

  /**
   * Try to interpret message using learned patterns first, then static patterns
   * @param {Message} message - Discord message
   * @param {NLPHandler} staticNLP - Static NLP handler
   * @returns {Object|null} Interpreted command or null
   */
  async interpretWithLearning(message, staticNLP) {
    const content = message.content.trim();

    // Remove bot mention if present
    const cleanContent = content.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();

    // Try learned patterns first (higher priority for user-taught phrases)
    const learnedResult = this.tryLearnedPatterns(cleanContent, message.author.id);
    if (learnedResult && learnedResult.confidence >= LEARNING_CONFIG.thresholds.minConfidence) {
      return {
        ...learnedResult,
        source: 'learned',
        shouldConfirm: learnedResult.confidence < LEARNING_CONFIG.thresholds.autoApplyConfidence,
      };
    }

    // Fall back to static patterns
    const staticResult = staticNLP.interpretMessage(message);
    if (staticResult) {
      // Track successful static pattern usage (helps with learning)
      this.trackSuccessfulPattern(cleanContent, staticResult.command);
      return {
        ...staticResult,
        source: 'static',
        shouldConfirm: false,
      };
    }

    // No match found - check if we should suggest similar commands
    if (LEARNING_CONFIG.learningModes.activeConfirmation && this.shouldRespond(message)) {
      return await this.suggestSimilarCommand(cleanContent, message);
    }

    return null;
  }

  /**
   * Try to match against learned patterns
   * @param {string} content - Message content
   * @param {string} userId - User ID
   * @returns {Object|null} Match result
   */
  tryLearnedPatterns(content, userId) {
    const lowerContent = content.toLowerCase();

    // Check exact matches first
    if (this.learnedPatterns.has(lowerContent)) {
      const pattern = this.learnedPatterns.get(lowerContent);
      return {
        command: pattern.command,
        params: this.extractParams(content, pattern.paramPattern),
        confidence: pattern.confidence,
        usageCount: pattern.usageCount,
      };
    }

    // Check user-specific shortcuts
    const userPrefs = this.userPreferences.get(userId);
    if (userPrefs?.shortcuts) {
      for (const [shortcut, command] of Object.entries(userPrefs.shortcuts)) {
        if (lowerContent.startsWith(shortcut.toLowerCase())) {
          return {
            command,
            params: this.extractParams(content.slice(shortcut.length).trim()),
            confidence: 1.0, // User's own shortcut = 100% confidence
            usageCount: 'personal',
          };
        }
      }
    }

    // Check fuzzy matches (for typos)
    const fuzzyMatch = this.findFuzzyMatch(lowerContent);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    return null;
  }

  /**
   * Extract parameters from content based on pattern
   * @param {string} content - Message content
   * @param {RegExp} pattern - Parameter extraction pattern
   * @returns {Array} Extracted parameters
   */
  extractParams(content, pattern = /(\d+)/g) {
    const matches = content.match(pattern);
    return matches ? matches : [];
  }

  /**
   * Find fuzzy match for typos/variations
   * @param {string} content - Message content
   * @returns {Object|null} Match result
   */
  findFuzzyMatch(content) {
    const levenshtein = require('fast-levenshtein');
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const [phrase, pattern] of this.learnedPatterns.entries()) {
      const similarity = 1 - (levenshtein.get(content, phrase) / Math.max(content.length, phrase.length));

      if (similarity > bestSimilarity && similarity >= 0.8) {
        bestSimilarity = similarity;
        bestMatch = {
          command: pattern.command,
          params: this.extractParams(content, pattern.paramPattern),
          confidence: pattern.confidence * similarity, // Reduce confidence for fuzzy match
          usageCount: pattern.usageCount,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Suggest similar command for unrecognized phrase
   * @param {string} content - Message content
   * @param {Message} message - Discord message
   * @returns {Object} Suggestion result
   */
  async suggestSimilarCommand(content, message) {
    // Find most similar known commands
    const suggestions = this.findSimilarCommands(content);

    if (suggestions.length === 0) {
      return null;
    }

    // Store pending confirmation
    const confirmationId = `${message.id}_${Date.now()}`;
    this.pendingConfirmations.set(confirmationId, {
      userId: message.author.id,
      phrase: content,
      suggestions,
      timestamp: Date.now(),
    });

    return {
      command: null,
      suggestions,
      confirmationId,
      needsConfirmation: true,
    };
  }

  /**
   * Find similar commands using fuzzy matching
   * @param {string} content - Message content
   * @returns {Array} Similar commands
   */
  findSimilarCommands(content) {
    const levenshtein = require('fast-levenshtein');
    const allCommands = [
      '!bid', '!mypoints', '!present', '!leaderboard', '!bidstatus',
      '!help', '!startauction', '!pause', '!resume', '!stop',
    ];

    const similarities = allCommands.map(cmd => ({
      command: cmd,
      similarity: 1 - (levenshtein.get(content.toLowerCase(), cmd) / Math.max(content.length, cmd.length)),
    }))
    .filter(s => s.similarity >= 0.4)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

    return similarities.map(s => s.command);
  }

  /**
   * Confirm learned pattern from user reaction/response
   * @param {string} confirmationId - Confirmation ID
   * @param {string} confirmedCommand - Command user confirmed
   */
  async confirmPattern(confirmationId, confirmedCommand) {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) return;

    const { userId, phrase } = pending;

    // Add to learned patterns
    const lowerPhrase = phrase.toLowerCase();
    const existing = this.learnedPatterns.get(lowerPhrase);

    if (existing) {
      // Increment usage count and update confidence
      existing.usageCount++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.05);
    } else {
      // New pattern
      this.learnedPatterns.set(lowerPhrase, {
        command: confirmedCommand,
        confidence: 0.7, // Start at 70% confidence
        usageCount: 1,
        learnedFrom: userId,
        learnedAt: Date.now(),
        paramPattern: /(\d+)/g, // Default: extract numbers
      });
    }

    // Save to Google Sheets
    await this.saveLearnedPattern(lowerPhrase, this.learnedPatterns.get(lowerPhrase));

    // Remove from pending
    this.pendingConfirmations.delete(confirmationId);

    // Remove from unrecognized list
    this.unrecognizedPhrases.delete(lowerPhrase);

    console.log(`✅ Learned new pattern: "${phrase}" → ${confirmedCommand}`);
  }

  /**
   * Track unrecognized phrase for admin review
   * @param {string} phrase - Unrecognized phrase
   * @param {string} userId - User ID
   */
  trackUnrecognizedPhrase(phrase, userId) {
    const lowerPhrase = phrase.toLowerCase().trim();

    // Ignore very short or very long phrases
    if (lowerPhrase.length < 3 || lowerPhrase.length > 100) return;

    // Ignore messages that look like casual conversation
    if (this.isCasualConversation(lowerPhrase)) return;

    const existing = this.unrecognizedPhrases.get(lowerPhrase);
    if (existing) {
      existing.count++;
      existing.users.add(userId);
      existing.lastSeen = Date.now();
    } else {
      this.unrecognizedPhrases.set(lowerPhrase, {
        count: 1,
        users: new Set([userId]),
        lastSeen: Date.now(),
      });
    }

    // Keep only top N unrecognized phrases
    if (this.unrecognizedPhrases.size > LEARNING_CONFIG.thresholds.maxUnrecognizedCache) {
      // Remove least frequent phrase
      let minPhrase = null;
      let minCount = Infinity;
      for (const [phrase, data] of this.unrecognizedPhrases.entries()) {
        if (data.count < minCount) {
          minCount = data.count;
          minPhrase = phrase;
        }
      }
      if (minPhrase) {
        this.unrecognizedPhrases.delete(minPhrase);
      }
    }
  }

  /**
   * Check if message is casual conversation (not a command)
   * @param {string} content - Message content
   * @returns {boolean} True if casual conversation
   */
  isCasualConversation(content) {
    // Casual conversation indicators
    const casualIndicators = [
      /^(haha|lol|hehe|gg|nice|wow|omg|wtf|lmao)/i,
      /\?{2,}|!{2,}/,                              // Multiple punctuation
      /^(hi|hello|hey|yo|sup|kamusta|kumusta)/i,  // Greetings
      /^(thanks|thank you|salamat|ty)/i,          // Thanks
      /^(ok|okay|yes|no|oo|hindi)/i,              // Simple responses
    ];

    return casualIndicators.some(pattern => pattern.test(content));
  }

  /**
   * Track successful pattern usage (for learning frequency)
   * @param {string} phrase - Successful phrase
   * @param {string} command - Matched command
   */
  trackSuccessfulPattern(phrase, command) {
    const lowerPhrase = phrase.toLowerCase();
    const existing = this.learnedPatterns.get(lowerPhrase);

    if (existing) {
      existing.usageCount++;
      existing.lastUsed = Date.now();
    }
  }

  /**
   * Update user's language preference based on their messages
   * @param {string} userId - User ID
   * @param {string} content - Message content
   */
  updateUserLanguagePreference(userId, content) {
    const { NLPHandler } = require('./nlp-handler');
    const nlp = new NLPHandler({});
    const detectedLanguage = nlp.detectLanguage(content);

    const userPrefs = this.userPreferences.get(userId) || {
      language: 'en',
      languageScores: { en: 0, tl: 0, taglish: 0 },
      shortcuts: {},
      messageCount: 0,
    };

    // Increment language score
    userPrefs.languageScores[detectedLanguage] = (userPrefs.languageScores[detectedLanguage] || 0) + 1;
    userPrefs.messageCount++;

    // Update preferred language (most used language after 10+ messages)
    if (userPrefs.messageCount >= 10) {
      const maxScore = Math.max(...Object.values(userPrefs.languageScores));
      userPrefs.language = Object.keys(userPrefs.languageScores).find(
        lang => userPrefs.languageScores[lang] === maxScore
      );
    }

    this.userPreferences.set(userId, userPrefs);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load learned patterns from Google Sheets
   */
  async loadLearnedPatterns() {
    try {
      const response = await makeSheetRequest('getLearnedPatterns');
      if (response?.patterns) {
        for (const pattern of response.patterns) {
          this.learnedPatterns.set(pattern.phrase.toLowerCase(), {
            command: pattern.command,
            confidence: pattern.confidence,
            usageCount: pattern.usageCount,
            learnedFrom: pattern.learnedFrom,
            learnedAt: pattern.learnedAt,
            paramPattern: new RegExp(pattern.paramPattern || '(\\d+)', 'g'),
          });
        }
        console.log(`📚 Loaded ${response.patterns.length} learned patterns from Google Sheets`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load learned patterns, starting fresh:', error.message);
    }
  }

  /**
   * Load user preferences from Google Sheets
   */
  async loadUserPreferences() {
    try {
      const response = await makeSheetRequest('getUserPreferences');
      if (response?.preferences) {
        for (const pref of response.preferences) {
          this.userPreferences.set(pref.userId, {
            language: pref.language || 'en',
            languageScores: pref.languageScores || { en: 0, tl: 0, taglish: 0 },
            shortcuts: pref.shortcuts || {},
            messageCount: pref.messageCount || 0,
          });
        }
        console.log(`👤 Loaded ${response.preferences.length} user preferences from Google Sheets`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load user preferences, starting fresh:', error.message);
    }
  }

  /**
   * Save learned pattern to Google Sheets
   * @param {string} phrase - Learned phrase
   * @param {Object} pattern - Pattern data
   */
  async saveLearnedPattern(phrase, pattern) {
    try {
      await makeSheetRequest('saveLearnedPattern', {
        phrase,
        command: pattern.command,
        confidence: pattern.confidence,
        usageCount: pattern.usageCount,
        learnedFrom: pattern.learnedFrom,
        learnedAt: pattern.learnedAt,
        paramPattern: pattern.paramPattern.source,
      });
    } catch (error) {
      console.error('❌ Failed to save learned pattern:', error.message);
    }
  }

  /**
   * Start periodic sync to Google Sheets
   */
  startPeriodicSync() {
    setInterval(async () => {
      await this.syncToGoogleSheets();
    }, LEARNING_CONFIG.storage.syncInterval);
  }

  /**
   * Sync all learning data to Google Sheets
   */
  async syncToGoogleSheets() {
    try {
      // Sync learned patterns
      const patterns = Array.from(this.learnedPatterns.entries()).map(([phrase, data]) => ({
        phrase,
        ...data,
        paramPattern: data.paramPattern.source,
      }));

      // Sync user preferences
      const preferences = Array.from(this.userPreferences.entries()).map(([userId, data]) => ({
        userId,
        ...data,
      }));

      // Sync unrecognized phrases (for admin review)
      const unrecognized = Array.from(this.unrecognizedPhrases.entries()).map(([phrase, data]) => ({
        phrase,
        count: data.count,
        userCount: data.users.size,
        lastSeen: data.lastSeen,
      }));

      await makeSheetRequest('syncNLPLearning', {
        patterns,
        preferences,
        unrecognized,
        timestamp: Date.now(),
      });

      this.lastSync = Date.now();
      console.log(`💾 Synced NLP learning data to Google Sheets (${patterns.length} patterns, ${preferences.length} users)`);
    } catch (error) {
      console.error('❌ Failed to sync NLP learning data:', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS & ADMIN DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get learning statistics for admin dashboard
   * @returns {Object} Statistics
   */
  getStatistics() {
    const topUnrecognized = Array.from(this.unrecognizedPhrases.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([phrase, data]) => ({
        phrase,
        count: data.count,
        userCount: data.users.size,
      }));

    const topLearnedPatterns = Array.from(this.learnedPatterns.entries())
      .sort((a, b) => b[1].usageCount - a[1].usageCount)
      .slice(0, 10)
      .map(([phrase, data]) => ({
        phrase,
        command: data.command,
        usageCount: data.usageCount,
        confidence: data.confidence,
      }));

    const languageDistribution = {};
    for (const prefs of this.userPreferences.values()) {
      languageDistribution[prefs.language] = (languageDistribution[prefs.language] || 0) + 1;
    }

    return {
      totalLearnedPatterns: this.learnedPatterns.size,
      totalUsers: this.userPreferences.size,
      totalUnrecognizedPhrases: this.unrecognizedPhrases.size,
      recentMessagesCount: this.recentMessages.length,
      topUnrecognized,
      topLearnedPatterns,
      languageDistribution,
      lastSync: this.lastSync,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  NLPLearningSystem,
  LEARNING_CONFIG,
};
