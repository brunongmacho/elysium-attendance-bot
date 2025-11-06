/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    NLP LEARNING SYSTEM (Self-Improving)                   ║
 * ║                  Multilingual Pattern Learning & Adaptation               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Self-improving NLP system that learns from user confirmations
 * and adapts to multilingual usage patterns (English, Tagalog, Taglish).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KEY FEATURES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. PASSIVE LEARNING MODE
 *    - Learns from ALL guild messages without responding
 *    - Tracks language preferences per user
 *    - Records unrecognized phrases for review
 *    - No spam, no unwanted responses
 *
 * 2. MENTION-BASED ACTIVATION
 *    - Only responds when bot is @mentioned
 *    - Auto-responds in auction threads (for bids)
 *    - Prevents interference with normal chat
 *
 * 3. SELF-IMPROVING PATTERNS
 *    - Learns patterns from user confirmations (✅ reactions)
 *    - Confidence scores improve over time (0.7 → 0.95+)
 *    - Patterns sync to Google Sheets every 5 minutes
 *    - Survives bot restarts (persistent storage)
 *
 * 4. MULTILINGUAL SUPPORT
 *    - Detects language per message (EN, TL, Taglish)
 *    - Learns user language preferences
 *    - Adapts to code-switching behavior
 *
 * 5. GOOGLE SHEETS PERSISTENCE
 *    - Syncs learned patterns every 5 minutes
 *    - Stores user preferences
 *    - Tracks unrecognized phrases
 *    - Daily analytics snapshots
 */

