# 🚀 Bot Performance Optimization Report

Generated: 2025-12-25
Analyzed: 18,901 lines across 6 major files

## 📊 Summary

Found **5 optimization opportunities** that could improve bot performance:

- 🔴 **Critical**: 1 issue (getMemberStats N+1 query)
- 🟡 **Medium**: 2 issues (aggregate query optimization, cache TTL tuning)
- 🟢 **Low**: 2 issues (projection opportunities, memory efficiency)

---

## 🔴 CRITICAL OPTIMIZATIONS

### 1. getMemberStats() - Loads ALL Members for Fuzzy Search

**File**: `utils/mongodb-helpers.js:640`

**Problem**:
```javascript
// BAD: Loads ALL active members into memory (could be 100+ members)
const members = await db.collection('members').find({ isActive: true }).toArray();

// Then does client-side fuzzy matching
member = members.find(m => m.username.toLowerCase() === memberName.toLowerCase());
```

**Impact**:
- Loads ALL active members into memory on every `!stats` command
- With 100 members, that's ~10-50KB of unnecessary data transfer
- No index usage for fuzzy matching
- Scales poorly as guild grows

**Solution**:
Use MongoDB's `$regex` query instead:
```javascript
// BETTER: Use database query with index
member = await db.collection('members').findOne({
  username: { $regex: new RegExp(`^${escapeRegex(memberName)}$`, 'i') },
  isActive: true
});

// Fallback to fuzzy if exact match fails
if (!member) {
  member = await db.collection('members').findOne({
    username: { $regex: new RegExp(escapeRegex(memberName), 'i') },
    isActive: true
  });
}
```

**Expected Improvement**: 50-80% faster member lookups, especially with large guilds

---

## 🟡 MEDIUM OPTIMIZATIONS

### 2. Duplicate Aggregate Queries in getMemberStats()

**File**: `utils/mongodb-helpers.js:705-737`

**Problem**:
```javascript
// Query 1: Get TOTAL unique spawns (scans entire attendance collection)
const uniqueSpawns = await db.collection('attendance').aggregate([...]).toArray();

// Query 2: Get MEMBER unique spawns (scans entire attendance for this member)
const memberUniqueSpawns = await db.collection('attendance').aggregate([...]).toArray();
```

Both queries scan the attendance collection separately.

**Solution**:
Combine into a single aggregate query with `$facet`:
```javascript
const stats = await db.collection('attendance').aggregate([
  {
    $facet: {
      totalSpawns: [
        { $group: { _id: { bossName: '$bossName', timestamp: '$timestamp' } } },
        { $count: 'total' }
      ],
      memberSpawns: [
        { $match: { memberId: member._id } },
        { $group: { _id: { bossName: '$bossName', timestamp: '$timestamp' } } },
        { $count: 'total' }
      ]
    }
  }
]).toArray();
```

**Expected Improvement**: 30-40% faster attendance rate calculation

---

### 3. Cache TTL Tuning Opportunities

**File**: `utils/sheet-api.js:154-165`

**Current TTLs**:
```javascript
BIDDING_POINTS: 5 * 60 * 1000,      // 5 min
MEMBER_STATS: 5 * 60 * 1000,        // 5 min
BIDDING_ITEMS: 30 * 1000,           // 30 sec
```

**Recommendations**:
- `MEMBER_STATS`: Increase to 10 minutes (stats don't change that often)
- `BIDDING_ITEMS`: Increase to 60 seconds (auction items rarely update mid-auction)
- `ROTATING_BOSSES`: Cache indefinitely until rotation changes (event-driven invalidation)

**Expected Improvement**: 20-30% reduction in Google Sheets API calls

---

## 🟢 LOW-PRIORITY OPTIMIZATIONS

### 4. Missing Projections in Queries

**Files**: Multiple locations in `utils/mongodb-helpers.js`

**Problem**:
Many queries fetch entire documents when only a few fields are needed:
```javascript
// BAD: Fetches all fields
const members = await db.collection('members').find({}).toArray();

// BETTER: Only fetch needed fields
const members = await db.collection('members')
  .find({}, { projection: { username: 1, pointsAvailable: 1 } })
  .toArray();
```

**Locations**:
- `getAllMembers()` - line 133
- `getRecentSoldItems()` - line 387
- `getAllBossTimers()` - line 879
- `getActiveReminders()` - line 976

**Expected Improvement**: 10-20% memory reduction for large queries

---

### 5. Array Operations on Large Datasets

**File**: `utils/mongodb-helpers.js:751-755`

**Problem**:
```javascript
// After aggregation, sorts ALL members client-side
const sortedByAttendance = allMembers
  .map(m => ({ username: m.username, total: m.attendance?.total || 0 }))
  .sort((a, b) => b.total - a.total);
```

**Solution**:
Use MongoDB's `$sort` in aggregation pipeline instead:
```javascript
const sortedByAttendance = await db.collection('members').aggregate([
  { $match: { isActive: true } },
  { $project: { username: 1, total: '$attendance.total' } },
  { $sort: { total: -1 } }
]).toArray();
```

**Expected Improvement**: 15-25% faster ranking calculation

---

## 📈 Performance Metrics

### Current Performance (Estimated):
- **Startup Time**: 3-5 seconds (after fast startup fix) ✅
- **!stats Command**: ~200-500ms (with member fuzzy search)
- **!leaderboard Command**: ~300-600ms
- **Database Queries**: 199 queries across 35 files

### After All Optimizations (Projected):
- **!stats Command**: ~80-150ms (60-70% faster)
- **!leaderboard Command**: ~180-350ms (40-50% faster)
- **API Call Reduction**: 20-30% fewer Google Sheets calls
- **Memory Usage**: 10-20% reduction

---

## 🎯 Recommended Implementation Priority

### Phase 1 (High Impact, Quick Wins):
1. Fix `getMemberStats()` fuzzy search (Critical)
2. Tune cache TTLs (Easy, immediate benefit)

### Phase 2 (Medium Impact):
3. Combine duplicate aggregate queries
4. Add projections to large queries

### Phase 3 (Nice to Have):
5. Move client-side sorting to MongoDB

---

## 🔍 Additional Findings

### ✅ Things Already Optimized:
- **Indexes**: Comprehensive index coverage (18 indexes) ✅
- **Connection Pooling**: MongoDB connection pool configured (max 10, min 2) ✅
- **Caching Layer**: Client-side cache with TTLs implemented ✅
- **Startup**: Fast startup script created ✅
- **Logging**: Pino structured logging (5-10x faster than console.log) ✅
- **Memory Leaks**: Timer cleanup with shutdown manager ✅

### 📊 Code Statistics:
- **Total Lines**: 18,901 across major files
- **MongoDB Queries**: 199 queries
- **API Calls**: 227 external calls (Google Sheets, HTTP)
- **Cache Usage**: 54 cache operations across 11 files
- **Console.log Statements**: 2,378 (many migrated to Pino)

---

## 💡 Notes

- Most optimizations are non-breaking and can be implemented incrementally
- The bot is already well-optimized overall (good indexes, caching, connection pooling)
- Main bottlenecks are in specific query patterns, not architectural issues
- Estimated total performance gain: **40-60% faster** for common commands

