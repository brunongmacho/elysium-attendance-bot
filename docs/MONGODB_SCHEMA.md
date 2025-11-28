# MongoDB Database Schema

## 📚 Collections Overview

Total Collections: **7**

| Collection | Purpose | Est. Documents | Est. Size |
|------------|---------|----------------|-----------|
| `attendance` | All attendance records | 405,600/year | 80MB |
| `members` | Member points + stats | 50 | 100KB |
| `auctionItems` | Auction queue + history | 500/year | 250KB |
| `auctionSessions` | Session audit trail | 52/year | 520KB |
| `botState` | Crash recovery state | 3 | 10KB |
| `bossRotation` | Alliance rotation | 30 | 30KB |
| `eventReminders` | Event reminders | 50 | 50KB |

**Total Storage** (Year 1): ~81MB (well under 512MB free tier)

---

## 1. 📝 Attendance Collection

**Collection Name**: `attendance`

**Purpose**: Store all attendance records (one document per boss spawn per member)

### Document Structure
```javascript
{
  _id: ObjectId("674a3b2e9f1c2a3b4c5d6e7f"),
  memberId: "discord_user_id_123456789",      // Discord user ID
  memberName: "PlayerName",                    // Discord username
  bossName: "Laphine Queen",                   // Boss name
  bossPoints: 10,                              // Points earned
  timestamp: ISODate("2025-11-28T14:30:00Z"),  // When boss was killed
  weekStartDate: ISODate("2025-11-24T00:00:00Z"), // Week start (for grouping)
  weekLabel: "ELYSIUM_WEEK_11_24",             // Sheet tab name
  verified: true,                              // Admin verified
  verifiedBy: "admin_discord_id",              // Who verified
  threadId: "discord_thread_id_123",           // Thread where posted
  lateSubmission: false,                       // Added via manual Sheet edit?
  lateWarning: false,                          // >2 days late?
  addedBy: null,                               // Admin who added (if manual)
  createdAt: ISODate("2025-11-28T14:30:00Z")   // Record creation time
}
```

### Indexes
```javascript
db.attendance.createIndex({ memberId: 1, timestamp: -1 })  // Member history
db.attendance.createIndex({ weekStartDate: 1 })            // Week queries
db.attendance.createIndex({ bossName: 1 })                 // Boss queries
db.attendance.createIndex({ weekLabel: 1 })                // Sheet sync
```

### Example Queries
```javascript
// Get all attendance for a member
db.attendance.find({ memberId: "123456789" }).sort({ timestamp: -1 })

// Get this week's attendance
db.attendance.find({ weekStartDate: ISODate("2025-11-24T00:00:00Z") })

// Count by boss
db.attendance.aggregate([
  { $group: { _id: "$bossName", count: { $sum: 1 } } }
])

// Get member's boss breakdown
db.attendance.aggregate([
  { $match: { memberId: "123456789" } },
  { $group: { _id: "$bossName", count: { $sum: 1 } } }
])
```

---

## 2. 👥 Members Collection

**Collection Name**: `members`

**Purpose**: Store member points, stats, and aggregated data

### Document Structure
```javascript
{
  _id: "discord_user_id_123456789",  // Discord user ID (primary key)
  username: "PlayerName",             // Discord username

  // Points (for bidding)
  pointsAvailable: 150,               // Current balance
  pointsEarned: 200,                  // Lifetime attendance points
  pointsSpent: 50,                    // Lifetime auction spending

  // Attendance stats (aggregated from attendance collection)
  attendance: {
    total: 87,                        // Overall boss kills
    thisWeek: 5,                      // This week's attendance
    thisMonth: 18,                    // This month's attendance
    byBoss: {                         // Breakdown by boss
      "Laphine Queen": 25,
      "Scaraba Queen": 22,
      "Verus": 20
    },
    streak: {
      current: 12,                    // Current spawn streak
      longest: 45                     // Longest streak ever
    }
  },

  // Metadata
  joinedAt: ISODate("2024-01-15T00:00:00Z"),
  lastActive: ISODate("2025-11-28T14:30:00Z"),
  lastSyncedToSheet: ISODate("2025-11-28T10:00:00Z")
}
```

