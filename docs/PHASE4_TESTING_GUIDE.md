# Phase 4 MongoDB Migration - Testing Guide

**Purpose**: Comprehensive testing guide to verify all MongoDB features are working correctly.

**Before Testing**: Ensure these environment variables are set in Koyeb:
```bash
USE_MONGODB_BIDDING=true
USE_MONGODB_AUCTIONEERING=true
USE_MONGODB_ATTENDANCE=true
MONGODB_FALLBACK_ENABLED=true
```

---

## 🔍 How to Know if MongoDB is Being Used

### MongoDB Logs (Fast Response)
```
✅ [MongoDB] Fetched 52 members for !mypoints in 15ms
✅ [MongoDB] Fetched 50 member points in 12ms
✅ [MongoDB] Fetched 58 auction items in 18ms
✅ [MongoDB] Submitted 12 attendance records in 45ms
```

**Key indicators:**
- Response times: **10-50ms** for reads, **50-200ms** for writes
- Log prefix: `[MongoDB]`
- Success emoji: ✅

### Google Sheets Logs (Slow Response)
```
✅ Fetch pts: [Sheets API response]
✅ Submitted [Sheets API]
```

**Key indicators:**
- Response times: **500-2000ms** for reads, **1000-3000ms** for writes
- No `[MongoDB]` prefix
- Generic "Fetch pts" or "Submitted" messages

---

## 1. Testing Bidding Module

### Test 1.1: !mypoints Command

**Objective**: Verify points are fetched from MongoDB

**Steps:**
1. In Discord, type `!mypoints` (or aliases: !pts, !mp, !mypts)
2. Check Koyeb logs immediately

**Expected Logs:**
```
✅ [MongoDB] Fetched 52 members for !mypoints in 15ms
```

**Expected Response Time**: 10-50ms (vs 500-2000ms with Sheets)

**Success Criteria:**
- ✅ Command responds quickly (<100ms)
- ✅ Logs show `[MongoDB]` prefix
- ✅ Your points are displayed correctly
- ✅ No errors in logs

**If It Fails:**
- Check if `USE_MONGODB_BIDDING=true` is set
- Look for MongoDB connection errors
- Verify circuit breaker hasn't opened (should see fallback logs)

---

### Test 1.2: Saturday Auction Session

**Objective**: Verify bidding session uses MongoDB for points fetch and submission

**Steps:**
1. Start an auction with `!startauction` at Saturday 12pm
2. Monitor Koyeb logs during the session
3. Let members place bids with `!bid` or `!b`
4. End the session normally

**Expected Logs (Session Start):**
```
✅ [MongoDB] Fetched 50 member points in 12ms
📊 Fetched 50 member points successfully
```

**Expected Logs (Session End):**
```
✅ [MongoDB] Points updated successfully
✅ [MongoDB] Results submitted, Sheet sync queued
📤 Processing 1 sync action(s) (priority: 0ms)
✅ Synced bidding results: 50 members
```

**Success Criteria:**
- ✅ Session starts without errors
- ✅ Points fetch is fast (<50ms)
- ✅ Session end saves to MongoDB first
- ✅ Background Sheet sync queued (IMMEDIATE priority)
- ✅ Verify points in Google Sheets match MongoDB after sync

**If It Fails:**
- Check MongoDB connection logs
- Look for circuit breaker alerts in admin-logs channel
- Verify Sheet sync completed (check logs for sync success)

---

### Test 1.3: Bot State Save/Load

**Objective**: Verify auction state is saved to MongoDB

**Steps:**
1. Start an auction with `!startauction`
2. Restart the bot (Koyeb deployment restart)
3. Check if auction state is recovered

**Expected Logs (On Restart):**
```
ℹ️ [MongoDB] Loading bot state from MongoDB...
✅ [MongoDB] Bot state loaded successfully
```

**Success Criteria:**
- ✅ Bot state loads from MongoDB on startup
- ✅ Fast load time (<30ms)
- ✅ Auction state preserved after restart

---

## 2. Testing Auctioneering Module

### Test 2.1: !queuelist Command

