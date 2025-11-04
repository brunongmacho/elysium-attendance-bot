#!/usr/bin/env node
/**
 * Script to fix silent error handlers across the codebase
 * Replaces .catch(() => {}) with proper error handling
 */

const fs = require('fs');
const path = require('path');

// Files to process
const filesToFix = [
  'index2.js',
  'bidding.js',
  'auctioneering.js',
  'attendance.js',
  'emergency-commands.js',
  'loot-system.js'
];

// Error handling replacements based on context
const replacements = [
  {
    // Message deletion
    pattern: /await\s+(\w+)\.delete\(\)\.catch\(\(\) => \{\}\);?/g,
    replacement: 'await errorHandler.safeDelete($1, \'message deletion\');'
  },
  {
    // Reaction removal - removeAll
    pattern: /await\s+(\w+)\.reactions\.removeAll\(\)\.catch\(\(\) => \{\}\);?/g,
    replacement: 'await errorHandler.safeRemoveReactions($1, \'reaction removal\');'
  },
  {
    // Message edit
    pattern: /await\s+(\w+)\.edit\(([^)]+)\)\.catch\(\(\) => \{\}\);?/g,
    replacement: 'await errorHandler.safeEdit($1, $2, \'message edit\');'
  },
  {
    // Message react
    pattern: /await\s+(\w+)\.react\(([^)]+)\)\.catch\(\(\) => \{\}\);?/g,
    replacement: 'await errorHandler.safeReact($1, $2, \'reaction add\');'
  },
  {
    // Thread/Channel setArchived
    pattern: /await\s+(\w+\.\w+)\.setArchived\(([^)]+)\)\.catch\(\(\) => \{\}\);?/g,
    replacement: 'await $1.setArchived($2).catch(errorHandler.safeCatch(\'thread archive\'));'
  },
  {
    // Generic catch - nested in promises
    pattern: /async\s+\(\)\s+=> await\s+(\w+)\.delete\(\)\.catch\(\(\) => \{\}\)/g,
    replacement: 'async () => await errorHandler.safeDelete($1, \'deferred message deletion\')'
  },
  {
    // Generic message send catch
    pattern: /await\s+(\w+)\.send\(([^)]+)\)\.catch\(\(\) => \{\}\);?/g,
    replacement: 'await errorHandler.safeSend($1, $2, \'message send\');'
  }
];

// Import statement to add
const importStatement = `const errorHandler = require('./utils/error-handler');\n`;

function addImportIfMissing(content, filePath) {
  if (content.includes('error-handler')) {
    console.log(`✅ ${filePath} already has error-handler import`);
    return content;
  }

  // Find the first require statement and add after it
  const requireIndex = content.indexOf('require(');
  if (requireIndex === -1) {
    // No requires found, add at the top
    return importStatement + content;
  }

  // Find the end of the first group of requires
  const lines = content.split('\n');
  let insertIndex = 0;
  let inRequireBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('require(')) {
      inRequireBlock = true;
      insertIndex = i + 1;
    } else if (inRequireBlock && !line.startsWith('//') && line !== '') {
      // Found the end of require block
      break;
    }
  }

  lines.splice(insertIndex, 0, importStatement.trim());
  console.log(`✅ Added error-handler import to ${filePath}`);
  return lines.join('\n');
}

function applyReplacements(content, filePath) {
  let modifiedContent = content;
  let totalReplacements = 0;

  for (const { pattern, replacement } of replacements) {
    const matches = modifiedContent.match(pattern);
    if (matches) {
      console.log(`  Found ${matches.length} instances of pattern in ${filePath}`);
      modifiedContent = modifiedContent.replace(pattern, replacement);
      totalReplacements += matches.length;
    }
  }

  return { modifiedContent, totalReplacements };
}

function processFile(filePath) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }

    console.log(`\n📝 Processing ${filePath}...`);

    let content = fs.readFileSync(fullPath, 'utf8');
    const originalSize = content.length;

    // Add import
    content = addImportIfMissing(content, filePath);

    // Apply replacements
    const { modifiedContent, totalReplacements } = applyReplacements(content, filePath);

    if (totalReplacements > 0) {
      // Create backup
      const backupPath = fullPath + '.backup';
      fs.writeFileSync(backupPath, fs.readFileSync(fullPath, 'utf8'));

      // Write modified content
      fs.writeFileSync(fullPath, modifiedContent);

      console.log(`✅ ${filePath}: ${totalReplacements} silent error handlers fixed`);
      console.log(`   Backup saved to ${filePath}.backup`);
    } else {
      console.log(`ℹ️  ${filePath}: No changes needed`);
    }

  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

// Main execution
console.log('🔧 Starting silent error handler fix...\n');

for (const file of filesToFix) {
  processFile(file);
}

console.log('\n✅ All files processed!');
console.log('\n📋 Summary:');
console.log('   - Silent error handlers replaced with proper error handling');
console.log('   - Error handler utilities imported');
console.log('   - Backups created (.backup files)');
console.log('\n⚠️  Please review the changes and test thoroughly!');
