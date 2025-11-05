/**
 * Test script to verify Saturday 8:30 PM GMT+8 calculation
 *
 * Usage: node tests/test-saturday-scheduler.js
 */

function calculateNextSaturday830PM() {
  const now = new Date();

  // GMT+8 offset in milliseconds
  const GMT8_OFFSET = 8 * 60 * 60 * 1000;

  // Get current time in GMT+8
  const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

  // Set to 8:30 PM today in GMT+8
  const targetGMT8 = new Date(nowGMT8);
  targetGMT8.setUTCHours(20, 30, 0, 0);

  // Get current day of week (0 = Sunday, 6 = Saturday)
  const currentDay = targetGMT8.getUTCDay();

  // Calculate days until next Saturday
  let daysUntilSaturday;
  if (currentDay === 6) {
    // Today is Saturday
    if (targetGMT8.getTime() > nowGMT8.getTime()) {
      // Haven't reached 8:30 PM yet today
      daysUntilSaturday = 0;
    } else {
      // Already past 8:30 PM, schedule for next Saturday
      daysUntilSaturday = 7;
    }
  } else {
    // Not Saturday, calculate days until next Saturday
    daysUntilSaturday = (6 - currentDay + 7) % 7;
    if (daysUntilSaturday === 0) daysUntilSaturday = 7;
  }

  // Add days to target date
  targetGMT8.setUTCDate(targetGMT8.getUTCDate() + daysUntilSaturday);

  // Convert back to UTC for the actual timer
  const targetUTC = new Date(targetGMT8.getTime() - GMT8_OFFSET);

  return targetUTC;
}

// Run test
console.log('🧪 Testing Saturday 8:30 PM GMT+8 Scheduler\n');

const now = new Date();
const GMT8_OFFSET = 8 * 60 * 60 * 1000;
const nowGMT8 = new Date(now.getTime() + GMT8_OFFSET);

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const currentDay = dayNames[nowGMT8.getUTCDay()];
const currentTime = nowGMT8.toISOString().replace('T', ' ').substring(0, 19);

console.log(`📅 Current Time: ${currentDay}, ${currentTime} GMT+8`);
console.log('');

const nextAuction = calculateNextSaturday830PM();
const nextAuctionGMT8 = new Date(nextAuction.getTime() + GMT8_OFFSET);
const nextDay = dayNames[nextAuctionGMT8.getUTCDay()];
const nextTime = nextAuctionGMT8.toISOString().replace('T', ' ').substring(0, 19);

const delay = nextAuction.getTime() - now.getTime();
const days = Math.floor(delay / 1000 / 60 / 60 / 24);
const hours = Math.floor((delay / 1000 / 60 / 60) % 24);
const minutes = Math.floor((delay / 1000 / 60) % 60);
const seconds = Math.floor((delay / 1000) % 60);

console.log(`🎯 Next Auction: ${nextDay}, ${nextTime} GMT+8`);
console.log(`⏰ Time Until Next Auction: ${days}d ${hours}h ${minutes}m ${seconds}s`);
console.log('');

// Verify it's a Saturday
if (nextAuctionGMT8.getUTCDay() !== 6) {
  console.error('❌ ERROR: Next auction is not on Saturday!');
  process.exit(1);
}

// Verify it's at 8:30 PM
const hour = nextAuctionGMT8.getUTCHours();
const minute = nextAuctionGMT8.getUTCMinutes();
if (hour !== 20 || minute !== 30) {
  console.error(`❌ ERROR: Next auction is not at 8:30 PM (got ${hour}:${minute})`);
  process.exit(1);
}

// Verify it's in the future
if (nextAuction.getTime() <= now.getTime()) {
  console.error('❌ ERROR: Next auction is in the past!');
  process.exit(1);
}

console.log('✅ All checks passed!');
console.log('✅ Scheduler will correctly trigger on Saturday at 8:30 PM GMT+8');
