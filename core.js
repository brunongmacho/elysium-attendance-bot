/**
 * ELYSIUM Core Member Evaluation System - Google Apps Script
 * 
 * Auto-calculates Core Member Evaluation for MMORPG guild
 * Calculates CP growth, relative growth, attendance points, final score, and selects Top 5 Core members
 * 
 * SETUP:
 * 1. Create a Google Sheet with columns A-M as specified below
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code
 * 4. Set up triggers:
 *    - onEdit: Edit trigger > On edit
 *    - evaluateAllMembers: Time-driven > Hourly (or manual)
 * 5. Deploy as Web App (optional, for external bot integration)
 * 
 * Sheet Columns:
 * A: Member Name (Discord Nickname) (Discord Nickname)
 * B: Starting CP
 * C: Ending CP
 * D: Attendance (0-8)
 * E: CP Growth % (auto-calculated)
 * F: Bracket (C/B/A based on Starting CP)
 * G: Bracket Avg Growth % (auto-calculated)
 * H: Relative Growth % (auto-calculated)
 * I: CP Points (0-30)
 * J: Attendance Points (0-70)
 * K: Final Score (auto-calculated)
 * L: Core Eligible (Yes/No)
 * M: Selected Core (Yes/No for Top 5)
 */

const EVAL_CONFIG = {
  SHEET_NAME: 'CYCLE 1',
  SPREADSHEET_ID: '', // Set your spreadsheet ID here if different from active
  
  // CP Brackets
  BRACKET_C_MAX: 84999,
  BRACKET_B_MIN: 85000,
  BRACKET_B_MAX: 99999,
  BRACKET_A_MIN: 100000,
  
  // CP Points thresholds
  CP_POINTS_30_MIN: 120,
  CP_POINTS_25_MIN: 110,
  CP_POINTS_20_MIN: 100,
  CP_POINTS_15_MIN: 90,
  CP_POINTS_10_MIN: 80,
  
  // Attendance thresholds
  ATTENDANCE_70: 8,
  ATTENDANCE_60: 7,
  ATTENDANCE_50: 6,
  ATTENDANCE_40: 5,
  
  // Core selection
  CORE_SIZE: 5,
  MIN_ATTENDANCE_FOR_CORE: 5,
  
  TIMEZONE: 'Asia/Manila',
};

const EVAL_COLUMNS = {
  MEMBER_NAME: 1,
  STARTING_CP: 2,
  ENDING_CP: 3,
  CP_GROWTH_RAW: 4,
  ATTENDANCE: 5,
  CP_GROWTH_PCT: 6,
  BRACKET: 7,
  BRACKET_AVG_GROWTH: 8,
  RELATIVE_GROWTH: 9,
  CP_POINTS: 10,
  ATTENDANCE_POINTS: 11,
  FINAL_SCORE: 12,
  CORE_ELIGIBLE: 13,
  SELECTED_CORE: 14,
  SCREENSHOT: 15,
};

/**
 * Determine bracket based on Starting CP
 * C: 84,999 and below
 * B: 85,000 – 99,999  
 * A: 100,000 and above
 */
function getBracket(startingCP) {
  if (startingCP <= EVAL_CONFIG.BRACKET_C_MAX) return 'C';
  if (startingCP <= EVAL_CONFIG.BRACKET_B_MAX) return 'B';
  return 'A';
}

/**
 * Calculate CP Growth %
 * CP Growth % = (Ending CP − Starting CP) ÷ Starting CP × 100
 */
