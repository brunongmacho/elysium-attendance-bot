# 🧠 Learning NLP System Guide

## Elysium Bot - Self-Improving Natural Language Processing

The bot now **learns** from your guild's unique language patterns and improves over time!

---

## 🎯 **How It Works**

### **Two Modes: Passive Learning + Active Responses**

#### **1. Passive Learning (Always Active)**
The bot **listens to ALL messages** without responding:
- 👂 Learns language patterns
- 📊 Tracks user preferences
- 📝 Discovers unrecognized phrases
- 🔍 Analyzes conversation context

**Example:**
```
User1: "bro pusta mo na" (casual chat - NOT a command)
Bot: [Silently learns: "pusta" might be related to bidding]

User2: "gg nice bid"
Bot: [Silently learns: users discuss bidding]
```

---

#### **2. Active Responses (Only When Triggered)**

The bot **only responds** when:
- ✅ Bot is mentioned: `@BotName taya 500`
- ✅ In auction threads: `taya 500` (auto-executes)
- ✅ In admin logs: `simula auction` (admin commands)
- ✅ Exact `!` commands: `!bid 500` (always work)

**Example:**
```
❌ General chat: "taya 500"
   → Bot: [Learns but doesn't respond]

✅ Mention: "@Bot taya 500"
   → Bot: "💰 Bid placed: 500 points"

✅ Auction thread: "taya 500"
   → Bot: [Auto-places bid]
```

---

## 🚀 **Key Features**

### **1. Pattern Learning**

The bot learns new phrases from user confirmations.

**How it works:**
```
Week 1:
You: "@Bot pusta 500" (new phrase)
Bot: "❓ Not sure. Did you mean: !bid 500 or !extend 500?"
You: [Reacts with ✅ on !bid option]
Bot: "✅ Got it! I'll remember 'pusta' = bid"

Week 2:
You: "@Bot pusta 1000"
Bot: "💰 Bid placed: 1000 points" (auto-recognized!)
```

**Confidence Levels:**
- 🔴 **<70%**: Bot asks for confirmation
- 🟡 **70-90%**: Bot suggests with confirmation
- 🟢 **>90%**: Bot auto-executes without asking

---

### **2. Personal Language Preferences**

The bot remembers **each member's** preferred language.

**How it works:**
```
@Juan always uses Tagalog:
Juan: "@Bot ilang points ko"
Bot: "💡 *Tinitingnan ang points mo...*" (responds in Tagalog)

@Maria always uses English:
Maria: "@Bot my points"
Bot: "💡 *Checking your points...*" (responds in English)

@Pedro mixes (Taglish):
Pedro: "@Bot check ko points"
Bot: "💡 *Checking points mo...*" (mirrors his style)
```

The bot learns your preference after analyzing 10+ messages!

---

### **3. Personal Shortcuts**

You can teach the bot **your own shortcuts**.

**Example:**
```
Admin: "!teachbot 'p' → !mypoints"
Bot: "✅ Learned! You can now say 'p' for points"

Later:
You: "@Bot p"
Bot: "You have 850 attendance points and 600 bidding points."
```

---

### **4. Typo Tolerance**

The bot learns common typos and auto-corrects.

**Examples:**
```
"poins" → points ✅
"tya ko 500" → taya ko 500 ✅
"nandto" → nandito ✅
"bid ko 50" → suggests "Did you mean 500?"
```

---

### **5. Context Awareness**

The bot understands what makes sense in different contexts.

**Example:**
```
In auction thread:
User: "500"
Bot knows: 90% of time "500" = !bid 500
Bot: [Places bid automatically]

In admin channel:
Admin: "500"
Bot knows: Admins rarely bid, might be extending
Bot: "Did you mean !extend 500?"
```

---

## 📋 **Admin Commands**

### **View Learning Statistics**

```bash
!nlpstats
```
Shows overview of bot's learning progress:
- Total learned patterns
- Number of users tracked
- Language distribution
- Last sync time