**Objective**: Verify auction queue is fetched from MongoDB

**Steps:**
1. In Discord, type `!queuelist` (or aliases: !ql, !queue)
2. Check Koyeb logs immediately

**Expected Logs:**
```
✅ [MongoDB] Fetched 58 auction items in 18ms
```

**Expected Response Time**: 10-50ms (vs 500-2000ms with Sheets)

**Success Criteria:**
- ✅ Command responds quickly (<100ms)
- ✅ Logs show `[MongoDB]` prefix
- ✅ Auction queue is displayed correctly
- ✅ All items from Google Sheets are present

**If It Fails:**
- Check if `USE_MONGODB_AUCTIONEERING=true` is set
- Run sync script: `node scripts/sync-sheets-to-mongodb.js --items`
- Verify MongoDB connection

---

### Test 2.2: Auction Item Sold (Auctioneer Only)

**Objective**: Verify sold items are logged to MongoDB

**Steps:**
1. During an auction, sell an item using auctioneer commands
2. Monitor Koyeb logs

**Expected Logs:**
```
✅ [MongoDB] Auction item marked as sold
✅ [MongoDB] Results submitted, Sheet sync queued
📤 Processing 1 sync action(s) (priority: 0ms)
```

**Success Criteria:**
- ✅ Item marked as sold in MongoDB
- ✅ Background sync to Sheets queued (IMMEDIATE priority)
- ✅ Verify in Google Sheets that item is marked as sold

---

## 3. Testing Attendance Module

### Test 3.1: Daily Attendance Auto-Close

**Objective**: Verify attendance records are saved to MongoDB

**Steps:**
1. Wait for a boss spawn and attendance thread to auto-close (or manually trigger)
2. Monitor Koyeb logs during auto-close

**Expected Logs:**
```
🔄 [Auto-close] Submitting attendance results...
✅ [MongoDB] Submitted 12 attendance records in 45ms
📤 Processing 1 sync action(s) (priority: 0ms)
✅ Synced attendance: 12 members
```

**Success Criteria:**
- ✅ Attendance saved to MongoDB first
- ✅ Fast save time (<200ms)
- ✅ Each member's attendance added individually
- ✅ Background sync to Sheets queued (IMMEDIATE priority)
- ✅ Verify in Google Sheets that attendance is recorded

**If It Fails:**
- Check if `USE_MONGODB_ATTENDANCE=true` is set
- Look for MongoDB connection errors
- Check admin-logs for alerts

---

### Test 3.2: !leaderboard (attendance)

**Objective**: Verify attendance leaderboard is fetched from MongoDB

**Steps:**
1. In Discord, type `!leaderboard` and select "Attendance" option
2. Check Koyeb logs immediately

**Expected Logs:**
```
✅ [MongoDB] Fetched 52 members for attendance leaderboard in 12ms
```

**Expected Response Time**: 10-50ms (vs 500-2000ms with Sheets)

**Success Criteria:**
- ✅ Command responds quickly (<100ms)
- ✅ Logs show `[MongoDB]` prefix
- ✅ Attendance leaderboard displays correctly
- ✅ Attendance points match expected values

**If It Fails:**
- Check if `USE_MONGODB_ATTENDANCE=true` is set
- Verify attendance data exists in MongoDB members collection
- Check member.attendance.total field

---

## 4. Testing Leaderboard Commands

### Test 4.1: !leaderboard (bidding)

**Objective**: Verify bidding leaderboard is fetched from MongoDB

**Steps:**
1. In Discord, type `!leaderboard` and select "Bidding" option
2. Check Koyeb logs immediately

**Expected Logs:**
```
✅ [MongoDB] Fetched 52 members for bidding leaderboard in 10ms
```

**Expected Response Time**: 10-50ms (vs 500-2000ms with Sheets)

**Success Criteria:**
- ✅ Command responds quickly (<100ms)
- ✅ Logs show `[MongoDB]` prefix
- ✅ Bidding leaderboard displays correctly
- ✅ Points match what's in Google Sheets

