# Phase 4: Core Refactor - Implementation Plan

**Status**: 🚀 Ready to Begin
**Dependencies**: Phase 3 ✅ (Data migrated)
**Estimated Time**: 2-3 days
**Goal**: Update bot code to use MongoDB as primary data source

---

## 📋 Overview

Phase 4 refactors the core bot modules to use MongoDB for all data operations, with Google Sheets as a secondary backup/audit trail.

**Strategy**: MongoDB-first with background Sheet sync
```
Old Flow: Discord → Bot → Sheets API (500-2000ms)
New Flow: Discord → Bot → MongoDB (10-50ms) → Background Sheets Sync
```

---

## 🎯 Modules to Refactor

### 1. **bidding.js** (Highest Priority)
**Current Sheet API Calls:**
- `getBiddingPointsSummary()` - Get all member points
- `submitBiddingResults()` - Update points after auction
- `getBotState()` / `saveBotState()` - Crash recovery
- `getBiddingItemsWithWinners()` - Auction history

**MongoDB Operations Needed:**
```javascript
// Get member points
const member = await db.members.findOne({ username });
return member.pointsAvailable;

// Update points after auction
await db.members.updateOne(
  { username },
  { $inc: { pointsAvailable: -bidAmount, pointsSpent: bidAmount } }
);

// Background sync to Sheets (non-blocking)
syncToSheet({ action: 'updatePoints', data: member });
```

**Files to Update:**
- `bidding.js:836` - getBiddingPointsSummary
- `bidding.js:868` - submitBiddingResults
- `bidding.js:1651` - saveBotState
- `bidding.js:1663` - getBotState

---

### 2. **auctioneering.js** (High Priority)
**Current Sheet API Calls:**
- `getBiddingItems()` - Get auction queue
- `logAuctionResult()` - Log sold item
- `getBiddingPoints()` - Check member points
- `moveAuctionedItemsToForDistribution()` - Move sold items
- `saveBotState()` - Crash recovery

**MongoDB Operations Needed:**
```javascript
// Get auction queue
const items = await db.auctionItems.find({ status: 'pending' })
  .sort({ addedAt: 1 })
  .toArray();

// Mark item as sold
await db.auctionItems.updateOne(
  { _id: itemId },
  {
    $set: {
      status: 'sold',
      winner: username,
      winnerId: userId,
      winningBid: bidAmount,
      soldAt: new Date()
    }
  }
);

// Background sync to Sheets
syncToSheet({ action: 'updateAuctionItem', data: item });
```

**Files to Update:**
- `auctioneering.js:433` - getBiddingItems
- `auctioneering.js:520` - logAuctionResult
- `auctioneering.js:689` - getBiddingPoints
- `auctioneering.js:1908` - moveAuctionedItemsToForDistribution
- `auctioneering.js:597` - saveBotState

---

### 3. **attendance.js** (Medium Priority)
**Current Sheet API Calls:**
- `submitAttendance()` - Save attendance to sheet
- `getAttendanceState()` / `saveAttendanceState()` - State management

**MongoDB Operations Needed:**
```javascript
// Save new attendance record
await db.attendance.insertOne({
  memberId: userId,
  memberName: username,
  bossName: bossName,
  bossPoints: points,
  timestamp: new Date(),
  weekStartDate: getWeekStart(),
  weekLabel: getWeekLabel(),
  verified: false,
  threadId: threadId,
  createdAt: new Date()
});

// Update member stats
await db.members.updateOne(
  { _id: userId },
  {
    $inc: {
      'attendance.total': 1,
      'attendance.thisWeek': 1,
      pointsEarned: points,
      pointsAvailable: points
    },
    $set: { lastActive: new Date() }
  }
);

// Background sync to Sheets
syncToSheet({ action: 'addAttendance', data: attendance });
```

**Files to Update:**
- `attendance.js:192` - submitAttendance
- `attendance.js:1232` - saveAttendanceState
- `attendance.js:1274` - getAttendanceState

---

### 4. **index2.js** (Command Updates)
**Commands to Update:**
- `!mypoints` - Read from MongoDB members collection
- `!stats` - Read from MongoDB members + attendance
- `!leaderboard` - Query MongoDB with aggregation
- `!bid` - Check MongoDB for points before bidding
- `!removemember` - Update MongoDB + sync to Sheet

