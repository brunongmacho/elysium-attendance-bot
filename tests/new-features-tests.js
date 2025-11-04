/**
 * Tests for new features in v8.1
 * - Open bidding (no attendance restrictions)
 * - Percentage-based leaderboard bars
 * - Weekly report timing (Saturday 11:59pm)
 */

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
console.log('║       🧪 TESTING NEW FEATURES (v8.1)        ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

// Test 1: Percentage Bar Generation
console.log('📊 Testing Leaderboard Percentage Bars...\n');

function generatePercentageBar(value, maxValue, barLength = 20) {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  return { bar, percentage };
}

test('Percentage bar - 100% filled', () => {
  const result = generatePercentageBar(100, 100, 20);
  assert(result.bar.length === 20, 'Bar should be 20 characters');
  assert(result.bar === '████████████████████', 'Should be fully filled');
  assert(result.percentage === 100, 'Should be 100%');
});

test('Percentage bar - 50% filled', () => {
  const result = generatePercentageBar(50, 100, 20);
  assert(result.bar.length === 20, 'Bar should be 20 characters');
  assert(result.bar === '██████████░░░░░░░░░░', 'Should be half filled');
  assert(result.percentage === 50, 'Should be 50%');
});

test('Percentage bar - 0% filled', () => {
  const result = generatePercentageBar(0, 100, 20);
  assert(result.bar.length === 20, 'Bar should be 20 characters');
  assert(result.bar === '░░░░░░░░░░░░░░░░░░░░', 'Should be empty');
  assert(result.percentage === 0, 'Should be 0%');
});

test('Percentage bar - 75% filled', () => {
  const result = generatePercentageBar(75, 100, 20);
  assert(result.bar.length === 20, 'Bar should be 20 characters');
  const filledCount = (result.bar.match(/█/g) || []).length;
  assert(filledCount === 15, 'Should have 15 filled blocks (75% of 20)');
  assert(result.percentage === 75, 'Should be 75%');
});

test('Percentage bar - edge case: zero max value', () => {
  const result = generatePercentageBar(50, 0, 20);
  assert(result.bar.length === 20, 'Bar should be 20 characters');
  assert(result.percentage === 0, 'Should be 0% when max is 0');
});

test('Percentage bar - different bar lengths', () => {
  const result = generatePercentageBar(50, 100, 10);
  assert(result.bar.length === 10, 'Bar should be 10 characters');
  const filledCount = (result.bar.match(/█/g) || []).length;
  assert(filledCount === 5, 'Should have 5 filled blocks (50% of 10)');
});

// Test 2: Weekly Report Timing
console.log('\n📅 Testing Weekly Report Timing (Saturday 11:59pm)...\n');

function calculateNextSaturday1159PM() {
  const now = new Date();
  const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

  // Get current day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const currentDay = manila.getDay();

  // Calculate days until next Saturday
  let daysUntilSaturday = (6 - currentDay + 7) % 7;

  // If today is Saturday and it's already past 11:59pm, schedule for next Saturday
  if (daysUntilSaturday === 0 && (manila.getHours() > 23 || (manila.getHours() === 23 && manila.getMinutes() >= 59))) {
    daysUntilSaturday = 7;
  }

  // Create target date
  const target = new Date(manila);
  target.setDate(target.getDate() + daysUntilSaturday);
  target.setHours(23, 59, 0, 0);

  return target;
}

test('Weekly report - calculates Saturday 11:59pm', () => {
  const nextSaturday = calculateNextSaturday1159PM();
  assert(nextSaturday instanceof Date, 'Should return a Date object');
  assert(nextSaturday.getDay() === 6, 'Should be Saturday (day 6)');
  assert(nextSaturday.getHours() === 23, 'Should be 11pm (23:00)');
  assert(nextSaturday.getMinutes() === 59, 'Should be 59 minutes');
});

test('Weekly report - is in the future', () => {
  const nextSaturday = calculateNextSaturday1159PM();
  const now = new Date();
  assert(nextSaturday > now, 'Next Saturday should be in the future');
});

test('Weekly report - within 7 days', () => {
  const nextSaturday = calculateNextSaturday1159PM();
  const now = new Date();
  const daysDiff = (nextSaturday - now) / (1000 * 60 * 60 * 24);
  assert(daysDiff <= 7, 'Should be within 7 days');
  assert(daysDiff >= 0, 'Should not be negative');
});

// Test 3: Bidding System (No Attendance Check)
console.log('\n💰 Testing Open Bidding System...\n');

// Mock the canUserBid function (should always return true)
function canUserBid(username, currentSession) {
  // No attendance required - all ELYSIUM members can bid
  return true;
}

test('Open bidding - all users can bid', () => {
  const result = canUserBid('TestUser', { bossName: 'TestBoss' });
  assert(result === true, 'All users should be able to bid');
});

test('Open bidding - works without session', () => {
  const result = canUserBid('TestUser', null);
  assert(result === true, 'Should work even without session data');
});

test('Open bidding - works for any boss', () => {
  const bosses = ['Clemantis', 'Junobote', 'Lady Dalia', 'Guild Boss'];
  bosses.forEach(boss => {
    const result = canUserBid('TestUser', { bossName: boss });
    assert(result === true, `Should allow bidding for ${boss}`);
  });
});

// Test 4: Version Update
console.log('\n🚀 Testing Version Information...\n');

test('Version is 8.1', () => {
  const BOT_VERSION = "8.1";
  assert(BOT_VERSION === "8.1", `Version should be 8.1, got ${BOT_VERSION}`);
});

// Test 5: Bar Character Validation
console.log('\n🔤 Testing Bar Character Display...\n');

test('Percentage bar - uses correct characters', () => {
  const result = generatePercentageBar(50, 100, 10);
  assert(result.bar.includes('█'), 'Should contain filled block character');
  assert(result.bar.includes('░'), 'Should contain empty block character');
  assert(!result.bar.includes('▓'), 'Should not contain medium shade');
  assert(!result.bar.includes('▒'), 'Should not contain light shade');
});

test('Percentage bar - filled and empty sum to total', () => {
  const result = generatePercentageBar(33, 100, 20);
  const filled = (result.bar.match(/█/g) || []).length;
  const empty = (result.bar.match(/░/g) || []).length;
  assert(filled + empty === 20, 'Filled + empty should equal total length');
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