const axios = require('axios');
const { NLPHandler } = require('./nlp-handler.js');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEARNING_CONFIG = {
  // Activation modes
  activationModes: {
    respondOnMention: true,        // Respond when bot is @mentioned
    respondInAuctionThreads: true, // Auto-respond to bids in auction threads
    passiveLearning: true,         // Learn from all messages (always on)
  },

  // Learning parameters
  learning: {
    initialConfidence: 0.7,        // Starting confidence for new patterns
    confirmationBoost: 0.05,       // Increase per ✅ confirmation
    maxConfidence: 0.98,           // Maximum confidence cap
    minUsageForLearning: 2,        // Min times pattern used before learning
    decayRate: 0.02,               // Confidence decrease per failed interpretation
  },

  // Storage
  storage: {
    syncInterval: 5 * 60 * 1000,   // Sync to Google Sheets every 5 minutes
    maxRecentMessages: 100,        // Keep last 100 messages for context
    maxUnrecognizedPhrases: 50,    // Track top 50 unrecognized phrases
  },

  // Language detection
  languages: {
    tagalog: ['taya', 'pusta', 'ako', 'ko', 'ang', 'na', 'ng', 'points'],
    taglish: ['bid ko', 'points ko', 'ako', 'na', 'lang'],
    english: ['bid', 'points', 'my', 'how', 'many', 'show', 'check'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// NLP LEARNING SYSTEM CLASS
// ═══════════════════════════════════════════════════════════════════════════

class NLPLearningSystem {
  constructor() {
    // Core data structures
    this.learnedPatterns = new Map();      // phrase → { command, confidence, usage, ... }
    this.userPreferences = new Map();      // userId → { language, shortcuts, stats }
    this.unrecognizedPhrases = new Map();  // phrase → { count, users, lastSeen }
    this.recentMessages = [];              // Circular buffer of recent messages

    // Static NLP handler for fallback
    this.staticHandler = null;

    // Bot instance
    this.client = null;
    this.botUserId = null;
    this.config = null;

    // Sync timer
    this.syncTimer = null;
    this.lastSync = null;

    // Statistics
    this.stats = {
      messagesAnalyzed: 0,
      patternsLearned: 0,
      successfulInterpretations: 0,
      failedInterpretations: 0,
      languageDistribution: { en: 0, tl: 0, taglish: 0 },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════

  async initialize(client) {
    this.client = client;
    this.botUserId = client.user.id;

    // Get config from environment or client
    this.config = client.elysiumConfig || require('./config.json');

    // Initialize static NLP handler for fallback
    this.staticHandler = new NLPHandler(this.config);

    console.log('🧠 [NLP Learning] Initializing system...');

    // Load learned patterns from Google Sheets
    await this.loadFromGoogleSheets();

    // Start periodic sync timer
    this.startSyncTimer();

    console.log(`🧠 [NLP Learning] Loaded ${this.learnedPatterns.size} patterns, ${this.userPreferences.size} user profiles`);
    console.log('🧠 [NLP Learning] Passive learning enabled (learns from all messages)');
    console.log('🧠 [NLP Learning] Mention-based activation enabled (responds only when @mentioned)');

    return this;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MENTION-BASED ACTIVATION
  // ═════════════════════════════════════════════════════════════════════════

  shouldRespond(message) {
    // Bot is mentioned
    if (LEARNING_CONFIG.activationModes.respondOnMention) {
      const botMentioned = message.mentions.users.has(this.botUserId);
      if (botMentioned) {
        return true;
      }
    }

    // In auction thread (auto-respond for bids)
    if (LEARNING_CONFIG.activationModes.respondInAuctionThreads) {
      const isAuctionThread =
        message.channel.isThread() &&
        message.channel.parentId === this.config.bidding_channel_id;

      if (isAuctionThread) {
        // Only respond to bid-like patterns
        const content = message.content.trim().toLowerCase();
        const looksLikeBid =
          /^\d+/.test(content) ||
          /\b(bid|taya|pusta|lagay)\b/i.test(content);
        return looksLikeBid;
      }
    }

    // Otherwise, passive learning only (no response)
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PASSIVE LEARNING (from all messages)
  // ═════════════════════════════════════════════════════════════════════════

  async learnFromMessage(message) {
    if (!LEARNING_CONFIG.activationModes.passiveLearning) return;

    this.stats.messagesAnalyzed++;

    // Add to recent messages buffer
    this.recentMessages.push({
      userId: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: Date.now(),
      channelId: message.channel.id,
    });

    // Keep buffer size limited
    if (this.recentMessages.length > LEARNING_CONFIG.storage.maxRecentMessages) {
      this.recentMessages.shift();
    }

    // Detect and track language preference
    const language = this.detectLanguage(message.content);
    this.updateUserLanguagePreference(message.author.id, message.author.username, language);

    // Try to interpret using learned patterns (no response, just for tracking)
    const interpretation = await this.interpretMessage(message, false);

    // If no interpretation found, track as unrecognized
    if (!interpretation) {
      this.trackUnrecognizedPhrase(message.content, message.author.id);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MESSAGE INTERPRETATION (with learned patterns)
  // ═════════════════════════════════════════════════════════════════════════

  async interpretMessage(message, shouldRespond = true) {
    const content = message.content.trim();

    // Skip if it's a ! command
    if (content.startsWith('!')) return null;

    // Try learned patterns first
    const learnedInterpretation = this.tryLearnedPatterns(content);
    if (learnedInterpretation) {
      this.stats.successfulInterpretations++;
      return learnedInterpretation;
    }

    // Fall back to static handler
    const staticInterpretation = this.staticHandler.interpretMessage(message);
    if (staticInterpretation) {
      this.stats.successfulInterpretations++;

      // If this static pattern works well, consider learning it
      this.considerLearningPattern(content, staticInterpretation.command, staticInterpretation.params);

      return {
        command: staticInterpretation.command,
        params: staticInterpretation.params,
        confidence: 0.8, // Static patterns have high confidence
        source: 'static',
      };
    }

    // No interpretation found
    this.stats.failedInterpretations++;
    return null;
  }

  tryLearnedPatterns(content) {
    const normalized = content.toLowerCase().trim();

    for (const [phrase, pattern] of this.learnedPatterns.entries()) {
      // Skip low-confidence patterns
      if (pattern.confidence < LEARNING_CONFIG.learning.initialConfidence) continue;

      // Try exact match
      if (normalized === phrase.toLowerCase()) {
        pattern.usageCount++;
        pattern.lastUsed = new Date().toISOString();
        return {
          command: pattern.command,
          params: pattern.params || [],
          confidence: pattern.confidence,
          source: 'learned',
        };
      }

      // Try regex pattern match (if paramPattern exists)
      if (pattern.paramPattern) {
        try {
          const regex = new RegExp(pattern.paramPattern, 'i');
          const match = content.match(regex);
          if (match) {
            pattern.usageCount++;
            pattern.lastUsed = new Date().toISOString();
            return {
              command: pattern.command,
              params: match.slice(1), // Extract captured groups
              confidence: pattern.confidence,
              source: 'learned',
            };
          }
        } catch (e) {
          console.warn(`Invalid regex pattern: ${pattern.paramPattern}`);
        }
      }
    }

    return null;
  }

  considerLearningPattern(phrase, command, params = []) {
    const key = phrase.toLowerCase().trim();

    // If already learned, boost confidence
    if (this.learnedPatterns.has(key)) {
      const pattern = this.learnedPatterns.get(key);
      pattern.usageCount++;
      pattern.confidence = Math.min(
        pattern.confidence + LEARNING_CONFIG.learning.confirmationBoost,
        LEARNING_CONFIG.learning.maxConfidence
      );
      pattern.lastUsed = new Date().toISOString();
      return;
    }

    // New pattern - add with initial confidence
    const paramPattern = params.length > 0 ? `(\\d+)` : null; // Simple param extraction

    this.learnedPatterns.set(key, {
      phrase: key,
      command,
      params,
      paramPattern,
      confidence: LEARNING_CONFIG.learning.initialConfidence,
      usageCount: 1,
      learnedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      learnedFrom: 'system',
      successRate: 1.0,
      notes: 'Learned from static handler success',
    });

    this.stats.patternsLearned++;
    console.log(`🧠 [NLP Learning] New pattern: "${key}" → ${command}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LANGUAGE DETECTION
  // ═════════════════════════════════════════════════════════════════════════

  detectLanguage(content) {
    const normalized = content.toLowerCase();
    const words = normalized.split(/\s+/);

    let scores = { en: 0, tl: 0, taglish: 0 };

    // Count matches for each language
    for (const word of words) {
      if (LEARNING_CONFIG.languages.tagalog.some((w) => word.includes(w))) {
        scores.tl++;
      }
      if (LEARNING_CONFIG.languages.english.some((w) => word.includes(w))) {
        scores.en++;
      }
    }

    // Check for Taglish patterns
    const hasTagalog = scores.tl > 0;
    const hasEnglish = scores.en > 0;
    if (hasTagalog && hasEnglish) {
      return 'taglish';
    }

    // Determine primary language
    if (scores.tl > scores.en) return 'tl';
    if (scores.en > scores.tl) return 'en';

    return 'unknown';
  }

  updateUserLanguagePreference(userId, username, language) {
    if (!this.userPreferences.has(userId)) {
      this.userPreferences.set(userId, {
        userId,
        username,
        language: 'unknown',
        languageScores: { en: 0, tl: 0, taglish: 0 },
        messageCount: 0,
        shortcuts: {},
        learningEnabled: true,
        lastUpdated: new Date().toISOString(),
        notes: '',
      });
    }

    const pref = this.userPreferences.get(userId);
    pref.messageCount++;
    pref.lastUpdated = new Date().toISOString();

    if (language !== 'unknown') {
      pref.languageScores[language]++;

      // Update preferred language based on highest score
      const maxLang = Object.keys(pref.languageScores).reduce((a, b) =>
        pref.languageScores[a] > pref.languageScores[b] ? a : b
      );
      pref.language = maxLang;
    }

    this.stats.languageDistribution[language]++;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // UNRECOGNIZED PHRASES TRACKING
  // ═════════════════════════════════════════════════════════════════════════

  trackUnrecognizedPhrase(content, userId) {
    // Skip very short phrases or pure numbers
    if (content.length < 3 || /^\d+$/.test(content)) return;

    // Skip if it looks like casual conversation
    if (content.split(/\s+/).length > 10) return;

    const key = content.toLowerCase().trim();

    if (!this.unrecognizedPhrases.has(key)) {
      this.unrecognizedPhrases.set(key, {
        phrase: key,
        count: 0,
        userCount: 0,
        users: new Set(),
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        suggestedCommand: null,
        status: 'Pending Review',
      });
    }

    const entry = this.unrecognizedPhrases.get(key);
    entry.count++;
    entry.users.add(userId);
    entry.userCount = entry.users.size;
    entry.lastSeen = new Date().toISOString();

    // Limit size
    if (this.unrecognizedPhrases.size > LEARNING_CONFIG.storage.maxUnrecognizedPhrases) {
      // Remove oldest entries
      const sorted = Array.from(this.unrecognizedPhrases.entries())
        .sort((a, b) => a[1].count - b[1].count);
      this.unrecognizedPhrases.delete(sorted[0][0]);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PERSISTENCE
  // ═════════════════════════════════════════════════════════════════════════

  startSyncTimer() {
    this.syncTimer = setInterval(async () => {
      await this.syncToGoogleSheets();
    }, LEARNING_CONFIG.storage.syncInterval);

    console.log(`🧠 [NLP Learning] Sync timer started (every ${LEARNING_CONFIG.storage.syncInterval / 60000} minutes)`);
  }

  async loadFromGoogleSheets() {
    try {
      const sheetsUrl = this.config.google_apps_script_url;
      if (!sheetsUrl) {
        console.warn('🧠 [NLP Learning] No Google Sheets URL configured');
        return;
      }

      // Load learned patterns
      const patternsResponse = await axios.get(`${sheetsUrl}?action=getLearnedPatterns`, {
        timeout: 10000,
      });

      if (patternsResponse.data && patternsResponse.data.patterns) {
        for (const pattern of patternsResponse.data.patterns) {
          this.learnedPatterns.set(pattern.phrase, pattern);
        }
      }

      // Load user preferences
      const prefsResponse = await axios.get(`${sheetsUrl}?action=getUserPreferences`, {
        timeout: 10000,
      });

      if (prefsResponse.data && prefsResponse.data.preferences) {
        for (const pref of prefsResponse.data.preferences) {
          this.userPreferences.set(pref.userId, pref);
        }
      }

      this.lastSync = new Date();
      console.log('🧠 [NLP Learning] Loaded data from Google Sheets');
    } catch (error) {
      console.warn('🧠 [NLP Learning] Failed to load from Google Sheets:', error.message);
    }
  }

  async syncToGoogleSheets() {
    try {
      const sheetsUrl = this.config.google_apps_script_url;
      if (!sheetsUrl) return;

      // Prepare data
      const patterns = Array.from(this.learnedPatterns.values());
      const preferences = Array.from(this.userPreferences.values()).map(pref => ({
        ...pref,
        languageScores: pref.languageScores, // Already an object
        shortcuts: pref.shortcuts,
      }));
      const unrecognized = Array.from(this.unrecognizedPhrases.values()).map(u => ({
        ...u,
        exampleUsers: Array.from(u.users).slice(0, 5).join(', '),
      }));

      const payload = {
        patterns,
        preferences,
        unrecognized,
        recognitionRate: this.getRecognitionRate(),
      };

      await axios.post(`${sheetsUrl}?action=syncNLPLearning`, payload, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      });

      this.lastSync = new Date();
      console.log(`🧠 [NLP Learning] Synced ${patterns.length} patterns, ${preferences.length} users to Google Sheets`);
    } catch (error) {
      console.error('🧠 [NLP Learning] Sync failed:', error.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STATISTICS & REPORTING
  // ═════════════════════════════════════════════════════════════════════════

  getStatistics() {
    return {
      ...this.stats,
      learnedPatternsCount: this.learnedPatterns.size,
      usersTracked: this.userPreferences.size,
      unrecognizedCount: this.unrecognizedPhrases.size,
      recognitionRate: this.getRecognitionRate(),
      lastSync: this.lastSync,
    };
  }

  getRecognitionRate() {
    const total = this.stats.successfulInterpretations + this.stats.failedInterpretations;
    if (total === 0) return 0;
    return (this.stats.successfulInterpretations / total).toFixed(2);
  }

  getLearnedPatterns() {
    return Array.from(this.learnedPatterns.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  getUnrecognizedPhrases() {
    return Array.from(this.unrecognizedPhrases.values())
      .sort((a, b) => b.count - a.count);
  }

  getUserProfile(userId) {
    return this.userPreferences.get(userId) || null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MANUAL TEACHING (Admin commands)
  // ═════════════════════════════════════════════════════════════════════════

  teachPattern(phrase, command, adminUserId) {
    const key = phrase.toLowerCase().trim();

    this.learnedPatterns.set(key, {
      phrase: key,
      command,
      params: [],
      paramPattern: null,
      confidence: 0.95, // Admin-taught patterns have high confidence
      usageCount: 0,
      learnedAt: new Date().toISOString(),
      lastUsed: null,
      learnedFrom: adminUserId,
      successRate: 1.0,
      notes: 'Manually taught by admin',
    });

    this.stats.patternsLearned++;
    console.log(`🧠 [NLP Learning] Admin taught: "${key}" → ${command}`);

    return true;
  }

  clearLearned(phrase = null) {
    if (phrase) {
      const key = phrase.toLowerCase().trim();
      const deleted = this.learnedPatterns.delete(key);
      if (deleted) {
        console.log(`🧠 [NLP Learning] Cleared pattern: "${key}"`);
      }
      return deleted;
    } else {
      const count = this.learnedPatterns.size;
      this.learnedPatterns.clear();
      console.log(`🧠 [NLP Learning] Cleared all ${count} patterns`);
      return count;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { NLPLearningSystem, LEARNING_CONFIG };
