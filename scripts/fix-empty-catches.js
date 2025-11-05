/**
 * Script to identify and optionally fix empty catch blocks in the codebase
 *
 * Usage:
 *   node scripts/fix-empty-catches.js [--check|--fix]
 *
 * Options:
 *   --check: Only report empty catch blocks (default)
 *   --fix:   Replace empty catch blocks with silentError calls
 */

const fs = require('fs');
const path = require('path');

const FILES_TO_CHECK = [
  'bidding.js',
  'index2.js',
  'auctioneering.js',
  'attendance.js',
  'leaderboard-system.js',
  'loot-system.js',
  'emergency-commands.js'
];

const EMPTY_CATCH_PATTERNS = [
  /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g,
  /\.catch\(\s*\(\s*err?\s*\)\s*=>\s*\{\s*\}\s*\)/g,
  /catch\s*\(\s*e(?:rr(?:or)?)?\s*\)\s*\{\s*\}/g
];

function findEmptyCatchBlocks(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  lines.forEach((line, index) => {
    EMPTY_CATCH_PATTERNS.forEach(pattern => {
      if (pattern.test(line)) {
        findings.push({
          file: path.basename(filePath),
          line: index + 1,
          code: line.trim()
        });
      }
    });
  });

  return findings;
}

function main() {
  const mode = process.argv[2] || '--check';

  console.log('🔍 Scanning for empty catch blocks...\n');

  let totalFindings = 0;

  FILES_TO_CHECK.forEach(fileName => {
    const filePath = path.join(__dirname, '..', fileName);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found: ${fileName}`);
      return;
    }

    const findings = findEmptyCatchBlocks(filePath);

    if (findings.length > 0) {
      console.log(`📄 ${fileName}: ${findings.length} empty catch block(s)`);
      findings.forEach(f => {
        console.log(`   Line ${f.line}: ${f.code}`);
      });
      console.log();
      totalFindings += findings.length;
    }
  });

  console.log(`\n📊 Total: ${totalFindings} empty catch block(s) found`);

  if (mode === '--fix') {
    console.log('\n⚠️  Fix mode not yet implemented.');
    console.log('   Recommended: Manually update critical catch blocks to use silentError()');
    console.log('   Example: .catch((err) => silentError(err, "message cleanup"))');
  } else {
    console.log('\nℹ️  Run with --fix to attempt automatic fixes (not yet implemented)');
    console.log('   For now, manually update critical instances with:');
    console.log('   const { silentError } = require("./utils/error-handler");');
    console.log('   .catch((err) => silentError(err, "context"))');
  }
}

main();
