# MongoDB Migration Guide

## 📋 Overview

This document tracks the migration from Google Sheets-only architecture to MongoDB + Google Sheets hybrid architecture.

**Goal**: Improve bot performance by 50-100x and eliminate Google Sheets API rate limits.

**Strategy**: Option B - Direct Migration (all at once, 1 week timeline)

**Status**: 🚧 IN PROGRESS - Phase 1 Complete

---

## 🎯 Migration Benefits

### Performance Improvements
| Operation | Before (Sheets) | After (MongoDB) | Improvement |
|-----------|-----------------|-----------------|-------------|
| Check points | 500-800ms | 5-10ms | 80x faster |
| Save attendance | 1000-2000ms | 50-100ms | 20x faster |
| Place bid | 500ms | 10-15ms | 50x faster |
| View stats | 500-1000ms | 10-20ms | 50x faster |
| Leaderboard | 2000-5000ms | 20-50ms | 100x faster |
| Weekly report | 5000-10000ms | 50-100ms | 100x faster |
| Crash recovery | 3000-5000ms | 100-200ms | 30x faster |

### Rate Limit Elimination
- **Before**: 60 requests/minute to Google Sheets API (risky during auctions)
- **After**: Unlimited MongoDB queries + background Sheet sync

---

## 📅 Migration Timeline

### Phase 1: Cleanup ✅ COMPLETED
**Date**: Nov 28, 2025
**Branch**: `claude/mongodb-discord-sheets-integration-01GRaQdFEZLajcDj9U4matZC`

**Actions Taken**:
- ✅ Deleted 13 abolished files (~500KB, 14,290 lines)
  - `intelligence-engine.js`
  - `learning-system.js`
  - `loot-system.js`
  - `ml-integration.js`
  - `ml-spawn-predictor.js`
  - `nlp-admin-commands.js`
  - `nlp-conversation.js`
  - `nlp-handler.js`
  - `nlp-learning.js`
  - `nlp-vocabulary-tagalog.js`
  - `nlp-vocabulary-taglish.js`
  - `nlp-vocabulary.js`
  - `proactive-intelligence.js`

- ✅ Cleaned up `index2.js` (removed imports)
- ✅ Committed and pushed to branch
- ✅ Verified bot still works

**Commit**: `chore: remove abolished systems (intelligence, learning, ML, NLP, loot)`

---

### Phase 2: MongoDB Setup 🔄 NEXT
**Estimated Time**: 1 day

**Tasks**:
1. ✅ MongoDB Atlas cluster created (Singapore region)
2. ✅ Database user created (`elysium-bot`)
3. ✅ Connection string obtained
4. ✅ `MONGODB_URI` added to Koyeb environment variables
5. ⏳ Install MongoDB driver: `npm install mongodb@6`
6. ⏳ Create `utils/database-api.js`
7. ⏳ Test MongoDB connection
8. ⏳ Create database indexes

**MongoDB Configuration**:
- **Cluster**: `elysium-bot-cluster`
- **Region**: `ap-southeast-1` (Singapore) - Same as Koyeb
- **Tier**: M0 FREE (512MB)
- **Database**: `elysium-bot`
- **Latency**: ~5-10ms (ultra-fast!)

---

### Phase 3: Data Migration ⏳ PENDING
**Estimated Time**: 1 day

**Tasks**:
1. Create migration script `scripts/migrate-to-mongodb.js`
2. Migrate historical attendance (all weeks)
3. Migrate members with points
4. Migrate auction items
5. Migrate boss rotation
6. Migrate event reminders
7. Verify data integrity in MongoDB Atlas

**Data Estimates**:
- **50 members** → ~100KB
- **405,600 attendance records** (1 year) → ~80MB
- **~500 auction items/year** → ~250KB
- **Total**: ~81MB (well under 512MB free tier)

---

### Phase 4: Core Refactor ⏳ PENDING
**Estimated Time**: 2 days

**Files to Update**:
- `attendance.js` → Use MongoDB for attendance
- `bidding.js` → Use MongoDB for points
- `auctioneering.js` → Use MongoDB for queue
- `boss-rotation.js` → Use MongoDB for rotation
- `boss-timer.js` → Use MongoDB for recovery
- `leaderboard-system.js` → Query MongoDB directly
- `event-reminders.js` → Use MongoDB for reminders
- `index2.js` → Update all commands

**Strategy**: All reads from MongoDB, writes to MongoDB + background sync to Sheets

---

### Phase 5: Sheet Sync Implementation ⏳ PENDING
**Estimated Time**: 1 day

**Components**:
1. **Code.js (Google Apps Script)**:
   - Add `onEdit()` webhook for manual Sheet edits
   - Notify bot of late attendance, manual adjustments

2. **Bot Webhook Receiver**:
   - `services/sheet-webhook-receiver.js`
   - Handle late attendance
   - Handle manual point adjustments
   - Auto-fix discrepancies (Sheet = source of truth)

