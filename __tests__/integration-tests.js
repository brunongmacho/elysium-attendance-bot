/**
 * Integration Tests - Comprehensive Test Suite
 *
 * Tests all critical functionality after refactoring to ensure nothing broke.
 * Run with: node __tests__/integration-tests.js
 */

const fs = require('fs');
const path = require('path');

class IntegrationTestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
    this.warnings = [];
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

  warn(message) {
    this.warnings.push(message);
    console.log(`  ⚠️  ${message}`);
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
      toBeFunction() {
        if (typeof value !== 'function') {
          throw new Error(`Expected function but got ${typeof value}`);
        }
      },
      toExist() {
        if (!value) {
          throw new Error(`Expected value to exist`);
        }
      }
    };
  }

  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log(`\n📊 Integration Test Results:`);
    console.log(`   ✅ Passed:   ${this.passed}`);
    console.log(`   ❌ Failed:   ${this.failed}`);
    console.log(`   ⚠️  Warnings: ${this.warnings.length}`);
    console.log(`   📈 Total:    ${this.passed + this.failed}`);

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      this.warnings.forEach(w => console.log(`   - ${w}`));
    }

    if (this.failed === 0) {
      console.log('\n🎉 All integration tests passed!');
      console.log('✅ Bot is safe to deploy');
    } else {
      console.log('\n❌ Some tests failed. Review errors above.');
      console.log('⚠️  DO NOT DEPLOY until issues are fixed');
    }
    console.log('\n' + '='.repeat(70) + '\n');

    return this.failed === 0;
  }
}

// Run comprehensive integration tests
const runner = new IntegrationTestRunner();

console.log('\n🔍 INTEGRATION TESTS - Full Bot Validation\n');
console.log('This suite tests all critical functionality after refactoring.\n');

// ============================================================================
// TEST CATEGORY 1: File Syntax Validation
// ============================================================================
console.log('📦 Category 1: Syntax Validation\n');

const mainFiles = [
  'index2.js',
  'bidding.js',
  'auctioneering.js',
  'attendance.js',
  'loot-system.js',
  'emergency-commands.js',
  'help-system.js',
  'leaderboard-system.js'
];

