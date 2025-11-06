/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTELLIGENCE ENGINE TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the AI/ML intelligence system providing predictive analytics,
 * fraud detection, and smart recommendations.
 *
 * Features tested:
 * - Item price prediction with confidence scoring
 * - Member engagement prediction and scoring
 * - Anomaly detection (collusion, suspicious patterns)
 * - Historical data analysis
 * - Statistical calculations
 *
 * @module __tests__/intelligence-engine
 */

describe('Intelligence Engine', () => {
  let IntelligenceEngine;
  let intelligenceEngine;
  let mockClient;
  let mockConfig;
  let mockSheetAPI;
  let mockLearningSystem;

  beforeEach(() => {
    // Mock Discord client
    mockClient = {
      channels: {
        cache: new Map(),
      },
    };

    mockConfig = {
      admin_logs_channel_id: 'admin-123',
      bidding_channel_id: 'bidding-456',
    };

    // Mock SheetAPI
    mockSheetAPI = {
      getForDistribution: jest.fn(),
      getBiddingPoints: jest.fn(),
      getTotalAttendance: jest.fn(),
    };

    // Mock LearningSystem
    mockLearningSystem = {
      savePrediction: jest.fn(),
      adjustConfidence: jest.fn(),
    };

    // Import IntelligenceEngine
    IntelligenceEngine = require('../intelligence-engine').IntelligenceEngine;
    intelligenceEngine = new IntelligenceEngine(mockClient, mockConfig, mockSheetAPI);
    intelligenceEngine.learningSystem = mockLearningSystem;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // INITIALIZATION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('initialize()', () => {
    test('should initialize with learning system', async () => {
      await intelligenceEngine.initialize(mockLearningSystem);

      expect(intelligenceEngine.learningSystem).toBe(mockLearningSystem);
    });

    test('should load historical data on initialization', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { itemName: 'Item1', bidAmount: 100 },
          { itemName: 'Item2', bidAmount: 200 },
        ],
      });

      await intelligenceEngine.initialize(mockLearningSystem);

      expect(mockSheetAPI.getForDistribution).toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PRICE PREDICTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('predictItemPrice()', () => {
    beforeEach(() => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { itemName: 'Crimson Pendant', bidAmount: 450, winner: 'Player1' },
          { itemName: 'Crimson Pendant', bidAmount: 480, winner: 'Player2' },
          { itemName: 'Crimson Pendant', bidAmount: 460, winner: 'Player3' },
          { itemName: 'Other Item', bidAmount: 200, winner: 'Player4' },
        ],
      });
    });

    test('should predict price based on historical data', async () => {
      const prediction = await intelligenceEngine.predictItemPrice('Crimson Pendant');

      expect(prediction).toHaveProperty('itemName', 'Crimson Pendant');
      expect(prediction).toHaveProperty('predictedPrice');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('priceRange');
      expect(prediction.predictedPrice).toBeGreaterThan(0);
    });

    test('should calculate confidence based on sample size', async () => {
      const prediction = await intelligenceEngine.predictItemPrice('Crimson Pendant');

      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(100);
    });

    test('should provide price range (min/max)', async () => {
      const prediction = await intelligenceEngine.predictItemPrice('Crimson Pendant');

      expect(prediction.priceRange).toHaveProperty('min');
      expect(prediction.priceRange).toHaveProperty('max');
      expect(prediction.priceRange.min).toBeLessThanOrEqual(prediction.predictedPrice);
      expect(prediction.priceRange.max).toBeGreaterThanOrEqual(prediction.predictedPrice);
    });

    test('should return low confidence for items with no history', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [],
      });

      const prediction = await intelligenceEngine.predictItemPrice('Unknown Item');

      expect(prediction.confidence).toBeLessThan(50);
      expect(prediction.predictedPrice).toBe(100); // Default fallback
    });

    test('should save prediction to learning system', async () => {
      mockLearningSystem.savePrediction.mockResolvedValue({ predictionId: 123 });

      await intelligenceEngine.predictItemPrice('Test Item');

      expect(mockLearningSystem.savePrediction).toHaveBeenCalledWith(
        'price_prediction',
        'Test Item',
        expect.any(Number),
        expect.any(Number),
        expect.any(Object)
      );
    });

    test('should adjust confidence using learning system', async () => {
      mockLearningSystem.adjustConfidence.mockResolvedValue(85);

      const prediction = await intelligenceEngine.predictItemPrice('Crimson Pendant');

      expect(mockLearningSystem.adjustConfidence).toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT PREDICTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('predictMemberEngagement()', () => {
    beforeEach(() => {
      mockSheetAPI.getTotalAttendance.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'ActivePlayer', attendancePoints: 25 },
          { username: 'InactivePlayer', attendancePoints: 5 },
        ],
      });

      mockSheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'ActivePlayer', biddingPoints: 500, totalSpent: 1000 },
          { username: 'InactivePlayer', biddingPoints: 300, totalSpent: 100 },
        ],
      });
    });

    test('should calculate engagement score for member', async () => {
      const engagement = await intelligenceEngine.predictMemberEngagement('ActivePlayer');

      expect(engagement).toHaveProperty('username', 'ActivePlayer');
      expect(engagement).toHaveProperty('engagementScore');
      expect(engagement.engagementScore).toBeGreaterThanOrEqual(0);
      expect(engagement.engagementScore).toBeLessThanOrEqual(100);
    });

    test('should identify high engagement members', async () => {
      const engagement = await intelligenceEngine.predictMemberEngagement('ActivePlayer');

      expect(engagement.riskLevel).toBe('excellent');
    });

    test('should identify low engagement members', async () => {
      const engagement = await intelligenceEngine.predictMemberEngagement('InactivePlayer');

      expect(engagement.riskLevel).toBe('at-risk');
    });

    test('should provide attendance metrics', async () => {
      const engagement = await intelligenceEngine.predictMemberEngagement('ActivePlayer');

      expect(engagement).toHaveProperty('attendanceRate');
      expect(engagement).toHaveProperty('totalAttendance');
    });

    test('should handle member not found', async () => {
      const engagement = await intelligenceEngine.predictMemberEngagement('UnknownPlayer');

      expect(engagement).toHaveProperty('username', 'UnknownPlayer');
      expect(engagement.engagementScore).toBe(0);
      expect(engagement.riskLevel).toBe('at-risk');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GUILD-WIDE ENGAGEMENT ANALYSIS TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('analyzeGuildEngagement()', () => {
    beforeEach(() => {
      mockSheetAPI.getTotalAttendance.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'Player1', attendancePoints: 30 },
          { username: 'Player2', attendancePoints: 20 },
          { username: 'Player3', attendancePoints: 5 },
        ],
      });

      mockSheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'Player1', biddingPoints: 500, totalSpent: 2000 },
          { username: 'Player2', biddingPoints: 300, totalSpent: 1000 },
          { username: 'Player3', biddingPoints: 200, totalSpent: 100 },
        ],
      });
    });

    test('should analyze entire guild engagement', async () => {
      const analysis = await intelligenceEngine.analyzeGuildEngagement();

      expect(analysis).toHaveProperty('totalMembers');
      expect(analysis).toHaveProperty('averageEngagement');
      expect(analysis).toHaveProperty('atRiskMembers');
      expect(analysis).toHaveProperty('excellentMembers');
    });

    test('should categorize members by engagement level', async () => {
      const analysis = await intelligenceEngine.analyzeGuildEngagement();

      expect(analysis.atRiskMembers).toBeInstanceOf(Array);
      expect(analysis.excellentMembers).toBeInstanceOf(Array);
      expect(analysis.moderateMembers).toBeInstanceOf(Array);
    });

    test('should calculate average engagement score', async () => {
      const analysis = await intelligenceEngine.analyzeGuildEngagement();

      expect(analysis.averageEngagement).toBeGreaterThanOrEqual(0);
      expect(analysis.averageEngagement).toBeLessThanOrEqual(100);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ANOMALY DETECTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('detectAnomalies()', () => {
    test('should detect price outliers', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { itemName: 'Item', bidAmount: 100, winner: 'P1' },
          { itemName: 'Item', bidAmount: 110, winner: 'P2' },
          { itemName: 'Item', bidAmount: 500, winner: 'P3' }, // Outlier
        ],
      });

      const anomalies = await intelligenceEngine.detectAnomalies();

      expect(anomalies).toHaveProperty('priceOutliers');
      expect(anomalies.priceOutliers.length).toBeGreaterThan(0);
    });

    test('should detect collusion patterns', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { itemName: 'Item1', bidAmount: 100, winner: 'PlayerA', totalBids: 2 },
          { itemName: 'Item2', bidAmount: 100, winner: 'PlayerA', totalBids: 2 },
          { itemName: 'Item3', bidAmount: 100, winner: 'PlayerA', totalBids: 2 },
          { itemName: 'Item4', bidAmount: 100, winner: 'PlayerA', totalBids: 2 },
        ],
      });

      const anomalies = await intelligenceEngine.detectAnomalies();

      expect(anomalies).toHaveProperty('suspiciousPatterns');
    });

    test('should return empty arrays when no anomalies', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { itemName: 'Item', bidAmount: 100, winner: 'P1' },
          { itemName: 'Item', bidAmount: 105, winner: 'P2' },
        ],
      });

      const anomalies = await intelligenceEngine.detectAnomalies();

      expect(anomalies.priceOutliers).toEqual([]);
      expect(anomalies.suspiciousPatterns).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // STATISTICAL HELPER TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Statistical Helpers', () => {
    test('calculateMean() should calculate average', () => {
      const mean = intelligenceEngine.calculateMean([10, 20, 30, 40, 50]);
      expect(mean).toBe(30);
    });

    test('calculateMean() should handle empty array', () => {
      const mean = intelligenceEngine.calculateMean([]);
      expect(mean).toBe(0);
    });

    test('calculateMedian() should find middle value', () => {
      const median = intelligenceEngine.calculateMedian([1, 2, 3, 4, 5]);
      expect(median).toBe(3);
    });

    test('calculateMedian() should average two middle values for even count', () => {
      const median = intelligenceEngine.calculateMedian([1, 2, 3, 4]);
      expect(median).toBe(2.5);
    });

    test('calculateStandardDeviation() should calculate spread', () => {
      const stdDev = intelligenceEngine.calculateStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(stdDev).toBeCloseTo(2.138, 2);
    });

    test('calculateZScore() should calculate standardized score', () => {
      const zScore = intelligenceEngine.calculateZScore(150, 100, 25);
      expect(zScore).toBe(2);
    });

    test('isOutlier() should identify outliers', () => {
      expect(intelligenceEngine.isOutlier(3.0)).toBe(true);
      expect(intelligenceEngine.isOutlier(2.0)).toBe(false);
      expect(intelligenceEngine.isOutlier(-3.0)).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // DATA LOADING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('loadHistoricalData()', () => {
    test('should load auction history from sheet', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { itemName: 'Item1', bidAmount: 100 },
          { itemName: 'Item2', bidAmount: 200 },
        ],
      });

      await intelligenceEngine.loadHistoricalData();

      expect(intelligenceEngine.auctionHistory.length).toBe(2);
    });

    test('should handle empty auction history', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [],
      });

      await intelligenceEngine.loadHistoricalData();

      expect(intelligenceEngine.auctionHistory).toEqual([]);
    });

    test('should handle API errors gracefully', async () => {
      mockSheetAPI.getForDistribution.mockRejectedValue(
        new Error('API Error')
      );

      await intelligenceEngine.loadHistoricalData();

      // Should not throw, array should remain empty
      expect(intelligenceEngine.auctionHistory).toEqual([]);
    });
  });
});