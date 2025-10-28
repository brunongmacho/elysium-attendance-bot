/**
 * ELYSIUM Guild System - Google Apps Script v5.0
 * NEW: Auto-populate 0 for all members in bidding results
 */

const CONFIG = {
  SHEET_ID: '1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ',
  SHEET_NAME_PREFIX: 'ELYSIUM_WEEK_',
  BOSS_POINTS_SHEET: 'BossPoints',
  BIDDING_SHEET: 'BiddingPoints',
  TIMEZONE: 'Asia/Manila',
};

const COLUMNS = {
  MEMBERS: 1,
  POINTS_CONSUMED: 2,
  POINTS_LEFT: 3,
  ATTENDANCE_POINTS: 4,
  FIRST_SPAWN: 5,
};

// MAIN WEBHOOK HANDLER - COMPLETE VERSION
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const action = data.action || 'unknown';

    Logger.log(`🔥 Action: ${action}`);

    // Attendance actions
    if (action === 'getAttendanceForBoss') return getAttendanceForBoss(data);
    if (action === 'checkColumn') return handleCheckColumn(data);
    if (action === 'submitAttendance') return handleSubmitAttendance(data);
    if (action === 'getAttendanceState') return getAttendanceState(data);
    if (action === 'saveAttendanceState') return saveAttendanceState(data);
    if (action === 'getAllSpawnColumns') return getAllSpawnColumns(data);
    
    // Bidding actions
    if (action === 'getBiddingPoints') return handleGetBiddingPoints(data);
    if (action === 'submitBiddingResults') return handleSubmitBiddingResults(data);
    if (action === 'getBiddingItems') return getBiddingItems(data);
    if (action === 'logAuctionResult') return logAuctionResult(data);
    if (action === 'getBotState') return getBotState(data);
    if (action === 'saveBotState') return saveBotState(data);
    if (action === 'moveQueueItemsToSheet') return moveQueueItemsToSheet(data);

    // ⭐ LOOT LOGGER ACTIONS - ADD THESE THREE LINES! ⭐
    if (action === 'submitLootEntries') return handleSubmitLootEntries(data);
    if (action === 'getLootState') return getLootState(data);
    if (action === 'saveLootState') return saveLootState(data);

    Logger.log(`❌ Unknown: ${action}`);
    return createResponse('error', 'Unknown action: ' + action);

  } catch (err) {
    Logger.log('❌ Error: ' + err.toString());
    Logger.log(err.stack);
    return createResponse('error', err.toString());
  }
}

// ATTENDANCE FUNCTIONS
function handleCheckColumn(data) {
  const boss = (data.boss || '').toString().trim().toUpperCase();
  const timestamp = (data.timestamp || '').toString().trim();
  
  if (!boss || !timestamp) return createResponse('error', 'Missing boss or timestamp');
  
  const sheet = getCurrentWeekSheet();
  const lastCol = sheet.getLastColumn();
  
  if (lastCol < COLUMNS.FIRST_SPAWN) return createResponse('ok', 'No columns', {exists: false});
  
  const spawnData = sheet.getRange(1, COLUMNS.FIRST_SPAWN, 2, lastCol - COLUMNS.FIRST_SPAWN + 1).getValues();
  const row1 = spawnData[0];
  const row2 = spawnData[1];
  
  for (let i = 0; i < row1.length; i++) {
    if ((row1[i] || '').toString().trim() === timestamp && (row2[i] || '').toString().trim().toUpperCase() === boss) {
      return createResponse('ok', 'Column exists', {exists: true, column: i + COLUMNS.FIRST_SPAWN});
    }
  }
  
  return createResponse('ok', 'Does not exist', {exists: false});
}

