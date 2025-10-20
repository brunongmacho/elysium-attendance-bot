/**
 * ELYSIUM Guild Attendance Tracker - Version 2.0 (Simplified)
 * 
 * NEW APPROACH:
 * - No SpawnLog needed
 * - Batch attendance submission
 * - Column check before creation
 * - Single column per boss per timestamp
 * - AttendanceLog for audit trail
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
    const action = data.action || 'unknown';
    
    Logger.log(`🔥 Received action: ${action}`);
    Logger.log(`📦 Full payload: ${JSON.stringify(data)}`);
    
    if (action === 'checkColumn') {
      return handleCheckColumn(data);
    }
    
    if (action === 'submitAttendance') {
      return handleSubmitAttendance(data);
    }
    
    Logger.log(`❌ Unknown action: ${action}`);
    return createResponse('error', 'Unknown action: ' + action);
    
  } catch (err) {
    Logger.log('❌ Error in doPost: ' + err.toString());
    Logger.log('❌ Stack trace: ' + err.stack);
    return createResponse('error', err.toString());
  }
}

/**
 * Check if column exists for boss + timestamp
 */
function handleCheckColumn(data) {
  const boss = (data.boss || '').toString().trim().toUpperCase();
  const timestamp = (data.timestamp || '').toString().trim();
  
  Logger.log(`🔍 Checking column: boss=${boss}, timestamp=${timestamp}`);
  
  if (!boss || !timestamp) {
    Logger.log(`❌ Missing data: boss=${boss}, timestamp=${timestamp}`);
    return createResponse('error', 'Missing boss or timestamp');
  }

  const sheet = getCurrentWeekSheet();
  const lastCol = sheet.getLastColumn();
  
  if (lastCol < 5) {
    return createResponse('ok', 'No columns exist', {exists: false});
  }
  
  const row1 = sheet.getRange(1, 5, 1, lastCol - 4).getValues()[0];
  const row2 = sheet.getRange(2, 5, 1, lastCol - 4).getValues()[0];
  
  for (let i = 0; i < row1.length; i++) {
    const cellTimestamp = (row1[i] || '').toString().trim();
    const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
    
    if (cellTimestamp === timestamp && cellBoss === boss) {
      Logger.log(`✅ Column exists: ${boss} at ${timestamp}`);
      return createResponse('ok', 'Column exists', {exists: true, column: i + 5});
    }
  }
  
  Logger.log(`❌ Column not found: ${boss} at ${timestamp}`);
  return createResponse('ok', 'Column does not exist', {exists: false});
}

/**
 * Submit batch attendance and create column
 */