**If It Fails:**
- Check if `USE_MONGODB_BIDDING=true` is set
- Run sync script: `node scripts/sync-sheets-to-mongodb.js --members`
- Verify member points in MongoDB

---

### Test 4.2: Leaderboard Aliases

**Objective**: Verify all leaderboard aliases work with MongoDB

**Steps:**
Test each of these commands:
- `!lb` (general leaderboard)
- `!lba` (attendance leaderboard)
- `!lbb` (bidding leaderboard)
- `!leadatt` (attendance leaderboard)
- `!leadbid` (bidding leaderboard)

**Expected Behavior:**
All aliases should resolve to the correct leaderboard command and use MongoDB

**Success Criteria:**
- ✅ All aliases work correctly
- ✅ All show MongoDB logs
- ✅ All respond quickly (<100ms)

---

## 5. Testing Circuit Breaker & Failover

### Test 5.1: MongoDB Unreachable

**Objective**: Verify automatic fallback to Google Sheets

**Steps:**
1. **CAUTION**: Only do this in a test environment
2. Set invalid MongoDB URI: `MONGODB_URI=mongodb+srv://invalid`
3. Restart bot
4. Try `!mypoints` command

**Expected Logs:**
```
⚠️ [MongoDB] Attempt 1/10 failed, retrying in 1000ms
⚠️ [MongoDB] Attempt 2/10 failed, retrying in 2000ms
⚠️ [MongoDB] Attempt 3/10 failed, retrying in 4000ms
...
❌ [MongoDB] All 10 attempts failed
⚠️ [MongoDB] Using fallback after 10 failed attempts
✅ [Sheets] Points fetched successfully
```

**Expected Behavior:**
- 10 retry attempts with exponential backoff (1s → 2s → 4s → 8s → 16s → 30s)
- After 10 failures, use Google Sheets
- Admin alert sent to admin-logs channel

**Success Criteria:**
- ✅ Bot retries 10 times before fallback
- ✅ Command still works (using Sheets)
- ✅ Admin alert appears in admin-logs
- ✅ User receives correct response

**Restore MongoDB:**
```bash
MONGODB_URI=mongodb+srv://correct_uri
# Restart bot
```

---

### Test 5.2: Circuit Breaker Opens

**Objective**: Verify circuit breaker opens after repeated failures

**Steps:**
1. With invalid MongoDB URI, run 5 commands quickly (e.g., `!mypoints` 5 times)
2. Check admin-logs for circuit breaker alert

**Expected Admin Alert:**
```
⚠️ Circuit Breaker Opened
Circuit: BiddingMongoDB
Failures: 5/5
Status: All requests will use fallback
```

**Success Criteria:**
- ✅ Circuit opens after 5 consecutive failures
- ✅ Admin alert sent to admin-logs
- ✅ All subsequent requests use Sheets immediately (no retry attempts)

---

### Test 5.3: Circuit Breaker Recovery

**Objective**: Verify circuit breaker recovers after MongoDB is restored

**Steps:**
1. Restore correct MongoDB URI
2. Wait 60 seconds
3. Run a command (e.g., `!mypoints`)
4. Check admin-logs for recovery alert

**Expected Admin Alert:**
```
✅ Circuit Breaker Recovered
Circuit: BiddingMongoDB
Status: Normal operations resumed
```

**Success Criteria:**
- ✅ Circuit recovers after 60 seconds
- ✅ Admin alert sent to admin-logs
- ✅ MongoDB operations resume normally

---

## 6. Testing Sync Script

### Test 6.1: Sync Members (Bidding Points)

**Objective**: Verify sync script updates MongoDB with latest Sheets data

**Steps:**
1. Manually edit a member's points in Google Sheets (e.g., add 100 points)
2. Run sync script:
   ```bash
   node scripts/sync-sheets-to-mongodb.js --members
   ```
3. Check member's points in bot with `!mypoints`

