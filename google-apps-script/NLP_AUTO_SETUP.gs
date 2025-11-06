/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║           ELYSIUM NLP AUTO-SETUP FOR GOOGLE SHEETS                       ║
 * ║        Automatically Creates and Hides NLP Learning Tabs                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @fileoverview Google Apps Script to auto-create hidden NLP tabs
 *
 * FEATURES:
 * - Auto-creates NLP tabs if they don't exist
 * - Hides tabs from normal view
 * - Sets up proper headers and formatting
 * - Initializes with sample data/documentation
 * - Safe to run multiple times (idempotent)
 */

// ═══════════════════════════════════════════════════════════════════════════
// TAB CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const NLP_TABS_CONFIG = {
  'NLP_LearnedPatterns': {
    headers: [
      'Phrase',
      'Command',
      'Confidence',
      'Usage Count',
      'Learned From (User ID)',
      'Learned At (Timestamp)',
      'Param Pattern',
      'Last Used',
      'Success Rate',
      'Notes'
    ],
    columnWidths: [200, 100, 80, 100, 150, 150, 120, 150, 100, 250],
    sampleData: [
      [
        'pusta 500',
        '!bid',
        0.95,
        42,
        '123456789012345678',
        new Date('2025-01-01'),
        '(\\d+)',
        new Date(),
        0.98,
        'Filipino slang for "bet"'
      ]
    ],
    color: '#e3f2fd', // Light blue
  },

  'NLP_UserPreferences': {
    headers: [
      'User ID',
      'Username',
      'Preferred Language',
      'Language Scores (JSON)',
      'Shortcuts (JSON)',
      'Message Count',
      'Last Updated',
      'Learning Enabled',
      'Notes'
    ],
    columnWidths: [150, 150, 120, 200, 250, 100, 150, 100, 250],
    sampleData: [
      [
        '123456789012345678',
        'JuanDelaCruz',
        'tl',
        '{"en": 5, "tl": 45, "taglish": 12}',
        '{"p": "!mypoints", "g": "!bid"}',
        62,
        new Date(),
        true,
        'Prefers Tagalog'
      ]
    ],
    color: '#f3e5f5', // Light purple
  },

  'NLP_UnrecognizedPhrases': {
    headers: [
      'Phrase',
      'Count',
      'User Count',
      'Last Seen',
      'First Seen',
      'Example Users',
      'Suggested Command',
      'Status',
      'Admin Notes'
    ],
    columnWidths: [200, 80, 100, 150, 150, 200, 120, 100, 250],
    sampleData: [
      [
        'bawi ko 500',
        8,
        3,
        new Date(),
        new Date('2025-01-01'),
        'User1, User2, User3',
        '!bid',
        'Pending Review',
        'Might mean "revenge bid"'
      ]
    ],
    color: '#fff3e0', // Light orange
  },

  'NLP_Analytics': {
    headers: [
      'Date',
      'Total Patterns Learned',
      'Total Users Tracked',
      'Messages Analyzed',
      'Recognition Rate',
      'Top Learned Pattern',
      'Top Unrecognized Phrase',
      'Language Distribution (JSON)',
      'Notes'
    ],
    columnWidths: [120, 150, 150, 150, 120, 200, 200, 250, 250],
    sampleData: [
      [
        new Date(),
        42,
        15,
        1247,
        0.94,
        'pusta → !bid',
        'bawi ko',
        '{"en": 5, "tl": 8, "taglish": 2}',
        'Weekly snapshot'
      ]
    ],
    color: '#e8f5e9', // Light green
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SETUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize all NLP tabs (auto-creates if missing, hides them)
 * Call this function on first bot startup or manually
 */
function initializeNLPTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let created = [];
  let existing = [];

  // Process each tab configuration
  for (const [tabName, config] of Object.entries(NLP_TABS_CONFIG)) {
    const sheet = getOrCreateSheet(ss, tabName, config);

    if (sheet.isNew) {
      created.push(tabName);
    } else {
      existing.push(tabName);
    }

    // Hide the sheet
    sheet.instance.hideSheet();
  }

  // Log results
  const result = {
    success: true,
    created: created,
    existing: existing,
    timestamp: new Date(),
    message: `NLP tabs initialized. Created: ${created.length}, Existing: ${existing.length}`
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Get or create a sheet with configuration
 * @param {Spreadsheet} ss - Spreadsheet instance
 * @param {string} tabName - Tab name
 * @param {Object} config - Tab configuration
 * @returns {Object} Sheet instance and metadata
 */
function getOrCreateSheet(ss, tabName, config) {
  let sheet = ss.getSheetByName(tabName);
  let isNew = false;

  if (!sheet) {
    // Create new sheet
    sheet = ss.insertSheet(tabName);
    isNew = true;

    // Set up headers
    const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
    headerRange.setValues([config.headers]);

    // Format headers
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#434343');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setWrap(true);

    // Set column widths
    config.columnWidths.forEach((width, index) => {
      sheet.setColumnWidth(index + 1, width);
    });

    // Add sample data (row 2)
    if (config.sampleData && config.sampleData.length > 0) {
      const sampleRange = sheet.getRange(2, 1, 1, config.sampleData[0].length);
      sampleRange.setValues(config.sampleData);
      sampleRange.setFontStyle('italic');
      sampleRange.setFontColor('#666666');
      sampleRange.setBackground(config.color);

      // Add note to sample row
      sheet.getRange(2, 1).setNote('This is sample data. The bot will add real data below.');
    }

    // Freeze header row
    sheet.setFrozenRows(1);

    // Add description in first row comment
    sheet.getRange(1, 1).setNote(
      `🧠 NLP Learning Tab: ${tabName}\n\n` +
      `This tab is auto-generated and hidden.\n` +
      `Data is synced from the bot every 5 minutes.\n` +
      `Do not manually edit unless you know what you're doing!\n\n` +
      `Created: ${new Date().toLocaleString()}`
    );

    // Set tab color
    sheet.setTabColor(config.color);

    Logger.log(`✅ Created new tab: ${tabName}`);
  } else {
    Logger.log(`ℹ️  Tab already exists: ${tabName}`);
  }

  return {
    instance: sheet,
    isNew: isNew,
    name: tabName
  };
}

/**
 * Check if all NLP tabs exist
 * @returns {Object} Status of each tab
 */
function checkNLPTabsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const status = {};

  for (const tabName of Object.keys(NLP_TABS_CONFIG)) {
    const sheet = ss.getSheetByName(tabName);
    status[tabName] = {
      exists: sheet !== null,
      hidden: sheet ? sheet.isSheetHidden() : null,
      rowCount: sheet ? sheet.getLastRow() : 0
    };
  }

  return status;
}

/**
 * Unhide all NLP tabs (for admin viewing/debugging)
 */
function unhideNLPTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const unhidden = [];

  for (const tabName of Object.keys(NLP_TABS_CONFIG)) {
    const sheet = ss.getSheetByName(tabName);
    if (sheet && sheet.isSheetHidden()) {
      sheet.showSheet();
      unhidden.push(tabName);
    }
  }

  Logger.log(`Unhidden ${unhidden.length} tabs: ${unhidden.join(', ')}`);
  return {
    success: true,
    unhidden: unhidden,
    message: `Unhidden ${unhidden.length} NLP tabs for admin viewing`
  };
}

