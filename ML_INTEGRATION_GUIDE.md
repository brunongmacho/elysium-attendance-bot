# ML Integration Guide

Complete guide to using the new ML features for spawn prediction and NLP conversation.

## 🎯 What Was Added

### 1. **ML Spawn Prediction** (`ml-spawn-predictor.js`)
- Learns from historical spawn times
- Accounts for variance (bosses don't spawn exactly on configured time)
- Provides confidence intervals
- Gets better with more data

**Example:**
```
Boss configured: "Spawns 24 hours after kill"
ML learns: Actually spawns 24h ±27 minutes
Prediction: "Next spawn: 2:30 PM with 90% confidence (2:03 PM - 2:57 PM window)"
```

### 2. **ML NLP Conversation** (`ml-nlp-enhancer.js`)
- Context-aware (remembers last 10 messages)
- Sentiment analysis (detects frustration, confusion, happiness)
- Intent confidence scoring
- Learns from successful/failed interactions

**Example:**
```
User: "this doesn't work"
Bot detects: Frustrated sentiment
Bot responds with empathy: "Looks like you're having trouble! Let me help..."
```

### 3. **ML Integration** (`ml-integration.js`)
- Easy on/off toggle via config.json
- Automatic background learning
- Falls back gracefully if ML fails

## 🚀 How to Use

### Enable ML Features

Your `config.json` already has ML enabled:
```json
{
  "ml_enabled": true,
  "ml_fallback_enabled": true
}
```

### Commands to Try

#### 1. Spawn Prediction with ML

Add this command to your bot (example integration):

```javascript
// In your command handler (e.g., intelligence-engine.js or new command file)
if (command === '!mlspawn' || command === '!predictspawn') {
  const bossName = args.join(' ');

  if (!bossName) {
    return message.reply('Please specify a boss name. Example: !mlspawn Valakas');
  }

  // Get last kill time from attendance data
  const lastKill = await getLastBossKill(bossName); // Your existing function

  if (!lastKill) {
    return message.reply(`No recent kill data for ${bossName}`);
  }

  // Get configured interval from boss_spawn_config.json
  const spawnConfig = getBossSpawnConfig(bossName); // Your existing function
  const configuredInterval = spawnConfig?.spawnIntervalHours || 24;

  // Get ML prediction
  const prediction = await mlIntegration.enhanceSpawnPrediction(
    bossName,
    lastKill.timestamp,
    configuredInterval
  );

  if (prediction) {
    // Format and send ML prediction
    const formatted = mlIntegration.formatSpawnPrediction(prediction);
    return message.reply(formatted);
  } else {
    // Fallback to existing logic
    return message.reply('ML prediction not available, using configured timer');
  }
}
```

**Example Output:**
```
🔮 **Valakas Spawn Prediction**

📅 **Most Likely**: Nov 13, 2:30 PM
🎯 **92% Confidence Window**: 2:03 PM - 2:57 PM
⏱️ **Window Size**: ±27 minutes

🤖 **ML Model**: Learned from 15 historical spawns
📊 **Average Interval**: 24.12h ±0.45h
```

#### 2. Check ML Learning Stats

```javascript
// Admin command: !mlstats
if (command === '!mlstats' && isAdmin(message.author)) {
  const stats = await mlIntegration.getStats();

  let reply = '**🤖 ML Statistics**\n\n';

  // Spawn prediction stats
  reply += `**Spawn Prediction:**\n`;
  reply += `├─ Bosses learned: ${stats.spawn.patternsLearned}\n`;

  for (const [boss, pattern] of Object.entries(stats.spawn.patterns)) {
    reply += `├─ ${boss}: ${pattern.sampleSize} spawns, ${(pattern.confidence * 100).toFixed(0)}% confidence\n`;
  }

  // NLP stats
  reply += `\n**NLP Enhancement:**\n`;
  reply += `├─ Total patterns: ${stats.nlp.totalPatterns}\n`;
  reply += `├─ Successful: ${stats.nlp.successfulPatterns}\n`;

  for (const [intent, data] of Object.entries(stats.nlp.byIntent)) {
    reply += `├─ ${intent}: ${data.successRate.toFixed(0)}% success rate\n`;
  }

  return message.reply(reply);
}
```

#### 3. Enhanced NLP Conversation

The NLP enhancement works automatically when users tag the bot without a command:

```javascript
// In your NLP conversation handler (nlp-conversation.js)

// After your existing NLP pattern matching
const baseIntent = matchedIntent; // Your existing matched intent

// Enhance with ML
const mlAnalysis = await mlIntegration.enhanceNLPConversation(
  message.author.id,
  messageText,
  baseIntent
);

if (mlAnalysis) {
  // Check sentiment and adjust response
  if (mlAnalysis.sentiment.primary === 'frustrated') {
    // User is frustrated - be more helpful
    const suggestion = mlIntegration.getSuggestedResponse(mlAnalysis);
    return message.reply(suggestion + '\n\nNeed help? Try !help or ask me anything!');
  }

  if (mlAnalysis.sentiment.primary === 'confused') {
    // User is confused - show examples
    return message.reply(
      "Let me help clarify! Here are some things you can do:\n" +
      "• !mypoints - Check your points\n" +
      "• !bid 500 - Place a bid\n" +
      "• !leaderboard - See rankings\n" +
      "• !mlspawn Valakas - Predict boss spawn"
    );
  }

  // Log successful interaction for learning
  if (baseIntent) {
    mlIntegration.learnNLPSuccess(
      baseIntent,
      messageText,
      mlAnalysis.intentAnalysis.confidence
    );
  }
}

// Continue with your existing response logic
```

## 📊 How It Learns

### Spawn Prediction Learning

**Automatic Learning:**
1. On bot startup: Analyzes last 90 days of attendance data
2. Every 6 hours: Re-learns from updated data
3. Stores learned patterns in memory

**What it learns:**
- Average spawn interval (e.g., 24.12 hours instead of exactly 24)
- Variance/consistency (±30 minutes vs ±2 hours)
- Confidence based on sample size and consistency

**Example learning output:**
```
✅ Learned pattern for Valakas: 24.12h ±0.45h (15 samples, 92% confidence)
✅ Learned pattern for Ego: 21.23h ±1.12h (8 samples, 78% confidence)
⚠️ Not enough data for Benji (only 2 spawns)
```

### NLP Learning

**Automatic Learning:**
1. Tracks last 10 messages per user for context
2. Learns from successful command recognitions
3. Learns from failed interactions
4. Clears old context after 24 hours (memory management)

**What it learns:**
- Conversation patterns (user keeps asking about spawns → probably wants spawn info)
- Sentiment patterns (certain phrases indicate frustration)
- Intent keywords (new ways users phrase commands)

## 🎛️ Configuration

### Enable/Disable ML

**Disable all ML features:**
```json
{
  "ml_enabled": false
}
```

**Enable with fallback:**
```json
{
  "ml_enabled": true,
  "ml_fallback_enabled": true  // Falls back to rule-based if ML fails
}
```

### Memory Usage

**Current overhead:**
- ML Spawn Predictor: ~5-10 MB (lightweight)
- ML NLP Enhancer: ~2-5 MB (context window)
- **Total: ~10-15 MB** (fits easily in 512MB)

Your bot currently uses ~100MB, so ML adds minimal overhead.

## 🧪 Testing

### Test Spawn Prediction

```javascript
// Test with a boss that has historical data
!mlspawn Valakas

// Test with a new boss (should fallback to configured timer)
!mlspawn SomeNewBoss
```

### Test NLP Enhancement

```
Tag bot with frustration:
@Bot this doesn't work wtf

Expected: Bot detects frustration and responds empathetically
```

```
Tag bot with confusion:
@Bot how do I check my points?

Expected: Bot detects confusion and provides examples
```

## 🐛 Troubleshooting

### Spawn Prediction Not Working

**Issue:** Returns "No historical data for this boss yet"

**Solution:**
- Boss needs at least 3 historical kills in attendance data
- Wait for more data to accumulate
- Falls back to configured timer (works fine)

### NLP Enhancement Not Active

**Issue:** Bot doesn't seem to detect sentiment

**Solution:**
- Check `ml_enabled: true` in config.json
- Verify MLIntegration is initialized in index2.js
- Check console logs for "ML Integration ready"

### Memory Issues

**Issue:** Bot runs out of memory

**Solution:**
- ML features are lightweight (~15MB)
- If memory is tight, disable ML: `ml_enabled: false`
- Clear context more frequently (reduce context window in ml-nlp-enhancer.js)

## 📈 Expected Results

### Spawn Prediction Accuracy

**Without ML (Current):**
- Uses fixed configured timer
- ±15 minutes confidence window (conservative)
- Doesn't account for actual spawn variance

**With ML (New):**
- Learns actual spawn intervals from history
- Dynamic confidence window based on variance
- Gets more accurate with more data
- 85-95% confidence when enough data

**Example Improvement:**
```
Before ML:
"Valakas spawns in 24 hours" (±15 min guess)

After ML:
"Valakas spawns in 24h 7min (92% confident, ±27 min based on 15 spawns)"
```

### NLP Conversation Quality

**Without ML (Current):**
- Pure regex pattern matching
- No context awareness
- Same response regardless of user mood
- Doesn't learn from interactions

**With ML (New):**
- Context-aware (remembers conversation)
- Adjusts tone based on sentiment
- Learns successful patterns
- More natural, helpful responses

**Example Improvement:**
```
User: "bid not working again"  ← Second time asking

Without ML:
"I'm not sure what you mean. Try !help"

With ML:
"I see you're still having trouble with bidding. Let me help - are you getting an error message? Make sure you use: !bid <amount>"

(Detected: frustration + repeated issue + bidding intent)
```

## 🎓 Next Steps

1. **Deploy with ML enabled** (already configured)
2. **Wait 1-2 weeks** for historical data to accumulate
3. **Test spawn predictions** with well-tracked bosses
4. **Monitor NLP improvements** in user conversations
5. **Check ML stats** weekly with !mlstats

As the bot collects more data, predictions will get more accurate!

## 💡 Future Enhancements

When you want to add more ML features:

1. **Churn Prediction** - Predict which members might become inactive
2. **Price Prediction** - ML-powered auction price predictions
3. **Anomaly Detection** - Detect suspicious bidding patterns
4. **Member Clustering** - Segment members by behavior

These can be added later using the same integration pattern!

---

**Questions?** Check the code comments or test with the commands above!