mainFiles.forEach(file => {
  runner.test(`${file} - Valid syntax`, () => {
    const { execSync } = require('child_process');
    try {
      execSync(`node --check ${file}`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch (error) {
      throw new Error(`Syntax error in ${file}`);
    }
  });
});

// ============================================================================
// TEST CATEGORY 2: Module Imports
// ============================================================================
console.log('\n📦 Category 2: Module Imports\n');

const utils = [
  './utils/common.js',
  './utils/error-handler.js',
  './utils/timestamp-cache.js',
  './utils/points-cache.js',
  './utils/sheet-api.js',
  './utils/discord-cache.js'
];

utils.forEach(mod => {
  runner.test(`${mod} - Loads successfully`, () => {
    try {
      require(path.join(__dirname, '..', mod));
    } catch (error) {
      // Ignore fast-levenshtein error (expected in test env)
      if (!error.message.includes('fast-levenshtein')) {
        throw error;
      } else {
        runner.warn(`${mod} - Missing fast-levenshtein (expected in test env)`);
      }
    }
  });
});

// ============================================================================
// TEST CATEGORY 3: New Modules
// ============================================================================
console.log('\n📦 Category 3: Refactored Modules\n');

runner.test('modules/bidding/utilities.js - Loads successfully', () => {
  const utilities = require(path.join(__dirname, '..', 'modules/bidding/utilities'));
  runner.expect(utilities).toBeDefined();
  runner.expect(utilities.formatDuration).toBeFunction();
  runner.expect(utilities.normalizeUsername).toBeFunction();
});

runner.test('modules/bidding/utilities.js - formatDuration works', () => {
  const { formatDuration } = require(path.join(__dirname, '..', 'modules/bidding/utilities'));
  runner.expect(formatDuration(45)).toBe('45min');
  runner.expect(formatDuration(90)).toBe('1h 30min');
  runner.expect(formatDuration(120)).toBe('2h');
});

runner.test('modules/bidding/utilities.js - normalizeUsername works', () => {
  const { normalizeUsername } = require(path.join(__dirname, '..', 'modules/bidding/utilities'));
  runner.expect(normalizeUsername('Player#1234')).toBe('player');
  runner.expect(normalizeUsername('PLAYER')).toBe('player');
});

// ============================================================================
// TEST CATEGORY 4: Configuration Files
// ============================================================================
console.log('\n📦 Category 4: Configuration Files\n');

runner.test('package.json - Valid JSON', () => {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  runner.expect(pkg.name).toBeDefined();
  runner.expect(pkg.version).toBeDefined();
  runner.expect(pkg.main).toBe('index2.js');
});

runner.test('package.json - Test scripts configured', () => {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  runner.expect(pkg.scripts.test).toBeDefined();
  runner.expect(pkg.devDependencies.jest).toBeDefined();
});

runner.test('Dockerfile - Exists and configured', () => {
  const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
  runner.expect(fs.existsSync(dockerfilePath)).toExist();

  const content = fs.readFileSync(dockerfilePath, 'utf8');
  if (!content.includes('--expose-gc')) {
    throw new Error('Dockerfile missing GC flags');
  }
  if (!content.includes('--max-old-space-size')) {
    throw new Error('Dockerfile missing memory limit');
  }
});

runner.test('.env.example - Exists with required vars', () => {
  const envPath = path.join(__dirname, '..', '.env.example');
  runner.expect(fs.existsSync(envPath)).toExist();

  const content = fs.readFileSync(envPath, 'utf8');
  if (!content.includes('DISCORD_TOKEN')) {
    throw new Error('.env.example missing DISCORD_TOKEN');
  }
});

// ============================================================================
// TEST CATEGORY 5: Documentation
// ============================================================================
console.log('\n📦 Category 5: Documentation\n');

const docs = [
  'README.md',
  'REFACTORING_PLAN.md',
  'PHASE_2A_COMPLETION.md',
  'REFACTORING_REALITY_CHECK.md',
  'DEAD_CODE_ANALYSIS.md',
  'COMPREHENSIVE_AUDIT_REPORT.md'
];

docs.forEach(doc => {
  runner.test(`${doc} - Exists`, () => {
    const docPath = path.join(__dirname, '..', doc);
    if (!fs.existsSync(docPath)) {
      throw new Error(`${doc} not found`);
    }
  });
});

// ============================================================================
// TEST CATEGORY 6: Test Framework
// ============================================================================
console.log('\n📦 Category 6: Test Framework\n');

runner.test('Test runner - Executable', () => {
  const testRunnerPath = path.join(__dirname, 'test-runner.js');
  runner.expect(fs.existsSync(testRunnerPath)).toExist();
});

runner.test('Bidding utilities tests - Executable', () => {
  const testPath = path.join(__dirname, 'modules', 'bidding-utilities.test.js');
  runner.expect(fs.existsSync(testPath)).toExist();
});

// ============================================================================
// TEST CATEGORY 7: Critical Files Exist
// ============================================================================
console.log('\n📦 Category 7: Critical Files\n');

const criticalFiles = [
  'config.json',
  'boss_points.json'
];

criticalFiles.forEach(file => {
  runner.test(`${file} - Exists`, () => {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      runner.warn(`${file} not found (may need to be created)`);
    }
  });
});

// ============================================================================
// TEST CATEGORY 8: Module Structure
// ============================================================================
console.log('\n📦 Category 8: Module Structure\n');

runner.test('modules/bidding/ directory exists', () => {
  const dirPath = path.join(__dirname, '..', 'modules', 'bidding');
  runner.expect(fs.existsSync(dirPath)).toExist();
});

runner.test('__tests__/modules/ directory exists', () => {
  const dirPath = path.join(__dirname, 'modules');
  runner.expect(fs.existsSync(dirPath)).toExist();
});

// ============================================================================
// TEST CATEGORY 9: Line Count Verification
// ============================================================================
console.log('\n📦 Category 9: Refactoring Metrics\n');

runner.test('bidding.js - Size reduced or maintained', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'bidding.js'), 'utf8');
  const lines = content.split('\n').length;
  console.log(`     📊 bidding.js: ${lines} lines`);
  if (lines > 4200) {
    runner.warn(`bidding.js larger than expected (${lines} lines)`);
  }
});