### Indexes
```javascript
db.members.createIndex({ username: 1 }, { unique: true })  // Unique usernames
db.members.createIndex({ pointsAvailable: -1 })            // Leaderboards
```

### Example Queries
```javascript
// Get member by username
db.members.findOne({ username: "PlayerName" })

// Get top 10 by points
db.members.find({}).sort({ pointsAvailable: -1 }).limit(10)

// Get top 10 by attendance
db.members.find({}).sort({ "attendance.total": -1 }).limit(10)

// Update points after auction
db.members.updateOne(
  { _id: "123456789" },
  { $inc: { pointsAvailable: -45, pointsSpent: 45 } }
)
```

---

## 3. 🎯 Auction Items Collection

**Collection Name**: `auctionItems`

**Purpose**: Track auction queue and item history

### Document Structure
```javascript
{
  _id: ObjectId("674a3b2e9f1c2a3b4c5d6e7f"),
  itemName: "Evil Glove [1]",
  startPrice: 40,
  duration: 30,                       // Seconds
  quantity: 1,
  boss: "Laphine Queen",              // Which boss dropped it
  source: "manual",                   // manual, loot_drop, queue

  // Auction state
  status: "pending",                  // pending, active, sold, cancelled

  // Winner info (filled during auction)
  winner: null,                       // Winner username
  winnerId: null,                     // Winner Discord ID
  winningBid: null,                   // Final bid amount
  totalBids: 0,                       // Number of bids placed

  // Timestamps
  addedAt: ISODate("2025-11-22T10:00:00Z"),
  auctionStartTime: null,
  auctionEndTime: null,
  soldAt: null,

  // Sheet sync
  sheetRow: 5,                        // Which row in BiddingItems
  lastSyncedToSheet: ISODate("2025-11-28T10:00:00Z")
}
```

### Status Flow
```
pending → active → sold
   ↓
cancelled
```

### Indexes
```javascript
db.auctionItems.createIndex({ status: 1 })     // Query by status
db.auctionItems.createIndex({ addedAt: -1 })   // Recent items
```

### Example Queries
```javascript
// Get pending auction queue
db.auctionItems.find({ status: "pending" }).sort({ addedAt: 1 })

// Get active item
db.auctionItems.findOne({ status: "active" })

// Mark item as sold
db.auctionItems.updateOne(
  { _id: ObjectId("...") },
  {
    $set: {
      status: "sold",
      winner: "PlayerName",
      winnerId: "123456789",
      winningBid: 45,
      soldAt: new Date()
    }
  }
)

// Get items won by member
db.auctionItems.find({ winnerId: "123456789", status: "sold" })
```

---

## 4. 📊 Auction Sessions Collection

**Collection Name**: `auctionSessions`

**Purpose**: Track each auction session for audit trail and BiddingPoints columns

### Document Structure
```javascript
{
  _id: ObjectId("674a3b2e9f1c2a3b4c5d6e7f"),
  sessionNumber: 1,
  sessionDate: "11/23/24 12:00",
  sessionLabel: "11/23/24 12:00 #1",  // For Sheet column header

  startTime: ISODate("2025-11-23T12:00:00Z"),
  endTime: ISODate("2025-11-23T14:30:00Z"),

  // Items auctioned in this session
  items: [
    {
      itemId: ObjectId("..."),
      itemName: "Evil Glove [1]",
      winner: "PlayerName",
      winnerId: "discord_user_id",
      winningBid: 45
    },
    {
      itemId: ObjectId("..."),
      itemName: "Sniping Suit [1]",
      winner: "OtherPlayer",
      winnerId: "discord_user_id_2",
      winningBid: 35
    }
  ],

  // Points spent per member (for BiddingPoints columns)
  memberSpending: [
    { memberId: "discord_user_id", memberName: "PlayerName", totalSpent: 45 },
    { memberId: "discord_user_id_2", memberName: "OtherPlayer", totalSpent: 35 },
    { memberId: "discord_user_id_3", memberName: "ThirdPlayer", totalSpent: 0 }
  ],

  totalItemsSold: 2,
  totalPointsSpent: 80,

  // Sheet sync
  syncedToSheet: true,
  sheetColumn: "E"                    // Which column in BiddingPoints
}
```

