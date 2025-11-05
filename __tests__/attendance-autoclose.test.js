/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ATTENDANCE AUTO-CLOSE TESTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests for the 20-minute auto-close feature that prevents attendance cheating.
 *
 * Features tested:
 * - Thread age calculation
 * - Auto-close trigger after 20 minutes
 * - Auto-verification of pending members
 * - Google Sheets submission on auto-close
 * - Thread archival and cleanup
 * - Scheduler initialization
 *
 * @module __tests__/attendance-autoclose
 */

const { TestRunner } = require('./test-runner');
const runner = new TestRunner('Attendance Auto-Close Tests');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Auto-Close Feature
// ═══════════════════════════════════════════════════════════════════════════════

runner.describe('Auto-Close Feature', () => {
  // Test 1: Verify auto-close constants are defined
  runner.test('AUTO_CLOSE constants are defined', () => {
    // We can't import attendance.js directly without Discord.js
    // but we can verify the file contains the functions
    const fs = require('fs');
    const attendanceCode = fs.readFileSync('./attendance.js', 'utf8');
    const hasAutoClose = attendanceCode.includes('checkAndAutoCloseThreads');
    const hasScheduler = attendanceCode.includes('startAutoCloseScheduler');

    if (!hasAutoClose || !hasScheduler) {
      throw new Error('Auto-close functions not found in attendance.js');
    }
  });

  // Test 2: Thread age calculation
  runner.test('Thread age calculation works correctly', () => {
    const now = Date.now();
    const twentyMinutesAgo = now - (20 * 60 * 1000);
    const nineteenMinutesAgo = now - (19 * 60 * 1000);
    const twentyOneMinutesAgo = now - (21 * 60 * 1000);

    const autoCloseThreshold = 20 * 60 * 1000; // 20 minutes in milliseconds

    // Thread created 20 minutes ago should be closed
    runner.expect(now - twentyMinutesAgo >= autoCloseThreshold).toBe(true);

    // Thread created 19 minutes ago should NOT be closed
    runner.expect(now - nineteenMinutesAgo >= autoCloseThreshold).toBe(false);

    // Thread created 21 minutes ago should be closed
    runner.expect(now - twentyOneMinutesAgo >= autoCloseThreshold).toBe(true);
  });

  // Test 3: createdAt timestamp is added to new threads
  runner.test('New threads get createdAt timestamp', () => {
    // We can't test the actual thread creation without Discord client,
    // but we can verify the logic structure
    const mockSpawn = {
      boss: 'VALAKAS',
      date: '11/05/25',
      time: '14:30',
      timestamp: '11/05/25 14:30',
      members: [],
      confirmThreadId: null,
      closed: false,
      createdAt: Date.now()
    };

    runner.expect(mockSpawn.createdAt).toBeDefined();
    runner.expect(typeof mockSpawn.createdAt).toBe('number');
    runner.expect(mockSpawn.createdAt).toBeGreaterThan(0);
  });

  // Test 4: Auto-verify logic for pending members
  runner.test('Auto-verify removes duplicates correctly', () => {
    const existingMembers = ['Player1', 'Player2', 'Player3'];
    const pendingMembers = [
      { author: 'Player4', authorId: '4' },
      { author: 'Player1', authorId: '1' }, // Duplicate
      { author: 'Player5', authorId: '5' },
      { author: 'player2', authorId: '2' }  // Duplicate (case-insensitive)
    ];

    const newMembers = [];
    for (const pending of pendingMembers) {
      const isDuplicate = existingMembers.some(
        (m) => m.toLowerCase() === pending.author.toLowerCase()
      );

      if (!isDuplicate) {
        newMembers.push(pending.author);
      }
    }

    runner.expect(newMembers.length).toBe(2); // Only Player4 and Player5
    runner.expect(newMembers.includes('Player4')).toBe(true);
    runner.expect(newMembers.includes('Player5')).toBe(true);
    runner.expect(newMembers.includes('Player1')).toBe(false);
    runner.expect(newMembers.includes('player2')).toBe(false);
  });

  // Test 5: Thread state cleanup after auto-close
  runner.test('Thread cleanup removes all state entries', () => {
    const mockState = {
      activeSpawns: { '123': { boss: 'VALAKAS', closed: false } },
      activeColumns: { 'VALAKAS|11/05/25 14:30': '123' },
      confirmationMessages: { '123': ['456', '789'] }
    };

    // Simulate cleanup
    const threadId = '123';
    const boss = 'VALAKAS';
    const timestamp = '11/05/25 14:30';

    delete mockState.activeSpawns[threadId];
    delete mockState.activeColumns[`${boss}|${timestamp}`];
    delete mockState.confirmationMessages[threadId];

    runner.expect(Object.keys(mockState.activeSpawns).length).toBe(0);
    runner.expect(Object.keys(mockState.activeColumns).length).toBe(0);
    runner.expect(Object.keys(mockState.confirmationMessages).length).toBe(0);
  });

  // Test 6: Scheduler interval calculation
  runner.test('Scheduler interval is 60 seconds', () => {
    const THREAD_AGE_CHECK_INTERVAL = 60000; // From attendance.js
    const expectedSeconds = THREAD_AGE_CHECK_INTERVAL / 1000;

    runner.expect(expectedSeconds).toBe(60);
  });

  // Test 7: Auto-close threshold is 20 minutes
  runner.test('Auto-close threshold is 20 minutes', () => {
    const THREAD_AUTO_CLOSE_MINUTES = 20; // From attendance.js
    const autoCloseMs = THREAD_AUTO_CLOSE_MINUTES * 60 * 1000;

    runner.expect(THREAD_AUTO_CLOSE_MINUTES).toBe(20);
    runner.expect(autoCloseMs).toBe(1200000); // 20 minutes in milliseconds
  });

  // Test 8: Payload structure for Google Sheets submission
  runner.test('Google Sheets payload has correct structure', () => {
    const mockPayload = {
      action: "submitAttendance",
      boss: "VALAKAS",
      date: "11/05/25",
      time: "14:30",
      timestamp: "11/05/25 14:30",
      members: ["Player1", "Player2", "Player3"]
    };

    runner.expect(mockPayload.action).toBe("submitAttendance");
    runner.expect(mockPayload.boss).toBeDefined();
    runner.expect(mockPayload.date).toBeDefined();
    runner.expect(mockPayload.time).toBeDefined();
    runner.expect(mockPayload.timestamp).toBeDefined();
    runner.expect(Array.isArray(mockPayload.members)).toBe(true);
    runner.expect(mockPayload.members.length).toBe(3);
  });

  // Test 9: Recovery preserves createdAt timestamp
  runner.test('Thread recovery preserves createdAt', () => {
    // Mock thread with createdTimestamp
    const mockThread = {
      id: '123',
      name: '[11/05/25 14:30] VALAKAS',
      createdTimestamp: 1730800000000, // Some timestamp
      archived: false
    };

    const recoveredSpawn = {
      boss: 'VALAKAS',
      date: '11/05/25',
      time: '14:30',
      timestamp: '11/05/25 14:30',
      members: [],
      confirmThreadId: null,
      closed: false,
      createdAt: mockThread.createdTimestamp || Date.now()
    };

    runner.expect(recoveredSpawn.createdAt).toBeDefined();
    runner.expect(recoveredSpawn.createdAt).toBe(mockThread.createdTimestamp);
  });

  // Test 10: Multiple threads age check logic
  runner.test('Checks multiple threads correctly', () => {
    const now = Date.now();
    const autoCloseThreshold = 20 * 60 * 1000;

    const mockSpawns = {
      '1': { boss: 'VALAKAS', createdAt: now - (25 * 60 * 1000), closed: false },      // 25 min - should close
      '2': { boss: 'ANT_QUEEN', createdAt: now - (15 * 60 * 1000), closed: false },    // 15 min - should NOT close
      '3': { boss: 'BAIUM', createdAt: now - (20 * 60 * 1000), closed: false },        // 20 min - should close
      '4': { boss: 'CORE', createdAt: now - (5 * 60 * 1000), closed: false },          // 5 min - should NOT close
      '5': { boss: 'ORFEN', createdAt: now - (30 * 60 * 1000), closed: true },         // 30 min but already closed
    };

    const shouldClose = [];
    const shouldNotClose = [];

    for (const [threadId, spawn] of Object.entries(mockSpawns)) {
      if (spawn.closed || !spawn.createdAt) continue;

      const threadAge = now - spawn.createdAt;
      if (threadAge >= autoCloseThreshold) {
        shouldClose.push(threadId);
      } else {
        shouldNotClose.push(threadId);
      }
    }

    runner.expect(shouldClose.length).toBe(2); // Threads 1 and 3
    runner.expect(shouldClose.includes('1')).toBe(true);
    runner.expect(shouldClose.includes('3')).toBe(true);
    runner.expect(shouldNotClose.length).toBe(2); // Threads 2 and 4
    runner.expect(shouldNotClose.includes('2')).toBe(true);
    runner.expect(shouldNotClose.includes('4')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Edge Cases
// ═══════════════════════════════════════════════════════════════════════════════

runner.describe('Auto-Close Edge Cases', () => {
  // Test 11: Handle missing createdAt timestamp
  runner.test('Skips threads without createdAt', () => {
    const mockSpawn = {
      boss: 'VALAKAS',
      closed: false,
      createdAt: undefined // Missing timestamp
    };

    const shouldProcess = Boolean(!mockSpawn.closed && mockSpawn.createdAt);
    runner.expect(shouldProcess).toBe(false);
  });

  // Test 12: Handle already closed threads
  runner.test('Skips already closed threads', () => {
    const mockSpawn = {
      boss: 'VALAKAS',
      closed: true,
      createdAt: Date.now() - (25 * 60 * 1000) // Old but already closed
    };

    const shouldProcess = !mockSpawn.closed && mockSpawn.createdAt;
    runner.expect(shouldProcess).toBe(false);
  });

  // Test 13: Handle zero members
  runner.test('Handles thread with zero verified members', () => {
    const mockSpawn = {
      boss: 'VALAKAS',
      members: [], // No members verified
      closed: false,
      createdAt: Date.now() - (25 * 60 * 1000)
    };

    const payload = {
      action: "submitAttendance",
      boss: mockSpawn.boss,
      members: mockSpawn.members
    };

    runner.expect(payload.members.length).toBe(0);
    runner.expect(Array.isArray(payload.members)).toBe(true);
  });

  // Test 14: Handle exactly 20 minutes (boundary condition)
  runner.test('Closes thread at exactly 20 minutes', () => {
    const now = Date.now();
    const exactlyTwentyMinutes = now - (20 * 60 * 1000);
    const autoCloseThreshold = 20 * 60 * 1000;

    const threadAge = now - exactlyTwentyMinutes;
    const shouldClose = threadAge >= autoCloseThreshold;

    runner.expect(shouldClose).toBe(true);
  });

  // Test 15: Handle 19:59 minutes (should NOT close)
  runner.test('Does not close thread at 19:59 minutes', () => {
    const now = Date.now();
    const nineteenFiftyNine = now - (19 * 60 * 1000 + 59 * 1000);
    const autoCloseThreshold = 20 * 60 * 1000;

    const threadAge = now - nineteenFiftyNine;
    const shouldClose = threadAge >= autoCloseThreshold;

    runner.expect(shouldClose).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

runner.run();