**Expected Output:**
```
═══════════════════════════════════════════════════════════════
🔄 GOOGLE SHEETS → MONGODB SYNC
═══════════════════════════════════════════════════════════════

🔌 Connecting to MongoDB...
✅ MongoDB connected

🔄 Syncing members (bidding points)...
📥 Fetching members from Google Sheets...
✅ Found 52 members in Google Sheets
✅ Members synced: 52, skipped: 0

═══════════════════════════════════════════════════════════════
📊 SYNC SUMMARY
═══════════════════════════════════════════════════════════════
👥 Members: 52 synced, 0 skipped

✅ SYNC COMPLETE - MongoDB is now up to date with Google Sheets
```

**Success Criteria:**
- ✅ All members synced successfully
- ✅ Points in bot match Google Sheets
- ✅ Discord IDs preserved (not overwritten)
- ✅ Output stays under 2000 characters (Discord-safe)

---

### Test 6.2: Sync Auction Items

**Objective**: Verify sync script updates MongoDB auction queue

**Steps:**
1. Add a new item to Google Sheets auction queue
2. Run sync script:
   ```bash
   node scripts/sync-sheets-to-mongodb.js --items
   ```
3. Check auction queue in bot with `!queuelist`

**Expected Output:**
```
═══════════════════════════════════════════════════════════════
🔄 GOOGLE SHEETS → MONGODB SYNC
═══════════════════════════════════════════════════════════════

🔌 Connecting to MongoDB...
✅ MongoDB connected

🔄 Syncing auction items...
📥 Fetching auction items from Google Sheets...
✅ Found 58 auction items in Google Sheets
🗑️ Clearing old auction items...
💾 Inserting fresh auction items...
✅ Auction items synced: 58

═══════════════════════════════════════════════════════════════
📊 SYNC SUMMARY
═══════════════════════════════════════════════════════════════
🎁 Auction Items: 58 synced

✅ SYNC COMPLETE - MongoDB is now up to date with Google Sheets
```

**Success Criteria:**
- ✅ All items synced successfully
- ✅ New item appears in `!queuelist`
- ✅ Old items cleared and replaced
- ✅ Output stays under 2000 characters

---

### Test 6.3: Dry Run Mode

**Objective**: Verify dry run mode shows changes without applying them

**Steps:**
1. Run sync script with dry-run flag:
   ```bash
   node scripts/sync-sheets-to-mongodb.js --dry-run
   ```
2. Verify no changes are made to MongoDB

**Expected Output:**
```
🔍 DRY RUN MODE - No data will be modified

🔄 Syncing members (bidding points)...
📥 Fetching members from Google Sheets...
✅ Found 52 members in Google Sheets
🔍 [DRY RUN] Would sync members:
   - Alice: 1500 pts
   - Bob: 2000 pts
   ... and 47 more members

🔄 Syncing auction items...
📥 Fetching auction items from Google Sheets...
✅ Found 58 auction items in Google Sheets
🔍 [DRY RUN] Would sync items:
   - Dragon Scale (500 pts)
   - Magic Sword (1000 pts)
   ... and 53 more items

🔍 DRY RUN COMPLETE - No changes were made
```

**Success Criteria:**
- ✅ Shows preview of what would be synced (limited to 5 items)
- ✅ No actual changes made to MongoDB
- ✅ Useful for verifying data before sync

---

## 7. Testing Background Sheet Sync

### Test 7.1: IMMEDIATE Priority Sync

**Objective**: Verify critical operations sync to Sheets immediately

**Steps:**
1. End an auction session
2. Watch logs for sync queue processing

**Expected Logs:**
```
✅ [MongoDB] Results submitted, Sheet sync queued
📤 Processing 1 sync action(s) (priority: 0ms)
⏱️ Syncing to Sheets: submitBiddingResults
✅ Synced bidding results: 50 members
```

**Success Criteria:**
- ✅ Sync queued with IMMEDIATE priority (0ms delay)
- ✅ Sync processed within seconds
- ✅ Google Sheets updated correctly

---

### Test 7.2: Sync Failure with Retry

**Objective**: Verify sync retries on failure

**Steps:**
1. **CAUTION**: Only do this in a test environment
2. Temporarily break Sheet webhook URL in config.json
3. End an auction session or close attendance
4. Watch logs for retry attempts

