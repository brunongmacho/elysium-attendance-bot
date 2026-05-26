# MongoDB Performance Optimization - Indexes Setup

This guide will help you create indexes in your MongoDB database to significantly improve query performance.

## Why Indexes Matter

Without indexes, MongoDB must scan every document in a collection to find matches. With indexes, MongoDB can quickly locate the exact documents needed.

**Expected Impact:**
- Query times: 100-1000x faster
- Dashboard load time: 2-5 seconds → 0.5-1 second
- Reduced database load and costs

## Prerequisites

- Access to MongoDB Atlas dashboard OR
- MongoDB Shell (`mongosh`) installed

## Option 1: MongoDB Atlas UI (Easiest)

1. **Log into MongoDB Atlas**
   - Go to https://cloud.mongodb.com
   - Select your cluster

2. **Navigate to Indexes**
   - Click "Browse Collections"
   - Select your database: `elysium-bot`

3. **Create Indexes for Each Collection**

### Collection: `attendance`

Click "Create Index" and add these indexes one by one:

```javascript
// Index 1: Boss name lookups (used for last kill time)
{ "bossName": 1, "timestamp": -1 }

// Index 2: Member attendance queries
{ "memberId": 1, "timestamp": -1 }

// Index 3: Date range queries for leaderboards
{ "timestamp": -1 }
```

### Collection: `members`

```javascript
// Index 1: Username lookups (already exists as _id, skip this)
// MongoDB automatically indexes _id field

// Index 2: Points sorting
{ "pointsAvailable": -1 }

// Index 3: Username search (text index)
{ "username": "text" }
```

### Collection: `bossTimers`

```javascript
// Index 1: Boss name lookups (unique)
{ "bossName": 1 }
// Mark as UNIQUE: Yes
```

## Option 2: MongoDB Shell / Code (Advanced)

If you have `mongosh` or want to run this programmatically:

```javascript
// Connect to your database
use elysium-bot

// Create indexes for attendance collection
db.attendance.createIndex({ "bossName": 1, "timestamp": -1 })
db.attendance.createIndex({ "memberId": 1, "timestamp": -1 })
db.attendance.createIndex({ "timestamp": -1 })

// Create indexes for members collection
db.members.createIndex({ "pointsAvailable": -1 })
db.members.createIndex({ "username": "text" })

// Create indexes for bossTimers collection
db.bossTimers.createIndex({ "bossName": 1 }, { unique: true })

// Verify indexes were created
db.attendance.getIndexes()
db.members.getIndexes()
db.bossTimers.getIndexes()
```

## Option 3: Node.js Migration Script

Save this as `scripts/create-indexes.js`:

```javascript
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function createIndexes() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(process.env.MONGODB_DB_NAME || 'elysium-bot');

    // Attendance collection indexes
    console.log('Creating attendance indexes...');
    await db.collection('attendance').createIndex({ bossName: 1, timestamp: -1 });
    await db.collection('attendance').createIndex({ memberId: 1, timestamp: -1 });
    await db.collection('attendance').createIndex({ timestamp: -1 });
    console.log('✓ Attendance indexes created');

    // Members collection indexes
    console.log('Creating members indexes...');
    await db.collection('members').createIndex({ pointsAvailable: -1 });
    await db.collection('members').createIndex({ username: 'text' });
    console.log('✓ Members indexes created');

    // Boss timers collection indexes
    console.log('Creating bossTimers indexes...');
    await db.collection('bossTimers').createIndex({ bossName: 1 }, { unique: true });
    console.log('✓ Boss timers indexes created');

    console.log('\n✅ All indexes created successfully!');

    // Show all indexes
    console.log('\nAttendance indexes:', await db.collection('attendance').indexes());
    console.log('\nMembers indexes:', await db.collection('members').indexes());
    console.log('\nBoss timers indexes:', await db.collection('bossTimers').indexes());

  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await client.close();
  }
}

createIndexes();
```

**Run it:**
```bash
node scripts/create-indexes.js
```

## Verify Performance Improvement

### Before Indexes:
```bash
# Check query execution time in Atlas
# Performance Advisor will show "Missing Index" warnings
```

### After Indexes:
1. Go to MongoDB Atlas → Performance Advisor
2. Should see "No recommendations" (all queries are optimized)
3. Check dashboard load time - should be significantly faster

## Monitoring

**MongoDB Atlas:**
- Performance Advisor → Shows slow queries and missing indexes
- Metrics → Query performance graphs

**Dashboard:**
- Check "Last updated" timestamp response time
- Boss timers should load almost instantly
- Leaderboard should load in < 500ms

## Maintenance

**Do you need to recreate indexes?**
- No - indexes persist unless manually deleted
- They automatically update when documents are added/modified

**When to add new indexes?**
- When you add new query patterns
- If Performance Advisor suggests them
- If specific queries are slow

## Index Sizes (Reference)

Approximate index sizes for 100 members, 1000 boss kills:
- `attendance` indexes: ~500 KB
- `members` indexes: ~50 KB
- `bossTimers` indexes: ~10 KB
- **Total**: < 1 MB (negligible storage impact)

## Troubleshooting

**Error: "Index already exists"**
- Safe to ignore - means index was already created

**Error: "Duplicate key error"**
- For bossTimers unique index: Check if you have duplicate boss names
- Run: `db.bossTimers.aggregate([{$group: {_id: "$bossName", count: {$sum: 1}}}, {$match: {count: {$gt: 1}}}])`
- Remove duplicates before creating unique index

**Indexes not improving performance?**
- Wait 5-10 minutes for MongoDB to start using them
- Clear your browser cache
- Redeploy Vercel application

## Expected Results

**Before Optimization:**
- Boss timers API: 2-5 seconds
- Leaderboard API: 3-8 seconds
- Total page load: 5-10 seconds

**After Optimization:**
- Boss timers API: 200-500ms
- Leaderboard API: 300-800ms
- Total page load: 0.5-1.5 seconds
- Cached requests: < 100ms

**That's a 10-20x speed improvement!** 🚀
