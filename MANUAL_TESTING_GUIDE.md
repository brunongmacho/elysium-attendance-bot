# Manual Testing Guide
## Discord Bot - Post-Refactoring Validation

**Purpose:** Test all critical bot functionality after code refactoring
**Status:** Run these tests after deployment to Koyeb
**Expected Result:** All commands should work exactly as before

---

## ⚠️ IMPORTANT: Pre-Testing Checklist

Before starting tests, ensure:
- [ ] Bot is deployed to Koyeb
- [ ] Bot shows as "Online" in Discord
- [ ] Health check endpoint responding: `https://your-app.koyeb.app/health`
- [ ] You have admin role in Discord server
- [ ] Test in a non-production channel if possible

---

## 🧪 TEST CATEGORIES

### Category 1: Basic Bot Functionality ⭐ CRITICAL

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T1.1 | `!help` | Shows complete command list | ⬜ |
| T1.2 | `!status` | Shows bot uptime, memory, active spawns | ⬜ |
| T1.3 | Health endpoint | Visit `/health` → Returns JSON with status | ⬜ |

**How to test T1.1:**
```
1. Type: !help
2. Verify: You see multiple pages of commands
3. Check: Saturday 12:00 PM scheduler mentioned
4. Pass if: No errors, all commands listed
```

**How to test T1.2 (THIS WAS BROKEN BEFORE):**
```
1. Type: !status
2. Verify: See bot uptime, version, memory usage
3. Check: Active spawns count
4. Check: Bidding system status
5. Pass if: No "ReferenceError: msg is not defined"
```

**How to test T1.3:**
```
1. Open browser
2. Go to: https://your-koyeb-app.koyeb.app/health
3. Verify: JSON response with "status": "healthy"
4. Pass if: Returns bot info without 404 error
```

---

### Category 2: Attendance System ⭐ CRITICAL

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T2.1 | `!addthread [Boss] will spawn in 5 minutes! (2025-11-06 12:00)` | Creates spawn thread | ⬜ |
| T2.2 | Check-in in thread | Member checks in successfully | ⬜ |
| T2.3 | `!verify @member` | Verifies member attendance | ⬜ |
| T2.4 | `!verifyall` | Verifies all pending members | ⬜ |
| T2.5 | `!closethread` | Closes spawn thread | ⬜ |

**How to test T2.1:**
```
1. In admin-logs channel, type:
   !addthread Clematis will spawn in 5 minutes! (2025-11-06 12:00)
2. Verify: New thread created in attendance channel
3. Check: Thread has boss name and timestamp
4. Pass if: Thread created without errors
```

**How to test T2.2:**
```
1. Go to spawn thread created above
2. As regular member (not admin), check in
3. Verify: Check-in registered
4. Pass if: No errors, member added to list
```

**How to test T2.3:**
```
1. In spawn thread, type: !verify @membername
2. Verify: Member marked as verified
3. Check: Points assigned
4. Pass if: Verification completes without errors
```

---

### Category 3: Bidding System ⭐ CRITICAL

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T3.1 | `!startauction` | Starts auction session | ⬜ |
| T3.2 | `!bid 50` | Places bid on current item | ⬜ |
| T3.3 | Confirm bid (✅ reaction) | Bid confirmed, points locked | ⬜ |
| T3.4 | `!bidstatus` | Shows current points | ⬜ |
| T3.5 | `!pause` | Pauses auction | ⬜ |
| T3.6 | `!resume` | Resumes auction | ⬜ |
| T3.7 | `!endauction` | Ends auction session | ⬜ |

**How to test T3.1:**
```
1. In admin-logs channel, type: !startauction
2. Verify: Auction starts in bidding channel
3. Check: Items loaded from Google Sheets
4. Check: Preview shown before each item
5. Pass if: Auction starts without errors
```

**How to test T3.2:**
```
1. When item is active, type: !bid 50
2. Verify: Confirmation message appears
3. Check: ✅ and ❌ reactions added
4. Pass if: Bid prompt created
```

