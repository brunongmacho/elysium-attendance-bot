# 🧠 NLP Learning System Guide

## Overview

The Elysium Bot now features a **self-improving NLP (Natural Language Processing) learning system** that learns from user interactions and adapts to multilingual usage patterns (English, Tagalog, Taglish).

## Key Features

### 1. **Passive Learning Mode**
- **Learns from ALL guild messages** without responding
- Tracks language preferences per user
- Records unrecognized phrases for admin review
- **No spam, no unwanted responses**

### 2. **Mention-Based Activation**
- **Only responds when bot is @mentioned**
- Auto-responds in auction threads (for bids only)
- Prevents interference with normal conversation

### 3. **Self-Improving Patterns**
- Learns patterns from user confirmations (✅ reactions)
- Confidence scores improve over time (0.7 → 0.95+)
- Patterns sync to Google Sheets every 5 minutes
- **Survives bot restarts** (persistent storage)

### 4. **Multilingual Support**
- Detects language per message (EN, TL, Taglish)
- Learns user language preferences
- Adapts to code-switching behavior

## How It Works

### Passive Learning
```
User: "pusta 500" (not mentioning bot)
Bot: [silently learns: "pusta" used in bidding context, user prefers Tagalog]
```

### Mention-Based Activation
```
User: "@Bot pusta 500"
Bot: [interprets using learned patterns] → !bid 500
Bot: "✅ Placing bid of 500 points..."
```

### Learning Flow
1. Bot hears: "taya ko 500" → interprets as `!bid 500`
2. User reacts with ✅ → confidence score increases (0.7 → 0.75 → 0.8...)
3. After 10+ confirmations → confidence reaches 0.95+
4. Pattern syncs to Google Sheets every 5 minutes

## Admin Commands

### `!nlpstats`
View learning statistics and progress
- Total patterns learned
- Recognition rate
- Users tracked
- Language distribution

### `!learned`
List all learned patterns with confidence scores
- High confidence (>90%)
- Medium confidence (75-90%)
- Low confidence (<75%)

### `!unrecognized`
Show phrases bot doesn't understand yet
- Top 20 most common unrecognized phrases
- Usage count and user count
- Last seen timestamp

### `!teachbot "phrase" → !command`
Manually teach bot a new pattern

**Examples:**
```
!teachbot "bawi ko 500" → !bid
!teachbot "ilan na ko" → !mypoints
!teachbot "nandito" → present
```

### `!clearlearned [phrase]`
Remove specific or all learned patterns

**Examples:**
```
!clearlearned "wrong phrase"  # Remove specific pattern
!clearlearned confirm         # Remove ALL patterns (requires confirmation)
```

### `!myprofile`
View your personal learning profile (member accessible)
- Messages analyzed
- Preferred language
- Language usage distribution

## Example Usage

### English
```
User: "@Bot how many points do I have?"
Bot: !mypoints
```

### Tagalog
```
User: "@Bot ilang points ko?"
Bot: !mypoints

User: "@Bot taya 500"
Bot: !bid 500
```

### Taglish (Code-Switching)
```
User: "@Bot bid ko 1000"
Bot: !bid 1000

User: "@Bot ano na sa bid?"
Bot: !bidstatus
```

## Multilingual Examples

### Bidding (Taya/Pusta/Bid)
```
"taya 500"          → !bid 500
"pusta ko 1000"     → !bid 1000
"bid ko 750"        → !bid 750
"lagay 500"         → !bid 500
"500 lang"          → !bid 500
```

### Points Query
```
"ilang points ko?"          → !mypoints
"magkano points ko?"        → !mypoints
"ano points ko?"            → !mypoints
"check points ko"           → !mypoints
"balance ko"                → !mypoints
```

### Attendance
```
"nandito ako"       → present
"present ako"       → present
"here na"           → present
"dumating ako"      → present
```

### Status
```
"ano status?"       → !bidstatus
"ano na sa bid?"    → !bidstatus
"kumusta na bid?"   → !bidstatus
```

## Google Sheets Integration

The system creates 4 hidden tabs in your Google Sheet:

### 1. **NLP_LearnedPatterns** (Blue)
- Phrase, Command, Confidence, Usage Count
- Learned From (User ID), Learned At
- Success Rate, Notes

### 2. **NLP_UserPreferences** (Purple)
- User ID, Username, Preferred Language
- Language Scores (EN/TL/Taglish)
- Message Count, Last Updated

