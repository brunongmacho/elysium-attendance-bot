# 🧠 ELYSIUM Bot Learning System - Complete Technical Documentation

**Version**: 1.0
**Last Updated**: 2025-11-06
**Author**: ELYSIUM Development Team

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Learning System Deep Dive](#learning-system-deep-dive)
4. [Implementation Details](#implementation-details)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Code Examples](#code-examples)
7. [Google Sheets Integration](#google-sheets-integration)
8. [Configuration](#configuration)
9. [Performance & Optimization](#performance--optimization)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

### What is the Learning System?

The ELYSIUM Bot Learning System is a **persistent AI/ML feedback loop** that allows the bot to:

1. **Make predictions** (item prices, member engagement, anomalies)
2. **Store predictions** in Google Sheets with metadata
3. **Observe actual outcomes** when events complete
4. **Calculate accuracy** by comparing predictions vs reality
5. **Adjust future predictions** based on historical performance

**Key Innovation**: Unlike traditional bots that are static, ELYSIUM bot **improves over time** by learning from past successes and failures.

### Why Google Sheets?

The bot runs on **Koyeb** (ephemeral container platform) where:
- ❌ Local file storage is lost on restart
- ❌ In-memory data doesn't persist
- ✅ Google Sheets provides **persistent, free, accessible storage**

### System Goals

1. **Accuracy Improvement**: Bot gets better at predictions over time
2. **Confidence Calibration**: Bot knows when it's reliable vs uncertain
3. **Transparency**: Admins can inspect all predictions and results
4. **Zero Breaking Changes**: Existing functionality unchanged
5. **Koyeb-Friendly**: No local storage dependencies

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELYSIUM BOT                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Intelligence │  │  Proactive   │  │     NLP      │          │
│  │   Engine     │  │ Intelligence │  │   Handler    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                  │
│         └─────────────────┴──────────────────┘                  │
│                           │                                     │
│                  ┌────────▼────────┐                            │
│                  │ Learning System │                            │
│                  └────────┬────────┘                            │
│                           │                                     │
│                  ┌────────▼────────┐                            │
│                  │   Sheet API     │                            │
│                  └────────┬────────┘                            │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   GOOGLE APPS SCRIPT    │
              │  ┌──────────────────┐   │
              │  │ BotLearning      │   │
              │  │ Sheet            │   │
              │  ├──────────────────┤   │
              │  │ ForDistribution  │   │
              │  ├──────────────────┤   │
              │  │ BiddingPoints    │   │
              │  └──────────────────┘   │
              └─────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **Intelligence Engine** | Makes predictions, analyzes data | `intelligence-engine.js` |
| **Learning System** | Stores predictions, calculates accuracy | `learning-system.js` |
| **Sheet API** | HTTP client for Google Sheets | `utils/sheet-api.js` |
| **Google Apps Script** | Server-side sheet operations | `Code.js` |
| **BotLearning Sheet** | Persistent storage for learning data | Google Sheets |

---

## 🧠 Learning System Deep Dive

### 1. Prediction Lifecycle

```
┌─────────────┐
│  1. PREDICT │  Bot makes a prediction (e.g., item price)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  2. SAVE    │  Prediction saved to BotLearning sheet
└──────┬──────┘  • Timestamp, Type, Target, Predicted Value
       │          • Confidence Score, Features Used
       │          • Status: "pending"
       ▼
┌─────────────┐
│  3. WAIT    │  Event completes (auction ends, event happens)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  4. OBSERVE │  Actual outcome recorded
└──────┬──────┘  • Item sold for actual price
       │          • Member attended or didn't
       │
       ▼
┌─────────────┐
│  5. UPDATE  │  Accuracy calculated and saved
└──────┬──────┘  • Accuracy % = comparison of predicted vs actual
       │          • Status: "pending" → "completed"
       │
       ▼
┌─────────────┐
│  6. LEARN   │  Future predictions adjusted
└─────────────┘  • Confidence increased if accurate
                 • Confidence decreased if inaccurate
```

### 2. Prediction Types

The system supports multiple prediction types:

#### A. Price Prediction (`price_prediction`)

**What**: Predicts optimal starting bid for auction items

**How**:
1. Fetch historical auction data from ForDistribution sheet
2. Filter for same item name (with fuzzy matching)
3. Calculate statistics (mean, median, stdDev)
4. Remove outliers (Z-score > 2.5)
5. Analyze trend (recent 3 auctions vs historical)
6. Apply trend adjustment (±10%)
7. Save prediction with features

**Features Tracked**:
```javascript
{
  historicalCount: 15,    // Number of past auctions
  stdDev: 45,             // Price volatility
  trend: "increasing",    // Price direction
  trendPercent: "8.3"     // Trend magnitude
}
```

**Accuracy Calculation**:
```javascript
// For price predictions
const predictedPrice = 450;
const actualPrice = 475;
const diff = Math.abs(predictedPrice - actualPrice); // 25
const accuracy = Math.max(0, 100 - (diff / actualPrice * 100));
// accuracy = 100 - (25 / 475 * 100) = 94.7%
```

#### B. Engagement Prediction (`engagement`)

**What**: Predicts if a member will attend next event

**How**:
1. Calculate engagement score (0-100)
2. Analyze attendance consistency
3. Check recent activity (last 4 weeks)
4. Predict likelihood (high/medium/low)

**Features Tracked**:
```javascript
{
  totalEvents: 50,
  attended: 42,
  consistency: 0.84,
  recentActivity: 3,  // Events in last 4 weeks
  engagementScore: 85
}
```

**Accuracy Calculation**:
```javascript
// For boolean predictions
const predicted = "will_attend";
const actual = "attended";
const accuracy = (predicted === actual) ? 100 : 0;
```

#### C. Anomaly Detection (`anomaly`)

**What**: Detects suspicious bidding patterns

**How**:
1. Analyze bid timing and amounts
2. Check for collusion patterns
3. Identify statistical outliers
4. Classify severity (HIGH/MEDIUM/LOW)

**Features Tracked**:
```javascript
{
  bidPattern: "rapid_succession",
  outlierScore: 3.2,     // Z-score
  involvedMembers: 2,
  suspicionLevel: "HIGH"
}
```

### 3. Confidence Adjustment Algorithm

The learning system **automatically adjusts confidence** based on historical accuracy.

#### Algorithm Pseudocode

```javascript
function adjustConfidence(type, baseConfidence) {
  // Get historical performance
  const metrics = getLearningMetrics();
  const avgAccuracy = metrics.averageAccuracy[type];
  const recentAccuracy = metrics.recentAccuracy[type];
  const totalPredictions = metrics.byType[type].completed;

  // Need minimum samples before adjusting
  if (totalPredictions < MIN_SAMPLES_FOR_LEARNING) {
    return baseConfidence; // Not enough data yet
  }

  // Weight recent performance more heavily
  const weightedAccuracy =
    (recentAccuracy * RECENT_WEIGHT) +
    (avgAccuracy * HISTORICAL_WEIGHT);

  // Calculate adjustment
  let adjustment = 0;

  if (weightedAccuracy >= 90) {
    // Very accurate → increase confidence by 10%
    adjustment = baseConfidence * 0.1;
  } else if (weightedAccuracy >= 80) {
    // Good accuracy → small increase (5%)
    adjustment = baseConfidence * 0.05;
  } else if (weightedAccuracy < 70) {
    // Poor accuracy → decrease confidence by 10%
    adjustment = -baseConfidence * 0.1;
  }
  // 70-80% accuracy → no adjustment

  // Apply bounds (0-100%)
  const adjustedConfidence =
    Math.min(100, Math.max(0, baseConfidence + adjustment));

  return adjustedConfidence;
}
```

#### Example Scenarios

**Scenario 1: Bot is accurate**
```
Past 10 price predictions: Average 92% accurate
Base confidence: 75%
Adjustment: +7.5% (10% increase)
Final confidence: 82.5%
```

**Scenario 2: Bot is inaccurate**
```
Past 10 price predictions: Average 65% accurate
Base confidence: 75%
Adjustment: -7.5% (10% decrease)
Final confidence: 67.5%
```

**Scenario 3: Not enough data**
```
Only 5 predictions made (need 10 minimum)
Base confidence: 75%
Adjustment: None
Final confidence: 75% (unchanged)
```

### 4. Feature Importance

The system tracks which **features** are most predictive:

```javascript
// When making a prediction, save which features were used
const features = {
  historicalCount: 15,
  stdDev: 45,
  trend: "increasing",
  trendPercent: "8.3"
};

// Later analysis can show:
// "Predictions with historicalCount > 10 are 15% more accurate"
// "Trend direction is the most important feature"
```

---

## 💻 Implementation Details

### File Structure

```
elysium-attendance-bot/
├── learning-system.js          ← Learning engine
├── intelligence-engine.js      ← Makes predictions
├── utils/
│   └── sheet-api.js            ← HTTP client
└── Code.js                     ← Google Apps Script
```

### Class Architecture

#### LearningSystem Class

```javascript
class LearningSystem {
  constructor(config, sheetAPIInstance) {
    this.config = config;
    this.sheetAPI = sheetAPIInstance;
    this.cache = {
      metrics: null,
      lastUpdate: 0
    };
  }

  // Core Methods
  async savePrediction(type, target, predicted, confidence, features)
  async updatePredictionAccuracy(type, target, actual)
  async getMetrics(useCache = true)
  async getLearningData(type, limit = 100)
  async adjustConfidence(type, baseConfidence)
  async generateReport()
}
```

#### Key Methods Explained

**1. savePrediction()**

Saves a prediction to Google Sheets for future learning.

```javascript
// Usage in intelligence-engine.js
const prediction = await this.learningSystem.savePrediction(
  'price_prediction',           // Type
  'Crimson Pendant',            // Target (item name)
  450,                          // Predicted value
  85,                           // Confidence %
  {                             // Features used
    historicalCount: 15,
    stdDev: 45,
    trend: "increasing"
  }
);

// Returns: { predictionId: 123, timestamp: "2025-11-06T..." }
```

**What happens behind the scenes**:
```javascript
async savePrediction(type, target, predicted, confidence, features) {
  // 1. Prepare data
  const data = {
    type: type,
    target: target,
    predicted: predicted,
    confidence: confidence,
    features: features  // Will be JSON stringified
  };

  // 2. Call Google Sheets via API
  const response = await this.sheetAPI.savePredictionForLearning(data);

  // 3. Google Apps Script creates new row:
  // [Timestamp, Type, Target, Predicted, "", "", Confidence, Features, "pending", ""]

  // 4. Return prediction ID for tracking
  return response.data;
}
```

**2. updatePredictionAccuracy()**

Updates prediction with actual result when event completes.

```javascript
// Usage after auction completes
await this.learningSystem.updatePredictionAccuracy(
  'price_prediction',           // Type
  'Crimson Pendant',            // Target
  475                           // Actual selling price
);

// System automatically:
// 1. Finds most recent pending prediction for this item
// 2. Calculates accuracy: 94.7%
// 3. Updates row in BotLearning sheet
// 4. Marks status as "completed"
```

**Implementation**:
```javascript
async updatePredictionAccuracy(type, target, actual) {
  // 1. Send to Google Sheets
  const response = await this.sheetAPI.updatePredictionAccuracy({
    type: type,
    target: target,
    actual: actual
  });

  // 2. Google Apps Script finds pending prediction
  // 3. Calculates accuracy based on type
  // 4. Updates: Actual, Accuracy, Status columns

  // 5. Clear cache to force fresh metrics
  this.cache.metrics = null;

  return response.status === 'ok';
}
```

**3. adjustConfidence()**

Adjusts confidence score based on historical accuracy.

```javascript
// Usage in intelligence-engine.js
const baseConfidence = 75;  // Initial confidence
const adjustedConfidence = await this.learningSystem.adjustConfidence(
  'price_prediction',
  baseConfidence
);

// If bot has 90%+ accuracy → increases to ~82.5%
// If bot has 65% accuracy → decreases to ~67.5%
```

**Implementation**:
```javascript
async adjustConfidence(type, baseConfidence) {
  // 1. Get metrics (cached if recent)
  const metrics = await this.getMetrics();

  // 2. Check if enough data
  const totalPredictions = metrics.byType[type]?.completed || 0;
  if (totalPredictions < MIN_SAMPLES_FOR_LEARNING) {
    return baseConfidence;  // Not enough data
  }

  // 3. Calculate weighted accuracy
  const avgAccuracy = parseFloat(metrics.averageAccuracy[type]);
  const recentAccuracy = parseFloat(metrics.recentAccuracy[type]);

  const weightedAccuracy =
    (recentAccuracy * 0.7) + (avgAccuracy * 0.3);

  // 4. Apply adjustment rules
  let adjustment = 0;
  if (weightedAccuracy >= 90) {
    adjustment = baseConfidence * 0.1;  // +10%
  } else if (weightedAccuracy >= 80) {
    adjustment = baseConfidence * 0.05; // +5%
  } else if (weightedAccuracy < 70) {
    adjustment = -baseConfidence * 0.1; // -10%
  }

  // 5. Apply bounds
  return Math.min(100, Math.max(0, baseConfidence + adjustment));
}
```

---

## 📊 Data Flow Diagrams

### Complete Prediction Flow

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. USER TRIGGERS ANALYSIS                                         │
│    User: "!suggestauction" or "!predictprice Crimson Pendant"     │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 2. INTELLIGENCE ENGINE - Fetch Historical Data                    │
│    intelligence-engine.js: predictItemValue()                      │
│    ┌────────────────────────────────────────────────────┐         │
│    │ • Call: sheetAPI.call('getForDistribution')       │         │
│    │ • Google Sheets returns ForDistribution data      │         │
│    │ • Filter for matching item name                   │         │
│    │ • Calculate: mean, median, stdDev, outliers       │         │
│    │ • Analyze: trend (recent vs historical)           │         │
│    └────────────────────────────────────────────────────┘         │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 3. CALCULATE BASE PREDICTION                                       │
│    • suggestedBid = median * trendAdjustment                       │
│    • baseConfidence = f(sampleSize, stdDev, mean)                  │
│    • Features: {historicalCount, stdDev, trend, trendPercent}      │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 4. LEARNING SYSTEM - Adjust Confidence                            │
│    learning-system.js: adjustConfidence()                          │
│    ┌────────────────────────────────────────────────────┐         │
│    │ • Get historical accuracy for 'price_prediction'  │         │
│    │ • Calculate weighted accuracy (70% recent, 30% all)│        │
│    │ • Apply adjustment (+10%, +5%, 0%, or -10%)       │         │
│    │ • adjustedConfidence = baseConfidence + adjustment │         │
│    └────────────────────────────────────────────────────┘         │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 5. SAVE PREDICTION FOR LEARNING                                    │
│    learning-system.js: savePrediction()                            │
│    ┌────────────────────────────────────────────────────┐         │
│    │ • Type: "price_prediction"                         │         │
│    │ • Target: "Crimson Pendant"                        │         │
│    │ • Predicted: 450                                   │         │
│    │ • Confidence: 82.5                                 │         │
│    │ • Features: {historicalCount: 15, ...}            │         │
│    │ • Status: "pending"                                │         │
│    └────────────────────────────────────────────────────┘         │
│    ↓ HTTP POST to Google Sheets                                   │
│    ┌────────────────────────────────────────────────────┐         │
│    │ Code.js: savePredictionForLearning()              │         │
│    │ • Create new row in BotLearning sheet             │         │
│    │ • Return predictionId: 123                        │         │
│    └────────────────────────────────────────────────────┘         │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 6. RETURN PREDICTION TO USER                                       │
│    • "Crimson Pendant: 400pts → AI: 450pts (+50) ✅ 82.5%"        │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 7. AUCTION COMPLETES (Later)                                       │
│    • Item actually sells for 475pts                                │
│    • Winner: "PlayerX"                                             │
│    • Moved to ForDistribution sheet                                │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 8. UPDATE PREDICTION ACCURACY                                      │
│    learning-system.js: updatePredictionAccuracy()                  │
│    ┌────────────────────────────────────────────────────┐         │
│    │ • Type: "price_prediction"                         │         │
│    │ • Target: "Crimson Pendant"                        │         │
│    │ • Actual: 475                                      │         │
│    └────────────────────────────────────────────────────┘         │
│    ↓ HTTP POST to Google Sheets                                   │
│    ┌────────────────────────────────────────────────────┐         │
│    │ Code.js: updatePredictionAccuracy()               │         │
│    │ • Find pending prediction for item                │         │
│    │ • Calculate accuracy: |450-475|/475 = 94.7%       │         │
│    │ • Update: Actual=475, Accuracy=94.7, Status=completed│      │
│    └────────────────────────────────────────────────────┘         │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 9. NEXT PREDICTION IMPROVED                                        │
│    • Bot now has 1 more data point                                 │
│    • If consistently accurate → future confidence increases        │
│    • If consistently inaccurate → future confidence decreases      │
└────────────────────────────────────────────────────────────────────┘
```

### Accuracy Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ updatePredictionAccuracy("price_prediction", "Item", 475)       │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Google Sheets: BotLearning Sheet                                │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Find most recent "pending" prediction matching:          │   │
│ │ • Type = "price_prediction"                              │   │
│ │ • Target = "Item"                                        │   │
│ │ • Status = "pending"                                     │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Found Row 123:                                           │   │
│ │ Type: price_prediction                                   │   │
│ │ Target: Item                                             │   │
│ │ Predicted: 450                                           │   │
│ │ Actual: [empty]  ← Need to fill this                    │   │
│ │ Status: pending                                          │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Calculate Accuracy:                                      │   │
│ │ diff = |450 - 475| = 25                                  │   │
│ │ accuracy = 100 - (25/475 * 100) = 94.74%                │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Update Row 123:                                          │   │
│ │ Actual: 475              ← Set actual value              │   │
│ │ Accuracy: 94.74          ← Set calculated accuracy       │   │
│ │ Status: completed        ← Mark as complete              │   │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Code Examples

### Example 1: Making a Prediction with Learning

```javascript
// In intelligence-engine.js
async predictItemValue(itemName) {
  // 1. Get historical data
  const historicalData = await this.getItemAuctionHistory(itemName);

  if (historicalData.length < 3) {
    return { success: false, reason: 'Insufficient data' };
  }

  // 2. Calculate statistics
  const prices = historicalData.map(h => h.winningBid);
  const mean = this.calculateMean(prices);
  const median = this.calculateMedian(prices);
  const stdDev = this.calculateStdDev(prices);

  // 3. Remove outliers
  const filteredPrices = prices.filter(p =>
    Math.abs(p - mean) <= 2.5 * stdDev
  );

  // 4. Analyze trend
  const recentPrices = prices.slice(-3);
  const recentMean = this.calculateMean(recentPrices);
  const trend = recentMean > mean ? 'increasing' :
                recentMean < mean ? 'decreasing' : 'stable';

  // 5. Calculate suggested bid
  const trendAdjustment = trend === 'increasing' ? 1.1 :
                         trend === 'decreasing' ? 0.9 : 1.0;
  const suggestedBid = Math.round(median * trendAdjustment);

  // 6. Calculate base confidence
  const baseConfidence = this.calculateConfidence(
    filteredPrices.length,
    stdDev,
    mean
  );

  // 7. *** LEARNING SYSTEM *** Adjust confidence based on history
  const adjustedConfidence = await this.learningSystem.adjustConfidence(
    'price_prediction',
    baseConfidence
  );

  // 8. *** LEARNING SYSTEM *** Save prediction for future learning
  await this.learningSystem.savePrediction(
    'price_prediction',
    itemName,
    suggestedBid,
    adjustedConfidence,
    {
      historicalCount: historicalData.length,
      stdDev: Math.round(stdDev),
      trend: trend,
      trendPercent: ((recentMean - mean) / mean * 100).toFixed(1)
    }
  );

  // 9. Return prediction with adjusted confidence
  return {
    success: true,
    itemName,
    suggestedStartingBid: suggestedBid,
    confidence: adjustedConfidence,
    baseConfidence: baseConfidence,  // For comparison
    statistics: { /* ... */ },
    trend: { /* ... */ },
    reasoning: this.generatePriceReasoning(/* ... */)
  };
}
```

### Example 2: Updating After Auction Completes

```javascript
// This could be triggered automatically when auction ends
// or manually by admin command

async onAuctionComplete(itemName, actualPrice, winner) {
  console.log(`Auction completed: ${itemName} sold for ${actualPrice}pts to ${winner}`);

  // Update learning system with actual result
  const updated = await intelligenceEngine.learningSystem.updatePredictionAccuracy(
    'price_prediction',
    itemName,
    actualPrice
  );

  if (updated) {
    console.log('✅ Prediction accuracy updated! Bot is learning...');

    // Optionally, log to admin channel
    const adminChannel = await getChannelById(config.admin_logs_channel_id);
    adminChannel.send(
      `📚 **Learning Update**\n` +
      `Item: ${itemName}\n` +
      `Actual Price: ${actualPrice}pts\n` +
      `✅ Prediction accuracy calculated and stored!`
    );
  }
}
```

### Example 3: Viewing Learning Metrics

```javascript
// Command: !learningmetrics or !performance

async showLearningMetrics(message) {
  // Get metrics from learning system
  const metrics = await intelligenceEngine.learningSystem.getMetrics(false);

  if (!metrics.total || metrics.total === 0) {
    return message.reply('No learning data yet! Make some predictions first.');
  }

  // Build report
  let report = '📚 **Bot Learning Metrics**\n\n';
  report += `**Total Predictions**: ${metrics.total}\n\n`;

  // For each prediction type
  for (const type in metrics.byType) {
    const typeData = metrics.byType[type];
    const avgAcc = metrics.averageAccuracy[type] || 'N/A';
    const recentAcc = metrics.recentAccuracy[type] || 'N/A';

    report += `**${type.replace('_', ' ').toUpperCase()}**\n`;
    report += `├─ Total: ${typeData.total} predictions\n`;
    report += `├─ Completed: ${typeData.completed}\n`;
    report += `├─ Average Accuracy: ${avgAcc}%\n`;
    report += `└─ Recent Accuracy: ${recentAcc}%\n\n`;
  }

  await message.reply(report);
}
```

### Example 4: Manual Accuracy Update

```javascript
// Admin command: !updateprediction <itemName> <actualPrice>

commandHandlers.updateprediction = async (message, args) => {
  if (!message.member.permissions.has('ADMINISTRATOR')) {
    return message.reply('❌ Admin only command!');
  }

  const itemName = args.slice(0, -1).join(' ');
  const actualPrice = parseInt(args[args.length - 1]);

  if (!itemName || isNaN(actualPrice)) {
    return message.reply('Usage: !updateprediction <item name> <actual price>');
  }

  const updated = await intelligenceEngine.learningSystem.updatePredictionAccuracy(
    'price_prediction',
    itemName,
    actualPrice
  );

  if (updated) {
    message.reply(
      `✅ Updated prediction accuracy for "${itemName}" with actual price ${actualPrice}pts!\n` +
      `🧠 Bot is learning...`
    );
  } else {
    message.reply(
      `⚠️ No pending prediction found for "${itemName}". ` +
      `Make a prediction first with !predictprice.`
    );
  }
};
```

---

## 🗄️ Google Sheets Integration

### BotLearning Sheet Structure

The `BotLearning` sheet is automatically created on first prediction.

**Columns**:

| Column | Name | Type | Description |
|--------|------|------|-------------|
| A | Timestamp | Date | When prediction was made |
| B | Type | String | Prediction type (price_prediction, engagement, anomaly) |
| C | Target | String | What was predicted (item name, username) |
| D | Predicted | Mixed | The predicted value (number or string) |
| E | Actual | Mixed | The actual observed value (filled later) |
| F | Accuracy | Number | Calculated accuracy % (filled later) |
| G | Confidence | Number | Confidence score 0-100 |
| H | Features | String | JSON string of features used |
| I | Status | String | "pending" or "completed" |
| J | Notes | String | Optional notes |

**Example Data**:

| Timestamp | Type | Target | Predicted | Actual | Accuracy | Confidence | Features | Status | Notes |
|-----------|------|--------|-----------|--------|----------|------------|----------|--------|-------|
| 2025-11-06 14:30 | price_prediction | Crimson Pendant | 450 | 475 | 94.74 | 82.5 | {"historicalCount":15,"stdDev":45} | completed | |
| 2025-11-06 15:15 | price_prediction | Ruby Ring | 300 | | | 78.2 | {"historicalCount":8,"stdDev":32} | pending | |
| 2025-11-06 16:00 | engagement | PlayerX | will_attend | attended | 100 | 85.0 | {"engagementScore":85} | completed | |

### Google Apps Script Functions

#### 1. savePredictionForLearning()

```javascript
function savePredictionForLearning(data) {
  try {
    Logger.log('📚 Saving prediction for learning...');

    const sheet = getBotLearningSheet();  // Auto-creates if needed
    const timestamp = new Date();

    const type = data.type || 'unknown';
    const target = data.target || '';
    const predicted = data.predicted || '';
    const confidence = data.confidence || 0;
    const features = JSON.stringify(data.features || {});

    const newRow = [
      timestamp,
      type,
      target,
      predicted,
      '',          // Actual (empty initially)
      '',          // Accuracy (empty initially)
      confidence,
      features,
      'pending',   // Status
      ''           // Notes
    ];

    sheet.appendRow(newRow);

    const predictionId = sheet.getLastRow();

    Logger.log(`✅ Prediction saved: ID=${predictionId}, Type=${type}, Target=${target}`);

    return createResponse('ok', 'Prediction saved for learning', {
      predictionId: predictionId,
      timestamp: timestamp.toISOString()
    });

  } catch (err) {
    Logger.log('❌ Error saving prediction: ' + err.toString());
    return createResponse('error', err.toString());
  }
}
```

#### 2. updatePredictionAccuracy()

```javascript
function updatePredictionAccuracy(data) {
  try {
    Logger.log('📊 Updating prediction accuracy...');

    const sheet = getBotLearningSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return createResponse('ok', 'No predictions to update');
    }

    const type = data.type || '';
    const target = data.target || '';
    const actual = data.actual || '';

    // Find most recent pending prediction matching type and target
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 10);
    const values = dataRange.getValues();

    let updated = false;

    // Search from bottom up (most recent first)
    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i];
      const rowType = row[1];      // Type column
      const rowTarget = row[2];    // Target column
      const rowStatus = row[8];    // Status column

      if (rowType === type && rowTarget === target && rowStatus === 'pending') {
        const predicted = row[3];
        let accuracy = 0;

        // Calculate accuracy based on type
        if (type === 'price_prediction') {
          const predictedNum = Number(predicted);
          const actualNum = Number(actual);
          if (!isNaN(predictedNum) && !isNaN(actualNum) && actualNum > 0) {
            const diff = Math.abs(predictedNum - actualNum);
            accuracy = Math.max(0, 100 - (diff / actualNum * 100));
          }
        } else if (type === 'engagement' || type === 'attendance') {
          // For boolean predictions
          accuracy = (predicted === actual) ? 100 : 0;
        }

        // Update the row
        const rowIndex = i + 2; // +2 because i is 0-indexed and row 1 is headers
        sheet.getRange(rowIndex, 5).setValue(actual);              // Column E: Actual
        sheet.getRange(rowIndex, 6).setValue(accuracy.toFixed(2)); // Column F: Accuracy
        sheet.getRange(rowIndex, 9).setValue('completed');         // Column I: Status

        Logger.log(`✅ Updated prediction: Row=${rowIndex}, Accuracy=${accuracy.toFixed(2)}%`);
        updated = true;
        break;
      }
    }

    if (!updated) {
      Logger.log('⚠️ No matching pending prediction found');
      return createResponse('ok', 'No matching pending prediction found');
    }

    return createResponse('ok', 'Prediction accuracy updated');

  } catch (err) {
    Logger.log('❌ Error updating prediction accuracy: ' + err.toString());
    return createResponse('error', err.toString());
  }
}
```

#### 3. getLearningMetrics()

```javascript
function getLearningMetrics(data) {
  try {
    Logger.log('📊 Calculating learning metrics...');

    const sheet = getBotLearningSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return createResponse('ok', 'No learning data available', { metrics: {} });
    }

    const dataRange = sheet.getRange(2, 1, lastRow - 1, 10);
    const values = dataRange.getValues();

    const metrics = {
      total: values.length,
      byType: {},
      averageAccuracy: {},
      recentAccuracy: {}
    };

    const typeData = {};

    // Aggregate data by type
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const type = row[1];
      const accuracy = parseFloat(row[5]) || 0;
      const status = row[8];

      if (!typeData[type]) {
        typeData[type] = {
          total: 0,
          completed: 0,
          accuracySum: 0,
          recent: []
        };
      }

      typeData[type].total++;

      if (status === 'completed' && accuracy > 0) {
        typeData[type].completed++;
        typeData[type].accuracySum += accuracy;
        typeData[type].recent.push(accuracy);
      }
    }

    // Calculate averages
    for (const type in typeData) {
      const data = typeData[type];
      metrics.byType[type] = {
        total: data.total,
        completed: data.completed
      };

      if (data.completed > 0) {
        // Overall average
        metrics.averageAccuracy[type] = (data.accuracySum / data.completed).toFixed(2);

        // Recent average (last 10 predictions)
        const recent = data.recent.slice(-10);
        const recentSum = recent.reduce((a, b) => a + b, 0);
        metrics.recentAccuracy[type] = (recentSum / recent.length).toFixed(2);
      }
    }

    Logger.log(`✅ Metrics calculated: ${Object.keys(metrics.byType).length} types`);

    return createResponse('ok', 'Learning metrics calculated', { metrics });

  } catch (err) {
    Logger.log('❌ Error calculating metrics: ' + err.toString());
    return createResponse('error', err.toString(), { metrics: {} });
  }
}
```

---

## ⚙️ Configuration

### Learning System Configuration

Located in `learning-system.js`:

```javascript
const LEARNING_CONFIG = {
  // Minimum predictions needed before adjusting confidence
  MIN_SAMPLES_FOR_LEARNING: 10,

  // How much to adjust confidence based on accuracy
  CONFIDENCE_ADJUSTMENT_RATE: 0.1,  // 10% adjustment

  // Weight recent predictions more heavily
  RECENT_WEIGHT: 0.7,        // 70% weight on recent
  HISTORICAL_WEIGHT: 0.3,    // 30% weight on all-time

  // Cache duration (5 minutes)
  CACHE_DURATION: 5 * 60 * 1000,
};
```

**Tuning Guide**:

| Parameter | Current | Effect of Increasing | Effect of Decreasing |
|-----------|---------|---------------------|---------------------|
| MIN_SAMPLES_FOR_LEARNING | 10 | Bot waits longer before learning | Bot learns from less data (risky) |
| CONFIDENCE_ADJUSTMENT_RATE | 0.1 | Bigger confidence swings | Smaller confidence changes |
| RECENT_WEIGHT | 0.7 | More reactive to recent performance | More stable, ignores recent changes |
| CACHE_DURATION | 5 min | Fewer API calls, stale data | More API calls, fresh data |

### Intelligence Engine Configuration

Located in `intelligence-engine.js`:

```javascript
const INTELLIGENCE_CONFIG = {
  // Valuation thresholds
  MIN_HISTORICAL_SAMPLES: 3,     // Need 3+ past auctions to predict
  CONFIDENCE_THRESHOLD: 0.7,      // 70% confidence required
  PRICE_OUTLIER_STDEV: 2.5,      // Z-score for removing price outliers

  // Engagement scoring weights
  ENGAGEMENT_WEIGHTS: {
    attendance: 0.4,              // 40% weight
    bidding: 0.2,                 // 20% weight
    consistency: 0.2,             // 20% weight
    recentActivity: 0.2,          // 20% weight
  },

  // Anomaly detection
  ANOMALY_SEVERITY_THRESHOLDS: {
    HIGH: 3.0,                    // Z-score > 3.0 = HIGH
    MEDIUM: 2.0,                  // Z-score > 2.0 = MEDIUM
    // Below 2.0 = LOW
  },
};
```

---

## 🚀 Performance & Optimization

### Caching Strategy

The learning system uses **intelligent caching** to reduce API calls:

```javascript
class LearningSystem {
  constructor(config, sheetAPIInstance) {
    this.cache = {
      metrics: null,           // Cached metrics object
      lastUpdate: 0            // Timestamp of last update
    };
  }

