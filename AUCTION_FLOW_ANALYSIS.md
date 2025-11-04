# ELYSIUM Auction Flow - Complete Analysis

## Overview
The ELYSIUM auction system is a sophisticated Discord-based bidding and loot distribution platform.

**⚠️ v9.0 UPDATE:**
- ❌ **Manual queue system has been REMOVED**
- ✅ All auction items must now come from **Google Sheets BiddingItems tab**
- ✅ Max auction extensions increased from 15 to 60
- ✅ New admin commands added: `!auctionaudit`, `!fixlockedpoints`, `!recoverauction`, `!resetauction`

All auctions are now Google Sheets-based for better consistency and management.

---

## System Architecture

### Core Components
- **auctioneering.js** - Main auction orchestration, item management, session flow
- **bidding.js** - Bidding mechanics, confirmation handling, points caching, history
- **index2.js** - Discord event listeners, command routing, reaction handling
- **Google Sheets Integration** - Backend persistence, points storage, results submission

### Data Flow
```
Google Sheets (Items/Points)
    ↓
Bot Cache (loadCache)
    ↓
Auction Session (active items)
    ↓
Bidding Process (confirmations)
    ↓
Results → Google Sheets (submission)
```

---

## 1. AUCTION INITIALIZATION

### A. AUCTIONEERING MODE (Google Sheets Items)

**Function:** `startAuctioneering()` in auctioneering.js (Line 259)

**Trigger:** Admin command `!startauction` (when no manual queue exists)

**Flow:**
```
1. Validation
   ├─ Check if auction already active
   ├─ Fetch points cache (loadPointsCacheForAuction)
   └─ Fetch items from BiddingItems sheet

2. Item Processing
   ├─ Filter out items with winners (already auctioned)
   ├─ Expand quantities (if item has quantity=3, create 3 separate auction items)
   ├─ Extract boss names and add metadata
   └─ Create sessionItems array (flat list of all items)

3. Session Setup
   ├─ Set auctionState.active = true
   ├─ Set auctionState.sessionItems = allItems
   ├─ Show 30-second preview (countdown with "@everyone" mention)
   └─ Schedule start after 30 seconds

4. Start Item Processing
   └─ Call auctionNextItem() after countdown
```

**Key Variables:**
- `auctionState.sessionItems[]` - All items to auction (flat array)
- `auctionState.currentItemIndex` - Current position (0 = first item)
- `auctionState.active` - Global auction state flag

**Sample Output:**
```
✅ Filtered items: 12/15 available (3 already have winners)
🔨 Auctioneering Started! (12 items)
   1. Dragon Sword - 500pts (5m)
   2. Shield of Protection - 300pts (3m)
   ...
```

### B. ~~BIDDING MODE (Manual Queue)~~ - **REMOVED IN v9.0**

**Status:** ❌ **DEPRECATED AND REMOVED**

The manual queue system has been completely removed. All auction items must now come from Google Sheets.

**Removed Commands:**
- ❌ `!auction <item> <price> <duration>` - Add manual item
- ❌ `!removeitem <name>` - Remove from queue
- ❌ `!clearqueue` - Clear manual queue

**Migration:** All items should be added to the **BiddingItems** tab in Google Sheets.

---

## 2. ITEM DISPLAY & PREVIEW

### Preview Phase (30 seconds before auction starts)

