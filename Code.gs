/**
 * ELYSIUM Guild Attendance Tracker - Google Apps Script
 * Deploy as Web App: Execute as "Me", Access: "Anyone with the link"
 */

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  SHEET_ID: '1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ', // Your spreadsheet ID from URL
  SHEET_NAME_PREFIX: 'ELYSIUM_WEEK_',
  TIMEZONE: 'GMT+8',
  BOSS_POINTS_SHEET: 'BossPoints' // Optional: sheet with boss names and point values
};

/**
 * Main webhook handler - receives POST requests from Discord bot
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    
    // Extract payload
    const user = (data.user || '').toString().trim();
    const boss = (data.boss || '').toString().trim();
    const spawnLabel = (data.spawnLabel || '').toString().trim();
    const verifier = (data.verifier || '').toString().trim();
    const verifierId = (data.verifierId || '').toString().trim();
    
    if (!user || !boss) {
      return createResponse('error', 'Missing user or boss name');
    }

    // Get or create weekly sheet
    const sheet = getOrCreateWeekSheet();
    
    // Before creating a new spawn column, mark absent members for the previous spawn
    markAbsentForLastSpawn(sheet);
    
    // Create column for this spawn (returns the boss-row header string)
    const columnHeader = createSpawnColumn(sheet, boss, spawnLabel);
    
    // Find or create user row
    const userRow = getOrCreateUserRow(sheet, user);
    
    // Check for duplicate attendance
    const duplicate = checkDuplicate(sheet, userRow, boss, spawnLabel);
    if (duplicate) {
      return createResponse('duplicate', 'User already marked present for this boss/spawn');
    }
    
    // Mark attendance: find column by boss-row header and set checkbox to checked
    const columnIndex = findColumnByHeader(sheet, columnHeader); // searches row 2 first
    if (columnIndex <= 0) {
      return createResponse('error', 'Unable to find spawn column');
    }
    sheet.getRange(userRow, columnIndex).setValue(true); // checkbox => checked
    
    // Only log verification, no points calculation
    logVerification(user, boss, columnHeader, verifier, null);
    
    return createResponse('ok', `Attendance recorded: ${user} for ${boss}`, {
      column: columnHeader
    });
    
  } catch (err) {
    Logger.log('Error in doPost: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Get or create the current week's sheet
 */
function getOrCreateWeekSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const now = new Date();
  
  // Calculate Sunday of current week
  const sunday = new Date(now);
  const dayOfWeek = sunday.getDay();
  const diff = sunday.getDate() - dayOfWeek;
  sunday.setDate(diff);
  
  // Format sheet name: ELYSIUM_WEEK_20241020
  const weekIndex = Utilities.formatDate(sunday, CONFIG.TIMEZONE, 'yyyyMMdd');
  const sheetName = CONFIG.SHEET_NAME_PREFIX + weekIndex;
  
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    // Create new weekly sheet
    sheet = ss.insertSheet(sheetName);
    
    // Set up two header rows (row1 = date for spawn columns, row2 = boss names)
    // Fixed columns in col 1-4: use both header rows for labels
    sheet.getRange(1, 1).setValue('Members').setFontWeight('bold');
    sheet.getRange(2, 1).setValue('Members').setFontWeight('bold');
    sheet.getRange(1, 2).setValue('Points Consumed').setFontWeight('bold');
    sheet.getRange(2, 2).setValue('Points Consumed').setFontWeight('bold');
    sheet.getRange(1, 3).setValue('Points Left').setFontWeight('bold');
    sheet.getRange(2, 3).setValue('Points Left').setFontWeight('bold');
    sheet.getRange(1, 4).setValue('Attendance').setFontWeight('bold');
    sheet.getRange(2, 4).setValue('Attendance').setFontWeight('bold');
    
    // Format header rows
    sheet.getRange(1, 1, 2, 4)
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('center');
    
    // Set column widths
    sheet.setColumnWidth(1, 150); // Members
    sheet.setColumnWidth(2, 120); // Points Consumed
    sheet.setColumnWidth(3, 100); // Points Left
    sheet.setColumnWidth(4, 100); // Attendance
    
    // Ensure there is at least row 3 for members (members start at row 3)
    sheet.getRange(3,1).activate();
    
    // Copy members from previous week if exists
    copyMembersFromPreviousWeek(ss, sheet);

    // No formulas for points/attendance, just structure
    Logger.log('Created new weekly sheet: ' + sheetName);
  }
  
  return sheet;
}