function getAllSpawnColumns(data) {
  const weekSheet = data.weekSheet || '';
  
  if (!weekSheet) {
    return createResponse('error', 'Missing weekSheet parameter', {columns: []});
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(weekSheet);
  
  if (!sheet) {
    Logger.log(`⚠️ Sheet not found: ${weekSheet}`);
    return createResponse('ok', 'Sheet not found', {columns: []});
  }
  
  const lastCol = sheet.getLastColumn();
  
  if (lastCol < COLUMNS.FIRST_SPAWN) {
    return createResponse('ok', 'No spawn columns', {columns: []});
  }
  
  const spawnData = sheet.getRange(1, COLUMNS.FIRST_SPAWN, 2, lastCol - COLUMNS.FIRST_SPAWN + 1).getValues();
  const row1 = spawnData[0]; // Timestamps
  const row2 = spawnData[1]; // Boss names
  
  const columns = [];
  
  for (let i = 0; i < row1.length; i++) {
    const timestamp = (row1[i] || '').toString().trim();
    const boss = (row2[i] || '').toString().trim().toUpperCase();
    
    if (timestamp && boss) {
      columns.push({
        timestamp: timestamp,
        boss: boss,
        column: i + COLUMNS.FIRST_SPAWN
      });
    }
  }
  
  Logger.log(`✅ Found ${columns.length} spawn columns in ${weekSheet}`);
  return createResponse('ok', 'Columns fetched', {columns: columns});
}

function handleSubmitLootEntries(data) {
  const entries = data.entries || [];
  
  if (!entries || entries.length === 0) {
    Logger.log('❌ No loot entries provided');
    return createResponse('error', 'No loot entries provided', {submitted: 0});
  }

  Logger.log(`📦 Received ${entries.length} loot entries`);
  
  try {
    const lock = LockService.getScriptLock();
    try { 
      lock.waitLock(30000); 
    } catch (e) { 
      Logger.log('❌ Lock timeout');
      return createResponse('error', 'Lock timeout'); 
    }

    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      let biddingItemsSheet = ss.getSheetByName('BiddingItems');

      // Create sheet if doesn't exist
      if (!biddingItemsSheet) {
        Logger.log('📋 Creating BiddingItems sheet...');
        biddingItemsSheet = ss.insertSheet('BiddingItems');
        
        // Set headers (12 columns total: A-L)
        biddingItemsSheet.getRange(1, 1, 1, 12).setValues([[
          'Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid', 
          'Auction Start', 'Auction End', 'Timestamp', 'Total Bids', 'Source', 'Quantity', 'Boss'
        ]])
        .setFontWeight('bold')
        .setBackground('#4A90E2')
        .setFontColor('#FFFFFF');
        
        // Set column widths
        biddingItemsSheet.setColumnWidth(1, 200);  // Item
        biddingItemsSheet.setColumnWidth(10, 100); // Source
        biddingItemsSheet.setColumnWidth(11, 80);  // Quantity
        biddingItemsSheet.setColumnWidth(12, 200); // Boss
        
        Logger.log('✅ BiddingItems sheet created');
      }

      // STEP 1: Save pending entries to _LootState (for recovery)
      const pendingState = {
        pendingEntries: entries,
        timestamp: new Date().toISOString(),
        status: 'processing'
      };
      
      saveLootState({state: pendingState});
      Logger.log('💾 Saved loot state for recovery');

      // Find last row (skip header)
      const lastRow = Math.max(biddingItemsSheet.getLastRow(), 1);
      let insertRow = lastRow + 1;
      
      Logger.log(`📊 Last row: ${lastRow}, inserting at row: ${insertRow}`);

      let successCount = 0;
      let failCount = 0;
      const submittedItems = [];

      // STEP 2: Add each loot entry
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        
        try {
          const item = (entry.item || '').toString().trim();
          const rawSource = (entry.source || 'LOOT').toString().trim();
          const quantity = parseInt(entry.quantity) || 1;
          const rawBoss = (entry.boss || '').toString().trim();

          // Validate item
          if (!item || item.length < 3) {
            Logger.log(`⚠️ Skipping invalid item: "${item}"`);
            failCount++;
            continue;
          }

          // FIX 1: Format Source - proper case (not all caps)
          let source;
          if (rawSource.toUpperCase() === 'LOOT') {
            source = 'Loot';
          } else if (rawSource.toUpperCase() === 'GUILD BOSS') {
            source = 'Guild Boss';
          } else {
            source = rawSource; // Keep as-is if unknown
          }

          // FIX 2: Format Boss - all uppercase
          const boss = rawBoss.toUpperCase();

          Logger.log(`📝 Adding item ${i + 1}: ${item} (qty: ${quantity}, source: ${source}, boss: ${boss})`);

          // FIX 3: Build row data WITHOUT Column H (Timestamp)
          // We'll leave Column H empty so it doesn't interfere with auction tallies
          const rowData = [
            item,                           // A: Item
            '',                            // B: Start Price (empty)
            '',                            // C: Duration (empty)
            '',                            // D: Winner (empty)
            '',                            // E: Winning Bid (empty)
            '',                            // F: Auction Start (empty)
            '',                            // G: Auction End (empty)
            '',                            // H: Timestamp (EMPTY - don't include)
            '',                            // I: Total Bids (empty)
            source,                        // J: Source (proper case)
            quantity,                      // K: Quantity
            boss                           // L: Boss (all caps)
          ];

          // Insert entire row at once
          biddingItemsSheet.getRange(insertRow, 1, 1, 12).setValues([rowData]);
          
          Logger.log(`✅ Added item at row ${insertRow}: ${item}`);
          
          submittedItems.push({
            item: item,
            row: insertRow,
            boss: boss
          });
          
          insertRow++;
          successCount++;
          
        } catch (itemError) {
          Logger.log(`❌ Error adding item ${i + 1}: ${itemError.toString()}`);
          failCount++;
        }
      }

      // STEP 3: Update state to 'completed' (clear pending entries)
      const completedState = {
        pendingEntries: [],
        lastSubmitted: submittedItems,
        lastSubmissionTime: new Date().toISOString(),
        status: 'completed'
      };
      
      saveLootState({state: completedState});
      Logger.log('✅ Updated loot state to completed');

      const summary = `Submitted ${successCount}/${entries.length} loot entries (${failCount} failed)`;
      Logger.log(`✅ ${summary}`);
      
      return createResponse('ok', summary, {
        submitted: successCount,
        failed: failCount,
        total: entries.length,
        sheet: 'BiddingItems',
        lastRow: insertRow - 1,
        submittedItems: submittedItems
      });

    } finally { 
      lock.releaseLock(); 
    }

  } catch (err) {
    Logger.log('❌ Loot submission error: ' + err.toString());
    Logger.log('Stack trace: ' + err.stack);
    
    // Save error state
    try {
      const errorState = {
        pendingEntries: entries,
        error: err.toString(),
        errorStack: err.stack,
        timestamp: new Date().toISOString(),
        status: 'error'
      };
      saveLootState({state: errorState});
    } catch (saveErr) {
      Logger.log('❌ Could not save error state: ' + saveErr.toString());
    }
    
    return createResponse('error', err.toString(), {
      submitted: 0,
      errorDetails: err.stack
    });
  }
}

