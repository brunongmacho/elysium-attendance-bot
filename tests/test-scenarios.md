# Test Scenarios for v5.1 Bug Fixes

## Test Environment Setup
- Test on a development Discord server
- Have admin and non-admin test accounts ready
- Have at least 3 test users for attendance/bidding scenarios

---

## 1. !maintenance Command Tests

### Test 1.1: Basic Maintenance Spawn
**Steps:**
1. Go to admin logs channel
2. Run `!maintenance` command
3. Confirm with ✅ reaction

**Expected Results:**
- ✅ Confirmation embed appears with list of 22 bosses
- ✅ After confirmation, all 22 spawn threads are created
- ✅ Each thread is named with format: `[MM/DD/YY HH:MM] BossName`
- ✅ Each thread has spawn announcement with 5-minute warning
- ✅ Summary embed shows success count

**Pass/Fail:** _______

### Test 1.2: Maintenance Spawn Cancellation
**Steps:**
1. Run `!maintenance`
2. React with ❌ to cancel

**Expected Results:**
- ✅ No threads are created
- ✅ Cancellation message appears

**Pass/Fail:** _______

### Test 1.3: Alias Test
**Steps:**
1. Run `!maint` (alias)
2. Confirm

**Expected Results:**
- ✅ Works identically to `!maintenance`

**Pass/Fail:** _______

---

## 2. ArrayValidator Error Fix Tests

### Test 2.1: Session with Many Items
**Steps:**
1. Queue 15+ items across multiple bosses
2. Run `!startauction`
3. Let session complete fully

**Expected Results:**
- ✅ No ArrayValidator errors in console
- ✅ Session summary embed appears correctly
- ✅ Admin logs shows complete summary

**Pass/Fail:** _______

### Test 2.2: Session with Long Item Names
**Steps:**
1. Add items with very long names (50+ characters)
2. Complete auction session

**Expected Results:**
- ✅ Embed fields truncate properly (1024 char limit)
- ✅ No field validation errors
- ✅ Summary displays with "..." if truncated

**Pass/Fail:** _______

---

## 3. Bidding Thread Closure Tests

### Test 3.1: Single Item Thread Closure
**Steps:**
1. Start auction with 1 item
2. Place a winning bid
3. Wait for auction to end

**Expected Results:**
- ✅ Thread shows "🏁 Auction Ended" message
- ✅ Thread is automatically archived
- ✅ Thread appears in archived threads list

**Pass/Fail:** _______

### Test 3.2: Multiple Items Thread Closure
**Steps:**
1. Start auction with 3+ items
2. Let each item complete

**Expected Results:**
- ✅ Each item thread closes after its auction ends
- ✅ Next item starts in NEW thread (not old one)
- ✅ All completed threads are archived

**Pass/Fail:** _______

### Test 3.3: No Bids Thread Closure
**Steps:**
1. Start auction
2. Don't place any bids
3. Let timer expire

**Expected Results:**
- ✅ "NO BIDS" message appears
- ✅ Thread still gets archived
- ✅ Next item proceeds normally

**Pass/Fail:** _______

---

## 4. Message Reference Error Fix Tests

### Test 4.1: Deleted Message Bid Attempt
**Steps:**
1. Start an auction
2. User types `!bid 10`
3. User immediately deletes their message
4. System tries to reply

**Expected Results:**
- ✅ No "Unknown message" error in console
- ✅ Bot sends message to channel (not reply)
- ✅ Message includes user mention

**Pass/Fail:** _______

### Test 4.2: Rapid Message Deletion
**Steps:**
1. User sends multiple `!bid` commands rapidly
2. Delete all messages quickly

**Expected Results:**
- ✅ No crashes or unhandled errors
- ✅ Bot handles gracefully with channel messages

**Pass/Fail:** _______

---

## 5. !endauction Session Termination Tests

### Test 5.1: End Active Session
**Steps:**
1. Start auction with 5+ items
2. Complete 2 items
3. Run `!endauction` during 3rd item
4. Confirm with ✅

**Expected Results:**
- ✅ Current item auction stops immediately
- ✅ Current thread is archived
- ✅ All COMPLETED items (2) are submitted to sheets
- ✅ Remaining items (3) are NOT processed
- ✅ Session summary shows only completed items
- ✅ Bidding points tally displays

**Pass/Fail:** _______

### Test 5.2: End Empty Session
**Steps:**
1. Run `!endauction` when no auction is active

**Expected Results:**
- ✅ Error message: "No active auction to end"

**Pass/Fail:** _______

### Test 5.3: Cancellation Test
**Steps:**
1. Run `!endauction` during active auction
2. React with ❌ to cancel