function calculateCPGrowth(startingCP, endingCP) {
  if (!startingCP || startingCP <= 0) return 0;
  const growth = ((endingCP - startingCP) / startingCP) * 100;
  return Math.round(growth * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate CP Points based on Relative Growth %
 * ≥120 → 30 pts
 * 110–119 → 25 pts
 * 100–109 → 20 pts
 * 90–99 → 15 pts
 * 80–89 → 10 pts
 * <80 → 0 pts
 */
function getCPPoints(relativeGrowth) {
  if (relativeGrowth >= EVAL_CONFIG.CP_POINTS_30_MIN) return 30;
  if (relativeGrowth >= EVAL_CONFIG.CP_POINTS_25_MIN) return 25;
  if (relativeGrowth >= EVAL_CONFIG.CP_POINTS_20_MIN) return 20;
  if (relativeGrowth >= EVAL_CONFIG.CP_POINTS_15_MIN) return 15;
  if (relativeGrowth >= EVAL_CONFIG.CP_POINTS_10_MIN) return 10;
  return 0;
}

/**
 * Calculate Attendance Points
 * 8/8 → 70 pts
 * 7/8 → 60 pts
 * 6/8 → 50 pts
 * 5/8 → 40 pts
 * <5 → 0 pts
 */
function getAttendancePoints(attendance) {
  if (attendance >= EVAL_CONFIG.ATTENDANCE_70) return 70;
  if (attendance >= EVAL_CONFIG.ATTENDANCE_60) return 60;
  if (attendance >= EVAL_CONFIG.ATTENDANCE_50) return 50;
  if (attendance >= EVAL_CONFIG.ATTENDANCE_40) return 40;
  return 0;
}

/**
 * Determine if member is Core Eligible
 * Core Eligible: Attendance ≥ 5
 */
function isCoreEligible(attendance) {
  return attendance >= EVAL_CONFIG.MIN_ATTENDANCE_FOR_CORE ? 'Yes' : 'No';
}

/**
 * Calculate Bracket Average Growth %
 * Average growth for members in the same bracket
 */
function calculateBracketAverages(members) {
  const bracketTotals = { A: { sum: 0, count: 0 }, B: { sum: 0, count: 0 }, C: { sum: 0, count: 0 } };
  
  // First pass: calculate totals per bracket
  members.forEach(member => {
    const bracket = member.bracket;
    if (bracket && bracketTotals[bracket]) {
      bracketTotals[bracket].sum += member.cpGrowth;
      bracketTotals[bracket].count++;
    }
  });
  
  // Calculate averages
  const bracketAverages = {};
  Object.keys(bracketTotals).forEach(bracket => {
    if (bracketTotals[bracket].count > 0) {
      bracketAverages[bracket] = Math.round((bracketTotals[bracket].sum / bracketTotals[bracket].count) * 100) / 100;
    } else {
      bracketAverages[bracket] = 0;
    }
  });
  
  return bracketAverages;
}

/**
 * Calculate Relative Growth %
 * Relative Growth % = (CP Growth ÷ Bracket Average Growth %) × 100
 */
function calculateRelativeGrowth(cpGrowth, bracketAvgGrowth) {
  if (!bracketAvgGrowth || bracketAvgGrowth === 0) return 0;
  const relative = (cpGrowth / bracketAvgGrowth) * 100;
  return Math.round(relative * 100) / 100;
}

/**
 * Main evaluation function - calculates all fields for all members
 * Run this manually or set up a time trigger
 */
function evaluateAllMembers() {
  const ss = getEvaluationSheet();
  if (!ss) {
    Logger.log('❌ Evaluation sheet not found');
    return;
  }
  
  const sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME) || ss.insertSheet(EVAL_CONFIG.SHEET_NAME);
  evaluateAllMembersSheet(sheet, EVAL_CONFIG.SHEET_NAME);
}

/**
 * Evaluate ALL cycle sheets - call this to process all cycles
 */
function evaluateAllCycles() {
  const ss = getEvaluationSheet();
  if (!ss) {
    Logger.log('❌ Evaluation sheet not found');
    return;
  }
  
  const sheets = ss.getSheets();
  let processed = 0;
  
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    // Match "CYCLE 1", "Cycle 1", "cycle 1", etc.
    const isCycleSheet = sheetName.match(/^CYCLE\s+\d+$/i);
    const dataCheck = sheet.getRange('A2:D2').getValues();
    
    if (isCycleSheet && dataCheck[0][0]) {
      Logger.log(`📊 Processing sheet: ${sheetName}`);
      try {
        evaluateAllMembersSheet(sheet, sheetName);
        processed++;
      } catch (e) {
        Logger.log(`⚠️ Error processing ${sheetName}: ${e.message}`);
      }
    }
  });
  
  Logger.log(`✅ Processed ${processed} cycle sheets`);
  return `Processed ${processed} cycle sheets`;
}

/**
 * Evaluate members for a specific sheet
 * @param {Sheet} sheet - The sheet to evaluate
 * @param {string} sheetName - Name of the sheet for headers
 */
