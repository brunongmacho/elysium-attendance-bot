# Koyeb ML Integration Deployment Guide

Complete guide to deploying the Elysium Bot with ML capabilities on Koyeb's **FREE TIER**.

## 🎯 What You'll Deploy

- **Service 1**: Discord Bot (Node.js) - Already running ✅
- **Service 2**: ML Service (Python/FastAPI) - NEW 🚀
- **Cost**: $0 (both services fit in Koyeb free tier)

## 📋 Prerequisites

1. **Koyeb Account** (free tier)
2. **GitHub Repository** with your bot code
3. **Discord Bot Token** (already configured)
4. **Google Sheets Webhook URL** (already configured)

## 🚀 Deployment Steps

### Step 1: Push ML Service Code to GitHub

Your ML service code is in the `ml-service/` directory. Commit and push:

```bash
git add ml-service/
git add ml-client.js
git add config.json
git commit -m "Add ML service integration"
git push origin main
```

### Step 2: Deploy ML Service on Koyeb

1. **Go to Koyeb Dashboard**: https://app.koyeb.com
2. **Click "Create Service"**
3. **Configure the ML Service**:

   **Build & Deployment:**
   - **Name**: `elysium-ml-service`
   - **Source**: GitHub (select your repository)
   - **Branch**: `main` or your current branch
   - **Builder**: Dockerfile
   - **Dockerfile path**: `ml-service/Dockerfile`

   **Instance:**
   - **Instance type**: Web service
   - **Region**: Choose closest to you (e.g., Washington, Frankfurt)
   - **Instance size**: **Eco** (512MB RAM) - FREE TIER ✅

   **Ports:**
   - **Port**: 8000 (FastAPI)
   - **Protocol**: HTTP

   **Environment Variables:**
   ```
   SHEETS_WEBHOOK_URL = https://script.google.com/macros/s/AKfycbyUzmDjlSOP31bVUJHS9EetV5jT_aYwf6vC7m1F0Ik1fC8mmfofh8gKYZYLZ5qWIkbI/exec
   DEBUG = false
   ```

   **Health Check:**
   - **Path**: `/health`
   - **Port**: 8000
   - **Protocol**: HTTP

4. **Click "Deploy"**

Wait 3-5 minutes for deployment. You'll get a URL like: `https://elysium-ml-service-xxxxx.koyeb.app`

### Step 3: Update Bot Configuration

#### Option A: Use Koyeb Internal Networking (Recommended - FREE)

If both services are in the **same Koyeb app**, they can communicate internally:

**No changes needed!** Your `config.json` already has:
```json
"ml_service_url": "http://elysium-ml-service:8000"
```

Koyeb automatically resolves `elysium-ml-service` to the internal service.

#### Option B: Use Public URL (Alternative)

If services are in different apps, use the public URL:

Edit `config.json`:
```json
"ml_service_url": "https://elysium-ml-service-xxxxx.koyeb.app"
```

**Replace `xxxxx` with your actual Koyeb URL.**

### Step 4: Update Your Discord Bot (If Needed)

If your bot is already deployed on Koyeb, you need to trigger a redeployment to pick up the new configuration:

1. Go to your Discord bot service in Koyeb
2. Click **"Redeploy"**
3. Wait 2-3 minutes

**OR** just push new code:
```bash
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

### Step 5: Verify ML Service is Running

#### Test 1: Health Check

```bash
curl https://your-ml-service-url.koyeb.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "models_loaded": true
}
```

#### Test 2: Get Service Info

```bash
curl https://your-ml-service-url.koyeb.app/
```

Expected response:
```json
{
  "service": "Elysium ML Service",
  "status": "operational",
  "version": "1.0.0",
  "models": {
    "price_prediction": true
  }
}
```

#### Test 3: Make a Prediction

```bash
curl -X POST https://your-ml-service-url.koyeb.app/predict/price \
  -H "Content-Type: application/json" \
  -d '{
    "item_name": "Dragon Weapon Fragment",
    "features": {
      "item_avg_price": 1500,
      "item_median_price": 1450,
      "item_price_std": 200,
      "item_auction_count": 25,
      "day_of_week": 6,
      "hour_of_day": 12,
      "active_members_count": 45,
      "recent_price_trend": 1.15
    }
  }'
