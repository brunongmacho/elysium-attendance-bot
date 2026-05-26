# Elysium Discord Bot - Exploration Summary

## 📊 Bot Architecture Overview

### System Statistics
- **Repository:** https://github.com/brunongmacho/elysium-attendance-bot
- **Codebase:** 57,320+ lines of code
- **Commands:** 50+ commands with 200+ aliases
- **Bosses Tracked:** 37 total (22 timer-based + 14 schedule-based + 1 GvG)
- **Performance:** 40-200x faster than legacy Google Sheets system
- **RAM Usage:** 95-105MB (optimized for 512MB instances)
- **Platform:** Koyeb deployment with MongoDB Atlas (Singapore)

---

## 🗄️ MongoDB Database Architecture

### Collections Summary (7 total, ~81MB Year 1)

| Collection | Documents | Size | Purpose |
|------------|-----------|------|---------|
| `attendance` | ~400K/year | 80MB | Boss kill records |
| `members` | ~50 | 100KB | Player profiles & stats |
| `auctionItems` | ~500/year | 250KB | Auction queue & history |
| `auctionSessions` | ~52/year | 520KB | Session audit trail |
| `bossTimers` | ~37 | 50KB | Boss spawn timers |
| `bossRotation` | ~30 | 30KB | Alliance rotation |
| `botState` | 3 | 10KB | Crash recovery state |
| `eventReminders` | ~50 | 50KB | Event notifications |

**Total Storage:** ~81MB (well under 512MB free tier limit)

---

## 🎮 Boss System Details

### Timer-Based Bosses (22 bosses)
Spawn at **kill time + interval**. Tracked in `bossTimers` collection.

**Intervals:**
- **10 hours:** Venatus, Viorent
- **21 hours:** Ego
- **24 hours:** Livera, Araneo, Undomiel
- **18 hours:** Lady Dalia
- **29 hours:** General Aquleus, Amentis
- **32 hours:** Baron Braudmore, Gareth
- **35 hours:** Shuliar, Larba, Catena
- **37 hours:** Titore
- **48 hours:** Wannitas, Metus, Duplican
- **62 hours:** Secreta, Ordo, Asta, Supore

### Schedule-Based Bosses (14 bosses)
Spawn at **fixed weekly times** (GMT+8 timezone).

**Examples:**
- **Clemantis:** Monday 11:30, Thursday 19:00
- **Saphirus:** Sunday 17:00, Tuesday 11:30
- **Guild Boss:** Monday 21:00 (weekly raid)
- **Milavy:** Saturday 15:00
- **Auraq:** Friday 22:00, Wednesday 21:00
- **Icaruthia:** Tuesday 21:00, Friday 21:00

### Points System
- **1 point:** Venatus, Viorent, Ego, Livera, etc. (14 bosses)
- **2 points:** Milavy, Wannitas, Metus, Shuliar, etc. (10 bosses)
- **3 points:** Catena, Auraq, Secreta, Asta, etc. (8 bosses)
- **4 points:** Icaruthia, Motti, Nevaeh (3 bosses)
- **5 points:** GvG (Guild vs Guild)
- **15 points:** Guild Boss (weekly raid)

---

## 📋 Key Data Models

### Member Document
```javascript
{
  _id: "discord_user_id_123456789",
  username: "PlayerName",

  // Points for auction bidding
  pointsAvailable: 150,
  pointsEarned: 200,
  pointsSpent: 50,

  // Attendance statistics
  attendance: {
    total: 87,
    thisWeek: 5,
    thisMonth: 18,
    byBoss: {
      "Venatus": 25,
      "Viorent": 22,
      "Ego": 20,
      // ... breakdown for all bosses
    },
    streak: {
      current: 12,    // Current consecutive days
      longest: 45     // Longest streak ever
    }
  },

  // Metadata
  joinedAt: ISODate("2024-01-15"),
  lastActive: ISODate("2025-11-28")
}
```

### Boss Timer Document
```javascript
{
  bossName: "Venatus",
  lastKillTime: ISODate("2025-11-28T14:00:00Z"),
  nextSpawnTime: ISODate("2025-11-29T00:00:00Z"),  // lastKillTime + 10 hours
  killedBy: "PlayerName",
  serverDown: false,
  updatedAt: ISODate("2025-11-28T14:00:00Z")
}
```

### Attendance Record
```javascript
{
  _id: ObjectId("674a3b2e9f1c2a3b4c5d6e7f"),
  memberId: "discord_user_id_123456789",
  memberName: "PlayerName",
  bossName: "Venatus",
  bossPoints: 1,
  timestamp: ISODate("2025-11-28T14:30:00Z"),
  weekStartDate: ISODate("2025-11-24T00:00:00Z"),
  weekLabel: "ELYSIUM_WEEK_11_24",
  verified: true,
  verifiedBy: "admin_discord_id",
  threadId: "discord_thread_id_123"
}
```

