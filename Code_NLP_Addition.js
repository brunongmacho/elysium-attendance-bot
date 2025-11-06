// ═══════════════════════════════════════════════════════════════════════════
// NLP LEARNING SYSTEM - AUTO-SETUP & HIDDEN TABS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * ADD THIS SECTION TO YOUR Code.js FILE
 *
 * LOCATION: Add this code right before the final section header:
 * "// ==========================================================="
 * "// OPTIMIZED SHEET CREATION WITH AUTO-LOGGING"
 *
 * This will be around line 4165 in your Code.js file.
 *
 * FEATURES:
 * - Auto-creates 4 NLP tabs if they don't exist
 * - Automatically hides tabs from normal view
 * - Pre-formatted with headers, colors, and sample data
 * - Idempotent (safe to run multiple times)
 * - No manual setup required
 *
 * TABS CREATED:
 * 1. NLP_LearnedPatterns (Blue) - Patterns learned from user confirmations
 * 2. NLP_UserPreferences (Purple) - Each member's language preferences
 * 3. NLP_UnrecognizedPhrases (Orange) - Phrases bot doesn't understand yet
 * 4. NLP_Analytics (Green) - Daily learning progress snapshots
 *
 * USAGE:
 * - Tabs auto-create when bot first calls getLearnedPatterns() or syncNLPLearning()
 * - Or manually run: manualInitializeNLP() from Apps Script editor
 * - To unhide for review: unhideNLPTabs()
 * - To re-hide: hideNLPTabs()
 */

const NLP_TABS_CONFIG = {
  'NLP_LearnedPatterns': {
    headers: ['Phrase', 'Command', 'Confidence', 'Usage Count', 'Learned From (User ID)', 'Learned At (Timestamp)', 'Param Pattern', 'Last Used', 'Success Rate', 'Notes'],
    columnWidths: [200, 100, 80, 100, 150, 150, 120, 150, 100, 250],
    sampleData: [['pusta 500', '!bid', 0.95, 42, '123456789012345678', new Date('2025-01-01'), '(\\d+)', new Date(), 0.98, 'Filipino slang for "bet" (Sample data)']],
    color: '#e3f2fd'
  },
  'NLP_UserPreferences': {
    headers: ['User ID', 'Username', 'Preferred Language', 'Language Scores (JSON)', 'Shortcuts (JSON)', 'Message Count', 'Last Updated', 'Learning Enabled', 'Notes'],
    columnWidths: [150, 150, 120, 200, 250, 100, 150, 100, 250],
    sampleData: [['123456789012345678', 'JuanDelaCruz', 'tl', '{"en": 5, "tl": 45, "taglish": 12}', '{"p": "!mypoints", "g": "!bid"}', 62, new Date(), true, 'Prefers Tagalog (Sample data)']],
    color: '#f3e5f5'
  },
  'NLP_UnrecognizedPhrases': {
    headers: ['Phrase', 'Count', 'User Count', 'Last Seen', 'First Seen', 'Example Users', 'Suggested Command', 'Status', 'Admin Notes'],
    columnWidths: [200, 80, 100, 150, 150, 200, 120, 100, 250],
    sampleData: [['bawi ko 500', 8, 3, new Date(), new Date('2025-01-01'), 'User1, User2, User3', '!bid', 'Pending Review', 'Might mean "revenge bid" (Sample data)']],
    color: '#fff3e0'
  },
  'NLP_Analytics': {
    headers: ['Date', 'Total Patterns Learned', 'Total Users Tracked', 'Messages Analyzed', 'Recognition Rate', 'Top Learned Pattern', 'Top Unrecognized Phrase', 'Language Distribution (JSON)', 'Notes'],
    columnWidths: [120, 150, 150, 150, 120, 200, 200, 250, 250],
    sampleData: [[new Date(), 42, 15, 1247, 0.94, 'pusta → !bid', 'bawi ko', '{"en": 5, "tl": 8, "taglish": 2}', 'Weekly snapshot (Sample data)']],
    color: '#e8f5e9'
  }
};

function initializeNLPTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let created = [], existing = [];
  for (const [tabName, config] of Object.entries(NLP_TABS_CONFIG)) {
    const sheet = getOrCreateNLPSheet(ss, tabName, config);
    if (sheet.isNew) created.push(tabName); else existing.push(tabName);
    sheet.instance.hideSheet();
  }
  Logger.log(`NLP tabs initialized. Created: ${created.length}, Existing: ${existing.length}`);
  return { success: true, created, existing, timestamp: new Date() };
}

