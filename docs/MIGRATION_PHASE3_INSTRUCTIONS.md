# Phase 3: Data Migration Instructions

**Status**: ⏸️ Ready to Execute
**Created**: Nov 29, 2025
**Script**: `scripts/migrate-to-mongodb.js`

---

## 📋 Overview

Phase 3 migrates all historical data from Google Sheets to MongoDB. The migration script is ready and tested for syntax, but requires production environment variables to run.

---

## ✅ Prerequisites

Before running the migration:

1. **Phase 2 Complete** ✅
   - MongoDB connection verified (2ms latency)
   - Collections and indexes created
   - Bot running in production

2. **Environment Variables Available**:
   - `MONGODB_URI` - MongoDB Atlas connection string
   - `WEBHOOK_URL` - Google Sheets Apps Script webhook URL

3. **Backup Created** (recommended):
   ```bash
   # Export current Google Sheets data (manual backup)
   # Download copies of:
   # - BiddingPoints sheet
   # - BiddingItems sheet
   # - All ELYSIUM_WEEK_* sheets
   ```

---

## 🚀 Running the Migration

### Option 1: Dry-Run (Test Mode)

Test the migration without writing any data:

```bash
# Test all phases
node scripts/migrate-to-mongodb.js --dry-run

# Test specific phase only
node scripts/migrate-to-mongodb.js --dry-run --phase=1  # Members
node scripts/migrate-to-mongodb.js --dry-run --phase=2  # Auction Items
node scripts/migrate-to-mongodb.js --dry-run --phase=3  # Attendance
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════════
🚀 ELYSIUM GUILD BOT - MONGODB MIGRATION
═══════════════════════════════════════════════════════════════
Mode: 🧪 DRY-RUN (no data will be written)
Phase: All phases
═══════════════════════════════════════════════════════════════

📝 Connecting to MongoDB Atlas...
✅ Connected to MongoDB successfully!
📝 Database: elysium-bot | Collections: 6

─────────────────────────────────────────────────────────────────
📝 PHASE 1: MEMBERS
─────────────────────────────────────────────────────────────────
⏳ Fetching member data from Google Sheets...
✅ Found 50 members in BiddingPoints sheet
⚠️  [DRY-RUN] Would insert 50 members

[... continues for each phase ...]

═══════════════════════════════════════════════════════════════
📊 MIGRATION STATISTICS
═══════════════════════════════════════════════════════════════
⏱️  Duration: 2m 15s
🔧 Mode: DRY-RUN

MEMBERS:
  Fetched: 50
  Inserted: 50

AUCTIONITEMS:
  Fetched: 245
  Inserted: 245

ATTENDANCE:
  Fetched: 0
  Inserted: 0

═══════════════════════════════════════════════════════════════

✅ Migration completed successfully! 🎉
⚠️  This was a DRY-RUN. Run without --dry-run to perform actual migration.
```

### Option 2: Live Migration (Production)

**⚠️ WARNING**: This will write data to MongoDB. Ensure dry-run completed successfully first.

```bash
# Run all phases
node scripts/migrate-to-mongodb.js

# Run specific phase only
node scripts/migrate-to-mongodb.js --phase=1
```

### Option 3: Verbose Mode

See detailed progress and sample data:

```bash
node scripts/migrate-to-mongodb.js --dry-run --verbose
```

---

## 📊 Migration Phases

### Phase 1: Members (~50 records, <5 seconds)

**Source**: `BiddingPoints` sheet
**Target**: `members` collection
**Data**:
- Member usernames
- Points available (current balance)
- Initial attendance stats (will be updated in Phase 3)

**Sample Document**:
```javascript
{
  _id: "temp_playername",
  username: "PlayerName",
  pointsAvailable: 150,
  pointsEarned: 0,
  pointsSpent: 0,
  attendance: {
    total: 0,
    thisWeek: 0,
    thisMonth: 0,
    byBoss: {},
    streak: { current: 0, longest: 0 }
  },
  joinedAt: ISODate("2025-11-29"),
  lastActive: ISODate("2025-11-29")
}
```

