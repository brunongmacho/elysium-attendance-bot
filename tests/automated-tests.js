/**
 * Automated tests for bot functionality
 * Run with: node tests/automated-tests.js
 */

const timeUtils = require('../utils/time-utils');

// Simple emoji constants (don't require discord.js)
const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
};

let passedTests = 0;
let failedTests = 0;
const errors = [];

function test(name, testFn) {
  try {
    testFn();
    console.log(`${EMOJI.SUCCESS} ${name}`);
    passedTests++;
  } catch (err) {
    console.log(`${EMOJI.ERROR} ${name}: ${err.message}`);
    failedTests++;
    errors.push({ test: name, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║          🧪 RUNNING AUTOMATED TESTS          ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

// Time Utils Tests
console.log('⏰ Testing Time Utils...\n');

test('formatUptime - seconds only', () => {
  const result = timeUtils.formatUptime(5000);
  assert(result === '5s', `Expected '5s', got '${result}'`);
});

test('formatUptime - minutes', () => {
  const result = timeUtils.formatUptime(125000);
  assert(result === '2m 5s', `Expected '2m 5s', got '${result}'`);
});

test('formatUptime - hours', () => {
  const result = timeUtils.formatUptime(3725000);
  assert(result === '1h 2m', `Expected '1h 2m', got '${result}'`);
});

test('formatUptime - days', () => {
  const result = timeUtils.formatUptime(90000000);
  assert(result.includes('d'), `Expected days format, got '${result}'`);
});

test('getTimestamp - format', () => {
  const result = timeUtils.getTimestamp();
  assert(/\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}/.test(result), `Invalid timestamp format: ${result}`);
});

test('normalizeTimestamp - zero padding', () => {
  const result = timeUtils.normalizeTimestamp('1/5/25 9:05');
  assert(result === '01/05/25 09:05', `Expected '01/05/25 09:05', got '${result}'`);
});

test('normalizeTimestamp - already normalized', () => {
  const result = timeUtils.normalizeTimestamp('01/15/25 09:30');
  assert(result === '01/15/25 09:30', `Expected '01/15/25 09:30', got '${result}'`);
});

test('parseTimestamp - valid format', () => {
  const result = timeUtils.parseTimestamp('01/15/25 14:30');
  assert(result instanceof Date, 'Should return Date object');
  assert(result.getMonth() === 0, 'Should be January (month 0)');
  assert(result.getDate() === 15, 'Should be 15th day');
});

test('isWithinTimeWindow - within window', () => {
  const now = new Date().toISOString();
  const result = timeUtils.isWithinTimeWindow(now, 60000); // 1 minute window
  assert(result === true, 'Should be within window');
});

test('isWithinTimeWindow - outside window', () => {
  const old = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  const result = timeUtils.isWithinTimeWindow(old, 60000); // 1 minute window
  assert(result === false, 'Should be outside window');
});

// Discord Utils Tests (mock discord.js objects)
console.log('\n🔧 Testing Discord Utils...\n');

const discordUtils = {
  isThread: (channel) => channel && (channel.type === 11 || channel.type === 12),
  getParentChannel: (channel) => {
    if (channel && (channel.type === 11 || channel.type === 12) && channel.parent) {
      return channel.parent;
    }
    return channel;
  },
};

test('isThread - public thread', () => {
  const channel = { type: 11 };
  const result = discordUtils.isThread(channel);
  assert(result === true, 'Type 11 should be a thread');
});

test('isThread - private thread', () => {
  const channel = { type: 12 };
  const result = discordUtils.isThread(channel);
  assert(result === true, 'Type 12 should be a thread');
});

test('isThread - text channel', () => {
  const channel = { type: 0 };
  const result = discordUtils.isThread(channel);
  assert(result === false, 'Type 0 should not be a thread');
});

test('getParentChannel - from thread', () => {
  const parent = { id: 'parent123', type: 0 };
  const thread = { id: 'thread123', type: 11, parent };
  const result = discordUtils.getParentChannel(thread);
  assert(result.id === 'parent123', 'Should return parent channel');
});

test('getParentChannel - already parent', () => {
  const channel = { id: 'channel123', type: 0 };
  const result = discordUtils.getParentChannel(channel);
  assert(result.id === 'channel123', 'Should return same channel');
});

// Edge Cases
console.log('\n⚠️  Testing Edge Cases...\n');

test('normalizeTimestamp - empty string', () => {
  const result = timeUtils.normalizeTimestamp('');
  assert(result === '', 'Should handle empty string');
});

test('normalizeTimestamp - null', () => {
  const result = timeUtils.normalizeTimestamp(null);
  assert(result === '', 'Should handle null');
});

test('parseTimestamp - invalid format', () => {
  const result = timeUtils.parseTimestamp('invalid');
  assert(result !== null, 'Should attempt to parse even invalid formats');
});

test('formatUptime - zero', () => {
  const result = timeUtils.formatUptime(0);
  assert(result === '0s', 'Should handle zero uptime');
});

test('formatUptime - negative (edge case)', () => {
  const result = timeUtils.formatUptime(-1000);
  assert(result !== undefined, 'Should handle negative values without crashing');
});

// Performance Tests
console.log('\n⚡ Testing Performance...\n');

test('normalizeTimestamp - performance (1000 iterations)', () => {
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    timeUtils.normalizeTimestamp('1/15/25 9:30');
  }
  const elapsed = Date.now() - start;
  assert(elapsed < 100, `Should complete in < 100ms, took ${elapsed}ms`);
});

test('parseTimestamp - performance (1000 iterations)', () => {
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    timeUtils.parseTimestamp('01/15/25 14:30');
  }
  const elapsed = Date.now() - start;
  assert(elapsed < 200, `Should complete in < 200ms, took ${elapsed}ms`);
});

// Print Results
console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║                  TEST RESULTS                 ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

console.log(`${EMOJI.SUCCESS} Passed: ${passedTests}`);
console.log(`${EMOJI.ERROR} Failed: ${failedTests}`);
console.log(`📊 Total: ${passedTests + failedTests}`);
console.log(`✅ Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(2)}%\n`);

if (errors.length > 0) {
  console.log('❌ Failed Tests:\n');
  errors.forEach((err, i) => {
    console.log(`${i + 1}. ${err.test}`);
    console.log(`   Error: ${err.error}\n`);
  });
}

// Exit with error code if tests failed
process.exit(failedTests > 0 ? 1 : 0);