function handleSubmitAttendance(data) {
  const boss = (data.boss || '').toString().trim().toUpperCase();
  const timestamp = (data.timestamp || '').toString().trim();
  const members = (data.members || []).map(m => m.trim());
  
  if (!boss || !timestamp || members.length === 0) {
    return createResponse('error', 'Missing boss, timestamp, or members');
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return createResponse('error', 'Lock timeout'); }

  try {
    const sheet = getCurrentWeekSheet();
    let lastCol = sheet.getLastColumn();
    let targetColumn = null;
    
    if (lastCol >= COLUMNS.FIRST_SPAWN) {
      const spawnData = sheet.getRange(1, COLUMNS.FIRST_SPAWN, 2, lastCol - COLUMNS.FIRST_SPAWN + 1).getValues();
      const row1 = spawnData[0], row2 = spawnData[1];
      for (let i = 0; i < row1.length; i++) {
        if ((row1[i] || '').toString().trim() === timestamp && (row2[i] || '').toString().trim().toUpperCase() === boss) {
          targetColumn = i + COLUMNS.FIRST_SPAWN;
          break;
        }
      }
    }
    if (targetColumn) return createResponse('error', `Column exists for ${boss} at ${timestamp}`);
    
    const newCol = lastCol + 1;
    sheet.getRange(1, newCol, 2, 1).setValues([[timestamp],[boss]])
      .setFontWeight('bold').setBackground('#E8F4F8').setHorizontalAlignment('center');
    sheet.setColumnWidth(newCol, 120);
    
    const lastRow = sheet.getLastRow();
    const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();
    
    if (lastRow >= 3) {
      const memberNames = sheet.getRange(3, COLUMNS.MEMBERS, lastRow - 2, 1).getValues().flat();
      const membersLower = members.map(m => m.toLowerCase());
      const sheetMembersLower = memberNames.map(m => (m || '').toString().trim().toLowerCase());
      
      const newMembers = [];
      let newMembersCount = 0;
      for (let i = 0; i < members.length; i++) {
        if (!sheetMembersLower.includes(membersLower[i])) {
          const newRow = lastRow + newMembersCount + 1;
          newMembers.push({name: members[i], row: newRow});
          newMembersCount++;
        }
      }
      
      if (newMembers.length > 0) {
        const newMemberData = newMembers.map(m => [m.name]);
        sheet.getRange(lastRow + 1, COLUMNS.MEMBERS, newMembers.length, 1).setValues(newMemberData);
        if (newCol > COLUMNS.FIRST_SPAWN) {
          const falseArray = Array(newMembers.length).fill(null).map(() => Array(newCol - COLUMNS.FIRST_SPAWN).fill(false));
          sheet.getRange(lastRow + 1, COLUMNS.FIRST_SPAWN, newMembers.length, newCol - COLUMNS.FIRST_SPAWN)
               .setValues(falseArray).setDataValidation(checkboxRule);
        }
      }
      
      const totalRows = lastRow + newMembersCount;
      if (totalRows >= 3) {
        const allMemberNames = sheet.getRange(3, COLUMNS.MEMBERS, totalRows - 2, 1).getValues().flat();
        const allMembersLower = allMemberNames.map(m => (m || '').toString().trim().toLowerCase());
        const attendanceData = allMembersLower.map(m => [membersLower.includes(m)]);
        sheet.getRange(3, newCol, attendanceData.length, 1).setValues(attendanceData).setDataValidation(checkboxRule);
      }
      
    } else {
      sheet.getRange(3, COLUMNS.MEMBERS, members.length, 1).setValues(members.map(m => [m]));
      sheet.getRange(3, newCol, members.length, 1).setValues(members.map(() => [true])).setDataValidation(checkboxRule);
    }
    
    logAttendance(SpreadsheetApp.openById(CONFIG.SHEET_ID), boss, timestamp, members);
    return createResponse('ok', `Submitted: ${members.length}`, {column: newCol, boss, timestamp, membersCount: members.length});
  } finally { lock.releaseLock(); }
}

function getCurrentWeekSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const weekIndex = Utilities.formatDate(sunday, CONFIG.TIMEZONE, 'yyyyMMdd');
  const sheetName = CONFIG.SHEET_NAME_PREFIX + weekIndex;
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headerData = [['MEMBERS', 'POINTS CONSUMED', 'POINTS LEFT', 'ATTENDANCE POINTS']];
    sheet.getRange(1, COLUMNS.MEMBERS, 1, COLUMNS.ATTENDANCE_POINTS).setValues(headerData)
         .setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    sheet.getRange(2, COLUMNS.MEMBERS, 1, COLUMNS.ATTENDANCE_POINTS).setBackground('#E8F4F8');
    sheet.setColumnWidth(COLUMNS.MEMBERS, 150).setColumnWidth(COLUMNS.POINTS_CONSUMED, 120)
         .setColumnWidth(COLUMNS.POINTS_LEFT, 100).setColumnWidth(COLUMNS.ATTENDANCE_POINTS, 150);
    copyMembersFromPreviousWeek(ss, sheet);
  }
  
  return sheet;
}

function copyMembersFromPreviousWeek(spreadsheet, newSheet) {
  const weekSheets = spreadsheet.getSheets()
      .filter(s => s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX))
      .sort((a, b) => b.getName().localeCompare(a.getName()));

  if (weekSheets.length > 1) {
    const prevSheet = weekSheets[1];
    const lastRow = prevSheet.getLastRow();

    if (lastRow >= 3) {
      // Copy column A (members) as values
      const members = prevSheet.getRange(3, COLUMNS.MEMBERS, lastRow - 2, 1)
                              .getValues()
                              .filter(m => m[0] && m[0].toString().trim() !== '');
      if (members.length > 0) {
        newSheet.getRange(3, COLUMNS.MEMBERS, members.length, 1).setValues(members);

        // Copy columns B, C, D (formulas)
        const formulas = prevSheet.getRange(3, 2, members.length, 3).getFormulas();
        newSheet.getRange(3, 2, members.length, 3).setFormulas(formulas);
      }
    }
  }
}

function logAttendance(spreadsheet, boss, timestamp, members) {
  let logSheet = spreadsheet.getSheetByName('AttendanceLog');
  if (!logSheet) {
    logSheet = spreadsheet.insertSheet('AttendanceLog');
    logSheet.getRange(1,1,1,5).setValues([['Timestamp','Boss','Spawn Time','Members','Count']])
      .setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
  }
  logSheet.appendRow([new Date(), boss, timestamp, members.join(', '), members.length]);
}

