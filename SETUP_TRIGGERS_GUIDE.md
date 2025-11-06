# ⚙️ Setting Up Apps Script Time-Driven Triggers

## 📋 What Are Triggers?

Time-driven triggers are like "cron jobs" for Google Apps Script. They automatically run functions at scheduled times **independently of your Discord bot**. This means:

✅ Triggers run even if Discord bot is offline
✅ Triggers run from Google's servers (always available)
✅ Perfect for automated backups and exports
✅ Survives Koyeb restarts/crashes

You need to set up **2 new triggers** (Sunday trigger already exists).

---

## 🎯 Quick Summary

You need to create:

1. **Daily Backup Trigger** - Runs every midnight (backs up all sheets)
2. **Weekly Learning Export** - Runs every Monday at 2am (exports learning data)

**Time Required:** 5 minutes total
**Difficulty:** Easy (just clicking buttons!)

---

## 📝 Step-by-Step Instructions

### Step 1: Open Google Apps Script

1. Go to your Google Sheet:
   - URL: `https://docs.google.com/spreadsheets/d/1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ/edit`
   - (Or open it from your Google Drive)

2. Click **Extensions** (top menu)
3. Click **Apps Script**

You should now see the code editor!

---

### Step 2: Open Triggers Panel

1. On the LEFT sidebar, click the **⏰ Clock icon** (labeled "Triggers")
2. You should see a list of existing triggers

**Expected existing triggers:**
- `sundayWeeklySheetCreation` - Weekly, Sunday, 12am-1am (this should already exist)
- `onEdit` - On edit (this should already exist)

---

### Step 3: Create Trigger #1 - Daily Backup

1. Click **+ Add Trigger** button (bottom right)

2. Fill in the form:
   - **Choose which function to run:** Select `dailyAutomatedBackup`
   - **Choose which deployment should run:** Select `Head`
   - **Select event source:** Select `Time-driven`
   - **Select type of time based trigger:** Select `Day timer`
   - **Select time of day:** Select `Midnight to 1am` (or `12am to 1am`)

3. Click **Save**

4. **If prompted for authorization:**
   - Click **Review Permissions**
   - Select your Google account
   - Click **Advanced** (if you see a warning)
   - Click **Go to [Your Project Name] (unsafe)**
   - Click **Allow**
   - This gives the script permission to access Drive/Sheets

**Expected Result:**
```
Function: dailyAutomatedBackup
Event: Time-driven, Day timer, 12am to 1am
```

---

### Step 4: Create Trigger #2 - Weekly Learning Export

1. Click **+ Add Trigger** button again

2. Fill in the form:
   - **Choose which function to run:** Select `weeklyLearningExport`
   - **Choose which deployment should run:** Select `Head`
   - **Select event source:** Select `Time-driven`
   - **Select type of time based trigger:** Select `Week timer`
   - **Select day of week:** Select `Every Monday`
   - **Select time:** Select `2am to 3am`

3. Click **Save**

**Expected Result:**
```
Function: weeklyLearningExport
Event: Time-driven, Week timer, Every Monday, 2am to 3am
```

---

### Step 5: Verify Setup

You should now see **4 total triggers**:

| Function | Type | Schedule |
|----------|------|----------|
| `onEdit` | On edit | (when sheet edited) |
| `sundayWeeklySheetCreation` | Week timer | Sunday, 12am-1am |
| `dailyAutomatedBackup` | Day timer | Daily, 12am-1am |
| `weeklyLearningExport` | Week timer | Monday, 2am-3am |

**If you see all 4 → You're done! ✅**

---

## 🧪 Testing the Triggers

### Option 1: Wait for Scheduled Time
- Daily backup: Runs tonight at midnight
- Weekly export: Runs next Monday at 2am

### Option 2: Run Manually (Test Immediately)

1. In Apps Script, go back to **Editor** (< icon on left)
2. Find the function dropdown (top of editor)
3. Select `dailyAutomatedBackup`
4. Click **Run** button (▶️)
5. Wait ~10-30 seconds
6. Check your Google Drive folder - you should see:
   - `Backups/YYYY-MM-DD/backup_*.json`

Repeat for `weeklyLearningExport`:
1. Select `weeklyLearningExport` from dropdown
2. Click **Run**
3. Check Drive folder - you should see:
   - `Learning_Data/Analytics/YYYY-MM-DD/learning_export_*.json`
   - `Learning_Data/Analytics/ml_training_data_*.json`

**If files appear → Triggers work! ✅**

---

## 🔍 Monitoring Trigger Executions

### View Execution History

1. In Apps Script, click **⏰ Executions** icon (left sidebar)
2. You'll see a log of all trigger runs:
   - Function name
   - Status (Success ✅ / Failed ❌)
   - Execution time
   - When it ran

### Check for Errors

If a trigger fails:
1. Click on the failed execution
2. Read the error message
3. Common issues:
   - **Timeout:** Increase execution time or optimize function
   - **Permission denied:** Re-authorize (delete trigger, recreate)
   - **Quota exceeded:** Check Google Apps Script quotas

