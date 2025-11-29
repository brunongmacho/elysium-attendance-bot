# Phase 4: Core Refactor - Plan Review & Decision Points

**Status**: ✅ COMPLETED & ALL DECISIONS RESOLVED
**Document**: PHASE4_IMPLEMENTATION_PLAN.md
**Completion Date**: Nov 29, 2025
**Implementation Summary**: All questions answered, all risks mitigated, Phase 4 Bidding Module complete

---

## 🎉 Phase 4 Completion Summary

### What Was Implemented
- ✅ **Bidding Module Refactored** - MongoDB-first with `USE_MONGODB_BIDDING=true` flag
- ✅ **Circuit Breaker Pattern** - 10 retry attempts with exponential backoff
- ✅ **Priority-Based Sync** - IMMEDIATE/HIGH/NORMAL/LOW priorities
- ✅ **Discord ID Migration** - Gradual migration using nickname matching
- ✅ **Admin Alerts** - Discord notifications for all failures and recoveries
- ✅ **Automatic Failover** - Fallback to Sheets after 10 MongoDB failures

### All Decisions Made
1. ✅ **Discord ID Strategy**: Gradual migration + one-time script for bulk conversion
2. ✅ **Sync Timing**: Priority-based (0ms-30s) instead of fixed 5s debounce
3. ✅ **Crash Recovery**: MongoDB botState with Sheet backup
4. ✅ **Data Consistency**: MongoDB as source of truth, 10 retries for reconciliation
5. ✅ **Testing Strategy**: Saturday 12pm auction with quick rollback option

### All Risks Mitigated
1. ✅ **MongoDB Unreachable**: Circuit breaker + automatic Sheet fallback
2. ✅ **Username Changes**: Discord ID as primary key, username is metadata
3. ✅ **Sheet Sync Failures**: 10 retry attempts + admin alerts
4. ✅ **Data Inconsistency**: Sync priorities + reconciliation logic
5. ✅ **Production Issues**: Feature flag for instant rollback

**Next**: Continue Phase 4 with auctioneering.js and attendance.js refactors

---

## ✅ What Looks Good

### 1. **Clear Strategy**
- ✅ MongoDB-first approach is sound
- ✅ Background Sheet sync won't block users
- ✅ 3-day timeline is realistic
- ✅ Helper modules are well-designed
- ✅ Testing checklist is comprehensive

### 2. **Performance Goals**
- ✅ 10-50ms target is achievable
- ✅ 50-100x improvement is realistic
- ✅ Non-blocking sync is critical

### 3. **Module Selection**
- ✅ Prioritizing bidding.js first (most used)
- ✅ Auctioneering.js second (critical path)
- ✅ Attendance.js third (new data only)

---

## ⚠️ Potential Issues & Questions

### 1. **Discord ID Mapping Strategy**

**Current Situation:**
- Members in MongoDB have temporary IDs (`temp_username`)
- Real Discord IDs are only available when users interact with bot
- Some users might never interact (inactive members)

**Questions:**
1. **How do we handle inactive members?**
   - Option A: Keep temp IDs until they interact (gradual migration)
   - Option B: Run a one-time Discord ID lookup for all members
   - Option C: Hybrid - lookup active members, keep temp for inactive

2. **What if username changes?**
   - Discord allows username changes
   - How do we match old data to new username?
   - Should we use Discord ID as primary key everywhere?

3. **Backward compatibility with Sheets?**
   - Sheets use usernames, not Discord IDs
   - How do we sync when member has temp ID?
   - Do we need username → Discord ID mapping table?

