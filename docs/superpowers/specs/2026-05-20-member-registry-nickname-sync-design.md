# Member Registry & Nickname Auto-Sync — Design Doc

> **For agentic workers:** This spec covers two related subsystems: (1) a new Member Registry tab in Google Sheets that maps Discord IDs to current nicknames, with automatic historical name updates; (2) a cleanup pass on `Code.js` (the reference copy-paste file for Google Apps Script) to remove dead/unused code.

**Status:** Draft
**Updated:** 2026-05-20

---

## Overview

Currently the bot has no way to track members across nickname changes. When a member changes their Discord nickname, they become a "different person" in Google Sheets because attendance records are keyed by display name only. MongoDB has Discord ID support via `discord-id-mapper.js` but it's not used during the attendance flow.

This design adds:

1. A `Member Registry` tab in Google Sheets as the single source of truth for Discord ID ↔ nickname mapping
2. Auto-detection of nickname changes with historical find-and-replace across all weekly sheets
3. Integration of the existing `discord-id-mapper.js` into the attendance flow so MongoDB stays synced
4. Cleanup of `Code.js` to remove ~3000+ lines of dead code (ML learning system, milestone tracking, Google Drive backups, NLP system, loot system, old auction handling, event reminders)

---

## Section 1: Member Registry Tab (Google Sheets)

### Tab Structure

A new tab named `Member Registry` (always the first sheet) with these columns:

| Column | Header | Type | Purpose |
|--------|--------|------|---------|
| A | Discord ID | String | Discord user ID (immutable) |
| B | Current Nickname | String | Server nickname at last sync |
| C | Last Updated | Date | When the row was last modified |

### Initialization

On any webhook call to Code.gs (existing `doPost` action dispatch), check if `Member Registry` tab exists. If not, create it with headers. This happens automatically on the next bot interaction after deployment — no manual setup needed.

### Webhook Action: `syncMemberRegistry`

**Payload:**

```json
{
  "action": "syncMemberRegistry",
  "members": [
    {"discordId": "182081219062661120", "nickname": "Brunong"},
    {"discordId": "987654321098765432", "nickname": "PlayerTwo"}
  ]
}
```

**Handler logic:**

1. For each member in the `members` array:
   a. Look up by **Discord ID** in the registry (exact match on column A)
   b. If found:
      - Compare `Current Nickname` with the incoming `nickname`
      - If nickname changed → **scan all weekly sheets** (every `ELYSIUM_WEEK_*` tab), find-and-replace old nickname → new nickname in ALL cells
      - Update `Current Nickname` and `Last Updated`
   c. If NOT found:
      - Append new row with Discord ID, nickname, and current date

**Edge cases:**

