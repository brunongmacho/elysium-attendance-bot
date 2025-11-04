# How the Bot Checks Bidding Points

## Overview

The bot uses a **cached points system** that pulls member points from Google Sheets and validates bids against available points before allowing them.

---

## Step-by-Step Flow

### 1. **Points Cache Loading** (`fetchPts()` - Line 280)

When an auction starts, the bot fetches all member points from Google Sheets:

```javascript
// Makes POST request to Google Sheets
{
  action: "getBiddingPoints"
}

// Returns:
{
  points: {
    "MemberName1": 150,
    "MemberName2": 320,
    "MemberName3": 50,
    ...
  }
}
```

**Cache is stored in:** `st.cp` (state.cachedPoints)
**Cache timestamp:** `st.ct` (state.cacheTime)
**Auto-refresh:** Every 5 minutes during active auctions

---

### 2. **Member Places a Bid** (`!bid <amount>`)

**Command:** `!bid 100` or `!b 100`
**Location:** Auction thread only
**Handler:** `procBid()` or `procBidAuctioneering()` (Line 1136/960)

---

### 3. **Point Validation Process**

#### **Step 3.1: Get Member's Total Points**

```javascript
const tot = getPts(u);  // Line 1017 or 1189
```

**Function `getPts(username)` (Line 382):**
```javascript
function getPts(u) {
  if (!st.cp) return null;
  let p = st.cp[u];
  if (p === undefined) {
    // Case-insensitive lookup
    const m = Object.keys(st.cp).find(
      (n) => n.toLowerCase() === u.toLowerCase()
    );
    p = m ? st.cp[m] : 0;
  }
  return p || 0;
}
```

**What it does:**
- Looks up username in cached points: `st.cp[username]`
- Does **case-insensitive** matching
- Returns 0 if not found in Google Sheets

#### **Step 3.2: Calculate Locked Points**

```javascript
const curLocked = st.lp[u] || 0;  // Line 1025 or 1199
```

**What are locked points?**
- When you place a bid, those points get "locked"
- Locked points stored in: `st.lp` (state.lockedPoints)
- Example: If you bid 100pts, those 100pts are locked until:
  - You win (points deducted)
  - You get outbid (points unlocked)
  - Auction ends

#### **Step 3.3: Calculate Available Points**

```javascript
const av = tot - curLocked;  // Line 1026
// OR
const av = avail(u, tot);    // Line 1190
```

**Function `avail(username, total)` (Line 152):**
```javascript
const avail = (u, tot) => Math.max(0, tot - (st.lp[u] || 0));
```

**Formula:**
```
Available Points = Total Points - Locked Points
Available Points = MAX(0, Total - Locked)  // Never negative
```

#### **Step 3.4: Calculate Points Needed**

```javascript
const isSelf = currentItem.curWin && currentItem.curWin.toLowerCase() === u.toLowerCase();
const needed = isSelf ? Math.max(0, bid - currentItem.curBid) : bid;
```

**Two scenarios:**

**A. Bidding on someone else's item:**
```
Needed = Full bid amount
Example: Bid 150pts → Need 150pts
```

**B. Self-overbidding (increasing your own bid):**
```
Needed = New bid - Current bid
Example: Your current bid: 100pts, New bid: 150pts → Need 50pts more
```

#### **Step 3.5: Validate Sufficient Points**

```javascript
if (needed > av) {
  await msg.reply(
    `❌ Insufficient!\n` +
    `💰 Total: ${tot}\n` +
    `🔒 Locked: ${curLocked}\n` +
    `📊 Available: ${av}\n` +
    `⚠️ Need: ${needed}`
  );
  return { ok: false, msg: "Insufficient" };
}
```

**Validation Rule:**
```
IF (Points Needed > Available Points) THEN
  ❌ Reject bid
ELSE
  ✅ Allow bid (show confirmation)
```

---

### 4. **Bid Confirmation**

If validation passes, bot shows confirmation embed:

```
🕐 Confirm Your Bid

Item: Dragon Scale
Action: Place bid and lock points

⚠️ By confirming, you agree to:
• Lock 150pts from your available points
• Place your bid to 150pts
• Lose points if you win but didn't attend

💰 Your Bid: 150pts
📊 Current High: 100pts
💳 Points After: 170pts left

✅ YES, PLACE BID / ❌ NO, CANCEL • 10s timeout
```

User must react with ✅ within 10 seconds.

---

### 5. **Points Locking (on Confirmation)**

When user confirms (reacts ✅):