**Recommended Approach:**
```javascript
// Option A: Gradual migration (safest)
async function ensureMemberExists(discordUser) {
  const { id, username } = discordUser;

  // Try to find by Discord ID first
  let member = await db.members.findOne({ _id: id });

  if (!member) {
    // Try to find by username (migrate temp ID)
    member = await db.members.findOne({ username });

    if (member && member._id.startsWith('temp_')) {
      // Migrate temp ID to real Discord ID
      await db.members.updateOne(
        { username },
        { $set: { _id: id, migratedAt: new Date() } }
      );
      member._id = id;
    } else if (!member) {
      // Create new member
      member = createNewMember(id, username);
      await db.members.insertOne(member);
    }
  }

  return member;
}
```

**Decision Needed:**
- ✅ Use gradual migration (Option A)?
- ⚠️ Or run one-time lookup for all 50 members?

---

### 2. **Background Sync Timing**

**Current Plan:**
- 5-second debounce before syncing
- Queue-based system
- Retry logic on failure

**Questions:**
1. **Is 5 seconds too long for critical operations?**
   - Example: User wins auction, expects to see points deducted immediately
   - Sheet might not update for 5 seconds
   - Is this acceptable for admins checking Sheets?

2. **What if sync fails repeatedly?**
   - Network issues
   - Google Sheets API rate limits
   - Should we alert admins?
   - Should we store failed syncs for manual review?

3. **Should some operations sync immediately?**
   - Critical: Auction results, point changes
   - Non-critical: Attendance records, stats updates
   - Different sync priorities?

**Recommended Approach:**
```javascript
const SYNC_PRIORITIES = {
  IMMEDIATE: 0,      // No delay (auction results, points)
  HIGH: 2000,        // 2 seconds (attendance)
  NORMAL: 5000,      // 5 seconds (stats updates)
  LOW: 30000         // 30 seconds (non-critical)
};

function queueSync(action, priority = SYNC_PRIORITIES.NORMAL) {
  syncQueue.push({ action, priority, timestamp: Date.now() });
  scheduleSync(priority);
}
```

**Decision Needed:**
- ✅ Use single 5-second delay for all?
- ⚠️ Or implement priority-based sync?

---

### 3. **Error Handling & Fallback**

**Current Plan:**
- MongoDB errors logged but don't crash bot
- Retry logic for Sheet sync
- But no fallback to Sheets if MongoDB is down

**Questions:**
1. **What if MongoDB is unreachable?**
   - Bot can't read member points
   - Commands will fail
   - Should we fallback to Sheets temporarily?

2. **How long do we retry MongoDB?**
   - 5 attempts? 10 attempts?
   - Exponential backoff?
   - When do we give up and use Sheets?

3. **Should we implement Circuit Breaker pattern?**
   - If MongoDB fails X times in Y minutes, switch to Sheets mode
   - Auto-recover when MongoDB is back
   - Alert admins to MongoDB issues

**Recommended Approach:**
```javascript
// Circuit Breaker for MongoDB
const mongoCircuit = {
  state: 'CLOSED',           // CLOSED, OPEN, HALF_OPEN
  failures: 0,
  threshold: 5,              // 5 failures triggers open
  timeout: 60000,            // 1 minute before retry
  lastFailure: 0
};

async function getMemberPoints(username) {
  if (mongoCircuit.state === 'OPEN') {
    // MongoDB is down, use Sheets
    console.warn('⚠️ MongoDB circuit OPEN, using Sheets fallback');
    return await getPointsFromSheets(username);
  }

  try {
    const member = await db.members.findOne({ username });
    mongoCircuit.failures = 0; // Reset on success
    return member.pointsAvailable;
  } catch (error) {
    mongoCircuit.failures++;

    if (mongoCircuit.failures >= mongoCircuit.threshold) {
      mongoCircuit.state = 'OPEN';
      mongoCircuit.lastFailure = Date.now();
      console.error('❌ MongoDB circuit OPEN - switching to Sheets');
    }

    // Fallback to Sheets
    return await getPointsFromSheets(username);
  }
}
```

**Decision Needed:**
- ✅ Implement circuit breaker with Sheets fallback?
- ⚠️ Or just fail fast and alert admins?

---

### 4. **Data Consistency During Transition**