function getBiddingItems(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found', {items: []});

  // Validate sheet structure
  const expectedHeaders = ['Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid',
                           'Auction Start', 'Auction End', 'Timestamp', 'Total Bids',
                           'Source', 'Quantity', 'Boss'];
  const headers = sheet.getRange(1, 1, 1, 12).getValues()[0];

  for (let i = 0; i < expectedHeaders.length; i++) {
    const expected = expectedHeaders[i];
    const actual = (headers[i] || '').toString().trim();
    if (actual !== expected) {
      Logger.log(`⚠️ Header mismatch at column ${String.fromCharCode(65+i)}: expected "${expected}", got "${actual}"`);
      // Continue but warn - don't fail completely
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createResponse('ok', 'No items', {items: []});

  const lastCol = sheet.getLastColumn();
  if (lastCol < 12) {
    Logger.log(`⚠️ Sheet only has ${lastCol} columns, expected 12. Some data may be missing.`);
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.min(lastCol, 12)).getValues();
  const items = [];
  
  dataRange.forEach((row, idx) => {
    const itemName = (row[0] || '').toString().trim();
    if (!itemName) return;
    
    const winner = (row[3] || '').toString().trim();
    if (winner) return; // Skip items with winners
    
    const qty = parseInt(row[10]) || 1;
    const boss = (row[11] || '').toString().trim(); // Column L (index 11)
    
    items.push({
      item: itemName,
      startPrice: Number(row[1]) || 0,
      duration: Number(row[2]) || 30,
      quantity: qty,
      boss: boss, // NEW
      source: 'GoogleSheet',
      sheetIndex: idx + 2,
    });
  });
  
  Logger.log(`✅ Fetched ${items.length} items`);
  return createResponse('ok', 'Items fetched', {items});
}

function getAttendanceForBoss(data) {
  const weekSheet = data.weekSheet || '';
  const bossKey = data.bossKey || '';
  
  if (!weekSheet || !bossKey) {
    return createResponse('error', 'Missing weekSheet or bossKey', {attendees: []});
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(weekSheet);
  
  if (!sheet) {
    return createResponse('error', `Sheet not found: ${weekSheet}`, {attendees: []});
  }
  
  // Parse bossKey: "EGO 10/27/25 17:57"
  const match = bossKey.match(/^(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    return createResponse('error', `Invalid bossKey format: ${bossKey}`, {attendees: []});
  }
  
  const bossName = match[1].trim().toUpperCase();
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  const year = match[4];
  const hour = match[5].padStart(2, '0');
  const minute = match[6].padStart(2, '0');
  
  const targetTimestamp = `${month}/${day}/${year} ${hour}:${minute}`;
  
  Logger.log(`🔍 Looking for: ${targetTimestamp} + ${bossName}`);
  
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  
  if (lastCol < 5 || lastRow < 3) {
    return createResponse('error', 'Sheet has insufficient data', {attendees: []});
  }
  
  // Search for matching column
  const row1 = sheet.getRange(1, 5, 1, lastCol - 4).getValues()[0]; // Timestamps
  const row2 = sheet.getRange(2, 5, 1, lastCol - 4).getValues()[0]; // Boss names
  
  let targetColumn = -1;
  
  for (let i = 0; i < row1.length; i++) {
    const cellTimestamp = (row1[i] || '').toString().trim();
    const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
    
    // Try exact match first
    if (cellTimestamp === targetTimestamp && cellBoss === bossName) {
      targetColumn = i + 5; // +5 because we started from column E (5)
      break;
    }
    
    // Try fuzzy match (allow slight variations)
    const timestampMatch = cellTimestamp.replace(/\s+/g, ' ') === targetTimestamp.replace(/\s+/g, ' ');
    const bossMatch = cellBoss === bossName;
    
    if (timestampMatch && bossMatch) {
      targetColumn = i + 5;
      break;
    }
  }
  
  if (targetColumn === -1) {
    Logger.log(`⚠️ Column not found for ${bossKey}`);
    return createResponse('ok', 'Boss spawn not found in attendance sheet', {attendees: []});
  }
  
  Logger.log(`✅ Found column ${targetColumn}`);
  
  // Get attendees (rows 3+, where checkbox = true)
  const memberNames = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
  const attendance = sheet.getRange(3, targetColumn, lastRow - 2, 1).getValues().flat();
  
  const attendees = [];
  for (let i = 0; i < memberNames.length; i++) {
    if (attendance[i] === true) {
      const member = (memberNames[i] || '').toString().trim();
      if (member) attendees.push(member);
    }
  }
  
  Logger.log(`✅ Found ${attendees.length} attendees: ${attendees.join(', ')}`);
  
  return createResponse('ok', `Attendance loaded for ${bossKey}`, {
    attendees: attendees,
    bossKey: bossKey,
    weekSheet: weekSheet,
    column: targetColumn
  });
}

function getSessionNumber(timestamp) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const logSheet = ss.getSheetByName('AuctionLog');
  if (!logSheet) return 1;
  
  const today = timestamp.split(' ')[0]; // MM/DD/YY
  const data = logSheet.getRange('A:A').getValues().flat();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const cellDate = (data[i] || '').toString().split(' ')[0];
    if (cellDate === today) count++;
  }
  return count + 1;
}

function getSessionTimestamp() {
  const d = new Date();
  const manilaTime = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  
  const month = String(manilaTime.getMonth() + 1).padStart(2, "0");
  const day = String(manilaTime.getDate()).padStart(2, "0");
  const year = String(manilaTime.getFullYear()).slice(-2);
  const hours = String(manilaTime.getHours()).padStart(2, "0");
  const mins = String(manilaTime.getMinutes()).padStart(2, "0");
  
  const dateTime = `${month}/${day}/${year} ${hours}:${mins}`;
  const sessionNum = getSessionNumber(dateTime);
  
  return {
    dateTime,
    sessionNum,
    columnHeader: `${dateTime} #${sessionNum}`,
    auctionStartTime: dateTime,
    logDate: new Date().toISOString()
  };
}

function logAuctionEvent(eventData) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let logSheet = ss.getSheetByName('AuctionLog');
  
  if (!logSheet) {
    logSheet = ss.insertSheet('AuctionLog');
    logSheet.getRange(1, 1, 1, 10).setValues([[
      'Session Date', 'Session Time', 'Session Number', 'Item', 'Source', 
      'Winner', 'Amount', 'Auction Start', 'Auction End', 'Timestamp'
    ]])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF');
    logSheet.hideSheet();
  }
  
  const row = [
    eventData.sessionDate,
    eventData.sessionTime,
    eventData.sessionNum,
    eventData.item,
    eventData.source,
    eventData.winner || '',
    eventData.amount || '',
    eventData.auctionStart,
    eventData.auctionEnd,
    eventData.timestamp
  ];
  
  logSheet.appendRow(row);
}

// BIDDING FUNCTIONS
function handleGetBiddingPoints(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  if (!sheet) return createResponse('error', `Sheet not found: ${CONFIG.BIDDING_SHEET}`);
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createResponse('ok','No members',{points:{}});
  
  const dataRange = sheet.getRange(2,1,lastRow-1,2).getValues();
  const points = {};
  dataRange.forEach(r => { 
    const member = (r[0]||'').toString().trim(); 
    if(member) points[member]=Number(r[1])||0; 
  });
  
  return createResponse('ok','Points fetched',{points});
}

function logAuctionResult(data) {
  const itemIndex = data.itemIndex || -1;
  const winner = data.winner || '';
  const winningBid = data.winningBid || 0;
  const itemSource = data.itemSource || 'Unknown';
  const timestamp = data.timestamp || new Date().toISOString();
  const auctionStartTime = data.auctionStartTime || '';
  const auctionEndTime = data.auctionEndTime || '';
  
  // SKIP if no winner (only for GoogleSheet items)
  if (!winner && itemSource === 'GoogleSheet') {
    Logger.log(`ℹ️ Skipping log for ${data.itemName || 'Unknown'} - No winner`);
    return createResponse('ok', 'Skipped - no winner', {logged: false});
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found');
  
  // Log to AuctionLog (event tracking)
  const sessionTs = getSessionTimestamp();
  const [dateOnly, timeOnly] = sessionTs.columnHeader.split(' #')[0].split(' ');
  const sessionNum = parseInt(sessionTs.columnHeader.split('#')[1]);
  
  logAuctionEvent({
    sessionDate: dateOnly,
    sessionTime: timeOnly,
    sessionNum: sessionNum,
    item: data.itemName,
    source: itemSource,
    winner: winner,
    amount: winningBid,
    auctionStart: auctionStartTime,
    auctionEnd: auctionEndTime,
    timestamp: timestamp
  });
  
  // Update BiddingItems sheet if GoogleSheet item
  if (itemIndex > 0 && itemSource === 'GoogleSheet') {
    sheet.getRange(itemIndex, 4).setValue(winner);      // Winner
    sheet.getRange(itemIndex, 5).setValue(winningBid);  // Winning Bid
    sheet.getRange(itemIndex, 6).setValue(auctionStartTime); // Auction Start
    sheet.getRange(itemIndex, 7).setValue(auctionEndTime);   // Auction End
    sheet.getRange(itemIndex, 8).setValue(new Date().toISOString()); // Timestamp
  }
  
  return createResponse('ok', 'Auction result logged', {logged: true, source: itemSource});
}

function handleSubmitBiddingResults(data) {
  const results = data.results || [];
  const manualItems = data.manualItems || [];
  
  // Get session info
  const sessionTs = getSessionTimestamp();
  const columnHeader = sessionTs.columnHeader; // MM/DD/YY HH:MM #N
  
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let biddingSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  if (!biddingSheet) return createResponse('error', `Sheet not found: ${CONFIG.BIDDING_SHEET}`);
  
  let biddingItemsSheet = ss.getSheetByName('BiddingItems');
  if (!biddingItemsSheet) {
    biddingItemsSheet = ss.insertSheet('BiddingItems');
    biddingItemsSheet.getRange(1, 1, 1, 11).setValues([[
      'Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid', 
      'Auction Start', 'Auction End', 'Timestamp', 'Total Bids', 'Source', 'Quantity'
    ]])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF');
  }
  
  // STEP 1: Add manual items to BiddingItems sheet (only if they were auctioned)
  if (manualItems && manualItems.length > 0) {
    const lastRow = biddingItemsSheet.getLastRow();
    let insertRow = lastRow + 1;
    
    for (let item of manualItems) {
      const winner = item.winner || '';
      const bid = item.winningBid || '';
      
      biddingItemsSheet.getRange(insertRow, 1).setValue(item.item);
      biddingItemsSheet.getRange(insertRow, 2).setValue(item.startPrice);
      biddingItemsSheet.getRange(insertRow, 3).setValue(item.duration);
      biddingItemsSheet.getRange(insertRow, 4).setValue(winner);
      biddingItemsSheet.getRange(insertRow, 5).setValue(bid);
      biddingItemsSheet.getRange(insertRow, 6).setValue(item.auctionStartTime || '');
      biddingItemsSheet.getRange(insertRow, 7).setValue(item.auctionEndTime || '');
      biddingItemsSheet.getRange(insertRow, 8).setValue(new Date().toISOString());
      biddingItemsSheet.getRange(insertRow, 10).setValue('Manual');
      biddingItemsSheet.getRange(insertRow, 11).setValue(1);  // Quantity = 1
      
      insertRow++;
    }
    
    Logger.log(`✅ Added ${manualItems.length} manual items to BiddingItems sheet`);
  }
  
  // STEP 2: Submit combined tally to BiddingPoints (all members, including 0s)
  const lastRow = biddingSheet.getLastRow();
  let timestampColumn = -1;
  
  // Check if column already exists
  if (lastRow >= 1) {
    const headers = biddingSheet.getRange(1, 3, 1, biddingSheet.getLastColumn() - 2).getValues()[0];
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].toString().trim() === columnHeader) {
        timestampColumn = i + 3;
        break;
      }
    }
  }
  
  // Create new column if doesn't exist
  if (timestampColumn === -1) {
    timestampColumn = biddingSheet.getLastColumn() + 1;
    biddingSheet.getRange(1, timestampColumn).setValue(columnHeader)
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('center');
  }
  
  // Get all member names from sheet
  const memberNames = biddingSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  
  // Process results (includes all members with 0 for non-winners)
  const updates = [];
  if (results && results.length > 0) {
    results.forEach(r => {
      const member = r.member.trim();
      const total = r.totalSpent || 0;
      let rowIndex = memberNames.findIndex(m => (m||'').toString().trim().toLowerCase() === member.toLowerCase());
      if (rowIndex !== -1) {
        updates.push({row: rowIndex + 2, amount: total});
      }
    });
    
    // Apply all updates
    updates.forEach(u => biddingSheet.getRange(u.row, timestampColumn).setValue(u.amount));
  }
  
  // STEP 3: Update BiddingPoints (left side columns)
  updateBiddingPoints();
  
  Logger.log(`✅ Session tally submitted: ${columnHeader}`);
  
  return createResponse('ok', `Submitted: Session ${columnHeader} with ${updates.length} members`, {
    timestampColumn,
    membersUpdated: updates.length,
    sessionHeader: columnHeader,
    manualItemsAdded: manualItems ? manualItems.length : 0
  });
}