### Phase 2: Auction Items (~500 records, ~10 seconds)

**Source**: `BiddingItems` sheet
**Target**: `auctionItems` collection
**Data**:
- Pending queue items (no winner)
- Sold items (with winner)
- Item metadata (price, duration, boss, etc.)

**Sample Document**:
```javascript
{
  itemName: "Evil Glove [1]",
  startPrice: 40,
  duration: 30,
  quantity: 1,
  boss: "Laphine Queen",
  source: "manual",
  status: "sold",
  winner: "PlayerName",
  winnerId: null,
  winningBid: 45,
  soldAt: ISODate("2025-11-23"),
  sheetRow: 5
}
```

### Phase 3: Attendance Data (~405,600 records, ~30-60 minutes)

**Source**: All `ELYSIUM_WEEK_*` sheets
**Target**: `attendance` collection
**Data**:
- Individual attendance records per member per boss spawn
- Timestamps, boss names, points earned

**Status**: ⚠️ **PARTIAL IMPLEMENTATION**

The current script migrates spawn metadata (columns) but needs additional implementation to extract actual member attendance data from each spawn column.

**Required Enhancement**:
Create a new Google Apps Script endpoint to fetch member-level attendance for each spawn column:

```javascript
// Code.js addition needed:
function getSpawnAttendance(data) {
  const { weekSheet, column } = data;
  const sheet = ss.getSheetByName(weekSheet);
  const lastRow = sheet.getLastRow();

  // Read all member rows for this spawn column
  const memberNames = sheet.getRange(3, 1, lastRow - 2, 1).getValues();
  const attendance = sheet.getRange(3, column, lastRow - 2, 1).getValues();

  const members = [];
  for (let i = 0; i < memberNames.length; i++) {
    const memberName = memberNames[i][0];
    const attended = attendance[i][0]; // Checkmark or value

    if (memberName && attended) {
      members.push({ memberName, attended });
    }
  }

  return createResponse('ok', 'Attendance fetched', { members });
}
```

### Phase 4: Boss Rotation (~30 records, <5 seconds)

**Status**: ⚠️ **DEFERRED TO PHASE 4**

Boss rotation data is currently managed in-memory and synced to `_BossRotation` sheet. Migration will be handled during Phase 4 (Core Refactor) when rotation logic is updated to use MongoDB.

### Phase 5: Event Reminders (~50 records, <5 seconds)

**Source**: `EventReminders` sheet (if exists)
**Target**: `eventReminders` collection
**Data**:
- Scheduled event reminders
- Recurrence rules
- Notification settings

