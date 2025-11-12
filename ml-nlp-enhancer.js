/**
 * ============================================================================
 * ML-ENHANCED NLP CONVERSATION
 * ============================================================================
 *
 * Improves natural language understanding for conversational AI
 * Learns context, sentiment, and user intent patterns
 *
 * FEATURES:
 * - Context-aware responses (remembers recent conversation)
 * - Sentiment analysis (detects frustration, confusion, happiness)
 * - Intent confidence scoring
 * - Learns from successful/failed interactions
 * - Lightweight - runs in Node.js without heavy ML libraries
 *
 * IMPROVEMENTS OVER CURRENT SYSTEM:
 * - Current: Pure regex pattern matching
 * - Enhanced: Pattern matching + context + sentiment + learning
 */

class MLNLPEnhancer {
  constructor() {
    // Conversation context (last 10 messages per user)
    this.conversationHistory = new Map(); // userId -> [{text, timestamp, intent, response}]
    this.contextWindow = 10;

    // Sentiment patterns (lightweight sentiment analysis)
    this.sentimentPatterns = {
      frustrated: [
        /(?:not\s+working|doesn'?t\s+work|failed|error|broken|wtf|wth|damn|shit)/i,
        /(?:di\s+gumana|ayaw|sira|hindi\s+gumagana|bakit|ano\s+ba|pakshet)/i,
      ],
      confused: [
        /(?:how|what|why|when|where|confused|don'?t\s+understand|help|ano|paano|saan)/i,
        /(?:hindi\s+ko\s+alam|di\s+ko\s+maintindihan|paano\s+ba)/i,
      ],
      happy: [
        /(?:thanks?|thank\s+you|awesome|great|nice|cool|salamat|astig|galing)/i,
        /(?:love\s+it|amazing|perfect|excellent|superb)/i,
      ],
      angry: [
        /(?:angry|mad|pissed|furious|galit|inis|badtrip|bwisit)/i,
        /(?:tang\s*ina|gago|putang|fuck|shit|damn)/i,
      ],
    };

    // Intent keywords with weights
    this.intentKeywords = {
      // Attendance related
      attendance: {
        keywords: ['attend', 'present', 'screenshot', 'ss', 'proof', 'dumalo', 'nandun'],
        weight: 1.0,
      },
      // Points related
      points: {
        keywords: ['points', 'pts', 'balance', 'how much', 'ilang', 'magkano'],
        weight: 1.0,
      },
      // Bidding related
      bidding: {
        keywords: ['bid', 'auction', 'pusta', 'taya', 'item', 'loot'],
        weight: 1.0,
      },
      // Boss/spawn related
      boss: {
        keywords: ['boss', 'spawn', 'next', 'kailan', 'when', 'schedule', 'rotation'],
        weight: 1.0,
      },
      // Help/guidance
      help: {
        keywords: ['help', 'how', 'paano', 'guide', 'commands', 'ano', 'what'],
        weight: 0.8,
      },
    };

    // Response templates with personality
    this.responseTemplates = {
      frustrated: [
        "Looks like you're having trouble! Let me help you out. What specifically isn't working?",
        "I see you're frustrated. No worries! Let's fix this together. Can you tell me more?",
        "Oops, something's not right? Don't worry, I got you! What's the issue?",
        'Mukhang may problema? Okay lang yan, tulungan kita! Ano yung issue?',
      ],
      confused: [
        "I can help clarify! What would you like to know?",
        "No worries if you're confused - I'm here to help! What's your question?",
        'Let me break it down for you. What are you trying to do?',
        'Nalilito ka? Normal lang yan! Ano yung gusto mo malaman?',
      ],
      happy: [
        "Glad I could help! Let me know if you need anything else! 😊",
        "You're welcome! Always happy to assist!",
        "Awesome! Don't hesitate to ask if you need more help!",
        'Walang anuman! Message lang anytime!',
      ],
      default: [
        "I'm not sure I understood that. Can you rephrase or use a command like !help?",
        'Hmm, not quite sure what you mean. Try !help to see what I can do!',
        'Di ko masyadong maintindihan. Try mo yung !help para makita lahat ng commands!',
      ],
    };

    // Learning data (successful intent recognitions)
    this.learnedPatterns = new Map(); // intent -> [{text, confidence, successful}]

    console.log('✅ ML NLP Enhancer initialized');
  }

  /**
   * Analyze message and provide enhanced understanding
   * @param {string} userId - User ID for context
   * @param {string} text - Message text
   * @param {Object} baseIntent - Intent from existing NLP system
   * @returns {Object} Enhanced analysis
   */
  async analyzeMessage(userId, text, baseIntent = null) {
    // Get conversation context
    const context = this.getContext(userId);

    // Detect sentiment
    const sentiment = this.detectSentiment(text);

    // Calculate intent confidence
    const intentAnalysis = this.analyzeIntent(text, context);

    // Determine best response strategy
    const responseStrategy = this.determineResponseStrategy(sentiment, intentAnalysis, context);

    // Store in context
    this.addToContext(userId, {
      text,
      timestamp: Date.now(),
      sentiment,
      intent: intentAnalysis.primaryIntent,
      confidence: intentAnalysis.confidence,
    });

    return {
      sentiment,
      intentAnalysis,
      responseStrategy,
      context: {
        hasRecentFrustration: this.hasRecentSentiment(context, 'frustrated', 3),
        hasRecentConfusion: this.hasRecentSentiment(context, 'confused', 3),
        conversationLength: context.length,
      },
    };
  }

  /**
   * Detect sentiment from text
   */
  detectSentiment(text) {
    const scores = {
      frustrated: 0,
      confused: 0,
      happy: 0,
      angry: 0,
      neutral: 1,
    };

    // Check each sentiment pattern
    for (const [sentiment, patterns] of Object.entries(this.sentimentPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          scores[sentiment] += 1;
          scores.neutral = 0;
        }
      }
    }

    // Find dominant sentiment
    let dominantSentiment = 'neutral';
    let maxScore = 0;

    for (const [sentiment, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantSentiment = sentiment;
      }
    }

    return {
      primary: dominantSentiment,
      score: maxScore,
      all: scores,
    };
  }

  /**
   * Analyze intent with keyword matching and context
   */
  analyzeIntent(text, context = []) {
    const intentScores = {};

    // Score each intent based on keywords
    for (const [intent, config] of Object.entries(this.intentKeywords)) {
      let score = 0;

      for (const keyword of config.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) {
          score += config.weight;
        }
      }

      if (score > 0) {
        intentScores[intent] = score;
      }
    }

    // Boost score if intent matches recent context
    if (context.length > 0) {
      const recentIntent = context[context.length - 1].intent;
      if (intentScores[recentIntent]) {
        intentScores[recentIntent] *= 1.2; // 20% boost for context continuity
      }
    }

    // Find primary intent
    let primaryIntent = null;
    let maxScore = 0;

    for (const [intent, score] of Object.entries(intentScores)) {
      if (score > maxScore) {
        maxScore = score;
        primaryIntent = intent;
      }
    }

    // Calculate confidence
    let confidence = 0;
    if (primaryIntent) {
      const totalScore = Object.values(intentScores).reduce((sum, s) => sum + s, 0);
      confidence = Math.min(maxScore / (totalScore + 0.1), 0.95);
    }

    return {
      primaryIntent,
      confidence,
      allIntents: intentScores,
      hasMultipleIntents: Object.keys(intentScores).length > 1,
    };
  }

