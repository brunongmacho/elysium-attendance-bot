# Phase 4.5 Testing Checklist
# Attendance & Boss Rotation MongoDB Integration

**Last Updated**: Dec 4, 2025
**Phase**: 4.5 - Attendance & Rotation MongoDB
**Status**: Ready for Testing

---

## 📋 Pre-Deployment Checklist

### Environment Setup

- [ ] **MongoDB Connection**
  - [ ] Verify `MONGODB_URI` is set in environment variables
  - [ ] Test MongoDB connection: `node -e "require('./utils/database-api').connect().then(() => console.log('✅ Connected'))"`
  - [ ] Check MongoDB Atlas shows the database

- [ ] **Feature Flags**
  - [ ] Verify `USE_MONGODB_ATTENDANCE=true` in environment
  - [ ] Verify `USE_MONGODB_BIDDING=true` in environment
  - [ ] Check `.env.example` is updated

- [ ] **Google Sheets**
  - [ ] Verify `getAllWeeklyAttendance` endpoint exists in Code.js
  - [ ] Test webhook URL is updated in config.json
  - [ ] Check Google Apps Script is deployed as web app

### Initial Data Import

- [ ] **Historical Attendance Import**
  - [ ] Run: `node scripts/sync-sheets-to-mongodb.js --attendance`
  - [ ] Verify ~14,363 records imported
  - [ ] Run: `node scripts/verify-attendance-import.js`
  - [ ] Check output shows:
    - [ ] ✅ Total attendance records: ~14,363
    - [ ] ✅ Records distributed across 8 weekly sheets
    - [ ] ✅ Top bosses and members displayed
    - [ ] ✅ Date range shows historical data

- [ ] **Boss Rotation Sync**
  - [ ] Run `!rotation refresh` command in Discord
  - [ ] Verify output shows all 3 rotating bosses:
    - [ ] Amentis
    - [ ] General Aquleus
    - [ ] Baron Braudmore
  - [ ] Check MongoDB Atlas `bossRotation` collection has 3 documents

---

## 🧪 Functional Testing

### 1. !stats Command Testing

#### Test Case 1.1: Basic Stats Query
- [ ] Run `!stats @YourDiscordName` (replace with real member)
- [ ] Verify response shows:
  - [ ] ✅ Member name (with lore if available)
  - [ ] ✅ Total attendance count
  - [ ] ✅ Attendance points
  - [ ] ✅ Attendance rate %
  - [ ] ✅ Current streak
  - [ ] ✅ Recent bosses (last 5 with points)
  - [ ] ✅ Favorite boss name and count
  - [ ] ✅ Bidding points (left, consumed, rate)
  - [ ] ✅ Ranking (e.g., "#5 of 50")
- [ ] Verify response time < 100ms (check console logs)
- [ ] Verify console shows: `✅ [MongoDB] Stats fetched`

#### Test Case 1.2: Fuzzy Name Matching
- [ ] Run `!stats bruno` (partial name)
- [ ] Verify finds member with username "brunongmacho"
- [ ] Run `!stats BRUNO` (case insensitive)
- [ ] Verify same result

#### Test Case 1.3: Member Not Found
- [ ] Run `!stats NonExistentMember12345`
- [ ] Verify error message: "Member not found"

#### Test Case 1.4: MongoDB Fallback
- [ ] Temporarily stop MongoDB (or block connection)
- [ ] Run `!stats @Member`
- [ ] Verify console shows: `❌ [MongoDB] Stats fetch failed, falling back to Sheets`
- [ ] Verify command still works (uses Google Sheets)
- [ ] Restore MongoDB connection

### 2. Boss Rotation Testing

#### Test Case 2.1: !rotation status
- [ ] Run `!rotation` or `!rotation status`
- [ ] Verify displays all rotating bosses:
  - [ ] Shows current guild index (1-5)
  - [ ] Shows current guild name
  - [ ] Shows 🟢 if ELYSIUM's turn, 🔴 if not
  - [ ] Shows next guild
  - [ ] Shows next spawn time (if available)
