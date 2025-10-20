/**
 * ELYSIUM Guild Attendance Tracker - Google Apps Script (Enhanced)
 * 
 * Features:
 * - Weekly sheets (ELYSIUM_WEEK_YYYYMMDD)
 * - Checkbox-based attendance
 * - Boss spawn numbering (BARON #1, #2, #3)
 * - Finalize spawn (mark absent members)
 * - Auto-add new members
 * - Audit logging
 */

// ==========================================
// CONFIGURATION  
// ==========================================
const CONFIG = {
  SHEET_ID: '1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ',
  SHEET_NAME_PREFIX: 'ELYSIUM_WEEK_',
  BOSS_POINTS_SHEET: 'BossPoints',
  TIMEZONE: 'Asia/Manila',
  DATE_FORMAT: 'M/d/yy'
};

/**
 * Main webhook handler
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const action = data.action || 'recordAttendance';
    
    Logger.log(`📥 Received action: ${action}`);
    
    if (action === 'createColumn') {
      return handleCreateColumn(data);
    }
    
    if (action === 'recordAttendance') {
      return handleAttendance(data);
    }
    
    if (action === 'finalizeSpawn') {
      return handleFinalizeSpawn(data);
    }
    
    return createResponse('error', 'Unknown action: ' + action);
    
  } catch (err) {
    Logger.log('❌ Error in doPost: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Handle column creation when thread is created
 */
function handleCreateColumn(data) {
  const threadId = (data.threadId || '').toString().trim();
  const boss = (data.boss || '').toString().trim();
  const spawnNum = data.spawnNum || 1;
  const date = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  
  if (!threadId || !boss) {
    return createResponse('error', 'Missing threadId or boss');
  }

  const sheet = getCurrentWeekSheet();
  const spawnLog = getOrCreateSpawnLog();
  
  // Check if this thread already has a column
  const existingColumn = findColumnByThreadId(spawnLog, threadId);
  if (existingColumn) {
    return createResponse('ok', 'Column already exists', {column: existingColumn});
  }
  
  // Create the column
  const columnInfo = createBossColumn(sheet, boss, date, spawnNum);
  
  // Log the thread ID → column mapping
  spawnLog.appendRow([
    new Date(),
    threadId,
    boss,
    spawnNum,
    date,
    columnInfo.column,
    columnInfo.bossName
  ]);
  
  Logger.log(`✅ Created column for thread ${threadId}: ${columnInfo.bossName}`);
  
  return createResponse('ok', 'Column created', {
    column: columnInfo.column,
    bossName: columnInfo.bossName
  });
}

/**
 * Handle attendance recording
 */
function handleAttendance(data) {
  const threadId = (data.threadId || '').toString().trim();
  const user = (data.user || '').toString().trim();
  const verifier = (data.verifier || '').toString().trim();
  
  if (!threadId || !user) {
    return createResponse('error', 'Missing threadId or user');
  }

  const sheet = getCurrentWeekSheet();
  const spawnLog = getOrCreateSpawnLog();
  
  // Find the column for this thread
  const columnIndex = findColumnByThreadId(spawnLog, threadId);
  
  if (!columnIndex) {
    return createResponse('error', 'Spawn column not found for this thread');
  }
  
  // Find or create user row
  const userRow = getUserRow(sheet, user);
  
  // Check for duplicate
  const alreadyMarked = checkIfAlreadyMarked(sheet, userRow, columnIndex);
  if (alreadyMarked) {
    return createResponse('duplicate', 'User already marked');
  }
  
  // Mark attendance
  setCheckbox(sheet, userRow, columnIndex, true);
  
  // Log verification
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const bossInfo = getBossInfoFromColumn(spawnLog, columnIndex);
  logVerification(ss, user, bossInfo.boss, bossInfo.bossName, verifier);
  
  return createResponse('ok', `Attendance recorded: ${user}`, {
    column: bossInfo.bossName
  });
}

/**
 * Handle spawn finalization - mark all absent members
 */