  async getMetrics(useCache = true) {
    const now = Date.now();

    // Check if cache is fresh (< 5 minutes old)
    if (useCache &&
        this.cache.metrics &&
        (now - this.cache.lastUpdate) < LEARNING_CONFIG.CACHE_DURATION) {
      return this.cache.metrics;  // Return cached data
    }

    // Fetch fresh data from Google Sheets
    const response = await this.sheetAPI.getLearningMetrics({});

    if (response.status === 'ok') {
      // Update cache
      this.cache.metrics = response.data.metrics;
      this.cache.lastUpdate = now;
      return this.cache.metrics;
    }
  }
}
```

**Cache Invalidation**:
- Cache is cleared when prediction accuracy is updated
- Cache expires after 5 minutes
- `getMetrics(false)` forces fresh fetch

### Performance Metrics

| Operation | Time (avg) | API Calls | Notes |
|-----------|------------|-----------|-------|
| savePrediction() | ~500ms | 1 | Single sheet append |
| updatePredictionAccuracy() | ~800ms | 1 | Searches + updates row |
| getMetrics() [cached] | ~1ms | 0 | In-memory only |
| getMetrics() [fresh] | ~600ms | 1 | Fetches from sheets |
| adjustConfidence() [cached] | ~100ms | 0 | Uses cached metrics |
| adjustConfidence() [fresh] | ~700ms | 1 | Fetches metrics first |

### Optimization Tips

1. **Batch Predictions**: When analyzing multiple items, predictions are saved individually but metrics are fetched once

2. **Lazy Loading**: Metrics are only fetched when needed for confidence adjustment

3. **Background Updates**: Accuracy updates can happen asynchronously after auction completes

4. **Rate Limiting**: Sheet API includes automatic retry with exponential backoff

---

## 🔧 Troubleshooting

### Common Issues

#### Issue 1: "No predictions to update"

**Symptom**: Trying to update accuracy but system says no predictions found

**Causes**:
1. No prediction was made for this item
2. Prediction was already completed
3. Item name doesn't match exactly

**Solutions**:
```javascript
// Check BotLearning sheet manually
// Look for:
// - Type: "price_prediction"
// - Target: exact item name
// - Status: "pending"