function handleSubmitAttendance(data) {
  const boss = (data.boss || '').toString().trim().toUpperCase();
  const timestamp = (data.timestamp || '').toString().trim();
  const members = data.members || [];
  const date = (data.date || '').toString().trim();
  const time = (data.time || '').toString().trim();
  
  Logger.log(`📝 Submitting attendance: ${boss} at ${timestamp}`);
  Logger.log(`👥 Members (${members.length}): ${members.join(', ')}`);
  
  if (!boss || !timestamp || members.length === 0) {
    return createResponse('error', 'Missing boss, timestamp, or members list');
  }

  const sheet = getCurrentWeekSheet();
  
  // Check if column already exists
  const lastCol = sheet.getLastColumn();
  let targetColumn = null;
  
  if (lastCol >= 5) {
    const row1 = sheet.getRange(1, 5, 1, lastCol - 4).getValues()[0];
    const row2 = sheet.getRange(2, 5, 1, lastCol - 4).getValues()[0];
    
    for (let i = 0; i < row1.length; i++) {
      const cellTimestamp = (row1[i] || '').toString().trim();
      const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
      
      if (cellTimestamp === timestamp && cellBoss === boss) {
        targetColumn = i + 5;
        Logger.log(`⚠️ Column already exists at ${targetColumn}`);
        break;
      }
    }
  }
  
  // If column exists, return error
  if (targetColumn) {
    return createResponse('error', `Column already exists for ${boss} at ${timestamp}. Cannot create duplicate.`);
  }
  
  // Create new column
  const newCol = lastCol + 1;
  
  sheet.getRange(1, newCol)
    .setValue(timestamp)
    .setFontWeight('bold')
    .setBackground('#E8F4F8')
    .setHorizontalAlignment('center');
  
  sheet.getRange(2, newCol)
    .setValue(boss)
    .setFontWeight('bold')
    .setBackground('#E8F4F8')
    .setHorizontalAlignment('center');
  
  sheet.setColumnWidth(newCol, 120);
  
  Logger.log(`✅ Created column ${newCol}: ${timestamp} | ${boss}`);
  
  // Get all members in sheet
  const lastRow = sheet.getLastRow();
  const checkboxRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .build();
  
  if (lastRow >= 3) {
    const memberNames = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
    
    // Mark attendance for each member
    let markedCount = 0;
    let newMembersCount = 0;
    
    for (const member of members) {
      const memberLower = member.toLowerCase();
      let found = false;
      
      // Find member row
      for (let i = 0; i < memberNames.length; i++) {
        const sheetMember = (memberNames[i] || '').toString().trim();
        if (sheetMember.toLowerCase() === memberLower) {
          const row = i + 3;
          const cell = sheet.getRange(row, newCol);
          cell.setDataValidation(checkboxRule);
          cell.setValue(true);
          markedCount++;
          found = true;
          Logger.log(`✅ Marked attendance: ${member} at row ${row}`);
          break;
        }
      }
      
      // If member not found, add them
      if (!found) {
        const newRow = lastRow + newMembersCount + 1;
        sheet.getRange(newRow, 1).setValue(member);
        
        // Initialize all columns with checkboxes
        for (let col = 5; col <= newCol; col++) {
          const cell = sheet.getRange(newRow, col);
          cell.setDataValidation(checkboxRule);
          if (col === newCol) {
            cell.setValue(true); // Mark present for current spawn
          } else {
            cell.setValue(false); // Mark absent for previous spawns
          }
        }
        
        newMembersCount++;
        markedCount++;
        Logger.log(`➕ Added new member: ${member} at row ${newRow}`);
      }
    }
    
    // Mark all other members as absent (unchecked)
    const totalRows = lastRow + newMembersCount;
    if (totalRows >= 3) {
      const allMembers = sheet.getRange(3, 1, totalRows - 2, 1).getValues().flat();
      
      for (let i = 0; i < allMembers.length; i++) {
        const sheetMember = (allMembers[i] || '').toString().trim();
        if (sheetMember === '') continue;
        
        const memberLower = sheetMember.toLowerCase();
        const isPresent = members.some(m => m.toLowerCase() === memberLower);
        
        if (!isPresent) {
          const row = i + 3;
          const cell = sheet.getRange(row, newCol);
          cell.setDataValidation(checkboxRule);
          cell.setValue(false);
        }
      }
    }
    
    Logger.log(`✅ Attendance marked: ${markedCount} present, ${newMembersCount} new members added`);
  } else {
    // No members exist yet, add all from scratch
    let row = 3;
    for (const member of members) {
      sheet.getRange(row, 1).setValue(member);
      
      const cell = sheet.getRange(row, newCol);
      cell.setDataValidation(checkboxRule);
      cell.setValue(true);
      
      row++;
      Logger.log(`➕ Added member: ${member}`);
    }
  }
  
  // Log to AttendanceLog
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  logAttendance(ss, boss, timestamp, members);
  
  return createResponse('ok', `Attendance submitted: ${members.length} members`, {
    column: newCol,
    boss: boss,
    timestamp: timestamp,
    membersCount: members.length
  });
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
    
    Logger.log('✅ Created new weekly sheet: ' + sheetName);
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
      
      Logger.log(`✅ Copied ${members.length} members from previous week`);
    }
  }
}

/**
 * Log attendance to AttendanceLog sheet
 */
