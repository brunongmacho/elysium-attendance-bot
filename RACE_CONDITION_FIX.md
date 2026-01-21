# Race Condition Fix: Thread Creation Mutex

## Problem

The bot was experiencing race condition errors in two scenarios:

### Scenario 1: Thread Creation Level
```
❌ Failed to handle spawned for Venatus: Error: Failed to create thread for Venatus: Thread creation already in progress for Venatus
```
When multiple sources (boss timer and external bot) simultaneously created threads.

### Scenario 2: Command Handler Level  
When 2 users used the `/spawned` command at the same time, both calls would pass through the cache check before either added the result, causing duplicate thread creation attempts.

## Root Causes

### Thread Creation Level
The original mutex prevented concurrent thread creation but rejected the second request instead of waiting for the first.

### Command Handler Level
The `recentlyHandledBosses` cache only checked if a boss was already handled, but didn't prevent the race condition where two concurrent calls arrive before either adds the result to cache.

## Solution Implemented

### 1. **Thread Creation Level** (`attendance.js`)
- Added promise-based mutex that allows concurrent callers to wait
- Tracks creation promises so waiters can await the original creation
- First request creates, subsequent requests wait and receive same result

### 2. **Command Handler Level** (`boss-timer.js`)
- Added "pending" state to `recentlyHandledBosses` cache
- Mark boss as pending BEFORE starting creation
- Concurrent callers detect pending state and wait for handler promise
- Only one handler actually executes; others receive its result

## Benefits

✅ **No More Duplicate Errors**: Both command and thread creation now handle concurrency properly
✅ **Single Thread Creation**: Only one thread is actually created, even with multiple concurrent requests
✅ **Cooperative Concurrency**: Second caller waits for first, then both receive same result
✅ **Clear Logging**: Visibility into pending states and handler waiting
✅ **Timeout Safety**: 60-second timeout at thread creation level clears stale mutexes

## Log Examples

### Before Fix (Command Level)
```
User 1: /spawned Venatus
User 2: /spawned Venatus
❌ Thread creation already in progress
```

### After Fix (Command Level)
```
User 1: /spawned Venatus
  🔒 Marked Venatus handler as pending
User 2: /spawned Venatus (concurrent)
  ⏳ Venatus handler already in progress - waiting for result
  ✅ Returning result from concurrent handler for Venatus
  🔓 Handler resolved for both users
```

### After Fix (Thread Creation Level)
```
🔒 MUTEX SET: Starting thread creation for Venatus
⏳ CONCURRENT CREATION DETECTED: waiting for existing creation
✅ Returning existing thread from concurrent creation
🔓 MUTEX CLEARED
```

## Files Modified

- [attendance.js](attendance.js#L111) - Added `creationPromises` tracking
- [attendance.js](attendance.js#L451-L485) - Updated mutex logic for concurrent waiting
- [attendance.js](attendance.js#L488-L723) - Wrapped creation in IIFE with promise tracking
- [boss-timer.js](boss-timer.js#L1392-L1473) - Added handler-level concurrency control

## Testing Recommendations

1. **Thread Creation**: Trigger `!spawned Venatus` from both timer and manual command simultaneously
2. **Command Handler**: Have 2 users use `/spawned Venatus` at the exact same time
3. **Verify**: Only one thread should be created, all callers receive success
4. **Check logs**: Should see "pending", "waiting", and "resolved" messages