// If item name differs, use exact name from prediction:
await learningSystem.updatePredictionAccuracy(
  'price_prediction',
  'Crimson Pendant',  // Must match EXACTLY what was saved
  475
);
```

#### Issue 2: Confidence not changing

**Symptom**: Bot makes predictions but confidence never adjusts

**Causes**:
1. Not enough completed predictions (need 10+)
2. Accuracy is in the "neutral zone" (70-80%)
3. Cache is preventing updates

**Solutions**:
```javascript
// Check number of completed predictions
const metrics = await learningSystem.getMetrics(false);
console.log(metrics.byType['price_prediction'].completed);
// If < 10, bot won't adjust yet

// Force cache refresh
learningSystem.clearCache();
const freshMetrics = await learningSystem.getMetrics(false);

// Check accuracy range
console.log(metrics.averageAccuracy['price_prediction']);
// If between 70-80%, no adjustment applied
```

#### Issue 3: Accuracy calculation seems wrong

**Symptom**: Accuracy % doesn't match expected value

**Explanation**:

For price predictions, accuracy is calculated as:
```javascript
const diff = Math.abs(predicted - actual);
const accuracy = Math.max(0, 100 - (diff / actual * 100));

// Example:
// Predicted: 450, Actual: 475
// diff = 25
// accuracy = 100 - (25 / 475 * 100) = 100 - 5.26 = 94.74%