**Expected Logs:**
```
⚠️ [Sheet Sync] Attempt 1/10 failed: Network error
⚠️ [Sheet Sync] Retrying in 1000ms...
⚠️ [Sheet Sync] Attempt 2/10 failed: Network error
⚠️ [Sheet Sync] Retrying in 2000ms...
...
❌ [Sheet Sync] All 10 attempts failed
```

**Expected Admin Alert:**
```
⚠️ Sheet Sync Failure
Action Type: submitBiddingResults
Attempts: 10
Error: Network timeout
```

**Success Criteria:**
- ✅ Retries 10 times with exponential backoff
- ✅ Admin alert sent after all retries fail
- ✅ MongoDB data preserved (source of truth)

**Restore Sheet URL:**
```json
"sheet_webhook_url": "https://script.google.com/correct_url"
```

---

## 8. Complete Testing Checklist

### Before Saturday 12pm Auction (Friday Night)

- [ ] ✅ Verify `USE_MONGODB_BIDDING=true` in Koyeb
- [ ] ✅ Verify `USE_MONGODB_AUCTIONEERING=true` in Koyeb
- [ ] ✅ Verify `USE_MONGODB_ATTENDANCE=true` in Koyeb
- [ ] ✅ Verify `MONGODB_FALLBACK_ENABLED=true` in Koyeb
- [ ] ✅ Run sync script to ensure MongoDB has latest data:
  ```bash
  node scripts/sync-sheets-to-mongodb.js
  ```
- [ ] ✅ Check MongoDB health in logs (should show 2ms latency)
- [ ] ✅ Test `!mypoints` - should see MongoDB logs (<50ms)
- [ ] ✅ Test `!queuelist` - should see MongoDB logs (<50ms)
- [ ] ✅ Test `!leaderboard` (bidding) - should see MongoDB logs (<50ms)
- [ ] ✅ Test `!leaderboard` (attendance) - should see MongoDB logs (<50ms)
- [ ] ✅ Verify Discord ID migration is 100% complete
- [ ] ✅ Monitor admin-logs channel (should be quiet)

### Saturday 11:45am (Pre-Auction Final Check)

- [ ] ✅ Check Koyeb logs for any MongoDB errors
- [ ] ✅ Test `!mypoints` one more time
- [ ] ✅ Verify `!queuelist` shows correct items
- [ ] ✅ Check circuit breaker status (should be CLOSED)
- [ ] ✅ Verify admin-logs channel is configured

### During Saturday 12pm Auction

- [ ] 👀 Watch Koyeb logs for MongoDB operations
- [ ] 👀 Monitor response times (<100ms expected)
- [ ] 👀 Check for any circuit breaker alerts
- [ ] 👀 Verify bids process normally (3s rate limit)
- [ ] 👀 Monitor admin-logs for any failures

### After Auction

- [ ] ✅ Check final tally in Google Sheets matches expectations
- [ ] ✅ Verify all winners' points deducted correctly
- [ ] ✅ Check sync queue is empty (all syncs completed)
- [ ] ✅ Review any admin-log alerts
- [ ] ✅ Verify MongoDB and Sheets are in sync

---

## 9. Emergency Rollback

If anything goes wrong during testing:

### Quick Rollback (No Code Changes)

**In Koyeb environment variables:**
```bash
USE_MONGODB_BIDDING=false
USE_MONGODB_AUCTIONEERING=false
USE_MONGODB_ATTENDANCE=false
```

**Restart bot** → All operations use Google Sheets immediately

**When to use:**
- MongoDB connection issues during auction
- Data inconsistency detected
- Circuit breaker constantly opening
- Sheet sync failures
- Any critical issue affecting bot functionality

**Verify rollback:**
Check logs for:
```
✅ Fetch pts: [Sheets API response]
✅ Submitted [Sheets API]
```

No `[MongoDB]` messages should appear.

---

## 10. Troubleshooting Common Issues

### Issue: Command aliases still using Google Sheets

**Symptoms**: Seeing Sheets logs instead of MongoDB logs

