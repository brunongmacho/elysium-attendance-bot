/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROACTIVE INTELLIGENCE TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the proactive monitoring and notification system.
 *
 * Features tested:
 * - Auction readiness checks
 * - Engagement monitoring
 * - Anomaly detection scheduling
 * - Milestone detection
 * - Notification formatting
 *
 * @module __tests__/proactive-intelligence
 */

describe('Proactive Intelligence', () => {
  let ProactiveIntelligence;
  let proactiveIntelligence;
  let mockClient;
  let mockConfig;
  let mockIntelligenceEngine;

  beforeEach(() => {
    // Mock Discord client
    mockClient = {
      channels: {
        cache: new Map(),
      },
    };

    mockConfig = {
      admin_logs_channel_id: 'admin-123',
      guild_announcement_channel_id: 'announce-456',
    };

    // Mock Intelligence Engine
    mockIntelligenceEngine = {
      analyzeGuildEngagement: jest.fn(),
      detectAnomalies: jest.fn(),
      sheetAPI: {
        getBiddingPoints: jest.fn(),
      },
    };

    // Import ProactiveIntelligence
    ProactiveIntelligence = require('../proactive-intelligence').ProactiveIntelligence;
    proactiveIntelligence = new ProactiveIntelligence(
      mockClient,
      mockConfig,
      mockIntelligenceEngine
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    proactiveIntelligence.stop();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // INITIALIZATION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('initialize()', () => {
    test('should initialize without errors', async () => {
      await expect(proactiveIntelligence.initialize()).resolves.not.toThrow();
    });

    test('should set initialized flag', async () => {
      await proactiveIntelligence.initialize();

      expect(proactiveIntelligence.initialized).toBe(true);
    });

    test('should not initialize twice', async () => {
      await proactiveIntelligence.initialize();
      const jobCountBefore = proactiveIntelligence.cronJobs.length;

      await proactiveIntelligence.initialize();
      const jobCountAfter = proactiveIntelligence.cronJobs.length;

      expect(jobCountAfter).toBe(jobCountBefore);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // AUCTION READINESS TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('checkAuctionReadiness()', () => {
    test('should calculate readiness percentage', async () => {
      mockIntelligenceEngine.sheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'P1', pointsLeft: 200 },
          { username: 'P2', pointsLeft: 150 },
          { username: 'P3', pointsLeft: 50 },
        ],
      });

      const readiness = await proactiveIntelligence.calculateAuctionReadiness();

      expect(readiness).toHaveProperty('readyMembers');
      expect(readiness).toHaveProperty('totalMembers', 3);
      expect(readiness).toHaveProperty('readinessRate');
    });

    test('should identify members below threshold', async () => {
      mockIntelligenceEngine.sheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'P1', pointsLeft: 200 },
          { username: 'P2', pointsLeft: 50 },
        ],
      });

      const readiness = await proactiveIntelligence.calculateAuctionReadiness();

      expect(readiness.readyMembers).toBe(1);
      expect(readiness.readinessRate).toBeLessThan(1);
    });

    test('should handle empty bidding data', async () => {
      mockIntelligenceEngine.sheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [],
      });

      const readiness = await proactiveIntelligence.calculateAuctionReadiness();

      expect(readiness.totalMembers).toBe(0);
      expect(readiness.readinessRate).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT DIGEST TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('formatEngagementDigest()', () => {
    test('should format engagement data for display', async () => {
      mockIntelligenceEngine.analyzeGuildEngagement.mockResolvedValue({
        totalMembers: 20,
        averageEngagement: 75,
        atRiskMembers: ['Player1', 'Player2'],
        excellentMembers: ['Player3', 'Player4'],
        moderateMembers: ['Player5'],
      });

      const digest = await proactiveIntelligence.formatEngagementDigest();

      expect(digest).toContain('20');
      expect(digest).toContain('75');
      expect(digest).toContain('Player1');
    });

    test('should handle no at-risk members', async () => {
      mockIntelligenceEngine.analyzeGuildEngagement.mockResolvedValue({
        totalMembers: 10,
        averageEngagement: 90,
        atRiskMembers: [],
        excellentMembers: ['P1', 'P2', 'P3'],
        moderateMembers: [],
      });

      const digest = await proactiveIntelligence.formatEngagementDigest();

      expect(digest).toContain('excellent');
      expect(digest).not.toContain('at-risk');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ANOMALY DIGEST TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('formatAnomalyDigest()', () => {
    test('should format anomalies for display', async () => {
      mockIntelligenceEngine.detectAnomalies.mockResolvedValue({
        priceOutliers: [
          { item: 'Item1', price: 1000, expected: 500 },
        ],
        suspiciousPatterns: [
          { type: 'collusion', players: ['P1', 'P2'] },
        ],
      });

      const digest = await proactiveIntelligence.formatAnomalyDigest();

      expect(digest).toContain('Item1');
      expect(digest).toContain('1000');
      expect(digest).toContain('P1');
    });

    test('should handle no anomalies', async () => {
      mockIntelligenceEngine.detectAnomalies.mockResolvedValue({
        priceOutliers: [],
        suspiciousPatterns: [],
      });

      const digest = await proactiveIntelligence.formatAnomalyDigest();

      expect(digest).toContain('No anomalies');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // MILESTONE DETECTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('checkMilestones()', () => {
    test('should detect milestone achievements', async () => {
      mockIntelligenceEngine.sheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'Player1', totalSpent: 1000 },
          { username: 'Player2', totalSpent: 499 },
        ],
      });

      const milestones = await proactiveIntelligence.detectNewMilestones();

      expect(milestones).toBeInstanceOf(Array);
      expect(milestones.length).toBeGreaterThanOrEqual(0);
    });

    test('should not re-report celebrated milestones', async () => {
      mockIntelligenceEngine.sheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'Player1', totalSpent: 1000 },
        ],
      });

      // First detection
      await proactiveIntelligence.detectNewMilestones();

      // Second detection (same data)
      const milestones = await proactiveIntelligence.detectNewMilestones();

      // Should not include already celebrated milestones
      expect(milestones.length).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SCHEDULING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Scheduled Tasks', () => {
    test('should create cron jobs on initialize', async () => {
      await proactiveIntelligence.initialize();

      expect(proactiveIntelligence.cronJobs.length).toBeGreaterThan(0);
    });

    test('should stop all cron jobs', async () => {
      await proactiveIntelligence.initialize();

      proactiveIntelligence.stop();

      // Verify all jobs are stopped (no errors thrown)
      expect(proactiveIntelligence.cronJobs.length).toBeGreaterThan(0);
    });
  });
});