# ELYSIUM Auction System - Admin Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Recent Changes](#recent-changes)
3. [Admin Commands](#admin-commands)
4. [Troubleshooting](#troubleshooting)
5. [Best Practices](#best-practices)
6. [Emergency Procedures](#emergency-procedures)

---

## 🎯 System Overview

The ELYSIUM auction system consists of two main modules:

### **Auctioneering Module** (`auctioneering.js`)
- Manages session flow and item progression
- Handles Google Sheets integration
- Controls auction timing and finalization
- **All items must come from Google Sheets**

### **Bidding Module** (`bidding.js`)
- Processes individual bids
- Manages points locking/unlocking
- Handles bid confirmations
- Maintains auction state

---

## 🆕 Recent Changes (v9.0)

### ❌ Manual Queue Removed
**IMPORTANT:** The manual queue system has been completely removed.

**What This Means:**
- ❌ `!auction <item> <price> <duration>` - **REMOVED**
- ❌ `!removeitem <name>` - **REMOVED**
- ❌ `!clearqueue` - **REMOVED**
- ✅ All items must now be added to **Google Sheets BiddingItems tab**

**Why This Change:**
- ✅ Better data consistency
- ✅ Centralized item management
- ✅ Automated boss association
- ✅ No conflicts between manual and sheet items
- ✅ Easier auditing and recovery

### 🔄 Max Extensions Increased
- **Old:** 15 extensions max (15 minutes)
- **New:** 60 extensions max (60 minutes)
- **Reason:** Prevents bid sniping for high-value items

### ✨ New Admin Commands
Four powerful new commands for auction management:
1. `!auctionaudit` - System health check
2. `!fixlockedpoints` - Clear stuck points
3. `!recoverauction` - Recover from crashes
4. `!resetauction` - Nuclear reset option

---

## 🛠️ Admin Commands

### Core Auction Commands

#### `!startauction`
**Purpose:** Start auction from Google Sheets items
**Location:** Bidding channel
**Permissions:** Admin only

**How It Works:**
1. Fetches items from **BiddingItems** sheet
2. Filters out items that already have winners
3. Shows preview of all items
4. Starts 30-second countdown
5. Begins auction sequentially

**Example:**
```
Admin: !startauction

Bot: 🔥 Auctioneering Started! (12 items)
   1. Dragon Sword - 500pts (5m)
   2. Shield of Protection - 300pts (3m)
   ...

   ✅ No attendance required - All ELYSIUM members can bid!

   Starting first item in 30s...
```

**Troubleshooting:**
- ❌ "No available items" → All items have winners, clear Winner column in sheet
- ❌ "Failed to load items" → Check Google Sheets webhook URL
- ❌ "Auction already running" → Use `!endauction` first

---

#### `!endauction`
**Purpose:** Force end the entire auction session
**Location:** Bidding channel
**Permissions:** Admin only

**When To Use:**
- Emergency stop needed
- Auction is stuck
- Need to cancel session

**What It Does:**
1. Stops all active timers
2. Marks current item as cancelled
3. Finalizes session (submits completed items)
4. Clears auction state

**Warning:** This will end ALL remaining items, not just the current one.

---

#### `!stop`
**Purpose:** End current item early
**Location:** Any auction thread or bidding channel
**Permissions:** Admin only

**What It Does:**
- Ends current item immediately
- Announces winner if there are bids
- Moves to next item automatically

---

#### `!pause` / `!resume`
**Purpose:** Pause/resume current auction
**Location:** Bidding channel
**Permissions:** Admin only

**Use Cases:**
- Technical issues
- Need to make announcement
- Discord lag

**How It Works:**
- Stores remaining time
- Clears all timers
- Resume adds remaining time back

---

#### `!extend <minutes>`
**Purpose:** Manually extend current auction
**Location:** Bidding channel
**Permissions:** Admin only

**Example:**
```
Admin: !extend 5
Bot: ⏱️ Extended by 5m
```

---

### Diagnostic Commands

#### `!auctionaudit` ⭐ NEW
**Purpose:** Comprehensive system health check
**Location:** Anywhere
**Permissions:** Admin only

**What It Shows:**

```
📊 Auction System Audit

🔹 Bidding Module
**Active Auction:** Dragon Sword
**Locked Points:** 3 members (1500pts total)
**Pending Confirmations:** 2
**History:** 5 items
**Cache:** 45 members
**Paused:** No

🔹 Auctioneering Module
**Active:** Yes
**Current Item:** Dragon Sword
**Session Items:** 12
**Current Index:** 6
**Paused:** No

⏱️ Active Timers
**Bidding Module:** 3 timer(s)
**Auctioneering Module:** 5 timer(s)

✅ Health Status
All systems operational
```

**Health Checks Performed:**
- ✅ Module synchronization
- ✅ Locked points without active auction
- ✅ High pending confirmations (memory leak)
- ✅ Timer counts

**When To Use:**
- Before starting auction (sanity check)
- Auction seems slow or stuck
- After recovery operations
- Weekly health check

---

#### `!fixlockedpoints` ⭐ NEW
**Purpose:** Audit and clear stuck locked points
**Location:** Anywhere
**Permissions:** Admin only

**What It Does:**

```
Step 1: Audit
⚠️ Locked Points Found
Found 3 members with locked points:

• Player1: 500pts locked
• Player2: 300pts locked
• Player3: 200pts locked

Action: Clear all locked points?
⚠️ Only do this if no auction is running or if points are stuck.

[✅ clear all] [❌ cancel]

Step 2: If confirmed
✅ Locked Points Cleared
Freed 1000pts from 3 members

Points are now available for bidding
```

**When To Use:**
- Points stuck after auction crash
- Members can't bid (insufficient points)
- After using `!resetauction`
- Before starting new session

**Safety:**
- ✅ Shows preview before clearing
- ✅ Requires confirmation
- ❌ **DO NOT** use during active auction!

---

#### `!recoverauction` ⭐ NEW
**Purpose:** Recover from crashed or stuck auction
**Location:** Anywhere
**Permissions:** Admin only

**Recovery Options:**

```
🔧 Auction Recovery

Current State:
• Auctioneering active: Yes
• Current item: Dragon Sword
• Bidding auction: Dragon Sword
• Locked points: 3 members

Recovery Options:

1️⃣ **Clear stuck state** - Unlock points, clear timers
2️⃣ **Force finalize** - End current session, submit results
3️⃣ **Full reset** - Use `!resetauction` instead

What would you like to do?
[1️⃣ Clear] [2️⃣ Finalize] [❌ Cancel]
```

**Option 1: Clear Stuck State**
- Stops all timers
- Unlocks all points
- Clears pending confirmations
- **Keeps** auction running

**Use When:**
- Points are stuck
- Timers not working
- Bids not processing
- BUT auction should continue

**Option 2: Force Finalize**
- Ends current session
- Submits all completed items to sheets
- Clears all state
- **Stops** auction

**Use When:**
- Auction is beyond recovery
- Need to start fresh
- Critical errors occurred

---

#### `!resetauction` ⭐ NEW
**Purpose:** Complete system reset (NUCLEAR OPTION)
**Location:** Anywhere
**Permissions:** Admin only

**⚠️ WARNING:** This is the most destructive command. Use with extreme caution.

**What It Resets:**

```
⚠️ COMPLETE AUCTION RESET ⚠️

Bidding Module:
• Active auction: Dragon Sword
• Locked points: 3 members
• History: 5 items
• Cache: 45 members

Auctioneering Module:
• Session items: 12

State Files:
• bidding-state.json will be cleared
• All timers will be stopped
• All caches will be cleared

✅ Safe to use when:
• Auction is stuck/crashed
• Starting fresh session
• Points are glitched

❌ DO NOT use during active auction!

[✅ RESET EVERYTHING] [❌ cancel]
```

**What Gets Reset:**
- ✅ All auction state (both modules)
- ✅ All locked points
- ✅ All timers
- ✅ All caches
- ✅ All pending confirmations
- ✅ bidding-state.json file
- ✅ Google Sheets state backup

**What Is Preserved:**
- ✅ Points in Google Sheets (BiddingPoints)
- ✅ Completed auction results
- ✅ ForDistribution items
- ✅ BiddingItems sheet

**When To Use:**
- Complete auction crash
- Unrecoverable errors
- Starting completely fresh
- Testing/development

**When NOT To Use:**
- ❌ During active auction with bids
- ❌ As first troubleshooting step
- ❌ Minor issues (use `!recoverauction` instead)

**Recovery Steps After Reset:**
1. Run `!auctionaudit` to verify clean state
2. Run `!fixlockedpoints` to ensure no stuck points
3. Verify Google Sheets data
4. Run `!startauction` to begin fresh

---

#### `!movetodistribution` ⭐ NEW
**Purpose:** Manually move completed auction items to ForDistribution sheet
**Location:** Bidding channel
**Permissions:** Admin only

**What It Does:**
- Scans BiddingItems sheet for items with winners
- Copies completed items to ForDistribution sheet
- Deletes items from BiddingItems after successful copy
- Provides detailed move report

**When To Use:**
- Automatic move failed during session finalization
- Need to manually organize ForDistribution
- Recovery after Google Sheets issues
- Manual cleanup of completed auctions

**Flow:**
```
Admin: !movetodistribution

Bot: 🕐 Moving Items to ForDistribution
     Scanning BiddingItems sheet...

Bot: ✅ Items Moved Successfully
     5 item(s) moved from BiddingItems to ForDistribution
     2 item(s) skipped (no winner)
     7 total items processed

     Items with winners have been:
     ✅ Copied to ForDistribution sheet
     ✅ Removed from BiddingItems sheet

     Items without winners remain in BiddingItems for future auctions.
```

**Features:**
- ✅ **Retry Logic**: 3 attempts with exponential backoff (2s, 4s, 8s)
- ✅ **Detailed Report**: Shows moved, skipped, and total counts
- ✅ **Error Handling**: Clear error messages with troubleshooting steps
- ✅ **Admin Logging**: Logs to admin channel with who triggered it

**Error Handling:**
If move fails after 3 attempts:
```
❌ Move Failed
Failed to move items after 3 attempts.
Error: HTTP 503

⚠️ Possible Causes:
• Google Sheets API timeout
• Network connectivity issues
• Sheet permissions problem
• Webhook URL misconfigured

📋 Manual Fix:
Open Google Sheets and run:
moveAllItemsWithWinnersToForDistribution()
from the Apps Script editor (Extensions → Apps Script)
```

**Safety:**
- ✅ Only moves items WITH winners
- ✅ Items without winners stay in BiddingItems
- ✅ Bottom-to-top scanning prevents row shift issues
- ✅ No data loss (source only deleted after successful copy)

---

### Member Commands

#### `!bid <amount>`
**Purpose:** Place or increase bid
**Location:** Auction thread
**Permissions:** ELYSIUM role

**Flow:**
```
Member: !bid 500

Bot: 🕐 Confirm Your Bid
Item: Dragon Sword
💰 Your Bid: 500pts
📊 Current High: 450pts
💳 Points After: 1500pts left

⚠️ By confirming, you agree to:
• Lock 500pts from your available points
• Place your bid to 500pts
• Lose points if you win but didn't attend

[✅ YES] [❌ NO] • 10s timeout
```

**Important:**
- Rate limit: 3 seconds between bids
- Confirmation timeout: 10 seconds
- Points locked immediately on confirmation
- Auto-extends auction if bid in final 60s

---

#### `!mypoints` / `!pts`
**Purpose:** Check available points
**Location:** Bidding channel (NOT threads)
**Permissions:** ELYSIUM role

**Example:**
```
Member: !mypoints

Bot: 💰 Your Points
PlayerName

📊 Available Points: 2000 pts

(Auto-deletes in 30s)
```

---

#### `!bidstatus` / `!bs`
**Purpose:** Check auction status
**Location:** Anywhere
**Permissions:** ELYSIUM role

**Shows:**
- Current item
- Current high bid
- Time remaining
- Next few items

---

#### `!queuelist` / `!ql`
**Purpose:** Preview upcoming items (from Google Sheets)
**Location:** Anywhere
**Permissions:** ELYSIUM role

**Note:** This command now only shows Google Sheets items.

---

### Item Management Commands

#### `!cancelitem`
**Purpose:** Cancel current item and refund points
**Location:** Auction thread
**Permissions:** Admin only

**What It Does:**
- Unlocks all locked points for current item
- Archives thread
- **Does NOT** move to next item automatically
- Use `!endauction` to end session

---

#### `!skipitem`
**Purpose:** Skip current item (mark as no sale)
**Location:** Auction thread
**Permissions:** Admin only

**What It Does:**
- Marks item as "no bids"
- Item remains in BiddingItems sheet
- Unlocks points
- **Does NOT** move to next item automatically

---

## 🚨 Troubleshooting

### Common Issues

#### ❌ "No available items to auction"
**Cause:** All items in BiddingItems sheet have winners

**Solution:**
1. Open Google Sheets
2. Go to BiddingItems tab
3. Clear the "Winner" column (Column D) for items you want to re-auction
4. Run `!startauction` again

---

#### ❌ "Failed to load points"
**Cause:** Google Sheets API error

**Solution:**
1. Check `sheet_webhook_url` in config.json
2. Test webhook manually: `curl -X POST [URL]`
3. Check Google Apps Script quota
4. Wait 1-2 minutes and retry

---

#### ❌ "Bid rejected - insufficient points"
**Cause:** Points are locked or member doesn't have enough

**Solution:**
1. Run `!auctionaudit` to check locked points
2. Run `!mypoints` to verify available points
3. If points stuck, run `!fixlockedpoints`
4. Check Google Sheets for correct point values

---

#### ❌ Auction Stuck / Not Progressing
**Symptoms:**
- Timers not firing
- Items not ending
- No "Going Once/Twice" announcements

**Solution:**
```
Step 1: Diagnose
!auctionaudit

Step 2: Try Recovery
!recoverauction
→ Choose Option 1 (Clear stuck state)

Step 3: If still stuck
!endauction
!resetauction
!startauction
```

---

#### ❌ Points Not Unlocking After Outbid
**Cause:** State sync issue

**Solution:**
1. `!auctionaudit` - Check locked points
2. `!fixlockedpoints` - Clear if confirmed stuck
3. If during auction, wait for item to end
4. Points unlock automatically when outbid

---

#### ❌ Thread Creation Failed
**Error:** "Unable to create thread for [Item]"

**Cause:** Bot missing permissions

**Solution:**
1. Check bot has "Create Public Threads" permission in bidding channel
2. Check bot has "Send Messages in Threads" permission
3. Verify bot role is above member roles
4. Test: Create thread manually, does bot see it?

---

#### ❌ Bid Confirmation Timeout
**Cause:** User didn't react within 10 seconds

**Solution:**
- User must react faster
- If auction in final 10s, auction pauses during confirmation
- After timeout, user can bid again

---

#### ❌ ForDistribution Move Failed
**Symptoms:**
- Admin logs show "ForDistribution Move Failed"
- Items remain in BiddingItems with winners
- Automatic move during finalization didn't complete

**Solution:**
```
Step 1: Verify the issue
!auctionaudit
(Check if session is truly ended)

Step 2: Manually trigger move
!movetodistribution

Step 3: If still failing
Open Google Sheets → Extensions → Apps Script
Run: moveAllItemsWithWinnersToForDistribution()

Step 4: Verify success
Check ForDistribution sheet for moved items
```

**Prevention:**
- Ensure stable internet during finalization
- Don't close bot during session finalization
- Monitor admin logs for move confirmation

---

## ✅ Best Practices

### Before Starting Auction

**Pre-Flight Checklist:**
```
□ Run !auctionaudit (verify clean state)
□ Run !fixlockedpoints (clear any stuck points)
□ Verify Google Sheets BiddingItems has items
□ Verify BiddingPoints has current member points
□ Clear Winner column for items to auction
□ Announce auction start time to members
□ Confirm all admins are available
```

### During Auction

**DO:**
- ✅ Monitor auction progress
- ✅ Use `!bidstatus` to check current item
- ✅ Respond to member questions quickly
- ✅ Keep an eye on Discord for errors

**DON'T:**
- ❌ Use `!resetauction` during active bidding
- ❌ Clear locked points while auction running
- ❌ Manually edit Google Sheets during session
- ❌ Restart bot mid-auction

### After Auction

**Post-Auction Checklist:**
```
□ Verify all items submitted to Google Sheets
□ Check ForDistribution sheet for all sold items
□ Run !auctionaudit (verify clean state)
□ Run !fixlockedpoints (clear residual locks)
□ Archive auction announcement
□ Thank members for participating
```

### Regular Maintenance

**Weekly:**
- Run `!auctionaudit` to check system health
- Clear stuck points with `!fixlockedpoints`
- Review auction logs

**Monthly:**
- Verify Google Sheets sync working
- Check bidding-state.json file size
- Test recovery commands in dev environment

---

## 🆘 Emergency Procedures

### Emergency Stop
**When:** Exploit found, critical bug, or abuse

**Steps:**
```
1. !endauction (immediate stop)
2. Announce to members: "Auction paused due to technical issue"
3. Run !auctionaudit (capture state)
4. Screenshot current Google Sheets data
5. Contact dev team
6. Run !resetauction if unrecoverable
7. Manual points adjustment in sheets if needed
```

### Points Corruption
**When:** Points are wrong in sheets

**Steps:**
```
1. !endauction (stop auction)
2. Export BiddingPoints sheet (backup)
3. Manually verify correct values
4. Update Google Sheets
5. Run !resetauction
6. Run !fixlockedpoints
7. Verify with !auctionaudit
8. Restart auction if safe
```

### Bot Crash During Auction
**When:** Bot goes offline mid-auction

**Steps:**
```
1. Restart bot immediately
2. Bot will attempt state recovery
3. Run !auctionaudit
4. Check locked points: !fixlockedpoints
5. If recovery failed:
   - !recoverauction → Option 2 (Force finalize)
   - Manually verify Google Sheets
   - Announce to members
   - Compensate if needed
```

### Duplicate Winners
**When:** Same item sold to multiple people

**Steps:**
```
1. !endauction
2. Check Google Sheets for duplicate entries
3. Verify actual winner from Discord logs
4. Manual sheet correction
5. Contact affected members
6. Compensate or re-auction
```

---

## 📚 Reference

### Auction State Lifecycle
```
IDLE → PREVIEW (30s) → ACTIVE → GOING_ONCE (1m) →
GOING_TWICE (30s) → FINAL_CALL (10s) → ENDED → NEXT_ITEM
```

### Points Lock Lifecycle
```
BID_PLACED → CONFIRMATION → LOCKED →
   ├─ WIN → DEDUCTED (at session end)
   └─ OUTBID → UNLOCKED
```

### File Locations
- **State File:** `./bidding-state.json`
- **Config:** `./config.json`
- **Logs:** Console output
- **Google Sheets:** BiddingItems, BiddingPoints, ForDistribution

### Key Timeouts
- **Confirmation:** 10 seconds
- **Rate Limit:** 3 seconds between bids
- **Preview:** 30 seconds before item starts
- **Auto-extend:** +1 minute when bid in final 60s
- **Max Extensions:** 60 (60 minutes total)

---

## 🔗 Additional Resources

- **Main Documentation:** `AUCTION_FLOW_ANALYSIS.md`
- **README:** `README.md`
- **Code:** `auctioneering.js`, `bidding.js`
- **Google Sheets:** Check config.json for webhook URL

---

## 📞 Support

For issues not covered in this guide:
1. Run `!auctionaudit` and screenshot
2. Check console logs for errors
3. Contact development team
4. Provide error messages and context

---

**Last Updated:** v9.0
**Manual Queue Removed:** ✅
**Max Extensions:** 60
**New Admin Commands:** 4 added