- [ ] Verify response time < 100ms
- [ ] Verify console shows: `✅ [MongoDB] Fetched <boss> rotation`

#### Test Case 2.2: !rotation refresh
- [ ] Run `!rotation refresh`
- [ ] Verify output shows "✅ Rotation Data Refreshed"
- [ ] Verify shows all 3 bosses with current status
- [ ] Verify console shows: `✅ Rotation cache refreshed: 3 bosses synced to MongoDB`
- [ ] Check MongoDB Atlas `bossRotation` collection updated (lastUpdated timestamp)

#### Test Case 2.3: !rotation set
- [ ] Note current rotation for Amentis
- [ ] Run `!rotation set Amentis 3`
- [ ] Verify success message shows index changed
- [ ] Verify Google Sheets updated (check BossRotation sheet)
- [ ] Verify MongoDB updated (check Atlas)
- [ ] Run `!rotation` to confirm new index
- [ ] Restore to original index: `!rotation set Amentis 1` (if needed)

#### Test Case 2.4: !rotation increment
- [ ] Note current rotation for General Aquleus
- [ ] Run `!rotation increment General Aquleus`
- [ ] Verify rotation advanced by 1
- [ ] Verify both Google Sheets and MongoDB updated
- [ ] Check console for: `✅ [MongoDB] Synced General Aquleus rotation to MongoDB`

#### Test Case 2.5: MongoDB Fallback
- [ ] Temporarily block MongoDB connection
- [ ] Run `!rotation`
- [ ] Verify console shows: `⚠️ [MongoDB] <boss> rotation not in MongoDB, fetching from Google Sheets...`
- [ ] Verify command still works (uses Google Sheets)
- [ ] Restore MongoDB connection

### 3. Attendance Thread Testing

#### Test Case 3.1: Create Attendance Thread
- [ ] Create a test boss spawn thread (use !attend or trigger spawn)
- [ ] Add at least 3 members to attendance
- [ ] Note the boss name and members

#### Test Case 3.2: Close Thread (Parallel Save)
- [ ] Close the attendance thread (!closeall or auto-close)
- [ ] Verify success message appears
- [ ] Check console for:
  - [ ] `✅ [MongoDB] Added attendance for <member>`
  - [ ] `⚡ Parallel save completed in <ms>ms`
  - [ ] Both MongoDB and Sheets saves logged
- [ ] Verify Google Sheets updated (check weekly sheet)
- [ ] Verify MongoDB updated:
  - [ ] Check `attendance` collection has new records
  - [ ] Check `members` collection points updated

#### Test Case 3.3: Rotation Auto-Increment
- [ ] If boss was rotating (Amentis, General Aquleus, Baron Braudmore):
  - [ ] Verify rotation incremented automatically
  - [ ] Check console: `✅ <Boss> rotation: <old> → <new>`
  - [ ] Verify both Google Sheets and MongoDB updated
  - [ ] Run `!rotation` to confirm new index

#### Test Case 3.4: !stats After Attendance
- [ ] Run `!stats @member` for a member who just attended
- [ ] Verify attendance count increased by 1
- [ ] Verify points increased (check boss points value)
- [ ] Verify boss appears in "recent bosses"

### 4. Performance Testing

#### Test Case 4.1: Response Time Benchmarks
- [ ] Run `!stats @member` 5 times
- [ ] Check console for response times
- [ ] Verify all < 100ms
- [ ] Calculate average response time

- [ ] Run `!rotation` 5 times
- [ ] Check console for response times
- [ ] Verify all < 100ms
- [ ] Calculate average response time

- [ ] Run `!mypoints` 5 times
- [ ] Check console for response times
- [ ] Verify all < 100ms
- [ ] Calculate average response time

#### Test Case 4.2: Concurrent Operations
- [ ] Have multiple users run commands simultaneously:
  - [ ] 3 users run `!stats` at the same time
  - [ ] 2 users run `!mypoints` at the same time
  - [ ] 1 user runs `!rotation`
- [ ] Verify all commands complete successfully
- [ ] Verify no deadlocks or errors

### 5. Data Consistency Testing

