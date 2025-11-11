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
 * 2. SMART ACTIVATION
 *    - Responds when bot is @mentioned (any channel)
 *    - Auto-responds in admin-logs channel/threads
 *    - Auto-responds in auction threads (for bids)
 *    - Prevents interference with normal chat
 *
 * 3. FUZZY MATCHING (Typo Tolerance)
 *    - Handles spelling mistakes (max 2 character difference)
 *    - Recognizes shortcuts and variations
 *    - 75% similarity threshold for matches
 *    - Examples: "pints" → "points", "ilng" → "ilang"
 *
 * 4. SELF-IMPROVING PATTERNS (Auto-Learning with Popularity Tracking)
 *    - Learns patterns from user confirmations (✅ reactions)
 *    - Auto-suggests commands for unrecognized phrases
 *    - Uses fuzzy matching to guess intent (50%+ similarity)
 *    - SMART PIPELINE: Guild chat (passive) → Tracks phrase → Active channel → Prioritized suggestion
 *    - Popularity boost: Phrases seen multiple times get +5-25% confidence
 *    - Confidence scores improve over time (0.7 → 0.95+)
 *    - Patterns sync to Google Sheets every 5 minutes
 *    - Survives bot restarts (persistent storage)
 *
 * 5. MULTILINGUAL SUPPORT
 *    - Detects language per message (EN, TL, Taglish)
 *    - Learns user language preferences
 *    - Adapts to code-switching behavior
 *
 * 6. GOOGLE SHEETS PERSISTENCE
 *    - Syncs learned patterns every 5 minutes
 *    - Stores user preferences
 *    - Tracks unrecognized phrases
 *    - Daily analytics snapshots
 */

const axios = require('axios');
const levenshtein = require('fast-levenshtein');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { NLPHandler, NLP_PATTERNS } = require('./nlp-handler.js');
const { ConversationalAI } = require('./nlp-conversation.js');
const { SheetAPI } = require('./utils/sheet-api.js');

// Load comprehensive vocabularies (5000+ words each)
let ENGLISH_VOCABULARY = [];
let TAGALOG_VOCABULARY = [];
let TAGLISH_VOCABULARY = [];

