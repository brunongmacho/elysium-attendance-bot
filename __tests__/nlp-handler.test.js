/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NLP HANDLER TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the Natural Language Processing command handler that interprets
 * flexible user input and converts it to bot commands.
 *
 * Features tested:
 * - Intent detection from natural language
 * - Command extraction and parameter parsing
 * - Context-aware interpretation
 * - Pattern matching for various phrasings
 * - Channel-specific behavior
 *
 * @module __tests__/nlp-handler
 */

describe('NLP Handler', () => {
  let NLPHandler;
  let nlpHandler;
  let mockMessage;

  beforeEach(() => {
    // Import NLPHandler
    NLPHandler = require('../nlp-handler').NLPHandler;
    nlpHandler = new NLPHandler();

    // Mock Discord message
    mockMessage = {
      content: '',
      channel: {
        id: 'test-channel-123',
        isThread: () => false,
        parent: null,
      },
      author: {
        username: 'TestUser',
        id: 'user-123',
      },
    };
  });

  // ═════════════════════════════════════════════════════════════════════════
  // INTENT DETECTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('detectIntent()', () => {
    test('should detect bid intent from "bid 500"', () => {
      const intent = nlpHandler.detectIntent('bid 500');

      expect(intent).toHaveProperty('command', 'bid');
      expect(intent).toHaveProperty('params');
      expect(intent.params).toContain('500');
    });

    test('should detect bid intent from "i want to bid 300"', () => {
      const intent = nlpHandler.detectIntent('i want to bid 300');

      expect(intent.command).toBe('bid');
      expect(intent.params).toContain('300');
    });

    test('should detect points query from "how many points do i have"', () => {
      const intent = nlpHandler.detectIntent('how many points do i have');

      expect(intent.command).toBe('mypoints');
    });

    test('should detect points query from "my balance"', () => {
      const intent = nlpHandler.detectIntent('my balance');

      expect(intent.command).toBe('mypoints');
    });

    test('should detect leaderboard request', () => {
      const intent = nlpHandler.detectIntent('show me the leaderboard');

      expect(intent.command).toBe('leaderboard');
    });

    test('should detect attendance leaderboard specifically', () => {
      const intent = nlpHandler.detectIntent('show attendance leaderboard');

      expect(intent.command).toBe('leaderboardattendance');
    });

    test('should detect bidding leaderboard specifically', () => {
      const intent = nlpHandler.detectIntent('show bidding leaderboard');

      expect(intent.command).toBe('leaderboardbidding');
    });

    test('should return null for unrecognized input', () => {
      const intent = nlpHandler.detectIntent('random conversation text');

      expect(intent).toBeNull();
    });

    test('should be case-insensitive', () => {
      const intent = nlpHandler.detectIntent('BID 500');

      expect(intent.command).toBe('bid');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // BIDDING COMMAND TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Bidding Commands', () => {
    test('should parse "bid 250"', () => {
      const intent = nlpHandler.detectIntent('bid 250');

      expect(intent.command).toBe('bid');
      expect(intent.params[0]).toBe('250');
    });

    test('should parse "offer 400"', () => {
      const intent = nlpHandler.detectIntent('offer 400');

      expect(intent.command).toBe('bid');
      expect(intent.params[0]).toBe('400');
    });

    test('should parse "600 points"', () => {
      const intent = nlpHandler.detectIntent('600 points');

      expect(intent.command).toBe('bid');
      expect(intent.params[0]).toBe('600');
    });

    test('should parse "place a bid of 350"', () => {
      const intent = nlpHandler.detectIntent('place a bid of 350');

      expect(intent.command).toBe('bid');
      expect(intent.params[0]).toBe('350');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ADMIN COMMAND TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Admin Commands', () => {
    test('should detect "start the auction"', () => {
      const intent = nlpHandler.detectIntent('start the auction');

      expect(intent.command).toBe('startauction');
    });

    test('should detect "pause auction"', () => {
      const intent = nlpHandler.detectIntent('pause auction');

      expect(intent.command).toBe('pause');
    });

    test('should detect "resume the auction"', () => {
      const intent = nlpHandler.detectIntent('resume the auction');

      expect(intent.command).toBe('resume');
    });

    test('should detect "stop auction"', () => {
      const intent = nlpHandler.detectIntent('stop auction');

      expect(intent.command).toBe('stop');
    });

    test('should parse "extend by 30 seconds"', () => {
      const intent = nlpHandler.detectIntent('extend by 30');

      expect(intent.command).toBe('extend');
      expect(intent.params[0]).toBe('30');
    });

    test('should detect "skip this item"', () => {
      const intent = nlpHandler.detectIntent('skip this item');

      expect(intent.command).toBe('skipitem');
    });

    test('should detect "next item"', () => {
      const intent = nlpHandler.detectIntent('next item');

      expect(intent.command).toBe('skipitem');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // INTELLIGENCE COMMAND TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Intelligence Commands', () => {
    test('should detect price prediction request', () => {
      const intent = nlpHandler.detectIntent('predict price for Crimson Pendant');

      expect(intent.command).toBe('predictprice');
      expect(intent.params[0]).toBe('Crimson Pendant');
    });

    test('should detect "how much is Dragon Scale"', () => {
      const intent = nlpHandler.detectIntent('how much is Dragon Scale');

      expect(intent.command).toBe('predictprice');
      expect(intent.params[0]).toBe('Dragon Scale');
    });

    test('should detect engagement check for specific user', () => {
      const intent = nlpHandler.detectIntent('check engagement for PlayerName');

      expect(intent.command).toBe('engagement');
      expect(intent.params[0]).toBe('PlayerName');
    });

    test('should detect guild-wide engagement analysis', () => {
      const intent = nlpHandler.detectIntent('analyze guild engagement');

      expect(intent.command).toBe('analyzeengagement');
    });

    test('should detect anomaly detection request', () => {
      const intent = nlpHandler.detectIntent('detect anomalies');

      expect(intent.command).toBe('detectanomalies');
    });

    test('should detect recommendation request', () => {
      const intent = nlpHandler.detectIntent('show recommendations');

      expect(intent.command).toBe('recommendations');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CONTEXT AWARENESS TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('contextAwareInterpret()', () => {
    test('should interpret in auction thread context', () => {
      mockMessage.content = 'bid 500';
      mockMessage.channel.isThread = () => true;
      mockMessage.channel.parent = { id: 'bidding-channel-id' };

      const result = nlpHandler.contextAwareInterpret(mockMessage);

      expect(result).toHaveProperty('command', 'bid');
      expect(result).toHaveProperty('context', 'auction');
    });

    test('should interpret in admin logs context', () => {
      mockMessage.content = 'start auction';
      mockMessage.channel.id = 'admin-logs-id';

      const result = nlpHandler.contextAwareInterpret(mockMessage);

      expect(result).toHaveProperty('command', 'startauction');
      expect(result).toHaveProperty('context', 'admin');
    });

    test('should not interpret in guild chat by default', () => {
      mockMessage.content = 'bid 500';
      mockMessage.channel.id = 'guild-chat-id';

      const result = nlpHandler.contextAwareInterpret(mockMessage);

      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CONFIDENCE SCORING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Confidence Scoring', () => {
    test('should calculate confidence for exact match', () => {
      const intent = nlpHandler.detectIntent('bid 500');

      expect(intent).toHaveProperty('confidence');
      expect(intent.confidence).toBeGreaterThan(0.8);
    });

    test('should calculate confidence for fuzzy match', () => {
      const intent = nlpHandler.detectIntent('i want to maybe bid 500');

      expect(intent).toHaveProperty('confidence');
      expect(intent.confidence).toBeGreaterThan(0);
    });

    test('should not match below threshold', () => {
      const intent = nlpHandler.detectIntent('completely unrelated text');

      expect(intent).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PARAMETER EXTRACTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Parameter Extraction', () => {
    test('should extract numeric parameter from bid', () => {
      const intent = nlpHandler.detectIntent('bid 750');

      expect(intent.params[0]).toBe('750');
    });

    test('should extract item name from price prediction', () => {
      const intent = nlpHandler.detectIntent('predict price for Moonstone Ring');

      expect(intent.params[0]).toBe('Moonstone Ring');
    });

    test('should extract username from engagement check', () => {
      const intent = nlpHandler.detectIntent('check engagement for JohnDoe');

      expect(intent.params[0]).toBe('JohnDoe');
    });

    test('should handle commands without parameters', () => {
      const intent = nlpHandler.detectIntent('show leaderboard');

      expect(intent.params).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═════════════════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    test('should handle empty string', () => {
      const intent = nlpHandler.detectIntent('');

      expect(intent).toBeNull();
    });

    test('should handle whitespace only', () => {
      const intent = nlpHandler.detectIntent('   ');

      expect(intent).toBeNull();
    });

    test('should handle very long input', () => {
      const longInput = 'bid 500 ' + 'extra text '.repeat(100);
      const intent = nlpHandler.detectIntent(longInput);

      expect(intent).not.toBeNull();
      expect(intent.command).toBe('bid');
    });

    test('should handle special characters in item names', () => {
      const intent = nlpHandler.detectIntent('predict price for Dragon\'s Scale +5');

      expect(intent.command).toBe('predictprice');
      expect(intent.params[0]).toContain('Dragon');
    });
  });
});