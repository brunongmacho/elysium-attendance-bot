# Sync Script Usage Guide

## Overview

The `sync-sheets-to-mongodb.js` script syncs the latest data from Google Sheets → MongoDB for all MongoDB-enabled modules. This ensures MongoDB has the most current data.

**🔄 Auto-Sync on Startup:**
Starting with Phase 4, the bot **automatically runs this sync script on every startup**. This ensures MongoDB is always fresh with your Google Sheets backup data when the bot deploys.

**When to manually run:**
- Testing sync before deployment
- Forcing a sync without restarting the bot
- Debugging sync issues with `--dry-run`
- Syncing specific modules only (`--members`, `--items`)

---

## Current Modules Supported

As Phase 4 progresses, the script is updated to support new modules:

| Module | Feature Flag | Status |
|--------|-------------|--------|
| Members (Bidding Points) | `USE_MONGODB_BIDDING` | ✅ Supported |
| Auction Items | `USE_MONGODB_AUCTIONEERING` | ✅ Supported |
| Boss Rotation | N/A (always synced) | ✅ Supported |
| Attendance Records | `USE_MONGODB_ATTENDANCE` | ✅ Supported (historical import) |

---

## Usage

### Basic Usage (Sync Everything)

```bash
# In Koyeb console or SSH
node scripts/sync-sheets-to-mongodb.js
```

**What it does:**
- Fetches latest member points from Google Sheets
- Updates MongoDB members collection with current points
- Clears auction items in MongoDB
- Inserts fresh auction items from Google Sheets

**Expected output:**
```
═══════════════════════════════════════════════════════════════
🔄 GOOGLE SHEETS → MONGODB SYNC
═══════════════════════════════════════════════════════════════

🔌 Connecting to MongoDB...
✅ MongoDB connected

🔄 Syncing members (bidding points)...
📥 Fetching members from Google Sheets...
✅ Found 52 members in Google Sheets
✅ Members synced: 52, skipped: 0

🔄 Syncing auction items...
📥 Fetching auction items from Google Sheets...
✅ Found 58 auction items in Google Sheets
🗑️ Clearing old auction items...
💾 Inserting fresh auction items...
✅ Auction items synced: 58

═══════════════════════════════════════════════════════════════
📊 SYNC SUMMARY
═══════════════════════════════════════════════════════════════
👥 Members: 52 synced, 0 skipped
🎁 Auction Items: 58 synced

✅ SYNC COMPLETE - MongoDB is now up to date with Google Sheets
```

---

## Options

### Dry Run (Test First)

```bash
node scripts/sync-sheets-to-mongodb.js --dry-run
```

**Use this to:**
- Preview what will be synced without making changes
- Verify Sheet data is readable
- Check for errors before actual sync

### Sync Specific Modules

```bash
# Sync only members (bidding points)
node scripts/sync-sheets-to-mongodb.js --members

# Sync only auction items
node scripts/sync-sheets-to-mongodb.js --items

# Sync only boss rotation
node scripts/sync-sheets-to-mongodb.js --rotation
```

**Use cases:**
- Only member points changed in Sheets → sync members only
- Only auction queue changed → sync items only
- Only boss rotation changed → sync rotation only

---

## Common Scenarios

### Scenario 1: Just Enabled USE_MONGODB_AUCTIONEERING

```bash
# Step 1: Dry run to verify data
node scripts/sync-sheets-to-mongodb.js --items --dry-run

# Step 2: If looks good, sync for real
node scripts/sync-sheets-to-mongodb.js --items

# Step 3: Test with !ql command
# Expected: Fast response (10-50ms) from MongoDB
```

### Scenario 2: Manual Point Adjustment in Sheets

You manually edited member points in Google Sheets and want MongoDB to reflect the changes:

```bash
# Sync members only
node scripts/sync-sheets-to-mongodb.js --members

# Verify with !mypoints command
```

### Scenario 3: Before Saturday Auction

Ensure MongoDB has latest data before the critical auction:

```bash
# Friday night: Sync everything
node scripts/sync-sheets-to-mongodb.js

# Saturday 11:45am: Quick verification
node scripts/sync-sheets-to-mongodb.js --dry-run
```