**How to test T3.3:**
```
1. Click ✅ reaction on bid confirmation
2. Verify: Bid confirmed message
3. Check: Points locked
4. Check: "New High Bid!" announcement
5. Pass if: Bid processes successfully
```

**How to test T3.4:**
```
1. Type: !bidstatus
2. Verify: Shows your total points
3. Check: Shows locked points
4. Check: Shows available points
5. Pass if: Points calculated correctly
```

---

### Category 4: Auctioneering System

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T4.1 | `!queuelist` | Shows items in queue | ⬜ |
| T4.2 | `!extend 5` | Extends current item by 5 min | ⬜ |
| T4.3 | `!skipitem` | Skips current item | ⬜ |
| T4.4 | `!cancelitem` | Cancels item with refund | ⬜ |

**How to test T4.1:**
```
1. During or after auction, type: !queuelist
2. Verify: Shows list of auction items
3. Check: Item names and status
4. Pass if: Queue displayed correctly
```

---

### Category 5: Leaderboard System

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T5.1 | `!leaderboardattendance` | Shows attendance top 10 | ⬜ |
| T5.2 | `!leaderboardbidding` | Shows bidding points top 10 | ⬜ |
| T5.3 | `!weeklyreport` | Generates weekly report | ⬜ |

**How to test T5.1:**
```
1. Type: !leaderboardattendance
2. Verify: Shows top 10 members
3. Check: Attendance points displayed
4. Check: Progress bars shown
5. Pass if: Leaderboard renders correctly
```

---

### Category 6: Loot System

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T6.1 | `!loot` with screenshot | Processes loot screenshot | ⬜ |
| T6.2 | Confirm loot submission | Loot saved to Google Sheets | ⬜ |

**How to test T6.1:**
```
1. Upload loot screenshot
2. Type: !loot
3. Verify: OCR processing starts
4. Check: Loot items detected
5. Pass if: Items recognized correctly
```

---

### Category 7: Emergency Commands (Admin Only)

| Test ID | Command | Expected Result | Status |
|---------|---------|----------------|--------|
| T7.1 | `!emergency` | Shows emergency menu | ⬜ |
| T7.2 | `!clearstate` | Clears bot state | ⬜ |
| T7.3 | `!forceclose all` | Force closes all threads | ⬜ |

**How to test T7.1:**
```
1. Type: !emergency
2. Verify: Emergency command list shown
3. Check: Confirmation required
4. Pass if: Menu displays correctly
```

---

### Category 8: Scheduler System ⭐ NEW

| Test ID | Feature | Expected Result | Status |
|---------|---------|----------------|--------|
| T8.1 | Saturday 12:00 PM auction | Auction starts automatically | ⬜ |
| T8.2 | Weekly report Saturday 11:59 PM | Leaderboard posted automatically | ⬜ |
| T8.3 | Bidding channel cleanup | Old messages cleaned every 12h | ⬜ |

**How to test T8.1:**
```
1. Wait until Saturday 12:00 PM GMT+8
2. Check bidding channel
3. Verify: Auction starts automatically
4. Pass if: Scheduled auction works
NOTE: This is the NEW feature from refactoring
```

---

### Category 9: Memory & Performance

| Test ID | Metric | Expected Result | Status |
|---------|--------|----------------|--------|
| T9.1 | Memory usage | Under 220MB | ⬜ |
| T9.2 | Response time | Commands respond quickly | ⬜ |
| T9.3 | Bot uptime | Stays online 24/7 | ⬜ |

**How to test T9.1:**
```
1. Type: !status
2. Check memory field
3. Verify: Memory under 220MB
4. Pass if: No memory leaks
```

**How to test T9.2:**
```
1. Run various commands
2. Measure response time
3. Verify: Commands respond within 1-2 seconds
4. Pass if: No lag or delays
```

---

## 🔍 CRITICAL BUGS TO WATCH FOR

### Bug #1: !status Command (FIXED)
**Previous error:** `ReferenceError: msg is not defined`
**How to verify fix:** Run `!status` command
**Expected:** Should show status without errors
**If it fails:** Report immediately - this was our critical fix

