# TrailerParkB Guild - Google Apps Script Migration Documentation

## Overview
This document tracks all changes made to Code.js for setting up a new Google Sheet for the TrailerParkB guild.

---

## Date: 2026-04-26

## 1. CONFIGURATION CHANGES

### 1.1 New Google Sheet ID
- **Old ID**: `1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ`
- **New ID**: `1K07R6lXnsha7NshyAnIL4Iq034PlYCP64TaiPJwseCw`

### 1.2 Sheet Name Prefix
- **Changed from**: `ELYSIUM_WEEK_`
- **Changed to**: `WEEK_`

### 1.3 Guild Name References
- **Changed from**: `ELYSIUM`
- **Changed to**: `TrailerParkB`

---

## 2. WEEK TIMING CHANGES

### 2.1 Week Start/End Times
- **Old**: Sunday 12:00am to Saturday 11:59pm
- **New**: **Monday 3:00am to Monday 2:59am** (weekly reset and report timing)

### 2.2 Weekly Report Schedule
- **Old**: Saturday 11:59pm GMT+8
- **New**: **Monday 2:59am GMT+8** (1 minute BEFORE weekly reset)

### 2.3 Functions Updated for Monday 3:00am Start

| Function | Description |
|----------|-------------|
| `getCurrentWeekSheet()` | Calculates Monday 3:00am for sheet naming |
| `getWeekStartDate()` | Extracts Monday 3:00am from sheet name |
| `mondayWeeklySheetCreation()` | Creates sheets for next Monday |
| `getCurrentWeekSheetName()` | Returns WEEK_YYYYMMDD based on Monday |
| `getPreviousWeekSheet()` | Gets previous Monday's sheet |

### 2.4 Week Range Calculation
```javascript
// Example for WEEK_20260427:
// Start: Monday April 27, 2026 at 3:00am
// End: Sunday May 3, 2026 at 2:59:59am
```

---

## 3. AUTO-CREATE SHEETS

### 3.1 Primary Sheets (in ensureSheetsExist())
These are created when the first WEEK_ sheet is created:

| Sheet | Headers |
|-------|---------|
| BiddingPoints | MEMBERS, BIDDING POINTS AVAILABLE, TOTAL BIDDING POINTS CONSUMED |
| BossPoints | Boss Name, Points (41 boss entries pre-populated) |
| TOTAL ATTENDANCE | Member, Total Attendance (Days) |
| ForDistribution | Item, Start Price, Duration, Winner, Winning Bid, Auction Start, Auction End, Timestamp, Total Bids, Source, Quantity, Boss, STATUS |
| BiddingItems | Item, Start Price, Duration, Winner, Winning Bid, Auction Start, Auction End, Timestamp, Total Bids, Source, Quantity, Boss, Notes |
| BossRotation | Boss Name, Current Index, Guild1, Guild2, Guild3, Guild4, Guild5 |

### 3.2 On-Demand Sheets (created when bot sends data)

| Sheet | Created By |
|-------|------------|
| AttendanceLog | handleSubmitAttendance() |
| AuctionLog | logAuctionEvent() |
| _BotState | saveBotState() |
| _LootState | saveLootState() |
| _AttendanceState | saveAttendanceState() |
| EventReminders | saveEventReminders() |
| _RecoveryState | saveRecoveryState() |
| BossTimerRecovery | saveBossTimerRecovery() |

---

## 4. PROGRAMMATIC STATS CALCULATION

### 4.1 Overview
Instead of using fragile Google Sheets formulas, stats are now calculated programmatically in JavaScript.

### 4.2 Column Headers (WEEK_ sheets)
| Column | Header | Description |
|--------|--------|-------------|
| A | MEMBERS | Member names |
| B | POINTS CONSUMED | Bidding points spent this week |
| C | POINTS LEFT | Previous C + D - B |
| D | ATTENDANCE POINTS | Boss points earned (checkmarks × boss value + time bonus) |
| E+ | Spawn columns | Row 1: Timestamp, Row 2: Boss, Row 3+: Checkmarks |