```javascript
// Lock the points
st.lp[username] = (st.lp[username] || 0) + needed;

// If outbidding someone, unlock their points
if (previousWinner) {
  st.lp[previousWinner] = Math.max(0, st.lp[previousWinner] - previousBid);
}
```

**Result:**
- Your points get locked
- Previous winner's points get unlocked
- Your bid becomes the new high bid

---

### 6. **Points Deduction (Auction Ends)**

When auction ends, results are submitted to Google Sheets:

```javascript
{
  action: "submitBiddingResults",
  results: [
    {
      member: "MemberName",
      item: "Dragon Scale",
      pointsSpent: 150,
      timestamp: "11/04/25 15:30"
    }
  ]
}
```

**Google Sheets then:**
1. Deducts points from BiddingPoints sheet
2. Updates TotalAttendance
3. Records transaction history

---

## Example Scenario

### **Initial State:**
- **MemberA Total Points:** 500
- **MemberA Locked Points:** 0
- **MemberA Available:** 500

### **Bid #1: MemberA bids 150pts**
```
✅ Validation:
  Total: 500
  Locked: 0
  Available: 500
  Need: 150
  Result: 150 <= 500 ✅ PASS

✅ After confirmation:
  Total: 500
  Locked: 150
  Available: 350
```

### **Bid #2: MemberA tries to bid 400pts on another item**
```
❌ Validation:
  Total: 500
  Locked: 150
  Available: 350
  Need: 400
  Result: 400 > 350 ❌ FAIL

Bot replies: "❌ Insufficient! Total: 500, Locked: 150, Available: 350, Need: 400"
```

### **Bid #3: MemberA self-overbids to 200pts**
```
✅ Validation:
  Total: 500
  Locked: 150 (from first bid)
  Available: 350
  Current Bid: 150
  New Bid: 200
  Need: 50 (difference only!)
  Result: 50 <= 350 ✅ PASS

✅ After confirmation:
  Total: 500
  Locked: 200 (updated from 150)
  Available: 300
```

---

## Cache Auto-Refresh

During active auctions, the cache refreshes every **5 minutes** to ensure points are up-to-date:

```javascript
// Triggered in: startCacheAutoRefresh() - Line 354
setInterval(async () => {
  const p = await fetchPts(url);
  if (p) {
    st.cp = p;
    st.ct = Date.now();
    console.log('🔄 Cache refreshed');
  }
}, 300000); // 5 minutes
```

**Why refresh?**
- Points change as people attend spawns
- Ensures accuracy during long auctions
- Prevents stale data from causing errors

---

## Key Variables

| Variable | Full Name | Description |
|----------|-----------|-------------|
| `st.cp` | Cached Points | Points from Google Sheets |
| `st.ct` | Cache Time | When cache was last updated |
| `st.lp` | Locked Points | Points locked in active bids |
| `tot` | Total Points | Member's total points from cache |
| `av` | Available Points | Total - Locked |
| `needed` | Needed Points | Points required for bid |

---

## Google Sheets Integration

### **GET Points (getBiddingPoints):**
```javascript
// Request
{ action: "getBiddingPoints" }

// Response
{
  points: {
    "Username1": 250,
    "Username2": 150,
    ...
  }
}
```

### **SUBMIT Results (submitBiddingResults):**
```javascript
// Request
{
  action: "submitBiddingResults",
  results: [
    {
      member: "Username",
      item: "Item Name",
      pointsSpent: 150,
      timestamp: "11/04/25 15:30"
    }
  ],
  timestamp: "11/04/25 15:30"
}

// Response
{
  status: "ok",
  message: "Results submitted"
}
```

---

## Error Handling

### **Common Errors:**

1. **"❌ Cache not loaded!"**
   - Cache failed to load from Google Sheets
   - Admin needs to restart auction

2. **"❌ No points"**
   - Member has 0 points in Google Sheets
   - Cannot bid

3. **"❌ Insufficient!"**
   - Not enough available points for bid
   - Shows breakdown of Total/Locked/Available/Need

4. **"⏰ Wait 3s (rate limit)"**
   - Bidding too fast
   - 3-second cooldown between bids

---

## Summary

**The bot checks points by:**

1. ✅ **Loading** all member points from Google Sheets into cache
2. ✅ **Tracking** locked points for active bids
3. ✅ **Calculating** available = total - locked
4. ✅ **Validating** bid amount <= available points
5. ✅ **Locking** points when bid is confirmed
6. ✅ **Unlocking** previous winner's points
7. ✅ **Deducting** points via Google Sheets when auction ends
8. ✅ **Refreshing** cache every 5 minutes during auctions

**No direct database access** - all points are stored in and managed by Google Sheets!
