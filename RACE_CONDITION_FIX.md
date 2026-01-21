# Race Condition Fix: Thread Creation Mutex

## Problem

The bot was experiencing a race condition error:
```
❌ Failed to handle spawned for Venatus: Error: Failed to create thread for Venatus: Thread creation already in progress for Venatus
```

This occurred when multiple sources (boss timer and external bot) simultaneously attempted to create a thread for the same boss, causing a collision in the mutex lock.

## Root Cause

The original `createSpawnThreads` function had a mutex to prevent concurrent thread creation:
- When a concurrent creation was detected, it would immediately **reject** the request with an error
- If multiple requests came in simultaneously, the second request would fail instead of waiting for the first to complete
- Both the timer system and external bot could trigger creation simultaneously, causing race conditions

## Solution Implemented

### 1. **Promise-Based Mutex with Waiting** (`attendance.js`)

Added a promise-based mechanism to allow concurrent callers to wait for the original creation:

```javascript
// Track creation promises so concurrent callers can wait
let creationPromises = new Map();

// In createSpawnThreads:
if (pendingCreations.has(creationKey)) {
  // ... existing creation is in progress
  const existingResult = await creationPromises.get(creationKey);
  if (existingResult && existingResult.success) {
    console.log(`✅ Returning existing thread from concurrent creation`);
    return existingResult; // Return the same result to concurrent caller
  }
}
```

### 2. **Wrapped Creation in IIFE**

The entire thread creation logic is now wrapped in an async IIFE that:
- Sets the mutex lock
- Executes the creation
- Stores the promise for concurrent callers to await
- Always clears the mutex in a finally block

### 3. **Graceful Concurrent Request Handling**

Now when multiple requests come in for the same boss:
1. **First request**: Sets mutex lock, begins creation
2. **Concurrent requests**: Wait for first request's promise
3. **All receive**: The same successfully created thread
4. **On error**: Failed creation is also shared, preventing repeated failures

## Benefits

✅ **No More Duplicate Errors**: Concurrent requests now cooperate instead of conflicting
✅ **Single Thread Creation**: Only one thread is actually created, even with multiple requests
✅ **Graceful Degradation**: If creation fails, all waiters get the same error
✅ **Timeout Safety**: 60-second timeout clears stale mutexes if bot crashes during creation
✅ **Better Logging**: Clear visibility into concurrent creations with source tracking

## Log Examples

### Before Fix
```
⏳ BLOCKED CONCURRENT CREATION: Venatus - creation already in progress
❌ Failed to handle spawned for Venatus: Error: Thread creation already in progress
```

### After Fix
```
🔒 MUTEX SET: Starting thread creation for Venatus at 01/21/26 12:34 (source: boss_timer)
⏳ CONCURRENT CREATION DETECTED: Venatus - waiting for existing creation
✅ Returning existing thread from concurrent creation: 123456789
🔓 MUTEX CLEARED: Finished thread creation for Venatus
```

## Testing Recommendations

1. Trigger `!spawned Venatus` from both timer and manual command simultaneously
2. Verify only one thread is created
3. Verify both callers receive successful results
4. Check logs for waiting messages and proper cleanup

## Files Modified

- [attendance.js](attendance.js#L111) - Added `creationPromises` tracking
- [attendance.js](attendance.js#L451-L485) - Updated mutex logic to wait for concurrent creations
- [attendance.js](attendance.js#L488-L723) - Wrapped creation in IIFE with promise tracking
