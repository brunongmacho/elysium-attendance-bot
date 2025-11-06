/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTILINGUAL NLP TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════
 * Tests the multilingual NLP handler with English, Tagalog, and Taglish phrases
 */

const { NLPHandler } = require('./nlp-handler');

// Mock config
const mockConfig = {
  admin_logs_channel_id: '123456789',
  bidding_channel_id: '987654321',
  elysium_commands_channel_id: '111222333',
};

// Create NLP handler instance
const nlp = new NLPHandler(mockConfig);

// Mock message object creator
function createMockMessage(content, channelId, isThread = false, parentId = null) {
  return {
    content,
    author: { bot: false },
    channel: {
      id: channelId,
      isThread: () => isThread,
      parentId,
    },
  };
}

// Test cases
const testCases = [
  // ═══════════════════════════════════════════════════════════════════════════
  // BIDDING COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Bidding (English)',
    tests: [
      { input: 'bid 500', expected: '!bid', params: ['500'] },
      { input: 'offer 1000', expected: '!bid', params: ['1000'] },
      { input: 'i want to bid 750', expected: '!bid', params: ['750'] },
      { input: '500 points', expected: '!bid', params: ['500'] },
    ],
  },
  {
    category: 'Bidding (Tagalog)',
    tests: [
      { input: 'taya 500', expected: '!bid', params: ['500'] },
      { input: 'taya ko 1000', expected: '!bid', params: ['1000'] },
      { input: 'alok ko 750', expected: '!bid', params: ['750'] },
      { input: 'bayad 300', expected: '!bid', params: ['300'] },
      { input: 'taasan 600', expected: '!bid', params: ['600'] },
    ],
  },
  {
    category: 'Bidding (Taglish)',
    tests: [
      { input: 'bid ko 500', expected: '!bid', params: ['500'] },
      { input: 'bid na 1000', expected: '!bid', params: ['1000'] },
      { input: '500 lang', expected: '!bid', params: ['500'] },
      { input: 'mag-bid ng 750', expected: '!bid', params: ['750'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // POINTS QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Points (English)',
    tests: [
      { input: 'my points', expected: '!mypoints', params: [] },
      { input: 'how many points do i have', expected: '!mypoints', params: [] },
      { input: 'check my balance', expected: '!mypoints', params: [] },
    ],
  },
  {
    category: 'Points (Tagalog)',
    tests: [
      { input: 'ilang points ko', expected: '!mypoints', params: [] },
      { input: 'points ko ilang', expected: '!mypoints', params: [] },
      { input: 'magkano points ko', expected: '!mypoints', params: [] },
      { input: 'tignan points ko', expected: '!mypoints', params: [] },
      { input: 'balance ko', expected: '!mypoints', params: [] },
      { input: 'pera ko', expected: '!mypoints', params: [] }, // Slang
    ],
  },
  {
    category: 'Points (Taglish)',
    tests: [
      { input: 'my points ilang', expected: '!mypoints', params: [] },
      { input: 'check ko points', expected: '!mypoints', params: [] },
      { input: 'show points ko', expected: '!mypoints', params: [] },
      { input: 'gaano karami points ko', expected: '!mypoints', params: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Attendance (English)',
    tests: [
      { input: 'present', expected: '!present', params: [] },
      { input: "i'm here", expected: '!present', params: [] },
      { input: 'attending', expected: '!present', params: [] },
      { input: 'check in', expected: '!present', params: [] },
    ],
  },
  {
    category: 'Attendance (Tagalog)',
    tests: [
      { input: 'nandito', expected: '!present', params: [] },
      { input: 'nandito po', expected: '!present', params: [] },
      { input: 'andito ako', expected: '!present', params: [] },
      { input: 'dumating na', expected: '!present', params: [] },
      { input: 'sumali', expected: '!present', params: [] },
      { input: 'nag-attend', expected: '!present', params: [] },
    ],
  },
  {
    category: 'Attendance (Taglish)',
    tests: [
      { input: 'here na', expected: '!present', params: [] },
      { input: 'attending po', expected: '!present', params: [] },
      { input: 'present naman', expected: '!present', params: [] },
      { input: 'present na', expected: '!present', params: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Status (English)',
    tests: [
      { input: 'auction status', expected: '!bidstatus', params: [] },
      { input: "what's happening", expected: '!bidstatus', params: [] },
      { input: 'show status', expected: '!bidstatus', params: [] },
    ],
  },
  {
    category: 'Status (Tagalog)',
    tests: [
      { input: 'ano meron', expected: '!bidstatus', params: [] },
      { input: 'ano nangyayari', expected: '!bidstatus', params: [] },
      { input: 'saan na', expected: '!bidstatus', params: [] },
      { input: 'kumusta auction', expected: '!bidstatus', params: [] },
    ],
  },
  {
    category: 'Status (Taglish)',
    tests: [
      { input: 'status na', expected: '!bidstatus', params: [] },
      { input: 'ano update', expected: '!bidstatus', params: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEADERBOARD COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Leaderboard (English)',
    tests: [
      { input: 'leaderboard', expected: '!leaderboard', params: [] },
      { input: 'show leaderboard', expected: '!leaderboard', params: [] },
      { input: "who's on top", expected: '!leaderboard', params: [] },
    ],
  },
  {
    category: 'Leaderboard (Tagalog)',
    tests: [
      { input: 'tignan ranking', expected: '!leaderboard', params: [] },
      { input: 'sino nangunguna', expected: '!leaderboard', params: [] },
      { input: 'listahan', expected: '!leaderboard', params: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN AUCTION COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Admin - Start Auction (Tagalog)',
    tests: [
      { input: 'simula auction', expected: '!startauction', params: [] },
      { input: 'umpisa auction', expected: '!startauction', params: [] },
      { input: 'start na auction', expected: '!startauction', params: [] },
    ],
  },
  {
    category: 'Admin - Pause/Resume (Tagalog)',
    tests: [
      { input: 'hinto muna', expected: '!pause', params: [] },
      { input: 'pause muna', expected: '!pause', params: [] },
      { input: 'tuloy auction', expected: '!resume', params: [] },
      { input: 'ituloy', expected: '!resume', params: [] },
    ],
  },
  {
    category: 'Admin - Stop/Cancel (Tagalog)',
    tests: [
      { input: 'tigil na auction', expected: '!stop', params: [] },
      { input: 'tapos na auction', expected: '!stop', params: [] },
      { input: 'cancel auction', expected: '!stop', params: [] },
    ],
  },
  {
    category: 'Admin - Skip/Cancel Item (Tagalog)',
    tests: [
      { input: 'laktaw item', expected: '!skipitem', params: [] },
      { input: 'sunod na', expected: '!skipitem', params: [] },
      { input: 'kanselahin item', expected: '!cancelitem', params: [] },
      { input: 'wag na ito', expected: '!cancelitem', params: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HELP COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: 'Help (Multilingual)',
    tests: [
      { input: 'help', expected: '!help', params: [] },
      { input: 'tulong', expected: '!help', params: [] },
      { input: 'paano ba', expected: '!help', params: [] },
      { input: 'ano commands', expected: '!help', params: [] },
      { input: 'pakita ng commands', expected: '!help', params: [] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║          ELYSIUM BOT - MULTILINGUAL NLP TEST SUITE                       ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

for (const category of testCases) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${category.category}`);
  console.log('═'.repeat(80));

  for (const test of category.tests) {
    totalTests++;

    // Create mock message (admin logs channel for testing)
    const mockMessage = createMockMessage(test.input, mockConfig.admin_logs_channel_id);

    // Interpret message
    const result = nlp.interpretMessage(mockMessage);

    // Check result
    const passed = result &&
      result.command === test.expected &&
      JSON.stringify(result.params) === JSON.stringify(test.params);

    if (passed) {
      passedTests++;
      console.log(`  ✅ "${test.input}"`);
      console.log(`     → ${result.command} ${result.params.join(' ')}`);
    } else {
      failedTests++;
      console.log(`  ❌ "${test.input}"`);
      console.log(`     Expected: ${test.expected} ${test.params.join(' ')}`);
      console.log(`     Got: ${result ? `${result.command} ${result.params.join(' ')}` : 'null'}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION TEST
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(80));
console.log('  LANGUAGE DETECTION TEST');
console.log('═'.repeat(80));

const languageTests = [
  { input: 'bid 500', expected: 'en' },
  { input: 'taya ko 500', expected: 'taglish' },
  { input: 'nandito po ako', expected: 'tl' },
  { input: 'ilang points ko', expected: 'taglish' },
  { input: 'magkano ang points ko', expected: 'tl' },
  { input: 'check ko points', expected: 'taglish' },
  { input: 'my points', expected: 'en' },
  { input: 'kumusta bot', expected: 'taglish' },
];

for (const test of languageTests) {
  totalTests++;
  const detected = nlp.detectLanguage(test.input);
  const passed = detected === test.expected;

  if (passed) {
    passedTests++;
    console.log(`  ✅ "${test.input}" → ${detected}`);
  } else {
    failedTests++;
    console.log(`  ❌ "${test.input}"`);
    console.log(`     Expected: ${test.expected}, Got: ${detected}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n\n' + '═'.repeat(80));
console.log('  TEST SUMMARY');
console.log('═'.repeat(80));
console.log(`  Total Tests:  ${totalTests}`);
console.log(`  ✅ Passed:    ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
console.log(`  ❌ Failed:    ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
console.log('═'.repeat(80));

if (failedTests === 0) {
  console.log('\n  🎉 ALL TESTS PASSED! Multilingual NLP is working perfectly!\n');
} else {
  console.log(`\n  ⚠️  ${failedTests} test(s) failed. Please review the patterns.\n`);
  process.exit(1);
}