### 4.3 New Functions

| Function | Purpose |
|----------|---------|
| `updateWeeklyMemberStats(sheet)` | Calculates B, C, D for all members |
| `getBossPointsMap()` | Returns boss points as a map |
| `calculatePointsConsumed(member, weekStart)` | Sums bidding from BiddingPoints for week |
| `calculateAttendancePoints(checkmarks, bossNames, bossPoints, timestamps)` | Calculates D column |
| `getWeekStartDate(sheetName)` | Extracts Mon 3am from sheet name |
| `getPreviousWeekSheet(ss, currentSheet)` | Gets previous week's sheet |
| `getPreviousWeekAttendance(prevSheet, member)` | Gets previous week's C value |
| `recalculateAllStats()` | Utility to recalculate all sheets |
| `debugWeeklyStats()` | Testing helper |

### 4.4 Calculation Logic

**Column B (Points Consumed):**
```javascript
// Sum of all BiddingPoints columns where date falls within:
// Mon 3:00am to Sun 2:59:59am
```

**Column D (Attendance Points):**
```javascript
// For each TRUE checkmark:
//   basePoints = bossPoints[bossName] || 1
//   timeBonus = 1 if timestamp is between 00:59 and 07:01
//   totalPoints += basePoints + timeBonus
```

**Column C (Points Left):**
```javascript
// Previous week's C value + D - B
```

### 4.5 Bug Fixes Applied

| Bug | Fix |
|-----|-----|
| Week end was Sat 00:00 | Now Sun 2:59:59.999 |
| Time bonus for 00:00 | Added check: totalMins !== 0 |
| Boss names with # suffixes | Added: bossName.replace(/\s*#\d+$/, '') |
| Orphaned code (return sheet;}) | Removed |

### 4.6 Auto-Update Triggers
Stats are recalculated when:
- New attendance is submitted (`handleSubmitAttendance`)
- Attendance is overwritten (`handleOverwriteAttendance`)

---

## 5. REMOVED FEATURES

### 5.1 Disabled in doPost handler:
- savePredictionForLearning
- updatePredictionAccuracy
- getLearningData
- getLearningMetrics
- bootstrapLearningFromHistory
- needsBootstrap
- getLearnedPatterns
- getUserPreferences
- getNegativePatterns
- syncNLPLearning
- saveMilestoneQueue (still in handler, but milestone features disabled)
- loadMilestoneQueue
- clearMilestoneQueue
- getMilestoneHistory
- updateMilestoneHistory
- ensureMilestoneTabsExist
- getStreakData
- updateStreakData
- getGuildMilestones
- recordGuildMilestone
- logWeeklyMilestone
- getWeeklyMilestones

### 5.2 Disabled in utils/sheet-api.js:
- exportLearningData
- exportPredictionFeatures
- bootstrapLearning
- needsBootstrap

### 5.3 Sheets NOT Auto-Created (removed):
- BotLearning
- MilestoneTracking
- MilestoneQueue
- AttendanceStreaks
- GuildMilestones
- WeeklyMilestoneLog
- NLP_LearnedPatterns
- NLP_UserPreferences
- NLP_NegativePatterns
- NLP_UnrecognizedPhrases
- NLP_Analytics

---

## 6. FILES UPDATED

| File | Changes |
|------|---------|
| Code.js | Full migration as documented above |

---

## 7. REMAINING TASKS

### 7.1 Code Cleanup Status - COMPLETED

**All BotLearning/Milestones/NLP code has been disabled:**

**Disabled Functions (Code.js):**
- [x] `exportLearningData` - DISABLED
- [x] `exportPredictionFeatures` - DISABLED
- [x] `bootstrapLearningFromHistory` - DISABLED
- [x] `calculateTrend` - DISABLED
- [x] `calculateBootstrapAccuracy` - DISABLED
- [x] `needsBootstrap` - DISABLED
- [x] `weeklyLearningExport` - DISABLED

