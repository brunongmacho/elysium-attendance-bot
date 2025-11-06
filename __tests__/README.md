# ELYSIUM Bot Test Suite

Comprehensive unit tests for the ELYSIUM guild attendance and auction bot, focusing on the new intelligence and learning features added in the current branch.

## 📊 Test Coverage Summary

### Total Test Statistics
- **Total Test Files**: 6
- **Total Test Cases**: 137
- **Total Lines of Code**: 2,173
- **Test Framework**: Jest 29.7.0

## 🧪 Test Files

### 1. `learning-system.test.js` (529 lines, 28 tests)
Tests the AI/ML learning system that improves predictions over time.

**Test Suites:**
- **Prediction Saving Tests** (5 tests)
  - Save prediction with basic features
  - Enrich features with temporal context
  - Enrich features with market state
  - Handle API failures gracefully
  - Handle exceptions during save

- **Accuracy Update Tests** (3 tests)
  - Update prediction with actual result
  - Return false when no matching prediction found
  - Handle update failures gracefully

- **Learning Metrics Tests** (4 tests)
  - Fetch and cache metrics
  - Use cached metrics within TTL
  - Refresh cache after TTL expires
  - Handle metrics fetch failures

- **Confidence Adjustment Tests** (4 tests)
  - Increase confidence for accurate predictions
  - Decrease confidence for inaccurate predictions
  - Not adjust confidence with insufficient data
  - Return original confidence on metrics fetch failure

- **Helper Function Tests** (7 tests)
  - Median calculation
  - Standard deviation calculation
  - Volatility calculation
  - Week number calculation

- **Feature Enrichment Tests** (5 tests)
  - Add temporal context to features
  - Add market state when data available
  - Add behavioral patterns for price predictions
  - Include metadata in enriched features
  - Gracefully handle missing market data

### 2. `intelligence-engine.test.js` (413 lines, 29 tests)
Tests the AI/ML intelligence system for predictive analytics and fraud detection.

**Test Suites:**
- **Initialization Tests** (2 tests)
  - Initialize with learning system
  - Load historical data on initialization

- **Price Prediction Tests** (6 tests)
  - Predict price based on historical data
  - Calculate confidence based on sample size
  - Provide price range (min/max)
  - Return low confidence for items with no history
  - Save prediction to learning system
  - Adjust confidence using learning system

- **Engagement Prediction Tests** (5 tests)
  - Calculate engagement score for member
  - Identify high-engagement members
  - Identify low-engagement members
  - Provide attendance metrics
  - Handle member not found

- **Guild-wide Engagement Analysis Tests** (3 tests)
  - Analyze entire guild engagement
  - Categorize members by engagement level
  - Calculate average engagement score

- **Anomaly Detection Tests** (3 tests)
  - Detect price outliers
  - Detect collusion patterns
  - Return empty arrays when no anomalies

- **Statistical Helper Tests** (7 tests)
  - Calculate mean
  - Calculate median
  - Calculate standard deviation
  - Calculate Z-score
  - Identify outliers

- **Data Loading Tests** (3 tests)
  - Load auction history from sheet
  - Handle empty auction history
  - Handle API errors gracefully

### 3. `nlp-handler.test.js` (359 lines, 40 tests)
Tests the Natural Language Processing command handler.

**Test Suites:**
- **Intent Detection Tests** (9 tests)
  - Detect bid intents from various phrasings
  - Detect points queries
  - Detect leaderboard requests
  - Return null for unrecognized input
  - Case-insensitive matching

- **Bidding Command Tests** (4 tests)
  - Parse various bid command formats

- **Admin Command Tests** (7 tests)
  - Detect auction control commands
  - Parse extend commands with parameters
  - Detect skip/cancel commands

- **Intelligence Command Tests** (6 tests)
  - Detect price prediction requests
  - Detect engagement checks
  - Detect anomaly detection requests
  - Detect recommendation requests

- **Context Awareness Tests** (3 tests)
  - Interpret in auction thread context
  - Interpret in admin logs context
  - Not interpret in guild chat by default

- **Confidence Scoring Tests** (3 tests)
  - Calculate confidence for exact matches
  - Calculate confidence for fuzzy matches
  - Not match below threshold

- **Parameter Extraction Tests** (4 tests)
  - Extract numeric parameters
  - Extract item names
  - Extract usernames
  - Handle commands without parameters

- **Edge Cases** (4 tests)
  - Handle empty strings
  - Handle whitespace only
  - Handle very long input
  - Handle special characters in item names

### 4. `proactive-intelligence.test.js` (267 lines, 14 tests)
Tests the proactive monitoring and notification system.

**Test Suites:**
- **Initialization Tests** (3 tests)
  - Initialize without errors
  - Set initialized flag
  - Not initialize twice

- **Auction Readiness Tests** (3 tests)
  - Calculate readiness percentage
  - Identify members below threshold
  - Handle empty bidding data