try {
  ENGLISH_VOCABULARY = require('./nlp-vocabulary').ENGLISH_WORDS || [];
  TAGALOG_VOCABULARY = require('./nlp-vocabulary-tagalog').TAGALOG_WORDS || [];
  TAGLISH_VOCABULARY = require('./nlp-vocabulary-taglish').TAGLISH_PHRASES || [];
  console.log(`📚 [NLP] Loaded ${ENGLISH_VOCABULARY.length} English, ${TAGALOG_VOCABULARY.length} Tagalog, ${TAGLISH_VOCABULARY.length} Taglish terms`);
} catch (error) {
  console.log('📚 [NLP] Using built-in vocabulary (extended files not found)');
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEARNING_CONFIG = {
  // Activation modes
  activationModes: {
    respondOnMention: true,        // Respond when bot is @mentioned
    respondInAdminLogs: true,      // Respond to all commands in admin-logs channel/threads
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
    autoSuggest: true,             // Auto-suggest commands for unrecognized phrases
    suggestionThreshold: 0.6,      // Min similarity (0-1) to suggest a command (increased from 0.5 for fewer false positives)
  },

  // Fuzzy matching (handles typos and shortcuts)
  fuzzyMatching: {
    enabled: true,                 // Enable fuzzy string matching
    maxDistance: 2,                // Max Levenshtein distance (typos allowed)
    minLength: 4,                  // Min phrase length for fuzzy matching
    similarityThreshold: 0.75,     // Min similarity score (0-1) for fuzzy match
  },

  // Storage
  storage: {
    syncInterval: 30 * 60 * 1000,  // Sync to Google Sheets every 30 minutes (reduced from 5 min to reduce load)
    maxRecentMessages: 100,        // Keep last 100 messages for context
    maxUnrecognizedPhrases: 50,    // Track top 50 unrecognized phrases
  },

  // Semantic synonym mapping (makes bot smarter at understanding intent)
  synonyms: {
    // Leaderboard synonyms
    leaderboard: ['rankings', 'ranks', 'rank', 'top', 'leaders', 'scoreboard', 'standings', 'lb', 'board', 'mvp', 'hall of fame', 'legends'],

    // Points synonyms (gaming currency)
    mypoints: ['balance', 'points', 'pts', 'pnts', 'coins', 'credits', 'money', 'wallet', 'funds', 'dkp', 'currency', 'gold', 'cash', 'adena'],

    // Status synonyms
    bidstatus: ['status', 'stat', 'info', 'update', 'news', 'happening', 'current', 'active', 'ongoing'],

    // Bid synonyms (gaming terms)
    bid: ['offer', 'bet', 'wager', 'taya', 'pusta', 'put', 'throw in', 'go', 'call', 'raise', 'spend'],

    // Help synonyms
    help: ['commands', 'cmds', 'info', 'guide', 'assist', 'support', 'tutorial', 'instructions', 'noob', 'newbie', 'lost'],

    // Present synonyms (gaming participation)
    present: ['here', 'attending', 'attend', 'join', 'checkin', 'check-in', 'online', 'ready', 'available', 'in', 'coming', 'game'],

    // Loot synonyms (gaming rewards)
    loot: ['drops', 'rewards', 'items', 'prize', 'goodies', 'gear', 'equipment', 'treasure'],

    // Queue synonyms (gaming lineup)
    queuelist: ['queue', 'lineup', 'list', 'items', 'upcoming', 'next', 'pot', 'pool'],

    // Spawn synonyms (boss/raid)
    predictspawn: ['spawn', 'boss', 'raid', 'rb', 'epic', 'respawn', 'world boss', 'pop'],

    // Weekly synonyms
    weeklyreport: ['weekly', 'week', 'report', 'summary', 'stats', 'performance'],
  },

  // Language detection
  languages: {
    tagalog: [
      // Common Tagalog words
      'taya', 'pusta', 'ako', 'ko', 'ang', 'na', 'ng', 'ba', 'po',
      'ilang', 'ilan', 'magkano', 'tignan', 'tingnan', 'naman',
      'kumusta', 'kamusta', 'ano', 'anu', 'sino', 'saan',
      'natira', 'natitirang', 'meron', 'may', 'mayroon',
      'nandito', 'andito', 'dumating', 'nangyari', 'nangyayari',
      'pera', 'pondo', 'tira', 'natira', 'naiwan',
      'aktibo', 'balita', 'update', 'nangunguna', 'nangungunang',
      'lagay', 'magtaya', 'maglagay', 'ibabayad',
      // Gaming slang (Tagalog)
      'sumama', 'sasama', 'sali', 'sama', 'laro', 'game',
      'sipag', 'aktibo', 'bano', 'newbie', 'baguhan', 'bago',
      'magkanu', 'gastos', 'gugulin', 'pwede', 'kaya',
      'lalabas', 'lilitaw', 'kelan', 'kailan', 'susunod',
      'mahusay', 'magaling', 'tanggalin', 'alisin', 'wag',
      'laktawan', 'lumipat', 'lipat', 'ihinto', 'tigil',
      'ipagpatuloy', 'ituloy', 'tapusin', 'tapos', 'wakasan',
      'simulan', 'simula', 'ilista', 'listahan',
      // Pronouns and particles
      'siya', 'sila', 'kami', 'tayo', 'natin', 'namin',
      'pa', 'lang', 'lang', 'na', 'ba', 'nga', 'kasi', 'kaya',
    ],
    taglish: [
      'bid ko', 'points ko', 'ako bid', 'ako taya',
      'check ko', 'show ko', 'ilan na', 'how many pa',
      'status ba', 'update naman', 'pa lang', 'na lang',
      // Gaming slang (Taglish)
      'game na', 'ready ako', 'online ako', 'sali ako',
      'bano ako', 'noob ako', 'bago ako', 'newbie ako',
      'loot ba', 'items ba', 'boss ba', 'raid ba',
      'spawn ba', 'kailan ba', 'next ba',
    ],
    english: [
      'bid', 'points', 'my', 'how', 'many', 'show', 'check',
      'what', 'display', 'view', 'tell', 'give', 'remaining',
      'status', 'info', 'update', 'auction', 'leaderboard',
      'ranking', 'top', 'balance', 'left', 'count',
      // Gaming terms (English)
      'loot', 'drops', 'rewards', 'items', 'gear', 'equipment',
      'boss', 'raid', 'rb', 'epic', 'spawn', 'respawn',
      'online', 'ready', 'available', 'afk', 'brb',
      'guild', 'clan', 'team', 'party', 'roster',
      'mvp', 'noob', 'newbie', 'pro', 'gg', 'ez',
      'queue', 'lineup', 'next', 'upcoming', 'current',
    ],
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
    this.negativePatterns = new Map();     // phrase + command → { count, reason } - patterns that DON'T match
    this.pendingConfirmations = new Map(); // Confirmation prompts waiting for user response

    // Static NLP handler for fallback
    this.staticHandler = null;

    // Conversational AI for tagged messages
    this.conversationalAI = null;

    // Bot instance
    this.client = null;
    this.botUserId = null;
    this.config = null;
    this.sheetAPI = null;

    // Sync timer
    this.syncTimer = null;
    this.lastSync = null;
    this.isSyncing = false; // Flag to prevent concurrent syncs

    // Statistics
    this.stats = {
      messagesAnalyzed: 0,
      patternsLearned: 0,
      successfulInterpretations: 0,
      failedInterpretations: 0,
      languageDistribution: { en: 0, tl: 0, taglish: 0 },
      conversationsHandled: 0, // Track conversations
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

    // Initialize SheetAPI for fetching user stats
    this.sheetAPI = new SheetAPI(this.config.sheet_webhook_url);

    // Initialize static NLP handler for fallback
    this.staticHandler = new NLPHandler(this.config);

    // Initialize conversational AI with config and SheetAPI for stat-based roasts
    this.conversationalAI = new ConversationalAI(this, this.config, this.sheetAPI);

    console.log('🧠 [NLP Learning] Initializing system...');

    // Load learned patterns from Google Sheets
    await this.loadFromGoogleSheets();

    // Start periodic sync timer
    this.startSyncTimer();

    console.log(`🧠 [NLP Learning] Loaded ${this.learnedPatterns.size} patterns, ${this.userPreferences.size} user profiles`);
    console.log('🧠 [NLP Learning] Passive learning enabled (learns from all messages)');
    console.log('🧠 [NLP Learning] Active in: admin-logs, auction threads, @mentions');
    console.log('🔥 [NLP Learning] Stat-based trash talk system enabled!');

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

    // In admin-logs channel or thread (respond to all natural language commands)
    const isAdminLogs = message.channel.id === this.config.admin_logs_channel_id ||
                        (message.channel.isThread() && message.channel.parentId === this.config.admin_logs_channel_id);

    if (isAdminLogs) {
      return true;
    }

    // In auction thread (auto-respond to all commands)
    if (LEARNING_CONFIG.activationModes.respondInAuctionThreads) {
      const isAuctionThread =
        message.channel.isThread() &&
        message.channel.parentId === this.config.bidding_channel_id;

      if (isAuctionThread) {
        // Respond to all patterns in auction threads (bids, points, status, etc.)
        // This allows the learning system to improve from all command usage
        return true;
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

    // Validate message structure to prevent null reference errors
    if (!message || !message.author || !message.content || !message.channel) {
      console.warn('🧠 [NLP Learning] Invalid message structure, skipping learning');
      return;
    }

    this.stats.messagesAnalyzed++;

    // Add to recent messages buffer
    this.recentMessages.push({
      userId: message.author.id,
      username: message.author.username || 'Unknown',
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
    let content = message.content.trim();

    // Skip if it's a ! command
    if (content.startsWith('!')) return null;

    // Check if bot is mentioned
    const botMentioned = message.mentions.users.has(this.botUserId);

    // Strip bot mentions from the beginning (e.g., "<@123456789> how many points")
    content = content.replace(/^<@!?\d+>\s*/g, '').trim();

    // CRITICAL: Check for insults BEFORE command interpretation
    // Insults should be handled as conversation, not commands
    if (this.isInsult(content)) {
      console.log(`🚫 [NLP Learning] Detected insult, routing to conversation handler: "${content}"`);
      return null; // Let it fall through to conversation handling
    }

    // Try learned patterns first
    const learnedInterpretation = this.tryLearnedPatterns(content);
    if (learnedInterpretation) {
      this.stats.successfulInterpretations++;
      return learnedInterpretation;
    }

    // Fall back to static handler (pass botMentioned flag)
    const staticInterpretation = this.staticHandler.interpretMessage(message, botMentioned);
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

    // CRITICAL: Check if this matches a conversation pattern BEFORE fuzzy matching
    // This prevents conversational questions (like "sino master mo?") from being
    // incorrectly suggested as commands
    if (botMentioned || this.shouldRespond(message)) {
      const isConversational = this.isConversationalPattern(content);
      if (isConversational) {
        console.log(`💬 [NLP Learning] Detected conversational pattern, skipping command matching: "${content.substring(0, 50)}"`);
        return null; // Let it fall through to conversation handler
      }
    }

    // No interpretation found - try fuzzy matching to suggest commands (if enabled)
    if (LEARNING_CONFIG.learning.autoSuggest && shouldRespond && this.shouldRespond(message)) {
      const suggestion = this.suggestCommandForPhrase(content);
      if (suggestion && suggestion.confidence >= LEARNING_CONFIG.learning.suggestionThreshold) {
        // Offer to learn this pattern with user confirmation
        await this.offerToLearnPattern(message, content, suggestion.command, suggestion.confidence, suggestion.wasUnrecognized);
      }
    }

    // No interpretation found
    this.stats.failedInterpretations++;
    return null;
  }

  /**
   * Check if content matches a conversational pattern (not a command)
   * Uses multiple heuristics to detect conversational content:
   * 1. Explicit conversation patterns
   * 2. Question words about the bot itself
   * 3. Greetings and social phrases
   * 4. Meta questions about the bot's functionality
   *
   * @param {string} content - Message content
   * @returns {boolean} True if matches conversation pattern
   */
  isConversationalPattern(content) {
    if (!this.conversationalAI) return false;

    try {
      const normalized = content.toLowerCase().trim();

      // LAYER 1: Check explicit conversation patterns from ConversationalAI
      let CONVERSATION_PATTERNS;
      try {
        ({ CONVERSATION_PATTERNS } = require('./nlp-conversation.js'));
      } catch (reqError) {
        console.error('❌ [NLP Learning] Failed to load conversation patterns:', reqError.message);
        return false;
      }

      if (!CONVERSATION_PATTERNS || typeof CONVERSATION_PATTERNS !== 'object') {
        console.error('❌ [NLP Learning] Invalid CONVERSATION_PATTERNS structure');
        return false;
      }

      for (const [type, config] of Object.entries(CONVERSATION_PATTERNS)) {
        // Validate config structure
        if (!config || !config.patterns || !Array.isArray(config.patterns)) {
          console.warn(`⚠️ [NLP Learning] Invalid pattern config for type: ${type}`);
          continue;
        }

        for (const pattern of config.patterns) {
          // Validate pattern is a RegExp with test method
          if (pattern && typeof pattern.test === 'function') {
            try {
              if (pattern.test(content)) {
                console.log(`🎯 [NLP Learning] Matched conversation type: ${type}`);
                return true;
              }
            } catch (testError) {
              console.warn(`⚠️ [NLP Learning] Pattern test failed for ${type}:`, testError.message);
            }
          }
        }
      }

      // LAYER 2: Heuristic detection of conversational content
      // Questions about the bot itself (who/what are you, your creator, etc.)
      const botIdentityQuestions = [
        /\b(?:who|what|sino|ano)\s+(?:are|is|ka|ikaw|ang)\s+(?:you|your|mo|ng)/i,
        /\b(?:your|mo|ng)\s+(?:name|purpose|function|job|role|master|owner|creator|boss)/i,
        /\b(?:who|sino)\s+(?:made|created|built|gumawa|lumikha)/i,
        /\b(?:tell|sabihin|explain|ipaliliwanag)\s+(?:me\s+)?(?:about|tungkol)\s+(?:yourself|you)/i,
      ];

      for (const pattern of botIdentityQuestions) {
        if (pattern.test(normalized)) {
          console.log(`🎯 [NLP Learning] Detected bot identity question`);
          return true;
        }
      }

      // Greetings and social pleasantries (not commands)
      const socialPhrases = [
        /^(?:hi|hello|hey|sup|yo|kamusta|kumusta|musta|hoy)\b/i,
        /^(?:good\s+(?:morning|afternoon|evening|night)|magandang\s+(?:umaga|hapon|gabi))/i,
        /^(?:thank|thanks|salamat|tysm|ty|thx)/i,
        /^(?:sorry|pasensya|paumanhin)/i,
        /^(?:bye|goodbye|paalam|sige)/i,
        /^(?:congrats|congratulations|grats)/i,
      ];

      for (const pattern of socialPhrases) {
        if (pattern.test(normalized)) {
          console.log(`🎯 [NLP Learning] Detected social phrase/greeting`);
          return true;
        }
      }

      // Meta questions about bot capabilities (not specific commands)
      const metaQuestions = [
        /\b(?:can|could|pwede|kaya)\s+(?:you|mo)\s+(?:help|tulong)/i,
        /\b(?:what|ano)\s+(?:can|could)\s+(?:you|the bot)\s+do/i,
        /\b(?:how|paano)\s+(?:do|does|to)\s+(?:use|gamit)/i,
        /\b(?:teach|turuan|show|ipakita)\s+me\s+how/i,
      ];

      for (const pattern of metaQuestions) {
        if (pattern.test(normalized)) {
          console.log(`🎯 [NLP Learning] Detected meta question about bot capabilities`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ Error checking conversation pattern:', error);
      return false; // Fail gracefully
    }
  }

  /**
   * Handle conversational message (when bot is tagged but no command found)
   * @param {Message} message - Discord message
   * @returns {string|null} Conversational response or null
   */
  async handleConversation(message) {
    if (!this.conversationalAI) return null;

    try {
      // Strip bot mentions
      const content = message.content.replace(/^<@!?\d+>\s*/g, '').trim();

      // Get conversational response
      const response = await this.conversationalAI.handleConversation(message, content);

      if (response) {
        this.stats.conversationsHandled++;
        return response;
      }

      return null;
    } catch (error) {
      console.error('❌ Error in conversation handler:', error);
      return null;
    }
  }

  tryLearnedPatterns(content) {
    const normalized = content.toLowerCase().trim();
    let bestFuzzyMatch = null;
    let highestSimilarity = 0;

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
          source: 'learned-exact',
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
              source: 'learned-regex',
            };
          }
        } catch (e) {
          console.warn(`Invalid regex pattern: ${pattern.paramPattern}`);
        }
      }

      // Try fuzzy match (for typos and shortcuts)
      if (LEARNING_CONFIG.fuzzyMatching.enabled && normalized.length >= LEARNING_CONFIG.fuzzyMatching.minLength) {
        const phraseNormalized = phrase.toLowerCase();
        const distance = levenshtein.get(normalized, phraseNormalized);

        // Calculate similarity score (0-1)
        const maxLen = Math.max(normalized.length, phraseNormalized.length);
        const similarity = 1 - (distance / maxLen);

        // Check if within distance threshold and similarity threshold
        if (distance <= LEARNING_CONFIG.fuzzyMatching.maxDistance &&
            similarity >= LEARNING_CONFIG.fuzzyMatching.similarityThreshold) {

          // Track best fuzzy match
          if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestFuzzyMatch = {
              pattern,
              similarity,
              phrase: phraseNormalized,
            };
          }
        }
      }
    }

    // Return best fuzzy match if found
    if (bestFuzzyMatch) {
      const pattern = bestFuzzyMatch.pattern;
      pattern.usageCount++;
      pattern.lastUsed = new Date().toISOString();

      // Reduce confidence slightly for fuzzy matches
      const fuzzyConfidence = pattern.confidence * bestFuzzyMatch.similarity;

      return {
        command: pattern.command,
        params: pattern.params || [],
        confidence: fuzzyConfidence,
        source: 'learned-fuzzy',
        fuzzyMatch: {
          original: content,
          matched: bestFuzzyMatch.phrase,
          similarity: (bestFuzzyMatch.similarity * 100).toFixed(1) + '%',
        },
      };
    }

    return null;
  }

  considerLearningPattern(phrase, command, params = []) {
    // CRITICAL: Never learn insults as commands
    if (this.isInsult(phrase)) {
      console.log(`🚫 [NLP Learning] Refusing to learn insult as pattern: "${phrase}"`);
      return;
    }

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
  // AUTO-LEARNING WITH USER CONFIRMATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Suggest what command a phrase might mean using fuzzy matching + semantic understanding
   */
  suggestCommandForPhrase(phrase) {
    // CRITICAL: Never suggest commands for insults
    if (this.isInsult(phrase)) {
      console.log(`🚫 [NLP Learning] Refusing to suggest command for insult: "${phrase}"`);
      return null;
    }

    const normalized = phrase.toLowerCase().trim();
    const words = normalized.split(/\s+/);

    // CRITICAL: Block ambiguous single words that are too generic to learn safely
    // These words have multiple meanings or are too common in casual conversation
    const ambiguousWords = [
      // Generic status words (could mean many different things)
      'status', 'stat', 'stats', 'info', 'information',

      // Generic ranking words
      'top', 'rank', 'ranking', 'ranks', 'leaderboard',

      // Generic action words
      'show', 'view', 'check', 'see', 'get', 'give',

      // Generic attendance words without context
      'attendance', 'attend', 'present', 'here',

      // Generic points words
      'points', 'pts', 'point',

      // Generic boss words
      'boss', 'spawn', 'next', 'when',

      // Gaming slang (too ambiguous alone)
      'gg', 'wp', 'lol', 'haha', 'nice', 'cool', 'ok', 'okay',
    ];

    if (words.length === 1 && ambiguousWords.includes(normalized)) {
      console.log(`🚫 [NLP Learning] Refusing to learn ambiguous single word: "${phrase}"`);
      return null;
    }

    // Calculate conversational penalty - reduce confidence for phrases that look conversational
    const conversationalPenalty = this.calculateConversationalPenalty(normalized);
    if (conversationalPenalty > 0) {
      console.log(`📉 [NLP Learning] Applying ${(conversationalPenalty * 100).toFixed(0)}% conversational penalty to "${phrase.substring(0, 40)}"`);
    }

    // Get all known commands from static patterns
    const allCommands = Object.keys(NLP_PATTERNS);

    let bestMatch = null;
    let highestScore = 0;
    let matchReason = '';

    // Check if this phrase was seen before in passive learning (unrecognized phrases)
    const unrecognizedEntry = this.unrecognizedPhrases.get(normalized);
    const popularityBoost = unrecognizedEntry ? this.calculatePopularityBoost(unrecognizedEntry) : 0;

    // PRIORITY 1: Check semantic synonyms (exact match = high confidence)
    for (const [command, synonyms] of Object.entries(LEARNING_CONFIG.synonyms)) {
      for (const synonym of synonyms) {
        // Check if any word in phrase matches synonym
        if (words.includes(synonym)) {
          // Apply negative learning penalty if this combo was rejected
          const penalty = this.getNegativePenalty(normalized, `!${command}`);
          const penalizedScore = 0.95 * penalty;

          if (penalizedScore > highestScore) {
            highestScore = penalizedScore;
            bestMatch = `!${command}`;
            matchReason = penalty < 1
              ? `semantic match (with caution - rejected ${(1-penalty)*100}%)`
              : `semantic match: "${synonym}" → ${command}`;
          }
        }
      }
    }

    // PRIORITY 2: Fuzzy matching against command names and learned patterns
    for (const command of allCommands) {
      // Check similarity to command name itself
      const commandSimilarity = this.calculatePhraseSimilarity(normalized, command);
      const penalty = this.getNegativePenalty(normalized, `!${command}`);
      const penalizedScore = commandSimilarity * penalty;

      if (penalizedScore > highestScore) {
        highestScore = penalizedScore;
        bestMatch = `!${command}`;
        matchReason = `phrase similar to command name`;
      }

      // Check if any learned patterns for this command are similar
      for (const [learnedPhrase, pattern] of this.learnedPatterns.entries()) {
        if (pattern.command === `!${command}`) {
          const phraseSimilarity = this.calculatePhraseSimilarity(normalized, learnedPhrase);
          const penalizedSimilarity = phraseSimilarity * penalty;

          if (penalizedSimilarity > highestScore) {
            highestScore = penalizedSimilarity;
            bestMatch = `!${command}`;
            matchReason = `similar to learned pattern`;
          }
        }
      }
    }

    // PRIORITY 3: Ultra-short shortcuts (single words that are extremely common)
    const ultraShorts = {
      'pts': '!mypoints',
      'lb': '!leaderboard',
      'stat': '!bidstatus',
      'status': '!bidstatus',
      'points': '!mypoints',
      'ranks': '!leaderboard',
      'ranking': '!leaderboard',
      'balance': '!mypoints',
    };

    if (ultraShorts[normalized]) {
      const penalty = this.getNegativePenalty(normalized, ultraShorts[normalized]);
      const penalizedScore = 0.98 * penalty;

      if (penalizedScore > highestScore) {
        highestScore = penalizedScore;
        bestMatch = ultraShorts[normalized];
        matchReason = `ultra-short shortcut`;
      }
    }

    // Apply popularity boost (phrases seen frequently get higher confidence)
    if (popularityBoost > 0 && bestMatch) {
      let boostedScore = Math.min(highestScore + popularityBoost, 0.99);

      // Apply conversational penalty even to popular phrases
      boostedScore = boostedScore * (1 - conversationalPenalty);

      if (boostedScore >= LEARNING_CONFIG.learning.suggestionThreshold) {
        const seenCount = unrecognizedEntry ? unrecognizedEntry.count : 0;
        const userCount = unrecognizedEntry ? unrecognizedEntry.userCount : 0;

        return {
          command: bestMatch,
          confidence: boostedScore,
          reasoning: `${matchReason} + popularity (${seenCount} times, ${userCount} users) = ${(boostedScore * 100).toFixed(0)}%`,
          wasUnrecognized: true,
        };
      } else if (conversationalPenalty > 0) {
        console.log(`🚫 [NLP Learning] Popular phrase suggestion blocked by conversational penalty`);
      }
    }

    // Apply conversational penalty to final confidence
    if (bestMatch) {
      const finalConfidence = highestScore * (1 - conversationalPenalty);

      if (finalConfidence >= LEARNING_CONFIG.learning.suggestionThreshold) {
        return {
          command: bestMatch,
          confidence: finalConfidence,
          reasoning: matchReason || `${(finalConfidence * 100).toFixed(0)}% similar`,
        };
      } else if (conversationalPenalty > 0) {
        console.log(`🚫 [NLP Learning] Suggestion blocked by conversational penalty (${(highestScore * 100).toFixed(0)}% → ${(finalConfidence * 100).toFixed(0)}%)`);
      }
    }

    return null;
  }

  /**
   * Calculate penalty for conversational indicators
   * Returns a penalty multiplier (0-1) where higher = more conversational
   * @param {string} normalized - Normalized phrase
   * @returns {number} Penalty multiplier (0 = no penalty, 1 = full penalty)
   */
  calculateConversationalPenalty(normalized) {
    let penalty = 0;

    // Strong conversational indicators (80% penalty)
    const strongIndicators = [
      // Questions about the bot itself
      /\b(?:who|what|sino|ano)\s+(?:are|is|ka)\s+you/i,
      /\b(?:your|mo|ng)\s+(?:name|master|owner|creator|boss)/i,
      /\b(?:sino|who)\s+(?:.*?\s+)?(?:master|owner|creator|boss|amo|may\s+ari)\s+(?:mo|your)/i, // "sino master mo", "who your master"

      // Personal questions (Filipino & English)
      /\b(?:virgin|bakla|tomboy|bading|bayot)\s+(?:ka|pa|ba)/i, // "virgin ka pa ba?", "bakla ka ba?"
      /\b(?:ikaw|you)\s+(?:virgin|bakla|gay|tomboy)/i, // "ikaw virgin?", "you gay?"
      /\b(?:sex|kantutan|kantot|chicks|jowa)/i, // Sexual/relationship questions

      // Gaming taunts (single word or short phrases)
      /^(?:noob|n00b|newbie|trash|ez|rekt|pwned|owned|scrub)$/i,
      /^(?:git\s+gud|git\s+good|ez\s+clap|gg\s+ez)$/i,
      /\b(?:you\s+)?(?:noob|trash|garbage|bot\s+player)/i,

      // Greetings
      /^(?:hi|hello|hey|sup|yo|kumusta|kamusta)\b/i,
      /^good\s+(?:morning|afternoon|evening)/i,

      // Social pleasantries
      /^(?:thank|thanks|salamat|sorry|pasensya|congrats)/i,
      /^(?:bye|goodbye|paalam)/i,
    ];

    for (const indicator of strongIndicators) {
      if (indicator.test(normalized)) {
        penalty = Math.max(penalty, 0.8); // 80% penalty (blocks most suggestions)
        break;
      }
    }

    // Medium conversational indicators (20% penalty each, cumulative)
    const mediumIndicators = [
      // Question words in non-command context
      /\b(?:how|why|when|where)\s+(?:are|is|do|does|can|will)/i,

      // "Can you" / "Could you" questions
      /\b(?:can|could|pwede|kaya)\s+you/i,

      // Emotional expressions
      /\b(?:lol|haha|hehe|omg|wtf)\b/i,

      // Very short phrases (likely not commands)
      /^(?:ok|okay|ayos|nice|cool|gg|wp)\s*$/i,
    ];

    for (const indicator of mediumIndicators) {
      if (indicator.test(normalized)) {
        penalty = Math.min(penalty + 0.3, 1.0); // Add 30% penalty per match (max 100%)
      }
    }

    // Weak conversational indicators (10% penalty, cumulative)
    const weakIndicators = [
      // Ends with question mark
      /\?$/,

      // Contains multiple question words
      /(who|what|when|where|why|how|sino|ano|kailan|saan|bakit|paano).*\b(who|what|when|where|why|how|sino|ano|kailan|saan|bakit|paano)/i,

      // Very long phrases (>10 words - likely conversation)
      /^(\S+\s+){10,}/,
    ];

    for (const indicator of weakIndicators) {
      if (indicator.test(normalized)) {
        penalty = Math.min(penalty + 0.15, 1.0); // Add 15% penalty per match (max 100%)
      }
    }

    return penalty;
  }

  /**
   * Calculate confidence boost based on how popular an unrecognized phrase is
   * More usage = higher boost (shows it's an important phrase to learn)
   */
  calculatePopularityBoost(unrecognizedEntry) {
    // Boost based on frequency
    const frequencyBoost = Math.min(unrecognizedEntry.count * 0.05, 0.15); // Max +15% (3+ uses)

    // Boost based on unique users (shows it's not just one person)
    const userBoost = Math.min(unrecognizedEntry.userCount * 0.05, 0.10); // Max +10% (2+ users)

    return frequencyBoost + userBoost;
  }

  /**
   * Check if a phrase+command combination was rejected by users (negative learning)
   * Returns penalty multiplier (0-1) to reduce confidence
   */
  getNegativePenalty(phrase, command) {
    const key = `${phrase}::${command}`;
    const negative = this.negativePatterns.get(key);

    if (!negative) return 1.0; // No penalty

    // Forgiving approach: Allow mistakes
    // 1 rejection: 50% confidence penalty (still might suggest if base confidence is high)
    // 2+ rejections: Block completely (0% confidence)
    if (negative.count === 1) {
      return 0.5; // Reduce confidence by half - gives users second chance
    } else if (negative.count >= 2) {
      return 0.0; // Block completely after 2 rejections
    }

    return 1.0;
  }

  /**
   * Record that a phrase does NOT mean a specific command (negative learning)
   */
  recordNegativePattern(phrase, command) {
    const key = `${phrase.toLowerCase().trim()}::${command}`;

    if (!this.negativePatterns.has(key)) {
      this.negativePatterns.set(key, {
        phrase: phrase.toLowerCase().trim(),
        command,
        count: 0,
        firstRejected: new Date().toISOString(),
        lastRejected: new Date().toISOString(),
      });
    }

    const negative = this.negativePatterns.get(key);
    negative.count++;
    negative.lastRejected = new Date().toISOString();

    console.log(`🧠 [NLP Learning] Negative pattern recorded: "${phrase}" ≠ ${command} (${negative.count} rejections)`);
  }

  /**
   * Calculate similarity between two phrases (word-level fuzzy matching)
   */
  calculatePhraseSimilarity(phrase1, phrase2) {
    const words1 = phrase1.split(/\s+/);
    const words2 = phrase2.split(/\s+/);

    // Check for word overlap
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        const distance = levenshtein.get(word1, word2);
        const maxLen = Math.max(word1.length, word2.length);
        const similarity = 1 - (distance / maxLen);
        if (similarity >= 0.7) {
          matches++;
          break;
        }
      }
    }

    // Similarity score based on word overlap
    const totalWords = Math.max(words1.length, words2.length);
    return matches / totalWords;
  }

  /**
   * Offer to learn a pattern with user confirmation
   */
  async offerToLearnPattern(message, phrase, command, confidence, wasUnrecognized = false) {
    try {
      // CRITICAL: Never offer to learn insults
      if (this.isInsult(phrase)) {
        console.log(`🚫 [NLP Learning] Refusing to offer learning for insult: "${phrase}"`);
        return;
      }

      // Don't offer to learn if we've already offered recently for this phrase
      const key = phrase.toLowerCase().trim();
      if (this.pendingConfirmations && this.pendingConfirmations.has(key)) {
        return; // Already waiting for confirmation
      }

      // Send confirmation message
      const confidencePercent = (confidence * 100).toFixed(0);

      // Check if this was a popular phrase from passive learning
      const unrecognizedEntry = this.unrecognizedPhrases.get(key);
      const popularityNote = unrecognizedEntry
        ? `\n💡 *I've seen this ${unrecognizedEntry.count} times from ${unrecognizedEntry.userCount} users - seems popular!*`
        : '';

      // Create buttons for confirmation
      const confirmButton = new ButtonBuilder()
        .setCustomId(`nlp_confirm_${message.author.id}_${Date.now()}`)
        .setLabel('✅ Teach me this')
        .setStyle(ButtonStyle.Success)
        .setDisabled(false);

      const cancelButton = new ButtonBuilder()
        .setCustomId(`nlp_cancel_${message.author.id}_${Date.now()}`)
        .setLabel('❌ Ignore')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false);

      const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

      const reply = await message.reply({
        content: `🤔 I'm not sure what you mean, but maybe you want **${command}**? (${confidencePercent}% confident)${popularityNote}\n` +
          `Click a button below to respond.`,
        components: [row]
      });

      // Track pending confirmation
      this.pendingConfirmations.set(key, {
        phrase,
        command,
        confidence,
        messageId: reply.id,
        userId: message.author.id,
        timestamp: Date.now(),
      });

      // Set up button collector
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === message.author.id,
        time: 60000,
        max: 1
      });

      collector.on('collect', async (interaction) => {
        const isConfirm = interaction.customId.startsWith('nlp_confirm_');

        // Disable buttons after interaction (create fresh instances to prevent mutation)
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(confirmButton.data.custom_id)
            .setLabel(confirmButton.data.label)
            .setStyle(confirmButton.data.style)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(cancelButton.data.custom_id)
            .setLabel(cancelButton.data.label)
            .setStyle(cancelButton.data.style)
            .setDisabled(true)
        );

        if (isConfirm) {
          // Learn this pattern!
          const learned = this.teachPattern(phrase, command, interaction.user.id);

          if (!learned) {
            // Pattern was blocked (likely an insult)
            await interaction.update({
              content: `❌ Sorry, I can't learn that phrase - it contains inappropriate content.`,
              components: [disabledRow]
            });
            return;
          }

          // Remove from unrecognized phrases (now it's learned!)
          const normalizedKey = phrase.toLowerCase().trim();
          if (this.unrecognizedPhrases.has(normalizedKey)) {
            this.unrecognizedPhrases.delete(normalizedKey);
            console.log(`🧠 [NLP Learning] Removed from unrecognized (now learned): "${phrase}"`);
          }

          // Clear any negative learning for this combination (user confirmed it's correct!)
          const negKey = `${normalizedKey}::${command}`;
          if (this.negativePatterns.has(negKey)) {
            this.negativePatterns.delete(negKey);
            console.log(`🧠 [NLP Learning] Cleared negative pattern (user confirmed): "${phrase}" → ${command}`);
          }

          await interaction.update({
            content: `✅ Got it! I'll remember that **"${phrase}"** means **${command}**`,
            components: [disabledRow]
          });
          console.log(`🧠 [NLP Learning] User confirmed: "${phrase}" → ${command}`);
        } else {
          // NEGATIVE LEARNING: Remember this is NOT the right command
          this.recordNegativePattern(phrase, command);
          await interaction.update({
            content: `❌ Got it, **"${phrase}"** is NOT **${command}**. I'll be more careful next time.`,
            components: [disabledRow]
          });
          console.log(`🧠 [NLP Learning] User rejected: "${phrase}" ≠ ${command}`);
        }

        // Remove pending confirmation
        this.pendingConfirmations.delete(key);
      });

      collector.on('end', () => {
        // Clean up if no reaction
        this.pendingConfirmations.delete(key);
      });

    } catch (error) {
      console.error('🧠 [NLP Learning] Error offering pattern:', error);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LANGUAGE DETECTION
  // ═════════════════════════════════════════════════════════════════════════

  detectLanguage(content) {
    const normalized = content.toLowerCase();
    const words = normalized.split(/\s+/);

    let scores = { en: 0, tl: 0, taglish: 0 };

    // Use comprehensive vocabularies if available, otherwise use built-in
    const tagalogWords = TAGALOG_VOCABULARY.length > 0 ? TAGALOG_VOCABULARY : LEARNING_CONFIG.languages.tagalog;
    const englishWords = ENGLISH_VOCABULARY.length > 0 ? ENGLISH_VOCABULARY : LEARNING_CONFIG.languages.english;
    const taglishPhrases = TAGLISH_VOCABULARY.length > 0 ? TAGLISH_VOCABULARY : LEARNING_CONFIG.languages.taglish;

    // Check for exact phrase matches in Taglish first (more specific)
    for (const phrase of taglishPhrases) {
      if (normalized.includes(phrase.toLowerCase())) {
        scores.taglish += 3; // Higher weight for phrase matches
      }
    }

    // Count word matches for each language
    for (const word of words) {
      if (word.length < 2) continue; // Skip very short words

      // Check Tagalog
      if (tagalogWords.some((w) => w.toLowerCase() === word || word.includes(w.toLowerCase()))) {
        scores.tl++;
      }

      // Check English
      if (englishWords.some((w) => w.toLowerCase() === word || word.includes(w.toLowerCase()))) {
        scores.en++;
      }
    }

    // Check for Taglish (code-switching) - if both languages present or Taglish score high
    const hasTagalog = scores.tl > 0;
    const hasEnglish = scores.en > 0;

    if (scores.taglish > 0 || (hasTagalog && hasEnglish)) {
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
  // INSULT DETECTION & FILTERING
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Check if a phrase contains insults or inappropriate content
   * Prevents the system from learning offensive patterns
   * @param {string} content - The phrase to check
   * @returns {boolean} True if content contains insults
   */
  isInsult(content) {
    if (!content || typeof content !== 'string') return false;

    const normalized = content.toLowerCase().trim();

    try {
      let CONVERSATION_PATTERNS;
      try {
        ({ CONVERSATION_PATTERNS } = require('./nlp-conversation.js'));
      } catch (reqError) {
        console.error('❌ [NLP Learning] Failed to load conversation patterns for insult detection:', reqError.message);
        return false;
      }

      if (!CONVERSATION_PATTERNS || !CONVERSATION_PATTERNS.insult) {
        console.warn('⚠️ [NLP Learning] Insult patterns not found');
        return false;
      }

      // Check against all insult patterns from nlp-conversation.js
      if (CONVERSATION_PATTERNS.insult.patterns && Array.isArray(CONVERSATION_PATTERNS.insult.patterns)) {
        for (const pattern of CONVERSATION_PATTERNS.insult.patterns) {
          if (pattern && typeof pattern.test === 'function') {
            try {
              if (pattern.test(normalized)) {
                console.log(`🚫 [NLP Learning] Blocked insult pattern: "${content}"`);
                return true;
              }
            } catch (testError) {
              console.warn('⚠️ [NLP Learning] Insult pattern test failed:', testError.message);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ [NLP Learning] Error in insult detection:', error.message);
      return false;
    }

    // Additional check for common inappropriate words (backup filter)
    // Expanded to cover Filipino slang, text speak, regional variants, and English profanity
    const inappropriateWords = [
      // Core Filipino profanity
      'putang', 'tangina', 'tanginang', 'kinangina', 'kingina', 'putangina',
      'gago', 'gagong', 'gagohan', 'kagaguhan', 'ulol', 'kaulol',
      'tanga', 'bobo', 'katangahan', 'kabobohan',
      'puke', 'tite', 'kantot', 'kupal', 'supot',

      // Filipino profanity variants
      'hayop', 'hinayupak', 'bwisit', 'buwisit', 'bwiset', 'buset', 'bwesit', 'bweset',
      'leche', 'peste', 'tarantado', 'puta', 'pokpok',
      'pakyu', 'pakshet', 'pakingshet',
      'amputa', 'amfuta', 'amshet', 'amshit', 'ampucha', 'amputcha',
      'pucha', 'putcha', 'lintik', 'punyeta', 'walanghiya',

      // Filipino slang & insults
      'ungas', 'gunggong', 'shunga', 'engot', 'timang', 'abnoy', 'hudas',
      'gaga', 'salot', 'bruha', 'buwakaw', 'bano', 'hangal', 'mangmang',
      'inutil', 'basura', 'dumi', 'squammy', 'skwater',
      'epal', 'jejemon', 'jologs', 'baduy', 'palpak', 'sablay', 'bulok',

      // Text speak variants
      'tngnina', 'tngina', 'kngn', 'kngin', 'pksht', 'pkyou', 'fcku',
      'gg0', 'bb0', 'tng4', 'g4g0', 'ul0l', 'b0b0', 'bno', 'bnong',
      'ggng', 'gnggng', 'ngng', 'nggg',

      // Regional variants (Bisaya, Ilocano)
      'yawa', 'yawaa', 'yawaon', 'atay', 'buang', 'bugo', 'ambak',
      'giatay', 'unggoy', 'baboy', 'baboyan', 'pisting', 'pisot',
      'ukinnam', 'agkakapuy', 'sakim', 'takla',

      // English profanity
      'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard',
      'dumbass', 'smartass', 'jackass', 'asshole', 'dipshit',
      'stupid', 'idiot', 'moron', 'dumb', 'retard',

      // Gaming insults (Filipino)
      'mahina', 'duwag', 'lutang', 'feeder', 'pabigat', 'pasanin',

      // Gaming taunts (English/International)
      'noob', 'n00b', 'newbie', 'trash', 'garbage', 'scrub',
      'git gud', 'git good', 'ez clap', 'rekt', 'pwned', 'owned',
      'tryhard', 'hardstuck', 'bot player', 'iron player',

      // Personal/Sexual questions (Filipino & English)
      'virgin', 'birhen', 'bakla', 'tomboy', 'bayot',
      'sex', 'kantutan', 'chicks', 'bading', 'baktin',
      'jowa', 'girlfriend', 'boyfriend', 'kabit', 'kasal',

      // Common insult phrases (will match partial)
      'walang kwenta', 'walang silbi', 'walang utak', 'walang alam',
      'bugbog', 'talo ka', 'noob ka', 'bobo maglaro',
      'ka pa ba', 'ikaw ba', 'virgin ka', 'bading ka',
      'you virgin', 'you gay', 'you noob'
    ];

    for (const word of inappropriateWords) {
      if (normalized.includes(word)) {
        console.log(`🚫 [NLP Learning] Blocked inappropriate word: "${word}" in "${content}"`);
        return true;
      }
    }

    return false;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // UNRECOGNIZED PHRASES TRACKING
  // ═════════════════════════════════════════════════════════════════════════

  trackUnrecognizedPhrase(content, userId) {
    // Skip very short phrases or pure numbers
    if (content.length < 3 || /^\d+$/.test(content)) return;

    // Skip if it looks like casual conversation
    if (content.split(/\s+/).length > 10) return;

    // CRITICAL: Skip insults and inappropriate content
    if (this.isInsult(content)) {
      console.log(`🚫 [NLP Learning] Skipping insult from unrecognized tracking: "${content}"`);
      return;
    }

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
      // Remove least common phrase
      const sorted = Array.from(this.unrecognizedPhrases.entries())
        .sort((a, b) => a[1].count - b[1].count);

      if (sorted.length > 0) {
        this.unrecognizedPhrases.delete(sorted[0][0]);
        console.log(`🧹 [NLP Learning] Removed least common phrase: "${sorted[0][0]}" (count: ${sorted[0][1].count})`);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS PERSISTENCE
  // ═════════════════════════════════════════════════════════════════════════

  startSyncTimer() {
    this.syncTimer = setInterval(async () => {
      await this.syncToGoogleSheets();
    }, LEARNING_CONFIG.storage.syncInterval);

    // Also start cleanup timer for stale pending confirmations
    this.cleanupTimer = setInterval(() => {
      this.cleanupStalePendingConfirmations();
    }, 60000); // Run every minute

    console.log(`🧠 [NLP Learning] Sync timer started (every ${LEARNING_CONFIG.storage.syncInterval / 60000} minutes)`);
    console.log('🧹 [NLP Learning] Pending confirmation cleanup timer started (every 1 minute)');
  }

  /**
   * Clean up stale pending confirmations to prevent memory leak
   */
  cleanupStalePendingConfirmations() {
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes
    let cleanedCount = 0;

    for (const [key, data] of this.pendingConfirmations.entries()) {
      if (now - data.timestamp > MAX_AGE) {
        this.pendingConfirmations.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [NLP Learning] Cleaned up ${cleanedCount} stale pending confirmation(s)`);
    }
  }

  async loadFromGoogleSheets() {
    try {
      const sheetsUrl = this.config.sheet_webhook_url;
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

      // Load negative patterns
      const negativeResponse = await axios.get(`${sheetsUrl}?action=getNegativePatterns`, {
        timeout: 10000,
      });

      if (negativeResponse.data && negativeResponse.data.negativePatterns) {
        for (const neg of negativeResponse.data.negativePatterns) {
          const key = `${neg.phrase}::${neg.command}`;
          this.negativePatterns.set(key, neg);
        }
      }

      this.lastSync = new Date();
      console.log(`🧠 [NLP Learning] Loaded from Google Sheets: ${this.learnedPatterns.size} patterns, ${this.userPreferences.size} users, ${this.negativePatterns.size} negative patterns`);
    } catch (error) {
      console.warn('🧠 [NLP Learning] Failed to load from Google Sheets:', error.message);
    }
  }

  async syncToGoogleSheets() {
    // Prevent concurrent syncs (reduces memory pressure)
    if (this.isSyncing) {
      console.log('🧠 [NLP Learning] Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    const maxRetries = 2; // Reduced from 4 to avoid memory buildup
    const baseDelay = 2000; // 2 seconds

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const sheetsUrl = this.config.sheet_webhook_url;
          if (!sheetsUrl) return;

          // Prepare data with size limits to prevent memory pressure
          const patterns = Array.from(this.learnedPatterns.values()).slice(0, 200); // Limit patterns
          const preferences = Array.from(this.userPreferences.values())
            .slice(0, 100) // Limit users
            .map(pref => ({
              userId: pref.userId,
              username: pref.username,
              language: pref.language,
              languageScores: pref.languageScores,
              messageCount: pref.messageCount,
              lastUpdated: pref.lastUpdated,
              // Omit large objects like shortcuts to reduce payload
            }));
          const unrecognized = Array.from(this.unrecognizedPhrases.values())
            .slice(0, 50) // Limit unrecognized phrases
            .map(u => ({
              phrase: u.phrase,
              count: u.count,
              userCount: u.userCount,
              lastSeen: u.lastSeen,
              // Omit user sets to reduce payload size
            }));
          const negativePatterns = Array.from(this.negativePatterns.values()).slice(0, 50);

          const payload = {
            patterns,
            preferences,
            unrecognized,
            negativePatterns,
            recognitionRate: this.getRecognitionRate(),
          };

          const response = await axios.post(`${sheetsUrl}?action=syncNLPLearning`, payload, {
            timeout: 120000, // 120s timeout (increased from 45s to handle larger syncs)
            headers: { 'Content-Type': 'application/json' },
            maxContentLength: 10 * 1024 * 1024, // 10MB limit
          });

          // Check if sync was actually successful
          if (response.data && response.data.success === false) {
            console.error('🧠 [NLP Learning] Sync returned error:', response.data.message);
            return;
          }

          this.lastSync = new Date();
          console.log(`🧠 [NLP Learning] Synced ${patterns.length} patterns, ${preferences.length} users, ${negativePatterns.length} negative patterns to Google Sheets`);

          if (response.data && response.data.results) {
            const r = response.data.results;
            console.log(`🧠 [NLP Learning] Patterns: ${r.patterns.created} created, ${r.patterns.updated} updated`);
            console.log(`🧠 [NLP Learning] Preferences: ${r.preferences.created} created, ${r.preferences.updated} updated`);
            if (r.negativePatterns) {
              console.log(`🧠 [NLP Learning] Negative Patterns: ${r.negativePatterns.created} created, ${r.negativePatterns.updated} updated`);
            }
          }

          // Force garbage collection if available (helps with memory pressure)
          if (global.gc) {
            global.gc();
            // Removed verbose GC logging
          }

          // Success - break out of retry loop
          return;

        } catch (error) {
          const isTimeoutError = error.code === 'ECONNABORTED' || error.message.includes('timeout');
          const isRateLimitError = error.response && error.response.status === 429;
          const isLastAttempt = attempt === maxRetries;

          if ((isRateLimitError || isTimeoutError) && !isLastAttempt) {
            const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s
            // Only log retry on first attempt to reduce log spam
            if (attempt === 0) {
              console.warn(`🧠 [NLP Learning] ${isTimeoutError ? 'Timeout' : 'Rate limit'}. Retrying silently with backoff...`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Retry
          }

          // Log error and exit on last attempt or non-recoverable errors
          console.error('🧠 [NLP Learning] Sync failed:', error.message);
          if (error.response && !isTimeoutError) {
            // Only log first 200 chars to reduce memory/log spam
            const responseData = typeof error.response.data === 'string'
              ? error.response.data.substring(0, 200)
              : JSON.stringify(error.response.data).substring(0, 200);
            console.error('🧠 [NLP Learning] Response:', responseData);
          }

          if (isLastAttempt) {
            console.error('🧠 [NLP Learning] Max retries reached. Will try again on next sync cycle.');
          }
          return;
        }
      }
    } finally {
      // Always reset syncing flag, even on errors
      this.isSyncing = false;
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
    // CRITICAL: Prevent admins from accidentally teaching insults
    if (this.isInsult(phrase)) {
      console.log(`🚫 [NLP Learning] Admin attempted to teach insult: "${phrase}" - BLOCKED`);
      return false;
    }

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