**Disabled Methods (utils/sheet-api.js):**
- [x] `exportLearningData` - DISABLED
- [x] `exportPredictionFeatures` - DISABLED
- [x] `bootstrapLearning` - DISABLED
- [x] `needsBootstrap` - DISABLED

**Removed:**
- [x] BotLearning from sheetsToBackup array
- [x] Trigger 3 (Weekly Learning Export) from setup instructions
- [x] Orphaned bootstrap code (lines 4622-4786 - was outside function)
- [x] Orphaned exportPredictionFeatures code block
- [x] Duplicate: `calculateAverageAccuracy`, `groupByType` (dead code)
- [x] Duplicate section headers

**File Size:** ~6600 lines → ~6361 lines (~239 lines removed/cleaned)

### 7.2 Other Files to Update
These files still have ELYSIUM references and may need updates:
- index2.js
- attendance.js
- bidding.js
- auctioneering.js
- leaderboard-system.js
- boss-rotation.js
- commands/handlers.js
- And others in the codebase

### 7.3 Apps Script Trigger Setup
When deploying to the new Google Sheet:
1. Go to Apps Script > Triggers
2. Set up `mondayWeeklySheetCreation`:
   - Time-driven
   - Week timer
   - Every Monday
   - 12am-1am

---

## 8. SHEET STRUCTURE REFERENCE

### 8.1 WEEK_YYYYMMDD Sheets
```
Row 1: [empty] | [empty] | [empty] | [empty] | Timestamp | Timestamp | ...
Row 2: [empty] | [empty] | [empty] | [empty] | Boss Name | Boss Name | ...
Row 3+: Member | Points Consumed | Points Left | Att. Points | Checkmark | Checkmark | ...
```

### 8.2 BiddingPoints Structure
```
Col A: MEMBERS
Col B: BIDDING POINTS AVAILABLE
Col C: TOTAL BIDDING POINTS CONSUMED
Col D+: Dates (as column headers) with point values
```

### 8.3 BossPoints Structure
Pre-populated with 41 bosses with point values (1, 2, 3, 5, or 10)

---

## 9. FIRST DEPLOYMENT CHECKLIST

- [ ] Create new Google Sheet with ID: `1K07R6lXnsha7NshyAnIL4Iq034PlYCP64TaiPJwseCw`
- [ ] Copy updated Code.js to Apps Script
- [ ] Set up mondayWeeklySheetCreation trigger
- [ ] Deploy as Web App (doGet, doPost)
- [ ] Update Discord bot config with new Web App URL
- [ ] Clean up remaining code in Code.js (see 7.1)
- [ ] Update other files with TrailerParkB references

---

## 10. TESTING

### 10.1 Test Functions Available
- `recalculateAllStats()` - Recalculate all WEEK_ sheets
- `debugWeeklyStats()` - Return calculated values for current sheet
- `ensureSheetsExist(ss)` - Create all primary sheets
- `clearAttendanceCache()` - Clear attendance cache

### 10.2 Manual Test Sequence
1. Run `ensureSheetsExist()` to create all sheets
2. Submit attendance via bot
3. Check WEEK_ sheet for correct B, C, D values
4. Run `debugWeeklyStats()` to verify calculation output

---

## Summary 

**Completed:**
- New Google Sheet ID configured
- Week timing changed to Monday 3:00am
- All ELYSIUM → TrailerParkB references updated in Code.js
- Formula-based calculations replaced with programmatic approach
- All primary sheets auto-create on first WEEK_ sheet creation
- BotLearning and Milestones removed from auto-creation
- **All BotLearning/Milestones/NLP code DISABLED**
- Orphaned code blocks removed
- Duplicate section headers cleaned up

**Session 7 Additions:**
- Member Registry System with auto nickname updates
- Bulk nickname update across MongoDB and Google Sheets
- Bidding system uses Discord ID for nickname-agnostic tracking
- **Data isolation** - separate MongoDB database for TrailerParkB

**Last Updated:** 2026-04-27 (Session 7 - Member Registry + Data Isolation)

