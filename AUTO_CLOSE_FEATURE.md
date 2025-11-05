# 20-Minute Auto-Close Feature

## Overview

The bot now automatically closes boss attendance threads after **20 minutes** to prevent attendance cheating. This ensures that only members present during the actual boss spawn can mark their attendance.

## How It Works

### 1. Thread Creation
- When a boss thread is created, it includes a `createdAt` timestamp
- The thread embed displays: **"⏰ Auto-closes in 20 minutes to prevent cheating"**
- Members have 20 minutes to check in with their attendance

### 2. Auto-Close Process (After 20 Minutes)

The bot performs the following automatically:

1. **Auto-Verifies All Pending Members**
   - All pending check-ins are automatically approved
   - Duplicates are still filtered out
   - No admin approval needed

2. **Submits to Google Sheets**
   - Attendance data sent to current week's sheet
   - Same format as manual submission

3. **Archives the Thread**
   - Thread is marked as archived
   - No new check-ins accepted

4. **Cleans Up State**
   - Removes thread from active spawns
   - Cleans up confirmation messages
   - Deletes confirmation thread

5. **Notifies Members**
   - Posts auto-close notification in thread
   - Shows number of members verified
   - Confirms Google Sheets submission

### 3. Admin Override

Admins can still close threads early using:
- `close` command (with confirmation)
- `!forceclose` command (no confirmation)

## Benefits

### Prevents Cheating
- Members cannot mark attendance hours after the boss spawn
- 20-minute window is reasonable for legitimate attendance
- Maintains fairness in the attendance system

### Reduces Admin Workload
- No need to manually close old threads
- Auto-verification after timeout
- Automatic cleanup of stale threads

### Maintains Data Integrity
- All attendance properly recorded in Google Sheets
- State cleanup prevents memory leaks
- Recovery system preserves timestamps

## Technical Implementation

### Components

1. **Timestamp Tracking**
   - `createdAt` field added to `activeSpawns`
   - Uses `Date.now()` for new threads
   - Preserves `thread.createdTimestamp` on recovery

2. **Scheduler**
   - Checks thread age every 60 seconds
   - Identifies threads older than 20 minutes
   - Processes closures one at a time

3. **Auto-Verification**
   - Iterates through pending verifications
   - Filters out duplicates (case-insensitive)
   - Adds members to spawn's member list

4. **State Management**
   - Syncs with attendance module state
   - Updates Google Sheets for crash recovery
   - Cleanup on successful submission

### Files Modified

- `attendance.js` - Auto-close logic, scheduler, constants
- `index2.js` - Scheduler initialization
- `__tests__/attendance-autoclose.test.js` - 15 comprehensive tests
- `__tests__/integration-tests.js` - 6 integration tests

### Constants

```javascript
THREAD_AUTO_CLOSE_MINUTES: 20      // Close after 20 minutes
THREAD_AGE_CHECK_INTERVAL: 60000   // Check every 60 seconds (1 minute)
```

## Testing

### Automated Tests (21 total)

**Unit Tests (15):**
- Thread age calculation
- createdAt timestamp tracking
- Auto-verify duplicate filtering
- State cleanup verification
- Scheduler interval validation
- Payload structure verification
- Recovery timestamp preservation
- Multiple thread age checking
- Edge cases (missing timestamps, already closed, zero members)
- Boundary conditions (exactly 20 min, 19:59)

**Integration Tests (6):**
- Scheduler export verification
- Constants definition check
- Timestamp tracking validation
- Scheduler initialization check
- Embed message verification
- Test file existence

### Manual Testing

See T1.6 in `MANUAL_TESTING_GUIDE.md` for manual testing steps.

## Performance Impact

### Memory
- Minimal impact (~100 bytes per thread for timestamp)
- State cleanup prevents memory leaks
- Bounded data structures maintained

### CPU
- Scheduler runs every 60 seconds
- O(n) complexity where n = active threads
- Typically < 10 active threads at a time
- Processing time: ~10ms per check cycle

### Network
- Google Sheets API call on auto-close (same as manual)
- Rate limiting respected (2000ms minimum delay)
- Retry logic for failed submissions

## Error Handling

### Failed Submissions
- Thread remains in state for admin retry
- Error message posted to thread
- Member list displayed for manual entry

### Missing Thread
- State cleaned up automatically
- Logged for monitoring
- No crash or data loss

### Discord API Failures
- Retry logic for archival operations
- Graceful degradation
- Error logging for debugging

## Configuration

No configuration changes needed. The 20-minute timeout is hardcoded in `attendance.js` under `TIMING.THREAD_AUTO_CLOSE_MINUTES`.

To change the timeout (not recommended):
1. Edit `attendance.js` line 100
2. Update embed message line 413
3. Update tests in `__tests__/attendance-autoclose.test.js`
4. Commit and redeploy

## Monitoring

Check bot logs for:
```
⏰ AUTO-CLOSING thread: VALAKAS (11/05/25 14:30)
   Thread age: 20 minutes
   ✅ Auto-verifying 3 pending member(s)
      ├─ ✅ Player1
      ├─ ✅ Player2
      ├─ ✅ Player3
   ✅ Submitted 5 members to Google Sheets
   ✅ Auto-close complete: VALAKAS
```

## Future Enhancements

Potential improvements (not currently planned):
- Configurable timeout per boss type
- Warning message at 15 minutes
- Admin notification before auto-close
- Statistics dashboard for auto-closed threads
- Discord modal for timeout configuration
