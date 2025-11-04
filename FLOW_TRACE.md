# Discord Bot Flow Trace Analysis

## Bot Entry Points

### 1. Main Entry Point
- **File**: `index2.js`
- **Trigger**: Bot startup via `npm start`
- **Port**: 8000 (HTTP health check server)

### 2. Discord Event Handlers

#### 2.1 ClientReady Event (Line 1914)
```javascript
client.once(Events.ClientReady, async () => {...})
```
**Flow:**
1. Initialize all modules (attendance, bidding, auctioneering, help, loot, emergency, leaderboard)
2. Run 3-sweep recovery system:
   - Sweep 1: Thread recovery
   - Sweep 2: Google Sheets fallback
   - Sweep 3: State validation
3. Start periodic state sync
4. Start bidding channel cleanup schedule
5. Start weekly report scheduler
6. Start periodic garbage collection

#### 2.2 MessageCreate Event (Line 2150)
```javascript
client.on(Events.MessageCreate, async (message) => {...})
```

**Flow Branches:**

**A. Bidding Channel Protection (Line 2152-2176)**
- Delete non-admin messages immediately

**B. Timer Server Spawn Detection (Line 2196-2274)**
- Parse boss spawn messages from timer server
- Extract boss name and timestamp
- Create spawn threads via `attendance.createSpawnThreads()`

**C. Member Check-in (Line 2445-2528)**
- Location: Spawn threads only
- Keywords: `present`, `here`, `join`, `checkin`, `check-in`
- Flow:
  1. Validate spawn is open
  2. Require screenshot (except admins)
  3. Check for duplicates
  4. Add reactions (✅ ❌)
  5. Wait for admin verification

**D. Command Processing**

##### Member Commands (anywhere except spawn threads):
- `!help` → `commandHandlers.help()` (Line 2400-2412)
- `!mypoints` → `commandHandlers.mypoints()` (bidding channel only, Line 2349-2359)
- `!bidstatus` → `commandHandlers.bidstatus()` (bidding channel, Line 2361-2367)
- `!bid` / `!b` → `bidding.handleCommand()` (auction threads only, Line 2296-2347)

##### Auction Thread Commands (admin only, Line 2369-2397):
- `!pause` → `commandHandlers.pause()`
- `!resume` → `commandHandlers.resume()`
- `!stop` → `commandHandlers.stop()`
- `!extend` → `commandHandlers.extend()`

##### Admin Logs Commands (admin only, Line 2840-3037):
- **Status Commands:**
  - `!status` → `commandHandlers.status()`
  - `!clearstate` → `commandHandlers.clearstate()`
  - `!closeallthread` → `commandHandlers.closeallthread()`
  - `!maintenance` → `commandHandlers.maintenance()`
  - `!emergency` → `emergencyCommands.handleEmergencyCommand()`

- **Leaderboard Commands:**
  - `!leaderboardattendance` → `commandHandlers.leaderboardattendance()`
  - `!leaderboardbidding` → `commandHandlers.leaderboardbidding()`
  - `!weeklyreport` → `commandHandlers.weeklyreport()`

- **Auction Commands:**
  - `!startauction` → `commandHandlers.startauction()`
  - `!startauctionnow` → `commandHandlers.startauctionnow()`
  - `!endauction` → `commandHandlers.endauction()`
  - `!queuelist` → `auctioneering.handleQueueList()`
  - `!removeitem` → `auctioneering.handleRemoveItem()`
  - `!clearqueue` → `auctioneering.handleClearQueue()`
  - `!forcesubmitresults` → `auctioneering.handleForceSubmitResults()`
  - `!cancelitem` → `auctioneering.handleCancelItem()`
  - `!skipitem` → `auctioneering.handleSkipItem()`
  - `!movetodistribution` → `auctioneering.handleMoveToDistribution()`
  - `!auction` / `!resetbids` → `bidding.handleCommand()`

- **Loot Command:**
  - `!loot` → `lootSystem.handleLootCommand()` (admin logs threads, Line 2844-2855)

- **Spawn Thread Commands:**
  - `!addthread` → Create manual spawn thread (Line 2971-3037)

##### Spawn Thread Commands (admin only, Line 2806-2834):
- `!forcesubmit` → `commandHandlers.forcesubmit()`
- `!debugthread` → `commandHandlers.debugthread()`
- `!resetpending` → `commandHandlers.resetpending()`
- `!verifyall` → Auto-verify all pending (inline, Line 2537-2606)

#### 2.3 MessageReactionAdd Event (Line 3061)
```javascript
client.on(Events.MessageReactionAdd, async (reaction, user) => {...})
```

**Flow:**
1. **Bidding Confirmations** (Line 3099-3109)
   - Check if message is a pending bid confirmation
   - ✅ → `bidding.confirmBid()`
   - ❌ → `bidding.cancelBid()`

2. **Attendance Verification** (Line 3112-3207)
   - Check if message is a pending attendance verification
   - Admin only
   - ✅ → Verify member, add to spawn
   - ❌ → Deny and delete message