**Files to Update:**
- `index2.js:2226` - getMemberStats command
- `index2.js:3727` - removeMember command

---

## 🔧 New Components to Create

### 1. **Background Sync Service** (`services/sheet-sync.js`)

```javascript
/**
 * Background sync service - MongoDB → Google Sheets
 * Syncs changes without blocking user requests
 */

const syncQueue = [];
let syncTimer = null;

function queueSync(syncAction) {
  syncQueue.push(syncAction);

  // Debounce: wait 5 seconds before syncing
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(processSyncQueue, 5000);
}

async function processSyncQueue() {
  if (syncQueue.length === 0) return;

  const actions = [...syncQueue];
  syncQueue.length = 0;

  for (const action of actions) {
    try {
      await syncToSheet(action);
    } catch (error) {
      console.error('Sync error:', error);
      // Retry logic here
    }
  }
}

async function syncToSheet(action) {
  switch (action.type) {
    case 'updatePoints':
      await sheetAPI.call('submitBiddingResults', action.data);
      break;
    case 'addAttendance':
      await sheetAPI.call('submitAttendance', action.data);
      break;
    case 'updateAuctionItem':
      await sheetAPI.call('logAuctionResult', action.data);
      break;
  }
}

module.exports = { queueSync };
```

---

### 2. **MongoDB Helper Functions** (`utils/mongodb-helpers.js`)

```javascript
/**
 * Helper functions for MongoDB operations
 */

const dbAPI = require('./database-api');

async function getMemberByUsername(username) {
  const db = await dbAPI.connect();
  return await db.collection('members').findOne({ username });
}

async function getMemberByDiscordId(userId) {
  const db = await dbAPI.connect();
  return await db.collection('members').findOne({ _id: userId });
}

async function updateMemberPoints(userId, pointsChange) {
  const db = await dbAPI.connect();
  return await db.collection('members').updateOne(
    { _id: userId },
    { $inc: { pointsAvailable: pointsChange } }
  );
}

async function addAttendanceRecord(attendance) {
  const db = await dbAPI.connect();
  return await db.collection('attendance').insertOne(attendance);
}

async function getAuctionQueue() {
  const db = await dbAPI.connect();
  return await db.collection('auctionItems')
    .find({ status: 'pending' })
    .sort({ addedAt: 1 })
    .toArray();
}

async function markItemAsSold(itemId, winner, winningBid) {
  const db = await dbAPI.connect();
  return await db.collection('auctionItems').updateOne(
    { _id: itemId },
    {
      $set: {
        status: 'sold',
        winner: winner.username,
        winnerId: winner.userId,
        winningBid: winningBid,
        soldAt: new Date()
      }
    }
  );
}

module.exports = {
  getMemberByUsername,
  getMemberByDiscordId,
  updateMemberPoints,
  addAttendanceRecord,
  getAuctionQueue,
  markItemAsSold
};
```

---

### 3. **Discord ID Mapper** (`utils/discord-id-mapper.js`)

```javascript
/**
 * Maps Discord IDs to member documents
 * Updates temp IDs to real Discord IDs
 */

const dbAPI = require('./database-api');

async function mapDiscordIdToMember(username, discordId) {
  const db = await dbAPI.connect();

  // Find member by username
  const member = await db.collection('members').findOne({ username });

  if (!member) return null;

  // Update with real Discord ID
  if (member._id.startsWith('temp_')) {
    await db.collection('members').updateOne(
      { username },
      {
        $set: {
          _id: discordId,
          discordId: discordId,
          lastUpdated: new Date()
        }
      }
    );
  }

  return discordId;
}

async function ensureMemberExists(discordUser) {
  const db = await dbAPI.connect();
  const { id, username } = discordUser;

  // Check if member exists
  let member = await db.collection('members').findOne({
    $or: [{ _id: id }, { username }]
  });

  if (!member) {
    // Create new member
    member = {
      _id: id,
      username: username,
      pointsAvailable: 0,
      pointsEarned: 0,
      pointsSpent: 0,
      attendance: {
        total: 0,
        thisWeek: 0,
        thisMonth: 0,
        byBoss: {},
        streak: { current: 0, longest: 0 }
      },
      joinedAt: new Date(),
      lastActive: new Date()
    };

    await db.collection('members').insertOne(member);
  }

  return member;
}

module.exports = { mapDiscordIdToMember, ensureMemberExists };
```