/**
 * Copy member list from most recent previous week sheet
 */
function copyMembersFromPreviousWeek(spreadsheet, newSheet) {
  const allSheets = spreadsheet.getSheets();
  const weekSheets = allSheets
    .filter(s => s.getName().indexOf(CONFIG.SHEET_NAME_PREFIX) === 0)
    .sort((a, b) => b.getName().localeCompare(a.getName()));

  if (weekSheets.length > 1) {
    const prevSheet = weekSheets[1]; // Second in sorted list (most recent before new one)
    const lastRow = prevSheet.getLastRow();

    // Previous sheet members start at row 3 (we use the same convention)
    if (lastRow >= 3) {
      const members = prevSheet.getRange(3, 1, lastRow - 2, 1).getValues();
      for (let i = 0; i < members.length; i++) {
        const memberName = members[i][0];
        if (memberName) {
          const row = i + 3;
          newSheet.getRange(row, 1).setValue(memberName);
          newSheet.getRange(row, 2).setValue(0); // Points Consumed (leave for your formula)
          // Do not set formulas for points/attendance
        }
      }
      Logger.log(`Copied ${members.length} members from previous week`);
    }
  }
}

/**
 * Create a new column for this spawn event
 * Now uses two header rows: row1=date, row2=boss name (#n)
 * Ensures member cells are checkboxes and sets them unchecked by default (absent)
 */