// This means: prediction was off by 5.26%, so accuracy is 94.74%
```

#### Issue 4: BotLearning sheet not created

**Symptom**: Predictions fail with "sheet not found"

**Solution**:
The sheet is auto-created on first prediction. If it fails:

1. Check Google Apps Script permissions
2. Manually create sheet with exact name "BotLearning"
3. Add headers in row 1 (see sheet structure above)
4. Ensure bot has write access to spreadsheet

#### Issue 5: Google Sheets quota exceeded

**Symptom**: "Service invoked too many times" error

**Explanation**:
Google Sheets has quotas:
- Read/Write: 100 requests per 100 seconds per user

**Solutions**:
1. Learning system already uses caching (5 min cache)
2. Increase CACHE_DURATION if needed
3. Batch operations when possible
4. Check for unnecessary repeated calls

---

## 📖 Additional Resources

### Related Documentation

- `INTELLIGENCE_FEATURES.md` - User-facing feature guide
- `README.md` - General bot documentation
- `help-system.js` - Command reference

### Code Reference

- `learning-system.js:62-69` - LearningSystem class constructor
- `learning-system.js:80-102` - savePrediction() method
- `learning-system.js:195-248` - adjustConfidence() algorithm
- `intelligence-engine.js:125-218` - predictItemValue() with learning
- `Code.js:1919-1960` - Google Apps Script savePredictionForLearning()
- `Code.js:1970-2036` - Google Apps Script updatePredictionAccuracy()

### Mathematical Formulas

**Accuracy Calculation (Price Prediction)**:
```
accuracy = max(0, 100 - (|predicted - actual| / actual × 100))
```

**Weighted Accuracy**:
```
weightedAccuracy = (recentAccuracy × 0.7) + (avgAccuracy × 0.3)
```

**Confidence Adjustment**:
```
if weightedAccuracy ≥ 90%:
    adjustment = baseConfidence × 0.1
