# 🤖 ELYSIUM Intelligence Features Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Proactive Intelligence System](#proactive-intelligence-system)
3. [Natural Language Processing](#natural-language-processing)
4. [Configuration](#configuration)
5. [Usage Examples](#usage-examples)
6. [Scheduled Tasks](#scheduled-tasks)

---

## Overview

The ELYSIUM bot now includes **two major intelligence enhancements**:

1. **Proactive Intelligence** - Auto-notifications, scheduled monitoring, and smart alerts
2. **Natural Language Processing (NLP)** - Flexible command interpretation without strict syntax

These features work **alongside** all existing commands without breaking any functionality.

---

## Proactive Intelligence System

### What It Does

The bot now **proactively monitors** your guild and sends automatic alerts to prevent problems before they happen.

### 🔔 Scheduled Monitoring Tasks

| Task | Schedule | Where | What It Does |
|------|----------|-------|--------------|
| **Pre-Auction Check** | Saturday 10 AM | Admin Logs (@here) | Checks if guild is ready for auction (2h before) |
| **Engagement Digest** | Monday 9 AM | Admin Logs (@here if >5 at-risk) | Weekly member engagement analysis |
| **Anomaly Digest** | Daily 6 PM | Admin Logs (@here) | Fraud detection and suspicious patterns |
| **Weekly Summary** | Sunday 8 PM | Guild Chat | Positive weekly recap + top 5 performers |
| **Milestone Check** | Every hour | Guild Chat | Celebrates members reaching 500/1000/2000/5000pts |

### 📍 Channel Routing

**Admin Logs** (sensitive data):
- Pre-auction warnings with readiness stats
- Detailed engagement analysis with at-risk members
- Anomaly detection reports
- Full auction price analysis with @here

**Guild Chat** (positive/motivational):
- Weekly positive summary
- Top 5 performers celebration
- Member milestone achievements
- Guild-wide accomplishments

**Auction Threads** (public):
- Simple AI price suggestions
- "💰 AI Price Suggestion: 450 points (85% confidence)"

### 💰 Auto-Price Suggestion Flow

**When an auction item loads:**

1. **Auction Thread** (everyone sees):
   ```
   💰 AI Price Suggestion: 450 points (85% confidence)
   ```

2. **Admin Logs** (detailed analysis with @here):
   ```
   📊 Auction Intelligence: Crimson Pendant

   🎯 Recommendation: 450 points (85% confidence)

   📈 Historical Data:
   - 12 auctions analyzed
   - Average: 495pts
   - Trend: INCREASING (+10.5%)

   🧠 AI Reasoning:
   Based on 12 auctions, price trending UP, low variance = predictable
   ```

3. **Admin Decision**:
   - Use suggested price (manually set in Google Sheets)
   - Adjust based on current guild situation
   - Or ignore suggestion completely

**Admin has 100% control** - suggestions are just helpful recommendations!

### ⚙️ Configuration

Located in `proactive-intelligence.js`:

```javascript
const PROACTIVE_CONFIG = {
  channels: {
    guildChat: 'elysium_commands_channel_id',    // Guild chat
    adminLogs: 'admin_logs_channel_id',          // Admin logs
    biddingChannel: 'bidding_channel_id',        // Auction threads
  },

  schedules: {
    preAuctionCheck: 'Saturday 10 AM',           // 2h before auction
    engagementDigest: 'Monday 9 AM',             // Weekly engagement
    anomalyDigest: 'Daily 6 PM',                 // Daily fraud scan
    weeklySummary: 'Sunday 8 PM',                // Weekly recap
  },

  thresholds: {
    auctionReadiness: 0.70,                      // 70% must have 100+ points
    minPointsForAuction: 100,                    // Min points to participate
    inactiveDays: 14,                            // 14 days = inactive
    engagementWarning: 40,                       // <40/100 = at-risk
    milestonePoints: [500, 1000, 2000, 5000],    // Celebration thresholds
  },

  features: {
    autoReminders: false,                        // Manual send only (Option C)
    tagHereInAdminLogs: true,                    // @here for important alerts
    celebrateMilestones: true,                   // Public milestone announcements
    showPositiveSummaries: true,                 // Guild chat weekly summaries
  },
};
```

---

## Natural Language Processing

### What It Does

Allows members to use **natural language** instead of strict command syntax.

### ✅ Where NLP Works

| Channel | NLP Enabled | Why |
|---------|-------------|-----|
| Admin Logs | ✅ Yes | Admin commands can be flexible |
| Auction Threads | ✅ Yes | "bid 500" instead of "!bid 500" |
| Guild Chat | ❌ No | Would respond to casual conversation (spam) |

### 💬 Examples

**In Auction Threads:**
```
User: "bid 500"           → Bot processes as !bid 500
User: "offer 300 points"  → Bot processes as !bid 300
User: "300 pts"           → Bot processes as !bid 300
```

**In Admin Logs:**
```
User: "how many points do i have"    → Bot processes as !mypoints
User: "show me the leaderboard"      → Bot processes as !leaderboard
User: "what's the auction status"    → Bot processes as !bidstatus
User: "bot status"                   → Bot processes as !status
```

### 🛡️ Safety Features

1. **Does NOT interfere with existing ! commands**
   - Messages starting with ! are processed normally
   - Existing commands work exactly as before

2. **Channel-restricted**
   - Only works in admin logs and auction threads
   - Guild chat is protected from accidental responses

3. **60% similarity threshold**
   - Must be reasonably close to a command
   - Won't trigger on random chat

### ⚙️ Configuration

Located in `nlp-handler.js`:

```javascript
const NLP_CONFIG = {
  enabledChannels: {
    adminLogs: true,          // ✅ Admin logs
    auctionThreads: true,     // ✅ Auction threads
    guildChat: false,         // ❌ NOT in guild chat
  },

  confidenceThreshold: 0.6,   // 60% similarity required

  features: {
    flexibleBidding: true,    // "bid 500" works
    naturalQueries: true,     // "how many points" works
    contextAware: true,       // Different responses by context
  },
};
```

---

## Usage Examples

### 🎯 Scenario 1: Pre-Auction Warning

**Saturday 10 AM (2h before auction):**

Admin Logs receives:
```
@here

⚠️ Pre-Auction Readiness Check

Auction scheduled in 2 hours (Saturday 12:00 PM GMT+8)

⚠️ Low readiness - consider postponing or adjusting

📊 Readiness Statistics:
Ready Members: 30 / 45 (67%)
Threshold: 70%
Min Points Required: 100pts

💡 Recommendations:
• 15 members have <100 points
• ⚠️ Warning: Consider postponing or reducing starting bids
• Low-point members: Player1, Player2, Player3, Player4, Player5 +10 more
```

**Action:** Admins decide whether to proceed or adjust auction.

---

### 🎯 Scenario 2: Member Engagement Alert

**Monday 9 AM:**

Admin Logs receives:
```
@here

📊 Weekly Engagement Digest

Guild engagement analysis for the week

📈 Overview:
Average Engagement: 68/100
Total Members: 45
Active: 35 (78%)
At Risk: 10 (22%)

⚠️ Members Needing Attention (10):
1. Player1 (35/100)
   └ No recent activity. Schedule reminder before next event.
2. Player2 (28/100)
   └ At risk of inactivity. Consider sending re-engagement reminder.
...

💡 Suggested Actions:
• Use `!engagement <username>` for detailed member analysis
• Consider sending personalized reminders to at-risk members
• Review why members are disengaging
```

**Action:** Admins use `!engagement PlayerName` for details and manually send reminders.

---

### 🎯 Scenario 3: Auction Intelligence

**During Auction:**

**Auction Thread** (everyone sees):
```
Bot: 🎯 Item 1/10: Crimson Pendant

Bot: 💰 AI Price Suggestion: 450 points (85% confidence)
```

**Admin Logs** (with @here):
```
@here

📊 Auction Intelligence: Crimson Pendant

Detailed AI analysis for current auction item

🎯 Recommendation:
Starting Bid: 450 points
Confidence: 85%

📈 Historical Data:
Auctions: 12
Average: 495pts
Median: 510pts
Range: 350-680pts

📉 Trend Analysis:
Direction: INCREASING
Change: +10.5%

🧠 AI Reasoning:
📊 Based on 12 historical auctions
📈 Price trending UP (recent auctions 10% higher)
✅ Low variance = predictable demand
```

**Action:** Admins see suggestion, decide whether to use it or adjust.

---

### 🎯 Scenario 4: Milestone Celebration

**Member reaches 1000 points:**

Guild Chat receives:
```
🎉 Milestone Achievement!

PlayerX has reached 1000 attendance points!

🔥 1K club! Elite dedication!

Keep up the amazing work! 🌟
```

---

### 🎯 Scenario 5: Weekly Summary

**Sunday 8 PM:**

Guild Chat receives:
```
🏆 Weekly Guild Summary

Another great week for ELYSIUM! Here's what we achieved:

📊 Guild Performance:
Average Engagement: 72/100 🔥

🌟 Top Performers This Week:
🥇 Player1 - 92/100
🥈 Player2 - 88/100
🥉 Player3 - 85/100
⭐ Player4 - 82/100
⭐ Player5 - 80/100

💬 Message:
✨ Excellent work! Guild is thriving!

Keep up the great work! 💪
```

---

## Scheduled Tasks

All schedules are in **Manila timezone (Asia/Manila)**.

### Task Schedule Summary

```
Saturday 10:00 AM  → Pre-Auction Check (Admin Logs)
Saturday 12:00 PM  → Auction Start (automatic)
Sunday 8:00 PM     → Weekly Summary (Guild Chat)
Monday 9:00 AM     → Engagement Digest (Admin Logs)
Daily 6:00 PM      → Anomaly Digest (Admin Logs, if anomalies found)
Every Hour         → Milestone Check (Guild Chat, if milestone reached)
```

### Monitoring Active Status

When bot starts, you'll see:
```
🤖 Intelligence Engine initialized (AI/ML powered features enabled)
🔔 Proactive Intelligence initialized (5 scheduled monitoring tasks active)
💬 NLP Handler initialized (admin logs + auction threads)
```

---

## Manual Commands (Still Available)

All intelligence commands still work manually:

```bash
# Price prediction
!predictprice Crimson Pendant
!predict Ancient Scroll

# Engagement analysis
!engagement PlayerName
!analyzeengagement

# Anomaly detection
!detectanomalies
!fraud

# Recommendations
!recommendations
!suggest

# Performance
!performance
!perf
```

---

## Key Benefits

✅ **Prevents Problems** - Alerts before issues occur
✅ **Saves Admin Time** - Automated monitoring and suggestions
✅ **Improves Engagement** - Identifies at-risk members early
✅ **Fair Auctions** - Data-driven price suggestions
✅ **Motivates Members** - Public celebrations and positive feedback
✅ **Easy to Use** - Natural language, no strict syntax required

---

## Important Notes

1. **All existing commands work exactly as before** - Nothing breaks!
2. **Admins have 100% control** - All suggestions are optional
3. **Privacy first** - Sensitive data only in admin logs, never guild chat
4. **No spam** - NLP doesn't work in guild chat to avoid random triggers
5. **Manual reminders** - Bot suggests, admins send (Option C as requested)
6. **Configurable** - All thresholds and schedules can be adjusted

---

## Troubleshooting

**Q: Bot not sending scheduled notifications?**
A: Check bot console for initialization messages. Restart bot if needed.

**Q: NLP not working?**
A: Ensure you're in admin logs or auction thread (not guild chat). Check message doesn't start with !

**Q: Want to disable a feature?**
A: Edit `PROACTIVE_CONFIG` in `proactive-intelligence.js` and set feature flags to false.

**Q: Change schedule times?**
A: Edit cron schedules in `proactive-intelligence.js` (lines 77-104).

---

## Support

For issues or questions:
1. Check console logs for errors
2. Use `!performance` to check system health
3. Review configuration files for customization

All features are production-ready and tested! 🚀