---

## 3. MEMBER REGISTRY SYSTEM

### 3.1 Overview
A new member registry system that tracks members by Discord ID (immutable) and auto-updates when nicknames change.

### 3.2 Key Features
- **Discord ID as primary key** - Never changes, used for all member lookups
- **Nickname (IGN) as display name** - Auto-updates when member changes nickname
- **MongoDB collection** `member_registry` - Stores all member data
- **Google Sheets sync** - `MemberRegistry` sheet with member data
- **Event listeners** - Auto-registers new members, updates on nickname changes

### 3.3 Files Created/Modified

| File | Changes |
|------|---------|
| `member-registry.js` | New module - member registry core functions |
| `index2.js` | Added GuildMemberAdd/Update event listeners |
| `Code.js` | Added `handleUpdateMemberRegistry` and `handleGetMemberRegistry` |
| `auctioneering.js` | Imported member-registry module |

### 3.4 Member Record Fields

| Field | Description |
|-------|-------------|
| `discordId` | Immutable - used for recognition |
| `username` | Discord username (may change) |
| `nickname` | IGN - primary identifier for records |
| `displayName` | Effective display name |
| `joinedAt` | When they joined the guild |
| `registeredAt` | When registry entry created |
| `lastUpdated` | Last nickname change |

### 3.5 Bidding System Updates
- `lock()` and `unlock()` functions now accept Discord ID as preferred key
- `avail()` function uses Discord ID for nickname-agnostic calculation
- Winner lookups use `curWinId` when available

---

## 4. BULK NICKNAME UPDATE SYSTEM

### 4.1 Overview
When a member changes their Discord nickname, all historical records (both MongoDB and Google Sheets) are automatically updated to reflect the new nickname.

### 4.2 How It Works

```
Member changes nickname in Discord
        ↓
GuildMemberUpdate event fires
        ↓
member-registry.onNicknameChange()
        ↓
├─→ Updates member-registry (MongoDB)
├─→ Updates MongoDB attendance records (bulk by Discord ID)
└─→ Triggers Google Sheets bulk update
        ↓
Code.js searches ALL sheets for old nickname
        ↓
Replaces all occurrences with new nickname
```

### 4.3 Files Updated

| File | Changes |
|------|---------|
| `member-registry.js` | Added `bulkUpdateAllRecords()`, `updateMongoDBRecords()`, `triggerSheetsBulkUpdate()` |
| `Code.js` | Added `handleBulkUpdateNickname()` - searches all sheets and updates names |
| `member-registry.js` | Added `normalizeMemberNamesFromRegistry()` and `getCurrentNickname()` |

### 4.4 Example Scenario

**Before:** Member "Rohypnol" changes nickname to "HesuCrypto"

| Location | Before | After |
|----------|--------|-------|
| WEEK_* sheets | Rohypnol | HesuCrypto |
| BiddingPoints sheet | Rohypnol | HesuCrypto |
| BiddingItems sheet | Rohypnol | HesuCrypto |
| MongoDB attendance | Rohypnol | HesuCrypto |
| MemberRegistry | Rohypnol | HesuCrypto |

---

## 5. DATA ISOLATION (New Guild Setup)

### 5.1 MongoDB Database Separation
Since TrailerParkB is a **new guild**, all data is stored in a **separate database** to avoid mixing with Elysium data.

| Guild | Database Name | Collection Suffix |
|-------|--------------|-------------------|
| Elysium | `elysium-bot` | (original) |
| TrailerParkB | `elysium-bot-tpb` | `-TPB` suffix |

### 5.2 Files Updated for Data Isolation

| File | Change |
|------|--------|
| `config.json` | Added `"mongodb_database": "elysium-bot-tpb"` |
| `utils/database-api.js` | Reads database name from config.json |
| `member-registry.js` | Uses guild-specific collection `member_registry-TPB` |

### 5.3 Collection Naming Convention

```
member_registry-TPB
```