function getOrCreateNLPSheet(ss, tabName, config) {
  let sheet = ss.getSheetByName(tabName), isNew = false;
  if (!sheet) {
    sheet = ss.insertSheet(tabName); isNew = true;
    const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
    headerRange.setValues([config.headers]).setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff').setHorizontalAlignment('center');
    config.columnWidths.forEach((width, index) => sheet.setColumnWidth(index + 1, width));
    if (config.sampleData && config.sampleData.length > 0) {
      const sampleRange = sheet.getRange(2, 1, 1, config.sampleData[0].length);
      sampleRange.setValues(config.sampleData).setFontStyle('italic').setFontColor('#666666').setBackground(config.color);
      sheet.getRange(2, 1).setNote('Sample data - bot will add real data below.');
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1).setNote(`🧠 NLP Tab: ${tabName}\nAuto-generated and hidden.\nCreated: ${new Date().toLocaleString()}`);
    sheet.setTabColor(config.color);
    Logger.log(`✅ Created NLP tab: ${tabName}`);
  }
  return { instance: sheet, isNew };
}

function checkNLPTabsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), status = {};
  for (const tabName of Object.keys(NLP_TABS_CONFIG)) {
    const sheet = ss.getSheetByName(tabName);
    status[tabName] = { exists: sheet !== null, hidden: sheet ? sheet.isSheetHidden() : null, rowCount: sheet ? sheet.getLastRow() : 0 };
  }
  return status;
}

function unhideNLPTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), unhidden = [];
  for (const tabName of Object.keys(NLP_TABS_CONFIG)) {
    const sheet = ss.getSheetByName(tabName);
    if (sheet && sheet.isSheetHidden()) { sheet.showSheet(); unhidden.push(tabName); }
  }
  Logger.log(`Unhidden ${unhidden.length} NLP tabs`);
  return { success: true, unhidden, message: `Unhidden ${unhidden.length} NLP tabs` };
}

function hideNLPTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), hidden = [];
  for (const tabName of Object.keys(NLP_TABS_CONFIG)) {
    const sheet = ss.getSheetByName(tabName);
    if (sheet && !sheet.isSheetHidden()) { sheet.hideSheet(); hidden.push(tabName); }
  }
  Logger.log(`Hidden ${hidden.length} NLP tabs`);
  return { success: true, hidden, message: `Hidden ${hidden.length} NLP tabs` };
}

function getLearnedPatterns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NLP_LearnedPatterns');
  if (!sheet) { initializeNLPTabs(); sheet = ss.getSheetByName('NLP_LearnedPatterns'); }
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { patterns: [] };
  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const patterns = data.filter(row => row[0] && (!row[9] || row[9].indexOf('Sample data') === -1)).map(row => ({
    phrase: row[0], command: row[1], confidence: row[2], usageCount: row[3], learnedFrom: row[4],
    learnedAt: row[5], paramPattern: row[6], lastUsed: row[7], successRate: row[8], notes: row[9]
  }));
  return { patterns };
}

function saveLearnedPattern(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NLP_LearnedPatterns');
  if (!sheet) { initializeNLPTabs(); sheet = ss.getSheetByName('NLP_LearnedPatterns'); }
  const lastRow = sheet.getLastRow(), phrases = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  let rowIndex = -1;
  for (let i = 0; i < phrases.length; i++) { if (phrases[i][0] === data.phrase) { rowIndex = i + 2; break; } }
  const rowData = [data.phrase, data.command, data.confidence, data.usageCount, data.learnedFrom,
    data.learnedAt ? new Date(data.learnedAt) : new Date(), data.paramPattern, new Date(), data.successRate || data.confidence, data.notes || ''];
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); else sheet.appendRow(rowData);
  return { success: true, action: rowIndex > 0 ? 'updated' : 'created', phrase: data.phrase, command: data.command };
}

function getUserPreferences() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('NLP_UserPreferences');
  if (!sheet) { initializeNLPTabs(); sheet = ss.getSheetByName('NLP_UserPreferences'); }
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { preferences: [] };
  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const preferences = data.filter(row => row[0] && (!row[8] || row[8].indexOf('Sample data') === -1)).map(row => ({
    userId: row[0], username: row[1], language: row[2], languageScores: row[3] ? JSON.parse(row[3]) : {},
    shortcuts: row[4] ? JSON.parse(row[4]) : {}, messageCount: row[5], lastUpdated: row[6], learningEnabled: row[7], notes: row[8]
  }));
  return { preferences };
}