**Status**: ✅ **READY** (with fallback if sheet doesn't exist)

---

## ⚠️ Known Limitations

### 1. Discord User IDs Not Available

**Issue**: Google Sheets stores usernames only, MongoDB schema expects Discord user IDs (_id field).

**Current Workaround**: Using temporary IDs (`temp_username`)

**Phase 4 Solution**: When refactoring code to use MongoDB, map usernames to Discord IDs from Discord.js client and update member documents.

### 2. Attendance Data Extraction

**Issue**: Current script only migrates spawn column metadata, not actual member attendance.

**Current Status**: Partial implementation - needs Google Apps Script endpoint

**Options**:
- **Option A**: Add `getSpawnAttendance()` endpoint to Code.js
- **Option B**: Skip attendance migration, start fresh from Phase 4 onwards
- **Option C**: Manually export attendance data to CSV and import

**Recommendation**: Option B (start fresh) - historical attendance is available in Sheets, new attendance will be tracked in MongoDB from Phase 4 onwards.

### 3. Auction Session History

**Issue**: `auctionSessions` collection not populated yet.

**Current Status**: Not in migration script

**Phase 4 Solution**: Session data will be created going forward as auctions run with MongoDB.

---

## 🔍 Verification Steps

After migration completes:

### 1. Check MongoDB Atlas Dashboard

1. Go to https://cloud.mongodb.com
2. Navigate to elysium-bot cluster
3. Browse Collections
4. Verify:
   - `members`: 50 documents
   - `auctionItems`: ~500 documents
   - `attendance`: 0 documents (until Phase 3 enhancement)

### 2. Check Document Counts

```javascript
// Connect to MongoDB
use elysium-bot

// Count documents
db.members.countDocuments()          // Expected: 50
db.auctionItems.countDocuments()     // Expected: ~500
db.attendance.countDocuments()       // Expected: 0 (partial implementation)
```

### 3. Spot-Check Sample Documents

```javascript
// Check a member
db.members.findOne()

// Check pending auction items
db.auctionItems.find({ status: "pending" }).limit(5)

// Check sold items
db.auctionItems.find({ status: "sold" }).limit(5)
```

### 4. Verify Indexes

```javascript
// List indexes
db.members.getIndexes()
db.auctionItems.getIndexes()
db.attendance.getIndexes()
```

---

## 🔄 Rollback Plan

If migration fails or data is incorrect:

### Option 1: Drop Collections and Re-run

```javascript
// In MongoDB shell
use elysium-bot
db.members.drop()
db.auctionItems.drop()
db.attendance.drop()
```

Then run migration script again.

### Option 2: Restore from Backup

If you created a backup before migration:
1. Drop affected collections
2. Re-import backup data

### Option 3: Continue with Google Sheets

MongoDB integration is non-blocking. If migration fails, bot will continue using Google Sheets until Phase 4.

---

## 📈 Success Criteria

Migration is successful if:

- ✅ Members collection has 50 documents
- ✅ Member usernames match BiddingPoints sheet
- ✅ Points balance matches sheet data
- ✅ Auction items collection has ~500 documents
- ✅ Pending/sold status correctly assigned
- ✅ No errors in migration logs
- ✅ MongoDB Atlas shows correct data size (~1-2MB)

---

## 🐛 Troubleshooting

### Error: "MONGODB_URI not found"

**Cause**: Environment variable not set (only available in Koyeb)
**Solution**: Script must run in production environment (Koyeb) where MONGODB_URI is set, or set locally:

```bash
export MONGODB_URI="mongodb+srv://elysium-bot:PASSWORD@cluster.mongodb.net/"
node scripts/migrate-to-mongodb.js --dry-run
```

**Note**: The WEBHOOK_URL is automatically loaded from `config.json`, no environment variable needed.

### Error: "Failed to fetch from sheets"

**Cause**: Google Sheets API rate limit or network issue
**Solution**: Wait 60 seconds and retry. Script has automatic retry logic.

### Error: "MongoDB connection failed"

**Cause**: MONGODB_URI incorrect or cluster unreachable
**Solution**: Verify MongoDB Atlas cluster is running and URI is correct.

### Migration Hangs

**Cause**: Large attendance dataset (Phase 3)
**Solution**: Use `--phase=1` and `--phase=2` to run smaller phases first. Phase 3 may take 30-60 minutes.

---

## 📝 Next Steps After Phase 3

Once data migration completes:

1. **Verify Data** in MongoDB Atlas
2. **Update MIGRATION_PROGRESS.md** - Mark Phase 3 complete
3. **Begin Phase 4** - Core Refactor
   - Update `attendance.js` to use MongoDB
   - Update `bidding.js` to use MongoDB
   - Update `auctioneering.js` to use MongoDB
   - Map Discord IDs to member documents
4. **Test Commands** - !mypoints, !stats, !leaderboard
5. **Deploy to Production** - Monitor for errors

---

## 📞 Support

If you encounter issues:

1. Check migration logs for error messages
2. Verify environment variables are set
3. Check MongoDB Atlas for data
4. Review Google Sheets API quota
5. Check Code.js for missing endpoints (Phase 3 enhancement)

---

**Last Updated**: Nov 29, 2025
**Migration Script Version**: 1.0
**Status**: Ready for Execution