**Causes**:
1. Feature flag not set or set to `false`
2. Bot not restarted after setting environment variables
3. Circuit breaker is open (using fallback)

**Solutions**:
1. Verify environment variables in Koyeb:
   - `USE_MONGODB_BIDDING=true`
   - `USE_MONGODB_AUCTIONEERING=true`
   - `USE_MONGODB_ATTENDANCE=true`
2. Restart bot to apply changes
3. Check circuit breaker status in logs
4. Check admin-logs for MongoDB connection errors

---

### Issue: Response times still slow (>500ms)

**Symptoms**: Commands taking 500-2000ms instead of 10-50ms

**Causes**:
1. Bot is using Sheets (MongoDB not enabled)
2. MongoDB connection has high latency
3. Circuit breaker is open

**Solutions**:
1. Check logs for `[MongoDB]` prefix
2. Verify MongoDB Atlas region (should be Singapore)
3. Check circuit breaker status
4. Verify network connectivity between Koyeb and MongoDB

---

### Issue: Data inconsistency between MongoDB and Sheets

**Symptoms**: Points in bot don't match Google Sheets

**Causes**:
1. Sheet sync failed (check admin-logs)
2. Manual edits in Sheets not synced to MongoDB
3. Sync queue backed up

**Solutions**:
1. Check admin-logs for sync failures
2. Run sync script: `node scripts/sync-sheets-to-mongodb.js`
3. Verify sync queue is processing (check logs)
4. MongoDB is source of truth - Sheets will catch up via background sync

---

### Issue: Attendance not auto-updating MongoDB

**Symptoms**: Attendance records not appearing in MongoDB

**Causes**:
1. `USE_MONGODB_ATTENDANCE=false` or not set
2. MongoDB connection failure
3. Attendance auto-close not triggered

**Solutions**:
1. Verify `USE_MONGODB_ATTENDANCE=true` in Koyeb
2. Check logs for MongoDB connection errors
3. Verify attendance thread auto-closes correctly
4. Check circuit breaker status

---

## 11. Success Metrics

After completing all tests, you should observe:

### Performance Improvements
- ✅ **!mypoints**: 10-50ms (was 500-2000ms) - **40-200x faster**
- ✅ **!queuelist**: 10-50ms (was 500-2000ms) - **40-200x faster**
- ✅ **!leaderboard (bidding)**: 10-50ms (was 500-2000ms) - **40-200x faster**
- ✅ **!leaderboard (attendance)**: 10-50ms (was 500-2000ms) - **40-200x faster**
- ✅ **Auction session start**: 10-50ms (was 500-2000ms) - **40-200x faster**
- ✅ **Attendance submission**: 50-200ms (was 1000-3000ms) - **20-60x faster**

### Reliability Features Working
- ✅ **Circuit Breaker**: Opens after 5 failures, recovers after 60s
- ✅ **Retry Logic**: 10 attempts with exponential backoff
- ✅ **Admin Alerts**: Sent for all failures
- ✅ **Background Sync**: IMMEDIATE priority for critical operations
- ✅ **Automatic Failover**: Falls back to Sheets on MongoDB failure
- ✅ **Safe Rollback**: Can disable MongoDB via environment variables

### Data Integrity
- ✅ **Discord IDs Preserved**: Member IDs remain unchanged
- ✅ **Points Accurate**: MongoDB and Sheets in sync
- ✅ **Attendance Tracked**: All attendance records saved
- ✅ **Auction Items Current**: Queue matches Google Sheets

---

## 12. Reporting Issues

If you encounter issues during testing:

1. **Capture Logs**: Copy the relevant section from Koyeb logs
2. **Check Admin-Logs**: See if admin alerts were sent
3. **Note Response Times**: Check if commands are slow or fast
4. **Verify Environment Variables**: Double-check feature flags
5. **Test Rollback**: Verify you can quickly revert if needed

**What to Report:**
- Command used
- Expected behavior
- Actual behavior
- Relevant logs
- Response times
- Admin alerts (if any)

---

**Testing Guide Version**: 1.0
**Last Updated**: December 3, 2025
**Status**: Ready for Production Testing