function evaluateAllMembersSheet(sheet, sheetName) {
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 1) {
    setHeaders(sheet);
    return;
  }
  
  const headers = sheet.getRange(1, 1, 1, 14).getValues()[0];
  if (!headers[0]) {
    setHeaders(sheet);
  }
  
  const dataStartRow = 2;
  const lastCol = 15;
  
  if (lastRow < dataStartRow) {
    Logger.log('ℹ️ No member data to evaluate');
    return;
  }
  
  const allData = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, lastCol).getValues();
  const members = [];
  
  Logger.log(`📊 Processing ${allData.length} rows from row ${dataStartRow}`);
  
  for (let i = 0; i < allData.length; i++) {
    const row = allData[i];
    const memberName = (row[0] || '').toString().trim();
    if (!memberName) {
      Logger.log(`⚠️ Row ${dataStartRow + i}: No member name, skipping`);
      continue;
    }
    
    Logger.log(`📝 Row ${dataStartRow + i}: ${memberName} - Starting: ${row[1]}, Ending: ${row[2]}, Attendance: ${row[4]}`);
    
    const startingCP = parseFloat(String(row[1]).replace(/,/g, '')) || 0;
    const endingCPInput = row[2];
    const endingCP = endingCPInput ? parseFloat(String(endingCPInput).replace(/,/g, '')) : startingCP;
    const attendance = parseInt(String(row[4])) || 0;
    
    members.push({
      row: dataStartRow + i,
      memberName,
      startingCP,
      endingCP,
      attendance,
      cpGrowth: 0,
      bracket: '',
      bracketAvgGrowth: 0,
      relativeGrowth: 0,
      cpPoints: 0,
      attendancePoints: 0,
      finalScore: 0,
      coreEligible: 'No',
      selectedCore: 'No',
    });
  }
  
  Logger.log(`📊 Processing ${members.length} members in ${sheetName}`);
  
  members.forEach(member => {
    member.bracket = getBracket(member.startingCP);
    member.cpGrowth = calculateCPGrowth(member.startingCP, member.endingCP);
    member.attendancePoints = getAttendancePoints(member.attendance);
    member.coreEligible = isCoreEligible(member.attendance);
  });
  
  const bracketAverages = calculateBracketAverages(members);
  
  members.forEach(member => {
    member.bracketAvgGrowth = bracketAverages[member.bracket] || 0;
    member.relativeGrowth = calculateRelativeGrowth(member.cpGrowth, member.bracketAvgGrowth);
    member.cpPoints = getCPPoints(member.relativeGrowth);
    member.finalScore = member.attendancePoints + member.cpPoints;
  });
  
  const sortedMembers = [...members].sort((a, b) => b.finalScore - a.finalScore);
  
  let coreCount = 0;
  sortedMembers.forEach((member, index) => {
    if (member.coreEligible === 'Yes' && coreCount < EVAL_CONFIG.CORE_SIZE) {
      member.selectedCore = `${index + 1}`; // Ranking: 1, 2, 3, 4, 5
      coreCount++;
    } else {
      member.selectedCore = '';
    }
  });
  
  // Calculate CP Growth (raw - difference)
  const updates = members.map(member => [
    member.endingCP - member.startingCP,    // D: CP Growth (raw)
    member.cpGrowth,                         // F: CP Growth %
    member.bracket,                          // G: Bracket
    member.bracketAvgGrowth,                 // H: Bracket Avg Growth %
    member.relativeGrowth,                   // I: Relative Growth %
    member.cpPoints,                         // J: CP Points
    member.attendancePoints,                // K: Attendance Points
    member.finalScore,                       // L: Final Score
    member.coreEligible,                     // M: Core Eligible
    member.selectedCore,                     // N: Selected Core
  ]);
  
  // Write calculated values - columns D (CP Growth raw) through N (Selected Core)
  // Starting at column 4, write 11 columns
  sheet.getRange(dataStartRow, 4, members.length, 11).setValues(updates);
  
  highlightSelectedCore(sheet, members, dataStartRow);
  
  Logger.log(`✅ Evaluation complete: ${members.length} members, ${coreCount} selected for Core`);
}

/**
 * Set column headers
 */