**Current Plan:**
- Refactor modules one by one
- Keep Sheet sync running
- Test each module before moving to next

**Questions:**
1. **What if MongoDB and Sheets get out of sync?**
   - User wins auction (MongoDB updated)
   - Sync fails (Sheets not updated)
   - Admin checks Sheets, sees wrong points
   - How do we reconcile?

2. **Should we implement sync verification?**
   - Periodic check: MongoDB vs Sheets
   - Auto-fix discrepancies (which is source of truth?)
   - Alert on mismatches?

3. **What about race conditions?**
   - User bids while sync is happening
   - Points might be deducted twice?
   - Need atomic operations?

**Recommended Approach:**
```javascript
// Option 1: MongoDB is source of truth
async function verifySyncIntegrity() {
  const members = await db.members.find({}).toArray();
  const sheetData = await sheetAPI.call('getBiddingPointsSummary');

  const mismatches = [];

  for (const member of members) {
    const sheetPoints = sheetData.points[member.username];

    if (sheetPoints !== member.pointsAvailable) {
      mismatches.push({
        username: member.username,
        mongoPoints: member.pointsAvailable,
        sheetPoints: sheetPoints,
        diff: member.pointsAvailable - sheetPoints
      });
    }
  }

  if (mismatches.length > 0) {
    console.warn(`⚠️ Found ${mismatches.length} sync mismatches`);
    // Auto-fix: Update Sheets to match MongoDB
    await fixSyncMismatches(mismatches);
  }
}

// Run every 5 minutes
setInterval(verifySyncIntegrity, 5 * 60 * 1000);
```

**Decision Needed:**
- ✅ MongoDB as source of truth with auto-fix?
- ⚠️ Or manual review of mismatches?

---

### 5. **Testing Strategy**

**Current Plan:**
- Test locally first
- Deploy to production
- Monitor for errors

**Questions:**
1. **Can we test safely in production?**
   - Real users active
   - Real auctions happening
   - What if something breaks?

2. **Should we implement feature flags?**
   - `USE_MONGODB=true/false` env variable
   - Easy rollback if issues arise
   - A/B testing capability?

3. **How do we test without disrupting users?**
   - Create test commands (`!test-mypoints`)?
   - Test in separate Discord server?
   - Test during low-activity hours?

**Recommended Approach:**
```javascript
// Feature flag approach
const USE_MONGODB = process.env.USE_MONGODB === 'true';

async function getMemberPoints(username) {
  if (USE_MONGODB) {
    try {
      const member = await db.members.findOne({ username });
      return member.pointsAvailable;
    } catch (error) {
      console.error('MongoDB error, falling back to Sheets:', error);
      return await getPointsFromSheets(username);
    }
  } else {
    return await getPointsFromSheets(username);
  }
}
```

**Benefits:**
- ✅ Easy rollback (just set env var)
- ✅ Can test in production safely
- ✅ Gradual rollout possible

**Decision Needed:**
- ✅ Implement feature flag?
- ⚠️ Or deploy directly?

---

### 6. **Rollback Plan**

**Current Plan:**
- No explicit rollback plan mentioned
- Assumes everything will work

**Questions:**
1. **What if Phase 4 breaks critical functionality?**
   - Saturday auction is broken
   - Members can't see points
   - Attendance tracking fails

2. **How quickly can we rollback?**
   - Git revert?
   - Database state unchanged (MongoDB + Sheets both have data)
   - Feature flag flip?

3. **Do we need rollback testing?**
   - Test that turning MongoDB off works
   - Sheets fallback works correctly
   - No data loss during rollback

**Recommended Rollback Plan:**
```bash
# Emergency Rollback Steps

# Option 1: Feature Flag (fastest - 30 seconds)
# In Koyeb env vars: USE_MONGODB=false
# Bot auto-falls back to Sheets
# No code changes needed

# Option 2: Git Revert (medium - 5 minutes)
git revert <phase4-commit>
git push
# Koyeb auto-deploys old code

# Option 3: Full Rollback (slow - 15 minutes)
# Drop MongoDB collections
# Re-run migration scripts
# Restore from Sheets
```