```

Expected response:
```json
{
  "predicted_price": 1667.5,
  "confidence": 0.85,
  "model_used": "statistical",
  "confidence_interval": {
    "lower": 1275.5,
    "upper": 2059.5
  },
  "message": "Statistical prediction for Dragon Weapon Fragment (no ML model trained yet)"
}
```

### Step 6: Test from Discord Bot

In your Discord server, test a price prediction command (you'll need to integrate this into your bot - see next section).

## 🔌 Integrating ML into Your Bot Commands

### Option 1: Update `intelligence-engine.js` (Recommended)

Add ML client to your intelligence engine:

```javascript
// At the top of intelligence-engine.js
const { MLClient } = require('./ml-client.js');
const config = require('./config.json');

class IntelligenceEngine {
  constructor(client, config, sheetAPIInstance) {
    // ... existing code ...

    // Initialize ML client
    if (config.ml_enabled) {
      this.mlClient = new MLClient(
        config.ml_service_url,
        {
          fallbackEnabled: config.ml_fallback_enabled !== false,
          timeout: 5000
        }
      );
      console.log('✅ ML client initialized:', config.ml_service_url);
    } else {
      this.mlClient = null;
      console.log('⚠️ ML disabled in config');
    }
  }

  // Update your existing predictPrice method
  async predictPrice(itemName, options = {}) {
    try {
      // Extract features from historical data
      const features = await this.extractPriceFeatures(itemName);

      // If ML is enabled, use ML client
      if (this.mlClient) {
        const mlPrediction = await this.mlClient.predictPrice(itemName, features);

        return {
          item: itemName,
          predicted_price: mlPrediction.predicted_price,
          confidence: mlPrediction.confidence,
          model: mlPrediction.model_used,
          confidence_interval: mlPrediction.confidence_interval,
          message: this.formatPredictionMessage(mlPrediction)
        };
      }

      // Fallback to existing rule-based logic
      return this.predictPriceRuleBased(itemName, features);

    } catch (error) {
      console.error('Price prediction error:', error);
      throw error;
    }
  }

  // Helper method to extract features
  async extractPriceFeatures(itemName) {
    // Get historical auction data
    const auctionHistory = await this.getItemAuctionHistory(itemName);

    if (!auctionHistory || auctionHistory.length === 0) {
      // No history, return defaults
      return {
        item_avg_price: 1000,
        item_median_price: 1000,
        item_price_std: 200,
        item_auction_count: 0,
        day_of_week: new Date().getDay(),
        hour_of_day: new Date().getHours(),
        active_members_count: 45, // Get from guild
        recent_price_trend: 1.0
      };
    }

    // Calculate statistics
    const prices = auctionHistory.map(a => a.final_price || a.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Calculate standard deviation
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - avg, 2), 0) / prices.length;
    const std = Math.sqrt(variance);

    // Calculate recent trend (last 3 vs all)
    const recent3 = prices.slice(-3);
    const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    const trend = recentAvg / avg;

    return {
      item_avg_price: avg,
      item_median_price: median,
      item_price_std: std,
      item_auction_count: prices.length,
      day_of_week: new Date().getDay(),
      hour_of_day: new Date().getHours(),
      active_members_count: 45, // TODO: Get actual active members
      recent_price_trend: trend
    };
  }

  formatPredictionMessage(prediction) {
    const model = prediction.model_used === 'ml' ? '🤖 ML Model' : '📊 Statistical';
    const confidence = (prediction.confidence * 100).toFixed(0);

    return `${model} predicts **${Math.round(prediction.predicted_price)}** points (${confidence}% confident)`;
  }
}
```

### Option 2: Test ML Service Directly (Quick Test)

Add a test command to see if ML works:

```javascript
// In your command handler
if (message.content.startsWith('!testml')) {
  const { MLClient } = require('./ml-client.js');
  const config = require('./config.json');

  const mlClient = new MLClient(config.ml_service_url);

  // Check health
  const healthy = await mlClient.isHealthy();

  if (healthy) {
    // Test prediction
    const prediction = await mlClient.predictPrice('Test Item', {
      item_avg_price: 1500,
      item_median_price: 1450,
      item_price_std: 200,
      item_auction_count: 25,
      day_of_week: 6,
      hour_of_day: 12,
      active_members_count: 45,
      recent_price_trend: 1.15
    });

    await message.reply(
      `✅ ML Service is working!\n` +
      `Predicted Price: ${Math.round(prediction.predicted_price)} pts\n` +
      `Confidence: ${(prediction.confidence * 100).toFixed(0)}%\n` +
      `Model: ${prediction.model_used}`
    );
  } else {
    await message.reply('❌ ML Service is not responding');
  }
}
```

## 📊 Koyeb Free Tier Limits

### What's Included (FREE):
- ✅ 2 web services OR 1 web + 1 worker
- ✅ 512MB RAM per service
- ✅ Shared CPU (sufficient for your bot)
- ✅ Internal networking (free communication between services)
- ✅ Automatic HTTPS
- ✅ Health checks
- ✅ Auto-restart on crash

### Limits:
- ⚠️ Services sleep after 30 minutes of inactivity (on free tier)
- ⚠️ Cold start: ~10-30 seconds when waking up
- ⚠️ No persistent storage (use Google Sheets or external DB)

### How to Prevent Sleep:
Add a keep-alive ping to your bot:

```javascript
// In your bot startup (index2.js)
const { MLClient } = require('./ml-client.js');
const config = require('./config.json');