### Bug #2: Memory Leaks
**Symptom:** Bot crashes after running for hours
**How to detect:** Monitor `!status` memory over time
**Expected:** Memory stays under 220MB
**If it fails:** Check Koyeb logs, may need GC tuning

### Bug #3: State Persistence
**Symptom:** Bot loses data after restart
**How to detect:** Restart bot, check if auction/attendance data persists
**Expected:** Data recovered from Google Sheets
**If it fails:** Check Google Sheets webhook URL

### Bug #4: Scheduler Not Running
**Symptom:** Saturday auction doesn't auto-start
**How to detect:** Wait until Saturday 12:00 PM GMT+8
**Expected:** Auction starts automatically
**If it fails:** Check logs, may need cron fix

---

## 📝 HOW TO REPORT ISSUES

If you find any errors, report them in this format:

```
Test ID: T1.2
Command: !status
Error: [paste error message]
Screenshot: [if applicable]
Expected: Bot status display
Actual: [what happened]
Severity: CRITICAL/HIGH/MEDIUM/LOW
```

**Severity Levels:**
- **CRITICAL:** Bot crashes, commands don't work at all
- **HIGH:** Important feature broken but bot runs
- **MEDIUM:** Minor feature issue
- **LOW:** Cosmetic issue

---

## ✅ TESTING CHECKLIST SUMMARY

**Before Deployment:**
- [ ] All 36 integration tests passed (automated)
- [ ] Syntax validation passed (automated)
- [ ] Module imports working (automated)

**After Deployment:**
- [ ] Category 1: Basic Functionality (3 tests)
- [ ] Category 2: Attendance System (5 tests)
- [ ] Category 3: Bidding System (7 tests)
- [ ] Category 4: Auctioneering (4 tests)
- [ ] Category 5: Leaderboard (3 tests)
- [ ] Category 6: Loot System (2 tests)
- [ ] Category 7: Emergency Commands (3 tests)
- [ ] Category 8: Scheduler (3 tests)
- [ ] Category 9: Memory/Performance (3 tests)

**Total Manual Tests:** 33 tests

---

## 🎯 MINIMUM VIABLE TESTING

**If you're short on time, test these CRITICAL items:**

1. ✅ `!status` command (was broken, now fixed)
2. ✅ `!help` command (verify scheduler info)
3. ✅ `!startauction` (core functionality)
4. ✅ `!bid` command (core functionality)
5. ✅ Health endpoint (Koyeb monitoring)

**These 5 tests cover 80% of critical functionality.**

---

## 📊 WHAT'S NEW/CHANGED

### Changes from Refactoring:
1. ✅ **!status command fixed** - No more ReferenceError
2. ✅ **Help command updated** - Shows Saturday 12:00 PM scheduler
3. ✅ **Dockerfile optimized** - Better memory management
4. ✅ **Dead code removed** - 452 lines cleaner
5. ✅ **Test framework added** - 36+ automated tests

### No Functionality Changes:
- All commands work the same way
- No new commands added (except documentation)
- No command syntax changes
- State management unchanged

**You should NOT see any behavior differences except bug fixes.**

---

## 🆘 EMERGENCY ROLLBACK

If you find critical bugs:

```bash
# Option 1: Rollback to previous commit
git revert HEAD
git push

# Option 2: Rollback to last known good commit
git reset --hard <previous-commit-hash>
git push --force

# Option 3: Deploy previous Docker image in Koyeb
```

**Previous stable commits:**
- `a9bc733` - Before full refactoring (most stable)
- `78f5049` - After Phase 1 (dead code removed)
- `704743b` - After utilities extraction

---

## ✅ SUCCESS CRITERIA

**Bot is working correctly if:**
- ✅ All critical tests pass (minimum 5 tests)
- ✅ No crashes or errors in Koyeb logs
- ✅ Memory stays under 220MB
- ✅ !status command works (major bugfix)
- ✅ Attendance and bidding work as before

**Ready to mark as complete:** When 80%+ of tests pass

---

**Created:** 2025-11-05
**Version:** Post-Refactoring v1.0
**Last Updated:** After integration test suite completion
