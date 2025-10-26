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

// MAIN WEBHOOK HANDLER
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const action = data.action || 'unknown';
    
    Logger.log(`🔥 Action: ${action}`);
    
    if (['checkColumn', 'submitAttendance'].includes(action)) {
      if (action === 'checkColumn') return handleCheckColumn(data);
      if (action === 'submitAttendance') return handleSubmitAttendance(data);
    }

if (['getBiddingPoints', 'submitBiddingResults', 'getBiddingItems', 'logAuctionResult', 'getBotState', 'saveBotState', 'moveQueueItemsToSheet'].includes(action)) {
  if (action === 'getBiddingPoints') return handleGetBiddingPoints(data);
  if (action === 'submitBiddingResults') return handleSubmitBiddingResults(data);
  if (action === 'getBiddingItems') return getBiddingItems(data);
  if (action === 'logAuctionResult') return logAuctionResult(data);
  if (action === 'getBotState') return getBotState(data);
  if (action === 'saveBotState') return saveBotState(data);
  if (action === 'moveQueueItemsToSheet') return moveQueueItemsToSheet(data);
}
    
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
  const weekSheets = spreadsheet.getSheets().filter(s => s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX))
                          .sort((a, b) => b.getName().localeCompare(a.getName()));
  if (weekSheets.length > 1) {
    const prevSheet = weekSheets[1];
    const lastRow = prevSheet.getLastRow();
    if (lastRow >= 3) {
      const members = prevSheet.getRange(3, COLUMNS.MEMBERS, lastRow - 2, 1).getValues()
                              .filter(m => m[0] && m[0].toString().trim() !== '');
      if (members.length > 0) newSheet.getRange(3, COLUMNS.MEMBERS, members.length, 1).setValues(members);
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
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createResponse('ok', 'No items', {items: []});
  
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const items = [];
  
  dataRange.forEach((row, idx) => {
    const itemName = (row[0] || '').toString().trim();
    if (itemName) {
      items.push({
        item: itemName,
        startPrice: Number(row[1]) || 0,
        duration: Number(row[2]) || 30,
        quantity: 1,
        source: 'GoogleSheet',
        sheetIndex: idx,
      });
    }
  });
  
  return createResponse('ok', 'Items fetched', {items});
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
  const totalBids = data.totalBids || 0;
  const bidCount = data.bidCount || 0;
  const itemSource = data.itemSource || 'Unknown';
  const timestamp = data.timestamp || new Date().toISOString();
  
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found');
  
  if (itemIndex > 0) {
    sheet.getRange(itemIndex, 4).setValue(winner);
    sheet.getRange(itemIndex, 5).setValue(winningBid);
    sheet.getRange(itemIndex, 6).setValue(timestamp);
    sheet.getRange(itemIndex, 7).setValue(timestamp.split(' ')[1]);
    sheet.getRange(itemIndex, 8).setValue(totalBids);
    sheet.getRange(itemIndex, 9).setValue(bidCount);
    sheet.getRange(itemIndex, 10).setValue(itemSource);
  }
  
  return createResponse('ok', 'Auction result logged', {logged: true});
}

function handleSubmitBiddingResults(data) {
  const results = data.results || [];
  const timestamp = data.timestamp || '';
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  if (!sheet) return createResponse('error', `Sheet not found: ${CONFIG.BIDDING_SHEET}`);
  if (!timestamp || results.length===0) return createResponse('error','Missing timestamp or results');
  
  const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  let timestampColumn = -1;
  
  // Check if timestamp column exists
  if(lastCol >= 3) {
    const headers = sheet.getRange(1, 3, 1, lastCol - 2).getValues()[0];
    for(let i = 0; i < headers.length; i++) {
      if(headers[i].toString().trim() === timestamp) {
        timestampColumn = i + 3;
        break;
      }
    }
  }
  
  // Create new column if doesn't exist
  if(timestampColumn === -1) {
    timestampColumn = lastCol + 1;
    sheet.getRange(1, timestampColumn).setValue(timestamp)
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('center');
  }

  // Get all member names from sheet
  const memberNames = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  
  // Update ALL members (results already contains all with 0 for non-winners)
  const updates = [];
  results.forEach(r => {
    const member = r.member.trim();
    const total = r.totalSpent || 0;
    let rowIndex = memberNames.findIndex(m => (m||'').toString().trim().toLowerCase() === member.toLowerCase());
    if(rowIndex !== -1) {
      updates.push({row: rowIndex + 2, amount: total});
    }
  });
  
  // Apply all updates
  updates.forEach(u => sheet.getRange(u.row, timestampColumn).setValue(u.amount));
  
// Update bidding points
  updateBiddingPoints();
  
  return createResponse('ok', `Submitted: ${updates.length} members (including 0s)`, {
    timestampColumn,
    membersUpdated: updates.length,
    timestamp
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
  if(!bpSheet) return;
  
  const lastRow = bpSheet.getLastRow();
  if(lastRow < 2) return;
  
  const existingData = bpSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  let memberMap = {};
  existingData.forEach((r, i) => {
    const m = (r[0] || '').toString().trim();
    if(m) memberMap[m] = {row: i + 2, consumed: Number(r[2]) || 0};
  });
  
  const sheets = ss.getSheets();
  let totals = {};
  sheets.forEach(s => {
    if(s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX)) {
      const data = s.getRange('A2:D').getValues();
      data.forEach(r => {
        const m = (r[0] || '').toString().trim();
        if(m) totals[m] = (totals[m] || 0) + Number(r[3] || 0);
      });
    }
  });
  
  Object.keys(memberMap).forEach(m => {
    const left = (totals[m] || 0) - memberMap[m].consumed;
    bpSheet.getRange(memberMap[m].row, 2).setValue(left);
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