function logAttendance(spreadsheet, boss, timestamp, members) {
  try {
    let logSheet = spreadsheet.getSheetByName('AttendanceLog');
    
    if (!logSheet) {
      logSheet = spreadsheet.insertSheet('AttendanceLog');
      logSheet.appendRow(['Timestamp', 'Boss', 'Spawn Time', 'Members', 'Count']);
      logSheet.getRange(1, 1, 1, 5)
        .setFontWeight('bold')
        .setBackground('#4A90E2')
        .setFontColor('#FFFFFF');
      
      Logger.log('✅ Created AttendanceLog sheet');
    }
    
    logSheet.appendRow([
      new Date(),
      boss,
      timestamp,
      members.join(', '),
      members.length
    ]);
    
    Logger.log(`✅ Logged attendance: ${boss} at ${timestamp}`);
  } catch (err) {
    Logger.log('❌ Error logging attendance: ' + err);
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
 * Test column check
 */
function testCheckColumn() {
  Logger.log('=== TESTING CHECK COLUMN ===');
  
  const testPayload = {
    postData: {
      contents: JSON.stringify({
        action: 'checkColumn',
        boss: 'Baron',
        timestamp: '10/19/25 20:30'
      })
    }
  };
  
  const result = doPost(testPayload);
  Logger.log('Result: ' + result.getContent());
}

/**
 * Test attendance submission
 */
function testSubmitAttendance() {
  Logger.log('=== TESTING SUBMIT ATTENDANCE ===');
  
  const testPayload = {
    postData: {
      contents: JSON.stringify({
        action: 'submitAttendance',
        boss: 'Larba',
        date: '10/19/25',
        time: '20:30',
        timestamp: '10/19/25 20:30',
        members: ['TestUser1', 'TestUser2', 'TestUser3']
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
  Logger.log(`📊 Current week: ${sheet.getName()}`);
  Logger.log(`📊 Total columns: ${sheet.getLastColumn()}`);
  Logger.log(`📊 Total rows: ${sheet.getLastRow()}`);
  
  const lastCol = sheet.getLastColumn();
  if (lastCol >= 5) {
    const row1 = sheet.getRange(1, 5, 1, lastCol - 4).getValues()[0];
    const row2 = sheet.getRange(2, 5, 1, lastCol - 4).getValues()[0];
    
    Logger.log('\n📋 Spawn columns:');
    for (let i = 0; i < row1.length; i++) {
      if (row1[i] && row2[i]) {
        Logger.log(`  Column ${i + 5}: ${row1[i]} | ${row2[i]}`);
      }
    }
  } else {
    Logger.log('No spawn columns yet.');
  }
}

/**
 * Show AttendanceLog
 */
function showAttendanceLog() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const logSheet = ss.getSheetByName('AttendanceLog');
  
  if (!logSheet) {
    Logger.log('❌ AttendanceLog sheet does not exist');
    return;
  }
  
  const data = logSheet.getDataRange().getValues();
  
  Logger.log('=== ATTENDANCE LOG ===');
  for (let i = 0; i < data.length; i++) {
    Logger.log(`Row ${i}: ${JSON.stringify(data[i])}`);
  }
}

/**
 * Clear all spawn columns (for testing)
 */
function clearSpawnColumns() {
  const sheet = getCurrentWeekSheet();
  const lastCol = sheet.getLastColumn();
  
  if (lastCol > 4) {
    sheet.deleteColumns(5, lastCol - 4);
    Logger.log(`✅ Deleted columns 5-${lastCol}`);
  } else {
    Logger.log('No spawn columns to delete');
  }
}

/**
 * Clear AttendanceLog (for testing)
 */
function clearAttendanceLog() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const logSheet = ss.getSheetByName('AttendanceLog');
  
  if (!logSheet) {
    Logger.log('❌ AttendanceLog sheet does not exist');
    return;
  }
  
  const lastRow = logSheet.getLastRow();
  if (lastRow > 1) {
    logSheet.deleteRows(2, lastRow - 1);
    Logger.log(`✅ Cleared AttendanceLog (deleted rows 2-${lastRow})`);
  } else {
    Logger.log('AttendanceLog already empty');
  }
}

function quickTest() {
  var payload = {
    postData: {
      contents: JSON.stringify({
        action: 'checkColumn',
        boss: 'Viorent',
        timestamp: '10/20/25 09:10'
      })
    }
  };
  
  var result = doPost(payload);
  Logger.log('Response: ' + result.getContent());
}