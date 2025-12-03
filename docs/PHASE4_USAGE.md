# Phase 4: MongoDB Integration - Usage Guide

## Overview

Phase 4 implements MongoDB-first architecture with Google Sheets as backup. This provides:
- **50-100x faster response times** (10-50ms vs 500-2000ms)
- **Automatic failover** to Sheets if MongoDB is unreachable
- **10 retry attempts** with exponential backoff before fallback
- **Admin alerts** for failures via Discord admin-logs channel
- **Safe rollback** via environment variables

## Quick Start

### 1. Run One-Time Discord ID Migration

Before enabling MongoDB, migrate all members from temp IDs to real Discord IDs:

```bash
# On Koyeb or local environment with MONGODB_URI and DISCORD_TOKEN set
node scripts/migrate-discord-ids.js
```

**What it does:**
- Finds all members with temp IDs (`temp_username`)
- Looks up real Discord IDs from the guild
- Migrates MongoDB documents to use Discord IDs as primary keys
- Queues background sync to update Sheets

**Expected output:**
```
✅ Successfully migrated: 45
❌ Failed: 0
⚠️ Not found in Discord: 5
📊 Migration progress: 90%
```

Members not found in Discord will keep temp IDs until they join the server.

### 2. Enable MongoDB for All Operations

Set environment variables in Koyeb:

```bash
USE_MONGODB_BIDDING=true
USE_MONGODB_AUCTIONEERING=true
USE_MONGODB_ATTENDANCE=true
MONGODB_FALLBACK_ENABLED=true  # Recommended for safety
```

**Restart the bot** to apply changes.

### 3. Monitor the First Auction

Watch Koyeb logs during the Saturday 12pm auction:

```
✅ [MongoDB] Fetched 50 member points
✅ [MongoDB] Points updated successfully
✅ [MongoDB] Results submitted, Sheet sync queued
📤 Processing 3 sync action(s) (priority: 0ms)
✅ Synced bidding results: 50 members
```

Check admin-logs channel for any alerts.

## Feature Flags

### USE_MONGODB_BIDDING

**Default:** `false` (Sheets only)

```bash
# Enable MongoDB for bidding operations
USE_MONGODB_BIDDING=true
```

**When enabled:**
- fetchPts() reads from MongoDB members collection
- submitRes() updates MongoDB + queues Sheet sync
- saveBotState() saves to MongoDB botState collection
- loadBotState() loads from MongoDB first

**When disabled:**
- All operations use Google Sheets (legacy behavior)
- Safe fallback if MongoDB has issues

### USE_MONGODB_AUCTIONEERING

**Default:** `false` (Sheets only)

```bash
# Enable MongoDB for auctioneering operations
USE_MONGODB_AUCTIONEERING=true
```

**When enabled:**
- fetchSheetItems() reads from MongoDB auctionItems collection
- logAuctionResult() marks items as sold in MongoDB + queues Sheet sync
- saveAuctionState() saves to MongoDB botState collection
- Startup logging shows MongoDB vs Sheets mode

**When disabled:**
- All auction operations use Google Sheets (legacy behavior)
- Safe fallback if MongoDB has issues

### USE_MONGODB_ATTENDANCE

**Default:** `false` (Sheets only)

```bash
# Enable MongoDB for attendance operations
USE_MONGODB_ATTENDANCE=true
```

**When enabled:**
- Daily attendance records saved to MongoDB attendance collection
- Each member's attendance added individually with boss, timestamp, points
- !leaderboard (attendance) reads from MongoDB members collection
- IMMEDIATE priority Sheet sync (0ms delay - critical operation)
- Startup logging shows MongoDB vs Sheets mode

**When disabled:**
- All attendance operations use Google Sheets (legacy behavior)
- Safe fallback if MongoDB has issues

### MONGODB_FALLBACK_ENABLED

**Default:** `true` (auto-fallback on failures)

```bash
# Disable fallback (MongoDB only, fail if unreachable)
MONGODB_FALLBACK_ENABLED=false
```

**Recommended:** Keep `true` for production safety.

## Retry & Failover Behavior

### Circuit Breaker Pattern

1. **Normal operation (CLOSED):**
   - All requests go to MongoDB
   - 10 retry attempts with exponential backoff
   - Backoff: 1s → 2s → 4s → 8s → 16s → 30s (capped)

2. **Failures accumulate (threshold: 5):**
   - After 5 consecutive failures, circuit opens
   - Admin alert sent to Discord

3. **Circuit OPEN:**
   - All requests use Sheets fallback immediately
   - No MongoDB attempts for 60 seconds
   - Admin alert sent

