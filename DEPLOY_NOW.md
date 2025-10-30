# 🚀 Deploy Code.js NOW (Keep Your Webhook URL)

## ✅ Quick Steps (2 minutes)

### 1. Copy Code.js
- Open `/home/user/elysium-attendance-bot/Code.js`
- Select ALL (Ctrl+A / Cmd+A)
- Copy (Ctrl+C / Cmd+C)

### 2. Open Google Apps Script
- Go to your Google Sheet
- Click **Extensions → Apps Script**

### 3. Replace Code
- Delete all existing code in the editor
- Paste your new code (Ctrl+V / Cmd+V)
- Click **Save** (💾)

### 4. Update Deployment (KEEPS YOUR WEBHOOK URL)
1. Click **Deploy → Manage deployments**
2. Click **Edit** (✏️) next to your existing deployment
3. Click **New version**
4. Click **Deploy**
5. ✅ Done! Your webhook URL is unchanged.

### 5. Test
In Discord:
```
!leadatt  (should show attendance leaderboard from AttendanceLog)
!leadbid  (should show bidding leaderboard from BiddingPoints)
!week     (should manually trigger weekly report)
```

---

## ⚠️ IMPORTANT

**DO NOT** click "New deployment" - that creates a NEW webhook URL.
**ALWAYS** click "Manage deployments → Edit" to update and keep your existing webhook URL.

---

## 🔍 What Changed?

The updated Code.js includes:

1. ✅ **`getAttendanceLeaderboard()`** - Now reads from **AttendanceLog** sheet (not TOTAL ATTENDANCE)
   - Parses comma-separated member names from Column D
   - Aggregates total attendance per member

2. ✅ **`getBiddingLeaderboard()`** - Better logging for debugging
   - Shows row counts and data read
   - Better error messages

3. ✅ **`updateTotalAttendanceAndMembers()`** - Only updates TOTAL ATTENDANCE sheet
   - Does NOT modify weekly sheets

---

## 🐛 If Commands Still Don't Work

Check Google Apps Script logs:
1. In Apps Script editor → **View → Executions**
2. Look for recent executions
3. Check for errors

The logs will show exactly what data was read from each sheet.

---

**Next update:** Auto-deployment will work on your next push to this branch! 🎉