- Empty `members` array → no-op, return success
- Multiple members with same Discord ID → last one wins (shouldn't happen, but defensive)
- Sheet-based find-and-replace uses `Sheet.createTextFinder()` which is O(n) per sheet but the sheets are small (~200 rows × ~30 columns), so performance is acceptable
- If `Member Registry` tab doesn't exist, create it on the fly

---

## Section 2: Bot-Side Integration

### Where to Add `ensureMemberExists` Calls

The existing `discord-id-mapper.js` at `utils/discord-id-mapper.js` has `ensureMemberExists({id, nickname})` which:

- Looks up by Discord ID in MongoDB
- Creates/updates the member document with the latest nickname
- Migrates temp IDs to real Discord IDs if needed

This is currently only called on startup (batch migration). We need to call it during the **attendance flow** whenever a member is verified.

**Location:** `modules/attendance/auto-close.js`, around lines 285-296, inside the `for (const memberName of spawnInfo.members)` loop. At this point, both `memberName` and `discordId` are available.

**Addition:**

- Import `discordIdMapper` at the top of `auto-close.js`
- Before the MongoDB attendance save, call `discordIdMapper.ensureMemberExists({id: discordId, nickname: memberName})`
- This is fire-and-forget — the MongoDB member record gets updated, but the attendance save doesn't depend on it

### Where to Send `syncMemberRegistry` Webhook

After the parallel MongoDB + Sheets save completes successfully (around line 383 in auto-close.js), send a new webhook call:

```javascript
await postToSheet({
  action: "syncMemberRegistry",
  members: spawnInfo.members.map(name => ({
    discordId: spawnInfo.memberIds?.[name],
    nickname: name
  })).filter(m => m.discordId)
});
```

This can run in parallel with the existing post-submission tasks (cache invalidation, boss rotation increment).

---

## Section 3: Code.js Cleanup

### Scope

`Code.js` is a reference file (7078 lines) that the user copy-pastes into Google Apps Script. It contains many features that were built but never wired up by the bot.

### Dead Code to Remove

The following subsystems have NO matching caller in any bot-side JavaScript file:

| System | Lines | Functions |
|--------|-------|-----------|
| ML Learning System | ~1700 | `savePredictionForLearning`, `updatePredictionAccuracy`, `getLearningData`, `getLearningMetrics`, `bootstrapLearningFromHistory`, `needsBootstrap`, all NLP learning actions, `saveLearnedPattern`, `getLearnedPatterns`, `getUserPreferences`, `getNegativePatterns`, `syncNLPLearning`, `updateNLPAnalytics`, `manualInitializeNLP`, `initializeNLPTabs`, `getBotLearningSheet`, `calculateAverageAccuracy`, `groupByType` |
| Google Drive Integration | ~500 | `initializeDriveFolders`, `uploadScreenshot`, `exportLearningData`, `exportPredictionFeatures`, `createDailyBackup`, `logAuditTrail`, `cleanupOldBackups`, `getOrCreateFolder`, `getDateFolder`, `DRIVE_CONFIG` |
| Milestone Tracking | ~900 | `getMilestoneHistory`, `updateMilestoneHistory`, `saveMilestoneQueue`, `loadMilestoneQueue`, `clearMilestoneQueue`, `ensureMilestoneTabsExist`, `getStreakData`, `updateStreakData`, `getGuildMilestones`, `recordGuildMilestone`, `logWeeklyMilestone`, `getWeeklyMilestones`, `ensureMilestoneTrackingSheet`, `ensureMilestoneQueueSheet` |
| Loot System | ~300 | `handleSubmitLootEntries`, `getLootState`, `saveLootState`, `getHistoricalPrices`, `getForDistribution` |
| Old Auction Items | ~200 | `getBiddingItems`, `getBiddingItemsWithWinners`, `logAuctionResult`, `moveQueueItemsToSheet`, `moveItemToForDistribution`, `moveAllItemsWithWinnersToForDistribution` |
| Event Reminders | ~150 | `saveEventReminders`, `loadEventReminders`, `ensureEventRemindersSheet` |
| NLP Tabs | ~200 | `initializeNLPTabs`, NLP sheet creation (in `hideNLPTabs`) |
| Debug/Test | ~50 | `clearAttendanceCache`, `testMoveItem` |
| Misc Redundant | ~100 | `getCurrentWeekSheetName` (duplicate of `getCurrentWeekSheet`), repeated `CONFIG` access patterns |

### Code to KEEP

The following core systems are actively used by the bot:

1. **Attendance** — `handleCheckColumn`, `handleSubmitAttendance`, `handleOverwriteAttendance`, `getAllSpawnColumns`, `getAllWeeklyAttendance`, `getAttendanceForBoss`, `getAttendanceState`, `saveAttendanceState`
2. **Bidding** — `handleGetBiddingPoints`, `handleSubmitBiddingResults`, `handleRemoveMember`, `invalidateBiddingPointsCache`, `updateBiddingPoints`
3. **Member Stats** — `getMemberStats`, `updateTotalAttendanceAndMembers`
4. **Leaderboards** — `getAttendanceLeaderboard`, `getBiddingLeaderboard`, `getWeeklySummary`
4b. **Total Attendance** — `getTotalAttendance`
5. **Boss Rotation** — `getAllRotatingBosses`, `getBossRotation`, `incrementBossRotation`, `setBossRotation`, `ensureBossRotationSheetExists`
6. **Crash Recovery** — `ensureRecoverySheet`, `saveRecoveryState`, `loadRecoveryState`
7. **Boss Timer Recovery** — `getBossTimerRecovery`, `saveBossTimerRecovery`, `deleteBossTimerRecovery`, `clearBossTimerRecovery`
8. **Auto Triggers** — `onEdit`, `sundayWeeklySheetCreation`, `getCurrentWeekSheet`, `copyMembersFromPreviousWeek`
9. **Utilities** — `createResponse`, `normalizeUsername`, `normalizeTimestamp`, `CONFIG`, `COLUMNS`

### ALSO keep:

- **NEW: `syncMemberRegistry` handler** (to be added as part of this design)

### Cleanup Strategy

The cleanup removes all dead action dispatchers from the `doPost` function AND the corresponding handler functions. The file will shrink from ~7078 lines to roughly ~3000-3500 lines. After cleanup, `doPost` will only dispatch actions that have real handlers.

---

## Section 4: Data Flow Summary

```
Member checks in (types "present" + screenshot)
         │
         ▼
Admin approves (verify button click)
         │
         ▼
Thread closes (auto or manual)
         │
         ▼
auto-close.js:
  1. For each verified member:
     → discordIdMapper.ensureMemberExists({id, nickname})
     → Updates MongoDB member doc with latest nickname
  2. Save attendance to MongoDB (existing)
  3. Save attendance to Sheets via submitAttendance (existing)
  4. Send syncMemberRegistry webhook (NEW):
     → [{discordId, nickname}] to Google Sheets
         │
         ▼
Code.gs handleSyncMemberRegistry:
  1. Update Member Registry tab
  2. If nickname changed → find-and-replace across all weekly sheets
```

---

## Section 5: What NOT to Change

- The weekly attendance sheets remain exactly as they are (member names in column A, spawn columns after column D)
- The `submitAttendance` action payload stays the same — only members array of names
- MongoDB schema stays the same — `discord-id-mapper.js` already handles it
- The bot's existing `!commands` and `/commands` are untouched
- `onEdit` trigger stays (it auto-updates BiddingPoints and TotalAttendance)
- `sundayWeeklySheetCreation` stays (creates new weekly sheets)

---

## Open Questions

1. Should we also call `ensureMemberExists` on check-in (before verification) or only on thread close?
   → **Decision:** On thread close only. That's when the member is definitely verified and we know the final nickname.

---

*End of design doc*
