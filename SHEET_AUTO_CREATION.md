# 📊 Auto-Creation of Recovery Sheets

## ✅ YES! All Recovery Sheets Auto-Create

**Both recovery sheets automatically create themselves** when needed. You don't need to manually create anything!

---

## 🎯 How It Works

### Sheet 1: `_BotState` (Bidding State)

**What it stores:**
- Bidding queue
- Active auctions
- Locked points
- Auction history

**Auto-creation:**
```javascript
function saveBotState(data) {
  let sheet = ss.getSheetByName('_BotState');

  if (!sheet) {
    // ✅ AUTO-CREATES if missing
    sheet = ss.insertSheet('_BotState');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    sheet.hideSheet(); // ✅ Automatically hidden
  }

  // Saves state...
}
```

**When created:** First time bidding state is saved (within 5 minutes of bot startup)

---

### Sheet 2: `_AttendanceState` (Attendance State)

**What it stores:**
- Active spawns
- Active columns
- Pending verifications
- Pending closures
- Confirmation messages

**Auto-creation:**
```javascript
function saveAttendanceState(data) {
  let sheet = ss.getSheetByName('_AttendanceState');

  if (!sheet) {
    // ✅ AUTO-CREATES if missing
    sheet = ss.insertSheet('_AttendanceState');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    sheet.hideSheet(); // ✅ Automatically hidden
  }

  // Saves state...
}
```

**When created:** First time attendance state is saved (within 5 minutes of bot startup)

---

## 🔄 Complete Flow

### First Bot Startup (No Sheets Exist)

```
Bot starts
    ↓
Tries to load state from Google Sheets
    ↓
Sheets don't exist yet
    ↓
Returns: "No state found" (normal)
    ↓
Bot starts with fresh state
    ↓
After 5 minutes (first auto-sync)
    ↓
saveBotState() called
    ↓
Checks: Does _BotState exist? NO
    ↓
✅ AUTO-CREATES _BotState sheet
    ↓
Saves state to new sheet
    ↓
Same for _AttendanceState
    ↓
✅ Both sheets now exist and will be used for recovery
```

---

### Second Bot Startup (Sheets Exist)

```
Bot starts
    ↓
Tries to load state from Google Sheets
    ↓
Sheets exist!
    ↓
Loads state from _BotState and _AttendanceState
    ↓
✅ Bot recovers previous state
    ↓
Continues normal operation
    ↓
Auto-sync every 5 minutes (updates existing sheets)
```

---

## 📋 Sheet Structure

### _BotState

| Column A | Column B | Column C |
|----------|----------|----------|
| **Key** | **Value** | **LastUpdated** |
| queue | [...JSON...] | 2025-10-28T12:34:56.789Z |
| activeAuction | {...JSON...} | 2025-10-28T12:34:56.789Z |
| lockedPoints | {...JSON...} | 2025-10-28T12:34:56.789Z |
| history | [...JSON...] | 2025-10-28T12:34:56.789Z |

