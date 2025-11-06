# 📋 How to Add NLP Functions to Your Existing Code.js

## Quick Setup (2 Minutes)

Since you already have a `Code.js` file in your Google Apps Script, follow these steps to add the NLP auto-setup functions:

---

## **Step 1: Open Your Google Apps Script**

1. Open your Elysium Google Sheet
2. Go to **Extensions** → **Apps Script**
3. You should see your existing `Code.js` file

---

## **Step 2: Find the Insert Location**

In your `Code.js` file, scroll to the end and find this section:

```javascript
 * All triggers run in Manila timezone (Asia/Manila) and operate
 * independently of Discord bot status - they run from Google's
 * servers, so they survive Koyeb restarts/crashes.
 */

// ===========================================================
// OPTIMIZED SHEET CREATION WITH AUTO-LOGGING
// ===========================================================
```

This should be around **line 4165**.

---

## **Step 3: Copy the NLP Code**

1. Open the file: `/Code_NLP_Addition.js` (in this repository)
2. Copy **everything** from that file (all 200+ lines)

---

## **Step 4: Paste into Code.js**

1. In your `Code.js` file, place your cursor at **line 4165** (right after the `*/` and before the `// ===...` separator)
2. **Paste** the NLP code there
3. Your file should now look like this:

```javascript
 * All triggers run in Manila timezone (Asia/Manila) and operate
 * independently of Discord bot status - they run from Google's
 * servers, so they survive Koyeb restarts/crashes.
 */

// ═══════════════════════════════════════════════════════════════
// NLP LEARNING SYSTEM - AUTO-SETUP & HIDDEN TABS
// ═══════════════════════════════════════════════════════════════
/**
 * Automatically creates and hides NLP learning tabs on first use.
 * ...
 */

const NLP_TABS_CONFIG = {
  ...
};

function initializeNLPTabs() {
  ...
}

// ... (all the NLP functions)

// ===========================================================
// OPTIMIZED SHEET CREATION WITH AUTO-LOGGING
// ===========================================================
```

---

## **Step 5: Save**

Click the **💾 Save** icon (or Ctrl+S / Cmd+S)

---

## **Step 6: (Optional) Test Initialization**

To immediately create and hide the NLP tabs:

1. Select function dropdown (top toolbar)
2. Choose: `manualInitializeNLP`
3. Click **▶️ Run**
4. **Grant permissions** when prompted:
   - Click "Review Permissions"
   - Choose your Google account
   - Click "Advanced" → "Go to [Your Project] (unsafe)"
   - Click "Allow"
5. Check execution log (bottom) - you should see:
   ```
   NLP tabs initialized. Created: 4, Existing: 0
   ✅ Created NLP tab: NLP_LearnedPatterns
   ✅ Created NLP tab: NLP_UserPreferences
   ✅ Created NLP tab: NLP_UnrecognizedPhrases
   ✅ Created NLP tab: NLP_Analytics
   ```

---

## **Step 7: Verify Tabs Are Hidden**

1. Go back to your Google Sheet
2. **You should NOT see the NLP tabs** (they're hidden!)
3. To temporarily view them:
   - Return to Apps Script
   - Select function: `unhideNLPTabs`
   - Click **Run**
4. Now you should see 4 new color-coded tabs:
   - 🔵 **NLP_LearnedPatterns** (blue)
   - 🟣 **NLP_UserPreferences** (purple)
   - 🟠 **NLP_UnrecognizedPhrases** (orange)
   - 🟢 **NLP_Analytics** (green)
5. To re-hide them:
   - Select function: `hideNLPTabs`
   - Click **Run**

---

## **✅ You're Done!**

The NLP functions are now integrated into your existing `Code.js` file!

### **What Happens Next:**

1. **Auto-Create on First Use**
   - When the bot makes its first NLP request (e.g., `getLearnedPatterns()`), tabs will auto-create if they don't exist
   - They'll immediately hide themselves

2. **Auto-Sync Every 5 Minutes**
   - Bot calls `syncNLPLearning(data)` every 5 minutes
   - Data is saved to the hidden tabs
   - Analytics updated daily

3. **No Manual Maintenance Needed**
   - Tabs stay hidden
   - Data auto-syncs
   - You're all set!

---

## **Functions Added to Your Code.js**

### **Initialization Functions:**
- `initializeNLPTabs()` - Create and hide all NLP tabs
- `manualInitializeNLP()` - Manual run with logging (for testing)
- `checkNLPTabsExist()` - Check status of all tabs

### **Visibility Functions:**
- `unhideNLPTabs()` - Show all NLP tabs (for admin review)
- `hideNLPTabs()` - Re-hide all NLP tabs

### **Data Access Functions:**
- `getLearnedPatterns()` - Retrieve learned patterns (called by bot)
- `saveLearnedPattern(data)` - Save single pattern (called by bot)
- `getUserPreferences()` - Retrieve user preferences (called by bot)
- `syncNLPLearning(data)` - Sync all learning data (called by bot every 5 min)
- `updateNLPAnalytics(data)` - Update analytics snapshot (called by sync)

### **Helper Functions:**
- `getOrCreateNLPSheet(ss, tabName, config)` - Internal helper for tab creation

---

## **Troubleshooting**

### **Problem: Tabs Not Creating**

**Solution:**
1. Run `manualInitializeNLP` from Apps Script editor
2. Grant permissions when prompted
3. Check execution log for errors

### **Problem: Permission Errors**

**Solution:**
1. In Apps Script, click **Project Settings** (⚙️ icon on left)
2. Scroll down to **Script Properties**
3. Verify permissions are granted

### **Problem: Tabs Visible After Creation**

**Solution:**
- Run `hideNLPTabs()` from Apps Script editor
- Tabs will immediately hide

### **Problem: Bot Can't Find Functions**

**Solution:**
- Make sure you **saved** the Code.js file after pasting
- Reload your Google Sheet
- Test by running `manualInitializeNLP` manually

---

## **What to Delete**

You can now **delete** the standalone file:
- ❌ `google-apps-script/NLP_AUTO_SETUP.gs` (no longer needed - code is in Code.js)
- ✅ Keep: `Code_NLP_Addition.js` (for reference/backup)

---

## **Next Steps**

1. ✅ NLP functions added to Code.js
2. ⏳ Integrate bot code (nlp-learning.js) into main bot
3. ⏳ Deploy bot to Koyeb
4. 🎉 Watch it learn!

---

**Need help?** Check:
- `GOOGLE_SHEETS_NLP_SETUP.md` - Detailed setup guide
- `LEARNING_NLP_GUIDE.md` - How the learning system works
- `NLP_IMPLEMENTATION_SUMMARY.md` - Complete overview