**Expected Results:**
- ✅ Auction continues normally
- ✅ "End auction canceled" message appears

**Pass/Fail:** _______

---

## 6. Column Validation False Positive Tests

### Test 6.1: Old Spawns Don't Trigger Warnings
**Steps:**
1. Restart bot
2. Check console logs for validation sweep

**Expected Results:**
- ✅ "Columns without threads" only shows spawns from last 3 hours
- ✅ Old closed spawns are NOT reported as discrepancies
- ✅ Console shows reduced false positives

**Pass/Fail:** _______

### Test 6.2: Recent Spawns Still Detected
**Steps:**
1. Create a spawn thread manually
2. DON'T add it to sheets
3. Restart bot

**Expected Results:**
- ✅ Recent spawn (< 3 hours) appears in "threads without columns"
- ✅ Warning is logged correctly

**Pass/Fail:** _______

---

## 7. Bidding Points Tally Display Tests

### Test 7.1: Tally After Session
**Steps:**
1. Start auction with 3 items
2. Have 3 different users win items (10pts, 20pts, 30pts)
3. Complete session

**Expected Results:**
- ✅ Tally embed appears in bidding channel
- ✅ Shows all 3 winners sorted by spending (highest first)
- ✅ Shows correct point amounts
- ✅ Footer shows total: 60 pts spent
- ✅ Admin logs also shows summary

**Pass/Fail:** _______

### Test 7.2: No Winners Tally
**Steps:**
1. Start auction
2. No one bids
3. Complete session

**Expected Results:**
- ✅ Tally shows "No points were spent this session"
- ✅ OR tally is not displayed at all (both acceptable)

**Pass/Fail:** _______

### Test 7.3: Single Winner Tally
**Steps:**
1. One user wins all items (e.g., 50pts total)
2. Complete session

**Expected Results:**
- ✅ Tally shows single winner
- ✅ Correct total displayed

**Pass/Fail:** _______

---

## 8. Integration Tests

### Test 8.1: Full Workflow Test
**Steps:**
1. Run `!maintenance` to spawn bosses
2. Have users check in to spawns
3. Close spawn threads
4. Start auction with items from those bosses
5. Multiple users bid
6. Let session complete naturally
7. Verify sheets updates

**Expected Results:**
- ✅ All spawns created successfully
- ✅ Attendance recorded correctly
- ✅ Auction items load with attendance data
- ✅ Bidding respects attendance requirements
- ✅ Threads close after each item
- ✅ Tally displays correctly
- ✅ Points deducted in sheets

**Pass/Fail:** _______

### Test 8.2: Emergency Stop Workflow
**Steps:**
1. Start auction
2. Midway through, run `!endauction`
3. Verify partial submission
4. Check sheets for accuracy

**Expected Results:**
- ✅ Only completed items are in sheets
- ✅ Incomplete item is NOT in sheets
- ✅ Points correctly deducted for winners

**Pass/Fail:** _______

### Test 8.3: Error Recovery Test
**Steps:**
1. Start auction
2. Simulate network error (disconnect bot mid-auction)
3. Restart bot
4. Check state recovery

**Expected Results:**
- ✅ Bot recovers active state from sheets
- ✅ Threads are detected and recovered
- ✅ Pending items continue or are handled gracefully

**Pass/Fail:** _______

---

## 9. Performance and Optimization Tests

### Test 9.1: Large Session Performance
**Steps:**
1. Queue 30+ items
2. Monitor memory and CPU usage
3. Complete full session

**Expected Results:**
- ✅ Memory stays under 500MB
- ✅ No memory leaks
- ✅ Response time under 2 seconds per command

**Pass/Fail:** _______

### Test 9.2: Concurrent Operations
**Steps:**
1. Multiple admins running commands simultaneously
2. Users bidding in multiple threads at once

**Expected Results:**
- ✅ No race conditions
- ✅ State remains consistent
- ✅ All operations complete successfully

**Pass/Fail:** _______

---

## Test Summary

**Total Tests:** 28
**Passed:** _____
**Failed:** _____
**Skipped:** _____

**Critical Issues Found:**
- [ ] None
- [ ] List any critical issues here

**Notes:**
_Add any additional observations or issues discovered during testing_

---

## Regression Tests

Run these after any future changes to ensure no regressions:

- [ ] All maintenance bosses spawn correctly
- [ ] Auction sessions complete without errors
- [ ] Threads close automatically
- [ ] Tally always displays
- [ ] !endauction stops entire session
- [ ] No false positive validation warnings
- [ ] Message deletion doesn't cause crashes
