/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEARNING SYSTEM TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the AI/ML learning system that improves predictions over time.
 *
 * Features tested:
 * - Prediction saving and tracking
 * - Accuracy calculation and updates
 * - Feature enrichment with context
 * - Confidence adjustment based on historical accuracy
 * - Metrics calculation and reporting
 * - Cache management
 *
 * @module __tests__/learning-system
 */

describe('Learning System', () => {
  let learningSystem;
  let mockSheetAPI;
  let mockConfig;

  beforeEach(() => {
    // Mock SheetAPI
    mockSheetAPI = {
      savePredictionForLearning: jest.fn(),
      updatePredictionAccuracy: jest.fn(),
      getLearningData: jest.fn(),
      getLearningMetrics: jest.fn(),
      getBiddingPoints: jest.fn(),
      getForDistribution: jest.fn(),
    };

    mockConfig = {
      timezone: 'Asia/Manila',
    };

    // Import and initialize learning system
    const { LearningSystem } = require('../learning-system');
    learningSystem = new LearningSystem(mockConfig, mockSheetAPI);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PREDICTION SAVING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('savePrediction()', () => {
    test('should save prediction with basic features', async () => {
      mockSheetAPI.savePredictionForLearning.mockResolvedValue({
        status: 'ok',
        data: { predictionId: 123 },
      });

      const result = await learningSystem.savePrediction(
        'price_prediction',
        'Crimson Pendant',
        450,
        85,
        { historicalAvg: 440, sampleSize: 10 }
      );

      expect(mockSheetAPI.savePredictionForLearning).toHaveBeenCalled();
      expect(result).toEqual({ predictionId: 123 });
    });

    test('should enrich features with temporal context', async () => {
      mockSheetAPI.savePredictionForLearning.mockResolvedValue({
        status: 'ok',
        data: { predictionId: 124 },
      });

      await learningSystem.savePrediction(
        'price_prediction',
        'Moonstone Ring',
        300,
        75,
        { historicalAvg: 280 }
      );

      const callArgs = mockSheetAPI.savePredictionForLearning.mock.calls[0][0];
      expect(callArgs.features).toHaveProperty('temporal');
      expect(callArgs.features.temporal).toHaveProperty('dayOfWeek');
      expect(callArgs.features.temporal).toHaveProperty('hour');
      expect(callArgs.features.temporal).toHaveProperty('isWeekend');
    });

    test('should enrich features with market state when available', async () => {
      mockSheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'Player1', pointsLeft: 500, pointsConsumed: 200 },
          { username: 'Player2', pointsLeft: 300, pointsConsumed: 400 },
          { username: 'Player3', pointsLeft: 600, pointsConsumed: 100 },
        ],
      });

      mockSheetAPI.savePredictionForLearning.mockResolvedValue({
        status: 'ok',
        data: { predictionId: 125 },
      });

      await learningSystem.savePrediction(
        'price_prediction',
        'Dragon Scale',
        800,
        90,
        {}
      );

      const callArgs = mockSheetAPI.savePredictionForLearning.mock.calls[0][0];
      expect(callArgs.features).toHaveProperty('marketState');
      expect(callArgs.features.marketState).toHaveProperty('totalMembers', 3);
      expect(callArgs.features.marketState).toHaveProperty('avgPointsPerMember');
      expect(callArgs.features.marketState).toHaveProperty('totalPointsInEconomy');
    });

    test('should handle API failures gracefully', async () => {
      mockSheetAPI.savePredictionForLearning.mockResolvedValue({
        status: 'error',
        message: 'Sheet write failed',
      });

      const result = await learningSystem.savePrediction(
        'price_prediction',
        'Test Item',
        100,
        50,
        {}
      );

      expect(result).toBeNull();
    });

    test('should handle exceptions during save', async () => {
      mockSheetAPI.savePredictionForLearning.mockRejectedValue(
        new Error('Network error')
      );

      const result = await learningSystem.savePrediction(
        'price_prediction',
        'Test Item',
        100,
        50,
        {}
      );

      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ACCURACY UPDATE TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('updatePredictionAccuracy()', () => {
    test('should update prediction with actual result', async () => {
      mockSheetAPI.updatePredictionAccuracy.mockResolvedValue({
        status: 'ok',
        message: 'Prediction updated',
      });

      const result = await learningSystem.updatePredictionAccuracy(
        'price_prediction',
        'Crimson Pendant',
        480
      );

      expect(mockSheetAPI.updatePredictionAccuracy).toHaveBeenCalledWith({
        type: 'price_prediction',
        target: 'Crimson Pendant',
        actual: 480,
      });
      expect(result).toBe(true);
    });

    test('should return false when no matching prediction found', async () => {
      mockSheetAPI.updatePredictionAccuracy.mockResolvedValue({
        status: 'ok',
        message: 'No matching pending prediction found',
      });

      const result = await learningSystem.updatePredictionAccuracy(
        'price_prediction',
        'Unknown Item',
        100
      );

      expect(result).toBe(false);
    });

    test('should handle update failures gracefully', async () => {
      mockSheetAPI.updatePredictionAccuracy.mockResolvedValue({
        status: 'error',
        message: 'Update failed',
      });

      const result = await learningSystem.updatePredictionAccuracy(
        'price_prediction',
        'Test Item',
        100
      );

      expect(result).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // LEARNING METRICS TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('getLearningMetrics()', () => {
    test('should fetch and cache metrics', async () => {
      const mockMetrics = {
        metrics: {
          total: 100,
          byType: {
            price_prediction: { total: 80, completed: 70 },
            engagement: { total: 20, completed: 15 },
          },
          averageAccuracy: {
            price_prediction: '87.50',
            engagement: '80.00',
          },
        },
      };

      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'ok',
        data: mockMetrics,
      });

      const result = await learningSystem.getLearningMetrics();

      expect(result).toEqual(mockMetrics);
      expect(mockSheetAPI.getLearningMetrics).toHaveBeenCalledTimes(1);
    });

    test('should use cached metrics within TTL', async () => {
      const mockMetrics = {
        metrics: { total: 50 },
      };

      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'ok',
        data: mockMetrics,
      });

      // First call
      await learningSystem.getLearningMetrics();

      // Second call (should use cache)
      const result = await learningSystem.getLearningMetrics();

      expect(result).toEqual(mockMetrics);
      expect(mockSheetAPI.getLearningMetrics).toHaveBeenCalledTimes(1);
    });

    test('should refresh cache after TTL expires', async () => {
      const mockMetrics1 = { metrics: { total: 50 } };
      const mockMetrics2 = { metrics: { total: 60 } };

      mockSheetAPI.getLearningMetrics
        .mockResolvedValueOnce({ status: 'ok', data: mockMetrics1 })
        .mockResolvedValueOnce({ status: 'ok', data: mockMetrics2 });

      // First call
      await learningSystem.getLearningMetrics();

      // Expire cache
      learningSystem.cache.lastUpdate = Date.now() - (6 * 60 * 1000); // 6 minutes ago

      // Second call (should fetch new data)
      const result = await learningSystem.getLearningMetrics();

      expect(result).toEqual(mockMetrics2);
      expect(mockSheetAPI.getLearningMetrics).toHaveBeenCalledTimes(2);
    });

    test('should handle metrics fetch failures', async () => {
      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'error',
        message: 'Failed to fetch',
      });

      const result = await learningSystem.getLearningMetrics();

      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CONFIDENCE ADJUSTMENT TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('adjustConfidence()', () => {
    test('should increase confidence for accurate predictions', async () => {
      const mockMetrics = {
        metrics: {
          byType: {
            price_prediction: { total: 20, completed: 20 },
          },
          averageAccuracy: {
            price_prediction: '90.00',
          },
          recentAccuracy: {
            price_prediction: '92.00',
          },
        },
      };

      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'ok',
        data: mockMetrics,
      });

      const adjusted = await learningSystem.adjustConfidence(
        'price_prediction',
        80
      );

      expect(adjusted).toBeGreaterThan(80);
      expect(adjusted).toBeLessThanOrEqual(100);
    });

    test('should decrease confidence for inaccurate predictions', async () => {
      const mockMetrics = {
        metrics: {
          byType: {
            price_prediction: { total: 20, completed: 20 },
          },
          averageAccuracy: {
            price_prediction: '60.00',
          },
          recentAccuracy: {
            price_prediction: '55.00',
          },
        },
      };

      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'ok',
        data: mockMetrics,
      });

      const adjusted = await learningSystem.adjustConfidence(
        'price_prediction',
        80
      );

      expect(adjusted).toBeLessThan(80);
      expect(adjusted).toBeGreaterThanOrEqual(0);
    });

    test('should not adjust confidence with insufficient data', async () => {
      const mockMetrics = {
        metrics: {
          byType: {
            price_prediction: { total: 5, completed: 5 },
          },
        },
      };

      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'ok',
        data: mockMetrics,
      });

      const adjusted = await learningSystem.adjustConfidence(
        'price_prediction',
        80
      );

      expect(adjusted).toBe(80);
    });

    test('should return original confidence on metrics fetch failure', async () => {
      mockSheetAPI.getLearningMetrics.mockResolvedValue({
        status: 'error',
        message: 'Failed',
      });

      const adjusted = await learningSystem.adjustConfidence(
        'price_prediction',
        75
      );

      expect(adjusted).toBe(75);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTION TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Helper Functions', () => {
    test('median() should calculate median of array', () => {
      expect(learningSystem.median([1, 2, 3, 4, 5])).toBe(3);
      expect(learningSystem.median([1, 2, 3, 4])).toBe(2.5);
      expect(learningSystem.median([5])).toBe(5);
      expect(learningSystem.median([])).toBe(0);
    });

    test('standardDeviation() should calculate standard deviation', () => {
      const result = learningSystem.standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result).toBeCloseTo(2.138, 2);
    });

    test('standardDeviation() should handle single value', () => {
      expect(learningSystem.standardDeviation([5])).toBe(0);
    });

    test('standardDeviation() should handle empty array', () => {
      expect(learningSystem.standardDeviation([])).toBe(0);
    });

    test('calculateVolatility() should calculate coefficient of variation', () => {
      const result = learningSystem.calculateVolatility([100, 110, 90, 105, 95]);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });

    test('calculateVolatility() should handle zero mean', () => {
      const result = learningSystem.calculateVolatility([0, 0, 0]);
      expect(result).toBe(0);
    });

    test('getWeekNumber() should return week number', () => {
      const date = new Date('2025-01-15');
      const week = learningSystem.getWeekNumber(date);
      expect(week).toBeGreaterThan(0);
      expect(week).toBeLessThanOrEqual(53);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FEATURE ENRICHMENT TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('enrichFeaturesWithContext()', () => {
    test('should add temporal context to features', async () => {
      const enriched = await learningSystem.enrichFeaturesWithContext(
        { baseFeature: 'value' },
        'price_prediction',
        'Test Item'
      );

      expect(enriched).toHaveProperty('temporal');
      expect(enriched.temporal).toHaveProperty('dayOfWeek');
      expect(enriched.temporal).toHaveProperty('hour');
      expect(enriched.temporal).toHaveProperty('isWeekend');
      expect(enriched.temporal).toHaveProperty('isAuctionDay');
    });

    test('should add market state when data available', async () => {
      mockSheetAPI.getBiddingPoints.mockResolvedValue({
        status: 'ok',
        data: [
          { username: 'P1', pointsLeft: 500, pointsConsumed: 200 },
          { username: 'P2', pointsLeft: 300, pointsConsumed: 400 },
        ],
      });

      const enriched = await learningSystem.enrichFeaturesWithContext(
        {},
        'price_prediction',
        'Item'
      );

      expect(enriched).toHaveProperty('marketState');
      expect(enriched.marketState).toHaveProperty('totalMembers', 2);
      expect(enriched.marketState).toHaveProperty('avgPointsPerMember');
    });

    test('should add behavioral patterns for price predictions', async () => {
      mockSheetAPI.getForDistribution.mockResolvedValue({
        status: 'ok',
        data: [
          { item: 'Test Item', price: 100, timestamp: new Date() },
          { item: 'Other Item', price: 200, timestamp: new Date() },
          { item: 'Test Item', price: 110, timestamp: new Date() },
        ],
      });

      const enriched = await learningSystem.enrichFeaturesWithContext(
        {},
        'price_prediction',
        'Test Item'
      );

      expect(enriched).toHaveProperty('behavioral');
      expect(enriched.behavioral).toHaveProperty('recentAuctions');
      expect(enriched.behavioral).toHaveProperty('targetItemFrequency');
    });

    test('should include metadata in enriched features', async () => {
      const enriched = await learningSystem.enrichFeaturesWithContext(
        { a: 1, b: 2 },
        'price_prediction',
        'Item'
      );

      expect(enriched).toHaveProperty('_meta');
      expect(enriched._meta).toHaveProperty('enrichmentVersion');
      expect(enriched._meta).toHaveProperty('baseFeatureCount', 2);
      expect(enriched._meta).toHaveProperty('totalFeatureCount');
    });

    test('should gracefully handle missing market data', async () => {
      mockSheetAPI.getBiddingPoints.mockRejectedValue(
        new Error('API error')
      );

      const enriched = await learningSystem.enrichFeaturesWithContext(
        {},
        'price_prediction',
        'Item'
      );

      // Should not throw, should complete without market state
      expect(enriched).toHaveProperty('temporal');
      expect(enriched).not.toHaveProperty('marketState');
    });
  });
});