/**
 * Re-hide all NLP tabs
 */
function hideNLPTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hidden = [];

  for (const tabName of Object.keys(NLP_TABS_CONFIG)) {
    const sheet = ss.getSheetByName(tabName);
    if (sheet && !sheet.isSheetHidden()) {
      sheet.hideSheet();
      hidden.push(tabName);
    }
  }

  Logger.log(`Hidden ${hidden.length} tabs: ${hidden.join(', ')}`);
  return {
    success: true,
    hidden: hidden,
    message: `Hidden ${hidden.length} NLP tabs`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NLP DATA ACCESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all learned patterns
 * @returns {Array} Learned patterns
 */
function getLearnedPatterns() {
  // Auto-initialize if tab doesn't exist
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NLP_LearnedPatterns');

  if (!sheet) {
    initializeNLPTabs();
    sheet = ss.getSheetByName('NLP_LearnedPatterns');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { patterns: [] }; // No data yet (only headers)
  }

  // Get all data (skip header row)
  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  const patterns = data
    .filter(row => row[0]) // Filter out empty rows
    .filter(row => !row[9] || !row[9].includes('sample data')) // Filter out sample data
    .map(row => ({
      phrase: row[0],
      command: row[1],
      confidence: row[2],
      usageCount: row[3],
      learnedFrom: row[4],
      learnedAt: row[5],
      paramPattern: row[6],
      lastUsed: row[7],
      successRate: row[8],
      notes: row[9]
    }));

  return { patterns };
}

/**
 * Save a learned pattern
 * @param {Object} data - Pattern data
 */
function saveLearnedPattern(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NLP_LearnedPatterns');

  if (!sheet) {
    initializeNLPTabs();
    sheet = ss.getSheetByName('NLP_LearnedPatterns');
  }

  // Check if pattern already exists
  const lastRow = sheet.getLastRow();
  const phrases = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];

  let rowIndex = -1;
  for (let i = 0; i < phrases.length; i++) {
    if (phrases[i][0] === data.phrase) {
      rowIndex = i + 2; // +2 because: 0-indexed + header row
      break;
    }
  }

  const rowData = [
    data.phrase,
    data.command,
    data.confidence,
    data.usageCount,
    data.learnedFrom,
    data.learnedAt ? new Date(data.learnedAt) : new Date(),
    data.paramPattern,
    new Date(), // lastUsed
    data.successRate || data.confidence,
    data.notes || ''
  ];

  if (rowIndex > 0) {
    // Update existing pattern
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Add new pattern
    sheet.appendRow(rowData);
  }

  return {
    success: true,
    action: rowIndex > 0 ? 'updated' : 'created',
    phrase: data.phrase,
    command: data.command
  };
}