4. **Recovery (HALF_OPEN):**
   - After 60s, try MongoDB again
   - If successful, circuit closes
   - Admin alert sent for recovery

### Sync Priorities

**IMMEDIATE (0ms delay):**
- Auction session end (bidding points tally)
- Attendance thread close
- Boss spawn timer
- Critical point changes

**HIGH (2s delay):**
- Attendance records
- Bot state saves

**NORMAL (5s delay):**
- Member updates
- Stats updates

**LOW (30s delay):**
- Non-critical background tasks

## Admin Alerts

Alerts are sent to `admin_logs_channel_id` for:

### 🚨 MongoDB Connection Failure
```
Module: bidding
Operation: fetchPts
Attempts: 10
Fallback Used: ✅ Sheets
```

### ⚠️ Circuit Breaker Opened
```
Circuit: BiddingMongoDB
Failures: 5/5
Status: All requests will use fallback
```

### ✅ Circuit Breaker Recovered
```
Circuit: BiddingMongoDB
Status: Normal operations resumed
```

### ⚠️ Sheet Sync Failure
```
Action Type: submitBiddingResults
Attempts: 10
Error: Network timeout
```

## Discord ID Management

### Automatic Migration (Gradual)

When a user interacts with the bot, their ID is automatically migrated:

```javascript
// In bidding commands, attendance, etc.
const member = await discordIdMapper.ensureMemberExists(interaction.user);
// Returns member with real Discord ID as _id
```

**Process:**
1. Check if member exists by Discord ID
2. If not, check by username
3. If found with temp ID, migrate to real ID
4. If not found, create new member with real ID
5. Update username if changed in Discord

### Username Changes

MongoDB always uses Discord ID as primary key, so username changes are safe:

```javascript
// User changes Discord username from "Alice" to "Alice2025"
// MongoDB: _id stays the same (Discord ID)
// Document: username field updated to "Alice2025"
// Sheets: synced with new username
```

### Manual Migration

For specific members:

```javascript
const discordIdMapper = require('./utils/discord-id-mapper');

// Migrate single member
await discordIdMapper.mapDiscordIdToMember('Alice', '123456789012345678');

// Check migration stats
const stats = await discordIdMapper.getMigrationStats();
console.log(`Progress: ${stats.percentComplete}%`);
```

## Rollback Procedures

### Quick Rollback (No Code Changes)

**In Koyeb environment variables:**
```bash
USE_MONGODB_BIDDING=false
USE_MONGODB_AUCTIONEERING=false
USE_MONGODB_ATTENDANCE=false
```

**Restart bot** → All operations use Sheets immediately.

**When to use:**
- MongoDB connection issues during auction
- Data inconsistency detected
- Emergency fallback needed

### Verify Rollback

Check logs for:
```
✅ Fetch pts: [Sheets API response]
✅ Submitted [Sheets API]
```

No MongoDB log messages should appear.

## Testing Before Saturday Auction

### 1. Test Points Fetch

```bash
# In bot console
!mypoints
```

**Expected log:**
```
✅ [MongoDB] Fetched 50 member points
```

### 2. Test Bidding (Dry Run)

Create a test auction with 1 item, let someone bid, end auction:

**Expected logs:**
```
✅ [MongoDB] Fetched points
✅ [MongoDB] Points updated: Alice -500 points
✅ [MongoDB] Results submitted, Sheet sync queued
📤 Processing 1 sync action(s) (priority: 0ms)
✅ Synced bidding results: 50 members
```

**Verify in Google Sheets:**
- Alice's points decreased by 500
- Sheets and MongoDB match

### 3. Test Circuit Breaker

**Temporarily break MongoDB connection:**
```bash
# Set invalid MONGODB_URI in Koyeb
MONGODB_URI=mongodb+srv://invalid
```

**Try !mypoints:**
```
⚠️ [MongoDB] Attempt 1/10 failed, retrying in 1000ms
⚠️ [MongoDB] Attempt 2/10 failed, retrying in 2000ms
...
❌ [MongoDB] All 10 attempts failed
⚠️ [MongoDB] Using fallback after 10 failed attempts
✅ [Sheets] Points fetched successfully
```

**Check admin-logs for alert.**

**Restore MongoDB URI:**
```bash
MONGODB_URI=mongodb+srv://correct_uri
```

## Data Consistency

### MongoDB as Source of Truth

**Rule:** MongoDB is always the source of truth **EXCEPT** when manual edits are made in Google Sheets.

### Manual Sheet Edits

If you manually edit points in Google Sheets:

