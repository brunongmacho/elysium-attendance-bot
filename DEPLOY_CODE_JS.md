# How to Deploy Code.js to Google Apps Script

## ⚠️ IMPORTANT: You must deploy the updated Code.js for the leaderboard commands to work!

The error "Unknown action: getAttendanceLeaderboard" means your Google Apps Script doesn't have the latest code yet.

---

## 📋 Step-by-Step Deployment Guide

### Step 1: Open Your Google Sheet
1. Go to your Google Sheet (the one with ELYSIUM attendance data)
2. Click **Extensions → Apps Script**
3. This opens the Google Apps Script editor

### Step 2: Copy the New Code
1. Open the file `/home/user/elysium-attendance-bot/Code.js` on your local machine
2. Select ALL the code (Ctrl+A / Cmd+A)
3. Copy it (Ctrl+C / Cmd+C)

### Step 3: Replace the Code in Apps Script
1. In the Apps Script editor, delete ALL existing code
2. Paste the new code (Ctrl+V / Cmd+V)
3. Click the **Save** button (💾 icon) or press Ctrl+S

### Step 4: Deploy the Updated Script

#### If this is your FIRST deployment:
1. Click **Deploy → New deployment**
2. Click the gear icon (⚙️) next to "Select type"
3. Select **Web app**
4. Configure:
   - **Description:** "ELYSIUM Bot Webhook v2.0" (or any description)
   - **Execute as:** Me (your email)
   - **Who has access:** Anyone
5. Click **Deploy**
6. **Copy the Web app URL** - this is your webhook URL
7. Update your `config.json` with this URL

#### If you've ALREADY deployed before:
1. Click **Deploy → Manage deployments**
2. Click the **Edit** button (✏️) next to your existing deployment
3. Under "Version", click **New version**
4. Click **Deploy**
5. Your webhook URL stays the same - no need to update config.json

### Step 5: Test the Deployment
1. In your Discord bot, try: `!leadatt`
2. You should see the attendance leaderboard
3. Try `!leadbid` for bidding leaderboard
4. Try `!week` for manual weekly report

---

## 🔍 Troubleshooting

### Error: "Unknown action: getAttendanceLeaderboard"
- ❌ Your Google Apps Script doesn't have the new code
- ✅ Follow the deployment steps above

### Error: "Script function not found: doPost"
- ❌ You didn't copy the entire Code.js file
- ✅ Make sure you copied ALL the code from Code.js

### Error: "The script completed but did not return anything"
- ❌ The deployment settings are wrong
- ✅ Make sure "Execute as: Me" and "Who has access: Anyone" are set correctly

### Commands still don't work after deployment
- ❌ Your `config.json` has the wrong webhook URL
- ✅ Check that `sheet_webhook_url` in config.json matches your deployed web app URL

---

## 📝 What's New in This Version?

The updated Code.js includes:

1. ✅ **Leaderboard Functions:**
   - `getAttendanceLeaderboard()` - Lines 1262-1324
   - `getBiddingLeaderboard()` - Lines 1329-1381
   - `getWeeklySummary()` - Lines 1386-1525

2. ✅ **Fixed `updateTotalAttendanceAndMembers`:**
   - Now ONLY updates TOTAL ATTENDANCE sheet
   - Does NOT modify weekly sheets

3. ✅ **Webhook Handler Updated:**
   - Lines 77-79: Added leaderboard action handlers to doPost()

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Code.js is saved in Google Apps Script
- [ ] Deployment shows "New version" or deployment succeeded
- [ ] Webhook URL is correct in config.json
- [ ] Bot is restarted (if needed)
- [ ] `!leadatt` command works
- [ ] `!leadbid` command works
- [ ] `!week` command works

---

## 📞 Still Having Issues?

If you're still getting errors after deployment:

1. Check the Google Apps Script execution logs:
   - In Apps Script editor → **View → Executions**
   - Look for errors in recent executions

2. Check the bot logs for the exact error message

3. Verify your config.json has the correct webhook URL:
   ```json
   {
     "sheet_webhook_url": "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
   }
   ```

4. Make sure you clicked "New version" when redeploying (not just "Save")

---

**Last updated:** 2025-10-30