function syncNLPLearning(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('NLP_LearnedPatterns')) initializeNLPTabs();
  const results = { patterns: { updated: 0, created: 0 }, preferences: { updated: 0, created: 0 }, unrecognized: { updated: 0, created: 0 }, timestamp: new Date() };

  if (data.patterns && data.patterns.length > 0) {
    for (let i = 0; i < data.patterns.length; i++) {
      const result = saveLearnedPattern(data.patterns[i]);
      if (result.action === 'created') results.patterns.created++; else results.patterns.updated++;
    }
  }

  if (data.preferences && data.preferences.length > 0) {
    const sheet = ss.getSheetByName('NLP_UserPreferences');
    for (let i = 0; i < data.preferences.length; i++) {
      const pref = data.preferences[i];
      const rowData = [pref.userId, pref.username || '', pref.language, JSON.stringify(pref.languageScores || {}),
        JSON.stringify(pref.shortcuts || {}), pref.messageCount, new Date(), pref.learningEnabled !== false, pref.notes || ''];
      const lastRow = sheet.getLastRow(), userIds = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
      let rowIndex = -1;
      for (let j = 0; j < userIds.length; j++) { if (userIds[j][0] === pref.userId) { rowIndex = j + 2; break; } }
      if (rowIndex > 0) { sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); results.preferences.updated++; }
      else { sheet.appendRow(rowData); results.preferences.created++; }
    }
  }

  if (data.unrecognized && data.unrecognized.length > 0) {
    const sheet = ss.getSheetByName('NLP_UnrecognizedPhrases');
    for (let i = 0; i < data.unrecognized.length; i++) {
      const phrase = data.unrecognized[i];
      const rowData = [phrase.phrase, phrase.count, phrase.userCount, new Date(phrase.lastSeen),
        phrase.firstSeen ? new Date(phrase.firstSeen) : new Date(), phrase.exampleUsers || '', phrase.suggestedCommand || '', phrase.status || 'Pending Review', phrase.adminNotes || ''];
      const lastRow = sheet.getLastRow(), phrases = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
      let rowIndex = -1;
      for (let j = 0; j < phrases.length; j++) { if (phrases[j][0] === phrase.phrase) { rowIndex = j + 2; break; } }
      if (rowIndex > 0) { sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); results.unrecognized.updated++; }
      else { sheet.appendRow(rowData); results.unrecognized.created++; }
    }
  }

  updateNLPAnalytics(data);
  Logger.log(`NLP Sync: ${JSON.stringify(results)}`);
  return { success: true, results, message: `Synced ${results.patterns.created + results.patterns.updated} patterns, ${results.preferences.created + results.preferences.updated} preferences` };
}

function updateNLPAnalytics(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName('NLP_Analytics');
  if (!sheet) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const totalPatterns = data.patterns ? data.patterns.length : 0, totalUsers = data.preferences ? data.preferences.length : 0;
  const messagesAnalyzed = data.preferences ? data.preferences.reduce(function(sum, p) { return sum + (p.messageCount || 0); }, 0) : 0;
  const topPattern = data.patterns && data.patterns.length > 0 ? data.patterns[0].phrase + ' → ' + data.patterns[0].command : 'None';
  const topUnrecognized = data.unrecognized && data.unrecognized.length > 0 ? data.unrecognized[0].phrase : 'None';
  const languageDist = data.preferences ? data.preferences.reduce(function(acc, p) { acc[p.language] = (acc[p.language] || 0) + 1; return acc; }, {}) : {};
  const rowData = [today, totalPatterns, totalUsers, messagesAnalyzed, data.recognitionRate || 0.0, topPattern, topUnrecognized, JSON.stringify(languageDist), 'Auto-generated'];
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const lastDate = sheet.getRange(lastRow, 1).getValue();
    if (lastDate && lastDate.toDateString() === today.toDateString()) { sheet.getRange(lastRow, 1, 1, rowData.length).setValues([rowData]); return; }
  }
  sheet.appendRow(rowData);
}

function manualInitializeNLP() {
  const result = initializeNLPTabs();
  Logger.log('✅ Manual NLP initialization complete: ' + result.created.join(', '));
  return result;
}
