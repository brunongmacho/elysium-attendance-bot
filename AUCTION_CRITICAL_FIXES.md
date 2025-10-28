# 🚨 CRITICAL AUCTION/BIDDING FIXES - PRIORITY 1

**Date:** 2025-10-28
**Focus:** Google Sheets logging and auction session integrity
**Risk Level:** HIGH - These bugs affect data recording

---

## 📊 CRITICAL BUGS IDENTIFIED

### **BUG #1: itemQueue References Undefined Property**
**Location:** `auctioneering.js:496, 768, 1391`

**Issue:**
```javascript
// Line 496 - itemQueue is never populated
value: `${auctionState.currentItemIndex + 1}/${auctionState.itemQueue.length}`
// Returns: "1/undefined" or crashes with TypeError
```

**Impact:**
- Item counter shows incorrect values ("Item 1/undefined")
- May cause TypeError crashes during auction
- Affects user experience and trust

**Root Cause:**
- `auctionState.itemQueue` is initialized but NEVER populated
- Items are stored in `auctionState.sessions[x].items` instead
- Code references wrong property

**Fix:**
```javascript
// BEFORE:
value: `${auctionState.currentItemIndex + 1}/${auctionState.itemQueue.length}`

// AFTER:
value: `${auctionState.currentItemIndex + 1}/${currentSession.items.length}`
```

**Test Plan:**
```bash
# Test 1: Simple auction
1. Add 5 items to BiddingItems sheet
2. Run: !startauction
3. Verify display shows "Item 1/5", "Item 2/5", etc.
4. Check logs for any TypeError

# Test 2: Multi-session auction
1. Add items for 2 different bosses
2. Start auction
3. Verify each session shows correct count
   - Session 1: "Item 1/3", "Item 2/3", "Item 3/3"
   - Session 2: "Item 1/2", "Item 2/2"
```

---

### **BUG #2: postToSheet Called Without Initialization Check**
**Location:** `auctioneering.js:705, 832`

**Issue:**
```javascript
// Line 705, 832 - No null check
await getPostToSheet()(logPayload);
// If postToSheetFunc is null, this throws error and crashes auction
```

**Impact:**
- If `setPostToSheet()` not called during init, auction crashes
- Results are NOT saved to Google Sheets
- Bot enters broken state, requires restart

**Root Cause:**
- `getPostToSheet()` throws error if `postToSheetFunc` is null
- No try-catch around these critical calls
- Auction cannot recover from failure

**Fix:**
```javascript
// Add try-catch and null check
try {
  if (postToSheetFunc) {
    await getPostToSheet()(logPayload);
  } else {
    console.error(`${EMOJI.ERROR} postToSheet not initialized - cannot log results`);
    // Store results locally for manual recovery
  }
} catch (err) {
  console.error(`${EMOJI.ERROR} Failed to log auction result:`, err);
  // Continue auction but warn admins
}
```

**Test Plan:**
```bash
# Test 1: Normal flow
1. Start bot normally
2. Run auction
3. Verify logs show successful sheet updates

# Test 2: Failure scenario (simulate)
1. Comment out setPostToSheet() in index2.js
2. Start auction
3. Verify bot doesn't crash
4. Check error logs for warning messages
```

---

### **BUG #3: itemIndex +2 Offset May Be Incorrect**
**Location:** `auctioneering.js:693`

**Issue:**
```javascript
// Line 693 - Off-by-one error?
itemIndex: item.source === "GoogleSheet" ? item.sheetIndex + 2 : -1,
// sheetIndex is 0-based from data, +2 accounts for header row
// But what if sheet structure changes?
```

**Impact:**
- Results may be logged to WRONG row in BiddingItems sheet
- Winner/price data overwrites incorrect item
- Data corruption in Google Sheets

**Root Cause:**
- Assumes sheet has 1 header row (row 1)
- `dataRange.forEach((row, idx)` starts at row 2 (data rows)
- Adding +2 makes it row 4 (WRONG!)

**Analysis:**
```
Google Sheet Structure:
Row 1: Headers (Item, Start Price, Duration, Winner, etc.)
Row 2: First data item (idx=0 in forEach)
Row 3: Second data item (idx=1 in forEach)

Current calculation:
idx=0 -> sheetIndex=0 -> itemIndex = 0+2 = 2 (CORRECT - row 2)
idx=1 -> sheetIndex=1 -> itemIndex = 1+2 = 3 (CORRECT - row 3)

Actually correct! But fragile.
```