---

## 📧 Notification Settings

### Get Email Alerts for Failures

When creating/editing a trigger:

1. Click **Notifications** (bottom of trigger form)
2. Select **Notify me immediately** for failures
3. You'll get an email if the trigger fails

**Recommended:** Enable for both triggers!

---

## ⏰ Timezone Settings

All triggers run in **Manila timezone (Asia/Manila)** automatically because:

```javascript
// In Code.js, CONFIG specifies timezone
const CONFIG = {
  TIMEZONE: 'Asia/Manila',
  // ...
};
```

**Times:**
- Sunday 12am = Sunday midnight Manila time
- Monday 2am = Monday 2:00 AM Manila time
- Daily 12am = Every midnight Manila time

---

## 🛠️ Troubleshooting

### Trigger Not Showing Up?

**Problem:** Can't find `dailyAutomatedBackup` or `weeklyLearningExport` in function dropdown

**Solution:**
1. Make sure you saved Code.js in Apps Script
2. Refresh the Apps Script page
3. Check that the function names are exact (no typos)
4. If still missing, copy Code.js again from repo

### Authorization Issues?

**Problem:** "Authorization required" or "Permission denied"

**Solution:**
1. Delete the trigger
2. Recreate it
3. When prompted, click **Review Permissions**
4. Follow authorization flow (select account, allow access)

### Trigger Not Running?

**Problem:** It's past the scheduled time but trigger didn't run

**Solution:**
1. Check **Executions** log - did it run?
2. If no execution at all:
   - Trigger might be disabled (check trigger list)
   - Click on trigger, ensure it's enabled
3. If execution failed:
   - Click on failed execution to see error
   - Fix error and trigger will retry next schedule

### Wrong Timezone?

**Problem:** Trigger runs at wrong time

**Solution:**
1. Apps Script uses account timezone by default
2. Check your Google Account timezone settings
3. The script code forces Manila timezone, so output times should be correct
4. The trigger schedule itself might show in YOUR timezone (normal)

---

## 📊 What Happens When Triggers Run

### Daily Backup (Midnight)

```
💾 Starting daily backup...
  ✓ Backed up BiddingPoints (25 rows)
  ✓ Backed up TotalAttendance (25 rows)
  ✓ Backed up ForDistribution (537 rows)
  ✓ Backed up BiddingItems (12 rows)
  ✓ Backed up BotLearning (421 rows)
  ✓ Backed up Queue (5 rows)
  ✓ Backed up ELYSIUM_WEEK_20250112 (30 rows)
✅ Daily backup completed: backup_2025-01-15_00-00-12.json
📁 File: https://drive.google.com/...
🗑️ Cleaned up 2 old backup folders
```

**Result:** New backup file in Drive
**Size:** ~2-5 MB
**Retention:** 30 days (auto-deletes older)

### Weekly Learning Export (Monday 2am)

```
🔄 [AUTOMATED] Running weekly learning export...

📊 Learning data exported: 67 predictions
File: learning_export_2025-01-15_02-00-45.json

🤖 ML training data exported: 58 samples
File: ml_training_data_2025-01-15.json

✅ [AUTOMATED] Export completed
```

**Result:** 2 new files in Drive
**Size:** ~1-3 MB total
**Content:** All predictions from past 7 days + ML training data

---

## ✅ Checklist

Before you finish, verify:

- [ ] I can see 4 triggers in the trigger list
- [ ] `dailyAutomatedBackup` is set to "Day timer, 12am-1am"
- [ ] `weeklyLearningExport` is set to "Week timer, Monday, 2am-3am"
- [ ] I've authorized the scripts (clicked "Allow" if prompted)
- [ ] I've enabled email notifications for failures (optional but recommended)
- [ ] I've tested manually (ran functions once) and files appeared in Drive
- [ ] I've checked Executions log and see successful runs

**If all checked → Setup complete! 🎉**

---

## 📖 Summary

**What You Did:**
1. ✅ Opened Apps Script trigger panel
2. ✅ Created daily backup trigger (midnight)
3. ✅ Created weekly export trigger (Monday 2am)
4. ✅ Authorized script permissions
5. ✅ Tested triggers manually
6. ✅ Verified files in Google Drive

**What Happens Now:**
- ✅ Daily backups run automatically (midnight)
- ✅ Weekly learning exports run automatically (Monday 2am)
- ✅ Everything runs from Google servers (independent of Discord bot)
- ✅ You get email alerts if anything fails
- ✅ Data is safe and growing in your 60GB Drive!

**Time Investment:** 5 minutes setup → Lifetime of automated data protection! 🚀

---

## 🆘 Need Help?

If you run into issues:

1. Check **Executions** log for error messages
2. Look at **GOOGLE_DRIVE_LEARNING.md** for more details
3. Verify your Code.js matches the latest version from repo
4. Try manual run first (to see immediate errors)
5. Check Apps Script quotas (free tier has limits)

**Most common issue:** Forgot to authorize → Just recreate trigger and click "Allow"

**You're all set! The automation is now running! 🎉**
