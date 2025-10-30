# Weekly Sheet Automation Setup Guide

This guide explains how to configure the optimized weekly sheet automation system for the ELYSIUM Guild attendance bot.

## 📋 Features

### ✅ Auto-detect Latest Sheet
- Bot automatically scans all sheets matching pattern `ELYSIUM_WEEK_YYYYMMDD`
- Identifies the most recent week by sorting sheet names
- Creates new sheet automatically when needed

### ✅ Clone Previous Sheet
- Duplicates the latest sheet's layout, formulas, and formatting (columns A–D)
- Copies member names from previous week
- Preserves formulas for points calculation
- Automatically renames to the new week name

### ✅ Reset Attendance Data
- New sheets start with clean attendance columns (no checkboxes marked)
- Keeps player names and color formatting
- Conditional formats stay intact
- Only member list and formulas are copied

### ✅ Auto-log to #admin-logs
- Sends Discord notification when new weekly sheet is created
- Message format:
  ```
  📄 New weekly sheet created: ELYSIUM_WEEK_20251101
  ✅ Format copied from previous week: ELYSIUM_WEEK_20251025
  ```

### ✅ Auto-update on Sheet Edit (NEW)
- `updateBiddingPoints()` triggers automatically when sheets are edited
- `updateTotalAttendanceAndMembers()` triggers automatically on edit
- Ensures data is always in sync across all sheets
- No manual update calls needed

---

## 🔧 Setup Instructions

### Step 1: Configure Discord Webhook URL

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. In `Code.js`, find line 12 and update the `DISCORD_WEBHOOK_URL`:

```javascript
const CONFIG = {
  SHEET_ID: '1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ',
  SHEET_NAME_PREFIX: 'ELYSIUM_WEEK_',
  BOSS_POINTS_SHEET: 'BossPoints',
  BIDDING_SHEET: 'BiddingPoints',
  TIMEZONE: 'Asia/Manila',
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
};
```

**How to get Discord Webhook URL:**
1. Go to your Discord server
2. Navigate to **#admin-logs** channel settings
3. Click **Integrations → Webhooks → New Webhook**
4. Name it "Weekly Sheet Bot" or similar
5. Copy the webhook URL and paste it in `Code.js`

---

### Step 2: Set Up Apps Script Triggers

#### A. Set up `onEdit` trigger (for auto-updates)

1. In Apps Script editor, click **⏰ Triggers** (clock icon on left sidebar)
2. Click **+ Add Trigger** (bottom right)
3. Configure:
   - **Choose which function to run:** `onEdit`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `From spreadsheet`
   - **Select event type:** `On edit`
4. Click **Save**

**What this does:**
- Automatically runs `updateBiddingPoints()` when any weekly sheet, BiddingPoints, or BiddingItems sheet is edited
- Automatically runs `updateTotalAttendanceAndMembers()` on the same events
- Keeps all data in sync in real-time

---

#### B. Set up `sundayWeeklySheetCreation` trigger (for Sunday automation)

1. In Apps Script editor, click **⏰ Triggers** (clock icon)
2. Click **+ Add Trigger**
3. Configure:
   - **Choose which function to run:** `sundayWeeklySheetCreation`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `Time-driven`
   - **Select type of time based trigger:** `Week timer`
   - **Select day of week:** `Every Sunday`
   - **Select time of day:** `Midnight to 1am` (or `12am to 1am`)
4. Click **Save**

**What this does:**
- Every Sunday at midnight (Manila time), creates a new weekly sheet for the upcoming week
- Automatically copies member list and formulas from previous week
- Sends notification to Discord #admin-logs channel
- Sheet name format: `ELYSIUM_WEEK_YYYYMMDD` (date of Sunday)

---

### Step 3: Grant Permissions

When you save the triggers, Google will ask for permissions:

1. Click **Review Permissions**
2. Choose your Google account
3. Click **Advanced → Go to [Your Project Name] (unsafe)**
4. Click **Allow**

**Required permissions:**
- Read/write access to Google Sheets
- External service access (for Discord webhook)

---

## 🧪 Testing the Setup

### Test 1: Manual Sheet Creation
Run `sundayWeeklySheetCreation()` manually to test:
1. Go to Apps Script editor
2. Select `sundayWeeklySheetCreation` from function dropdown
3. Click **Run** (▶️ button)
4. Check:
   - ✅ New sheet created with name `ELYSIUM_WEEK_YYYYMMDD`
   - ✅ Member names copied from previous week
   - ✅ Discord notification sent to #admin-logs

