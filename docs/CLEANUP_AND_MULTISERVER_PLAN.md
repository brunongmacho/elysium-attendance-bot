# ELYSIUM Guild Bot - Cleanup & Multi-Server Refactoring Plan

## Current State Analysis

### File Count Summary
| Location | Count | Notes |
|----------|-------|-------|
| Root `.js` files | 21 | Main modules |
| `/scripts/` | 30 | One-time migration/debug scripts |
| `/services/` | 4 | Background services |
| `/utils/` | 24 | Utility modules |
| `/commands/` | 4 | Slash command handlers |
| `/__tests__/` | 4 | Test files |
| Total | ~90 files | |

---

## Phase 1: Cleanup - Remove Unused/Dead Code

### 1.1 Files to DELETE (Confirmed Unused)

| File | Reason |
|------|--------|
| `Code.js` | 262KB - Likely Google Apps Script duplicate of core.js |
| `core.js` | Google Apps Script - not used by Node.js bot |
| `test-lore.js` | Debug script - not needed |
| `verify-attendance.js` | Standalone verification - functionality in attendance.js |
| `verify-members.js` | Standalone verification - functionality in attendance.js |
| `test-mongodb.js` | Debug script - not needed |
| `/scripts/*` (30 files) | All are one-time migration/debug scripts |

### 1.2 Duplicate/Merged Features

| Duplicate | Action |
|-----------|--------|
| `event-reminders.js` (root) vs `/services/event-reminders.js` | Root is main, services is lightweight - DELETE `/services/event-reminders.js` |
| `help-system.js` (legacy) vs `help-system-v2.js` | Keep only v2 |
| Duplicate sheet-api exports | Check and consolidate |

### 1.3 Features to REMOVE (Not Working/Unused)

Based on code analysis:
- **NLP System** - Completely disabled (mentioned in comments: "disabled")
- **ML Integration** - Not present in imports
- **Loot System** - Referenced in comments but not imported

### 1.4 Unused Imports in index2.js

From analysis, these imports exist but may not be fully used:
- `memberLore` - Only used in `!stats` command (keep for now)

---

## Phase 2: Consolidate Features

### 2.1 Keep Features (Core Functionality)

| Module | File | Status | Notes |
|--------|------|--------|-------|
| Attendance | `attendance.js` | ✅ Working | Boss spawn threads, verification |
| Bidding | `bidding.js` | ✅ Working | Point management, bids |
| Auction | `auctioneering.js` | ✅ Working | Auction sessions |
| Boss Timer | `boss-timer.js` | ✅ Working | Auto-spawn timers |
| Event Reminders | `event-reminders.js` | ✅ Working | Game event alerts |
| Core Evaluation | `core-evaluation.js` | ✅ Working | Member evaluation |
| Leaderboard | `leaderboard-system.js` | ✅ Working | Rankings |
| Emergency Commands | `emergency-commands.js` | ✅ Working | Admin overrides |

### 2.2 Keep Utilities (Required)

| Module | Purpose |
|--------|---------|
| `utils/sheet-api.js` | Google Sheets communication |
| `utils/mongodb-helpers.js` | MongoDB operations |
| `utils/database-api.js` | Database abstraction |
| `utils/discord-cache.js` | Channel caching |
| `utils/error-handler.js` | Error handling |
| `utils/shutdown-manager.js` | Graceful shutdown |
| `utils/crash-recovery.js` | State recovery |
| `utils/common.js` | Shared utilities |
| `utils/logger.js` | Logging |

### 2.3 Keep Services (Background)

| Module | Purpose |
|--------|---------|
| `services/background-sync.js` | MongoDB → Sheets sync |
| `services/reports.js` | Weekly/monthly reports |
| `services/sheet-sync.js` | Sheet synchronization |

---

## Phase 3: Architecture Refactoring (Multi-Server Support)

### 3.1 Current Architecture (Single Server)

```
config.json (global)
    │
    └── All modules use single config
```

### 3.2 Target Architecture (Multi-Server)

```
config/
├── servers.json          # Per-server config (NEW)
├── boss-points.json      # Shared (game data)
├── boss-spawn-config.json # Shared (game data)
└── command-aliases.js    # Shared (commands)

index2.js
    │
    ├── getServerConfig(guildId)  # NEW: Get per-server config
    │
    └── All modules receive serverContext
```