**Properties:**
- ✅ Hidden by default
- ✅ Blue header (#4A90E2)
- ✅ Auto-created on first save

---

### _AttendanceState

| Column A | Column B | Column C |
|----------|----------|----------|
| **Key** | **Value** | **LastUpdated** |
| activeSpawns | {...JSON...} | 2025-10-28T12:34:56.789Z |
| activeColumns | {...JSON...} | 2025-10-28T12:34:56.789Z |
| pendingVerifications | {...JSON...} | 2025-10-28T12:34:56.789Z |
| pendingClosures | {...JSON...} | 2025-10-28T12:34:56.789Z |
| confirmationMessages | {...JSON...} | 2025-10-28T12:34:56.789Z |

**Properties:**
- ✅ Hidden by default
- ✅ Blue header (#4A90E2)
- ✅ Auto-created on first save

---

## 🧪 Testing Auto-Creation

### Test 1: Fresh Start (No Sheets)

**Steps:**
1. Delete `_BotState` and `_AttendanceState` sheets (if they exist)
2. Start bot
3. Wait 5 minutes
4. Check Google Sheets

**Expected:**
- ✅ Both sheets auto-created
- ✅ Both hidden
- ✅ Headers present
- ✅ State data saved

---

### Test 2: Recovery After Deletion

**Steps:**
1. Bot is running with state
2. Manually delete `_AttendanceState` sheet
3. Wait 5 minutes (for next auto-sync)
4. Check Google Sheets

**Expected:**
- ✅ Sheet auto-recreated on next sync
- ✅ Current state saved
- ✅ No errors in bot logs

---

### Test 3: Koyeb Restart (Sheets Exist)

**Steps:**
1. Create some spawns
2. Wait 5 minutes (state synced)
3. Restart Koyeb service
4. Check bot logs

**Expected:**
```
📊 Attempting to load attendance state from Google Sheets...
✅ Attendance state loaded from Google Sheets
   - Active spawns: 1
   - Active columns: 0
   - Pending verifications: 0
```

---

## 🔍 How to View Hidden Sheets

### Method 1: Via Sheet Tabs
1. Click the sheet tabs dropdown (bottom left, near sheet tabs)
2. Look for sheets starting with `_`
3. Click to view

### Method 2: Show All Sheets
1. Right-click on any sheet tab
2. Select "Show all sheets"
3. `_BotState` and `_AttendanceState` will appear

### Method 3: Apps Script
```javascript
function unhideRecoverySheets() {
  const ss = SpreadsheetApp.openById('YOUR_SHEET_ID');
  const botState = ss.getSheetByName('_BotState');
  const attendanceState = ss.getSheetByName('_AttendanceState');

  if (botState) botState.showSheet();
  if (attendanceState) attendanceState.showSheet();
}
```

---

## 🛡️ Error Handling

### If Sheet Creation Fails

**Cause:** Permissions issue, quota exceeded, etc.

**Bot behavior:**
```javascript
function saveAttendanceState(data) {
  try {
    let sheet = ss.getSheetByName('_AttendanceState');

    if (!sheet) {
      sheet = ss.insertSheet('_AttendanceState');
      // ... setup
    }

    // Save state
    return createResponse('ok', 'State saved', {saved: true});

  } catch (err) {
    // ✅ Graceful fallback
    console.error('Failed to save state:', err);
    return createResponse('error', err.toString());
  }
}
```

**Bot still works:** State stays in memory (not persisted until next successful sync)

---

### If Sheet Read Fails

**Bot behavior:**
```javascript
function getAttendanceState(data) {
  let sheet = ss.getSheetByName('_AttendanceState');

  if (!sheet) {
    // ✅ Graceful response
    return createResponse('ok', 'No state found', {state: null});
  }

  // Read state...
}
```

**Result:** Bot starts with fresh state (like first startup)

---

## 📊 Monitoring Sheet Creation

### Check Logs (Koyeb)

**First startup:**
```
✅ Bot logged in as <BotName>
📊 Attempting to load attendance state from Google Sheets...
ℹ️ No saved attendance state found
  (This is NORMAL - sheets don't exist yet)
✅ State recovered (with empty state)
🔄 Starting periodic state sync to Google Sheets...
```

**After 5 minutes:**
```
✅ Attendance state synced to Google Sheets
  (Sheet was auto-created)
```

**Second startup:**
```
✅ Bot logged in as <BotName>
📊 Attempting to load attendance state from Google Sheets...
✅ Attendance state loaded from Google Sheets
   - Active spawns: 2
   - Active columns: 1
   - Pending verifications: 0
  (Sheet exists and has data)
```

---

## ✅ Verification Checklist

After first bot startup (wait 5 minutes):

- [ ] Open Google Sheets: `1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ`
- [ ] Check sheet tabs dropdown
- [ ] `_BotState` should exist (hidden)
- [ ] `_AttendanceState` should exist (hidden)
- [ ] Both have blue headers
- [ ] Both have columns: Key, Value, LastUpdated
- [ ] Both have data rows
- [ ] Koyeb logs show "✅ State synced"

---

## 🎯 Summary

### What You Need to Do

**Nothing!** ✅

The sheets auto-create themselves. Just:
1. Merge to main
2. Deploy bot to Koyeb
3. Wait 5 minutes
4. Sheets will exist

---

### What Happens Automatically

1. ✅ Bot starts (sheets don't exist yet)
2. ✅ Bot runs with empty state (normal)
3. ✅ After 5 min, first auto-sync
4. ✅ Sheets auto-created
5. ✅ State saved
6. ✅ Future restarts = state recovered

---

### Benefits

- ✅ **Zero manual setup** - No need to create sheets
- ✅ **Self-healing** - If deleted, sheets recreate on next sync
- ✅ **Hidden by default** - Won't clutter your sheet tabs
- ✅ **Proper formatting** - Blue headers, clean layout
- ✅ **Koyeb-friendly** - State persists across container restarts

---

## 🔧 Advanced: Manual Creation (Optional)

If you want to create sheets manually before first sync:

```javascript
// In Google Apps Script
function createRecoverySheets() {
  const ss = SpreadsheetApp.openById('1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ');

  // Create _BotState
  let botState = ss.getSheetByName('_BotState');
  if (!botState) {
    botState = ss.insertSheet('_BotState');
    botState.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    botState.hideSheet();
  }

  // Create _AttendanceState
  let attendanceState = ss.getSheetByName('_AttendanceState');
  if (!attendanceState) {
    attendanceState = ss.insertSheet('_AttendanceState');
    attendanceState.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    attendanceState.hideSheet();
  }

  Logger.log('✅ Recovery sheets created');
}
```

**But this is NOT necessary!** The bot does it automatically.

---

## 📞 Troubleshooting

### Sheets Not Created After 5 Minutes

**Check:**
1. Koyeb logs for sync messages
2. Google Sheets API permissions
3. Webhook URL in config.json is correct
4. Code.js deployed successfully

**Test manually:**
```javascript
// In Apps Script
function testStateSave() {
  const data = {
    state: {
      activeSpawns: {},
      activeColumns: {},
      pendingVerifications: {},
      pendingClosures: {},
      confirmationMessages: {}
    }
  };

  const result = saveAttendanceState(data);
  Logger.log(result);
}
```

---

### Sheets Deleted by Mistake

**Don't worry!** They'll recreate on next sync (5 minutes max)

**To force immediate recreation:**
1. Create a spawn: `!spawn ego`
2. Bot triggers state sync
3. Sheet auto-created
4. Close spawn: `!close`

---

## 🎉 Conclusion

**Your recovery sheets will auto-create themselves!**

Just deploy the bot and everything happens automatically:
- ✅ Sheets created
- ✅ Headers formatted
- ✅ Automatically hidden
- ✅ State saved every 5 minutes
- ✅ Recovery works on restart

**No manual intervention needed!** 🚀

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Status:** ✅ Fully Automatic