---

## 📝 Implementation Steps

### **Step 1: Create Helper Modules** (Day 1, Morning)
1. Create `services/sheet-sync.js`
2. Create `utils/mongodb-helpers.js`
3. Create `utils/discord-id-mapper.js`
4. Test helper functions

### **Step 2: Refactor Bidding Module** (Day 1, Afternoon)
1. Update `getBiddingPointsSummary()` to read from MongoDB
2. Update `submitBiddingResults()` to write to MongoDB + queue sync
3. Test `!mypoints` command
4. Test point deduction during auction
5. Verify Sheet sync works

### **Step 3: Refactor Auctioneering Module** (Day 2, Morning)
1. Update `getBiddingItems()` to read from MongoDB
2. Update `logAuctionResult()` to write to MongoDB + queue sync
3. Update `getBiddingPoints()` to use MongoDB
4. Test `!startauction` command
5. Test `!bid` command
6. Verify auction flow works end-to-end

### **Step 4: Refactor Attendance Module** (Day 2, Afternoon)
1. Update `submitAttendance()` to write to MongoDB
2. Update member stats calculation
3. Map Discord IDs when members post attendance
4. Test attendance thread creation
5. Test member verification
6. Verify Sheet sync works

### **Step 5: Update Commands** (Day 3, Morning)
1. Update `!mypoints` to show MongoDB data
2. Update `!stats` to query MongoDB
3. Update `!leaderboard` to use MongoDB aggregation
4. Update `!removemember` to update MongoDB
5. Test all commands

### **Step 6: Testing & Verification** (Day 3, Afternoon)
1. Test complete auction flow
2. Test attendance tracking
3. Test crash recovery
4. Verify all data syncs to Sheets
5. Check MongoDB Atlas for data integrity
6. Performance testing (response times)

---

## 🧪 Testing Checklist

### **Bidding Tests**
- [ ] `!mypoints` shows correct balance
- [ ] Points deducted after winning auction
- [ ] Points updated in MongoDB
- [ ] Sheet sync works (verify in Google Sheets)

### **Auction Tests**
- [ ] `!startauction` loads items from MongoDB
- [ ] `!bid` checks points from MongoDB
- [ ] Item marked as sold in MongoDB
- [ ] Winner receives item
- [ ] Points deducted correctly
- [ ] ForDistribution sheet updated

### **Attendance Tests**
- [ ] Thread creation works
- [ ] Members can post attendance
- [ ] Attendance saved to MongoDB
- [ ] Member stats updated
- [ ] Discord IDs mapped correctly
- [ ] Sheet sync works

### **Performance Tests**
- [ ] `!mypoints` responds under 50ms
- [ ] `!bid` validates under 20ms
- [ ] Attendance save under 100ms
- [ ] No lag during auctions
- [ ] Sheet sync doesn't block commands

---

## ⚠️ Important Notes

### **Backward Compatibility**
- Keep Sheet sync for admin access
- Historical data remains in Sheets
- Formulas protected (not overwritten)

### **Error Handling**
- MongoDB errors don't crash bot
- Fallback to Sheets if MongoDB fails
- Retry logic for Sheet sync
- Log all errors for debugging

### **Discord ID Mapping**
- Map IDs when users interact
- Update temp IDs to real IDs
- Handle users who change usernames
- Verify IDs before operations

### **Data Integrity**
- Validate before MongoDB write
- Atomic operations (transactions if needed)
- Verify sync completed
- Regular data validation checks

---

## 🎯 Success Criteria

Phase 4 is complete when:
- ✅ All commands use MongoDB as primary data source
- ✅ Response times under 50ms (vs 500-2000ms before)
- ✅ Sheet sync works in background (non-blocking)
- ✅ Discord IDs mapped to all active members
- ✅ Auction flow works end-to-end
- ✅ Attendance tracking works
- ✅ No errors in production logs
- ✅ All tests pass

---

## 📚 Reference

- **Current Code**: bidding.js, auctioneering.js, attendance.js
- **MongoDB Schema**: docs/MONGODB_SCHEMA.md
- **Database API**: utils/database-api.js
- **Migration Plan**: docs/MONGODB_MIGRATION.md

---

**Last Updated**: Nov 29, 2025
**Status**: Ready to Begin
**Next**: Create helper modules
