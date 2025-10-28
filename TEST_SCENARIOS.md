# ELYSIUM Bot - Comprehensive Test Scenarios

## ✅ Pre-Deployment Testing Checklist

Before merging to main, verify ALL scenarios pass.

---

## 1. 🏗️ Startup & Initialization

### Scenario 1.1: Fresh Start (No State)
**Steps:**
1. Clear all Google Sheets state (`_AttendanceState`, `_BotState`)
2. Start bot
3. Verify bot logs:
   - ✅ "Bot logged in as..."
   - ✅ "Attendance module initialized"
   - ✅ "Starting periodic state sync..."
   - ℹ️ "No saved attendance state found"

**Expected:** Bot starts cleanly with empty state

### Scenario 1.2: State Recovery from Google Sheets
**Steps:**
1. Manually add data to `_BotState` sheet
2. Start bot
3. Check logs for:
   - ✅ "Loaded state from Google Sheets"
   - ✅ "State recovered"

**Expected:** Bot restores previous state

### Scenario 1.3: Koyeb Container Restart
**Steps:**
1. Run bot, create active spawn
2. Simulate restart (kill process)
3. Restart bot
4. Verify state restored from Google Sheets

**Expected:** Active spawns and pending verifications restored

---

## 2. 👥 Attendance System

### Scenario 2.1: Basic Boss Spawn
**Steps:**
1. Send: `!spawn ego`
2. Verify thread created
3. Verify embed message with "React ✅ to confirm"

**Expected:** Thread created, reaction message posted

### Scenario 2.2: Member Check-in
**Steps:**
1. Create spawn thread
2. Member reacts with ✅
3. Verify confirmation embed
4. Member reacts ✅ again to confirm

**Expected:**
- Confirmation message appears
- After confirm: "✅ Verified!"
- Data sent to Google Sheets
- Column created in weekly sheet

### Scenario 2.3: Multiple Members Same Spawn
**Steps:**
1. Create spawn: `!spawn ego`
2. Have 5 different members check in
3. Admin closes spawn: `!close`
4. Verify Google Sheet has all 5 members

**Expected:** All members recorded correctly

### Scenario 2.4: Duplicate Check-in Prevention
**Steps:**
1. Member checks in for spawn
2. Confirms attendance
3. Tries to check in again

**Expected:** Message: "⚠️ You already checked in for this spawn."

### Scenario 2.5: Boss Name Fuzzy Matching
**Steps:**
1. Try: `!spawn viornet` (typo)
2. Try: `!spawn aquleus` (typo)
3. Try: `!spawn lady dalia`

**Expected:** All match correctly using Levenshtein distance

### Scenario 2.6: Admin Mass Close
**Steps:**
1. Create 3 spawn threads
2. Have members check in
3. Use: `!massclose 3`

**Expected:** All 3 threads close, all data submitted

### Scenario 2.7: State Persistence
**Steps:**
1. Create spawn, have member start check-in
2. Before confirmation, kill bot
3. Restart bot
4. Member completes confirmation

**Expected:** State recovered, confirmation completes

---

## 3. 💰 Bidding System

### Scenario 3.1: Simple Bid
**Steps:**
1. Admin adds item: `!auction Diamond Ring 1000 30`
2. Member bids: `!bid 1500`
3. Verify confirmation message
4. Member confirms with ✅

**Expected:**
- Bid registered
- Points locked
- Previous high bidder refunded

### Scenario 3.2: Bid with Insufficient Points
**Steps:**
1. Member with 1000pts tries: `!bid 2000`

**Expected:** Error: "❌ Insufficient points"

### Scenario 3.3: Outbid Scenario
**Steps:**
1. Member A bids 1000pts
2. Member B bids 1500pts
3. Verify Member A gets refund

**Expected:**
- Member A's 1000pts unlocked
- Member B's 1500pts locked

### Scenario 3.4: Auction Expiration
**Steps:**
1. Create auction with 1min duration
2. Place bid
3. Wait 1 minute
4. Verify winner announced

**Expected:**
- Going once/twice/sold messages
- Winner gets item
- Points deducted from winner
- Google Sheets updated

### Scenario 3.5: Auction Queue
**Steps:**
1. Add 5 items to queue
2. Use: `!queuelist`
3. Verify all 5 items shown

**Expected:** Queue displays correctly

### Scenario 3.6: Remove from Queue
**Steps:**
1. Add item: `!auction Shield 500 15`
2. Remove: `!removeitem Shield`

**Expected:** Item removed from queue

### Scenario 3.7: Points Cache
**Steps:**
1. Start auction
2. Wait 30 minutes
3. Check logs for cache refresh

**Expected:** "🔄 Auto-refreshing cache..."