/**
 * Get user preferences
 * @returns {Array} User preferences
 */
function getUserPreferences() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NLP_UserPreferences');

  if (!sheet) {
    initializeNLPTabs();
    sheet = ss.getSheetByName('NLP_UserPreferences');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { preferences: [] };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

  const preferences = data
    .filter(row => row[0]) // Filter out empty rows
    .filter(row => !row[8] || !row[8].includes('sample data')) // Filter out sample data
    .map(row => ({
      userId: row[0],
      username: row[1],
      language: row[2],
      languageScores: row[3] ? JSON.parse(row[3]) : {},
      shortcuts: row[4] ? JSON.parse(row[4]) : {},
      messageCount: row[5],
      lastUpdated: row[6],
      learningEnabled: row[7],
      notes: row[8]
    }));

  return { preferences };
}

/**
 * Sync all NLP learning data
 * @param {Object} data - Learning data to sync
 */
function syncNLPLearning(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Auto-initialize if needed
  if (!ss.getSheetByName('NLP_LearnedPatterns')) {
    initializeNLPTabs();
  }

  const results = {
    patterns: { updated: 0, created: 0 },
    preferences: { updated: 0, created: 0 },
    unrecognized: { updated: 0, created: 0 },
    timestamp: new Date()
  };

  // Sync learned patterns
  if (data.patterns && data.patterns.length > 0) {
    for (const pattern of data.patterns) {
      const result = saveLearnedPattern(pattern);
      if (result.action === 'created') {
        results.patterns.created++;
      } else {
        results.patterns.updated++;
      }
    }
  }

  // Sync user preferences
  if (data.preferences && data.preferences.length > 0) {
    const sheet = ss.getSheetByName('NLP_UserPreferences');

    for (const pref of data.preferences) {
      const rowData = [
        pref.userId,
        pref.username || '',
        pref.language,
        JSON.stringify(pref.languageScores || {}),
        JSON.stringify(pref.shortcuts || {}),
        pref.messageCount,
        new Date(),
        pref.learningEnabled !== false,
        pref.notes || ''
      ];

      // Check if user exists
      const lastRow = sheet.getLastRow();
      const userIds = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
      let rowIndex = -1;

      for (let i = 0; i < userIds.length; i++) {
        if (userIds[i][0] === pref.userId) {
          rowIndex = i + 2;
          break;
        }
      }

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        results.preferences.updated++;
      } else {
        sheet.appendRow(rowData);
        results.preferences.created++;
      }
    }
  }

  // Sync unrecognized phrases
  if (data.unrecognized && data.unrecognized.length > 0) {
    const sheet = ss.getSheetByName('NLP_UnrecognizedPhrases');

    for (const phrase of data.unrecognized) {
      const rowData = [
        phrase.phrase,
        phrase.count,
        phrase.userCount,
        new Date(phrase.lastSeen),
        phrase.firstSeen ? new Date(phrase.firstSeen) : new Date(),
        phrase.exampleUsers || '',
        phrase.suggestedCommand || '',
        phrase.status || 'Pending Review',
        phrase.adminNotes || ''
      ];

      // Check if phrase exists
      const lastRow = sheet.getLastRow();
      const phrases = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
      let rowIndex = -1;

      for (let i = 0; i < phrases.length; i++) {
        if (phrases[i][0] === phrase.phrase) {
          rowIndex = i + 2;
          break;
        }
      }

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        results.unrecognized.updated++;
      } else {
        sheet.appendRow(rowData);
        results.unrecognized.created++;
      }
    }
  }

  // Update analytics
  updateNLPAnalytics(data);

  return {
    success: true,
    results: results,
    message: `Synced ${results.patterns.created + results.patterns.updated} patterns, ${results.preferences.created + results.preferences.updated} preferences, ${results.unrecognized.created + results.unrecognized.updated} unrecognized phrases`
  };
}

