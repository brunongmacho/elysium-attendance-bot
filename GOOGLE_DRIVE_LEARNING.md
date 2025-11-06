# Google Drive Learning System Integration

## 🎯 Overview

The ELYSIUM bot uses **60GB of Google Drive storage** to enhance the learning system with persistent data storage, automated backups, and detailed ML analytics. This system operates **independently of Discord bot status** - all automation runs from Google Apps Script, ensuring data persistence even during Koyeb restarts or crashes.

**Drive Folder:** [ELYSIUM_Bot](https://drive.google.com/drive/folders/1Kb5CFlzIDmv_p7FRYZ6XzVyte0Vvvf78)

---

## 📊 Key Features

### 1. **Learning Data Exports** 🤖

**Purpose**: Store detailed prediction data for long-term analysis and ML model improvements.

**What's Exported**:
- All predictions (price, engagement, anomalies)
- Complete feature sets used for each prediction
- Actual outcomes vs. predicted values
- Confidence scores and accuracy metrics
- Timestamped for trend analysis

**Export Format**:
```json
{
  "exportDate": "2025-01-15T02:00:00.000Z",
  "totalPredictions": 247,
  "predictions": [
    {
      "timestamp": "2025-01-14T12:30:00.000Z",
      "type": "price_prediction",
      "target": "Crimson Pendant",
      "predicted": 450,
      "actual": 480,
      "accuracy": 93.75,
      "confidence": 85,
      "features": {
        "historicalAuctions": 15,
        "averagePrice": 445,
        "medianPrice": 450,
        "stdDev": 25,
        "trend": "stable",
        "recentAverage": 460
      }
    }
  ],
  "summary": {
    "completed": 180,
    "pending": 67,
    "averageAccuracy": 87.34,
    "byType": {
      "price_prediction": {
        "total": 150,
        "completed": 120,
        "avgAccuracy": 89.2
      }
    }
  }
}
```

**Automation**: Exports run **every Monday at 2am GMT+8** (weekly learning review)

**Storage Location**: `/Learning_Data/Analytics/YYYY-MM-DD/`

---

### 2. **ML Training Data** 🧠

**Purpose**: Flattened feature dataset for training improved prediction models.

**What's Exported**:
- Completed predictions only (have actual outcomes)
- Flattened feature vectors for ML processing
- Labels (actual values) for supervised learning
- Ready for Python/R ML libraries

**Export Format**:
```json
[
  {
    "type": "price_prediction",
    "target": "Crimson Pendant",
    "predicted": 450,
    "actual": 480,
    "accuracy": 93.75,
    "confidence": 85,
    "flatFeatures": {
      "historicalAuctions": 15,
      "averagePrice": 445,
      "medianPrice": 450,
      "stdDev": 25,
      "trendNumeric": 0,
      "recentAverage": 460,
      "label": 480,
      "prediction": 450
    }
  }
]
```

**Use Cases**:
- Train regression models for price prediction
- Feature importance analysis
- Model performance evaluation
- A/B testing new prediction algorithms

**Automation**: Exports run **every Monday at 2am GMT+8** (same as learning data)

**Storage Location**: `/Learning_Data/Analytics/`

---

### 3. **Automated Daily Backups** 💾

**Purpose**: Disaster recovery and data protection.

**What's Backed Up**:
- `BiddingPoints` - All member points
- `TotalAttendance` - Historical attendance
- `ForDistribution` - Auction history
- `BiddingItems` - Auction queue
- `BotLearning` - All predictions (most important!)
- `Queue` - Upcoming items
- Current week sheet (e.g., `ELYSIUM_WEEK_20250112`)

**Backup Format**: JSON with complete sheet data

**Retention**: **30 days** (older backups auto-deleted)

**Automation**: Runs **every day at midnight GMT+8**

**Storage Location**: `/Backups/YYYY-MM-DD/`

**Recovery**: If data is lost, restore from latest backup JSON

---

### 4. **Audit Trail Logging** 📝

**Purpose**: Track admin actions for accountability and debugging.

**What's Logged**:
- Admin command executions
- Manual point adjustments
- Auction interventions
- Emergency recovery actions

**Log Format**: JSON Lines (one entry per line)
```jsonl
{"timestamp":"2025-01-14T15:30:00.000Z","action":"updateprediction","username":"AdminUser","details":{"item":"Crimson Pendant","actualPrice":480}}
{"timestamp":"2025-01-14T16:00:00.000Z","action":"forceend","username":"AdminUser","details":{"reason":"Emergency stop"}}
```

**Storage Location**: `/Audit_Logs/YYYY-MM-DD/audit_YYYY-MM-DD.jsonl`

---

## 📂 Folder Structure

```
ELYSIUM_Bot/ (60GB)
├── Learning_Data/
│   ├── Predictions/           (prediction history)
│   └── Analytics/
│       ├── 2025-01-15/       (dated folders)
│       │   ├── learning_export_2025-01-15_02-00-00.json
│       │   └── ml_training_data_2025-01-15.json
│       └── 2025-01-22/
│           └── ...
├── Backups/
│   ├── 2025-01-15/
│   │   └── backup_2025-01-15_00-00-00.json
│   ├── 2025-01-16/
│   │   └── backup_2025-01-16_00-00-00.json
│   └── ... (30 days retention)
└── Audit_Logs/
    ├── 2025-01-15/
    │   └── audit_2025-01-15.jsonl
    └── 2025-01-16/
        └── audit_2025-01-16.jsonl
```

---

## ⚙️ Setup Instructions

### Step 1: Google Drive Folder Access

1. Open [ELYSIUM_Bot Drive Folder](https://drive.google.com/drive/folders/1Kb5CFlzIDmv_p7FRYZ6XzVyte0Vvvf78)
2. Verify you have edit access
3. Folder structure will be created automatically on first run

### Step 2: Apps Script Time-Driven Triggers

**IMPORTANT**: These triggers run from Google's servers, not your Discord bot. They survive Koyeb restarts/crashes!

1. Open [Google Sheets](https://docs.google.com/spreadsheets/d/1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ/edit)
2. Go to **Extensions > Apps Script**
3. Click **⏰ Triggers** icon (left sidebar)
4. Click **+ Add Trigger** button

**Create These 3 Triggers**:

#### Trigger 1: Daily Automated Backup
- Function: `dailyAutomatedBackup`
- Event source: `Time-driven`
- Type: `Day timer`
- Time of day: `12am-1am`
- Failure notifications: `Notify me immediately`

#### Trigger 2: Weekly Learning Export
- Function: `weeklyLearningExport`
- Event source: `Time-driven`
- Type: `Week timer`
- Day of week: `Monday`
- Time of day: `2am-3am`
- Failure notifications: `Notify me immediately`

#### Trigger 3: Sunday Weekly Sheet Creation (should already exist)
- Function: `sundayWeeklySheetCreation`
- Event source: `Time-driven`
- Type: `Week timer`
- Day of week: `Sunday`
- Time of day: `12am-1am`

**All triggers use Manila timezone (Asia/Manila)**

### Step 3: Test the Setup

1. In Apps Script, go to `dailyAutomatedBackup()` function
2. Click **Run** button (▶️)
3. Authorize if prompted
4. Check Drive folder - you should see:
   - `Backups/YYYY-MM-DD/backup_*.json`
   - `Learning_Data/` folder structure

---

## 🔄 Automation Schedule

| Task | Frequency | Time (GMT+8) | Trigger Function | Status |
|------|-----------|--------------|------------------|--------|
| **Daily Backup** | Every day | 12:00 AM | `dailyAutomatedBackup()` | ✅ Automated |
| **Learning Export** | Every Monday | 2:00 AM | `weeklyLearningExport()` | ✅ Automated |
| **Weekly Sheet** | Every Sunday | 12:00 AM | `sundayWeeklySheetCreation()` | ✅ Automated |

---

## 🧠 Learning System Benefits

### 1. **Long-Term Pattern Analysis**
With persistent Drive storage, you can:
- Analyze prediction accuracy over months/years
- Identify seasonal patterns in item prices
- Track engagement trends across multiple weeks
- Detect long-term anomalies

### 2. **Model Improvement**
ML training data enables:
- Training custom prediction models
- Testing different algorithms
- Feature engineering experiments
- A/B testing new approaches

### 3. **Data Safety**
Automated backups ensure:
- Recovery from accidental deletions
- Protection against sheet corruption
- Historical data preservation
- Point-in-time restoration

### 4. **Accountability**
Audit trails provide:
- Admin action history
- Debugging capabilities
- Dispute resolution
- System behavior tracking

---

## 📈 Future Enhancements

With 60GB available, potential expansions include:

1. **Historical Trend Visualizations**
   - Generate charts/graphs from exported data
   - Visual reports for guild leadership

2. **Advanced ML Models**
   - Train neural networks for prediction
   - Ensemble models combining multiple approaches
   - Real-time model updates

3. **Data Analytics Dashboard**
   - Web-based analytics viewer
   - Interactive exploration of historical data

4. **Extended Retention**
   - Keep learning data indefinitely
   - Multi-year trend analysis

---

## 🛠️ Troubleshooting

### Trigger Not Running?

1. Check Apps Script **Executions** log
2. Verify trigger is enabled (not paused)
3. Check for authorization issues
4. Ensure function names match exactly

### Drive Quota Issues?

1. Current usage: Check Drive folder properties
2. Old backups: Auto-deleted after 30 days
3. Manual cleanup: Delete old analytics exports if needed

### Missing Data?

1. Check Apps Script execution logs
2. Verify Drive folder permissions
3. Run trigger manually to test
4. Check for script errors in logs

---

## 📊 Storage Estimates

With **60GB available**:

| Data Type | Size per Day | 1 Year Total | Notes |
|-----------|--------------|--------------|-------|
| Daily Backups | ~5 MB | ~150 MB | 30-day retention (only ~150MB total) |
| Learning Exports | ~2 MB | ~100 MB | Weekly exports |
| ML Training Data | ~1 MB | ~50 MB | Weekly exports |
| Audit Logs | ~0.5 MB | ~180 MB | Daily logs |
| **Total** | | **~480 MB/year** | **Plenty of headroom!** |

You could run this system for **100+ years** before hitting 60GB! 🎉

---

## ✅ Summary

**What Happens Automatically**:
1. ✅ Daily backups at midnight (all sheets saved)
2. ✅ Weekly learning exports (Monday 2am)
3. ✅ ML training data exports (Monday 2am)
4. ✅ Audit logging on admin actions
5. ✅ 30-day backup retention (auto-cleanup)

**What You Need to Do**:
1. ✅ Set up 2 time-driven triggers (one-time setup)
2. ✅ Verify Drive folder access
3. ✅ That's it! Everything else is automatic

**Resilience**:
- ✅ Survives Discord bot restarts
- ✅ Survives Koyeb crashes
- ✅ Runs from Google's servers
- ✅ Independent of bot status

---

**Your learning data is now persistent, backed up, and ready for advanced ML analysis!** 🚀