---

## 4. 🔨 Auctioneering System

### Scenario 4.1: Start Auctioneering
**Steps:**
1. Add items to Google Sheet `BiddingItems`
2. Use: `!startauction`
3. Verify session starts

**Expected:**
- Points loaded
- Items fetched from sheet
- Preview message shown
- First item starts after 20s

### Scenario 4.2: Session-Based Bidding (Boss Attendance)
**Steps:**
1. Create boss spawn: `!spawn ego`
2. Members A, B, C check in
3. Add items to `BiddingItems` with boss "EGO 10/28/25 15:30"
4. Start auction
5. Only A, B, C can bid

**Expected:** Only attendees can bid, others get error

### Scenario 4.3: Manual Queue (Open to All)
**Steps:**
1. Add items to bot queue (not sheet)
2. Start auction
3. Anyone can bid on these items

**Expected:** All members can bid on manual items

### Scenario 4.4: Multiple Boss Sessions
**Steps:**
1. Add items for EGO, VIORENT, CLEMANTIS in sheet
2. Start auction
3. Verify 3 separate sessions

**Expected:**
- Session 1: EGO items (EGO attendees only)
- Session 2: VIORENT items (VIORENT attendees only)
- Session 3: CLEMANTIS items (CLEMANTIS attendees only)

### Scenario 4.5: Pause/Resume
**Steps:**
1. Start auction
2. Admin: `!pauseauction`
3. Wait 30 seconds
4. Admin: `!resumeauction`

**Expected:**
- Auction pauses
- Timer extended by pause duration
- Resumes correctly

### Scenario 4.6: Cancel Item
**Steps:**
1. During active auction
2. Admin: `!cancelitem`
3. Confirm with ✅

**Expected:**
- Item canceled
- Locked points refunded
- Next item starts

### Scenario 4.7: Force Finish
**Steps:**
1. During auction
2. Admin: `!stopitem`

**Expected:**
- Current item ends immediately
- Winner determined
- Next item starts

### Scenario 4.8: Batch Auction
**Steps:**
1. Add item with quantity 3 in sheet
2. Start auction
3. Have 5 members bid

**Expected:** Top 3 bidders win

### Scenario 4.9: Session Complete
**Steps:**
1. Complete full auction session
2. Verify final summary

**Expected:**
- All results logged to Google Sheets
- Points deducted from winners
- Manual items added to `BiddingItems`
- State cleared

---

## 5. 🔄 State Recovery & Persistence

### Scenario 5.1: Attendance State Sync
**Steps:**
1. Create spawns
2. Wait 5 minutes
3. Check `_AttendanceState` sheet

**Expected:** State synced to sheet

### Scenario 5.2: Bidding State Sync
**Steps:**
1. Add items to queue
2. Wait 5 minutes
3. Check `_BotState` sheet

**Expected:** Queue synced to sheet

### Scenario 5.3: Crash During Auction
**Steps:**
1. Start auction
2. Kill bot mid-auction
3. Restart
4. Verify auction recovers

**Expected:**
- Auction state restored
- Timers rescheduled
- Current item continues

### Scenario 5.4: Koyeb Memory Optimization
**Steps:**
1. Monitor bot memory usage
2. Run for 24 hours
3. Verify no memory leaks

**Expected:** Memory stays under 512MB

---

## 6. 🛡️ Edge Cases & Error Handling

### Scenario 6.1: Invalid Boss Name
**Steps:**
1. Try: `!spawn invalidboss`

**Expected:** Error: "❌ Boss not found"

### Scenario 6.2: Rate Limiting
**Steps:**
1. Send 10 commands in 1 second

**Expected:**
- Rate limit messages
- Retries with backoff
- Eventually succeeds

### Scenario 6.3: Google Sheets Unavailable
**Steps:**
1. Temporarily break webhook URL
2. Try to spawn boss

**Expected:**
- Error logged
- User-friendly error message
- Bot doesn't crash

### Scenario 6.4: Concurrent Bids
**Steps:**
1. Have 5 members bid simultaneously

**Expected:**
- Mutex lock prevents conflicts
- All bids processed sequentially
- No data corruption

### Scenario 6.5: Invalid Bid Amount
**Steps:**
1. Try: `!bid -100`
2. Try: `!bid abc`
3. Try: `!bid 0`

**Expected:** All rejected with clear errors

### Scenario 6.6: Thread Deletion During Check-in
**Steps:**
1. Member starts check-in
2. Admin deletes thread
3. Member tries to confirm

**Expected:** Graceful error, no crash

### Scenario 6.7: Network Failures
**Steps:**
1. Simulate network disconnect
2. Try various commands
3. Restore network

