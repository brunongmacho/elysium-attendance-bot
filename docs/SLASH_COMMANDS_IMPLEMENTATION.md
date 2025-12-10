# ELYSIUM Guild Bot - Slash Commands Implementation Plan

**Version:** 4.1
**Date:** 2025-12-10
**Status:** Implementation Complete ✅ (Phase 1-3 + Attendance Overrides deployed, Phase 4 skipped)

---

## Table of Contents

- [Phase 1 Completion Summary](#phase-1-completion-summary)
- [Phase 2 Completion Summary](#phase-2-completion-summary)
- [Phase 3 Completion Summary](#phase-3-completion-summary)
- [Overview](#overview)
- [Strategy](#strategy)
- [Implementation Phases](#implementation-phases)
- [Command Specifications](#command-specifications)
- [Technical Architecture](#technical-architecture)
- [Autocomplete Implementation](#autocomplete-implementation)
- [Migration Strategy](#migration-strategy)
- [Testing Plan](#testing-plan)
- [Rollback Plan](#rollback-plan)

---

## Phase 1 Completion Summary

### ✅ What Was Completed

**Date Completed:** 2025-12-10

**Systems Implemented:**
- ✅ **Boss Timer System** (9 commands) - Fully functional with Discord embeds
- ✅ **Boss Rotation System** (4 subcommands) - Fully functional with Discord embeds
- ✅ **Attendance System** (7 commands) - Fully functional with pending member autocomplete
- ✅ **Tip System** - Smart adoption tracking to encourage slash command usage
- ✅ **Dynamic Channel Names** - Command descriptions show actual channel names

**Total Commands Implemented:** 20 slash commands (9 boss timer + 4 rotation + 7 attendance)

### 🎯 Key Achievements

1. **Boss Timer Commands** - All 9 commands fully working:
   - `/killed <boss> [timestamp]` - Records boss kills with beautiful embeds, boss images, spawn calculations
   - `/spawned <boss>` - Marks boss as spawned
   - `/nextspawn` - Shows upcoming spawns
   - `/unkill <boss>` - Removes kill records
   - `/setboss <boss> <status>` - Manually set boss status
   - `/nospawn <boss>` - Mark boss not spawning
   - `/maintenance` - Spawn all 22 bosses after server maintenance
   - `/serverdown` - Handle server downtime
   - `/clearkills` - Clear all kill records (admin)

2. **Boss Rotation Commands** - All 4 subcommands fully working:
   - `/rotation status` - Display current rotation for all rotating bosses
   - `/rotation set <boss> <position>` - Manually set rotation index
   - `/rotation increment <boss>` - Advance rotation to next guild
   - `/rotation refresh` - Reload data from Google Sheets

3. **Attendance Commands** - All 7 commands fully working:
   - `/verify <member>` - Individual verification with pending member autocomplete
   - `/deny <member> [reason]` - Denial with optional reason
   - `/verifyall` - Bulk verify with duplicate detection
   - `/denyall` - Bulk deny all pending
   - `/close [thread]` - Close thread (integrates with existing close logic)
   - `/closeall` - Mass close all threads with confirmation
   - `/resetpending` - Clear pending queue

4. **Autocomplete Implementation:**
   - ✅ Boss name autocomplete with fuzzy matching (36 bosses)
   - ✅ Multi-word boss name support ("Lady Dalia", "General Aquleus", "Baron Braudmore")
   - ✅ Dynamic rotation boss autocomplete (syncs from Google Sheets)
   - ✅ Pending member autocomplete (extracts unique author names)
   - ✅ Levenshtein distance matching for typo tolerance

5. **Discord Embed Integration:**
   - ✅ All slash commands return embeds matching legacy `!` commands
   - ✅ Boss images included as thumbnails
   - ✅ Consistent formatting with existing bot style
   - ✅ Timestamps and footers properly set

6. **Permission System:**
   - ✅ Admin-only commands restricted with `PermissionFlagsBits.Administrator`
   - ✅ DM commands disabled with `dm_permission: false`
   - ✅ Permission checks identical to `!` commands

7. **Technical Infrastructure:**
   - ✅ Shared handler pattern (slash + prefix use same business logic)
   - ✅ Synthetic message objects for compatibility
   - ✅ Proper deferred replies for long-running operations
   - ✅ Guild-specific command registration for instant updates
   - ✅ Dynamic channel names in descriptions (fetched from Discord on startup)
   - ✅ Error handling with user-friendly messages

8. **Adoption Features:**
   - ✅ Tip system tracks slash command usage per user
   - ✅ Smart tip suggestions on prefix commands (non-intrusive)
   - ✅ 18 commands mapped with benefits (e.g., "autocomplete for boss names")
   - ✅ Per-user tip disable/enable functionality

### 🐛 Issues Fixed

1. **BigInt Serialization Error** - Converted `PermissionFlagsBits.Administrator` to `.toString()`
2. **InteractionAlreadyReplied Error** - Fixed deferred reply timing and synthetic message mapping
3. **Embed Overwriting** - Removed redundant `editReply()` calls that overwrote handler embeds
4. **Rotation Display Issues** - Improved handling of incomplete guild data in Google Sheets
5. **Static Autocomplete** - Made rotation boss autocomplete dynamic from Google Sheets

### 📊 Files Created/Modified

**New Files:**
- `commands/slash-commands.js` - Dynamic command definitions with channel name generation
- `commands/register-commands.js` - Command registration with channel name fetching
- `commands/autocomplete.js` - Autocomplete handlers with fuzzy matching
- `commands/handlers.js` - Slash command execution handlers for all 20 commands
- `commands/tip-system.js` - Adoption tracking and tip suggestion system

**Modified Files:**
- `index2.js` - Added slash command and autocomplete listeners
- `boss-rotation.js` - (reviewed for integration, no changes needed)
- `boss-timer-commands.js` - (reviewed for integration, no changes needed)
- `attendance.js` - (reviewed for integration, no changes needed)

### 🔄 Dual Support Status

**Both command types work identically:**
- `!killed venatus` → Same embed as `/killed venatus`
- `!rotation status` → Same embed as `/rotation status`
- All business logic shared between command types
- Zero breaking changes to existing workflows

---

## Phase 2 Completion Summary

### ✅ What Was Completed

**Date Completed:** 2025-12-10

**Systems Implemented:**
- ✅ **Auction System** (4 commands) - Simplified to essential commands only

**Total Commands Implemented:** 4 slash commands

### 🎯 Key Achievements

1. **Member Commands:**
   - `/bid <amount>` - Place bid on current auction item with validation (min_value: 1)

2. **Admin Commands:**
   - `/auction start` - Manually start auction session
   - `/auction forceend` - Emergency auction termination with result submission

3. **Queue Management:**
   - `/queue list` - View auction queue (items managed in Google Sheets)

**Phase 2 Design Decision:**
- Simplified from original 14 commands to 4 essential commands
- Queue add/remove managed in Google Sheets (simpler workflow)
- Focus on core auction operations only

---

## Phase 3 Completion Summary

### ✅ What Was Completed

**Date Completed:** 2025-12-10

**Systems Implemented:**
- ✅ **Stats & Reports System** (3 commands) - Member statistics and guild reports

**Total Commands Implemented:** 3 slash commands

### 🎯 Key Achievements

1. **Member Statistics:**
   - `/stats [member]` - View attendance and bidding statistics
     - Autocomplete: MongoDB member lookup (includes inactive members)
     - Shows personal stats when used without member parameter
     - Displays: attendance, points, ranking, recent activity, member lore
     - Auto-deletes after 5 minutes

2. **Guild Reports:**
   - `/weekly` - Generate weekly activity report
     - Boss spawn statistics with week-over-week comparison
     - Top 10 most active members with star ratings
     - Last week's top 3 for guild rewards
     - Activity patterns and bidding summary
     - Guild performance metrics

   - `/monthly` - Generate monthly activity report
     - Comprehensive monthly overview with activity percentage
     - Top 20 most active members (split into two sections)
     - Weekly breakdown showing best-performing week
     - Peak activity patterns (days and hours)
     - Complete bidding economy summary

3. **MongoDB Integration:**
   - `/stats` autocomplete fetches from MongoDB (not just Discord cache)
   - Matches `!stats` behavior exactly
   - Includes all members (active and inactive)
   - Fast response times with MongoDB queries

### 🐛 Issues Fixed

1. **Stats Autocomplete Mismatch** - Updated to use MongoDB instead of Discord cache to match `!stats` behavior
2. **Member Lookup** - Uses `username` field from MongoDB (which stores display names/nicknames)

**Phase 3 is 100% Complete! ✅**

All 3 commands implemented, tested, and operational.

---

## Attendance Override Commands (Added 2025-12-10)

### ✅ What Was Completed

**Date Completed:** 2025-12-10

**Systems Implemented:**
- ✅ **Attendance Override System** (2 commands) - Error recovery and manual corrections

**Total Commands Implemented:** 2 slash commands

### 🎯 Key Achievements

1. **Thread Reopening:**
   - `/openthread` - Reopen a closed attendance thread for manual corrections
     - Must be used inside an attendance thread
     - Unarchives and unlocks the thread
     - Re-registers the spawn in bot memory
     - Loads existing members from MongoDB
     - Re-queues all check-in messages as pending verifications
     - Requires confirmation before execution
     - Admin-only command

2. **Override Close:**
   - `/overrideclose` - Close thread and overwrite existing attendance data
     - Must be used in a thread that's in bot memory
     - Auto-verifies all pending check-ins before closing
     - Always uses `overwriteAttendance` action (handles both new and existing columns)
     - Shows warning if column already exists
     - Skips rotation increment if thread was reopened (fixing attendance, not a new kill)
     - Requires confirmation before execution
     - Admin-only command

3. **Use Cases:**
   - Fixing attendance errors after a thread was closed
   - Correcting member verifications
   - Resubmitting attendance with manual adjustments
   - Frequently used commands for attendance error recovery

### 📝 Implementation Details

**Commands added to:**
- `commands/slash-commands.js` - Added `generateAttendanceOverrideCommands()`
- `commands/handlers.js` - Added handlers using synthetic message pattern
- `commands/tip-system.js` - Added tip mappings for both commands

**Handler implementation:**
- Both commands use the synthetic message pattern to reuse existing `!openthread` and `!overrideclose` handlers
- No parameters required (context-based commands that work on current thread)
- Admin-only permissions enforced
- Dynamic channel names in descriptions

**Attendance Override Commands are 100% Complete! ✅**

All 2 commands implemented and operational. Frequently used for fixing attendance errors.

---

## Overview

### Goals

Implement Discord slash commands alongside existing `!` prefix commands to provide:
- **Autocomplete** for boss names, items, and users
- **Better mobile UX** for admins managing the guild on-the-go
- **Type validation** to prevent invalid inputs
- **Modern Discord interface** while maintaining backward compatibility

### Key Principles

1. **Dual Support** - All `!` commands continue working during and after transition
2. **No Breaking Changes** - Existing workflows remain functional
3. **Gradual Adoption** - Users choose when to switch
4. **Autocomplete First** - Leverage autocomplete where it provides most value
5. **Shared Handlers** - Single business logic for both command types

### Scope

**Original Plan:**
- **~50 slash commands** across 6 major systems

**Actual Implementation (Phase 1-3 + Attendance Overrides):**
- **29 slash commands** across 5 major systems (simplified from original plan)
  - Phase 1: 20 commands (Boss Timer, Rotation, Attendance)
  - Phase 2: 4 commands (Auction - simplified)
  - Phase 3: 3 commands (Stats & Reports - focused on essentials)
  - Attendance Overrides: 2 commands (Error recovery tools - frequently used)
- **Full autocomplete** for boss names (36 bosses), pending members, and MongoDB member lookup
- **Subcommand grouping** for related operations (`/rotation`, `/auction`, `/queue`)
- **Permission parity** with existing `!` commands

---

## Strategy

### Why Dual Support?

**Primary Users:**
- Veterans/admins comfortable with `!` commands
- Mobile users who prefer slash commands
- New members discovering commands through autocomplete

**Primary Use Cases:**
- High-frequency admin commands (boss kills, attendance verification, auction management)
- Member stat checks and leaderboards
- Emergency operations

### Transition Approach

**Phase-based rollout:**
1. Implement highest-priority systems first
2. Gather admin feedback
3. Iterate on UX
4. Expand to remaining systems
5. Monitor adoption metrics
6. Maintain `!` commands indefinitely (no forced migration)

---

## Implementation Phases

### **Phase 1: Critical Admin Systems** ✅ 100% COMPLETE

**Status:** Completed 2025-12-10

**Systems:**
- ✅ Boss Timer System (9 commands) - FULLY IMPLEMENTED
- ✅ Boss Rotation System (4 subcommands) - FULLY IMPLEMENTED
- ✅ Attendance System (7 commands) - FULLY IMPLEMENTED
- ✅ Tip Tracking System - FULLY IMPLEMENTED
- ✅ Dynamic Channel Names - FULLY IMPLEMENTED

**Why first:**
- Most-used admin commands daily
- Mobile management critical during boss fights
- Autocomplete has highest impact (36 boss names, multi-word names like "Lady Dalia")
- Proves value to veteran admins immediately

**Results:**
- **20 slash commands** deployed and tested (100% of Phase 1)
- All commands return Discord embeds matching legacy format
- Boss name and pending member autocomplete working
- Dynamic rotation boss list from Google Sheets
- Dynamic channel names in command descriptions
- Tip system encouraging slash command adoption
- Zero breaking changes to existing `!` commands
- Admin feedback: Positive (all systems tested and confirmed working)

**Estimated effort:** 4-5 days → **Actual: 1 day** (faster due to shared handler pattern)

---

### **Phase 2: Auction System** ✅ 100% COMPLETE

**Status:** Completed 2025-12-10

**Systems:**
- ✅ Bidding commands (1 command)
- ✅ Auction management (2 subcommands)
- ✅ Queue management (1 subcommand)

**Why second:**
- High-frequency system
- Clean subcommand structure
- Members + admins both use

**Results:**
- **4 slash commands** deployed (simplified from 14)
- `/bid <amount>` with integer validation
- `/auction start` and `/auction forceend` for admin control
- `/queue list` for viewing queue
- Queue add/remove managed in Google Sheets (simpler workflow)

**Estimated effort:** 2-3 days → **Actual: 1 day** (simplified scope)

---

### **Phase 3: Stats & Leaderboards** ✅ 100% COMPLETE

**Status:** Completed 2025-12-10

**Systems:**
- ✅ Stats queries (1 command)
- ✅ Reports (2 commands)

**Why third:**
- Member-facing commands
- Simple queries (good for testing user adoption)
- MongoDB autocomplete integration

**Results:**
- **3 slash commands** deployed
- `/stats [member]` with MongoDB autocomplete (includes inactive members)
- `/weekly` with comprehensive guild activity report
- `/monthly` with detailed monthly breakdown
- All commands match `!` command behavior exactly
- MongoDB integration for fast member lookups

**Estimated effort:** 2 days → **Actual: 1 day** (focused on essential commands)

---

### **Phase 4: Emergency/Admin Tools** ⏭️ SKIPPED

**Status:** Skipped - Keeping as `!` commands only

**Reason for skipping:**
- **Very dangerous operations** - High risk of accidental execution
- **Very low frequency** - Used rarely (emergency situations, manual corrections)
- **Existing `!` commands work well** - No mobile convenience needed for these operations
- **Better safety** - Prefix commands require more deliberate action from admins
- **Phase 1-3 covers 95%+ of daily operations** - These edge cases can stay as `!` commands

**Commands staying as `!` only:**
- Emergency bulk operations: `!emergency closeall/verifyall/denyall/resetpending`
- Point manipulation: `!addpoints`, `!removepoints`, `!setpoints`
- System resets: `!resetauction`, `!bootstraplearning`

**Decision:** Keep dangerous admin tools as prefix commands for safety

---

## Command Specifications

### Phase 1A: Attendance System

#### `/verify <member>`
- **Description:** Verify a member's attendance submission
- **Options:**
  - `member` (STRING, required, autocomplete) - Member to verify
- **Autocomplete:** List of members with pending attendance
- **Permissions:** Admin only
- **Channel:** Admin Logs or attendance threads
- **Equivalent:** `!verify <member>`

#### `/deny <member> [reason]`
- **Description:** Deny a member's attendance submission
- **Options:**
  - `member` (STRING, required, autocomplete) - Member to deny
  - `reason` (STRING, optional) - Reason for denial
- **Autocomplete:** List of members with pending attendance
- **Permissions:** Admin only
- **Channel:** Admin Logs or attendance threads
- **Equivalent:** `!deny <member> [reason]`

#### `/verifyall`
- **Description:** Verify all pending attendance submissions
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!verifyall`

#### `/denyall`
- **Description:** Deny all pending attendance submissions
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!denyall`

#### `/close [thread]`
- **Description:** Close an attendance thread
- **Options:**
  - `thread` (CHANNEL, optional, autocomplete) - Thread to close (defaults to current)
- **Autocomplete:** List of open attendance threads
- **Permissions:** Admin only
- **Channel:** Admin Logs or attendance threads
- **Equivalent:** `!close [thread]`

#### `/closeall`
- **Description:** Close all open attendance threads
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!closeall`

#### `/resetpending`
- **Description:** Clear the pending attendance queue
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!resetpending`

#### `/openthread`
- **Description:** Reopen a closed attendance thread for manual corrections
- **Options:** None (context-based - works on current thread)
- **Permissions:** Admin only
- **Channel:** Attendance threads
- **Equivalent:** `!openthread`
- **Notes:** Unarchives thread, re-registers spawn, loads members from MongoDB, re-queues check-ins

#### `/overrideclose`
- **Description:** Close thread and overwrite existing attendance data
- **Options:** None (context-based - works on current thread)
- **Permissions:** Admin only
- **Channel:** Attendance threads
- **Equivalent:** `!overrideclose`
- **Notes:** Auto-verifies pending, always overwrites, skips rotation if thread was reopened

---

### Phase 1B: Boss Timer System

#### `/killed <boss> [timestamp]`
- **Description:** Mark a boss as killed
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
  - `timestamp` (STRING, optional) - Time killed (HH:MM format or "now")
- **Autocomplete:** All 22 boss names with fuzzy matching
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!killed <boss> [timestamp]`
- **Notes:** Supports multi-word boss names like "Lady Dalia", "General Aquleus"

#### `/spawned <boss>`
- **Description:** Mark a boss as spawned
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
- **Autocomplete:** All 22 boss names with fuzzy matching
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!spawned <boss>`

#### `/nextspawn`
- **Description:** Check the next boss spawn time
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!nextspawn`

#### `/unkill <boss>`
- **Description:** Undo a boss kill record
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
- **Autocomplete:** Recently killed bosses
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!unkill <boss>`

#### `/setboss <boss> <status>`
- **Description:** Set a boss status manually
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
  - `status` (STRING, required, autocomplete) - Status (alive, killed, spawned, etc.)
- **Autocomplete:**
  - boss: All 22 boss names
  - status: Predefined status options
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!setboss <boss> <status>`

#### `/nospawn <boss>`
- **Description:** Mark a boss as not spawning
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
- **Autocomplete:** All 22 boss names
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!nospawn <boss>`

#### `/maintenance`
- **Description:** Spawn all 22 bosses (after server maintenance)
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!maintenance`
- **Notes:** Resets all boss timers for server maintenance window

#### `/serverdown`
- **Description:** Handle server downtime
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!serverdown`

#### `/clearkills`
- **Description:** Clear all boss kill records
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!clearkills`

---

### Phase 1C: Boss Rotation System

#### `/rotation status`
- **Description:** View current rotation for all bosses
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!rotation status`

#### `/rotation set <boss> <position>`
- **Description:** Set rotation index for a boss
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name (Amentis, General Aquleus, Baron Braudmore)
  - `position` (INTEGER, required) - Guild position (1-5)
- **Autocomplete:** 3 rotation bosses
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!rotation set <boss> <position>`
- **Validation:** Position must be 1-5

#### `/rotation increment <boss>`
- **Description:** Advance rotation to next guild
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name (Amentis, General Aquleus, Baron Braudmore)
- **Autocomplete:** 3 rotation bosses
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!rotation increment <boss>`

#### `/rotation refresh`
- **Description:** Reload rotation data from Google Sheets
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!rotation refresh`

---

### Phase 2: Auction System

#### `/bid <amount>`
- **Description:** Place a bid on the current auction item
- **Options:**
  - `amount` (INTEGER, required) - Bid amount in points
- **Permissions:** ELYSIUM members only
- **Channel:** Auction threads
- **Equivalent:** `!bid <amount>`
- **Validation:** Integer type prevents "five hundred" typos

#### `/auction start`
- **Description:** Start an auction session manually
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!auction`

#### `/auction pause`
- **Description:** Pause the current auction
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!pauseauction`

#### `/auction resume`
- **Description:** Resume a paused auction
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!resumeauction`

#### `/auction extend <minutes>`
- **Description:** Add time to current auction item
- **Options:**
  - `minutes` (INTEGER, required) - Minutes to add
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!extend <minutes>`

#### `/auction skip`
- **Description:** Skip current item with point refund
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!skip`

#### `/auction cancel`
- **Description:** Cancel current item with point refund
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!cancel`

#### `/auction forceend`
- **Description:** Emergency auction termination
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!forceend`

#### `/queue add <item> [min_bid]`
- **Description:** Add item to auction queue
- **Options:**
  - `item` (STRING, required) - Item name
  - `min_bid` (INTEGER, optional) - Minimum starting bid
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!additem <item> [min_bid]`

#### `/queue remove <item>`
- **Description:** Remove item from auction queue
- **Options:**
  - `item` (STRING, required, autocomplete) - Item name
- **Autocomplete:** Items currently in queue
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!removeitem <item>`

#### `/queue list`
- **Description:** Show current auction queue
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Bidding channel
- **Equivalent:** `!queue`

#### `/queue clear`
- **Description:** Clear entire auction queue
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!clearqueue`

#### `/bidstatus`
- **Description:** Show current auction status
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Bidding channel
- **Equivalent:** `!bidstatus`

---

### Phase 3: Stats & Leaderboards

#### `/stats [user]`
- **Description:** View attendance and bidding statistics
- **Options:**
  - `user` (USER, optional, autocomplete) - User to check (defaults to self)
- **Autocomplete:** Guild members
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!stats [user]`, `!profile [user]`, `!mystats`
- **Response:** Shows attendance points + bidding points + statistics

#### `/leaderboard [type]`
- **Description:** View leaderboard rankings
- **Options:**
  - `type` (STRING, optional, autocomplete) - Type (attendance, bidding, both)
- **Autocomplete:** ["attendance", "bidding", "both"]
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!leaderboard`, `!leaderboardattendance`, `!leaderboardbidding`

#### `/activity [week]`
- **Description:** Guild activity heatmap
- **Options:**
  - `week` (INTEGER, optional) - Week offset (0=current, 1=last week, etc.)
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!activity [week]`

#### `/weeklyreport`
- **Description:** Force weekly report generation
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!weeklyreport`

#### `/monthlyreport`
- **Description:** Force monthly report generation
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!monthlyreport`

---

### Phase 4: Emergency/Admin Tools

#### `/emergency closeall`
- **Description:** Close all attendance threads
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency closeall`

#### `/emergency verifyall`
- **Description:** Verify all pending attendance
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency verifyall`

#### `/emergency denyall`
- **Description:** Deny all pending attendance
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency denyall`

#### `/emergency resetpending`
- **Description:** Clear pending attendance queue
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency resetpending`

#### `/points add <member> <amount>`
- **Description:** Add points to a member
- **Options:**
  - `member` (USER, required, autocomplete) - Member
  - `amount` (INTEGER, required) - Points to add
- **Autocomplete:** Guild members
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!addpoints <member> <amount>`

#### `/points remove <member> <amount>`
- **Description:** Remove points from a member
- **Options:**
  - `member` (USER, required, autocomplete) - Member
  - `amount` (INTEGER, required) - Points to remove
- **Autocomplete:** Guild members
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!removepoints <member> <amount>`

#### `/points set <member> <amount>`
- **Description:** Set member points to exact value
- **Options:**
  - `member` (USER, required, autocomplete) - Member
  - `amount` (INTEGER, required) - New point total
- **Autocomplete:** Guild members
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!setpoints <member> <amount>`

#### `/resetauction`
- **Description:** Reset auction system
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!resetauction`
- **Confirmation:** Requires confirmation (dangerous operation)

#### `/bootstraplearning`
- **Description:** Re-analyze historical auction data
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!bootstraplearning`

---

## Technical Architecture

### Shared Handler Pattern

**Goal:** Single source of truth for business logic, used by both slash and prefix commands.

**Implementation:**

```javascript
// handlers/attendance.js
async function handleVerify(context, member) {
  // context = { user, channel, isAdmin, reply: (msg) => {} }
  // Business logic here
  // Works for both slash and prefix commands
}

module.exports = { handleVerify };
```

```javascript
// index2.js - Slash command handler
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'verify') {
    await handleVerify({
      user: interaction.user,
      channel: interaction.channel,
      isAdmin: checkAdmin(interaction.member),
      reply: (msg) => interaction.reply(msg)
    }, interaction.options.getString('member'));
  }
});

// index2.js - Prefix command handler (existing)
if (content.startsWith('!verify')) {
  const member = args[0];
  await handleVerify({
    user: message.author,
    channel: message.channel,
    isAdmin: isAdmin(member),
    reply: (msg) => message.reply(msg)
  }, member);
}
```

**Benefits:**
- DRY (Don't Repeat Yourself)
- Single code path to test
- Easy to maintain
- Can deprecate prefix later without rewriting logic

---

### File Structure

**Proposed structure:**

```
/commands
  /slash
    attendance.js       # Slash command definitions
    bosstimer.js
    rotation.js
    auction.js
    stats.js
    emergency.js
  /handlers
    attendance.js       # Shared business logic
    bosstimer.js
    rotation.js
    auction.js
    stats.js
    emergency.js
  register.js           # Command registration utility
```

**Alternative (simpler):**
- Keep handlers in existing modules (`attendance.js`, `bidding.js`, etc.)
- Add `/commands` directory only for slash command definitions
- Register commands in `index2.js` or separate `register-commands.js`

---

### Command Registration

**Guild vs Global:**
- **Guild commands** - Instant updates, testing phase
- **Global commands** - 1-hour cache, production phase

**Registration timing:**
- On bot startup (`client.on('ready')`)
- Separate script for manual registration
- Environment-based (dev = guild, prod = global)

**Example:**

```javascript
// commands/register.js
const { REST, Routes } = require('discord.js');

async function registerCommands(client, commands, guildId = null) {
  const rest = new REST({ version: '10' }).setToken(client.token);

  try {
    if (guildId) {
      // Guild-specific (instant updates)
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log(`✅ Registered ${commands.length} guild commands`);
    } else {
      // Global (1-hour cache)
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log(`✅ Registered ${commands.length} global commands`);
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

module.exports = { registerCommands };
```

---

### Context Abstraction

**Unified interface for both command types:**

```javascript
class CommandContext {
  constructor(source, type = 'prefix') {
    this.type = type; // 'prefix' or 'slash'
    this.source = source; // Message or Interaction
    this.user = source.author || source.user;
    this.channel = source.channel;
    this.guild = source.guild;
  }

  async reply(content) {
    if (this.type === 'slash') {
      return await this.source.reply(content);
    } else {
      return await this.source.reply(content);
    }
  }

  async replyEphemeral(content) {
    if (this.type === 'slash') {
      return await this.source.reply({ ...content, ephemeral: true });
    } else {
      // Prefix can't be ephemeral, just reply normally
      return await this.source.reply(content);
    }
  }

  async deferReply() {
    if (this.type === 'slash') {
      return await this.source.deferReply();
    }
    // Prefix doesn't need defer
  }

  async editReply(content) {
    if (this.type === 'slash') {
      return await this.source.editReply(content);
    } else {
      // For prefix, we'd need to track the reply message
      // Simplified for now
    }
  }

  // Add tip to response (only for prefix commands)
  addTip(message, slashCommand) {
    if (this.type !== 'prefix') return message;

    // Check if user should see tip
    if (!shouldShowTip(this.user.id, slashCommand)) return message;

    // Append tip to message
    const tip = `\n\n💡 **Tip:** Try \`/${slashCommand}\` for autocomplete and a better experience!`;

    // Handle different message types
    if (typeof message === 'string') {
      return message + tip;
    } else if (message.embeds && message.embeds.length > 0) {
      // For embeds, add tip as footer or separate text
      return {
        ...message,
        content: (message.content || '') + tip
      };
    } else {
      return message;
    }
  }

  // Reply with optional tip
  async replyWithTip(message, slashCommand) {
    const messageWithTip = this.addTip(message, slashCommand);
    return await this.reply(messageWithTip);
  }
}
```

**Usage:**

```javascript
async function handleVerify(ctx, member) {
  if (!ctx.isAdmin) {
    return await ctx.reply('❌ Admin only command');
  }

  // Business logic...

  // Option 1: Manual tip
  await ctx.replyWithTip(`✅ Verified ${member}`, 'verify');

  // Option 2: Regular reply (no tip)
  // await ctx.reply(`✅ Verified ${member}`);
}

// Slash command
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'verify') {
    const ctx = new CommandContext(interaction, 'slash');
    ctx.isAdmin = checkAdmin(interaction.member);
    await handleVerify(ctx, interaction.options.getString('member'));
  }
});

// Prefix command
if (content.startsWith('!verify')) {
  const ctx = new CommandContext(message, 'prefix');
  ctx.isAdmin = isAdmin(member);
  await handleVerify(ctx, args[0]);
}
```

**With tips, the behavior is:**

```
User uses !verify TestMember:
✅ Verified TestMember
💡 **Tip:** Try `/verify` for autocomplete and a better experience!

User uses /verify TestMember:
✅ Verified TestMember
(no tip - already using slash command)

User uses /verify again:
(system tracks they've used it, tip won't show for !verify anymore)
```

---

## Autocomplete Implementation

### Boss Name Autocomplete

**Boss list source:**
- From `boss_spawn_config.json` or similar
- 22 bosses total
- Multi-word names supported ("Lady Dalia", "General Aquleus")

**Implementation:**

```javascript
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;

  if (interaction.commandName === 'killed' ||
      interaction.commandName === 'spawned' ||
      interaction.commandName === 'nospawn') {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    // Load boss list (cache this!)
    const allBosses = await getBossList(); // ['Lady Dalia', 'Amentis', ...]

    // Filter with fuzzy matching
    const filtered = allBosses
      .filter(boss => {
        const lowerBoss = boss.toLowerCase();
        // Direct substring match OR fuzzy match (Levenshtein)
        return lowerBoss.includes(focusedValue) ||
               levenshtein.get(lowerBoss, focusedValue) <= 3;
      })
      .sort((a, b) => {
        // Sort by relevance (exact matches first)
        const aIncludes = a.toLowerCase().includes(focusedValue);
        const bIncludes = b.toLowerCase().includes(focusedValue);
        if (aIncludes && !bIncludes) return -1;
        if (!aIncludes && bIncludes) return 1;

        // Then by Levenshtein distance
        const aDist = levenshtein.get(a.toLowerCase(), focusedValue);
        const bDist = levenshtein.get(b.toLowerCase(), focusedValue);
        return aDist - bDist;
      })
      .slice(0, 25); // Discord limit

    await interaction.respond(
      filtered.map(boss => ({
        name: boss,   // Display name
        value: boss   // Value sent to command
      }))
    );
  }
});
```

**Performance optimization:**
- Cache boss list (don't reload on every autocomplete)
- Precompute normalized names for faster matching
- Limit fuzzy matching to short inputs (< 3 chars = exact match only)

---

### Pending Member Autocomplete

**For `/verify` and `/deny`:**

```javascript
if (interaction.commandName === 'verify' || interaction.commandName === 'deny') {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get pending attendance submissions
  const pendingMembers = await getPendingAttendance(); // Returns array of usernames

  const filtered = pendingMembers
    .filter(member => member.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(
    filtered.map(member => ({
      name: member,
      value: member
    }))
  );
}
```

---

### Queue Item Autocomplete

**For `/queue remove`:**

```javascript
if (interaction.commandName === 'queue' &&
    interaction.options.getSubcommand() === 'remove') {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get current auction queue
  const queueItems = await getAuctionQueue(); // Returns array of item names

  const filtered = queueItems
    .filter(item => item.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(
    filtered.map(item => ({
      name: item,
      value: item
    }))
  );
}
```

---

### User Autocomplete

**For `/stats`, `/points` commands:**

```javascript
if (interaction.commandName === 'stats' ||
    interaction.commandName === 'points') {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get guild members (use cache!)
  const members = await interaction.guild.members.fetch();

  const filtered = members
    .filter(member =>
      !member.user.bot && // Exclude bots
      (member.user.username.toLowerCase().includes(focusedValue) ||
       member.displayName.toLowerCase().includes(focusedValue))
    )
    .map(member => ({
      name: member.displayName,
      value: member.id // Use ID as value for USER type
    }))
    .slice(0, 25);

  await interaction.respond(filtered);
}
```

**Note:** For USER type options, Discord provides built-in autocomplete. Custom autocomplete only needed for STRING type.

---

### Status/Type Autocomplete

**For predefined choices:**

```javascript
// Define in command options
{
  name: 'type',
  type: ApplicationCommandOptionType.String,
  description: 'Leaderboard type',
  required: false,
  choices: [
    { name: 'Attendance', value: 'attendance' },
    { name: 'Bidding', value: 'bidding' },
    { name: 'Both', value: 'both' }
  ]
}
```

**No autocomplete handler needed - Discord handles this automatically!**

---

## Migration Strategy

### Phase 1: Silent Launch

**Week 1:**
- Deploy slash commands to production
- No announcement yet
- Monitor for errors/bugs
- Admin testing only

**Success criteria:**
- No critical bugs
- Autocomplete works for all boss names
- Permission checks work correctly
- Channel restrictions enforced

---

### Phase 2: Soft Announcement

**Week 2:**
- Announce in admin channel: "Slash commands available for testing"
- Post examples: `/killed`, `/verify`, `/rotation status`
- Gather feedback from admins
- No changes to `!` commands

**Success criteria:**
- At least 3 admins try slash commands
- Positive feedback on autocomplete
- No major UX issues

---

### Phase 3: Public Announcement

**Week 3:**
- Announce in guild chat: "New slash commands available!"
- Post helpful examples with screenshots
- Highlight autocomplete features
- Emphasize `!` commands still work

**Announcement example:**

```
🎉 **New Feature: Slash Commands!**

We now support modern Discord slash commands! Try:

✅ `/killed Lady Dalia` - Autocomplete boss names!
✅ `/verify <member>` - Autocomplete pending members!
✅ `/rotation status` - Check boss rotations!
✅ `/stats` - Check your points!

**All existing `!` commands still work** - use whichever you prefer!

💡 **Mobile users:** Slash commands are much easier on mobile!
```

---

### Phase 4: Gentle Nudges

**Week 4+:**

Add helpful tips to prefix command responses to encourage slash command adoption:

**Implementation approach:**

```javascript
// After successful command execution, append a tip
async function sendResponseWithTip(context, message, slashEquivalent) {
  const fullMessage = context.type === 'prefix'
    ? `${message}\n\n💡 **Tip:** Try \`${slashEquivalent}\` for autocomplete and a better experience!`
    : message;

  await context.reply(fullMessage);
}
```

**Examples:**

| Command | Response with Tip |
|---------|------------------|
| `!killed Lady Dalia` | ✅ Boss marked killed at 14:30. Next spawn: 17:30<br>💡 **Tip:** Try `/killed` for boss name autocomplete! |
| `!verify TestMember` | ✅ Verified TestMember's attendance (+10 points)<br>💡 **Tip:** Try `/verify` for autocomplete of pending members! |
| `!bid 500` | ✅ Bid placed: 500 points<br>💡 **Tip:** Try `/bid` for a cleaner experience! |
| `!stats` | [Stats embed]<br>💡 **Tip:** Try `/stats` for the same info! |

**Tip frequency settings:**

1. **Option A: Always show (recommended for early adoption)**
   - Show tip on every prefix command
   - Until user tries slash command version
   - Then stop showing for that command

2. **Option B: Periodic (less intrusive)**
   - Show tip once per day per command
   - Or once every 10 uses
   - Track in memory or database

3. **Option C: Opt-out**
   - Show tips by default
   - Users can disable with `!disabletips`
   - Re-enable with `!enabletips`

**Recommended approach: Option A + Opt-out**
- Show tips always initially
- Track which slash commands user has tried
- Stop showing tips for commands they've used
- Allow `!disabletips` to disable completely

**Implementation details:**

```javascript
// Track slash command usage per user
const slashCommandUsage = new Map(); // userId -> Set of command names

// Check if user has used slash version
function shouldShowTip(userId, commandName) {
  // Check if tips disabled globally for user
  if (tipsDisabled.has(userId)) return false;

  // Check if user has already tried this slash command
  const userCommands = slashCommandUsage.get(userId);
  if (userCommands && userCommands.has(commandName)) return false;

  return true;
}

// Track slash command usage
client.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const userId = interaction.user.id;
    if (!slashCommandUsage.has(userId)) {
      slashCommandUsage.set(userId, new Set());
    }
    slashCommandUsage.get(userId).add(interaction.commandName);
  }
});
```

**Which commands get tips:**

Priority 1 (Always show tips):
- `!killed`, `!spawned` - Autocomplete is huge win
- `!verify`, `!deny` - Autocomplete pending members
- `!bid` - Better mobile experience

Priority 2 (Show tips):
- `!stats`, `!leaderboard` - Simple promotion
- `!rotation` - Subcommands cleaner

Priority 3 (Optional tips):
- Admin emergency commands - Less critical
- Rare commands - Not worth the noise

**Tip message variants:**

For commands with autocomplete benefits:
```
💡 **Tip:** Try `/killed` for boss name autocomplete!
```

For commands with mobile benefits:
```
💡 **Tip:** Try `/bid` - easier on mobile!
```

For commands with cleaner syntax:
```
💡 **Tip:** Try `/auction start` for a cleaner experience!
```

**Testing plan:**
- [ ] Tips appear on prefix commands
- [ ] Tips don't appear on slash commands
- [ ] Tips stop showing after user tries slash version
- [ ] `!disabletips` works
- [ ] Tips don't break existing functionality
- [ ] Tips are unobtrusive (at end of message)

**Rollback:**
- If tips annoy users, easy to remove
- Just stop appending tip text
- No data loss, no breaking changes

**Success metrics:**
- Track tip impression rate
- Track slash command adoption rate
- Monitor user feedback
- Adjust frequency based on response

---

### Phase 5: Long-term Maintenance

**Ongoing:**
- Maintain both slash and prefix indefinitely
- New features added to both command types
- Monitor which commands are used more
- Consider deprecating only if adoption is >90% for specific commands

---

## Testing Plan

### Unit Tests

**Test shared handlers:**
```javascript
// __tests__/handlers/attendance.test.js
const { handleVerify } = require('../../handlers/attendance');

describe('handleVerify', () => {
  it('should verify pending member', async () => {
    const ctx = mockContext({ isAdmin: true });
    await handleVerify(ctx, 'TestMember');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
  });

  it('should reject non-admin', async () => {
    const ctx = mockContext({ isAdmin: false });
    await handleVerify(ctx, 'TestMember');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('❌'));
  });
});
```

---

### Integration Tests

**Test command flow:**
```javascript
// __tests__/commands/slash/attendance.test.js
const { executeCommand } = require('../../commands/slash/attendance');

describe('Slash /verify command', () => {
  it('should verify member via slash command', async () => {
    const interaction = mockSlashInteraction('verify', { member: 'TestMember' });
    await executeCommand(interaction);
    expect(interaction.reply).toHaveBeenCalled();
  });
});
```

---

### Manual Testing Checklist

**Phase 1 commands:**

**Attendance:**
- [ ] `/verify <member>` - autocomplete shows pending members
- [ ] `/deny <member>` - autocomplete shows pending members
- [ ] `/verifyall` - bulk verifies all
- [ ] `/denyall` - bulk denies all
- [ ] `/close` - closes current thread
- [ ] `/closeall` - closes all threads
- [ ] `/resetpending` - clears queue
- [ ] All commands respect admin permissions
- [ ] All commands work in correct channels

**Boss Timer:**
- [ ] `/killed Lady Dalia` - autocomplete shows "Lady Dalia"
- [ ] `/killed gen` - autocomplete shows "General Aquleus"
- [ ] `/killed amen` - autocomplete shows "Amentis"
- [ ] `/killed barron` - fuzzy match shows "Baron Braudmore"
- [ ] `/spawned <boss>` - works for all 22 bosses
- [ ] `/nextspawn` - shows correct next spawn
- [ ] `/unkill <boss>` - removes kill record
- [ ] `/maintenance` - spawns all 22 bosses
- [ ] `/serverdown` - handles downtime
- [ ] `/clearkills` - clears all kills (admin only)
- [ ] Channel restrictions enforced

**Boss Rotation:**
- [ ] `/rotation status` - shows all 3 boss rotations
- [ ] `/rotation set amentis 3` - sets position
- [ ] `/rotation increment aquleus` - advances rotation
- [ ] `/rotation refresh` - reloads from Sheets
- [ ] Position validation (1-5 only)
- [ ] Admin permissions enforced

**Cross-cutting:**
- [ ] All `!` commands still work
- [ ] Both slash and prefix produce identical results
- [ ] Mobile experience is smooth
- [ ] Autocomplete is fast (<500ms)
- [ ] Error messages are helpful
- [ ] Permissions are consistent

---

### Load Testing

**Boss timer autocomplete:**
- Simulate 10 concurrent autocomplete requests
- Measure response time
- Ensure no rate limiting issues

**Audit system:**
- Test with 50 pending members (autocomplete limit)
- Verify performance doesn't degrade

---

## Rollback Plan

### Scenario 1: Critical Bug in Slash Commands

**Symptoms:**
- Slash commands crash bot
- Data corruption
- Permission bypass

**Response:**
1. Disable slash command registration (comment out registration code)
2. Restart bot (slash commands disappear from Discord)
3. `!` commands continue working
4. Fix bug in dev environment
5. Re-deploy when fixed

**Impact:** Minimal (slash commands removed, prefix still works)

---

### Scenario 2: Autocomplete Performance Issues

**Symptoms:**
- Autocomplete takes >2 seconds
- Rate limiting from Discord
- Memory leaks

**Response:**
1. Disable autocomplete (set `autocomplete: false` in options)
2. Keep slash commands active (manual entry)
3. Optimize autocomplete in dev
4. Re-enable when fixed

**Impact:** Moderate (slash commands work but no autocomplete)

---

### Scenario 3: User Confusion

**Symptoms:**
- Users don't know which to use
- Support requests increase
- Negative feedback

**Response:**
1. Post clarification announcement
2. Update help system with clear guidance
3. Consider temporarily disabling nudges
4. Gather specific feedback
5. Iterate on UX

**Impact:** Low (no technical issues, just communication)

---

### Scenario 4: Complete Rollback

**Worst case - need to remove all slash commands:**

1. **Backup current code:**
   ```bash
   git branch slash-commands-backup
   git checkout main
   ```

2. **Remove slash command registration:**
   ```javascript
   // Comment out in index2.js
   // await registerCommands(client, commands, config.main_guild_id);
   ```

3. **Remove slash command handlers:**
   ```javascript
   // Comment out interactionCreate listeners
   // client.on('interactionCreate', async interaction => { ... });
   ```

4. **Restart bot** - slash commands disappear from Discord after restart

5. **Verify `!` commands work** - should be unaffected

6. **Announce rollback:**
   ```
   ⚠️ Slash commands temporarily disabled due to technical issues.
   All `!` commands continue working normally.
   We'll announce when slash commands return. Thanks for your patience!
   ```

**Recovery time:** <10 minutes
**Data loss:** None (shared handlers prevent this)

---

## Success Metrics

### Adoption Metrics

**Track for 4 weeks post-launch:**
- Slash command usage vs prefix command usage (by command)
- Unique users trying slash commands
- Commands most frequently used via slash
- Commands still primarily used via prefix

**Tools:**
- Log both command types with identifiers
- Weekly aggregation report
- Compare week-over-week growth

---

### Performance Metrics

**Monitor:**
- Autocomplete response time (target: <500ms)
- Command execution time (should match prefix)
- Error rates (slash vs prefix)
- Bot memory usage (ensure no leaks)

**Alerting:**
- Autocomplete >1s → investigate caching
- Error rate >5% → investigate bugs
- Memory increase >20% → investigate leaks

---

### User Satisfaction

**Gather feedback:**
- Admin feedback sessions (week 2, week 4)
- Anonymous survey (optional, week 4)
- Monitor guild chat for complaints/praise
- Track support questions

**Questions:**
- Do you prefer slash or prefix commands?
- Is autocomplete helpful?
- Any commands missing from slash?
- Any UX issues?

---

## Command Aliases

### Current Prefix Command Aliases

The bot currently supports **100+ command aliases** via `config/command-aliases.js`:

**Examples:**
- `!b` → `!bid`
- `!v` → `!verify`
- `!st` → `!status`
- `!pts` → `!mypoints`
- `!vall` → `!verifyall`
- `!lb` → `!leaderboards`
- And many more...

### Alias Strategy for Slash Commands

**Recommendation: Canonical Names Only (No Slash Aliases)**

**Why:**
1. **Discord has built-in command autocomplete** - typing `/b` shows `/bid` automatically
2. **Cleaner command list** - 50 commands instead of 150+ with aliases
3. **Still fast** - autocomplete is just as quick as aliases
4. **Easier to maintain** - one command definition instead of multiple

**Comparison:**

```
PREFIX COMMANDS (with aliases):
!b 500              ✅ Works (resolves to !bid via alias system)
!bid 500            ✅ Works

SLASH COMMANDS (with autocomplete):
/b                  Discord shows "/bid" in autocomplete menu
/bid 500            ✅ Works
```

**What This Means:**

1. **All prefix aliases continue working:**
   - `!b`, `!v`, `!pts`, `!st`, etc. - all work exactly as now
   - `resolveCommandAlias()` function unchanged
   - Zero impact on existing alias behavior

2. **Slash commands use canonical names:**
   - Only `/bid`, `/verify`, `/stats`, `/leaderboard`, etc. registered
   - No `/b`, `/v`, `/pts` aliases needed
   - Discord's autocomplete replaces alias functionality

3. **Users can choose their preference:**
   - Veterans who like `!b` - keep using it
   - Users who want autocomplete - use `/bid`
   - Both call the same underlying function

**If needed later:**
- We could register a few key aliases (e.g., `/b` for `/bid`)
- But Discord autocomplete makes this unnecessary
- Better to keep command list clean

---

## Open Questions

1. **Command naming:** Keep exact names (`/bid`) or use longer (`/placebid`)?
2. **Subcommand grouping:** `/auction start` vs `/auctionstart`?
3. **Ephemeral responses:** Should `/stats` be private or public?
4. **Registration:** Guild commands (instant) or global (1-hour cache)?
5. **Help system:** Adapt existing `!help` or create new `/help`?
6. **Error handling:** Match existing error message style?
7. **Confirmation prompts:** Keep for dangerous operations (`/resetauction`)?
8. **Boss timer help:** `/help` in boss timer channel shows slash or prefix syntax?
9. **Slash aliases:** Register any common aliases (e.g., `/b` for `/bid`) or rely on autocomplete?

---

## Implementation Complete! 🎉

**Phase 1-3 + Attendance Overrides Completion Summary:**
1. ✅ Phase 1: Boss Timer, Rotation, Attendance (20 commands)
2. ✅ Phase 2: Auction System (4 commands - simplified)
3. ✅ Phase 3: Stats & Reports (3 commands)
4. ✅ Attendance Overrides: Error recovery tools (2 commands - frequently used)
5. ✅ MongoDB autocomplete integration for `/stats`
6. ✅ All systems tested and operational
7. ✅ Zero breaking changes to existing `!` commands
8. ✅ Tip system tracking slash command adoption
9. ⏭️ Phase 4: Skipped (dangerous admin tools stay as `!` commands)

**Total Implemented:** 29 slash commands across 5 major systems

---

## Final Command Breakdown

### ✅ Slash Commands (29 total)
- **Boss Timer:** 9 commands (`/killed`, `/spawned`, `/nextspawn`, etc.)
- **Boss Rotation:** 4 subcommands (`/rotation status/set/increment/refresh`)
- **Attendance:** 7 commands (`/verify`, `/deny`, `/verifyall`, `/close`, `/closeall`, `/resetpending`)
- **Attendance Overrides:** 2 commands (`/openthread`, `/overrideclose`)
- **Auction:** 4 commands (`/bid`, `/auction start/forceend`, `/queue list`)
- **Stats & Reports:** 3 commands (`/stats`, `/weekly`, `/monthly`)

### ⚡ Prefix Commands Only (Emergency/Admin Tools)
- **Emergency Operations:** `!emergency closeall/verifyall/denyall/resetpending`
- **Point Manipulation:** `!addpoints`, `!removepoints`, `!setpoints`
- **System Resets:** `!resetauction`, `!bootstraplearning`

**Rationale:** Dangerous low-frequency operations safer as deliberate prefix commands

---

## Success Metrics

**Coverage:** 29 slash commands cover ~95% of daily guild operations
- ✅ All high-frequency commands migrated (including attendance error recovery)
- ✅ All member-facing commands available as slash
- ✅ All mobile-critical admin commands available
- ✅ Frequently-used attendance override tools implemented
- ⏭️ Dangerous admin tools intentionally kept as prefix only

**Adoption Strategy:**
- Dual support (both `/` and `!` work)
- Tip system encourages slash command discovery
- No forced migration - users choose their preference
- MongoDB integration for fast autocomplete

---

## Appendix

### Discord Slash Command Limits

- **Max commands per bot:** 100 global + 100 per guild
- **Max options per command:** 25
- **Max subcommands per group:** 25
- **Max subcommand groups per command:** 25
- **Autocomplete results:** 25 max
- **Command name:** 1-32 characters, lowercase
- **Option name:** 1-32 characters, lowercase
- **Description:** 1-100 characters

**Our usage:**
- Estimated 50 commands total (well within limits)
- Most commands have 1-3 options (within limits)
- Subcommands used for auction, rotation, points, emergency (within limits)

---

### Useful Resources

- [Discord.js Guide - Slash Commands](https://discordjs.guide/interactions/slash-commands.html)
- [Discord.js Guide - Autocomplete](https://discordjs.guide/interactions/autocomplete.html)
- [Discord API - Application Commands](https://discord.com/developers/docs/interactions/application-commands)
- [Discord API - Slash Command Permissions](https://discord.com/developers/docs/interactions/application-commands#permissions)

---

**Document Version:** 4.1
**Last Updated:** 2025-12-10
**Status:** Implementation Complete ✅ - 29 slash commands operational | Phase 4 skipped for safety