---

## How It Works

### Members Sync

1. Fetches current member points from Google Sheets via `getBiddingPoints()` API
2. For each member in the response:
   - Extracts `pointsLeft` (column B), `pointsConsumed` (column C)
   - Calculates `pointsEarned = pointsLeft + pointsConsumed` (total earned)
   - Maps fields: `pointsLeft` → `pointsAvailable`, `pointsConsumed` → `pointsSpent`
3. For each member:
   - If member exists in MongoDB → **Update** points (preserves Discord ID, attendance, etc.)
   - If member doesn't exist → **Insert** new member with temp ID
4. Marks members not in Google Sheets as `isActive: false` (inactive)
5. Updates `lastUpdated` timestamp

**New Member Handling:**
When a new guild member appears in Google Sheets for the first time:
1. **First sync:** Created with `_id: "temp_username"` (temporary ID)
2. **First interaction:** When they use bot commands (e.g., `!mypoints`), automatically migrated to real Discord ID
3. **Subsequent syncs:** Points updated using real Discord ID (preserved forever)

**Important:** Discord IDs are NOT fetched automatically during sync. They are mapped when members first interact with the bot (via `discord-id-mapper.js`).

This gradual migration ensures:
- ✅ No manual work needed
- ✅ No Discord API calls during sync (faster, no rate limits)
- ✅ Members migrate automatically as they interact
- ✅ No data loss
- ✅ Discord IDs preserved once migrated

**Data Updated:**
- `pointsAvailable` (from Sheet column B: Points Left)
- `pointsEarned` (calculated: Points Left + Points Consumed)
- `pointsSpent` (from Sheet column C: Points Consumed)
- `username` (from Sheet column A)
- `isActive` (true if in Sheets, false if removed)
- `lastUpdated` (current timestamp)

**Data Preserved:**
- Discord ID (`_id`) - Never changed once migrated
- Attendance records
- Join date
- Streak data
- All other fields

### Auction Items Sync

1. Fetches current auction queue from Google Sheets via `getBiddingItems()`
2. **Clears** all existing auction items in MongoDB
3. **Inserts** fresh items from Sheets

**Why delete-then-insert?**
- Auction items change frequently (items sold, new items added)
- Sheet is always authoritative for auction queue
- Simpler than trying to diff and update

### Boss Rotation Sync

1. Fetches list of rotating bosses from Google Sheets via `getAllRotatingBosses()`
2. For each rotating boss, fetches rotation status via `getBossRotation(bossName)`
3. **Clears** all existing boss rotation data in MongoDB
4. **Inserts** fresh rotation data from Sheets

**Data Synced:**
- `bossName` - Name of the rotating boss (e.g., "Amentis")
- `currentIndex` - Current rotation index (1-5)
- `currentGuild` - Guild whose turn it is (e.g., "ELYSIUM")
- `isOurTurn` - Boolean flag for quick checks
- `guilds` - List of all guilds in rotation
- `nextGuild` - Next guild in rotation sequence
- `lastUpdated` - Timestamp of sync

**Why delete-then-insert?**
- Rotation changes after each boss kill
- Sheet is always authoritative for rotation state
- Simpler than trying to diff and update
- Fast lookup for rotation warnings

---

## Troubleshooting

### Error: "Failed to load config.json"

**Cause:** Script can't find the bot configuration.

**Fix:**
```bash
# Make sure you're in the right directory
cd /workspace  # or wherever your bot is

# Run from bot root directory
node scripts/sync-sheets-to-mongodb.js
```

### Error: "No members found in Google Sheets"

**Cause:** Sheet API call returned empty data.

**Fix:**
1. Check Sheet webhook URL in config.json
2. Verify Google Apps Script is deployed
3. Test Sheet API manually: `!mypoints` command

### Warning: "Failed to sync [username]"

**Cause:** Individual member sync failed (rare).

**Impact:** Other members still sync successfully.

**Action:** Check logs for specific error, may need manual fix.

---

## Auto-Sync on Startup (Phase 4+)

### How It Works

The bot now uses a startup script (`scripts/startup.js`) that automatically runs the sync before starting Discord bot:

