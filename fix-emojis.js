const fs = require('fs');
const path = require('path');

// Map of bugged emoji sequences to correct emojis
// Using hex escape sequences to avoid encoding issues
const emojiReplacements = [
  // Common corrupted patterns
  { search: /âœ…/g, replace: '\u2705' },          // ✅
  { search: /âŒ/g, replace: '\u274C' },           // ❌
  { search: /âš ï¸/g, replace: '\u26A0\uFE0F' },  // ⚠️
  { search: /â„¹ï¸/g, replace: '\u2139\uFE0F' },  // ℹ️
  { search: /â±ï¸/g, replace: '\u23F1\uFE0F' },  // ⏱️
  { search: /â¸ï¸/g, replace: '\u23F8\uFE0F' },  // ⏸️
  { search: /â–¶ï¸/g, replace: '\u25B6\uFE0F' },  // ▶️
  { search: /â¹ï¸/g, replace: '\u23F9\uFE0F' },  // ⏹️
  { search: /â°/g, replace: '\u23F0' },          // ⏰
  { search: /â³/g, replace: '\u23F3' },          // ⏳
  { search: /ðŸ"¨/g, replace: '\uD83D\uDD28' },   // 🔨
  { search: /ðŸ'°/g, replace: '\uD83D\uDCB0' },   // 💰
  { search: /ðŸ•/g, replace: '\uD83D\uDD50' },    // 🕐
  { search: /ðŸ"‹/g, replace: '\uD83D\uDCCB' },   // 📋
  { search: /ðŸ"¥/g, replace: '\uD83D\uDD25' },   // 🔥
  { search: /ðŸ†/g, replace: '\uD83C\uDFC6' },    // 🏆
  { search: /ðŸ"Š/g, replace: '\uD83D\uDCCA' },   // 📊
  { search: /ðŸ"'/g, replace: '\uD83D\uDD12' },   // 🔒
  { search: /ðŸ"§/g, replace: '\uD83D\uDD27' },   // 🔧
  { search: /ðŸ"­/g, replace: '\uD83D\uDD2D' },   // 🔭
  { search: /ðŸ"—/g, replace: '\uD83D\uDD17' },   // 🔗
  { search: /ðŸ§¹/g, replace: '\uD83E\uDDF9' },   // 🧹
  { search: /ðŸŒ/g, replace: '\uD83C\uDF0D' },    // 🌐
  { search: /ðŸ—'ï¸/g, replace: '\uD83D\uDDD1\uFE0F' }, // 🗑️
  { search: /ðŸ"/g, replace: '\uD83D\uDD0D' },    // 🔍
  { search: /ðŸ"„/g, replace: '\uD83D\uDD04' },   // 🔄
  { search: /ðŸ'¤/g, replace: '\uD83D\uDC64' },   // 👤
  { search: /ðŸ'¥/g, replace: '\uD83D\uDC65' },   // 👥
  { search: /ðŸŽ¯/g, replace: '\uD83C\uDFAF' },   // 🎯
  { search: /ðŸŽ‰/g, replace: '\uD83C\uDF89' },   // 🎉
  { search: /ðŸŸ¢/g, replace: '\uD83D\uDFE2' },   // 🟢
  { search: /ðŸ›'/g, replace: '\uD83D\uDED1' },   // 🛑
  { search: /â­ï¸/g, replace: '\u2B50' },         // ⭐
  { search: /â€¢/g, replace: '\u2022' },          // •
  { search: /Ã°Å¸Å½Â¯/g, replace: '\uD83D\uDD2F' }, // Additional corrupted patterns
  { search: /Ã°Å¸â€œÂ/g, replace: '\uD83D\uDCCB' },
  { search: /Ã¢Å¡/g, replace: '\u26A0\uFE0F' },
  { search: /Ã¢ÂÅ'/g, replace: '\u274C' },
  { search: /Ã¢Å"â€œ/g, replace: '\u2705' },
  { search: /Ã¢Å"â€¦/g, replace: '\u2705' },
];

// Files to process
const filesToFix = [
  'auctioneering.js',
  'bidding.js',
  'help-system.js',
  'index2.js',
  'Code.js',
  'attendance.js'
];

// Function to fix emojis in a file
function fixEmojisInFile(filePath) {
  try {
    // Read file as buffer first to preserve encoding
    const buffer = fs.readFileSync(filePath);
    let content = buffer.toString('utf8');
    const originalContent = content;
    let changesCount = 0;
    
    // Replace all bugged emojis
    for (const replacement of emojiReplacements) {
      const matches = content.match(replacement.search);
      if (matches) {
        changesCount += matches.length;
        content = content.replace(replacement.search, replacement.replace);
      }
    }
    
    // Write back if changes were made
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed ' + changesCount + ' emoji(s) in ' + filePath);
      return changesCount;
    } else {
      console.log('No bugged emojis found in ' + filePath);
      return 0;
    }
    
  } catch (error) {
    console.error('Error processing ' + filePath + ':', error.message);
    return 0;
  }
}

// Main function
function main() {
  console.log('Starting emoji fix process...\n');
  
  let totalFixed = 0;
  let filesProcessed = 0;
  let filesWithChanges = 0;
  
  for (const file of filesToFix) {
    if (fs.existsSync(file)) {
      const fixed = fixEmojisInFile(file);
      filesProcessed++;
      if (fixed > 0) {
        filesWithChanges++;
        totalFixed += fixed;
      }
    } else {
      console.log('File not found: ' + file);
    }
  }
  
  console.log('\nSummary:');
  console.log('   Files processed: ' + filesProcessed);
  console.log('   Files modified: ' + filesWithChanges);
  console.log('   Total emojis fixed: ' + totalFixed);
  console.log('\nDone!');
}

// Run the script
main();