elif weightedAccuracy ≥ 80%:
    adjustment = baseConfidence × 0.05
elif weightedAccuracy < 70%:
    adjustment = -baseConfidence × 0.1
else:
    adjustment = 0

adjustedConfidence = clamp(baseConfidence + adjustment, 0, 100)
```

**Confidence Calculation (Initial)**:
```
confidence = min(100, (sampleSize / 20 × 50) + ((1 - stdDev/mean) × 30) + 20)
```

---

## 🎓 Summary

The ELYSIUM Bot Learning System is a **sophisticated yet practical** implementation of machine learning feedback loops using Google Sheets as persistent storage. Key innovations include:

1. **Persistence on Ephemeral Platform**: Solves Koyeb storage limitations
2. **Transparent Learning**: All data visible in Google Sheets
3. **Adaptive Confidence**: Bot knows when it's reliable
4. **Type-Agnostic**: Works for prices, engagement, anomalies, etc.
5. **Zero Breaking Changes**: Existing features unchanged

The system is designed to be:
- **Maintainable**: Clear code structure, well-documented
- **Debuggable**: All predictions logged, metrics available
- **Extensible**: Easy to add new prediction types
- **Performant**: Caching reduces API calls
- **Reliable**: Error handling, retry logic, validation

As the bot makes more predictions and receives feedback, it will naturally improve its accuracy and confidence calibration, becoming a more valuable tool for guild management over time.

---

**Questions or Issues?**

- Check `INTELLIGENCE_FEATURES.md` for user guide
- Review code comments in `learning-system.js`
- Inspect `BotLearning` sheet in Google Sheets
- Use `!performance` command to see metrics