#### Test Case 5.1: MongoDB vs Google Sheets Comparison
- [ ] Pick a random member
- [ ] Run `!stats @member` (MongoDB)
- [ ] Manually check Google Sheets for same member:
  - [ ] Check TOTAL ATTENDANCE sheet for attendance count
  - [ ] Check BiddingPoints sheet for points
  - [ ] Compare values - should match
- [ ] Repeat for 3 different members

#### Test Case 5.2: Rotation Consistency
- [ ] Run `!rotation`
- [ ] Note rotation index for all bosses
- [ ] Check Google Sheets BossRotation sheet
- [ ] Verify indexes match
- [ ] Check MongoDB Atlas `bossRotation` collection
- [ ] Verify indexes match
- [ ] All three sources should have identical data

### 6. Error Handling & Fallback Testing

#### Test Case 6.1: MongoDB Unavailable
- [ ] Temporarily stop MongoDB (block connection in firewall/env)
- [ ] Run `!stats @member`
- [ ] Verify falls back to Google Sheets successfully
- [ ] Verify warning logged: `❌ [MongoDB] Stats fetch failed`
- [ ] Run `!rotation`
- [ ] Verify falls back to Google Sheets successfully
- [ ] Restore MongoDB connection

#### Test Case 6.2: Google Sheets Unavailable
- [ ] Temporarily make Google Sheets inaccessible (change webhook URL to invalid)
- [ ] Run `!stats @member`
- [ ] Verify still works (uses MongoDB)
- [ ] Close an attendance thread
- [ ] Verify MongoDB save succeeds even if Sheets fails
- [ ] Check console: `⚠️ [Sheets] Save failed` but `✅ [MongoDB] Save succeeded`
- [ ] Restore correct webhook URL

#### Test Case 6.3: Invalid Input Handling
- [ ] Run `!stats` (no member specified)
- [ ] Verify appropriate error message
- [ ] Run `!rotation set InvalidBoss 3`
- [ ] Verify error: "Unknown boss" or "Not a rotating boss"
- [ ] Run `!rotation set Amentis 999`
- [ ] Verify error: "Index must be between 1 and 5"

---

## 🔍 Data Verification

### Verify Historical Data

- [ ] **Attendance Count**
  - [ ] Run: `node scripts/verify-attendance-import.js`
  - [ ] Verify shows ~14,363 total records
  - [ ] Verify records from all 8 weekly sheets

- [ ] **Member Stats Accuracy**
  - [ ] Pick top member from verification output
  - [ ] Run `!stats @TopMember`
  - [ ] Manually count their attendance in Google Sheets
  - [ ] Compare counts - should match

- [ ] **Boss Distribution**
  - [ ] Check verification output for boss attendance counts
  - [ ] Cross-reference with Google Sheets
  - [ ] Verify distribution matches

### Verify New Data

- [ ] **After Test Attendance Submission**
  - [ ] Check MongoDB Atlas `attendance` collection
  - [ ] Filter by recent timestamps
  - [ ] Verify new records exist
  - [ ] Verify fields are correct:
    - [ ] `memberId`, `memberName`
    - [ ] `bossName`, `bossPoints`
    - [ ] `timestamp`, `weekLabel`
    - [ ] `verified: true`

- [ ] **Member Points Updated**
  - [ ] Check MongoDB Atlas `members` collection
  - [ ] Find member who just attended
  - [ ] Verify `pointsAvailable` increased
  - [ ] Verify `pointsEarned` increased
  - [ ] Verify `attendance.total` increased

---

## 🚨 Edge Cases & Stress Testing

### Edge Case 1: New Member (No MongoDB Record)
- [ ] Create attendance with member not in MongoDB
- [ ] Verify member auto-created with temp ID
- [ ] Verify attendance recorded correctly
- [ ] Run `!stats @NewMember`
- [ ] Verify shows their stats

### Edge Case 2: Duplicate Attendance Prevention
- [ ] Try to close same attendance thread twice
- [ ] Verify duplicate prevention works
- [ ] Check MongoDB - only one set of records