**Fix (Make it explicit):**
```javascript
// BEFORE:
itemIndex: item.source === "GoogleSheet" ? item.sheetIndex + 2 : -1,

// AFTER (with explanation):
// Sheet structure: Row 1 = headers, data starts at row 2
// idx from forEach is 0-based, so idx=0 means row 2
itemIndex: item.source === "GoogleSheet" ? item.sheetIndex + 2 : -1,
// Add validation in Code.js to confirm row exists
```

**Test Plan:**
```bash
# Test 1: Verify correct row updates
1. Add 5 items to BiddingItems sheet (rows 2-6)
2. Start auction
3. Let first item (row 2) complete with winner
4. Check BiddingItems:
   - Row 2 should have winner name in column D
   - Row 2 should have winning bid in column E
   - Other rows unchanged

# Test 2: Multiple items
1. Complete all 5 items in auction
2. Verify each row 2-6 has correct winner data
3. No data in wrong rows
```

---

### **BUG #4: No Error Handling on Google Sheets Fetch**
**Location:** `auctioneering.js:110-124, 221-225`

**Issue:**
```javascript
// Line 221-225 - If fetch fails, auction doesn't start
const sheetItems = await fetchSheetItems(config.sheet_webhook_url);
if (!sheetItems) {
  await channel.send(`❌ Failed to load items`);
  return; // Auction canceled
}
```

**Impact:**
- Temporary network issues block auction completely
- No retry logic
- Manual intervention required

**Fix:**
```javascript
// Add retry logic
async function fetchSheetItems(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getBiddingItems" }),
        timeout: 10000 // 10s timeout
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return data.items || [];
    } catch (e) {
      console.error(`${EMOJI.ERROR} Fetch items attempt ${i+1}:`, e);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
      }
    }
  }
  return null; // All retries failed
}
```

**Test Plan:**
```bash
# Test 1: Network resilience
1. Temporarily break Google Sheets webhook URL
2. Try to start auction
3. Fix URL after first retry
4. Verify auction starts on retry

# Test 2: Timeout handling
1. Add artificial delay in Code.js (10s sleep)
2. Start auction
3. Verify timeout and retry
```

---

### **BUG #5: No Validation of Sheet Data Structure**
**Location:** `Code.js:411-445`

**Issue:**
```javascript
// Line 419 - Assumes 12 columns exist
const dataRange = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
// What if sheet only has 10 columns?
// What if columns reordered?
```

**Impact:**
- Bot crashes if sheet structure changes
- No validation of column headers
- Silent data corruption if columns misaligned

**Fix:**
```javascript
// Add header validation in Code.js
function getBiddingItems(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found', {items: []});

  // Validate headers
  const headers = sheet.getRange(1, 1, 1, 12).getValues()[0];
  const expectedHeaders = ['Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid',
                           'Auction Start', 'Auction End', 'Timestamp', 'Total Bids',
                           'Source', 'Quantity', 'Boss'];

  for (let i = 0; i < expectedHeaders.length; i++) {
    if (headers[i] !== expectedHeaders[i]) {
      Logger.log(`⚠️ Header mismatch at column ${i+1}: expected "${expectedHeaders[i]}", got "${headers[i]}"`);
      // Continue but log warning
    }
  }

  // Rest of function...
}
```

**Test Plan:**
```bash
# Test 1: Column validation
1. Manually rename a column header in BiddingItems
2. Try to fetch items
3. Verify warning logged but doesn't crash

# Test 2: Missing columns
1. Delete column L (Boss) from sheet
2. Try to fetch items
3. Verify graceful handling
```

---

## 🧪 COMPREHENSIVE TEST SCENARIO

### **End-to-End Auction Test**