3. **Spawn Close Confirmation** (Line 3209-3282)
   - Check if message is a pending closure
   - Admin only
   - ✅ → Close spawn, submit to sheets, archive thread
   - ❌ → Cancel closure

#### 2.4 Error Event (Line 3296)
```javascript
client.on(Events.Error, (error) => {...})
```
- Log errors to console

## Module Flows

### Attendance Module (`attendance.js`)
**Exports:**
- `initialize()` - Initialize module with config
- `createSpawnThreads()` - Create spawn threads
- `recoverStateFromThreads()` - Recover state from Discord threads
- `loadAttendanceStateFromSheet()` - Load state from Google Sheets
- `validateStateConsistency()` - Validate state consistency
- `postToSheet()` - Submit attendance to Google Sheets
- `schedulePeriodicStateSync()` - Schedule periodic state sync
- State getters/setters

### Bidding Module (`bidding.js`)
**Exports:**
- `initializeBidding()` - Initialize module
- `handleCommand()` - Handle bidding commands
- `confirmBid()` - Confirm bid from reaction
- `cancelBid()` - Cancel bid from reaction
- `getBiddingState()` - Get current bidding state
- `loadBiddingStateFromSheet()` - Load state from sheets
- `submitSessionTally()` - Submit auction results
- `recoverBiddingState()` - Recover bidding state on startup

### Auctioneering Module (`auctioneering.js`)
**Exports:**
- `initialize()` - Initialize module
- `startAuctioneering()` - Start auction session
- `pauseSession()` - Pause current auction
- `resumeSession()` - Resume paused auction
- `stopCurrentItem()` - Stop current auction item
- `extendCurrentItem()` - Extend auction time
- `endAuctionSession()` - End entire session
- `getAuctionState()` - Get current state
- `handleQueueList()` - Display queue
- `handleRemoveItem()` - Remove item from queue
- `handleClearQueue()` - Clear queue
- `handleMyPoints()` - Show user points
- `handleBidStatus()` - Show bid status
- `handleCancelItem()` - Cancel current item
- `handleSkipItem()` - Skip current item
- `handleForceSubmitResults()` - Force submit results
- `handleMoveToDistribution()` - Move items to distribution

### Help System Module (`help-system.js`)
**Exports:**
- `initialize()` - Initialize module
- `handleHelp()` - Display help information

### Loot System Module (`loot-system.js`)
**Exports:**
- `initialize()` - Initialize module
- `handleLootCommand()` - Handle loot-related commands

### Emergency Commands Module (`emergency-commands.js`)
**Exports:**
- `initialize()` - Initialize module
- `handleEmergencyCommand()` - Handle emergency commands

### Leaderboard System Module (`leaderboard-system.js`)
**Exports:**
- `init()` - Initialize module
- `displayAttendanceLeaderboard()` - Show attendance leaderboard
- `displayBiddingLeaderboard()` - Show bidding leaderboard
- `sendWeeklyReport()` - Send weekly report
- `scheduleWeeklyReport()` - Schedule weekly reports

## Utility Modules

### Used Utilities:
- **utils/error-handler.js** - Error handling and safe operations
- **utils/common.js** - Common utilities (timestamps, formatting, boss matching)
- **utils/cache-manager.js** - Caching for boss matching
- **utils/constants.js** - Shared constants

### Unused Utilities (Dead Code):
- **utils/time-utils.js** - Only used in tests
- **utils/embed-builder.js** - Not imported anywhere
- **utils/discord-utils.js** - Not imported anywhere
- **utils/http-utils.js** - Not imported anywhere
- **utils/lock-manager.js** - Not imported anywhere

## Background Tasks

### 1. Bidding Channel Cleanup (Every 12 hours)
- Lock and archive old auction threads
- Clean up old messages (>3 days)

### 2. Weekly Report (Every Monday 3am GMT+8)
- Generate attendance and bidding leaderboards
- Send to admin logs

### 3. Periodic State Sync (Every 5 minutes)
- Save attendance state to Google Sheets
- Backup for crash recovery

### 4. Garbage Collection (Every 10 minutes)
- Manual GC if --expose-gc flag is set
- Memory optimization for 256MB limit

## Command Aliases

All command aliases are defined in `COMMAND_ALIASES` object (Line 27-92) and resolved via `resolveCommandAlias()` function.

## Dead Code Identified

### Files to Remove:
1. `utils/time-utils.js` - Only used in tests
2. `utils/embed-builder.js` - Not imported anywhere
3. `utils/discord-utils.js` - Not imported anywhere
4. `utils/http-utils.js` - Not imported anywhere
5. `utils/lock-manager.js` - Not imported anywhere
6. `fix-emojis.js` - One-time script, not part of bot

### All Other Files are Used:
- All main module files are imported and used
- All command handlers are called
- Code.js is for Google Apps Script (separate backend)