  /**
   * Determine best response strategy
   */
  determineResponseStrategy(sentiment, intentAnalysis, context) {
    const strategy = {
      responseType: 'default',
      shouldSuggestHelp: false,
      shouldShowExamples: false,
      tone: 'neutral',
      templates: [],
    };

    // Handle frustration with empathy
    if (sentiment.primary === 'frustrated' || sentiment.primary === 'angry') {
      strategy.responseType = 'empathetic';
      strategy.shouldSuggestHelp = true;
      strategy.tone = 'helpful';
      strategy.templates = this.responseTemplates.frustrated;
    }

    // Handle confusion with guidance
    else if (sentiment.primary === 'confused') {
      strategy.responseType = 'educational';
      strategy.shouldShowExamples = true;
      strategy.tone = 'patient';
      strategy.templates = this.responseTemplates.confused;
    }

    // Handle happiness with encouragement
    else if (sentiment.primary === 'happy') {
      strategy.responseType = 'encouraging';
      strategy.tone = 'friendly';
      strategy.templates = this.responseTemplates.happy;
    }

    // Handle low confidence intent
    else if (intentAnalysis.confidence < 0.4) {
      strategy.responseType = 'clarifying';
      strategy.shouldSuggestHelp = true;
      strategy.templates = this.responseTemplates.default;
    }

    // Default
    else {
      strategy.templates = this.responseTemplates.default;
    }

    return strategy;
  }