function handleFinalizeSpawn(data) {
  const boss = (data.boss || '').toString().trim();
  const spawnNum = data.spawnNum || 1;
  const date = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  
  const sheet = getCurrentWeekSheet();
  if (!sheet) {
    return createResponse('error', 'Could not get current week sheet');
  }
  
  // Find the column for this specific spawn
  const targetBossName = `${boss.toUpperCase()} #${spawnNum}`;
  const lastCol = sheet.getLastColumn();
  
  const dates = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const bosses = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  
  let targetColumn = -1;
  for (let i = 4; i < dates.length; i++) {
    const cellDate = (dates[i] || '').toString().trim();
    const cellBoss = (bosses[i] || '').toString().trim();
    
    if (cellDate === date && cellBoss === targetBossName) {
      targetColumn = i + 1;
      break;
    }
  }
  
  if (targetColumn === -1) {
    return createResponse('error', `Could not find spawn column: ${targetBossName}`);
  }
  
  // Mark all empty cells in this column as UNCHECKED
  const lastRow = sheet.getLastRow();
  if (lastRow >= 3) {
    const memberRange = sheet.getRange(3, targetColumn, lastRow - 2, 1);
    const values = memberRange.getValues();
    
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] !== true) {
        const cellRow = i + 3;
        setCheckbox(sheet, cellRow, targetColumn, false);
      }
    }
  }
  
  Logger.log(`🔒 Finalized spawn: ${targetBossName}`);
  return createResponse('ok', `Spawn finalized: ${targetBossName}`);
}

/**
 * Get or create current week's sheet
 */
function getCurrentWeekSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const now = new Date();
  
  // Calculate Sunday
  const sunday = new Date(now);
  const dayOfWeek = sunday.getDay();
  const diff = sunday.getDate() - dayOfWeek;
  sunday.setDate(diff);
  
  const weekIndex = Utilities.formatDate(sunday, CONFIG.TIMEZONE, 'yyyyMMdd');
  const sheetName = CONFIG.SHEET_NAME_PREFIX + weekIndex;
  
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    
    sheet.getRange(1, 1).setValue('MEMBERS').setFontWeight('bold');
    sheet.getRange(1, 2).setValue('POINTS CONSUMED').setFontWeight('bold');
    sheet.getRange(1, 3).setValue('POINTS LEFT').setFontWeight('bold');
    sheet.getRange(1, 4).setValue('ATTENDANCE POINTS').setFontWeight('bold');
    
    sheet.getRange(1, 1, 1, 4)
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('center');
    
    sheet.getRange(2, 1, 1, 4)
      .setBackground('#E8F4F8');
    
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 150);
    
    copyMembersFromPreviousWeek(ss, sheet);
    
    Logger.log('Created new weekly sheet: ' + sheetName);
  }
  
  return sheet;
}

/**
 * Copy members from previous week
 */
function copyMembersFromPreviousWeek(spreadsheet, newSheet) {
  const allSheets = spreadsheet.getSheets();
  const weekSheets = allSheets
    .filter(s => s.getName().indexOf(CONFIG.SHEET_NAME_PREFIX) === 0)
    .sort((a, b) => b.getName().localeCompare(a.getName()));
  
  if (weekSheets.length > 1) {
    const prevSheet = weekSheets[1];
    const lastRow = prevSheet.getLastRow();
    
    if (lastRow >= 3) {
      const members = prevSheet.getRange(3, 1, lastRow - 2, 1).getValues();
      
      for (let i = 0; i < members.length; i++) {
        const memberName = members[i][0];
        if (memberName && memberName.toString().trim() !== '') {
          newSheet.getRange(i + 3, 1).setValue(memberName);
        }
      }
      
      Logger.log(`Copied ${members.length} members from previous week`);
    }
  }
}

/**
 * Find or create boss spawn column with numbering
 */
function findOrCreateBossColumn(sheet, bossName) {
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  const lastCol = sheet.getLastColumn();
  
  const dates = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const bosses = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  
  // Count spawns of this boss today
  let spawnCount = 0;
  for (let i = 4; i < dates.length; i++) {
    const cellDate = (dates[i] || '').toString().trim();
    const cellBoss = (bosses[i] || '').toString().trim().toUpperCase();
    
    if (cellDate === today) {
      const escapedBoss = bossName.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const bossPattern = new RegExp(`^${escapedBoss}(\\s*#\\d+)?$`, 'i');
      if (bossPattern.test(cellBoss)) {
        spawnCount++;
      }
    }
  }
  
  const spawnNumber = spawnCount + 1;
  const formattedBossName = `${bossName.toUpperCase()} #${spawnNumber}`;
  
  // Create new column
  const newCol = lastCol + 1;
  
  sheet.getRange(1, newCol)
    .setValue(today)
    .setFontWeight('bold')
    .setBackground('#E8F4F8')
    .setHorizontalAlignment('center');
  
  sheet.getRange(2, newCol)
    .setValue(formattedBossName)
    .setFontWeight('bold')
    .setBackground('#E8F4F8')
    .setHorizontalAlignment('center');
  
  sheet.setColumnWidth(newCol, 120);
  
  // Initialize all members with UNCHECKED checkboxes
  const lastRow = sheet.getLastRow();
  if (lastRow >= 3) {
    const checkboxRule = SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .setAllowInvalid(false)
      .build();
    
    const memberRange = sheet.getRange(3, newCol, lastRow - 2, 1);
    memberRange.setDataValidation(checkboxRule);
    
    const uncheckedValues = [];
    for (let i = 0; i < lastRow - 2; i++) {
      uncheckedValues.push([false]);
    }
    memberRange.setValues(uncheckedValues);
  }
  
  Logger.log(`Created: ${today} - ${formattedBossName}`);
  
  return {
    column: newCol,
    bossName: formattedBossName
  };
}