function getBotState(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('_BotState');
  
  if (!sheet) {
    return createResponse('ok', 'No state found', {state: null});
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createResponse('ok', 'No state found', {state: null});
  
  const stateData = {};
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  
  dataRange.forEach(row => {
    const key = (row[0] || '').toString().trim();
    const value = (row[1] || '').toString().trim();
    if (key && value) {
      try {
        stateData[key] = JSON.parse(value);
      } catch (e) {
        stateData[key] = value;
      }
    }
  });
  
  return createResponse('ok', 'State retrieved', {state: stateData});
}

function saveBotState(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('_BotState');
  
  if (!sheet) {
    sheet = ss.insertSheet('_BotState');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    sheet.hideSheet();
  }
  
  const stateObj = data.state || {};
  const timestamp = new Date().toISOString();
  
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF');
  
  let row = 2;
  for (const [key, value] of Object.entries(stateObj)) {
    sheet.getRange(row, 1).setValue(key);
    sheet.getRange(row, 2).setValue(JSON.stringify(value));
    sheet.getRange(row, 3).setValue(timestamp);
    row++;
  }
  
  return createResponse('ok', 'State saved', {saved: true});
}

function moveQueueItemsToSheet(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found');
  
  const items = data.items || [];
  if (items.length === 0) return createResponse('ok', 'No items to move', {moved: 0});
  
  const lastRow = sheet.getLastRow();
  let insertRow = lastRow + 1;
  
  items.forEach(item => {
    sheet.getRange(insertRow, 1).setValue(item.item);
    sheet.getRange(insertRow, 2).setValue(item.startPrice);
    sheet.getRange(insertRow, 3).setValue(item.duration);
    sheet.getRange(insertRow, 10).setValue('QueueList');
    insertRow++;
  });
  
  return createResponse('ok', `Moved ${items.length} items to sheet`, {moved: items.length});
}

function updateBiddingPoints() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const bpSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  if (!bpSheet) return;

  const lastRow = bpSheet.getLastRow();
  const existingData = lastRow > 1 ? bpSheet.getRange(2, 1, lastRow - 1, 3).getValues() : [];
  const memberMap = {};

  // --- Step 1: Map existing members in bidding sheet ---
  existingData.forEach((r, i) => {
    const m = (r[0] || '').toString().trim();
    if (m) memberMap[m] = { row: i + 2, consumed: Number(r[2]) || 0 };
  });

  // --- Step 2: Collect totals from all weekly sheets ---
  const sheets = ss.getSheets().filter(s => s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX));
  const totals = {};

  sheets.forEach(s => {
    const data = s.getRange('A2:D').getValues();
    data.forEach(r => {
      const m = (r[0] || '').toString().trim();
      if (m) totals[m] = (totals[m] || 0) + Number(r[3] || 0);
    });
  });

  // --- Step 3: Add new members if not already in the bidding sheet ---
  const newMembers = Object.keys(totals).filter(m => !memberMap[m]);
  if (newMembers.length > 0) {
    const insertStart = bpSheet.getLastRow() + 1;
    const newRows = newMembers.map(m => [m, totals[m], 0]); // Member | Left | Consumed
    bpSheet.getRange(insertStart, 1, newRows.length, 3).setValues(newRows);

    // Also update memberMap so they’re included below
    newMembers.forEach((m, i) => {
      memberMap[m] = { row: insertStart + i, consumed: 0 };
    });
  }

  // --- Step 4: Update points for all members ---
  Object.keys(memberMap).forEach(m => {
    const left = (totals[m] || 0) - memberMap[m].consumed;
    bpSheet.getRange(memberMap[m].row, 2).setValue(left);
  });
}

