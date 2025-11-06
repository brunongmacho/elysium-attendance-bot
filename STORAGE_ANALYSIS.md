# Storage Analysis for Learning NLP

## Question: Is 5GB enough for learning NLP on Koyeb?

**Short Answer: YES - you could run for DECADES with 5GB!**

---

## Storage Requirements Breakdown

### **Per Learned Pattern (Google Sheets)**

```json
{
  "phrase": "pusta ko 500",
  "command": "!bid",
  "params": ["500"],
  "confidence": 0.85,
  "usage_count": 12,
  "success_rate": 0.92,
  "last_used": "2025-11-06",
  "user_id": "123456789012345678",
  "language": "tl",
  "examples": ["pusta 500", "pusta ko 1000", "pusta na 750"]
}
```

**Size per pattern:** ~500-800 bytes (including JSON overhead)

---

## Capacity Calculations

### **Scenario 1: Google Sheets Storage (Recommended)**

Google Sheets free tier limits:
- **5 million cells** per spreadsheet
- **Effectively unlimited** spreadsheets

With our schema (10 columns):
- **500,000 learned patterns** per sheet
- Create new sheets as needed (unlimited)

**Storage used:**
```
500,000 patterns × 600 bytes = 300 MB per sheet
5GB = 16 sheets
16 sheets × 500,000 patterns = 8,000,000 patterns total
```

**Realistic usage:**
- 100 new patterns/week = 5,200 patterns/year
- **8,000,000 patterns = 1,538 YEARS** of learning data

✅ **Verdict: More than enough!**

---

### **Scenario 2: Local Koyeb Disk (NOT recommended)**

Koyeb instance storage:
- **Ephemeral** (resets on restart/deploy)
- Limited to instance size (typically 5-20GB)

**Problem:** Learning data would be lost on every restart!

**Solution:** Don't store learning data locally - use Google Sheets (like existing bot does)

---

## Memory (RAM) Requirements

### **In-Memory Cache (Active Patterns)**

Current bot uses ~100MB RAM. Learning NLP will add:

```javascript
// Cached learned patterns (top 1000 most used)
{
  patterns: 1000 × 500 bytes = 500 KB
  userPreferences: 100 users × 200 bytes = 20 KB
  recentMessages: 100 messages × 150 bytes = 15 KB
}
```

**Total additional memory:** ~1-2 MB

**New total:** ~102 MB (well within 512MB Koyeb instance)

✅ **Verdict: No memory issues!**

---

## Chat Log Storage (for passive learning)

### **Option 1: Store Last 1000 Messages (Recommended)**

```javascript
// Ring buffer in memory
{
  message: "pusta ko 500",
  userId: "123456789",
  timestamp: 1699200000,
  channelId: "987654321",
  botMentioned: false
}
```

**Size:** 1,000 messages × 150 bytes = **150 KB**

Stored in Google Sheets daily → cleared from memory.

---

### **Option 2: Store ALL Messages**

**Daily volume estimate:**
- 50 active members
- 10 messages/day/member = 500 messages/day
- 500 messages × 100 bytes = **50 KB/day**

**Yearly storage:**
- 50 KB × 365 days = **18.25 MB/year**

**5GB capacity:**
- 5,000 MB ÷ 18.25 MB/year = **274 YEARS** of chat logs

✅ **Verdict: More than enough!**

---

## Recommendation: Storage Strategy

### **Use Google Sheets for Everything**

```
Google Sheets Structure:
├── NLP_LearnedPatterns (500K rows max)
│   ├── phrase
│   ├── command
│   ├── confidence
│   ├── usage_count
│   └── last_used
│
├── NLP_UserPreferences (100 users)
│   ├── user_id
│   ├── preferred_language
│   ├── shortcuts
│   └── learning_mode
│
├── NLP_ChatLog (daily snapshots, 1000 messages)
│   ├── message
│   ├── user_id
│   ├── timestamp
│   └── bot_mentioned
│
└── NLP_UnrecognizedPhrases (suggestions)
    ├── phrase
    ├── frequency
    └── suggested_command
```

**Total storage used:** ~500 MB (after years of usage)

**Google Sheets free tier:** 15 GB (across all files)

✅ **Verdict: You'll never run out!**

---

## Performance Optimization

### **Caching Strategy**

1. **Hot cache** (in memory):
   - Top 1000 learned patterns (~500 KB)
   - User preferences (~20 KB)
   - Recent messages (~150 KB)

2. **Cold storage** (Google Sheets):
   - All historical patterns
   - Full chat logs
   - Analytics data

3. **Sync frequency**:
   - Write new patterns: Immediately
   - Sync cache: Every 5 minutes
   - Cleanup old data: Daily at 3 AM

---

## Summary

| Resource | Limit | Usage | Headroom |
|----------|-------|-------|----------|
| **Koyeb RAM** | 512 MB | ~102 MB | 410 MB (80% free) |
| **Koyeb Disk** | 5 GB | 0 MB* | N/A (ephemeral) |
| **Google Sheets** | 5M cells/sheet | ~5K cells | 99.9% free |
| **Learning Patterns** | Unlimited | ~100/year | Decades of capacity |
| **Chat Logs** | Unlimited | ~18 MB/year | 274 years at 5GB |

*We don't store learning data on Koyeb disk - it's ephemeral and resets on restart.

---

## Conclusion

✅ **5GB on Koyeb is MORE than enough!**

However, we'll use **Google Sheets** for persistent storage (like the rest of the bot), not local disk.

**Why?**
- Koyeb disk is ephemeral (resets on restart)
- Google Sheets is free, persistent, and unlimited for our needs
- Existing bot already uses this pattern successfully

**Expected growth:**
- Year 1: ~100 MB total storage
- Year 5: ~500 MB total storage
- Year 10: ~1 GB total storage

You have **5GB available** - enough for decades of learning! 🚀