// Ping ML service every 25 minutes to keep it awake
if (config.ml_enabled) {
  const mlClient = new MLClient(config.ml_service_url);

  setInterval(async () => {
    try {
      await mlClient.isHealthy();
      console.log('🏓 Pinged ML service to keep alive');
    } catch (error) {
      console.error('ML service ping failed:', error.message);
    }
  }, 25 * 60 * 1000); // 25 minutes
}
```

## 🔧 Troubleshooting

### Issue 1: ML Service Returns 503 (Service Unavailable)

**Cause**: Model failed to load or service crashed

**Solution**:
1. Check Koyeb logs for ML service
2. Verify Dockerfile is correct
3. Check memory usage (might exceed 512MB)
4. Fallback will automatically engage ✅

### Issue 2: Bot Can't Connect to ML Service

**Cause**: Wrong URL or networking issue

**Solution**:
1. Verify `ml_service_url` in `config.json`
2. If using internal networking, ensure both services are in same Koyeb app
3. If using public URL, ensure HTTPS and correct domain
4. Check CORS is enabled (already configured in `main.py`)

### Issue 3: ML Service is Slow

**Cause**: Cold start or limited CPU

**Solution**:
1. Implement keep-alive pinging (see above)
2. Increase timeout in `ml-client.js` (default 5s)
3. Use caching (already enabled)

### Issue 4: Memory Exceeded (512MB)

**Cause**: Model is too large

**Solution**:
1. Use lighter models (XGBoost instead of deep learning)
2. Reduce worker count (already set to 1)
3. Clear cache periodically
4. Consider upgrading to $5/month 1GB instance (if needed)

## 📈 Monitoring

### Check ML Service Stats

Add this to your bot:

```javascript
// Command: !mlstats
if (message.content === '!mlstats') {
  const stats = mlClient.getStats();
  const info = await mlClient.getInfo();

  await message.reply(
    `**ML Service Statistics**\n` +
    `📊 Total Requests: ${stats.mlRequests}\n` +
    `✅ Successes: ${stats.mlSuccesses}\n` +
    `❌ Failures: ${stats.mlFailures}\n` +
    `🔄 Fallbacks: ${stats.fallbackUses}\n` +
    `💾 Cache Hits: ${stats.cacheHits}\n` +
    `🎯 Success Rate: ${stats.successRate}\n\n` +
    `**Models Loaded:**\n` +
    `${info.price_predictor?.status || 'Unknown'}`
  );
}
```

### Koyeb Dashboard Monitoring

1. Go to your ML service in Koyeb dashboard
2. Click "Metrics" tab
3. Monitor:
   - CPU usage
   - Memory usage
   - Request count
   - Response time

## 🎓 Next Steps

### Phase 2: Train Real ML Models

Once you have the infrastructure working, you can:

1. **Collect training data** from Google Sheets
2. **Train XGBoost model** locally
3. **Upload trained model** to ML service
4. **Replace statistical fallback** with real ML

See the main ML integration plan for details on training models.

### Phase 3: Add More ML Features

- Churn prediction
- Spawn time prediction
- Enhanced NLP
- Anomaly detection

## 💰 Cost Summary

### Current Setup (FREE):
- Discord Bot: 512MB (free tier service #1)
- ML Service: 512MB (free tier service #2)
- **Total: $0/month** 🎉

### If You Outgrow Free Tier:
- Upgrade ML service to 1GB: +$5/month
- Add PostgreSQL database: +$5/month
- **Total: $10/month** (still very affordable)

## 📝 Summary

You now have:
- ✅ Full ML service infrastructure
- ✅ Deployed on Koyeb free tier
- ✅ Automatic fallback to rule-based
- ✅ Health checks and monitoring
- ✅ Production-ready error handling
- ✅ Zero additional cost

**The ML service is ready to use!** You can now integrate it into your existing bot commands and start seeing ML-powered predictions.

---

Need help? Check the troubleshooting section or reach out!