// ===========================================================
// LOOT STATE MANAGEMENT (for recovery + debugging)
// ===========================================================
function saveLootState(data) {
  const state = data.state || {};
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let stateSheet = ss.getSheetByName('_LootState');

  if (!stateSheet) {
    stateSheet = ss.insertSheet('_LootState');
    stateSheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
  }

  // Clear old state and save new one
  stateSheet.clearContents();
  stateSheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]);
  stateSheet.getRange(2, 1, 1, 2).setValues([
    ['state', JSON.stringify(state)],
  ]);

  Logger.log('💾 Loot state saved successfully');
  return createResponse('ok', 'Loot state saved');
}

function getLootState() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const stateSheet = ss.getSheetByName('_LootState');

  if (!stateSheet) {
    return createResponse('ok', 'No loot state found', { state: {} });
  }

  const data = stateSheet.getRange(2, 2).getValue();
  const parsed = data ? JSON.parse(data) : {};

  return createResponse('ok', 'Loot state retrieved', { state: parsed });
}

// ATTENDANCE STATE MANAGEMENT (Memory optimization for Koyeb)
function getAttendanceState(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('_AttendanceState');

  if (!sheet) {
    return createResponse('ok', 'No state found', {state: null});
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createResponse('ok', 'No state found', {state: null});

  const stateData = {};
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

  dataRange.forEach(row => {
    const key = (row[0] || '').toString().trim();
    const value = (row[1] || '').toString().trim();
    if (key && value) {
      try {
        stateData[key] = JSON.parse(value);
      } catch (e) {
        stateData[key] = value;
      }
    }
  });

  return createResponse('ok', 'Attendance state retrieved', {state: stateData});
}

function saveAttendanceState(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('_AttendanceState');

  if (!sheet) {
    sheet = ss.insertSheet('_AttendanceState');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    sheet.hideSheet();
  }

  const stateObj = data.state || {};
  const timestamp = new Date().toISOString();

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'LastUpdated']])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF');

  let row = 2;
  for (const [key, value] of Object.entries(stateObj)) {
    sheet.getRange(row, 1).setValue(key);
    sheet.getRange(row, 2).setValue(JSON.stringify(value));
    sheet.getRange(row, 3).setValue(timestamp);
    row++;
  }

  return createResponse('ok', 'Attendance state saved', {saved: true, timestamp: timestamp});
}