```bash
# Setup Phase
1. Clear all data from BiddingItems sheet
2. Add test data:
   Row 2: "Dragon Sword" | 1000 | 30 | | | | | | | GoogleSheet | 1 | EGO 10/28/25 15:30
   Row 3: "Magic Ring" | 500 | 15 | | | | | | | GoogleSheet | 1 | EGO 10/28/25 15:30
   Row 4: "Shield" | 750 | 20 | | | | | | | GoogleSheet | 1 | VIORENT 10/28/25 16:00

3. Create test attendance:
   - !spawn ego → Members: Alice, Bob, Charlie check in
   - !spawn viorent → Members: Dave, Eve check in

# Execution Phase
4. Start auction: !startauction

5. Verify session display:
   ✅ "2 session(s) queued"
   ✅ "SESSION 1 - EGO: 2 item(s) - 3 attendees"
   ✅ "SESSION 2 - VIORENT: 1 item(s) - 2 attendees"

6. Test bidding restrictions:
   - Alice bids on Dragon Sword: ✅ ALLOWED
   - Dave tries to bid on Dragon Sword: ❌ BLOCKED (not EGO attendee)

7. Complete first item:
   - Alice bids 1200pts
   - Wait for auction to end
   - Verify: "SOLD! Winner: Alice - 1200pts"

8. Check Google Sheets (BiddingItems):
   ✅ Row 2 Column D: "Alice"
   ✅ Row 2 Column E: 1200
   ✅ Row 2 Column F-G: Timestamps
   ✅ Row 2 Column H: Updated timestamp

9. Complete session:
   - Let all items finish
   - Verify final summary message

10. Check BiddingPoints sheet:
    ✅ New column created: "10/28/25 15:30 #1"
    ✅ Alice row shows: -1200 (points spent)
    ✅ Bob/Charlie rows show: 0

# Validation Phase
11. Verify data integrity:
    - All winners logged correctly
    - All prices logged correctly
    - All timestamps match
    - No duplicate columns
    - No data in wrong rows

12. Check admin logs channel:
    ✅ Session summary posted
    ✅ Revenue totals correct
    ✅ Item counts match

13. Verify state cleared:
    - auctionState.active = false
    - auctionState.sessions = []
    - auctionState.sessionItems = []
```

---

## 🔧 FIX IMPLEMENTATION ORDER

### **Phase 1: Critical Fixes (Deploy First)**

1. **Fix itemQueue references** (15 minutes)
   - Lines: 496, 768, 1391
   - Risk: LOW (just changing variable reference)
   - Test: Start auction, verify display

2. **Add postToSheet null checks** (20 minutes)
   - Lines: 705, 832
   - Risk: LOW (adding safety checks)
   - Test: Start auction, verify no crashes

3. **Add error logging to silent catches** (10 minutes)
   - Lines: index2.js:2304, 2314
   - Risk: NONE (just adding logs)
   - Test: Verify logs appear

### **Phase 2: Data Integrity** (30 minutes)

4. **Add retry logic to fetchSheetItems**
   - Risk: LOW (improves reliability)
   - Test: Simulate network issues

5. **Add sheet structure validation**
   - Risk: LOW (early warning system)
   - Test: Modify sheet headers

### **Phase 3: Polish** (20 minutes)

6. **Add comments explaining itemIndex calculation**
7. **Add data validation logs**
8. **Update error messages**

**Total Time:** ~2 hours

---

## ⚠️ ROLLBACK PLAN

If auction breaks after fixes:

1. **Immediately:** Revert to previous commit
   ```bash
   git revert HEAD
   git push -f origin main
   ```

2. **Check logs:** Identify specific error

3. **Manual recovery:**
   - Access BiddingItems sheet
   - Manually record auction results
   - Update BiddingPoints manually

4. **Communication:**
   - Notify members of issue
   - Reschedule auction if needed

---

## 📋 PRE-DEPLOYMENT CHECKLIST

Before deploying to Koyeb:

- [ ] All 5 bugs fixed
- [ ] End-to-end test passed
- [ ] Google Sheets test passed
- [ ] Error logs reviewed
- [ ] Backup of current code
- [ ] Admin roles verified
- [ ] Channel IDs correct
- [ ] Webhook URL valid
- [ ] State sync tested
- [ ] Memory usage acceptable

---

## 🚀 DEPLOYMENT STEPS

1. **Commit fixes to test branch**
   ```bash
   git checkout -b fix/auction-sheets-critical
   git add .
   git commit -m "Fix critical auction/sheets bugs"
   ```

2. **Test locally** (DO NOT SKIP)
   - Run all test scenarios above
   - Verify Google Sheets integration
   - Check error handling

3. **Deploy to staging** (if available)
   - Test with real Discord server
   - Verify with small auction

4. **Deploy to production**
   - Merge to main
   - Monitor Koyeb logs closely
   - Watch first auction carefully

5. **Post-deployment monitoring**
   - Watch logs for 24 hours
   - Verify sheet updates
   - Check member reports

---

**CRITICAL:** Do NOT deploy during an active auction. Wait until after current session completes.