### 5.4 Google Sheets Isolation
All sheets are controlled by the bot's `sheet_webhook_url` configuration. TrailerParkB points to a **new Google Sheet** with its own data.

---

## Session Log

### Session 7 (Today - Member Registry System + Data Isolation)
- Created `member-registry.js` module:
  - `getOrCreateMember()` - Get or create member record by Discord member
  - `findByDiscordId()` - Find by Discord ID
  - `updateNickname()` - Update nickname and sync to MongoDB/Sheets
  - `onMemberJoin()` - Event handler for new guild members
  - `onNicknameChange()` - Event handler for nickname updates (with bulk update)
  - `bulkUpdateAllRecords()` - Triggers MongoDB + Sheets bulk update
  - `cacheName()` / `getCurrentName()` - Fast sync lookups
- Updated `index2.js`:
  - Initialized member-registry module on startup
  - Added `Events.GuildMemberAdd` listener
  - Added `Events.GuildMemberUpdate` listener
- Updated `bidding.js`:
  - `lock(u, amt, userId)` - Now uses userId as key
  - `unlock(u, amt, userId)` - Now uses userId as key
  - `avail(u, tot, userId)` - Uses userId for calculation
  - Updated all bid processing to pass Discord ID
- Updated `auctioneering.js`:
  - Imported member-registry for future use
- Updated `Code.js` (Google Apps Script):
  - Added `handleUpdateMemberRegistry()` action
  - Added `handleGetMemberRegistry()` action
  - Added `handleBulkUpdateNickname()` action
  - Added `normalizeMemberNamesFromRegistry()` for current nickname lookup
  - Added `getCurrentNickname()` for single name lookup
  - Auto-creates `MemberRegistry` sheet
- Data Isolation:
  - `config.json` - Added `mongodb_database: "elysium-bot-tpb"`
  - `utils/database-api.js` - Reads DB name from config
  - `member-registry.js` - Uses `member_registry-TPB` collection

### Session 6 (Today)
- Disabled all BotLearning functions in Code.js:
  - exportLearningData, exportPredictionFeatures
  - bootstrapLearningFromHistory, calculateTrend
  - calculateBootstrapAccuracy, needsBootstrap
  - weeklyLearningExport
- Removed BotLearning from sheetsToBackup array
- Disabled trigger setup instructions for weeklyLearningExport
- Disabled learning methods in utils/sheet-api.js
- Fixed orphaned code (lines 4622-4786 - was outside function)
- Removed dead code: calculateAverageAccuracy, groupByType
- Fixed duplicate section headers
- File reduced from ~6600 to ~6361 lines

### Session 5 (Today)
- Disabled Core Evaluation system in index2.js:
  - coreEvaluation module require commented out
  - All coreEvaluation.initialize() calls disabled
  - All coreEvaluation.forceEvaluationNow() calls disabled
  - All coreEvaluation.forceCloseCycle() calls disabled
  - All coreEvaluation.forceResetCycle() calls disabled
  - All coreEvaluation.handleCPCommand() calls disabled
  - core_evaluation_commands_channel checks commented out
- Fixed hardcoded channel ID in index2.js (lines 5998-5999):
  - Changed `<#1431640753238442014>` to `<#${config.bot_manual_channel_id}>`

### Session 6 (Today)
- Updated weekly report schedule from Saturday 11:59pm to Monday 2:59am GMT+8
- Updated leaderboard-system.js:
  - calculateNextSaturday1159PM → calculateNextMonday259AM
  - All Saturday references changed to Monday 2:59am
- Updated help-system.js descriptions
- Updated README.md
- Updated MIGRATION_DOCUMENTATION.md

### Session 5 (Earlier Today)
- Removed: Learning Data Exports section
- Removed: Milestone orphaned code
- Cleaned: NLP LEARNING SYSTEM comments

### Session 2
- Removed: BotLearning and Milestones from doPost handlers
- Removed: NLP action handlers
- Removed: Learning Metrics system

### Session 1
- All initial migration changes (Monday 3am, programmatic stats, etc.)