/**
 * Get or create user row
 */
function getUserRow(sheet, username) {
  const lastRow = sheet.getLastRow();
  
  if (lastRow >= 3) {
    const members = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
    
    for (let i = 0; i < members.length; i++) {
      const memberName = (members[i] || '').toString().trim();
      if (memberName !== '' && memberName.toLowerCase() === username.toLowerCase()) {
        Logger.log(`Found member: ${username} at row ${i + 3}`);
        return i + 3;
      }
    }
  }
  
  // Add new member
  const newRow = lastRow + 1;
  sheet.getRange(newRow, 1).setValue(username);
  
  // Initialize checkboxes for all existing spawn columns
  const lastCol = sheet.getLastColumn();
  if (lastCol >= 5) {
    const checkboxRule = SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .setAllowInvalid(false)
      .build();
    
    for (let col = 5; col <= lastCol; col++) {
      const cell = sheet.getRange(newRow, col);
      cell.setDataValidation(checkboxRule);
      cell.setValue(false);
    }
  }
  
  Logger.log(`Added new member: ${username} at row ${newRow}`);
  return newRow;
}

/**
 * Set checkbox value
 */
function setCheckbox(sheet, row, col, checked) {
  const cell = sheet.getRange(row, col);
  
  const checkboxRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .build();
  
  cell.setDataValidation(checkboxRule);
  cell.setValue(checked);
}

/**
 * Check if already marked
 */
function checkIfAlreadyMarked(sheet, userRow, columnIndex) {
  const cellValue = sheet.getRange(userRow, columnIndex).getValue();
  return cellValue === true;
}

/**
 * Log verification
 */
function logVerification(spreadsheet, user, boss, column, verifier) {
  try {
    let logSheet = spreadsheet.getSheetByName('AttendanceLog');
    
    if (!logSheet) {
      logSheet = spreadsheet.insertSheet('AttendanceLog');
      logSheet.appendRow(['Timestamp', 'User', 'Boss', 'Column', 'Verifier']);
      logSheet.getRange(1, 1, 1, 5)
        .setFontWeight('bold')
        .setBackground('#4A90E2')
        .setFontColor('#FFFFFF');
    }
    
    logSheet.appendRow([
      new Date(),
      user,
      boss,
      column,
      verifier || 'System'
    ]);
  } catch (err) {
    Logger.log('Error logging: ' + err);
  }
}

/**
 * Create JSON response
 */
function createResponse(status, message, data) {
  const response = {
    status: status,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  if (data) {
    Object.assign(response, data);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// TEST FUNCTIONS
// ==========================================

/**
 * Test attendance recording
 */
function testAttendance() {
  Logger.log('=== TESTING ATTENDANCE ===');
  
  const testPayload = {
    postData: {
      contents: JSON.stringify({
        action: 'attendance',
        user: 'TestUser',
        boss: 'Larba',
        verifier: 'AdminTest'
      })
    }
  };
  
  const result = doPost(testPayload);
  Logger.log('Result: ' + result.getContent());
}

/**
 * Test spawn finalization
 */
function testFinalize() {
  Logger.log('=== TESTING FINALIZE ===');
  
  const testPayload = {
    postData: {
      contents: JSON.stringify({
        action: 'finalizeSpawn',
        boss: 'Larba',
        spawnNum: 1,
        date: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT)
      })
    }
  };
  
  const result = doPost(testPayload);
  Logger.log('Result: ' + result.getContent());
}

/**
 * Show current week info
 */
function showCurrentWeek() {
  const sheet = getCurrentWeekSheet();
  Logger.log(`Current week: ${sheet.getName()}`);
  Logger.log(`Total columns: ${sheet.getLastColumn()}`);
  Logger.log(`Total rows: ${sheet.getLastRow()}`);
  
  const lastCol = sheet.getLastColumn();
  if (lastCol >= 5) {
    const dates = sheet.getRange(1, 5, 1, lastCol - 4).getValues()[0];
    const bosses = sheet.getRange(2, 5, 1, lastCol - 4).getValues()[0];
    
    Logger.log('\nSpawn columns:');
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] && bosses[i]) {
        Logger.log(`  ${dates[i]} - ${bosses[i]}`);
      }
    }
  }
}