  /**
   * Get suggested response based on strategy
   */
  getSuggestedResponse(strategy) {
    const templates = strategy.templates;
    if (templates.length === 0) {
      return "I'm here to help! Try using !help to see what I can do.";
    }

    // Pick random template for variety
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Get conversation context for user
   */
  getContext(userId) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    return this.conversationHistory.get(userId);
  }

  /**
   * Add message to context
   */
  addToContext(userId, entry) {
    const context = this.getContext(userId);
    context.push(entry);

    // Trim to context window
    if (context.length > this.contextWindow) {
      context.shift();
    }
  }

  /**
   * Check if user has recent sentiment
   */
  hasRecentSentiment(context, sentiment, windowSize = 3) {
    const recent = context.slice(-windowSize);
    return recent.some((entry) => entry.sentiment?.primary === sentiment);
  }

  /**
   * Learn from successful interaction
   */
  learnSuccess(intent, text, confidence) {
    if (!this.learnedPatterns.has(intent)) {
      this.learnedPatterns.set(intent, []);
    }

    const patterns = this.learnedPatterns.get(intent);
    patterns.push({
      text,
      confidence,
      successful: true,
      timestamp: Date.now(),
    });

    // Keep only last 100 patterns per intent
    if (patterns.length > 100) {
      patterns.shift();
    }
  }

  /**
   * Learn from failed interaction
   */
  learnFailure(intent, text) {
    if (!this.learnedPatterns.has(intent)) {
      this.learnedPatterns.set(intent, []);
    }

    const patterns = this.learnedPatterns.get(intent);
    patterns.push({
      text,
      successful: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Get learning statistics
   */
  getStats() {
    const stats = {
      totalPatterns: 0,
      successfulPatterns: 0,
      byIntent: {},
    };

    for (const [intent, patterns] of this.learnedPatterns.entries()) {
      const successful = patterns.filter((p) => p.successful).length;
      stats.totalPatterns += patterns.length;
      stats.successfulPatterns += successful;

      stats.byIntent[intent] = {
        total: patterns.length,
        successful,
        successRate: patterns.length > 0 ? (successful / patterns.length) * 100 : 0,
      };
    }

    return stats;
  }

  /**
   * Clear old context (memory management)
   */
  clearOldContext(maxAgeMs = 24 * 60 * 60 * 1000) {
    // Clear context older than 24 hours
    const cutoff = Date.now() - maxAgeMs;

    for (const [userId, context] of this.conversationHistory.entries()) {
      const filtered = context.filter((entry) => entry.timestamp > cutoff);

      if (filtered.length === 0) {
        this.conversationHistory.delete(userId);
      } else {
        this.conversationHistory.set(userId, filtered);
      }
    }
  }
}

module.exports = { MLNLPEnhancer };