function setHeaders(sheet) {
  const headers = [
    'Member Name (Discord Nickname)',
    'Starting CP',
    'Ending CP',
    'CP Growth',
    'Attendance',
    'CP Growth %',
    'Bracket',
    'Bracket Avg Growth %',
    'Relative Growth %',
    'CP Points',
    'Attendance Points',
    'Final Score',
    'Core Eligible',
    'Selected Core',
    'Screenshot',
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  // Set column widths
  sheet.setColumnWidth(EVAL_COLUMNS.MEMBER_NAME, 150);
  sheet.setColumnWidth(EVAL_COLUMNS.STARTING_CP, 100);
  sheet.setColumnWidth(EVAL_COLUMNS.ENDING_CP, 100);
  sheet.setColumnWidth(EVAL_COLUMNS.CP_GROWTH_RAW, 100);
  sheet.setColumnWidth(EVAL_COLUMNS.ATTENDANCE, 100);
  sheet.setColumnWidth(EVAL_COLUMNS.CP_GROWTH_PCT, 100);
  sheet.setColumnWidth(EVAL_COLUMNS.BRACKET, 80);
  sheet.setColumnWidth(EVAL_COLUMNS.BRACKET_AVG_GROWTH, 150);
  sheet.setColumnWidth(EVAL_COLUMNS.RELATIVE_GROWTH, 130);
  sheet.setColumnWidth(EVAL_COLUMNS.CP_POINTS, 90);
  sheet.setColumnWidth(EVAL_COLUMNS.ATTENDANCE_POINTS, 130);
  sheet.setColumnWidth(EVAL_COLUMNS.FINAL_SCORE, 100);
  sheet.setColumnWidth(EVAL_COLUMNS.CORE_ELIGIBLE, 110);
  sheet.setColumnWidth(EVAL_COLUMNS.SELECTED_CORE, 110);
  sheet.setColumnWidth(EVAL_COLUMNS.SCREENSHOT, 200);
  
  Logger.log('✅ Headers set');
}

/**
 * Highlight Selected Core members with conditional formatting
 * Different colors for Top 5 rankings
 */
function highlightSelectedCore(sheet, members, startRow) {
  const goldColors = {
    '1': '#FFD700', // Gold
    '2': '#C0C0C0', // Silver
    '3': '#CD7F32', // Bronze
    '4': '#E8E8E8', // Light gray
    '5': '#E8E8E8', // Light gray
  };
  
  members.forEach((member, index) => {
    const rowNum = startRow + index;
    const ranking = member.selectedCore;
    
    if (ranking && ranking.match(/^[1-5]$/)) {
      // Top 5 - different color based on ranking
      const color = goldColors[ranking] || '#FFD700';
      sheet.getRange(rowNum, 1, 1, 15)
        .setBackground(color)
        .setFontWeight('bold');
    } else if (member.coreEligible === 'Yes') {
      // Eligible but not selected - light gold
      sheet.getRange(rowNum, 1, 1, 15)
        .setBackground('#FFF8DC')
        .setFontWeight('normal');
    } else {
      // Not eligible - white/default
      sheet.getRange(rowNum, 1, 1, 15)
        .setBackground('#FFFFFF')
        .setFontWeight('normal');
    }
  });
}
        .setBackground('#FFD700') // Gold
        .setFontWeight('bold');
    } else if (member.coreEligible === 'Yes') {
      // Eligible but not selected - light gold
      sheet.getRange(rowNum, 1, 1, EVAL_COLUMNS.SELECTED_CORE)
        .setBackground('#FFF8DC'); // Cornsilk
    } else {
      // Not eligible - white/default
      sheet.getRange(rowNum, 1, 1, EVAL_COLUMNS.SELECTED_CORE)
        .setBackground('#FFFFFF')
        .setFontWeight('normal');
    }
  });
}

/**
 * Get the evaluation sheet (by ID if set, otherwise active)
 */