3. **Background Sync Service**:
   - Sync MongoDB → Sheets every 10 minutes
   - Real-time sync for critical operations
   - Protect formula cells (don't overwrite)

---

### Phase 6: Testing & Deployment ⏳ PENDING
**Estimated Time**: 1 day

**Testing Checklist**:
- [ ] All commands work (!mypoints, !stats, !leaderboard)
- [ ] Attendance tracking (thread create, verify, close)
- [ ] Auction flow (start, bid, end)
- [ ] Late attendance (manual Sheet edit)
- [ ] Manual point adjustment
- [ ] Boss rotation
- [ ] Event reminders
- [ ] Crash recovery
- [ ] Sheet sync (both directions)

**Deployment**:
1. Push to branch
2. Koyeb auto-deploys
3. Monitor logs
4. Guild testing
5. Production validation

---

## 🗄️ MongoDB Collections

See [MONGODB_SCHEMA.md](./MONGODB_SCHEMA.md) for detailed schema documentation.

**Collections** (7 total):
1. `attendance` - All attendance records
2. `members` - Member points + stats
3. `auctionItems` - Auction queue + history
4. `auctionSessions` - Session audit trail
5. `botState` - Crash recovery state
6. `bossRotation` - Alliance rotation
7. `eventReminders` - Event reminders

---

## 🔄 Data Flow Architecture

### Before (Current - Sheets Only)
```
Discord Event → Bot → Google Sheets API → Sheets
                       ↓ (500-2000ms)
                    Response
```

### After (MongoDB Primary)
```
Discord Event → Bot → MongoDB (10-50ms)
                       ↓
                    Response
                       ↓ (background, no blocking)
                   Google Sheets (sync)
```

### Two-Way Sync
```
Manual Sheet Edit → Code.js onEdit() → Webhook → Bot → MongoDB
                                                         ↓
                                                  Update complete
```

---

## 🔧 Sync Rules

### MongoDB → Sheets (Background)
- **Frequency**: Every 10 minutes OR immediately after critical events
- **What syncs**: Attendance, points, auction results, session columns
- **Protected**: Formula cells (never overwritten)

### Sheets → MongoDB (Instant)
- **Trigger**: `onEdit()` in Code.js
- **What syncs**: Late attendance, manual point adjustments, notes
- **Rule**: Sheet = source of truth (auto-fix MongoDB if mismatch)

---

## 🆘 Rollback Plan

### Option 1: Environment Variable Rollback
```bash
# In Koyeb environment variables:
USE_MONGODB=false  # Fallback to Sheets
```

### Option 2: Git Rollback
```bash
git revert HEAD
git push origin claude/mongodb-discord-sheets-integration-01GRaQdFEZLajcDj9U4matZC
# Koyeb auto-deploys old code
```

### Option 3: Full Rollback
```bash
git checkout <previous-commit-hash>
git push origin claude/mongodb-discord-sheets-integration-01GRaQdFEZLajcDj9U4matZC --force
```

---

## 📊 Guild Testing Plan

### Phase A: Basic Commands (First Hour)
- [ ] `!mypoints` - Check points display
- [ ] `!stats` - Check member stats
- [ ] `!leaderboard` - Check rankings
- [ ] Verify responses are fast (<1 second)

### Phase B: Attendance (Next Spawn)
- [ ] Admin creates spawn thread
- [ ] Members post attendance
- [ ] Admin verifies members
- [ ] Thread closes
- [ ] Check Google Sheet updated
- [ ] Verify member points increased

### Phase C: Auction (Next Saturday)
- [ ] `!startauction` - Load items from MongoDB
- [ ] Members bid
- [ ] Verify bids are fast
- [ ] Item sold
- [ ] Check points deducted
- [ ] Check Google Sheet updated
- [ ] End auction
- [ ] Verify ForDistribution updated

### Phase D: Edge Cases
- [ ] Late attendance submission (manual Sheet edit)
- [ ] Manual point adjustment in Sheet
- [ ] `!removemember` command
- [ ] Bot restart (crash recovery)
- [ ] Boss rotation

---

## 📈 Success Metrics

After migration, we expect:
- ✅ Command responses under 50ms (currently 500-2000ms)
- ✅ Zero Google Sheets rate limit errors
- ✅ Crash recovery under 1 second (currently 5-10 seconds)
- ✅ Auction bidding with no lag
- ✅ Support for 100+ boss spawns/week with no issues

---

## 🔗 Related Documentation

- [MongoDB Schema Documentation](./MONGODB_SCHEMA.md)
- [Migration Progress Tracker](./MIGRATION_PROGRESS.md)
- [Architecture Documentation](../ARCHITECTURE.md)

---

## 👥 Team

**Guild**: ELYSIUM
**Members**: 50
**Region**: Philippines
**Server**: Koyeb (Singapore)
**Database**: MongoDB Atlas (Singapore)

---

## 📝 Notes

### Why MongoDB?
1. **Speed**: 50-100x faster than Google Sheets API
2. **No Rate Limits**: Unlimited queries (vs 60 req/min)
3. **Better for Real-time**: Auctions, attendance tracking
4. **Scalability**: Can handle 1000+ spawns/week easily
5. **Complex Queries**: Aggregations, filtering, sorting

### Why Keep Google Sheets?
1. **Manual Admin Access**: Easy to view/edit data
2. **Backup**: Secondary data source
3. **Formulas**: Some calculations better in Sheets
4. **Familiarity**: Admins already know how to use it
5. **Historical**: Old data visualization

### Why Two-Way Sync?
1. **Late Attendance**: Admins manually add via Sheet
2. **Point Adjustments**: Manual corrections in Sheet
3. **Distribution Notes**: Manual tracking in ForDistribution
4. **Flexibility**: Best of both worlds

---

**Last Updated**: Nov 28, 2025
**Current Phase**: Phase 1 Complete, Phase 2 Next
**Status**: 🚧 In Progress