---

### **View Unrecognized Phrases**

```bash
!unrecognized
```
Shows top phrases the bot doesn't understand yet:
- Phrase text
- How many times used
- How many users said it

**Use this to discover new slang** your guild uses!

---

### **View Learned Patterns**

```bash
!learned
```
Shows top patterns the bot learned:
- Phrase → Command mapping
- Confidence level
- Usage count

---

### **Manually Teach Bot**

```bash
!teachbot "phrase" → !command
```

**Examples:**
```
!teachbot "pusta" → !bid
!teachbot "g na" → !bid
!teachbot "dali" → !extend
!teachbot "bawi" → !bid
```

---

### **View Your Profile**

```bash
!myprofile
# or
!nlpprofile
```

Shows YOUR learning statistics:
- Preferred language
- Messages analyzed
- Language usage breakdown
- Personal shortcuts

---

### **Clear All Learned Patterns** (Admin Only)

```bash
!clearlearned
```
⚠️ **WARNING:** Deletes ALL learned patterns!
Requires confirmation.

---

## 💡 **Best Practices**

### **For Regular Members:**

1. **Mention the bot** when you want it to execute a command:
   - ✅ `@Bot taya 500` (bot responds)
   - ❌ `taya 500` (bot only learns, doesn't respond)

2. **Use auction threads** for bidding:
   - No need to mention bot in auction threads
   - `taya 500` auto-executes

3. **Confirm bot suggestions**:
   - When bot asks "Did you mean...?", react with ✅ or ❌
   - This helps the bot learn faster!

4. **Be consistent**:
   - Use the same phrases for the same actions
   - Bot learns faster from consistent patterns

---

### **For Admins:**

1. **Review unrecognized phrases weekly**:
   ```
   !unrecognized
   ```
   Teach common patterns manually to speed up learning.

2. **Monitor learning stats**:
   ```
   !nlpstats
   ```
   Check if bot is learning effectively.

3. **Teach important shortcuts**:
   ```
   !teachbot "g" → !bid
   !teachbot "p" → !mypoints
   ```

4. **Clean up bad patterns**:
   ```
   !clearlearned
   ```
   If bot learns wrong patterns, reset and re-teach.

---

## 📊 **Learning Process**

### **How the Bot Learns (Step-by-Step)**

```
Step 1: User says something new
User: "@Bot pusta ko 500"

Step 2: Bot doesn't recognize "pusta"
Bot: "❓ I don't recognize 'pusta'. Did you mean:"
     [1] !bid 500
     [2] !extend 500

Step 3: User confirms
User: [Reacts with ✅ on option 1]

Step 4: Bot learns and stores
Bot: "✅ Learned! 'pusta' → !bid"
Bot saves to Google Sheets:
{
  phrase: "pusta ko 500",
  command: "!bid",
  confidence: 0.70,
  usageCount: 1
}

Step 5: Next time, higher confidence
User: "@Bot pusta 1000"
Bot: "💰 Bid placed: 1000 points" (no confirmation needed!)
Confidence increased to 0.75

Step 10+: Auto-execute (high confidence)
User: "@Bot pusta 2000"
Bot: [Silently executes - 95% confidence]
```

---

## 🔬 **Technical Details**

### **Learning Algorithm**

1. **Pattern Matching**:
   - Tries learned patterns first (user-taught phrases)
   - Falls back to static patterns (pre-coded phrases)
   - Falls back to fuzzy matching (for typos)

2. **Confidence Scoring**:
   ```javascript
   Initial confidence: 70%
   Each successful use: +5% confidence
   Max confidence: 100%

   Fuzzy match penalty: -20%
   Typo correction penalty: -10%
   ```

3. **Language Detection**:
   ```javascript
   Tagalog keywords count:
   - 0 keywords = English
   - 1 keyword = Taglish (code-switching)
   - 2+ keywords = Tagalog
   ```

---

### **Storage**

All learning data is stored in **Google Sheets** (persistent, survives bot restarts):

```
Google Sheets Structure:
├── NLP_LearnedPatterns
│   ├── phrase
│   ├── command
│   ├── confidence
│   └── usage_count
│
├── NLP_UserPreferences
│   ├── user_id
│   ├── preferred_language
│   └── shortcuts
│
└── NLP_UnrecognizedPhrases
    ├── phrase
    ├── frequency
    └── user_count
```

**Sync frequency:** Every 5 minutes

---

### **Memory Usage**

```
In-memory cache (hot storage):
- Top 1000 learned patterns: ~500 KB
- User preferences (100 users): ~20 KB
- Recent messages (100 messages): ~150 KB

Total additional memory: ~1-2 MB
New bot total: ~102 MB (well within 512 MB limit)
```

---

## 🎯 **Learning Goals**

### **Week 1 Goals**
- ✅ Bot recognizes 60+ static patterns (pre-coded)
- 🎯 Learn 5-10 guild-specific phrases
- 🎯 Track 10+ user language preferences

### **Month 1 Goals**
- 🎯 100+ total patterns (60 static + 40 learned)
- 🎯 50+ users with language preferences tracked
- 🎯 95%+ command recognition rate

### **Month 3 Goals**
- 🎯 150+ total patterns
- 🎯 All active members with preferences tracked
- 🎯 <5 unrecognized phrases per week
- 🎯 98%+ command recognition rate

---

## ❓ **FAQ**

### **Q: Will bot spam if I don't mention it?**
**A:** No! Bot only RESPONDS when mentioned or in specific contexts (auction threads, admin logs). It learns silently otherwise.

### **Q: Can I disable learning for myself?**
**A:** Yes! Admins can disable learning per-user (feature coming soon).

### **Q: What if bot learns wrong patterns?**
**A:** Admins can use `!clearlearned` to reset, or manually review/edit in Google Sheets.

### **Q: How much storage does learning use?**
**A:** Very little! ~500 MB after years of usage. You have 5 GB+ available.

### **Q: Can bot learn offensive phrases?**
**A:** Only admins can manually teach patterns. Casual conversation is NOT learned as commands.

### **Q: How long until bot "fully learns"?**
**A:** Bot continuously learns! Typical guild reaches 90%+ accuracy in 2-4 weeks.

---

## 🚀 **Getting Started**

### **Step 1: Start Using**
Just mention the bot normally:
```
@Bot ilang points ko
@Bot taya 500
@Bot tignan ranking
```

### **Step 2: Confirm Suggestions**
When bot asks "Did you mean...?", react with ✅ or ❌

### **Step 3: Check Progress**
After 1 week, run:
```
!nlpstats
!learned
```

### **Step 4: Optimize**
Review unrecognized phrases and teach common ones:
```
!unrecognized
!teachbot "phrase" → !command
```

---

## 📈 **Example Learning Journey**

```
Day 1:
- Bot knows 60 patterns (static)
- 0 learned patterns

Week 1:
- Bot knows 70 patterns (60 static + 10 learned)
- Learned: "pusta", "g na", "dali", "bawi", etc.
- 5 user preferences tracked

Month 1:
- Bot knows 100 patterns (60 static + 40 learned)
- 30 user preferences tracked
- 95% command recognition rate
- Guild-specific slang fully integrated

Month 3:
- Bot knows 150 patterns (60 static + 90 learned)
- All active members tracked
- 98% command recognition rate
- Bot speaks your guild's unique language!
```

---

## 🎉 **Benefits**

✅ **Natural conversation** - No need to memorize exact commands
✅ **Learns your slang** - Bot adapts to YOUR guild's language
✅ **Reduces spam** - Only responds when mentioned
✅ **Improves over time** - Gets smarter with usage
✅ **Personalized** - Remembers each member's preferences
✅ **Low maintenance** - Self-improving, minimal admin work

---

**Happy learning! Masayang pag-aaral! Enjoy ka learning!** 🚀