function getEvaluationSheet() {
  if (EVAL_CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(EVAL_CONFIG.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * onEdit trigger - automatically recalculate when data is edited
 * Only triggers on relevant columns (Starting CP, Ending CP, Attendance)
 */
function onEdit(e) {
  if (!e) return;
  
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  
  // Accept "CYCLE 1", "Cycle 1", "cycle 1", etc.
  const isCycleSheet = sheetName.match(/^CYCLE\s+\d+$/i);
  const isMainSheet = sheetName === EVAL_CONFIG.SHEET_NAME;
  
  if (!isCycleSheet && !isMainSheet) return;
  
  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();
  
  // Skip if header row
  if (row === 1) return;
  
  // Only recalculate if relevant columns were edited
  // B: Starting CP, C: Ending CP, E: Attendance
  const relevantColumns = [EVAL_COLUMNS.STARTING_CP, EVAL_COLUMNS.ENDING_CP, EVAL_COLUMNS.ATTENDANCE];
  
  if (!relevantColumns.includes(col)) {
    Logger.log(`ℹ️ Skipping - edited column ${col} not relevant`);
    return;
  }
  
  Logger.log(`✏️ Data edited at row ${row}, col ${col} - recalculating...`);
  
  // Debounce: add small delay to prevent rapid re-execution
  Utilities.sleep(500);
  
  try {
    evaluateAllMembersSheet(sheet, sheetName);
    Logger.log('✅ Recalculation complete');
  } catch (err) {
    Logger.log('❌ Error in onEdit: ' + err.toString());
  }
}

/**
 * Manual trigger to force recalculation
 * Call this from Apps Script editor or set up time trigger
 */
function forceRecalculate() {
  Logger.log('🔄 Force recalculate triggered');
  return evaluateAllMembers();
}

/**
 * Sort by Final Score (descending)
 */
function sortByFinalScore() {
  const ss = getEvaluationSheet();
  const sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  if (!sheet) return;
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  
  // Sort from row 2 (skip header), column K (Final Score), descending
  sheet.getRange(2, 1, lastRow - 1, EVAL_COLUMNS.SELECTED_CORE)
    .sort({ column: EVAL_COLUMNS.FINAL_SCORE, ascending: false });
  
  Logger.log('✅ Sorted by Final Score');
}

/**
 * Get evaluation summary for Discord bot
 */
function getEvaluationSummary(data) {
  const ss = getEvaluationSheet();
  const sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  if (!sheet) {
    return createResponse('error', 'Evaluation sheet not found');
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return createResponse('ok', 'No data', { members: [], coreMembers: [] });
  }
  
  const allData = sheet.getRange(2, 1, lastRow - 1, EVAL_COLUMNS.SELECTED_CORE).getValues();
  
  const members = [];
  const coreMembers = [];
  
  allData.forEach(row => {
    const memberName = (row[EVAL_COLUMNS.MEMBER_NAME - 1] || '').toString().trim();
    if (!memberName) return;
    
    const member = {
      name: memberName,
      startingCP: Number(row[EVAL_COLUMNS.STARTING_CP - 1]) || 0,
      endingCP: Number(row[EVAL_COLUMNS.ENDING_CP - 1]) || 0,
      attendance: Number(row[EVAL_COLUMNS.ATTENDANCE - 1]) || 0,
      cpGrowthPct: Number(row[EVAL_COLUMNS.CP_GROWTH_PCT - 1]) || 0,
      bracket: (row[EVAL_COLUMNS.BRACKET - 1] || '').toString().trim(),
      bracketAvgGrowth: Number(row[EVAL_COLUMNS.BRACKET_AVG_GROWTH - 1]) || 0,
      relativeGrowth: Number(row[EVAL_COLUMNS.RELATIVE_GROWTH - 1]) || 0,
      cpPoints: Number(row[EVAL_COLUMNS.CP_POINTS - 1]) || 0,
      attendancePoints: Number(row[EVAL_COLUMNS.ATTENDANCE_POINTS - 1]) || 0,
      finalScore: Number(row[EVAL_COLUMNS.FINAL_SCORE - 1]) || 0,
      coreEligible: (row[EVAL_COLUMNS.CORE_ELIGIBLE - 1] || '').toString().trim(),
      selectedCore: (row[EVAL_COLUMNS.SELECTED_CORE - 1] || '').toString().trim(),
    };
    
    members.push(member);
    
    if (member.selectedCore === 'Yes') {
      coreMembers.push(member);
    }
  });
  
  return createResponse('ok', 'Evaluation fetched', {
    totalMembers: members.length,
    members: members,
    coreMembers: coreMembers,
  });
}

/**
 * Submit new member evaluation
 */
function submitMemberEvaluation(data) {
  const memberName = (data.memberName || '').toString().trim();
  const startingCP = Number(data.startingCP) || 0;
  const endingCP = Number(data.endingCP) || startingCP;
  const attendance = Number(data.attendance) || 0;
  
  if (!memberName) {
    return createResponse('error', 'Member name required');
  }
  
  const ss = getEvaluationSheet();
  let sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(EVAL_CONFIG.SHEET_NAME);
    setHeaders(sheet);
  }
  
  // Check if member already exists
  const lastRow = sheet.getLastRow();
  const existingData = lastRow > 1 ? sheet.getRange(2, EVAL_COLUMNS.MEMBER_NAME, lastRow - 1, 1).getValues() : [];
  let existingRow = -1;
  
  for (let i = 0; i < existingData.length; i++) {
    if ((existingData[i][0] || '').toString().trim().toLowerCase() === memberName.toLowerCase()) {
      existingRow = 2 + i;
      break;
    }
  }
  
  // Write basic data (calculation will be done by evaluateAllMembers)
  const rowData = [memberName, startingCP, endingCP, attendance];
  
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, 4).setValues([rowData]);
    Logger.log(`✅ Updated evaluation for ${memberName}`);
  } else {
    sheet.appendRow(rowData);
    Logger.log(`✅ Added evaluation for ${memberName}`);
  }
  
  // Recalculate all
  evaluateAllMembers();
  
  return createResponse('ok', `Evaluation submitted for ${memberName}`, { memberName, startingCP, endingCP, attendance });
}