/**
 * Update NLP analytics tab with daily snapshot
 * @param {Object} data - Learning data
 */
function updateNLPAnalytics(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('NLP_Analytics');

  if (!sheet) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate statistics
  const totalPatterns = data.patterns ? data.patterns.length : 0;
  const totalUsers = data.preferences ? data.preferences.length : 0;
  const messagesAnalyzed = data.preferences
    ? data.preferences.reduce((sum, p) => sum + (p.messageCount || 0), 0)
    : 0;

  const recognitionRate = data.recognitionRate || 0.0;

  const topPattern = data.patterns && data.patterns.length > 0
    ? `${data.patterns[0].phrase} → ${data.patterns[0].command}`
    : 'None';

  const topUnrecognized = data.unrecognized && data.unrecognized.length > 0
    ? data.unrecognized[0].phrase
    : 'None';

  const languageDist = data.preferences
    ? data.preferences.reduce((acc, p) => {
        acc[p.language] = (acc[p.language] || 0) + 1;
        return acc;
      }, {})
    : {};

  const rowData = [
    today,
    totalPatterns,
    totalUsers,
    messagesAnalyzed,
    recognitionRate,
    topPattern,
    topUnrecognized,
    JSON.stringify(languageDist),
    `Auto-generated snapshot from bot sync`
  ];

  // Check if today's entry exists
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const lastDate = sheet.getRange(lastRow, 1).getValue();
    if (lastDate && lastDate.toDateString() === today.toDateString()) {
      // Update today's entry
      sheet.getRange(lastRow, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }

  // Add new entry
  sheet.appendRow(rowData);
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK WRAPPER (AUTO-INITIALIZES ON FIRST CALL)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrapper for getLearnedPatterns that auto-initializes
 */
function doGet_getLearnedPatterns(e) {
  return ContentService.createTextOutput(
    JSON.stringify(getLearnedPatterns())
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Wrapper for getUserPreferences that auto-initializes
 */
function doGet_getUserPreferences(e) {
  return ContentService.createTextOutput(
    JSON.stringify(getUserPreferences())
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Manual initialization function (can be run from Apps Script editor)
 */
function manualInitializeNLP() {
  const result = initializeNLPTabs();
  Logger.log('Manual initialization complete:');
  Logger.log(result.message);
  return result;
}