### Auction Item
```javascript
{
  _id: ObjectId("..."),
  itemName: "Evil Glove [1]",
  startPrice: 40,
  duration: 30,
  quantity: 1,
  boss: "Venatus",

  // Status flow: pending → active → sold/cancelled
  status: "sold",

  // Winner information
  winner: "PlayerName",
  winnerId: "discord_user_id",
  winningBid: 45,
  totalBids: 7,

  // Timestamps
  addedAt: ISODate("2025-11-22T10:00:00Z"),
  soldAt: ISODate("2025-11-22T14:30:00Z")
}
```

---

## 🔧 Key Bot Features

### 1. Attendance System
- Screenshot verification required
- Admin approval via ✅/❌ reactions
- 30-minute auto-close (prevents late cheating)
- Thread locking after submission
- Automatic points distribution
- Crash recovery with state restoration
- Duplicate prevention

### 2. Auction System
- Point-based bidding (all guild members can participate)
- Instant bid placement
- Auto-scheduler (Sunday 12:00 PM GMT+8)
- Race condition protection
- Session history tracking
- 10-minute cooldown between sessions
- Anti-snipe protection (auto-extend)

### 3. Boss Timer System
- Real-time spawn tracking
- 5-minute reminder notifications
- Auto-creates attendance threads
- Crash recovery from MongoDB
- Fallback to attendance records
- Schedule-based predictions
- Server down mode support

### 4. Boss Rotation System
- Multi-guild rotation tracking
- Auto-increment after kills
- 15-minute warnings for your guild's turn
- Daily schedule at 12:00 AM Manila time
- Smart spawn prediction
- Dynamic boss loading from Google Sheets

### 5. Analytics & Reporting
- Member statistics (attendance, points, streaks)
- Leaderboards (attendance & bidding)
- Activity heatmaps
- Boss distribution charts
- Weekly/monthly reports

---

## 🎯 Dashboard Data Access Patterns

### Boss Timers Dashboard
```javascript
// Get all boss timers
const timers = await db.collection('bossTimers').find({}).toArray();

// Fallback: Calculate from last attendance record
const lastSpawn = await db.collection('attendance')
  .find({ bossName: 'Venatus' })
  .sort({ timestamp: -1 })
  .limit(1)
  .toArray();

// Calculate next spawn using boss_spawn_config.json
const config = bossSpawnConfig.timerBasedBosses['Venatus'];
const nextSpawn = new Date(lastSpawn.timestamp.getTime() +
  config.spawnIntervalHours * 60 * 60 * 1000);
```

### Member Leaderboards
```javascript
// Attendance leaderboard (optimized query)
const attendanceLeaders = await db.collection('members')
  .find({ isActive: true })
  .project({
    username: 1,
    'attendance.total': 1,
    'attendance.streak': 1,
    pointsEarned: 1
  })
  .sort({ 'attendance.total': -1 })
  .limit(50)
  .toArray();

// Points leaderboard
const pointsLeaders = await db.collection('members')
  .find({ isActive: true })
  .project({
    username: 1,
    pointsAvailable: 1,
    pointsEarned: 1,
    pointsSpent: 1
  })
  .sort({ pointsAvailable: -1 })
  .limit(50)
  .toArray();
```

### Member Profile
```javascript
// Get member with full details
const member = await db.collection('members').findOne({ _id: userId });

// Recent boss kills (last 20)
const recentKills = await db.collection('attendance')
  .find({ memberId: userId })
  .sort({ timestamp: -1 })
  .limit(20)
  .toArray();

// Auction wins
const auctionWins = await db.collection('auctionItems')
  .find({ winnerId: userId, status: 'sold' })
  .sort({ soldAt: -1 })
  .limit(10)
  .toArray();

// Boss breakdown (already aggregated in member.attendance.byBoss)
const bossCounts = member.attendance.byBoss;
```

### Auction History
```javascript
// Recent auction sessions
const sessions = await db.collection('auctionSessions')
  .find({})
  .sort({ sessionNumber: -1 })
  .limit(20)
  .toArray();

// Pending items (current queue)
const pendingItems = await db.collection('auctionItems')
  .find({ status: 'pending' })
  .sort({ addedAt: 1 })
  .toArray();

// Active auction (if any)
const activeItem = await db.collection('auctionItems')
  .findOne({ status: 'active' });
```

---

## 📁 Configuration Files

### boss_spawn_config.json
Contains spawn intervals and schedules for all bosses.

**Structure:**
```json
{
  "timerBasedBosses": {
    "Venatus": {
      "spawnIntervalHours": 10,
      "description": "Spawns 10 hours after being killed"
    }
  },
  "scheduleBasedBosses": {
    "Clemantis": {
      "schedules": [
        { "day": "Monday", "time": "11:30", "dayOfWeek": 1 },
        { "day": "Thursday", "time": "19:00", "dayOfWeek": 4 }
      ],
      "description": "Spawns Monday 11:30, Thursday 19:00"
    }
  }
}
```

### boss_points.json
Maps boss names to point values and aliases.

