# Sync Script Usage Guide

## Overview

The `sync-sheets-to-mongodb.js` script syncs the latest data from Google Sheets → MongoDB for all MongoDB-enabled modules. This ensures MongoDB has the most current data.

**When to use:**
- After enabling a new MongoDB feature flag (e.g., `USE_MONGODB_AUCTIONEERING=true`)
- When Google Sheets has been updated manually and you want to refresh MongoDB
- Before major events (Saturday auctions) to ensure data consistency
- After bot has been using Sheets-only mode and you're re-enabling MongoDB

---

## Current Modules Supported

As Phase 4 progresses, the script is updated to support new modules:

| Module | Feature Flag | Status |
|--------|-------------|--------|
| Members (Bidding Points) | `USE_MONGODB_BIDDING` | ✅ Supported |
| Auction Items | `USE_MONGODB_AUCTIONEERING` | ✅ Supported |
| Attendance Records | `USE_MONGODB_ATTENDANCE` | ⏳ Coming soon |
| Boss Rotation | `USE_MONGODB_BOSS_ROTATION` | ⏳ Coming soon |

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
```

**Use cases:**
- Only member points changed in Sheets → sync members only
- Only auction queue changed → sync items only

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

1. Fetches current member points from Google Sheets via `getBiddingPointsSummary()`
2. For each member:
   - If member exists in MongoDB → **Update** points (preserves Discord ID, attendance, etc.)
   - If member doesn't exist → **Insert** new member (shouldn't happen after initial migration)
3. Updates `lastUpdated` timestamp

**Data Updated:**
- `pointsAvailable`
- `pointsEarned`
- `pointsSpent`
- `username`
- `lastUpdated`

**Data Preserved:**
- Discord ID (`_id`)
- Attendance records
- Join date
- All other fields

### Auction Items Sync

1. Fetches current auction queue from Google Sheets via `getBiddingItems()`
2. **Clears** all existing auction items in MongoDB
3. **Inserts** fresh items from Sheets

**Why delete-then-insert?**
- Auction items change frequently (items sold, new items added)
- Sheet is always authoritative for auction queue
- Simpler than trying to diff and update

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

**Last Updated**: Nov 29, 2025
**Script Version**: 1.0 (Members + Auction Items)