### Indexes
```javascript
db.auctionSessions.createIndex({ sessionDate: -1 })    // Recent sessions
db.auctionSessions.createIndex({ sessionNumber: 1 }, { unique: true })
```

### Example Queries
```javascript
// Get latest session
db.auctionSessions.findOne({}).sort({ sessionNumber: -1 })

// Get session by number
db.auctionSessions.findOne({ sessionNumber: 5 })

// Get member's spending history
db.auctionSessions.aggregate([
  { $unwind: "$memberSpending" },
  { $match: { "memberSpending.memberId": "123456789" } },
  { $group: {
    _id: null,
    totalSpent: { $sum: "$memberSpending.totalSpent" }
  }}
])
```

---

## 5. 🔄 Bot State Collection

**Collection Name**: `botState`

**Purpose**: Store bot state for crash recovery

### Documents

#### Attendance State
```javascript
{
  _id: "attendance_state",
  activeSpawns: [
    {
      threadId: "discord_thread_id_123",
      channelId: "discord_channel_id",
      bossName: "Laphine Queen",
      bossPoints: 10,
      timestamp: "11/28/25 14:30",
      members: [
        { userId: "123", username: "Player1", verified: true },
        { userId: "456", username: "Player2", verified: false }
      ],
      createdAt: ISODate("2025-11-28T14:30:00Z"),
      expiresAt: ISODate("2025-11-28T15:00:00Z")
    }
  ],
  lastUpdated: ISODate("2025-11-28T14:35:00Z"),
  version: 5  // Incremented on each update
}
```

#### Auction State
```javascript
{
  _id: "auction_state",
  active: true,
  sessionNumber: 5,
  sessionStartTime: ISODate("2025-11-23T12:00:00Z"),

  currentItem: {
    itemId: ObjectId("..."),
    itemName: "Evil Glove [1]",
    startPrice: 40,
    currentBid: 45,
    currentBidder: "PlayerName",
    currentBidderId: "discord_user_id",
    timerEndsAt: ISODate("2025-11-23T12:05:00Z")
  },

  queue: [
    { itemId: ObjectId("..."), itemName: "Sniping Suit [1]" },
    { itemId: ObjectId("..."), itemName: "Auto-Armor Shoes [1]" }
  ],

  itemsSoldThisSession: 3,
  lastUpdated: ISODate("2025-11-23T12:03:00Z"),
  version: 47
}
```

#### Boss Timers
```javascript
{
  _id: "boss_timers",
  timers: [
    {
      bossName: "Laphine Queen",
      lastSpawn: ISODate("2025-11-28T14:00:00Z"),
      nextSpawn: ISODate("2025-11-28T16:00:00Z"),
      notified: true,
      channel: "spawn_alerts"
    }
  ],
  lastUpdated: ISODate("2025-11-28T14:30:00Z")
}
```

### No Indexes Needed
(Only 3 documents, queried by _id)

---

## 6. 🔁 Boss Rotation Collection

**Collection Name**: `bossRotation`

**Purpose**: Track alliance rotation for boss spawns

