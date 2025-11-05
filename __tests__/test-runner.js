/**
 * Simple Test Runner - No Dependencies Required
 *
 * This runner provides immediate testing without requiring Jest installation.
 * Run with: node __tests__/test-runner.js
 */

const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  describe(name, fn) {
    console.log(`\n📦 ${name}`);
    fn();
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
          throw new Error(`Expected ${expected} but got ${value}`);
        }
      },
      toBeDefined() {
        if (value === undefined) {
          throw new Error(`Expected value to be defined`);
        }
      },
      toBeInstanceOf(type) {
        if (!(value instanceof type)) {
          throw new Error(`Expected instance of ${type.name}`);
        }
      },
      toHaveProperty(prop) {
        if (!(prop in value)) {
          throw new Error(`Expected object to have property '${prop}'`);
        }
      },
      toBeGreaterThan(expected) {
        if (value <= expected) {
          throw new Error(`Expected ${value} to be greater than ${expected}`);
        }
      },
      toThrow() {
        let threw = false;
        try {
          value();
        } catch (e) {
          threw = true;
        }
        if (!threw) {
          throw new Error(`Expected function to throw`);
        }
      }
    };
  }

  run() {
    this.printResults();
  }

  async runSyntaxTests() {
    const { execSync } = require('child_process');

    console.log('\n🔍 Running Syntax Validation Tests...\n');

    const jsFiles = [
      'index2.js',
      'bidding.js',
      'auctioneering.js',
      'attendance.js',
      'loot-system.js',
      'emergency-commands.js',
      'help-system.js',
      'leaderboard-system.js'
    ];

    for (const file of jsFiles) {
      try {
        execSync(`node --check ${file}`, { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
        this.passed++;
        console.log(`  ✅ ${file} - Valid syntax`);
      } catch (error) {
        this.failed++;
        this.errors.push({ test: file, error: 'Syntax error' });
        console.log(`  ❌ ${file} - Syntax error`);
      }
    }
  }

  async runModuleTests() {
    console.log('\n🔍 Running Module Import Tests...\n');

    const modules = [
      './utils/common.js',
      './utils/error-handler.js',
      './utils/timestamp-cache.js',
      './utils/points-cache.js',
      './utils/sheet-api.js',
      './utils/discord-cache.js'
    ];

    for (const mod of modules) {
      try {
        const required = require(path.join(__dirname, '..', mod));
        this.passed++;
        console.log(`  ✅ ${mod} - Loaded successfully`);
      } catch (error) {
        this.failed++;
        this.errors.push({ test: mod, error: error.message });
        console.log(`  ❌ ${mod} - Failed to load`);
        console.log(`     ${error.message}`);
      }
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Test Results:`);
    console.log(`   ✅ Passed: ${this.passed}`);
    console.log(`   ❌ Failed: ${this.failed}`);
    console.log(`   📈 Total:  ${this.passed + this.failed}`);

    if (this.failed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n❌ Some tests failed. See errors above.');
    }
    console.log('\n' + '='.repeat(60) + '\n');

    return this.failed === 0;
  }
}

// Export for use in test files
module.exports = { TestRunner };

// Run tests if executed directly
if (require.main === module) {
  (async () => {
    const runner = new TestRunner();

    await runner.runSyntaxTests();
    await runner.runModuleTests();

    const success = runner.printResults();
    process.exit(success ? 0 : 1);
  })();
}