**Structure:**
```json
{
  "Venatus": { "points": 1, "aliases": ["venatus"] },
  "Milavy": { "points": 2, "aliases": ["milavy"] },
  "Catena": { "points": 3, "aliases": ["catena"] },
  "Icaruthia": { "points": 4, "aliases": ["icaruthia"] },
  "Guild Boss": { "points": 15, "aliases": ["guild boss", "guildboss", "gb"] }
}
```

---

## 🔍 Important MongoDB Helpers

The bot provides these helper functions in `/utils/mongodb-helpers.js`:

### Member Operations
- `getMember(identifier)` - Get by Discord ID or username
- `getAllMembers(filter)` - Get all members
- `createMember(memberData)` - Create new member
- `updateMember(identifier, updates)` - Update member

### Points Operations
- `getMemberPoints(identifier)` - Get available points
- `updateMemberPoints(identifier, pointsChange, reason)` - Add/subtract points
- `hasEnoughPoints(identifier, requiredPoints)` - Check balance

### Attendance Operations
- `addAttendance(data)` - Add attendance record + update stats
- `getMemberAttendance(identifier, filter)` - Get attendance history
- `getLastBossSpawn(bossName)` - Get last spawn time for boss
- `getMemberStats(memberName)` - Get full stats for /stats command

### Boss Timer Operations
- `saveBossTimerData(bossName, killTime, nextSpawn, killedBy)` - Save timer
- `getAllBossTimers()` - Get all timers
- `getBossTimer(bossName)` - Get specific timer
- `deleteBossTimer(bossName)` - Remove timer

### Auction Operations
- `getAuctionQueue()` - Get pending items
- `addAuctionItem(itemData)` - Add to queue
- `markItemAsSold(itemId, winner, winningBid)` - Mark as sold
- `getSoldItems(limit)` - Get auction history

---

## 🎨 Bot UI/UX Patterns

### Boss Spawn Display (/nextspawn command)
The bot displays boss spawns with:
- Boss name (uppercase)
- Spawn type indicator (SCHEDULED or timer-based)
- Spawn time with live Discord timestamps
- Relative countdown ("in 5 hrs 32 mins")
- Auto-deletes after 5 minutes

**Example:**
```
🕒 Boss Spawns in Next 24 Hours

**VENATUS**
11:45 PM - in 8 hrs 17 mins

**CLEMANTIS (SCHEDULED)**
Tomorrow, 11:30 AM - in 15 hrs 2 mins
```

### Member Stats Display (/stats command)
Shows comprehensive member statistics:
- Total boss kills
- Points earned/available/spent
- Attendance rate (percentage)
- Current streak
- Recent bosses (last 5)
- Favorite boss (most attended)
- Rank among all members

---

## 🔐 Security & Permissions

### Discord Roles
The bot uses Discord roles for permissions:
- **Admin Role:** Can verify attendance, manage auctions, mark bosses as killed
- **Guild Member:** Can submit attendance, participate in auctions
- **Non-members:** Cannot interact with bot

### MongoDB Access
- **Bot:** Read/write access to all collections
- **Dashboard (recommended):** Read-only access for safety
- **Connection:** MongoDB Atlas connection string with authentication

---

## 📊 Performance Characteristics

### Query Performance (from bot docs)
- **MongoDB queries:** 10-50ms (vs 500-2000ms for Google Sheets)
- **Crash recovery:** <1 second
- **Bidding operations:** Instant (race condition protected)
- **Stats calculation:** Sub-100ms with optimized aggregations

### Data Volume
- **Attendance records:** ~400K documents/year (~200 bytes each)
- **Active members:** ~50 members
- **Boss timers:** ~37 active timers
- **Auction items:** ~500 items/year

---

## 🎯 Dashboard Integration Points

### Real-Time Data Sources
1. **Boss Timers:** `bossTimers` collection + fallback to `attendance`
2. **Member Stats:** Pre-aggregated in `members.attendance`
3. **Leaderboards:** Direct query from `members` collection
4. **Auction Data:** `auctionItems` + `auctionSessions`

### Calculated Fields
1. **Next Spawn Time:** lastKillTime + spawnIntervalHours
2. **Time Remaining:** nextSpawnTime - now
3. **Attendance Rate:** (spawns attended / total spawns) * 100
4. **Consumption Rate:** (pointsSpent / pointsEarned) * 100
5. **Streak:** Consecutive days from attendance records

### Configuration Files Needed
1. **boss_spawn_config.json:** Copy from bot repo
2. **boss_points.json:** Copy from bot repo
3. **Boss images:** Optional (can use placeholders)

---

## 🚀 Next Steps

Now that we understand the bot's architecture, we can proceed with:

1. ✅ **Bot exploration complete** - Architecture fully understood
2. 📋 **Implementation plan created** - See IMPLEMENTATION_PLAN.md
3. 🚀 **Ready to start Phase 1:** Project setup and MongoDB connection

The dashboard will be a perfect companion to your Discord bot, providing:
- Visual boss timer tracking
- Member leaderboards and profiles
- Auction history and analytics
- All without interfering with the bot's operation (read-only access)

---

**Generated:** 2025-12-25
**Bot Version:** 9.0.0
**Dashboard Status:** Planning Complete ✅