1. Sheet edit detected on next Sheet API call
2. MongoDB syncs FROM Sheets for that member
3. Admin alert sent (optional future feature)

**Current behavior:** Next bot operation will overwrite Sheet with MongoDB value.

**Recommendation:** Use bot commands (!addpoints, !removepoints) instead of manual Sheet edits.

### Reconciliation

If MongoDB and Sheets are out of sync:

1. **MongoDB wins** - Sheets will be updated on next sync
2. **Check logs** for data inconsistency alerts
3. **Manual fix** if needed via bot commands

## Monitoring

### Health Checks

```bash
# Check MongoDB connection in logs
📊 MongoDB Health: ✅ Healthy (Latency: 2ms)
📦 Database: elysium-bot | Collections: 6 | Size: 1.2MB
```

### Circuit Breaker Stats

```javascript
const mongoHelpers = require('./utils/mongodb-helpers');
const status = mongoHelpers.getCircuitStatus();

console.log(status);
// {
//   name: 'BiddingMongoDB',
//   state: 'CLOSED',
//   failures: 0,
//   successes: 127,
//   stats: { totalAttempts: 127, totalSuccesses: 127, totalRetries: 0 }
// }
```

### Sync Queue Stats

```javascript
const sheetSync = require('./services/sheet-sync');
const stats = sheetSync.getStats();

console.log(stats);
// {
//   totalSynced: 45,
//   totalFailed: 0,
//   queueSizes: { immediate: 0, high: 0, normal: 1, low: 0 }
// }
```

## Saturday Auction Checklist

**Before auction (11:45am):**
- [ ] Verify `USE_MONGODB_BIDDING=true` in Koyeb
- [ ] Verify `USE_MONGODB_AUCTIONEERING=true` in Koyeb
- [ ] Verify `USE_MONGODB_ATTENDANCE=true` in Koyeb
- [ ] Check MongoDB health in logs (2ms latency expected)
- [ ] Verify Discord ID migration completed (100% expected)
- [ ] Check startup logs for "✅ [MongoDB] Auctioneering using MongoDB-first architecture"
- [ ] Check startup logs for "✅ [MongoDB] Attendance using MongoDB-first architecture"
- [ ] Test !mypoints command (should use MongoDB)
- [ ] Test !leaderboard command (should use MongoDB)
- [ ] Monitor admin-logs channel (should be quiet)

**During auction (12:00pm):**
- [ ] Watch Koyeb logs for MongoDB operations
- [ ] Check for any circuit breaker alerts
- [ ] Verify bids process normally (3s rate limit)
- [ ] Monitor admin-logs for failures

**After auction:**
- [ ] Check final tally in Sheets matches expectations
- [ ] Verify all winners' points deducted
- [ ] Check sync queue is empty (`queueSizes: { immediate: 0 }`)
- [ ] Review any admin-log alerts

**Emergency rollback:**
```bash
# In Koyeb
USE_MONGODB_BIDDING=false
USE_MONGODB_AUCTIONEERING=false
# Restart bot
```

## Troubleshooting

### MongoDB unreachable

**Symptoms:**
- 10 retry attempts in logs
- "Using fallback after 10 failed attempts"
- Circuit breaker opens

**Solution:**
- System auto-falls back to Sheets
- Check MongoDB Atlas network settings
- Verify MONGODB_URI is correct
- Check Koyeb region matches MongoDB region (Singapore)

### Sheets sync failures

**Symptoms:**
- "❌ Sync failed after 10 attempts"
- Admin alert in Discord

**Solution:**
- Check Sheet webhook URL in config.json
- Verify Apps Script deployment is active
- Check Google Sheets quota (10,000 calls/day)
- Manual reconciliation may be needed

### Data inconsistency

**Symptoms:**
- Points mismatch between MongoDB and Sheets
- Admin alert for inconsistency

**Solution:**
1. Determine which is correct (usually MongoDB)
2. Use bot commands to sync: `!refreshpoints`
3. Manual Sheet edit if MongoDB is wrong

### Circuit breaker stuck OPEN

**Symptoms:**
- All requests use Sheets fallback
- "Circuit OPEN" in logs

**Solution:**
- Wait 60 seconds for auto-recovery
- Or manually reset: `mongoHelpers.resetCircuit()`
- Check MongoDB connection

## Future Enhancements

- [ ] Data inconsistency auto-fix
- [ ] Sync queue dashboard
- [ ] Manual sync trigger command
- [ ] Batch Sheet reconciliation
- [ ] Circuit breaker manual control commands
- [ ] MongoDB performance metrics dashboard
