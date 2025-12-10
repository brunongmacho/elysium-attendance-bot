# ELYSIUM Guild Bot - System Architecture

This document provides a comprehensive overview of the ELYSIUM Guild Bot's architecture, design patterns, and technical implementation.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Module Structure](#module-structure)
- [State Management](#state-management)
- [Performance Optimizations](#performance-optimizations)
- [Security Considerations](#security-considerations)
- [Scalability](#scalability)
- [Deployment Architecture](#deployment-architecture)

---

## System Overview

### Purpose

The ELYSIUM Guild Bot is a comprehensive Discord bot designed for MMORPG guild management, specifically handling:
- **Attendance Tracking** - Boss spawn monitoring and member verification
- **Auction System** - Point-based loot distribution
- **Analytics** - Statistical predictions and engagement tracking
- **Automation** - Proactive monitoring and scheduled tasks

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 18.0.0+ | JavaScript execution environment |
| Bot Framework | Discord.js | 14.25.1 | Discord API wrapper |
| Data Store | Google Sheets | API v4 | Persistent data storage |
| Scheduler | node-cron | 4.2.1 | Scheduled task execution |
| HTTP Client | axios | 1.13.2 | API requests |
| Testing | Jest | 29.7.0 | Unit and integration tests |

### System Metrics

- **Total Lines**: ~57,320 lines of code
- **Modules**: 51 JavaScript files
- **Commands**: 50+ user commands
- **Memory Usage**: ~95-105MB RSS
- **API Calls**: ~30 requests/minute to Google Sheets
- **Uptime**: 99.9%+ (with auto-recovery)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DISCORD CLIENT                           │
│                    (Discord.js Gateway)                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ├─── Events (MessageCreate, InteractionCreate, etc.)
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                     MAIN APPLICATION                            │
│                      (index2.js)                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Event Handlers                                          │  │
│  │  - Message Handler                                       │  │
│  │  - Interaction Handler (Buttons, Select Menus)          │  │
│  │  - Reaction Handler                                      │  │
│  └────────┬─────────────────────────────────────────────────┘  │
│           │                                                     │
│  ┌────────▼─────────────────────────────────────────────────┐  │
│  │  Command Router                                          │  │
│  │  - NLP Handler (Natural Language Processing)            │  │
│  │  - Command Aliases                                       │  │
│  │  - Permission Checks                                     │  │
│  └────────┬─────────────────────────────────────────────────┘  │
└───────────┼──────────────────────────────────────────────────────┘
            │
  ┌─────────┼─────────┬──────────┬────────────┬──────────────┐
  │         │         │          │            │              │
  │         │         │          │            │              │
┌─▼─────┐ ┌─▼──────┐ ┌▼────────┐ ┌▼────────┐ ┌▼────────────┐ ┌▼──────────┐
│Attend-│ │Auction │ │Intelli- │ │Leaderb- │ │Emergency   │ │Boss       │
│ance   │ │System  │ │gence    │ │oard     │ │Commands    │ │Rotation   │
│Module │ │        │ │Engine   │ │System   │ │            │ │System     │
└───┬───┘ └───┬────┘ └────┬────┘ └────┬────┘ └─────┬──────┘ └─────┬─────┘
    │         │           │           │            │              │
    └─────────┴───────────┴───────────┴────────────┴──────────────┘
                                    │
                                    │
                          ┌─────────▼──────────┐
                          │   Utility Layer    │
                          ├────────────────────┤
                          │ - SheetAPI         │
                          │ - Cache Manager    │
                          │ - Request Batcher  │
                          │ - Error Handler    │
                          │ - Timer Registry   │
                          │ - Discord Cache    │
                          └─────────┬──────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │                                │
            ┌───────▼────────┐            ┌─────────▼────────┐
            │ Google Sheets  │            │  Discord API     │
            │   (Database)   │            │   (Messages)     │
            └────────────────┘            └──────────────────┘
```

---

## Core Components

### 1. Main Application (`index2.js` - 8,393 lines)

**Responsibilities:**
- Discord client initialization
- Event handler registration
- Command routing and execution
- HTTP health check server
- Graceful shutdown management

**Key Sections:**
```javascript
// 1. Imports & Configuration
// 2. Discord Client Initialization
// 3. Constants & State Management
// 4. HTTP Health Check Server
// 5. Utility Functions
// 6. Bidding Channel Cleanup
// 7. Confirmation Utilities
// 8. Command Handlers
// 9. Event Handlers
// 10. Bot Initialization
```

### 2. Attendance System (`attendance.js`)

**Responsibilities:**
- Boss spawn thread creation
- Member verification workflow
- Screenshot validation (manual)
- Points submission to Google Sheets
- 20-minute auto-close anti-cheat

**Key Functions:**
- `createSpawnThread()` - Creates attendance thread
- `verifyMember()` - Verifies member attendance
- `closeThread()` - Submits data and closes thread
- `autoCloseCheck()` - Enforces 20-minute timeout

**State:**
- `activeSpawns` - Map of active attendance threads
- `pendingVerifications` - Queue of verification requests

### 3. Auction System

#### Bidding Module (`bidding.js` - 4,660 lines)

**Responsibilities:**
- Point management and validation
- Bid placement and processing
- Winner determination
- Point locking/unlocking

**Key Functions:**
- `placeBid()` - Handles bid placement
- `getBiddingPoints()` - Fetches user points
- `lockPoints()` - Reserves points for bidding
- `submitBiddingResults()` - Saves auction results

#### Auctioneering Module (`auctioneering.js` - 4,121 lines)

**Responsibilities:**
- Auction session management
- Item queue processing
- Timer management
- Admin controls (pause, resume, extend, skip)

**Flow:**
```
1. Load queue from Google Sheets
2. Start auction session
3. For each item:
   - Display item
   - Start countdown timer
   - Accept bids
   - Determine winner
   - Submit results
4. End auction session
```

### 4. Intelligence Engine (`intelligence-engine.js` - 2,735 lines)

**Responsibilities:**
- Price prediction (statistical averages)
- Engagement scoring
- Anomaly detection
- Recommendation generation

**Algorithms:**
- **Price Prediction**: Historical average ± confidence interval
- **Engagement Score**: Weighted combination of attendance + bidding + consistency
- **Anomaly Detection**: Statistical outlier detection (Z-score)

### 5. Proactive Intelligence (`proactive-intelligence.js` - 2,755 lines)

**Responsibilities:**
- Automated monitoring and alerts
- Scheduled reports (weekly, monthly)
- Pre-auction readiness checks
- Milestone celebrations

**Scheduled Tasks:**
- Saturday 10 AM: Pre-auction check
- Monday 9 AM: Engagement digest
- Daily 6 PM: Anomaly digest
- Sunday 8 PM: Weekly summary
- Saturday 11:59 PM: Weekly reports
- Hourly: Milestone celebrations

### 6. NLP System

**Components:**
- `nlp-handler.js` - Pattern matching and parsing
- `nlp-learning.js` - Pattern learning system
- `nlp-vocabulary.js` - English vocabulary
- `nlp-vocabulary-tagalog.js` - Tagalog vocabulary
- `nlp-vocabulary-taglish.js` - Taglish vocabulary

**Flow:**
```
1. User sends natural language message
2. Check if in allowed channel (admin logs, auction threads)
3. Match against learned patterns
4. Extract command and parameters
5. Execute command
6. Learn from interaction (if successful)
```

### 7. Utility Layer

#### SheetAPI (`utils/sheet-api.js`)

**Purpose:** Unified Google Sheets interface

**Features:**
- Retry logic (3 attempts with exponential backoff)
- Request batching
- Error handling

**Methods:**
```javascript
await sheetAPI.get(action, params)
await sheetAPI.post(action, data)
```

#### Cache Manager (`utils/cache-manager.js`)

**Purpose:** Multi-level caching (L1/L2/L3)

**Cache Levels:**
- **L1 (Hot)**: 1-minute TTL - Frequently accessed
- **L2 (Warm)**: 5-minute TTL - Moderately accessed
- **L3 (Cold)**: 15-minute TTL - Rarely accessed

**Auto-promotion:** Frequently accessed data moves to faster levels

#### Request Batcher (`utils/request-batcher.js`)

**Purpose:** Prevent Google Sheets API rate limiting

**Features:**
- Batch size limit: 20 requests
- Inter-batch delay: 2 seconds
- Priority queue support

#### Timer Registry (`utils/timer-registry.js`)

**Purpose:** Centralized timer management

**Features:**
- Tracks all setTimeout/setInterval
- Automatic cleanup on shutdown
- Memory leak prevention

---

## Data Flow

### Attendance Flow

```
1. Admin creates spawn thread
   → index2.js:!addthread
   → attendance.js:createSpawnThread()
   → Discord API: Create thread
   → State: Add to activeSpawns

2. Member uploads screenshot
   → Discord API: Message event
   → index2.js: Message handler
   → attendance.js: Add to pendingVerifications

3. Admin verifies member
   → Discord API: Reaction event
   → index2.js: Reaction handler
   → attendance.js:verifyMember()
   → State: Add to spawnInfo.members

4. Auto-close triggers (20 min)
   → attendance.js:autoCloseCheck()
   → attendance.js:closeThread()
   → SheetAPI: submitAttendance()
   → Google Sheets: Save data
   → Discord API: Close thread
   → State: Remove from activeSpawns
```

### Auction Flow

```
1. Saturday 12:00 PM (auto) or !auction (manual)
   → auctioneering.js:startAuction()
   → SheetAPI: getBiddingItems()
   → Google Sheets: Load queue
   → State: Set auctionActive = true

2. For each item in queue:
   → auctioneering.js:displayItem()
   → Discord API: Send embed
   → Start countdown timer

3. Member places bid
   → Discord API: Message event
   → index2.js: Message handler
   → bidding.js:placeBid()
   → Validate points available
   → Lock points
   → Update highest bidder

4. Timer expires
   → auctioneering.js:processWinner()
   → bidding.js:submitBiddingResults()
   → SheetAPI: Save results
   → Google Sheets: Update points
   → Unlock non-winner points

5. Auction ends
   → auctioneering.js:endAuction()
   → State: Set auctionActive = false
```

---

## Module Structure

### Directory Layout

```
elysium-attendance-bot/
├── index2.js                    # Main entry point
├── package.json                 # Dependencies
├── config.json                  # Bot configuration
├── boss_points.json             # Boss point values
├── slap-responses.json          # Fun command data
│
├── Core Systems/
│   ├── attendance.js
│   ├── bidding.js
│   ├── auctioneering.js
│   ├── help-system.js
│   ├── help-system-v2.js       # Channel-aware help
│   ├── emergency-commands.js
│   ├── leaderboard-system.js
│   ├── boss-rotation.js
│   ├── boss-timer.js
│   ├── boss-timer-commands.js
│   ├── activity-heatmap.js
│   └── event-reminders.js
│
├── Intelligence/
│   ├── intelligence-engine.js
│   ├── proactive-intelligence.js
│   └── learning-system.js
│
├── NLP/
│   ├── nlp-handler.js
│   ├── nlp-learning.js
│   ├── nlp-conversation.js
│   ├── nlp-vocabulary.js
│   ├── nlp-vocabulary-tagalog.js
│   └── nlp-vocabulary-taglish.js
│
├── Utils/
│   ├── constants.js
│   ├── common.js
│   ├── sheet-api.js
│   ├── cache-manager.js
│   ├── request-batcher.js
│   ├── parallel-sheets.js
│   ├── discord-cache.js
│   ├── error-handler.js
│   ├── timer-registry.js
│   ├── boss-images.js
│   ├── embed-branding.js
│   ├── crash-recovery.js
│   └── maintenance-scheduler.js
│
├── Config/
│   └── command-aliases.js
│
├── Modules/
│   └── bidding/
│       └── utilities.js
│
└── __tests__/
    ├── test-runner.js
    ├── integration-tests.js
    ├── attendance-autoclose.test.js
    └── modules/
        └── bidding-utilities.test.js
```

---

## State Management

### In-Memory State

```javascript
// Active attendance threads
const activeSpawns = new Map();
// Structure: Map<threadId, {
//   bossName: string,
//   members: string[],
//   startTime: Date,
//   isPending: boolean
// }>

// Auction state
let auctionActive = false;
let currentAuctionItem = null;
let highestBidder = null;
let lockedPoints = new Map();

// NLP learned patterns
const learnedPatterns = new Map();
```

### Persistent State (Google Sheets)

| Sheet Tab | Purpose | Sync Frequency |
|-----------|---------|----------------|
| `AttendanceTracker` | Attendance records | On thread close |
| `ForDistribution` | Member points | Every bid/win |
| `BiddingItems` | Auction queue | On auction start |
| `BiddingHistory` | Auction results | Per item sold |
| `AttendanceState` | Bot crash recovery | Every 15 min |
| `BotLearning` | Prediction tracking | Per prediction |
| `BossRotation` | Rotation state | On boss kill |
| `NLPLearned` | Learned patterns | Per new pattern |
| `NLPUnrecognized` | Failed patterns | Per unrecognized |

### Crash Recovery

**Mechanism:**
1. Every 15 minutes: Save `activeSpawns` to `AttendanceState` sheet
2. On startup: Load state from Google Sheets
3. Restore threads, timers, and pending operations
4. Clean up stale entries (>24 hours old)

---

## Performance Optimizations

### 1. Multi-Level Caching

**Impact:** 30-50% API call reduction, 100x faster lookups

```javascript
// Before: Every lookup → API call
const points = await sheetAPI.get('getBiddingPoints', { userId });

// After: L1/L2/L3 cache with automatic promotion
const points = await cacheManager.get('points', userId);
// L1 hit: <1ms | L2 hit: ~5ms | L3 hit: ~15ms | Miss: API call
```

### 2. Request Batching

**Impact:** Prevents rate limiting, 50% reduction in API calls

```javascript
// Before: Bursts exceed limits → 429 errors
await Promise.all(members.map(m => sheetAPI.updatePoints(m)));

// After: Intelligent batching
await requestBatcher.batch(members.map(m => ({
  action: 'updatePoints',
  data: m
})));
// Max 20 requests per batch, 2-second delay between batches
```

### 3. Parallel Operations

**Impact:** 2-3x speedup on bulk operations

```javascript
// Before: Sequential (30 seconds for 10 operations)
for (const member of members) {
  await sheetAPI.update(member);
}

// After: Parallel (10 seconds for 10 operations)
await Promise.all(members.map(m => sheetAPI.update(m)));
```

### 4. Discord Channel Caching

**Impact:** 60-80% reduction in channel fetch calls

```javascript
// Before: Fetch every time
const channel = await client.channels.fetch(channelId);

// After: Cached with TTL
const channel = await discordCache.get(channelId);
```

### 5. Memory Optimization

- **Aggressive cache sweeping** (Discord.js settings)
- **Garbage collection** every 5 minutes
- **Timer cleanup** on shutdown
- **Event listener removal** on shutdown
- **Memory alerts** at >400MB RSS

---

## Security Considerations

### 1. Permission Checks

```javascript
function isAdmin(member) {
  return member.roles.cache.some(r =>
    config.admin_roles.includes(r.name)
  );
}

// All admin commands check permissions
if (!isAdmin(message.member)) {
  return message.reply('❌ Admin only command');
}
```

### 2. Input Validation

```javascript
// Validate user input
function validateBidAmount(amount) {
  if (isNaN(amount)) throw new Error('Invalid amount');
  if (amount < 0) throw new Error('Negative bid not allowed');
  if (amount > 999999) throw new Error('Bid too large');
  return parseInt(amount);
}
```

### 3. Rate Limiting

- **Google Sheets API**: Request batching prevents 429 errors
- **Discord API**: Built-in rate limit handling
- **Command cooldowns**: Prevent spam

### 4. Configuration Validation

```javascript
// Validate config on startup
validateConfig();
// Checks for missing fields, invalid URLs, etc.
```

### 5. Confirmation Prompts

```javascript
// Dangerous commands require confirmation
await message.reply('⚠️ This will close ALL threads. Confirm? (yes/no)');
// 30-second timeout for user response
```

---

## Scalability

### Current Limitations

- **Single Guild**: Designed for ELYSIUM guild
- **Google Sheets**: Max 10 million cells per sheet
- **Memory**: Optimized for 512MB instances

### Scaling Strategies

#### Horizontal Scaling (Multi-Guild Support)

```javascript
// Current: Single config object
const config = loadConfig();

// Future: Per-guild config
const guilds = new Map();
guilds.set(guildId, loadGuildConfig(guildId));
```

#### Database Migration

```javascript
// Current: Google Sheets
await sheetAPI.get('getBiddingPoints', { userId });

// Future: Database abstraction layer
await database.get('bidding_points', { userId });
// database = PostgreSQL, MongoDB, etc.
```

#### Sharding (Discord.js)

```javascript
// For large bot instances (>2500 guilds)
const manager = new ShardingManager('./index2.js', {
  totalShards: 'auto',
  token: config.token
});
manager.spawn();
```

---

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────┐
│         Cloud Platform              │
│  (Koyeb, Railway, Render, etc.)    │
│  ┌───────────────────────────────┐ │
│  │   Bot Instance (512MB RAM)    │ │
│  │   - Node.js 18+               │ │
│  │   - index2.js                 │ │
│  │   - Auto-restart on crash     │ │
│  └─────────────┬─────────────────┘ │
│                │                    │
│  ┌─────────────▼─────────────────┐ │
│  │   Health Check Endpoint       │ │
│  │   http://localhost:8000       │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
          │              │
          │              │
    ┌─────▼─────┐  ┌────▼─────┐
    │  Discord  │  │  Google  │
    │    API    │  │  Sheets  │
    └───────────┘  └──────────┘
```

### Process Management (PM2)

```bash
# Start bot with PM2
pm2 start index2.js --name elysium-bot

# Enable auto-restart on system boot
pm2 startup
pm2 save

# Monitor logs
pm2 logs elysium-bot

# Restart bot
pm2 restart elysium-bot
```

### Environment Variables

```bash
# Production mode (optimized logging)
NODE_ENV=production

# Custom port for health check
PORT=8000

# Memory limits
NODE_OPTIONS="--expose-gc --max-old-space-size=450"
```

---

## Design Patterns

### 1. Module Pattern

```javascript
// Each module exports functions
module.exports = {
  createSpawnThread,
  verifyMember,
  closeThread
};
```

### 2. Singleton Pattern

```javascript
// Single SheetAPI instance
const sheetAPI = new SheetAPI(config.sheet_webhook_url);
```

### 3. Observer Pattern

```javascript
// Discord.js event system
client.on(Events.MessageCreate, async (message) => {
  // Handle message
});
```

### 4. Factory Pattern

```javascript
// Embed builder
function createAttendanceEmbed(bossName) {
  return new EmbedBuilder()
    .setTitle(`${bossName} Spawn`)
    .setColor(0x3498DB);
}
```

### 5. Strategy Pattern

```javascript
// Different help systems based on context
if (useChannelAwareHelp) {
  return helpSystemV2.handleHelp(message);
} else {
  return helpSystem.handleHelp(message);
}
```

---

## Future Enhancements

### Planned Improvements

1. **Microservices Architecture**
   - Separate services for attendance, auction, analytics
   - Message queue for inter-service communication

2. **Real Database**
   - PostgreSQL or MongoDB instead of Google Sheets
   - Better query performance and scalability

3. **Web Dashboard**
   - Real-time analytics dashboard
   - Admin controls via web interface

4. **Advanced Analytics**
   - Machine learning for predictions (vs statistical)
   - More sophisticated anomaly detection

5. **Multi-Language Support**
   - Internationalization (i18n)
   - More NLP languages

---

## Conclusion

The ELYSIUM Guild Bot is a well-architected, production-ready Discord bot with:
- **Modular design** for maintainability
- **Performance optimizations** for low-memory environments
- **Robust error handling** for reliability
- **Comprehensive documentation** for developers

For questions or contributions, see [CONTRIBUTING.md](./CONTRIBUTING.md).