**Auctioneering Mode:**
- Location: Main bidding channel
- Embed: Yellow (AUCTION color #ffd700)
- Content:
  ```
  🕐 NEXT ITEM COMING UP
  
  Item Name
  
  💰 Starting Bid: X pts
  ⏱️ Duration: Y minutes
  📋 Items Left: Z remaining
  🏆 Boss: Boss Name (if applicable)
  
  Auction starts in 30 seconds
  ```

**Bidding Mode:**
- Location: Auction thread
- Embed: Gold (#ffd700)
- Content:
  ```
  🏆 AUCTION STARTING
  
  Item Name
  
  💰 Starting Bid: X pts
  ⏱️ Duration: Y minutes
  📋 Items Left: Z
  
  (Batch info if quantity > 1)
  Starts in 30 seconds
  ```

### Start/Activation Phase

**Auctioneering Mode:** 
- Thread created per item
- Embed shows start message in thread
- All ELYSIUM members can bid (no attendance required)

**Bidding Mode:**
- Embed: Green (#00ff00)
- Content:
  ```
  🔥 BIDDING NOW!
  Type `!bid <amount>` to bid
  💰 Current: X pts
  ⏱️ Time: Y minutes
  ```

---

## 3. BIDDING PROCESS

### State Management

**Location:** `bidding.js` state object (`st`)
```javascript
st = {
  cp: {},        // Cached points (member name → pts)
  lp: {},        // Locked points (currently held by bids)
  a: {...},      // Active auction item
  pc: {},        // Pending confirmations (awaiting reactions)
  h: [],         // History (completed items)
  th: {},        // Timers/handles
}
```

### Bid Flow

```
1. User Types !bid <amount>
   └─ Routed to procBidAuctioneering() or procBid()

2. Validation
   ├─ Check ELYSIUM role ✅
   ├─ Check rate limit (3 seconds) ⏱️
   ├─ Validate amount (>0, integer) 💯
   ├─ Check >= current bid price 🔨
   ├─ Calculate available points:
   │   └─ available = total - locked
   └─ Check sufficient points 💰

3. Point Calculation
   ├─ If first bid on item: needed = amount
   ├─ If self-overbidding: needed = amount - curBid
   ├─ If outbidding other: needed = amount
   └─ Verify: needed <= available

4. Confirmation Message
   ├─ Send embed with bid details
   ├─ Add ✅ and ❌ reactions
   ├─ Start 10-second countdown timer
   └─ Store in st.pc (pending confirmations)

5. Wait for Reaction Confirmation
   ├─ Event: messageReactionAdd
   ├─ User must react with ✅ within 10s
   └─ If ❌ or timeout: bid rejected
```

### Confirmation Logic (confirmBid in bidding.js Line 2338)

**On ✅ Reaction:**
```
1. Check if bid still valid
   ├─ Auction still active
   ├─ Item status = "active"
   └─ Bid amount >= current bid

2. Check for higher pending bids
   └─ If other users have higher pending bids waiting:
       └─ Reject this bid

3. Update Current Winner
   ├─ If previous winner exists:
   │   ├─ Unlock their old locked points
   │   └─ Notify them: "Outbid!"
   ├─ Lock new bid amount
   ├─ Update item:
   │   ├─ curBid = new amount
   │   ├─ curWin = bidder username
   │   ├─ curWinId = bidder Discord ID
   │   └─ Add to bids[] array

4. Auto-Extend Timer
   ├─ If bid placed in final minute:
   │   ├─ Extend end time by 1 minute
   │   ├─ Max 15 extensions per item
   │   └─ Notify users: "Time Extended!"

5. Send Confirmation
   ├─ Edit confirmation message (green ✅)
   ├─ Send "New High Bid!" announcement
   ├─ Delete original bid message
   └─ Save state to file & sheets
```

### Self-Overbidding

When the current bidder places a higher bid:
- Only additional points are locked
- Example: Current bid 100pts, new bid 150pts
  - Additional lock: 50pts
  - Total locked: 150pts

---

## 4. AUCTION STATE MANAGEMENT

### Item State Object (currentItem)

**Auctioneering Mode:**
```javascript
item = {
  // From sheet
  item: "Dragon Sword",
  startPrice: 500,
  duration: 5,        // minutes
  quantity: 1,
  source: "GoogleSheet",
  sheetIndex: 0,
  bossName: "Bosses Name",
  
  // Runtime state
  status: "active",   // "active", "ended", "cancelled"
  curBid: 500,
  curWin: "Username",
  curWinId: "Discord ID",
  bids: [...],
  endTime: Date.now() + (duration * 60000),
  auctionStartTime: "timestamp",
  auctionEndTime: "timestamp",
  extCnt: 0,          // Extension counter
}
```

### Points System

**Locked Points (st.lp):**
- Points reserved during active bid (not available for new bids)
- Freed when:
  - Outbid by someone else (old winner's points released)
  - Auction ends (winner's points deducted from sheet)
  - Bid cancelled or item skipped

**Example:**
```
User has 1000 total points
Places bid for 500 pts
→ Locked: 500 pts
→ Available: 500 pts (for additional bids)

Places new bid for 800 pts
→ Already locked: 500 pts
→ Additional: 300 pts
→ Total locked: 800 pts
→ Available: 200 pts
```

---

## 5. TIMING & COUNTDOWN ANNOUNCEMENTS

### Announcement Timeline

Each item auction has automated announcements:

1. **30 seconds before:** Preview message
2. **Item starts:** Activation message
3. **1 minute before end:** "Going Once!" ⚠️
4. **30 seconds before end:** "Going Twice!" ⚠️
5. **10 seconds before end:** "Final Call!" 🚨
6. **Time expires:** "Auction Ended" 🏁

### Time Extension Logic

**Trigger:** Bid placed within final 60 seconds
```
Time Left < 60s AND curItem.extCnt < 15
→ Add 60 seconds to endTime
→ Increment extCnt
→ Reschedule timers (go1, go2, final, end)
```

**Prevents:** Sniping (last-second bids)

---

## 6. AUCTION END & ITEM DISTRIBUTION

### Item End Process (itemEnd in auctioneering.js Line 805)

```
1. Mark Item Complete
   └─ item.status = "ended"

2. Determine Winner
   ├─ If curWin exists:
   │   ├─ Send "SOLD!" message
   │   ├─ Show winner and price
   │   └─ Log to sessionItems
   └─ Else:
       ├─ Send "NO BIDS" message
       └─ Item not recorded

3. Lock & Archive Thread
   ├─ Call setLocked(true)
   └─ Call setArchived(true)

4. Move to Next Item
   ├─ Increment currentItemIndex
   ├─ Clear currentItem reference
   ├─ Check if more items exist:
   │   ├─ YES: Call auctionNextItem()
   │   └─ NO: Call finalizeSession()
```

### Finalization (finalizeSession Line 988)

**When:** All items auctioned OR auction ended early

**Steps:**

1. **Stop Cache Auto-Refresh**
   - Cleanup points refresh timer

2. **Build Results**
   - Get all members from points cache
   - Tally spending by member (sum of all items won)
   - Create results array (all members, including 0s for non-winners)

3. **Submit to Google Sheets**
   - Call submitBiddingResults webhook
   - Update sheet with points deductions
   - If successful:
     - Show tally summary
     - Move items to ForDistribution sheet
     - Send admin logs

4. **Clear State**
   - Clear sessionItems history
   - Clear locked points
   - Clear cache
   - Save to file & sheets

5. **Display Summary**
   ```
   ✅ Session Complete!
   📊 Items Sold: 12
   💰 Total Revenue: 5,840 pts
   
   Results Tally:
   1. Player1 - 2,000 pts
   2. Player2 - 1,500 pts
   3. Player3 - 1,340 pts
   ...
   ```

---

## 7. UI/DISPLAY COMPONENTS

### Embed Color Scheme

| Component | Color | Hex | Emoji |
|-----------|-------|-----|-------|
| Success | Green | 0x00ff00 | ✅ |
| Warning | Orange | 0xffa500 | ⚠️ |
| Error | Red | 0xff0000 | ❌ |
| Info | Blue | 0x4a90e2 | ℹ️ |
| Auction | Gold | 0xffd700 | 🔨 |

### Message Types

#### 1. Auction Preview Embed
```
🕐 NEXT ITEM COMING UP
Item Name
💰 Starting Bid: 500 pts
⏱️ Duration: 5 minutes
📋 Items Left: 11 remaining
🏆 Boss: Boss Name
Footer: Auction starts in 30 seconds
```

#### 2. Bidding Active Embed
```
🔥 BIDDING NOW!
Type `!bid <amount>` to bid
💰 Current: 500 pts
⏱️ Time: 5m
Footer: 10s confirm • 3s rate limit
```

#### 3. Bid Confirmation Embed
```
🕐 Confirm Your Bid
Item: Dragon Sword
Action: Place bid and lock points
⚠️ By confirming, you agree to:
• Lock 500pts from your available points
• Place your bid to 500pts
• Lose points if you win but didn't attend

Fields:
💰 Your Bid: 500pts
📊 Current High: 500pts
💳 Points After: 500pts left

Footer: ✅ YES / ❌ NO • 10s timeout
```

#### 4. Going Once/Twice/Final Embeds
```
⚠️ GOING ONCE!          (1 minute left)
⚠️ GOING TWICE!         (30 seconds left)
🚨 FINAL CALL!          (10 seconds left)

Field: 💰 Current: 500pts by Player1
```

#### 5. Winner Announcement
```
🔨 SOLD!
Dragon Sword sold!

🔥 Winner: @Player1
💰 Price: 500 pts
📊 Source: Google Sheet

Footer: Current timestamp
```

#### 6. Session Complete
```
✅ Auctioneering Session Complete!
12 item(s) sold

📋 Summary:
1. Dragon Sword 📊: Player1 - 500pts
2. Shield... 📊: Player2 - 300pts
...

(Then separate tally)
📊 Bidding Points Tally
Points spent this session:

1. Player1 - 2,000 pts
2. Player2 - 1,500 pts
...
```

### Thread Organization

- **Main Channel:** Announcements, previews, results
- **Item Threads:** Individual auction houses
  - Created per item
  - Named: `Item Name | StartPrice | Boss`
  - All bids happen here
  - Locked/archived after end

---

## 8. COMMAND REFERENCE

### Admin Commands

| Command | Function | Notes |
|---------|----------|-------|
| `!startauction` | Start auction from Google Sheets | Admin only |
| `!endauction` | Force end entire session | Admin only |
| `!pause` | Pause current item | Admin only |
| `!resume` | Resume paused item | Admin only |
| `!stop` | End current item early | Admin only |
| `!extend <minutes>` | Extend current item | Admin only |
| `!cancelitem` | Refund and skip | Admin only |
| `!skipitem` | Mark no sale | Admin only |
| `!auctionaudit` ⭐ | System health check | **NEW v9.0** |
| `!fixlockedpoints` ⭐ | Clear stuck locked points | **NEW v9.0** |
| `!recoverauction` ⭐ | Recover from crash | **NEW v9.0** |
| `!resetauction` ⭐ | Nuclear reset option | **NEW v9.0** |
| `!forcesubmitresults` | Manually submit tally | Admin only |
| `!resetbids` | Partial reset | Admin only |
| ~~`!auction`~~ | ❌ REMOVED | Use Google Sheets |
| ~~`!removeitem`~~ | ❌ REMOVED | Edit Google Sheets |
| ~~`!clearqueue`~~ | ❌ REMOVED | Not needed |

### Member Commands

| Command | Function |
|---------|----------|
| `!bid <amount>` | Place/increase bid |
| `!bidstatus` / `!bs` | Check auction status |
| `!mypoints` / `!pts` | Check available points |
| `!queuelist` / `!ql` | Preview next items |

---

## 9. ERROR HANDLING & EDGE CASES

### Common Issues

**1. No Bids on Item**
- Item marked as "no sale"
- Not added to results
- Remains in BiddingItems sheet for re-auction

**2. Bid in Final 10 Seconds**
- Auction paused during confirmation
- Timer resumes after 10s or timeout
- Prevents sniping

**3. Higher Pending Bids**
- System checks all pending confirmations
- Rejects lower bids if higher ones waiting
- Notifies user of competition

**4. Thread Creation Fails**
- Fallback: message.startThread()
- Sends error and cancels auction
- Requires "Create Public Threads" permission

**5. Cache Load Fails**
- Prevents auction start
- Shows error: "Failed to load points"
- Requires manual retry

### Safety Mechanisms

- **Rate Limit:** 3 seconds between bids per user
- **Confirmation Timeout:** 10 seconds to confirm bid
- **Extension Cap:** Max 15 auto-extensions per item
- **Bid Amount Cap:** Max 99,999,999 pts
- **Circular Reference Prevention:** State stringification excludes timers

---

## 10. DATA PERSISTENCE

### Local Storage (bidding-state.json)
```javascript
{
  q: [...],           // Queue
  a: {...},           // Active auction
  lp: {...},          // Locked points
  h: [],              // History
  pc: {...},          // Pending confirmations (cleaned)
  sd: "timestamp",    // Session date
  cp: {...}           // Cached points
}
```

### Google Sheets Sync
- **getBiddingPoints:** Fetch member points
- **logAuctionResult:** Record item sale
- **submitBiddingResults:** Submit final tally
- **moveAuctionedItemsToForDistribution:** Move completed items
- **saveBotState:** Backup state for recovery

### Recovery
- On startup, checks for crashed state
- Loads from Google Sheets if local file missing
- Auto-saves every 5 minutes

---

## 11. FLOW DIAGRAMS

### Complete Auction Flow

```
START AUCTION
     ↓
Load Points Cache
     ↓
Fetch Items (Google Sheets)
     ↓
Filter (remove winners)
     ↓
Show 30s Preview
     ↓
START FIRST ITEM
     ↓
Create Thread
     ↓
Show Item Details
     ↓
ACCEPT BIDS (30+ seconds)
     ├─ User !bid
     ├─ Validation
     ├─ Confirmation (10s)
     ├─ Check pending
     ├─ Update state
     ├─ Lock points
     └─ Repeat
     ↓
1 MINUTE MARK: "Going Once"
     ↓
30 SECOND MARK: "Going Twice"
     ↓
10 SECOND MARK: "Final Call"
     ↓
AUCTION ENDS
     ├─ Announce winner
     ├─ Lock thread
     └─ Archive thread
     ↓
MORE ITEMS? ──YES──→ START NEXT ITEM
     │
     NO
     ↓
FINALIZE SESSION
     ├─ Build tally
     ├─ Submit to sheets
     ├─ Move items
     ├─ Clear state
     └─ Show summary
```

---

## 12. KEY TECHNICAL DETAILS

### Points Lock/Unlock Mechanism

```javascript
// Lock (during bid confirmation)
st.lp[username] += bidAmount
// Available = total - locked
available = total - st.lp[username]

// Unlock (when outbid)
st.lp[prevWinner] = 0
delete st.lp[prevWinner]

// Deduct (at session end)
// Google Sheets handles actual deduction
```

### Auto-Extend Algorithm

```javascript
const timeLeft = item.endTime - Date.now()
if (timeLeft < 60000 && item.extCnt < 60) {  // Changed from 15 to 60
  item.endTime += 60000  // Add 1 minute
  item.extCnt++
  rescheduleTimers()    // Reschedule go1/go2/final/end
}
```

### Batch Auction Distribution (Single Item)

For `quantity > 1`:
- All bids collected into array
- Sorted by amount (descending)
- Top N bidders win (N = quantity)
- Each winner gets locked amount deducted

---

## Summary

The ELYSIUM auction system provides a robust, Discord-integrated auction platform with:
- **Google Sheets Item Management** (all items from BiddingItems tab)
- **Smart Points Handling** (locked/available tracking)
- **Enhanced Anti-Sniping** (60 extensions max, 60 minutes total)
- **Pending Bid Conflict Resolution** (reject if higher bid pending)
- **Comprehensive Logging** (Google Sheets integration)
- **Clean State Management** (local + remote persistence)
- **Advanced Admin Tools** (audit, recovery, reset commands)

**v9.0 Changes:**
- ❌ Manual queue completely removed
- ✅ Max extensions increased from 15 to 60
- ✅ Self-overbidding triggers extensions
- ✅ Four new admin commands for troubleshooting
- ✅ Better auction pause during bid confirmation

**For detailed admin instructions, see:** `AUCTION_ADMIN_GUIDE.md`