### 3. **NLP_UnrecognizedPhrases** (Orange)
- Phrase, Count, User Count
- Last Seen, Example Users
- Suggested Command, Status

### 4. **NLP_Analytics** (Green)
- Date, Total Patterns Learned
- Total Users Tracked, Messages Analyzed
- Recognition Rate, Top Patterns
- Language Distribution

### Accessing Hidden Tabs

**To unhide tabs** (for manual review):
```javascript
// In Google Apps Script editor
unhideNLPTabs()
```

**To re-hide tabs**:
```javascript
hideNLPTabs()
```

**To manually initialize** (if not auto-created):
```javascript
manualInitializeNLP()
```

## Storage Requirements

- **Est. storage per pattern:** ~500 bytes
- **Est. storage per user profile:** ~300 bytes
- **Total capacity (5GB Koyeb storage):** **1,538 years** of learning data
- **Sync frequency:** Every 5 minutes

## Configuration

### Learning Parameters (in nlp-learning.js)

```javascript
learning: {
  initialConfidence: 0.7,        // Starting confidence for new patterns
  confirmationBoost: 0.05,       // Increase per ✅ confirmation
  maxConfidence: 0.98,           // Maximum confidence cap
  minUsageForLearning: 2,        // Min times pattern used before learning
}
```

### Activation Modes

```javascript
activationModes: {
  respondOnMention: true,        // Respond when bot is @mentioned
  respondInAuctionThreads: true, // Auto-respond to bids in auction threads
  passiveLearning: true,         // Learn from all messages (always on)
}
```

## Best Practices

### For Admins
1. **Monitor !nlpstats regularly** to track learning progress
2. **Review !unrecognized** to find common phrases bot doesn't understand
3. **Use !teachbot** to manually add important patterns
4. **Check Google Sheets** periodically to review learned patterns

### For Members
1. **Use @mention** when you want bot to respond to natural language
2. **Use ! commands** for guaranteed consistent behavior
3. **Check !myprofile** to see your language preferences
4. **React with ✅** when bot interprets correctly (helps learning)

## Troubleshooting

### Bot not responding to natural language?
- ✅ Make sure you @mentioned the bot
- ✅ Check if you're in an auction thread (auto-responds to bids)
- ✅ Try using ! command instead

### Bot responding incorrectly?
- ❌ Don't react with ✅ if interpretation was wrong
- 📝 Tell admin to use !teachbot to correct the pattern
- 📊 Admin can check !learned to see current patterns

### Pattern not learning?
- ⏱️ Wait 5 minutes for sync to Google Sheets
- 🔄 Check Google Sheets to verify pattern was saved
- 📈 Check confidence score in !learned

### Google Sheets not syncing?
- ✅ Verify sheet_webhook_url is configured in config.json
- ✅ Check Apps Script deployment is set to "Anyone can access"
- ✅ Run manualInitializeNLP() in Apps Script editor
- ✅ Check Apps Script logs for errors

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DISCORD MESSAGE                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              PASSIVE LEARNING (always runs)                  │
│  • Tracks language usage                                     │
│  • Records unrecognized phrases                              │
│  • Updates user preferences                                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
          ┌──────────────┐
          │ @mentioned?  │
          │ OR auction?  │
          └──┬───────┬───┘
             │       │
       NO ◄──┘       └──► YES
       │                  │
       │                  ▼
       │         ┌────────────────────┐
       │         │ NLP INTERPRETATION │
       │         │ (2-tier system)    │
       │         └─────────┬──────────┘
       │                   │
       │                   ▼
       │         ┌────────────────────┐
       │         │ 1. Learning System │
       │         │    (learned patterns)│
       │         └─────────┬──────────┘
       │                   │
       │              No match?
       │                   │
       │                   ▼
       │         ┌────────────────────┐
       │         │ 2. Static Handler  │
       │         │    (60+ patterns)  │
       │         └─────────┬──────────┘
       │                   │
       │                   ▼
       │         ┌────────────────────┐
       │         │  COMMAND EXECUTION │
       │         └─────────┬──────────┘
       │                   │
       ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              GOOGLE SHEETS SYNC (every 5 min)                │
│  • Learned patterns                                          │
│  • User preferences                                          │
│  • Unrecognized phrases                                      │
│  • Daily analytics                                           │
└─────────────────────────────────────────────────────────────┘
```

## Support

For issues or questions:
- Check documentation: `LEARNING_NLP_GUIDE.md` (this file)
- Ask admin to run `!nlpstats` for diagnostics
- Review Google Sheets hidden tabs for data verification