function createSpawnColumn(sheet, boss, spawnLabel) {
  const dateStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M/d/yy');
  // Determine boss header pattern and numbering using row 2
  const lastCol = sheet.getLastColumn();
  const headersRow2 = lastCol >= 1 ? sheet.getRange(2, 1, 1, lastCol).getValues()[0] : [];
  let maxSpawnNum = 0;
  // Use pure boss name for pattern matching (strip date if present in spawnLabel)
  const bossName = getBossNameFromLabel(spawnLabel || boss);
  const headerPattern = bossName;
  
  for (let i = 0; i < headersRow2.length; i++) {
    const header = (headersRow2[i] || '').toString();
    if (header.indexOf(headerPattern) === 0) {
      const match = header.match(/#(\d+)/);
      if (match) {
        maxSpawnNum = Math.max(maxSpawnNum, Number(match[1]));
      } else {
        maxSpawnNum = Math.max(maxSpawnNum, 1);
      }
    }
  }
  
  // Create new column header values
  const spawnNum = maxSpawnNum + 1;
  // bossHeader should be only boss name plus numbering if applicable
  const bossHeader = `${bossName} #${spawnNum}`;
  const dateHeader = dateStr; // row1
  
  const newCol = lastCol + 1;
  // Set row1 = date, row2 = boss
  sheet.getRange(1, newCol).setValue(dateHeader).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#E8F4F8');
  sheet.getRange(2, newCol).setValue(bossHeader).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#E8F4F8');
  sheet.setColumnWidth(newCol, 120);
  
  // Apply checkbox validation for member rows (members start at row 3)
  const maxRows = sheet.getMaxRows();
  const numMemberRows = Math.max(1, maxRows - 2);
  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  // Ensure there are enough rows (if sheet had no members yet, ensure at least one data row)
  if (maxRows < 3) {
    sheet.insertRowsAfter(2, 1);
  }
  // Set checkboxes for entire column down to max rows so future rows have validation
  const targetRange = sheet.getRange(3, newCol, Math.max(1, sheet.getMaxRows() - 2));
  targetRange.setDataValidation(checkboxRule);
  // Initialize visible existing member cells to unchecked (false)
  const existingLastRow = sheet.getLastRow();
  if (existingLastRow >= 3) {
    sheet.getRange(3, newCol, existingLastRow - 2).setValue(false);
  }
  
  return bossHeader; // return the boss-row header for locating the column
}

/**
 * Extract boss name from a label that may include a date or pipe.
 * Examples:
 *  "10/18/24 | Venatus #1" -> "Venatus"
 *  "Venatus #2"            -> "Venatus"
 *  "Venatus"               -> "Venatus"
 */
function getBossNameFromLabel(label) {
  if (!label) return '';
  // If label contains '|' assume format "date | Boss ..." and take RHS
  if (label.indexOf('|') !== -1) {
    label = label.split('|').pop().trim();
  }
  // Remove trailing numbering like "#1" for base name extraction, but keep it out of name
  // We want the pure boss name for matching; numbering will be added separately when creating headers.
  label = label.replace(/#\d+$/,'').trim();
  return label;
}

/**
 * Find column index by header name (searches row 2 first, then row 1)
 */
function findColumnByHeader(sheet, headerName) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return -1;
  const row1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row2 = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  
  for (let i = 0; i < lastCol; i++) {
    if ((row2[i] || '').toString() === headerName) {
      return i + 1;
    }
  }
  for (let i = 0; i < lastCol; i++) {
    if ((row1[i] || '').toString() === headerName) {
      return i + 1;
    }
  }
  
  return -1;
}

/**
 * Find or create user row (members start at row 3)
 */
function getOrCreateUserRow(sheet, username) {
  // Find last non-empty member in column 1 (members start at row 3)
  const maxRows = sheet.getMaxRows();
  const memberRange = sheet.getRange(3, 1, Math.max(1, maxRows - 2));
  const members = memberRange.getValues().map(r => (r[0] || '').toString().trim());

  // Search for existing user (case-insensitive)
  for (let i = 0; i < members.length; i++) {
    if (members[i].toLowerCase() === username.toLowerCase()) {
      return i + 3; // row number in sheet
    }
  }

  // Not found, add new row
  let lastMemberRel = 0;
  for (let i = 0; i < members.length; i++) {
    if (members[i]) lastMemberRel = i + 1;
  }
  let newRow;
  if (lastMemberRel === 0) {
    newRow = 3;
  } else {
    const lastMemberRow = lastMemberRel + 2;
    sheet.insertRowAfter(lastMemberRow);
    newRow = lastMemberRow + 1;
  }
  sheet.getRange(newRow, 1).setValue(username);
  sheet.getRange(newRow, 2).setValue(0); // Points Consumed (leave for your formula)
  // Do not set formulas for points/attendance
  
  Logger.log('Added new member: ' + username + ' at row ' + newRow);
  return newRow;
}

/**
 * Check if user already marked for this boss/date
 * Now uses row2 for boss headers and row1 for dates
 */
function checkDuplicate(sheet, userRow, boss, spawnLabel) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 4) return false;
  const headersRow1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headersRow2 = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const userValues = sheet.getRange(userRow, 1, 1, lastCol).getValues()[0];
  
  // If spawnLabel provided, normalize to boss name and match row2 (headers contain boss name + "#n")
  if (spawnLabel) {
    const spawnBossName = getBossNameFromLabel(spawnLabel);
    for (let i = 0; i < lastCol; i++) {
      const headerBoss = (headersRow2[i] || '').toString();
      if (headerBoss.indexOf(spawnBossName) === 0) {
        const value = userValues[i];
        if (value === true) {
          return true;
        }
      }
    }
  }
  
  // Check for same boss and date (compare row1 date and row2 boss start)
  const dateStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M/d/yy');
  for (let i = 0; i < lastCol; i++) {
    const dateCell = (headersRow1[i] || '').toString();
    const bossCell = (headersRow2[i] || '').toString();
    if (dateCell === dateStr && bossCell.indexOf(boss) === 0) {
      const value = userValues[i];
      if (value === true) {
        return true; // Already checked for this boss today
      }
    }
  }
  
  return false;
}