### Test 2: Auto-Update on Edit
1. Open any `ELYSIUM_WEEK_*` sheet
2. Edit a cell (e.g., add a new member name)
3. Check:
   - ✅ `BiddingPoints` sheet updates automatically
   - ✅ `TOTAL ATTENDANCE` sheet updates automatically
4. View **Execution log** in Apps Script: Extensions → Apps Script → Executions

---

## 📊 How It Works

### Sunday Automation Flow
```
Sunday 12am-1am (Manila Time)
    ↓
sundayWeeklySheetCreation() runs
    ↓
Calculate next Sunday's date
    ↓
Create new sheet: ELYSIUM_WEEK_YYYYMMDD
    ↓
Copy headers & format columns A-D
    ↓
Copy member names from previous week
    ↓
Copy formulas for points calculation
    ↓
Send Discord notification to #admin-logs
```

### Auto-Update Flow
```
User edits sheet (any weekly sheet, BiddingPoints, or BiddingItems)
    ↓
onEdit() trigger fires
    ↓
Check if edited sheet is:
  - ELYSIUM_WEEK_* sheet?
  - BiddingPoints sheet?
  - BiddingItems sheet?
    ↓
If yes:
  → Run updateBiddingPoints()
  → Run updateTotalAttendanceAndMembers()
    ↓
Data synced across all sheets
```

---

## 🔍 Troubleshooting

### Issue: Discord notification not sent
**Solution:**
- Check if `DISCORD_WEBHOOK_URL` is configured correctly in `Code.js` line 12
- Test webhook URL in Discord webhook settings (click "Test Webhook")
- Check Apps Script execution logs: Extensions → Apps Script → Executions

### Issue: Trigger not running on Sunday
**Solution:**
- Verify trigger is set up correctly: Apps Script → Triggers
- Check execution logs for errors: Apps Script → Executions
- Ensure timezone is set to `Asia/Manila` in CONFIG

### Issue: onEdit trigger not firing
**Solution:**
- Verify trigger exists: Apps Script → Triggers
- Check if trigger has proper permissions (re-authorize if needed)
- Test by manually editing a cell in a weekly sheet

### Issue: Sheet already exists error
**Solution:**
- This is normal if the sheet was already created this week
- The function will skip creation and log: `⚠️ Sheet already exists`
- No action needed

---

## 📝 Maintenance

### Weekly Monitoring
- Check #admin-logs for Sunday sheet creation messages
- Verify member list is correctly copied
- Ensure attendance columns start empty

### Monthly Review
- Review Apps Script execution logs for errors
- Check trigger status in Apps Script → Triggers
- Verify webhook is still active in Discord

### Updates
- Version: v6.0 (Latest)
- Last updated: 2025-10-30
- Changes:
  - ✅ Added `onEdit` trigger for automatic updates
  - ✅ Added `sundayWeeklySheetCreation` for Sunday automation
  - ✅ Added Discord #admin-logs integration
  - ✅ Optimized `updateBiddingPoints` and `updateTotalAttendanceAndMembers`

---

## 📚 Additional Resources

- [Google Apps Script Triggers Documentation](https://developers.google.com/apps-script/guides/triggers)
- [Discord Webhooks Guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
- [ELYSIUM Bot Main Documentation](./README.md)

---

## 💡 Tips

1. **Test triggers before relying on them**
   - Run functions manually first to ensure they work
   - Check execution logs after each run

2. **Keep webhook URL secure**
   - Don't share your webhook URL publicly
   - Regenerate webhook if compromised

3. **Monitor trigger executions**
   - Apps Script tracks all trigger executions
   - Review logs weekly to catch issues early

4. **Backup your sheet**
   - Make periodic backups of your Google Sheet
   - Export important data regularly

---

## ✅ Checklist

Before going live with automation:

- [ ] Discord webhook URL configured in `Code.js`
- [ ] `onEdit` trigger set up and active
- [ ] `sundayWeeklySheetCreation` trigger set up for Sundays
- [ ] Permissions granted to Apps Script
- [ ] Manual test of `sundayWeeklySheetCreation()` successful
- [ ] Manual test of `onEdit` trigger successful
- [ ] Discord notification received in #admin-logs
- [ ] Execution logs checked for errors
- [ ] Team notified about new automation

---

**Questions or Issues?**
- Check execution logs: Apps Script → Executions
- Review function documentation in `Code.js`
- Test functions manually before relying on automation