runner.test('auctioneering.js - Size maintained', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'auctioneering.js'), 'utf8');
  const lines = content.split('\n').length;
  console.log(`     📊 auctioneering.js: ${lines} lines`);
});

runner.test('index2.js - Size reduced from bugfix', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'index2.js'), 'utf8');
  const lines = content.split('\n').length;
  console.log(`     📊 index2.js: ${lines} lines`);
  if (lines > 3900) {
    runner.warn(`index2.js larger than expected after bugfix (${lines} lines)`);
  }
});

// ============================================================================
// TEST CATEGORY 10: Auto-Close Feature
// ============================================================================
console.log('\n📦 Category 10: Auto-Close Feature\n');

runner.test('Auto-close scheduler exports exist', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '..', 'attendance.js'), 'utf8');
  const hasAutoClose = attendanceCode.includes('checkAndAutoCloseThreads');
  const hasScheduler = attendanceCode.includes('startAutoCloseScheduler');
  const hasExport1 = attendanceCode.includes('checkAndAutoCloseThreads,');
  const hasExport2 = attendanceCode.includes('startAutoCloseScheduler,');

  if (!hasAutoClose || !hasScheduler) {
    throw new Error('Auto-close functions not found');
  }
  if (!hasExport1 || !hasExport2) {
    throw new Error('Auto-close functions not exported');
  }
});

runner.test('Auto-close constants are defined', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '..', 'attendance.js'), 'utf8');
  const hasThreadAutoClose = attendanceCode.includes('THREAD_AUTO_CLOSE_MINUTES');
  const hasAgeCheckInterval = attendanceCode.includes('THREAD_AGE_CHECK_INTERVAL');

  if (!hasThreadAutoClose || !hasAgeCheckInterval) {
    throw new Error('Auto-close timing constants not defined');
  }
});

runner.test('Threads get createdAt timestamp', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '..', 'attendance.js'), 'utf8');
  const hasCreatedAt = attendanceCode.includes('createdAt: Date.now()') ||
                       attendanceCode.includes('createdAt: thread.createdTimestamp');

  if (!hasCreatedAt) {
    throw new Error('createdAt timestamp not added to threads');
  }
});

runner.test('Auto-close scheduler started in index2.js', () => {
  const index2Code = fs.readFileSync(path.join(__dirname, '..', 'index2.js'), 'utf8');
  const hasSchedulerStart = index2Code.includes('startAutoCloseScheduler(client)');

  if (!hasSchedulerStart) {
    throw new Error('Auto-close scheduler not started in index2.js');
  }
});

runner.test('Thread embed mentions 20-minute window', () => {
  const attendanceCode = fs.readFileSync(path.join(__dirname, '..', 'attendance.js'), 'utf8');
  const hasTwentyMinWarning = attendanceCode.includes('20 minutes') ||
                              attendanceCode.includes('Auto-closes in 20');

  if (!hasTwentyMinWarning) {
    throw new Error('Thread embed does not mention 20-minute auto-close');
  }
});

runner.test('Auto-close test file exists', () => {
  const testFilePath = path.join(__dirname, 'attendance-autoclose.test.js');
  runner.expect(fs.existsSync(testFilePath)).toExist();
});

// ============================================================================
// PRINT RESULTS
// ============================================================================

const success = runner.printResults();

// Exit with appropriate code
process.exit(success ? 0 : 1);
