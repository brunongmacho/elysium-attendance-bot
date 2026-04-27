# FINAL DEPLOYMENT CHECKLIST - TrailerParkB Guild

**Date:** 2026-04-27
**Status:** ✅ Ready for Deploy

---

## 1. CONFIGURATION ✅

| Item | Status | Value |
|------|--------|-------|
| `config.json` | ✅ Updated | Guild: TrailerParkB |
| `guild_name` | ✅ Set | "TrailerParkB" |
| `mongodb_database` | ✅ Set | "elysium-bot-tpb" |
| `sheet_webhook_url` | ✅ UPDATED | New URL |
| Role IDs | ✅ Set | X, Admins, Guild Leader, Elites |

---

## 2. DATABASE ISOLATION ✅

| Guild | Database | Collections Suffix |
|-------|----------|-------------------|
| Elysium | `elysium-bot` | (original) |
| TrailerParkB | `elysium-bot-tpb` | `-TPB` |

### Collections Created:
- `member_registry-TPB`
- `members-TPB`
- `attendance-TPB`
- `auctionItems-TPB`
- `bossRotation-TPB`
- `botState-TPB`
- `bossTimers-TPB`
- `eventReminders-TPB`

---

## 3. MEMBER REGISTRY ✅

| Feature | Status |
|---------|--------|
| Auto-registration | ✅ |
| Nickname tracking | ✅ |
| Bulk update on change | ✅ |
| MongoDB sync | ✅ |
| Google Sheets sync | ✅ |

### Files Modified:
| File | Changes |
|------|---------|
| `member-registry.js` | New module - all registry functions |
| `index2.js` | GuildMemberAdd/Update listeners |
| `Code.js` | handleUpdateMemberRegistry, handleGetMemberRegistry, handleBulkUpdateNickname |
| `member-registry.js` | bulkUpdateAllRecords, updateMongoDBRecords, normalizeMemberNamesFromRegistry |

---

## 4. AUTO-SYNC ✅

| Feature | Status |
|---------|--------|
| Periodic sync (15 min) | ✅ |
| Script: sync-sheets-to-mongodb.js | ✅ Updated |
| Uses guild-specific DB | ✅ |
| Collection suffix -TPB | ✅ |

### Sync Flow:
```
index2.js (every 15 min)
    ↓
scripts/sync-sheets-to-mongodb.js
    ↓
1. Sync members (bidding points)
2. Sync auction items
3. Sync boss rotation
4. Sync attendance records
5. Sync member registry
```

---

## 5. GOOGLE APPS SCRIPT ✅

| Item | Status | Details |
|------|--------|----------|
| `Code.js` | ✅ Updated | New URL deployed |
| `appsscript.json` | ✅ Ready | executeAs: USER_DEPLOYING |
| `.github/workflows/deploy.yml` | ✅ Correct | Watches Code.js, appsscript.json |

### New Actions Added to Code.js:
- `handleUpdateMemberRegistry()` - upsert member
- `handleGetMemberRegistry()` - get all members
- `handleBulkUpdateNickname()` - update all sheets
- `normalizeMemberNamesFromRegistry()` - get current nicknames
- `getCurrentNickname()` - single name lookup

---

## 6. BIDDING SYSTEM ✅

| Feature | Status |
|---------|--------|
| Uses Discord ID | ✅ |
| `lock()` function | ✅ Updated |
| `unlock()` function | ✅ Updated |
| `avail()` function | ✅ Updated |
| Winner tracking | ✅ Uses curWinId |

---

## 7. DOCUMENTATION ✅

| File | Status | Details |
|------|--------|----------|
| `MIGRATION_DOCUMENTATION.md` | ✅ Updated | Sessions 1-7 documented |
| `README.md` | ✅ Updated | Guild name updated |
| `session-context.md` | ✅ Updated | Current session logged |

---

## ✅ FINAL CHECKLIST

- [x] `config.json` - All channel IDs updated for TrailerParkB
- [x] `config.json` - `mongodb_database: "elysium-bot-tpb"` set
- [x] `config.json` - New `sheet_webhook_url` set
- [x] `Code.js` - New Web App URL deployed
- [x] `member-registry.js` - Module created
- [x] `mongodb-helpers.js` - All collections use `getCollectionName()`
- [x] `scripts/sync-sheets-to-mongodb.js` - Uses guild suffix
- [x] `utils/database-api.js` - Reads DB from config
- [x] All ELYSIUM → TrailerParkB references updated
- [x] All ELYSIUM_WEEK_ → WEEK_ updated
- [x] Weekly report: Monday 2:59am GMT+8
- [x] BotLearning/Milestones/NLP disabled
- [x] Bulk nickname update system working
- [x] Auto-sync uses new database
- [x] GitHub workflow watches correct files
- [x] Syntax checks pass on all files

---

## 🚀 DEPLOYMENT STEPS

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "TrailerParkB migration complete - new DB, member registry, auto-sync"
   git push origin main
   ```

2. **Google Apps Script Auto-Deploy:**
   - GitHub push triggers `.github/workflows/deploy.yml`
   - `clasp push` deploys `Code.js` with new URL

3. **Start the Bot:**
   ```bash
   # Set environment variables
   export MONGODB_URI="your_mongodb_uri"
   export MONGODB_DATABASE="elysium-bot-tpb"
   
   # Start bot
   node index2.js
   ```

4. **Verify:**
   - Check bot joins TrailerParkB guild
   - Test `!weekly` and `/weekly` commands
   - Verify member registry auto-creates on join
   - Test nickname change → bulk update

---

**Status: ✅ READY TO DEPLOY**
