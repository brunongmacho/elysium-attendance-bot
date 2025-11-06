/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHEET API LEARNING SYSTEM TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the learning system API methods added to SheetAPI.
 *
 * Features tested:
 * - Prediction saving
 * - Accuracy updates
 * - Learning data retrieval
 * - Metrics calculation
 * - Bootstrap learning
 * - Google Drive operations
 *
 * @module __tests__/utils/sheet-api-learning
 */

describe('SheetAPI Learning Methods', () => {
  let SheetAPI;
  let sheetAPI;
  let mockFetch;

  beforeEach(() => {
    // Mock global fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Import SheetAPI
    SheetAPI = require('../../utils/sheet-api').SheetAPI;
    sheetAPI = new SheetAPI('https://mock-webhook-url.com');
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PREDICTION SAVING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('savePredictionForLearning()', () => {
    test('should call API with prediction data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: { predictionId: 123 },
        }),
      });

      const result = await sheetAPI.savePredictionForLearning({
        type: 'price_prediction',
        target: 'Test Item',
        predicted: 500,
        confidence: 85,
        features: { avg: 480 },
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.status).toBe('ok');
      expect(result.data.predictionId).toBe(123);
    });

    test('should handle API errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        sheetAPI.savePredictionForLearning({
          type: 'price_prediction',
          target: 'Test',
          predicted: 100,
          confidence: 50,
        })
      ).rejects.toThrow();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ACCURACY UPDATE TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('updatePredictionAccuracy()', () => {
    test('should call API with actual result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          message: 'Updated',
        }),
      });

      const result = await sheetAPI.updatePredictionAccuracy({
        type: 'price_prediction',
        target: 'Test Item',
        actual: 520,
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.status).toBe('ok');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // LEARNING DATA RETRIEVAL TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('getLearningData()', () => {
    test('should fetch learning data with filters', async () => {
      const mockData = {
        predictions: [
          {
            type: 'price_prediction',
            target: 'Item1',
            predicted: 500,
            actual: 480,
            accuracy: 96,
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: mockData,
        }),
      });

      const result = await sheetAPI.getLearningData({
        type: 'price_prediction',
        limit: 10,
      });

      expect(result.data).toEqual(mockData);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // METRICS TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('getLearningMetrics()', () => {
    test('should fetch aggregated metrics', async () => {
      const mockMetrics = {
        metrics: {
          total: 100,
          byType: {
            price_prediction: { total: 80, completed: 70 },
          },
          averageAccuracy: {
            price_prediction: '87.5',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: mockMetrics,
        }),
      });

      const result = await sheetAPI.getLearningMetrics();

      expect(result.data.metrics.total).toBe(100);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // BOOTSTRAP LEARNING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('bootstrapLearning()', () => {
    test('should initiate bootstrap process', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: {
            totalAuctions: 500,
            predictionsCreated: 421,
            uniqueItems: 89,
            averageAccuracy: 87.3,
          },
        }),
      });

      const result = await sheetAPI.bootstrapLearning();

      expect(result.status).toBe('ok');
      expect(result.data.predictionsCreated).toBeGreaterThan(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GOOGLE DRIVE TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Google Drive Operations', () => {
    test('should initialize drive folders', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: {
            screenshots: { attendance: 'folder-id-1', loot: 'folder-id-2' },
            learning: { predictions: 'folder-id-3' },
          },
        }),
      });

      const result = await sheetAPI.initializeDriveFolders();

      expect(result.status).toBe('ok');
      expect(result.data).toHaveProperty('screenshots');
    });

    test('should export learning data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: {
            fileId: 'file-123',
            fileUrl: 'https://drive.google.com/file/d/file-123',
            recordCount: 100,
          },
        }),
      });

      const result = await sheetAPI.exportLearningData({ type: 'price_prediction' });

      expect(result.status).toBe('ok');
      expect(result.data.recordCount).toBe(100);
    });

    test('should create daily backup', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          data: {
            fileId: 'backup-123',
            sheetsCount: 6,
          },
        }),
      });

      const result = await sheetAPI.createDailyBackup();

      expect(result.status).toBe('ok');
      expect(result.data.sheetsCount).toBeGreaterThan(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS
  // ═════════════════════════════════════════════════════════════════════════

  describe('Error Handling', () => {
    test('should retry on timeout', async () => {
      mockFetch
        .mockRejectedValueOnce({ name: 'AbortError' })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'ok' }),
        });

      const result = await sheetAPI.savePredictionForLearning({
        type: 'test',
        target: 'test',
        predicted: 1,
        confidence: 1,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('ok');
    });

    test('should handle rate limiting', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: 'Rate limited' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'ok' }),
        });

      const result = await sheetAPI.getLearningData({});

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});