```
═══════════════════════════════════════════════════════════════
🚀 ELYSIUM GUILD BOT - STARTUP
═══════════════════════════════════════════════════════════════

📋 Step 1/2: Syncing Google Sheets → MongoDB...

[Sync script output...]

✅ Step 1/2: MongoDB sync complete!

🤖 Step 2/2: Starting Discord bot...

[Bot startup logs...]
```

### Why Auto-Sync?

**Google Sheets is your backup.** Every time the bot starts, it ensures MongoDB has the latest data from your Sheets backup. This means:

✅ **Fresh data on every deployment** - No manual sync needed
✅ **Sheets edits respected** - If you manually edited Sheets, MongoDB gets updated
✅ **Zero-downtime migrations** - New members added to Sheets are auto-synced
✅ **Recovery from MongoDB issues** - If MongoDB was down, it catches up on startup

### NPM Scripts

```bash
# Start bot with auto-sync (production)
npm start

# Start bot directly, skip sync (emergency/testing)
npm run start:direct

# Run sync manually without starting bot
npm run sync
```

### Graceful Degradation

If sync fails during startup:
- ⚠️ Warning logged to Koyeb console
- ✅ Bot starts anyway (MongoDB may be behind, but bot won't crash)
- 📊 Next manual sync will catch up

**This ensures the bot never fails to start due to sync issues.**

### Deployment Flow

When you push code to Koyeb:

1. 🚀 Koyeb detects new commit
2. 🔄 Builds and deploys new version
3. 📋 **Runs auto-sync** (Step 1/2)
   - Syncs members from Sheets → MongoDB
   - Syncs auction items from Sheets → MongoDB
4. 🤖 **Starts Discord bot** (Step 2/2)
5. ✅ Bot is live with fresh MongoDB data

### Monitoring Auto-Sync

**Koyeb Logs:**
```
📋 Step 1/2: Syncing Google Sheets → MongoDB...
🔌 Connecting to MongoDB...
✅ MongoDB connected
🔄 Syncing members (bidding points)...
✅ Found 52 members in Google Sheets
✅ Members synced: 52 (0 new), skipped: 0
🔄 Syncing auction items...
✅ Auction items synced: 58
✅ Step 1/2: MongoDB sync complete!
🤖 Step 2/2: Starting Discord bot...
```

**What to watch for:**
- ✅ "MongoDB sync complete!" - All good
- ⚠️ "MongoDB sync failed" - Bot still starts, check logs
- ❌ Sync errors - May need manual intervention

### When to Skip Auto-Sync

Use `npm run start:direct` to skip auto-sync if:
- MongoDB is already up to date (rare)
- Emergency bot restart needed (no time to wait for sync)
- Testing bot changes unrelated to data

**Normal deployments should always use `npm start` with auto-sync.**

---

## Adding New Modules

As Phase 4 continues, we add more modules. Here's how to update the script:

### Example: Adding Attendance Sync

1. **Add sync function:**
```javascript
async function syncAttendance(db, sheetAPI) {
  log('🔄', 'Syncing attendance records...');
  // Fetch from Sheets
  // Update MongoDB attendance collection
  // Return { synced, skipped }
}
```

2. **Add command-line flag:**
```javascript
const SYNC_ATTENDANCE = process.argv.includes('--attendance') || !hasModuleFlag();
```

3. **Call in main():**
```javascript
if (SYNC_ATTENDANCE) {
  results.attendance = await syncAttendance(db, sheetAPI);
}
```

4. **Update this documentation** with new module

---

## Best Practices

1. **Always dry-run first** before syncing in production
2. **Sync before major events** (auctions, week rollover)
3. **Verify after sync** with bot commands (!mypoints, !ql)
4. **Monitor logs** during sync for errors
5. **Backup Sheet data** before large syncs (just in case)

---

## Related Documentation

- [Phase 4 Usage Guide](./PHASE4_USAGE.md) - MongoDB feature flags
- [MongoDB Migration Guide](./MONGODB_MIGRATION.md) - Overall migration plan
- [Migration Progress](./MIGRATION_PROGRESS.md) - Current status

---

**Last Updated**: Dec 3, 2025
**Script Version**: 2.0 (Members + Auction Items + Auto-Sync on Startup)