/**
 * Sync evaluation data from Discord bot (CoreEvaluation collection)
 * Receives all CP submissions and stores them in the sheet
 */
function syncEvaluationData(data) {
  try {
    const evalData = data.data || [];
    
    if (!evalData || evalData.length === 0) {
      return createResponse('ok', 'No data to sync');
    }
    
    const ss = getEvaluationSheet();
    
    // Group data by cycle number
    const dataByCycle = {};
    evalData.forEach(item => {
      const cycle = item.cycleNumber || 1;
      if (!dataByCycle[cycle]) {
        dataByCycle[cycle] = [];
      }
      const name = (item.discordNickname || '').toString().trim();
      if (!dataByCycle[cycle][name] || item.submittedAt > dataByCycle[cycle][name].submittedAt) {
        dataByCycle[cycle][name] = item;
      }
    });
    
    // Process each cycle
    const results = [];
    for (const [cycleNum, cycleData] of Object.entries(dataByCycle)) {
      const sheetName = `CYCLE ${cycleNum}`;
      let sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        setHeaders(sheet);
      }
      
      const lastRow = sheet.getLastRow();
      const existingData = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, EVAL_COLUMNS.SELECTED_CORE).getValues() : [];
      
      // Update or add members
      Object.values(cycleData).forEach(item => {
        const memberName = (item.discordNickname || '').toString().trim();
        if (!memberName) return;
        
        const memberCP = item.cp || 0;
        const screenshotUrl = item.screenshotUrl || '';
        const currentCycle = parseInt(cycleNum);
        
        // Find existing row
        let existingRow = -1;
        for (let i = 0; i < existingData.length; i++) {
          if ((existingData[i][EVAL_COLUMNS.MEMBER_NAME - 1] || '').toString().trim().toLowerCase() === memberName.toLowerCase()) {
            existingRow = 2 + i;
            break;
          }
        }
        
        let rowData;
        
        if (existingRow > 0) {
          const existingStartingCP = Number(existingData[existingRow - 2][EVAL_COLUMNS.STARTING_CP - 1]) || 0;
          const existingEndingCP = Number(existingData[existingRow - 2][EVAL_COLUMNS.ENDING_CP - 1]) || 0;
          
          if (existingStartingCP === 0) {
            // No data yet - first submission in this cycle
            rowData = [memberName, memberCP, 0, 0, 0, '', 0, 0, 0, 0, 0, '', '', screenshotUrl];
          } else if (existingEndingCP === 0) {
            // Has Starting CP, no Ending CP - this is second submission
            rowData = [memberName, existingStartingCP, memberCP, 0, 0, '', 0, 0, 0, 0, 0, '', '', screenshotUrl];
          } else {
            // Has both - just update Ending CP (same cycle, updating)
            rowData = [memberName, existingStartingCP, memberCP, 0, 0, '', 0, 0, 0, 0, 0, '', '', screenshotUrl];
          }
          
          sheet.getRange(existingRow, 1, 1, 14).setValues([rowData]);
        } else {
          // New member in this cycle - check if they exist in previous cycles
          let previousEndingCP = 0;
          let lastParticipatedCycle = 0;
          
          // Check previous cycles for this member's Ending CP
          for (let prevCycle = currentCycle - 1; prevCycle >= 1; prevCycle--) {
            const prevSheetName = `Cycle ${prevCycle}`;
            const prevSheet = ss.getSheetByName(prevSheetName);
            if (prevSheet) {
              const prevData = prevSheet.getDataRange().getValues();
              for (let r = 1; r < prevData.length; r++) {
                if ((prevData[r][0] || '').toString().trim().toLowerCase() === memberName.toLowerCase()) {
                  const endingCP = Number(prevData[r][2]) || 0;
                  if (endingCP > 0) {
                    previousEndingCP = endingCP;
                    lastParticipatedCycle = prevCycle;
                    break;
                  }
                }
              }
              if (previousEndingCP > 0) break;
            }
          }
          
          // Check if member missed any cycles (gap in participation)
          const cyclesMissed = currentCycle - lastParticipatedCycle - 1;
          
          if (previousEndingCP > 0 && cyclesMissed === 0) {
            // Member participated in immediately previous cycle - continue from there
            rowData = [memberName, previousEndingCP, memberCP, 0, 0, '', 0, 0, 0, 0, 0, '', '', screenshotUrl];
            Logger.log(`📝 ${memberName}: Returning (consecutive) → Starting CP = ${previousEndingCP}, Ending CP = ${memberCP}`);
          } else if (previousEndingCP > 0 && cyclesMissed > 0) {
            // Member MISSED cycles - reset! They start fresh
            // Their new submission becomes their Starting CP only
            rowData = [memberName, memberCP, 0, 0, 0, '', 0, 0, 0, 0, 0, '', '', screenshotUrl];
            Logger.log(`📝 ${memberName}: RESET (missed ${cyclesMissed} cycle(s)) → Starting CP = ${memberCP} fresh`);
          } else {
            // Completely new member - this is their Starting CP
            // Will need Ending CP in next cycle to be eligible
            rowData = [memberName, memberCP, 0, 0, 0, '', 0, 0, 0, 0, 0, '', '', screenshotUrl];
            Logger.log(`📝 ${memberName}: NEW member → Starting CP = ${memberCP} (eligible in next cycle)`);
          }
          
          sheet.appendRow(rowData);
        }
      });
      
      // Run evaluation for this cycle
      evaluateAllMembersSheet(sheet, sheetName);
      
      results.push(`Cycle ${cycleNum}: ${Object.keys(cycleData).length} members`);
    }
    
    return createResponse('ok', `Synced: ${results.join(', ')}`, { results });
    
  } catch (err) {
    Logger.log('❌ Error in syncEvaluationData: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Update member's ending CP and attendance
 */
function updateMemberProgress(data) {
  const memberName = (data.memberName || '').toString().trim();
  const endingCP = Number(data.endingCP);
  const attendance = Number(data.attendance);
  
  if (!memberName) {
    return createResponse('error', 'Member name required');
  }
  
  const ss = getEvaluationSheet();
  const sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  if (!sheet) {
    return createResponse('error', 'Evaluation sheet not found');
  }
  
  const lastRow = sheet.getLastRow();
  const allData = sheet.getRange(2, 1, lastRow - 1, EVAL_COLUMNS.SELECTED_CORE).getValues();
  let found = false;
  
  for (let i = 0; i < allData.length; i++) {
    if ((allData[i][EVAL_COLUMNS.MEMBER_NAME - 1] || '').toString().trim().toLowerCase() === memberName.toLowerCase()) {
      const rowNum = 2 + i;
      
      if (endingCP !== undefined) {
        sheet.getRange(rowNum, EVAL_COLUMNS.ENDING_CP).setValue(endingCP);
      }
      if (attendance !== undefined) {
        sheet.getRange(rowNum, EVAL_COLUMNS.ATTENDANCE).setValue(attendance);
      }
      
      found = true;
      Logger.log(`✅ Updated ${memberName}: Ending CP=${endingCP}, Attendance=${attendance}`);
      break;
    }
  }
  
  if (!found) {
    return createResponse('error', `Member not found: ${memberName}`);
  }
  
  // Recalculate all
  evaluateAllMembers();
  
  return createResponse('ok', `Updated ${memberName}`, { memberName, endingCP, attendance });
}

/**
 * Clear all member data (keep headers)
 */
function clearAllEvaluations() {
  const ss = getEvaluationSheet();
  const sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  if (!sheet) {
    return createResponse('ok', 'No sheet to clear');
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  Logger.log('✅ All evaluations cleared');
  return createResponse('ok', 'All evaluations cleared');
}

// ==================== WEB APP HANDLERS ====================

function doGet(e) {
  try {
    const action = e.parameter.action || 'unknown';
    Logger.log(`🔍 GET Action: ${action}`);
    
    if (action === 'getSummary') return getEvaluationSummary(data);
    if (action === 'getCoreMembers') return getCoreMembers(data);
    
    Logger.log(`❌ Unknown GET action: ${action}`);
    return createResponse('error', 'Unknown action: ' + action);
    
  } catch (err) {
    Logger.log('❌ GET Error: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const action = (e.parameter && e.parameter.action) || data.action || 'unknown';
    
    Logger.log(`🔥 Action: ${action}`);
    
    // Evaluation actions
    if (action === 'evaluate') return evaluateAllMembers();
    if (action === 'getSummary') return getEvaluationSummary(data);
    if (action === 'getCoreMembers') return getCoreMembers(data);
    if (action === 'submitEvaluation') return submitMemberEvaluation(data);
    if (action === 'updateProgress') return updateMemberProgress(data);
    if (action === 'clearAll') return clearAllEvaluations();
    if (action === 'sortByScore') return sortByFinalScore();
    if (action === 'forceRecalculate') return forceRecalculate();
    if (action === 'syncEvaluation') return syncEvaluationData(data);
    
    Logger.log(`❌ Unknown action: ${action}`);
    return createResponse('error', 'Unknown action: ' + action);
    
  } catch (err) {
    Logger.log('❌ Error: ' + err.toString());
    Logger.log(err.stack);
    return createResponse('error', err.toString());
  }
}

/**
 * Get only Core members
 */
function getCoreMembers(data) {
  const result = getEvaluationSummary(data);
  
  if (result && result.members) {
    const coreMembers = result.members.filter(m => m.selectedCore === 'Yes');
    return createResponse('ok', 'Core members fetched', {
      coreMembers: coreMembers,
      count: coreMembers.length,
    });
  }
  
  return result;
}

// ==================== HELPER FUNCTIONS ====================

function createResponse(status, message, extra = {}) {
  const response = Object.assign({ status, message }, extra);
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Display summary in sheet for quick reference
 */
function displaySummary() {
  const ss = getEvaluationSheet();
  const sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  if (!sheet) return;
  
  const result = getEvaluationSummary({});
  
  if (result && result.members) {
    const coreCount = result.coreMembers ? result.coreMembers.length : 0;
    const totalCount = result.totalMembers || 0;
    
    Logger.log(`📊 Evaluation Summary: ${totalCount} members, ${coreCount} Core members selected`);
    return { totalMembers: totalCount, coreMembers: coreCount };
  }
  
  return null;
}

/**
 * Test function - run to verify setup
 */
function testEvaluation() {
  Logger.log('🧪 Running evaluation test...');
  
  // Add test data
  const testMembers = [
    { name: 'TestPlayer1', startCP: 90000, endCP: 105000, attendance: 8 },
    { name: 'TestPlayer2', startCP: 75000, endCP: 82000, attendance: 7 },
    { name: 'TestPlayer3', startCP: 110000, endCP: 125000, attendance: 6 },
    { name: 'TestPlayer4', startCP: 50000, endCP: 58000, attendance: 5 },
    { name: 'TestPlayer5', startCP: 80000, endCP: 88000, attendance: 8 },
    { name: 'TestPlayer6', startCP: 95000, endCP: 100000, attendance: 4 },
  ];
  
  const ss = getEvaluationSheet();
  let sheet = ss.getSheetByName(EVAL_CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(EVAL_CONFIG.SHEET_NAME);
    setHeaders(sheet);
  }
  
  // Clear existing test data
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // Add test members
  testMembers.forEach(m => {
    sheet.appendRow([m.name, m.startCP, m.endCP, m.attendance]);
  });
  
  // Run evaluation
  const result = evaluateAllMembers();
  
  Logger.log('✅ Test complete: ' + JSON.stringify(result));
  return result;
}