function updateTotalAttendanceAndMembers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().startsWith("ELYSIUM_WEEK_"));
  const totalSheetName = "TOTAL ATTENDANCE";
  const totalSheet = ss.getSheetByName(totalSheetName);
  const memberTotals = {};

  // --- Step 1: Gather all members + count TRUE checkboxes ---
  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const name = data[i][0];
      if (!name) continue;
      const attendance = data[i].slice(4).filter(v => v === true).length;
      memberTotals[name] = (memberTotals[name] || 0) + attendance;
    }
  });

  // --- Step 2: Update TOTAL ATTENDANCE sheet ---
  const result = [["Member", "Total Attendance (Days)"]];
  Object.keys(memberTotals)
    .sort((a, b) => a.localeCompare(b))
    .forEach(name => result.push([name, memberTotals[name]]));

  totalSheet.clearContents();
  totalSheet.getRange(1, 1, result.length, 2).setValues(result);

  // --- Step 3: Sync new members into all weekly sheets ---
  const allMembers = Object.keys(memberTotals);
  sheets.forEach(sheet => {
    const existing = sheet.getRange("A2:A").getValues().flat().filter(String);
    const missing = allMembers.filter(m => !existing.includes(m));
    if (missing.length > 0) {
      const insertStart = existing.length + 2;
      sheet.getRange(insertStart, 1, missing.length, 1).setValues(missing.map(m => [m]));
    }
  });
}
// UTILITIES
function createResponse(status, message, data) {
  const response = {
    status,
    message,
    timestamp: new Date().toISOString()
  };
  if(data) Object.assign(response, data);
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

//test v4