### 3.3 Server Config Structure

```json
{
  "servers": {
    "1401784124469149736": {
      "name": "ELYSIUM",
      "guild_name": "ELYSIUM Guild",
      "announcement_prefix": "ELYSIUM Guild Boss",
      "sheet_webhook_url": "https://.../elysium",
      "channels": {
        "attendance": "1429059892735508531",
        "bidding": "1430924721691689011",
        "admin_logs": "1429074047529914439",
        "commands": "1401784124922138646"
      },
      "roles": {
        "guild_member": "1401784785894117557",
        "guild_leader": "1401784681724117024"
      },
      "admin_roles": ["GUILD LEADER", "ELITE", "Admin", "BOT"],
      "settings": {
        "auto_archive_minutes": 60,
        "timezone": "Asia/Manila"
      }
    },
    "NEW_GUILD_ID": {
      "name": "TrailerParkB",
      "guild_name": "TrailerParkB Guild",
      "announcement_prefix": "TrailerParkB Guild Boss",
      "sheet_webhook_url": "https://.../trailerparkb",
      "channels": { ... },
      "roles": { ... },
      "admin_roles": ["Admin", "Leader"],
      "settings": { ... }
    }
  }
}
```

### 3.4 Implementation Changes Required

| Module | Change Type | Description |
|--------|-------------|-------------|
| `index2.js` | Modify | Add server config loader, pass context to modules |
| `attendance.js` | Modify | Accept serverConfig in initialize(), use per-server channels |
| `bidding.js` | Modify | Accept serverConfig, use per-server sheet webhook |
| `auctioneering.js` | Modify | Accept serverConfig, use per-server channels |
| `boss-timer.js` | Modify | Accept serverConfig, create threads in correct server |
| `event-reminders.js` | Modify | Accept serverConfig, post to correct channels |
| `core-evaluation.js` | Modify | Accept serverConfig, use per-server sheets |
| `leaderboard-system.js` | Modify | Accept serverConfig, query correct data |

### 3.5 Helper Function (NEW)

```javascript
// utils/server-context.js
const serverConfigs = require('../config/servers.json');

function getServerConfig(guildId) {
  return serverConfigs.servers[guildId] || serverConfigs.servers['default'];
}

function getSheetAPI(guildId) {
  const config = getServerConfig(guildId);
  return new SheetAPI(config.sheet_webhook_url);
}

module.exports = { getServerConfig, getSheetAPI };
```

---

## Phase 4: Files to Delete After Cleanup

### 4.1 Delete Immediately

```
DELETE Code.js
DELETE core.js
DELETE test-lore.js
DELETE verify-attendance.js
DELETE verify-members.js
DELETE test-mongodb.js

DELETE scripts/ (entire folder - 30 files)
DELETE services/event-reminders.js (duplicate)
DELETE help-system.js (replaced by v2)
```

### 4.2 Archive (Don't Delete, Move to /archive)

```
/archive/
├── nlp-handler.js        # NLP system (disabled)
├── nlp-learning.js
├── nlp-conversation.js
├── nlp-vocabulary.js
├── nlp-vocabulary-tagalog.js
├── nlp-vocabulary-taglish.js
├── intelligence-engine.js
├── proactive-intelligence.js
├── loot-system.js        # If exists
└── ml-integration.js     # If exists
```

---

## Implementation Order

1. **Create** `docs/CLEANUP_PLAN.md` (this file)
2. **Create** `config/servers.json` from current config.json
3. **Delete** unused files (scripts folder, duplicates)
4. **Remove** dead imports from index2.js
5. **Add** server-context.js helper
6. **Refactor** each module to accept serverConfig
7. **Test** with single server (ELYSIUM)
8. **Add** second server config
9. **Deploy** and verify both servers work

---

## Notes

- Boss definitions (boss_points.json, boss_spawn_config.json) remain SHARED
- Each server has its own Google Sheets
- Boss timers should spawn in the server where they were triggered
- Command aliases are shared across servers
- Activity heatmap, boss rotation - check if still used before removing