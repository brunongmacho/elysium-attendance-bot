# 📊 Google Sheets NLP Setup Guide

## Auto-Creating Hidden Tabs for Learning NLP

This guide shows you how to set up the Google Sheets integration for the learning NLP system. The tabs will **automatically create themselves** and be **hidden** from normal view!

---

## 🚀 **Quick Setup (5 Minutes)**

### **Step 1: Open Your Google Sheets Apps Script**

1. Open your Elysium bot's Google Sheet
2. Click **Extensions** → **Apps Script**
3. You should see your existing bot code

---

### **Step 2: Add the NLP Auto-Setup Script**

1. In the Apps Script editor, click the **+** button next to "Files"
2. Choose **Script**
3. Name it: `NLP_AUTO_SETUP`
4. Copy and paste the entire contents of `/google-apps-script/NLP_AUTO_SETUP.gs` into this new file
5. Click **Save** (💾 icon)

---

### **Step 3: Run Manual Initialization (Optional)**

You can manually initialize the tabs right now, or let the bot auto-create them on first use:

#### **Option A: Manual Initialization (Recommended)**

1. In Apps Script editor, select the function dropdown (top toolbar)
2. Choose: `manualInitializeNLP`
3. Click **Run** (▶️ icon)
4. **Grant permissions** when prompted:
   - Click "Review Permissions"
   - Choose your Google account
   - Click "Advanced" → "Go to [Your Project] (unsafe)"
   - Click "Allow"
5. Check **Execution log** (bottom of screen) - you should see:
   ```
   ✅ Created new tab: NLP_LearnedPatterns
   ✅ Created new tab: NLP_UserPreferences
   ✅ Created new tab: NLP_UnrecognizedPhrases
   ✅ Created new tab: NLP_Analytics
   ```

#### **Option B: Automatic on First Bot Request**

- Just deploy the bot
- When it makes its first NLP request, tabs will auto-create
- No manual action needed!

---

### **Step 4: Verify Tabs Are Created and Hidden**