**Decision Needed:**
- ✅ Implement feature flag for easy rollback?
- ⚠️ Or rely on git revert?

---

## 📋 Decisions Summary

Before starting Phase 4, we need to decide:

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Discord ID migration** | A) Gradual<br>B) One-time lookup<br>C) Hybrid | **A) Gradual** ✅ |
| 2 | **Sync timing** | A) Single 5s delay<br>B) Priority-based | **B) Priority-based** ✅ |
| 3 | **Error handling** | A) Circuit breaker + fallback<br>B) Fail fast | **A) Circuit breaker** ✅ |
| 4 | **Data consistency** | A) Auto-fix to MongoDB<br>B) Manual review | **A) Auto-fix** ✅ |
| 5 | **Testing approach** | A) Feature flag<br>B) Direct deploy | **A) Feature flag** ✅ |
| 6 | **Rollback method** | A) Feature flag<br>B) Git revert | **A) Feature flag** ✅ |

---

## 🎯 Recommended Additions to Plan

### 1. **Add Feature Flag System**
```javascript
// config.js or environment variable
const FEATURE_FLAGS = {
  USE_MONGODB_BIDDING: process.env.USE_MONGODB_BIDDING === 'true',
  USE_MONGODB_AUCTION: process.env.USE_MONGODB_AUCTION === 'true',
  USE_MONGODB_ATTENDANCE: process.env.USE_MONGODB_ATTENDANCE === 'true',
  MONGODB_FALLBACK_ENABLED: true, // Always allow fallback to Sheets
};
```

### 2. **Add Circuit Breaker Module**
```javascript
// utils/circuit-breaker.js
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailure = 0;
  }

  async execute(operation, fallback) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        return fallback();
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return fallback();
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.lastFailure = Date.now();
    }
  }
}
```

### 3. **Add Sync Verification**
```javascript
// services/sync-verifier.js
async function verifySyncIntegrity() {
  // Compare MongoDB vs Sheets every 5 minutes
  // Auto-fix discrepancies (MongoDB = source of truth)
  // Alert on major mismatches
}

setInterval(verifySyncIntegrity, 5 * 60 * 1000);
```

### 4. **Add Priority-Based Sync**
```javascript
// services/sheet-sync.js
const SYNC_PRIORITIES = {
  IMMEDIATE: 0,     // Auction results, point changes
  HIGH: 2000,       // Attendance
  NORMAL: 5000,     // Stats updates
  LOW: 30000        // Non-critical
};
```

---

## ✅ Action Items

Before starting implementation:

1. **Review decisions table above** - Confirm/adjust recommendations
2. **Clarify Discord ID migration strategy** - Gradual vs one-time
3. **Decide on feature flag approach** - Per-module or global?
4. **Define "source of truth" policy** - MongoDB or Sheets?
5. **Plan testing approach** - Production vs test server?
6. **Document rollback procedure** - Step-by-step guide

---

## 🚀 Next Steps

After review and decisions:

1. Update PHASE4_IMPLEMENTATION_PLAN.md with decisions
2. Create additional modules (circuit-breaker, sync-verifier)
3. Implement feature flag system
4. Begin helper modules creation
5. Start bidding.js refactor with feature flag
6. Test, verify, iterate

---

**Status**: Awaiting decisions on 6 key points
**Blocking**: Implementation cannot start until decisions made
**Timeline Impact**: Decisions shouldn't delay timeline if made promptly

---

**Questions for User:**

1. Do you agree with the recommended decisions (column 3 in table)?
2. Should we implement feature flags for safety?
3. Prefer gradual Discord ID migration or one-time lookup?
4. Any concerns about the plan not addressed here?

**Last Updated**: Nov 29, 2025
