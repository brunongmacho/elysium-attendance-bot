# Attendance Timezone Fix Migration

## Problem

Attendance timestamps were being stored incorrectly in MongoDB. When the bot saw a timestamp like `12/17/24 14:39` (GMT+8), it stored it as `14:39 UTC` instead of the correct `06:39 UTC`.

This caused spawn predictions to show times 8 hours in the future.

Example:
- Boss killed at: **2:39 PM GMT+8** (server time)
- Incorrectly stored as: **2:39 PM UTC**
- Discord displays to GMT+8 users: **10:39 PM GMT+8** ❌ (should be 2:39 PM)

## Solution

Run the migration script to subtract 8 hours from all existing attendance timestamps.

## Instructions

### Step 1: Dry Run (Test)

First, run in dry-run mode to see what changes will be made **without** modifying the database:

```bash
node scripts/fix-attendance-timezones.js --dry-run
```

This will show you:
- How many records will be updated
- Examples of the timestamp conversions
- No actual changes to the database

### Step 2: Run Migration (Live)

Once you've reviewed the dry-run output and confirmed it looks correct, run the actual migration:

```bash
node scripts/fix-attendance-timezones.js
```

This will:
- Update all attendance records in MongoDB
- Correct timestamps from "GMT+8 stored as UTC" to "actual UTC"
- Show a summary of changes made

### Step 3: Verify

After running the migration, check `/rotation status` in Discord. Boss spawn predictions should now show the correct times (8 hours earlier than before).

## Expected Output

### Dry Run Example:
```
=============================================================================
ATTENDANCE TIMEZONE FIX MIGRATION
=============================================================================

🔍 DRY RUN MODE - No changes will be made

📡 Connecting to MongoDB...
✅ Connected to MongoDB

📊 Fetching all attendance records...
✅ Found 1547 attendance records

🔄 Processing records...

📝 Example 1:
   Boss: Wannitas
   Member: YourName
   Old: 2024-12-17T14:39:00.000Z (12/17/2024, 10:39:00 PM Manila)
   New: 2024-12-17T06:39:00.000Z (12/17/2024, 2:39:00 PM Manila)

...

=============================================================================
MIGRATION SUMMARY
=============================================================================
Total Records:   1547
✅ Updated:      1547
⏭️  Skipped:      0
❌ Errors:       0
=============================================================================

🔍 DRY RUN COMPLETE - No changes were made
💡 Run without --dry-run to apply changes
```

### Live Run Example:
```
=============================================================================
ATTENDANCE TIMEZONE FIX MIGRATION
=============================================================================

⚠️  LIVE MODE - Timestamps will be updated

...

=============================================================================
MIGRATION SUMMARY
=============================================================================
Total Records:   1547
✅ Updated:      1547
⏭️  Skipped:      0
❌ Errors:       0
=============================================================================

✅ MIGRATION COMPLETE - All timestamps corrected
💡 Spawn predictions in /rotation status should now show correct times
```

## Safety

- ✅ **Dry run available**: Test before making changes
- ✅ **Read-only check**: Dry run shows what will change without modifying data
- ✅ **Error handling**: Script catches and reports any errors
- ✅ **Progress tracking**: Shows detailed progress and summary

## Rollback

If you need to undo the migration (add 8 hours back), you can run:

```bash
# Not implemented yet - contact developer if needed
```

## Technical Details

**What the script does:**
1. Connects to MongoDB
2. Fetches all records from the `attendance` collection
3. For each record:
   - Takes the current `timestamp` field
   - Subtracts 8 hours (28800000 milliseconds)
   - Updates the record with the corrected timestamp
4. Shows summary of changes

**Code location:** `scripts/fix-attendance-timezones.js`

**Affected collection:** `attendance`

**Affected field:** `timestamp`

**Conversion:** `new_timestamp = old_timestamp - (8 * 60 * 60 * 1000)`