**Expected:**
- Commands retry
- State preserved
- User notified of delays

---

## 7. 🔐 Permissions & Security

### Scenario 7.1: Admin-Only Commands
**Steps:**
1. Regular member tries: `!startauction`
2. Regular member tries: `!clearqueue`

**Expected:** Error: "❌ Admin only"

### Scenario 7.2: Role-Based Access
**Steps:**
1. Verify only GUILD LEADER, ELITE, Admin can use admin commands

**Expected:** Permissions enforced

### Scenario 7.3: Channel Restrictions
**Steps:**
1. Try bidding in non-bidding channel
2. Try attendance in wrong channel

**Expected:** Commands only work in correct channels

---

## 8. 📊 Data Integrity

### Scenario 8.1: Sheet Column Creation
**Steps:**
1. Create spawn
2. Member checks in
3. Verify column in weekly sheet

**Expected:**
- Column format: "MM/DD/YY HH:MM"
- Boss name in row 2
- Member checkboxes in correct rows

### Scenario 8.2: Points Calculation
**Steps:**
1. Member wins 3 auctions (500pts, 1000pts, 1500pts)
2. Check `BiddingPoints` sheet

**Expected:** Total: 3000pts deducted

### Scenario 8.3: Weekly Sheet Rollover
**Steps:**
1. Wait for Sunday 12:00am Manila time
2. Create spawn

**Expected:** New week sheet created

### Scenario 8.4: Duplicate Column Prevention
**Steps:**
1. Spawn boss at exact same timestamp
2. Try to submit twice

**Expected:** Error: "Column already exists"

---

## 9. 🎨 User Experience

### Scenario 9.1: Help Command
**Steps:**
1. Use: `!help`
2. Use: `!help spawn`
3. Use: `!help bid`

**Expected:** Comprehensive help embeds

### Scenario 9.2: Status Commands
**Steps:**
1. Use: `!status`
2. Use: `!mystatus`
3. Use: `!mypoints`

**Expected:** Clear status information

### Scenario 9.3: Emoji Consistency
**Steps:**
1. Review all bot messages
2. Verify emojis match

**Expected:** Consistent emoji usage throughout

### Scenario 9.4: Command Aliases
**Steps:**
1. Try: `!b 1000` (alias for !bid)
2. Try: `!ql` (alias for !queuelist)
3. Try: `!st` (alias for !status)

**Expected:** All aliases work

---

## 10. 🚀 Performance & Scaling

### Scenario 10.1: High Volume
**Steps:**
1. Create 10 spawns simultaneously
2. Have 50 members check in

**Expected:**
- No crashes
- All data recorded
- Response time < 5s per operation

### Scenario 10.2: Large Auction
**Steps:**
1. Add 50 items to auction
2. Start auction
3. Monitor performance

**Expected:**
- Smooth transitions
- No timeouts
- Memory stable

### Scenario 10.3: Long-Running Session
**Steps:**
1. Run bot for 7 days
2. Monitor memory, CPU
3. Check for memory leaks

**Expected:**
- Memory under 512MB
- CPU under 50%
- No crashes

---

## 📋 Validation Checklist

Before merging, ensure:

- [ ] All 10 test categories pass
- [ ] No console errors
- [ ] Google Sheets data accurate
- [ ] State recovery works
- [ ] Memory usage acceptable
- [ ] Code.js auto-deploys
- [ ] All syntax validated
- [ ] Documentation updated
- [ ] Koyeb configuration correct
- [ ] Environment variables set

---

## 🐛 Known Issues (Document any found)

### Issue Template:
```
**Issue:** Brief description
**Severity:** Critical / Major / Minor
**Steps to reproduce:**
1. Step 1
2. Step 2
**Expected:** What should happen
**Actual:** What happens
**Fix:** How to fix (if known)
```

---

## 📝 Test Results Log

### Test Run: [DATE]
**Tester:** [NAME]
**Environment:** Development / Staging / Production
**Bot Version:** 6.0+

| Scenario | Result | Notes |
|----------|--------|-------|
| 1.1 | ✅ Pass | |
| 1.2 | ✅ Pass | |
| ... | | |

---

## 🔧 Manual Testing Commands

```bash
# Attendance
!spawn ego
!spawn viorent
!spawn clemantis
!close
!massclose 3
!status

# Bidding
!auction Diamond Ring 1000 30
!bid 1500
!queuelist
!removeitem Diamond Ring
!clearqueue
!mypoints

# Auctioneering
!startauction
!pauseauction
!resumeauction
!stopitem
!cancelitem
!extendauction 5

# Admin
!help
!status
!clearstate
```

---

**Last Updated:** 2025-10-28
**Status:** Ready for Testing
