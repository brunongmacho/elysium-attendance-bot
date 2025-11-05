/**
 * Tests for modules/bidding/utilities.js
 *
 * Run with: node __tests__/modules/bidding-utilities.test.js
 */

const path = require('path');
const { formatDuration, normalizeUsername } = require('../../modules/bidding/utilities');

// Simple test framework
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(name, fn) {
    try {
      fn();
      this.passed++;
      console.log(`  ✅ ${name}`);
    } catch (error) {
      this.failed++;
      this.errors.push({ test: name, error: error.message });
      console.log(`  ❌ ${name}`);
      console.log(`     ${error.message}`);
    }
  }

  expect(value) {
    return {
      toBe(expected) {
        if (value !== expected) {
          throw new Error(`Expected "${expected}" but got "${value}"`);
        }
      },
      toBeDefined() {
        if (value === undefined) {
          throw new Error(`Expected value to be defined`);
        }
      },
    };
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log(`📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    if (this.failed === 0) {
      console.log('🎉 All tests passed!');
    }
    console.log('='.repeat(60) + '\n');
    return this.failed === 0;
  }
}

// Run tests
const runner = new TestRunner();

console.log('\n📦 Testing modules/bidding/utilities.js\n');

// Test formatDuration
console.log('🔍 Testing formatDuration():');
runner.test('formats duration under 60 minutes', () => {
  runner.expect(formatDuration(45)).toBe('45min');
});

runner.test('formats duration at exactly 60 minutes', () => {
  runner.expect(formatDuration(60)).toBe('1h');
});

runner.test('formats duration over 60 minutes with remainder', () => {
  runner.expect(formatDuration(90)).toBe('1h 30min');
});

runner.test('formats duration at exactly 120 minutes', () => {
  runner.expect(formatDuration(120)).toBe('2h');
});

runner.test('formats large duration', () => {
  runner.expect(formatDuration(185)).toBe('3h 5min');
});

runner.test('formats single minute', () => {
  runner.expect(formatDuration(1)).toBe('1min');
});

runner.test('formats zero minutes', () => {
  runner.expect(formatDuration(0)).toBe('0min');
});

// Test normalizeUsername
console.log('\n🔍 Testing normalizeUsername():');
runner.test('removes discriminator from username', () => {
  runner.expect(normalizeUsername('Player#1234')).toBe('player');
});

runner.test('handles username without discriminator', () => {
  runner.expect(normalizeUsername('Player')).toBe('player');
});

runner.test('converts to lowercase', () => {
  runner.expect(normalizeUsername('PLAYER')).toBe('player');
});

runner.test('handles mixed case', () => {
  runner.expect(normalizeUsername('PlAyEr#5678')).toBe('player');
});

runner.test('trims whitespace', () => {
  runner.expect(normalizeUsername('  Player  ')).toBe('player');
});

runner.test('handles empty string', () => {
  runner.expect(normalizeUsername('')).toBe('');
});

runner.test('handles null/undefined gracefully', () => {
  runner.expect(normalizeUsername(null)).toBe('');
  runner.expect(normalizeUsername(undefined)).toBe('');
});

runner.test('handles complex usernames', () => {
  runner.expect(normalizeUsername('Cool_Player123#9999')).toBe('cool_player123');
});

// Module import test
console.log('\n🔍 Testing module structure:');
runner.test('exports formatDuration function', () => {
  runner.expect(typeof formatDuration).toBe('function');
});

runner.test('exports normalizeUsername function', () => {
  runner.expect(typeof normalizeUsername).toBe('function');
});

// Print results
const success = runner.printResults();
process.exit(success ? 0 : 1);