/**
 * Mark absent for the last spawn column: ensure all member checkboxes are explicitly unchecked
 * This is called before creating a new spawn column to finalize the prior spawn.
 */
function markAbsentForLastSpawn(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol <= 4) return; // no spawn columns yet
  const lastSpawnCol = lastCol; // last column is the most recent spawn
  // Member rows start at 3
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  const memberRange = sheet.getRange(3, lastSpawnCol, lastRow - 2);
  // Ensure checkbox validation exists for this column
  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  memberRange.setDataValidation(checkboxRule);
  // For any blank/empty cells or non-true values, set explicitly false (unchecked)
  const values = memberRange.getValues();
  for (let r = 0; r < values.length; r++) {
    if (values[r][0] !== true) {
      values[r][0] = false;
    }
  }
  memberRange.setValues(values);
}

/**
 * Log verification in audit log sheet
 */
function logVerification(user, boss, column, verifier, points) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    let logSheet = ss.getSheetByName('AttendanceLog');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('AttendanceLog');
      logSheet.appendRow(['Timestamp', 'User', 'Boss', 'Column', 'Verifier', 'Points']);
      logSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
    }
    
    logSheet.appendRow([
      new Date(),
      user,
      boss,
      column,
      verifier || 'System',
      points
    ]);
  } catch (err) {
    Logger.log('Error logging verification: ' + err);
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

/**
 * Test function - run this to verify setup
 */
function testWebhook() {
  const testUser = 'TestUser';
  const sheet = getOrCreateWeekSheet();
  // Ensure member exists
  getOrCreateUserRow(sheet, testUser);

  const testPayload = {
    postData: {
      contents: JSON.stringify({
        user: testUser,
        boss: 'Milavy',
        spawnLabel: 'Milavy #1',
        verifier: 'AdminTest',
        verifierId: '123456789'
      })
    }
  };

  const result = doPost(testPayload);
  Logger.log(result.getContent());
}

function testWebhookAdditional() {
  const sheet = getOrCreateWeekSheet();

  // Ensure members exist
  getOrCreateUserRow(sheet, 'AutoTest1');
  getOrCreateUserRow(sheet, 'AutoTest2');

  // 1) Record attendance for AutoTest1 (explicit spawnLabel using boss name only)
  const payload1 = {
    postData: {
      contents: JSON.stringify({
        user: 'AutoTest1',
        boss: 'Milavy',
        spawnLabel: 'Milavy #1',
        verifier: 'UnitTest'
      })
    }
  };
  const res1 = doPost(payload1);
  Logger.log('testWebhookAdditional - first record: ' + res1.getContent());

  // 2) Attempt duplicate for same user/spawn
  const res2 = doPost(payload1);
  Logger.log('testWebhookAdditional - duplicate attempt: ' + res2.getContent());

  // 3) Record attendance for AutoTest2 without spawnLabel (auto-create spawn column)
  const payload3 = {
    postData: {
      contents: JSON.stringify({
        user: 'AutoTest2',
        boss: 'Venatus',
        verifier: 'UnitTest'
      })
    }
  };
  const res3 = doPost(payload3);
  Logger.log('testWebhookAdditional - auto spawn record: ' + res3.getContent());
}

/**
 * Get boss point value from BossPoints sheet or default to 1
 */
function getBossPoints(boss) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const bpSheet = ss.getSheetByName(CONFIG.BOSS_POINTS_SHEET);
    if (bpSheet) {
      const data = bpSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) { // Skip header row
        const bossName = (data[i][0] || '').toString().trim().toLowerCase();
        if (bossName === boss.toLowerCase()) {
          return Number(data[i][1]) || 1;
        }
      }
    }
  } catch (err) {
    Logger.log('Error reading boss points: ' + err);
  }
  return 1; // Default
}