### Edge Case 3: Large Member List
- [ ] Create attendance with 20+ members
- [ ] Verify parallel save completes successfully
- [ ] Verify all members saved to MongoDB
- [ ] Check response time is still reasonable

### Edge Case 4: Rotation Boundary (Index 5 → 1)
- [ ] Set rotation to index 5: `!rotation set Amentis 5`
- [ ] Increment: `!rotation increment Amentis`
- [ ] Verify loops back to index 1
- [ ] Verify Guild 1 shown

### Stress Test: Multiple Simultaneous Attendance Closes
- [ ] Create 3 attendance threads simultaneously
- [ ] Close all 3 at the same time
- [ ] Verify all saves complete successfully
- [ ] Verify no data loss or corruption
- [ ] Check MongoDB for all records

---

## 📊 Monitoring & Logging

### Console Logs to Monitor

**MongoDB Logs:**
```
✅ [MongoDB] Stats fetched for <member>
✅ [MongoDB] Fetched <boss> rotation
✅ [MongoDB] Added attendance for <member>
✅ [MongoDB] Synced <boss> rotation to MongoDB
⚠️ [MongoDB] <operation> failed, falling back to Sheets
```

**Performance Logs:**
```
⚡ Parallel save completed in <ms>ms
✅ [MongoDB] Fetched <count> members for !mypoints in <ms>ms
```

**Rotation Logs:**
```
🔄 Refreshing rotation cache from Google Sheets...
✅ Rotation cache refreshed: <count> bosses synced to MongoDB
🔄 Incrementing rotation for <boss>...
✅ <Boss> rotation: <old> → <new>
```

### MongoDB Atlas Monitoring

- [ ] Check MongoDB Atlas Metrics:
  - [ ] Connection count
  - [ ] Operation rate
  - [ ] Query performance
  - [ ] Storage size

- [ ] Verify Collections:
  - [ ] `attendance` - ~14,363+ records
  - [ ] `members` - ~50-60 records
  - [ ] `bossRotation` - 3 records
  - [ ] `auctionItems` - varies
  - [ ] `botState` - varies

---

## ✅ Final Checklist

### Pre-Deployment

- [ ] All functional tests passed
- [ ] All performance benchmarks met
- [ ] MongoDB and Google Sheets data consistent
- [ ] Fallback mechanisms tested and working
- [ ] Error handling tested
- [ ] Edge cases handled correctly

### Documentation

- [ ] MIGRATION_PROGRESS.md updated
- [ ] Testing checklist completed
- [ ] Help system updated
- [ ] README updated (if needed)

### Deployment

- [ ] Environment variables set in Koyeb
- [ ] Code deployed to production
- [ ] Historical attendance imported
- [ ] Boss rotation synced
- [ ] Commands tested in production
- [ ] Performance monitored for 24 hours

### Post-Deployment Monitoring

- [ ] Monitor Discord for user feedback
- [ ] Monitor MongoDB Atlas metrics
- [ ] Monitor console logs for errors
- [ ] Check response times remain fast
- [ ] Verify no data inconsistencies

---

## 📝 Test Results Template

**Date**: ___________
**Tester**: ___________
**Environment**: [ ] Dev [ ] Production

| Test Case | Status | Notes | Response Time |
|-----------|--------|-------|---------------|
| !stats basic | ⬜ | | |
| !stats fuzzy match | ⬜ | | |
| !rotation status | ⬜ | | |
| !rotation refresh | ⬜ | | |
| !rotation set | ⬜ | | |
| Attendance close | ⬜ | | |
| Parallel save | ⬜ | | |
| Rotation auto-increment | ⬜ | | |
| MongoDB fallback | ⬜ | | |
| Sheets fallback | ⬜ | | |
| Performance benchmarks | ⬜ | | |
| Data consistency | ⬜ | | |

**Overall Status**: [ ] ✅ All Tests Passed [ ] ⚠️ Issues Found [ ] ❌ Critical Failures

**Issues Found**:
1. _________________
2. _________________
3. _________________

**Notes**:
_________________________________________________________________________________
_________________________________________________________________________________