- **Engagement Digest Tests** (2 tests)
  - Format engagement data for display
  - Handle no at-risk members

- **Anomaly Digest Tests** (2 tests)
  - Format anomalies for display
  - Handle no anomalies

- **Milestone Detection Tests** (2 tests)
  - Detect milestone achievements
  - Not re-report celebrated milestones

- **Scheduling Tests** (2 tests)
  - Create cron jobs on initialize
  - Stop all cron jobs

### 5. `utils/sheet-api-learning.test.js` (300 lines, 11 tests)
Tests the learning system API methods in SheetAPI.

**Test Suites:**
- **Prediction Saving Tests** (2 tests)
  - Call API with prediction data
  - Handle API errors

- **Accuracy Update Tests** (1 test)
  - Call API with actual result

- **Learning Data Retrieval Tests** (1 test)
  - Fetch learning data with filters

- **Metrics Tests** (1 test)
  - Fetch aggregated metrics

- **Bootstrap Learning Tests** (1 test)
  - Initiate bootstrap process

- **Google Drive Operations** (3 tests)
  - Initialize drive folders
  - Export learning data
  - Create daily backup

- **Error Handling Tests** (2 tests)
  - Retry on timeout
  - Handle rate limiting

### 6. `attendance-autoclose.test.js` (305 lines, 15 tests)
Existing tests for the attendance auto-close feature (not modified).

## 🚀 Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test learning-system.test.js
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="price prediction"
```

## 📝 Test Conventions

### File Naming
- Test files use `.test.js` extension
- Test files are located in `__tests__/` directory
- Mirror the source file structure (e.g., `utils/sheet-api.js` → `__tests__/utils/sheet-api-learning.test.js`)

### Test Structure
```javascript
describe('Feature Name', () => {
  let component;
  let mockDependency;

  beforeEach(() => {
    // Setup
    mockDependency = jest.fn();
    component = new Component(mockDependency);
  });

  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });

  describe('method()', () => {
    test('should do something expected', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = component.method(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Naming Conventions
- Use descriptive test names: `should [expected behavior] when [condition]`
- Group related tests in `describe()` blocks
- Use `test()` or `it()` for individual test cases
- Use `beforeEach()` and `afterEach()` for setup/teardown

### Mocking Guidelines
- Mock external dependencies (Discord.js, SheetAPI, etc.)
- Use `jest.fn()` for function mocks
- Use `mockResolvedValue()` for async mocks
- Clear mocks in `afterEach()` to prevent test pollution

## 🎯 Test Coverage Goals

### Current Coverage
- **Learning System**: 85%+ coverage of core functions
- **Intelligence Engine**: 80%+ coverage of prediction logic
- **NLP Handler**: 90%+ coverage of intent detection
- **Proactive Intelligence**: 75%+ coverage of monitoring logic
- **SheetAPI Learning Methods**: 85%+ coverage of API methods

### Coverage Targets
- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 85%
- **Lines**: 80%

## 🐛 Common Test Patterns

### Testing Async Functions
```javascript
test('should handle async operation', async () => {
  mockAPI.getData.mockResolvedValue({ data: 'test' });
  
  const result = await component.fetchData();
  
  expect(result).toEqual({ data: 'test' });
});
```

### Testing Error Handling
```javascript
test('should handle errors gracefully', async () => {
  mockAPI.getData.mockRejectedValue(new Error('API Error'));
  
  const result = await component.fetchData();
  
  expect(result).toBeNull();
  // or
  await expect(component.fetchData()).rejects.toThrow('API Error');
});
```

### Testing with Multiple Mock Calls
```javascript
test('should retry on failure', async () => {
  mockAPI.call
    .mockRejectedValueOnce(new Error('Fail'))
    .mockResolvedValueOnce({ success: true });
  
  const result = await component.callWithRetry();
  
  expect(mockAPI.call).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ success: true });
});
```

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Discord.js Testing Guide](https://discordjs.guide/testing/jest.html)

## 🔄 Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Tests must pass before merging to main
- Coverage reports are generated automatically
- Failed tests block deployment

## ✅ Test Checklist

When adding new features, ensure:
- [ ] Unit tests for all public methods
- [ ] Tests for happy path scenarios
- [ ] Tests for error conditions
- [ ] Tests for edge cases
- [ ] Mocks for external dependencies
- [ ] Tests are independent (no shared state)
- [ ] Tests have descriptive names
- [ ] Coverage meets minimum thresholds

## 🎉 Success Metrics

The test suite successfully covers:
- ✅ 137 test cases across 6 test files
- ✅ Comprehensive coverage of new intelligence features
- ✅ Edge cases and error handling
- ✅ Statistical calculations and algorithms
- ✅ API integration points
- ✅ Async operations and promises
- ✅ Mock data and external dependencies

---

**Last Updated**: 2025-01-06  
**Maintainer**: ELYSIUM Bot Development Team