1. Go back to your Google Sheet
2. **You should NOT see the NLP tabs** (they're hidden!)
3. To verify they exist, temporarily unhide them:
   - Go back to Apps Script
   - Select function: `unhideNLPTabs`
   - Click **Run**
4. Now you should see 4 new tabs:
   - 🔵 **NLP_LearnedPatterns** (light blue)
   - 🟣 **NLP_UserPreferences** (light purple)
   - 🟠 **NLP_UnrecognizedPhrases** (light orange)
   - 🟢 **NLP_Analytics** (light green)
5. Each tab has:
   - ✅ Headers with proper formatting (black background, white text)
   - ✅ Sample data (row 2, grayed out and italic)
   - ✅ Notes/comments explaining what each tab does
   - ✅ Color-coded for easy identification
6. Re-hide them when done viewing:
   - Select function: `hideNLPTabs`
   - Click **Run**

---

## 🛠️ **What the Auto-Setup Does**

### **Creates 4 Hidden Tabs:**

#### **1. NLP_LearnedPatterns** (Blue 🔵)
Stores patterns the bot has learned from users.

**Columns:**
- Phrase: The learned phrase (e.g., "pusta 500")
- Command: The command it maps to (e.g., "!bid")
- Confidence: Confidence score (0.0 - 1.0)
- Usage Count: How many times it's been used
- Learned From: User ID who taught it
- Learned At: Timestamp when learned
- Param Pattern: Regex for parameter extraction
- Last Used: Last time this pattern was used
- Success Rate: How often it works correctly
- Notes: Admin notes

#### **2. NLP_UserPreferences** (Purple 🟣)
Stores each member's language preferences.

**Columns:**
- User ID: Discord user ID
- Username: Discord username
- Preferred Language: en, tl, or taglish
- Language Scores: JSON object of language usage
- Shortcuts: JSON object of personal shortcuts
- Message Count: Total messages analyzed
- Last Updated: Last preference update
- Learning Enabled: Boolean for opt-in/out
- Notes: Admin notes

#### **3. NLP_UnrecognizedPhrases** (Orange 🟠)
Tracks phrases the bot doesn't understand yet.

**Columns:**
- Phrase: The unrecognized phrase
- Count: How many times seen
- User Count: How many different users said it
- Last Seen: Most recent occurrence
- First Seen: First occurrence
- Example Users: List of users who said it
- Suggested Command: Admin suggestion
- Status: Pending/Reviewed/Taught
- Admin Notes: Notes for review

#### **4. NLP_Analytics** (Green 🟢)
Daily snapshots of learning progress.

**Columns:**
- Date: Snapshot date
- Total Patterns Learned: Count
- Total Users Tracked: Count
- Messages Analyzed: Total count
- Recognition Rate: 0.0 - 1.0
- Top Learned Pattern: Most used pattern
- Top Unrecognized Phrase: Most frequent unknown
- Language Distribution: JSON of language usage
- Notes: Auto-generated notes

---

## 🔧 **Advanced Features**

### **Viewing Hidden Tabs (Admin)**

When you want to review or debug:

```javascript
// In Apps Script editor:
// Select function: unhideNLPTabs
// Click Run
```

This makes all NLP tabs visible. Re-hide with:

```javascript
// Select function: hideNLPTabs
// Click Run
```

### **Check Tab Status**

```javascript
// Select function: checkNLPTabsExist
// Click Run
// View execution log for status report
```

Returns:
```json
{
  "NLP_LearnedPatterns": {
    "exists": true,
    "hidden": true,
    "rowCount": 15
  },
  ...
}
```

### **Re-Initialize Tabs**

If you need to reset or recreate tabs:

```javascript
// Select function: manualInitializeNLP
// Click Run
```

**Safe to run multiple times** - won't duplicate existing tabs!

---

## 📋 **Sample Data Included**

Each tab includes **sample data** (row 2) to show you what real data looks like:

### **NLP_LearnedPatterns Sample:**
```
Phrase: "pusta 500"
Command: "!bid"
Confidence: 0.95
Usage Count: 42
Notes: "Filipino slang for 'bet'"
```

### **NLP_UserPreferences Sample:**
```
User ID: "123456789012345678"
Username: "JuanDelaCruz"
Preferred Language: "tl"
Language Scores: {"en": 5, "tl": 45, "taglish": 12}
Shortcuts: {"p": "!mypoints", "g": "!bid"}
```

### **NLP_UnrecognizedPhrases Sample:**
```
Phrase: "bawi ko 500"
Count: 8
User Count: 3
Suggested Command: "!bid"
Notes: "Might mean 'revenge bid'"
```

**Note:** Sample data is marked with italic font and a note. The bot skips sample rows when reading data.

---

## 🔒 **Privacy & Visibility**

### **Why Hidden?**

1. **Reduces clutter** - Most guild members don't need to see learning data
2. **Prevents accidental edits** - Hidden tabs are harder to modify by mistake
3. **Keeps focus on main data** - Attendance and bidding tabs remain prominent

### **Who Can See Hidden Tabs?**

- **Admins with edit access** can unhide tabs anytime
- **Bot** can read/write regardless of visibility
- **Regular members** won't see them in normal view

### **What Data Is Stored?**

- ✅ Discord User IDs (anonymous identifiers)
- ✅ Usernames (public Discord names)
- ✅ Command patterns learned
- ✅ Language preferences
- ❌ **NO message content** (only patterns)
- ❌ **NO personal information** beyond Discord data
- ❌ **NO sensitive data**

---

## 🧪 **Testing the Setup**

### **Test 1: Verify Auto-Creation**

1. Delete one of the NLP tabs (if it exists)
2. Make a bot request that needs that tab
3. Check if tab auto-creates and hides itself

### **Test 2: Verify Data Writing**

1. Run `manualInitializeNLP` to create tabs
2. From Apps Script, run `saveLearnedPattern`:
   ```javascript
   saveLearnedPattern({
     phrase: "test 123",
     command: "!bid",
     confidence: 0.8,
     usageCount: 1,
     learnedFrom: "test_user",
     notes: "Test pattern"
   });
   ```
3. Unhide tabs and verify data was written

### **Test 3: Verify Data Reading**

1. From Apps Script, run `getLearnedPatterns`
2. Check execution log - should show patterns array
3. Verify sample data is filtered out

---

## 🎯 **Integration with Bot**

The bot's `nlp-learning.js` will automatically call these functions:

### **On Bot Startup:**
```javascript
await nlpLearning.loadLearnedPatterns()
→ Calls: getLearnedPatterns()
→ Auto-creates tab if missing
```

### **When Learning New Pattern:**
```javascript
await nlpLearning.confirmPattern(...)
→ Calls: saveLearnedPattern(data)
→ Auto-creates tab if missing
```

### **Every 5 Minutes (Auto-Sync):**
```javascript
await nlpLearning.syncToGoogleSheets()
→ Calls: syncNLPLearning(data)
→ Auto-creates tabs if missing
→ Updates analytics snapshot
```

**No manual intervention needed!** Tabs auto-create on first use.

---

## 🐛 **Troubleshooting**

### **Tabs Not Creating**

**Problem:** Bot can't create tabs

**Solutions:**
1. Check Apps Script permissions:
   - Go to Apps Script editor
   - Run `manualInitializeNLP` manually
   - Grant permissions when prompted
2. Check execution log for errors
3. Verify Google Sheets API quota (unlikely to hit)

### **Data Not Saving**

**Problem:** Bot learns patterns but they're not in Google Sheets

**Solutions:**
1. Unhide tabs to verify they exist
2. Check if sample data is present (means tab exists)
3. Check Apps Script execution logs for errors
4. Verify webhook URL is correct

### **Tabs Keep Unhiding**

**Problem:** Tabs randomly become visible

**Solution:**
- This is expected if you manually unhide them
- Run `hideNLPTabs` to re-hide
- Bot doesn't unhide tabs automatically

### **Sample Data Interfering**

**Problem:** Bot reads sample data as real patterns

**Solution:**
- Sample data is automatically filtered (checks for "sample data" in notes)
- If still an issue, manually delete row 2 from each tab

---

## 📊 **Monitoring Learning Progress**

### **View Analytics Dashboard**

1. Unhide `NLP_Analytics` tab
2. View daily snapshots of learning progress
3. Track:
   - Total patterns learned over time
   - User adoption (how many users tracked)
   - Recognition rate improvements
   - Language distribution trends

### **Review Unrecognized Phrases**

1. Unhide `NLP_UnrecognizedPhrases` tab
2. Sort by "Count" column (descending)
3. Top phrases = learning opportunities
4. Use `!teachbot` command to manually teach

### **Audit Learned Patterns**

1. Unhide `NLP_LearnedPatterns` tab
2. Sort by "Usage Count" (descending)
3. Top patterns = most valuable learning
4. Check "Confidence" - anything < 0.7 might need review

---

## 🔄 **Maintenance**

### **Weekly Tasks:**

1. Unhide tabs briefly to review
2. Check `NLP_UnrecognizedPhrases` for common patterns
3. Manually teach frequent patterns with `!teachbot`
4. Re-hide tabs when done

### **Monthly Tasks:**

1. Review `NLP_Analytics` for trends
2. Check if learning is slowing down (saturation)
3. Clear outdated patterns if needed
4. Archive old analytics snapshots

### **Never Needed:**

- ❌ Manual tab creation (auto-creates!)
- ❌ Tab unhiding for bot to work (works while hidden)
- ❌ Data cleanup (bot manages this)

---

## 📚 **Function Reference**

### **Initialization Functions**

| Function | Purpose | When to Use |
|----------|---------|-------------|
| `initializeNLPTabs()` | Create and hide all NLP tabs | First setup or after reset |
| `manualInitializeNLP()` | Same as above, with logging | Manual run from Apps Script |
| `checkNLPTabsExist()` | Check status of all tabs | Debugging |

### **Visibility Functions**

| Function | Purpose | When to Use |
|----------|---------|-------------|
| `unhideNLPTabs()` | Show all NLP tabs | Admin review |
| `hideNLPTabs()` | Hide all NLP tabs | After reviewing |

### **Data Functions**

| Function | Purpose | Called By |
|----------|---------|-----------|
| `getLearnedPatterns()` | Retrieve learned patterns | Bot on startup |
| `saveLearnedPattern(data)` | Save single pattern | Bot when learning |
| `getUserPreferences()` | Retrieve user prefs | Bot on startup |
| `syncNLPLearning(data)` | Sync all learning data | Bot every 5 min |

---

## ✅ **Checklist**

- [ ] Added `NLP_AUTO_SETUP.gs` to Apps Script
- [ ] Ran `manualInitializeNLP` and granted permissions
- [ ] Verified 4 tabs created (blue, purple, orange, green)
- [ ] Confirmed tabs are hidden
- [ ] Tested unhiding/hiding functionality
- [ ] Reviewed sample data in each tab
- [ ] Understood privacy/data storage
- [ ] Ready to deploy bot!

---

## 🎉 **You're Done!**

The NLP tabs will now:
- ✅ **Auto-create** if missing
- ✅ **Stay hidden** from normal view
- ✅ **Auto-populate** with learning data
- ✅ **Auto-sync** every 5 minutes
- ✅ **Track analytics** daily

**No further action needed!** Just deploy the bot and watch it learn! 🚀

---

**Questions?** Check the full documentation in `LEARNING_NLP_GUIDE.md` or `NLP_IMPLEMENTATION_SUMMARY.md`.