### Document Structure
```javascript
{
  _id: ObjectId("674a3b2e9f1c2a3b4c5d6e7f"),
  bossName: "Laphine Queen",

  guilds: [
    { name: "ELYSIUM", index: 0 },
    { name: "AllyGuild1", index: 1 },
    { name: "AllyGuild2", index: 2 }
  ],

  currentTurnIndex: 0,              // ELYSIUM's turn
  currentGuild: "ELYSIUM",

  rotationFrequency: "weekly",
  lastRotation: ISODate("2025-11-24T00:00:00Z"),
  nextRotation: ISODate("2025-12-01T00:00:00Z"),

  lastUpdated: ISODate("2025-11-24T10:00:00Z")
}
```

### Indexes
```javascript
db.bossRotation.createIndex({ bossName: 1 }, { unique: true })
db.bossRotation.createIndex({ currentGuild: 1 })
```

### Example Queries
```javascript
// Get rotation for specific boss
db.bossRotation.findOne({ bossName: "Laphine Queen" })

// Get all bosses where it's ELYSIUM's turn
db.bossRotation.find({ currentGuild: "ELYSIUM" })

// Rotate to next guild
db.bossRotation.updateOne(
  { bossName: "Laphine Queen" },
  {
    $set: {
      currentTurnIndex: 1,
      currentGuild: "AllyGuild1",
      lastRotation: new Date()
    }
  }
)
```

---

## 7. ⏰ Event Reminders Collection

**Collection Name**: `eventReminders`

**Purpose**: Store event reminders for automatic notifications

### Document Structure
```javascript
{
  _id: ObjectId("674a3b2e9f1c2a3b4c5d6e7f"),
  eventType: "boss_spawn",            // boss_spawn, auction, guild_event, custom
  eventName: "Laphine Queen Spawn",
  reminderTime: ISODate("2025-11-28T14:00:00Z"),
  notifyBefore: 1800,                 // Seconds (30 minutes before)

  // Notification settings
  channelId: "discord_channel_id",
  message: "Laphine Queen spawning in 30 minutes!",
  mentionRole: "discord_role_id",

  // Recurrence
  recurring: true,
  recurrenceRule: "weekly",           // daily, weekly, custom

  // Status
  triggered: false,
  lastTriggered: null,
  nextTrigger: ISODate("2025-12-05T14:00:00Z"),

  // Metadata
  createdBy: "admin_discord_id",
  createdAt: ISODate("2025-11-01T10:00:00Z"),
  active: true
}
```

### Indexes
```javascript
db.eventReminders.createIndex({ nextTrigger: 1, active: 1 })  // Find due reminders
db.eventReminders.createIndex({ eventType: 1 })
```

### Example Queries
```javascript
// Get all due reminders
db.eventReminders.find({
  active: true,
  nextTrigger: { $lte: new Date() }
})

// Get all boss spawn reminders
db.eventReminders.find({ eventType: "boss_spawn", active: true })

// Mark as triggered and schedule next
db.eventReminders.updateOne(
  { _id: ObjectId("...") },
  {
    $set: {
      triggered: true,
      lastTriggered: new Date(),
      nextTrigger: ISODate("2025-12-05T14:00:00Z")
    }
  }
)
```

---

## 📊 Storage Estimates

### Attendance Collection
```
405,600 records (50 members × 156 spawns/week × 52 weeks)
~200 bytes per document
= 81,120,000 bytes
= ~80MB
```

### Members Collection
```
50 members
~2KB per document
= 100KB
```

### Auction Items Collection
```
~500 items/year
~500 bytes per document
= 250KB
```

### Auction Sessions Collection
```
52 sessions/year
~10KB per document
= 520KB
```

### Other Collections
```
botState: 3 documents × ~3KB = 10KB
bossRotation: 30 documents × 1KB = 30KB
eventReminders: 50 documents × 1KB = 50KB
```

### Total Year 1
```
80MB + 100KB + 250KB + 520KB + 10KB + 30KB + 50KB
= ~81MB

MongoDB Atlas Free Tier: 512MB
Usage: ~16% (plenty of room!)
```

---

**Last Updated**: Nov 28, 2025
**Database**: `elysium-bot`
**Cluster**: `elysium-bot-cluster` (Singapore)
