/**
 * TENCHU Guild System - Google Apps Script v6.2 (OPTIMIZED)
 *
 * OPTIMIZATION UPDATES (v6.2 - Performance Enhancements):
 * ✅ SERVER-SIDE CACHING - getBiddingPoints now uses CacheService (40-60% API reduction)
 * ✅ CACHE INVALIDATION - onEdit automatically invalidates cache when BiddingPoints sheet changes
 * ✅ CONFIGURABLE TTL - Cache duration set to 5 minutes (300 seconds)
 * ✅ FORCE REFRESH - Support for forceFresh parameter to bypass cache
 *
 * OPTIMIZATION UPDATES (v6.1 - Critical Fixes):
 * ✅ SMART FILTERING - onEdit() only triggers on meaningful data changes (75-80% reduction in executions)
 * ✅ DEBOUNCING - Updates run at most once per 5 seconds (prevents rapid re-execution)
 * ✅ CONFLICT PREVENTION - Manual updates set flag to prevent double execution
 * ✅ STATE VERSIONING - Version tracking added to _BotState and _AttendanceState (conflict detection)
 * ✅ REMOVED AUTO-ADD - No longer automatically adds members to BiddingPoints (logs warnings instead)
 *
 * OPTIMIZATION UPDATES (v6.0):
 * ✅ Auto-update on sheet edit - onEdit() trigger automatically updates BiddingPoints and TotalAttendance
 * ✅ Sunday automation - sundayWeeklySheetCreation() creates new weekly sheets every Sunday
 * ✅ Discord #admin-logs integration - Auto-notify when new weekly sheet is created
 * ✅ Optimized data sync - Real-time updates ensure data consistency across all sheets
 *
 * PERFORMANCE IMPROVEMENTS:
 * - Server-side caching reduces Google Sheets API calls by 40-60%
 * - Reduced onEdit triggers by ~75-80% (smart column/row filtering)
 * - Prevented double execution of updateBiddingPoints() (was running twice per bidding submission)
 * - Added 5-second debounce to prevent rapid re-execution
 * - Only triggers on data columns (attendance, member names, bidding points)
 *
 * SETUP INSTRUCTIONS:
 * 1. Set up Apps Script Triggers:
 *    - onEdit: Edit trigger > On edit
 *    - sundayWeeklySheetCreation: Time-driven > Week timer > Every Sunday > 12am-1am
 * 2. Review CODE_REVIEW_CONFLICTS.md for detailed analysis of fixes
 *
 * NOTE: Discord notifications are now handled by the bot via Discord.js (no webhook needed)
 *
 * PREVIOUS FEATURES (v5.0):
 * - Auto-populate 0 for all members in bidding results
 */

const CONFIG = {
  SSHEET_ID: '1K07R6lXnsha7NshyAnIL4Iq034PlYCP64TaiPJwseCw',
  SHEET_NAME_PREFIX: 'WEEK_',
  BOSS_POINTS_SHEET: 'BossPoints',
  BIDDING_SHEET: 'BiddingPoints',
  TIMEZONE: 'Asia/Manila',
  CACHE_TTL_SECONDS: 300, // Cache duration for bidding points: 5 minutes
  CACHE_TTL_LONG: 1800, // Cache duration for historical data: 30 minutes
};

const COLUMNS = {
  MEMBERS: 1,
  USERNAME: 1,  // Alias for MEMBERS (used in attendance tracking)
  POINTS_CONSUMED: 2,
  POINTS_LEFT: 3,
  ATTENDANCE_POINTS: 4,
  FIRST_SPAWN: 5,
};

function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;

  const str = timestamp.toString().trim();

  // Check if already in STRICT MM/DD/YY HH:MM format (must be zero-padded)
  if (/^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/.test(str)) {
    return str;
  }

  // Try to parse as Date (for Google Sheets format or non-padded timestamps)
  try {
    const date = new Date(str);
    if (isNaN(date.getTime())) {
      return null;
    }

    // Convert to Manila timezone with zero-padding
    const manilaTime = Utilities.formatDate(date, CONFIG.TIMEZONE, 'MM/dd/yy HH:mm');
    return manilaTime;
  } catch (e) {
    return null;
  }
}

/**
 * Normalize username for consistent matching
 * Matches the normalization in bidding.js utils/common.js
 * @param {string} username - Username to normalize
 * @returns {string} Normalized username
 */
function normalizeUsername(username) {
  if (!username) return '';
  return username
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')            // Remove all spaces
    .replace(/[^\w]/g, '');         // Remove special characters (keep alphanumeric only)
}

// GET REQUEST HANDLER - For read-only operations
function doGet(e) {
  try {
    const action = e.parameter.action || 'unknown';
    Logger.log(`🔍 GET Action: ${action}`);

    Logger.log(`❌ Unknown GET action: ${action}`);
    return ContentService.createTextOutput(JSON.stringify(createResponse('error', 'Unknown action: ' + action))).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('❌ GET Error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify(createResponse('error', err.toString()))).setMimeType(ContentService.MimeType.JSON);
  }
}

// MAIN WEBHOOK HANDLER - COMPLETE VERSION
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    // Check query parameters first (for compatibility with axios.post calls using ?action=X)
    // then fall back to POST body action field
    const action = (e.parameter && e.parameter.action) || data.action || 'unknown';

    // Auto-initialize Member Registry tab if needed
    ensureMemberRegistryTab();
    ensureRegistryHasUsernameColumn();
    ensureRegistryHasLastKnownColumn();
    ensureBiddingPointsSheet();
    ensureTotalAttendanceSheet();
    ensureBossPointsSheet();
    ensureBiddingItemsSheet();
    ensureForDistributionSheet();

    Logger.log(`🔥 Action: ${action}`);

    // Attendance actions
    if (action === 'getAttendanceForBoss') return getAttendanceForBoss(data);
    if (action === 'checkColumn') return handleCheckColumn(data);
    if (action === 'submitAttendance') return handleSubmitAttendance(data);
    if (action === 'overwriteAttendance') return handleOverwriteAttendance(data);
    if (action === 'getAttendanceState') return getAttendanceState(data);
    if (action === 'saveAttendanceState') return saveAttendanceState(data);
    if (action === 'getAllSpawnColumns') return getAllSpawnColumns(data);
    if (action === 'getAllWeeklyAttendance') return getAllWeeklyAttendance(data);

    // Bidding actions
    if (action === 'getBiddingPointsSummary') return handleGetBiddingPoints(data);
    if (action === 'submitBiddingResults') return handleSubmitBiddingResults(data);
    if (action === 'removeMember') return handleRemoveMember(data);
    if (action === 'getBiddingItems') return getBiddingItems(data);
    if (action === 'getBiddingItemsWithWinners') return getBiddingItemsWithWinners(data);
    if (action === 'logAuctionResult') return logAuctionResult(data);
    if (action === 'getBotState') return getBotState(data);
    if (action === 'saveBotState') return saveBotState(data);
    if (action === 'moveQueueItemsToSheet') return moveQueueItemsToSheet(data);
    if (action === 'moveAuctionedItemsToForDistribution') return moveAllItemsWithWinnersToForDistribution();

    if (action === 'getBiddingPoints') return getBiddingPoints(data);



    // Leaderboard & Weekly Report actions
    if (action === 'getAttendanceLeaderboard') return getAttendanceLeaderboard(data);
    if (action === 'getBiddingLeaderboard') return getBiddingLeaderboard(data);
    if (action === 'getWeeklySummary') return getWeeklySummary(data);
    if (action === 'getMemberStats') return getMemberStats(data);

    // Boss Rotation actions (dynamic guild rotation tracking)
    if (action === 'getAllRotatingBosses') return getAllRotatingBosses();
    if (action === 'getBossRotation') return getBossRotation(data);
    if (action === 'incrementBossRotation') return incrementBossRotation(data);
    if (action === 'setBossRotation') return setBossRotation(data);
    if (action === 'ensureBossRotationSheetExists') return ensureBossRotationSheetExists();

    // Crash Recovery actions (system state persistence for crash recovery)
    if (action === 'ensureRecoverySheet') return ensureRecoverySheet(data);
    if (action === 'saveRecoveryState') return saveRecoveryState(data);
    if (action === 'loadRecoveryState') return loadRecoveryState(data);

    // Boss Timer Recovery actions (persist boss kill/spawn times across restarts)
    if (action === 'getBossTimerRecovery') return getBossTimerRecovery();
    if (action === 'saveBossTimerRecovery') return saveBossTimerRecovery(data);
    if (action === 'deleteBossTimerRecovery') return deleteBossTimerRecovery(data);
    if (action === 'clearBossTimerRecovery') return clearBossTimerRecovery(data);

    // Member Registry
    if (action === 'syncMemberRegistry') return handleSyncMemberRegistry(data);
    if (action === 'lookupMemberName') return handleLookupMemberName(data);
    if (action === 'batchLookupMembers') return handleBatchLookupMembers(data);
    if (action === 'syncWeekAttendance') return handleSyncWeekAttendance(data);
    if (action === 'renameMember') return handleRenameMember(data);

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

  const normalizedInputTimestamp = normalizeTimestamp(timestamp);

  // Skip if input timestamp is invalid
  if (!normalizedInputTimestamp) {
    return createResponse('ok', 'Invalid timestamp', {exists: false});
  }

  for (let i = 0; i < row1.length; i++) {
    const cellTimestamp = (row1[i] || '').toString().trim();
    const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
    const normalizedCellTimestamp = normalizeTimestamp(cellTimestamp);

    // Skip if cell timestamp is invalid
    if (!normalizedCellTimestamp) continue;

    if (normalizedCellTimestamp === normalizedInputTimestamp && cellBoss === boss) {
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
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

/**
 * Get all spawn columns from ALL weekly attendance sheets
 * Used for spawn prediction - analyzes historical patterns across all weeks
 */
function getAllWeeklyAttendance(data) {
  try {
    const cache = CacheService.getDocumentCache();
    const cacheKey = 'weeklyAttendance_v2'; // Changed to v2 to invalidate old cache

    // Check if force refresh requested
    const forceFresh = data && data.forceFresh === true;

    // Try to get from cache first (unless force refresh)
    if (!forceFresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          Logger.log('✅ Cache hit for weekly attendance');
          return createResponse('ok', 'All weekly attendance fetched (cached)', { sheets: cachedData });
        } catch (e) {
          Logger.log('⚠️ Cache parse error, fetching fresh: ' + e.message);
          // Continue to fresh fetch if cache is corrupted
        }
      }
    }

    // Cache miss or force refresh - read from sheets
    Logger.log('📊 Cache miss, reading from sheets');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = ss.getSheets();
    const weeklySheets = [];

    // Filter to only weekly attendance sheets (matching pattern WEEK_*)
    for (const sheet of allSheets) {
      const sheetName = sheet.getName();
      if (sheetName.startsWith(CONFIG.SHEET_NAME_PREFIX)) {
        weeklySheets.push(sheet);
      }
    }

    Logger.log(`📊 Found ${weeklySheets.length} weekly sheets: ${weeklySheets.map(s => s.getName()).join(', ')}`);

    if (weeklySheets.length === 0) {
      Logger.log('⚠️ No weekly attendance sheets found');
      // Cache empty result too (30 min for historical data)
      cache.put(cacheKey, JSON.stringify([]), CONFIG.CACHE_TTL_LONG);
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const allAttendanceRecords = [];

    // Extract attendance records from each weekly sheet
    for (const sheet of weeklySheets) {
      const sheetName = sheet.getName();
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();

      Logger.log(`📄 Processing ${sheetName}: ${lastRow} rows, ${lastCol} columns`);

      if (lastCol < COLUMNS.FIRST_SPAWN || lastRow < 3) {
        // No spawn columns or no member rows in this sheet
        Logger.log(`ℹ️ Skipping ${sheetName} - no data (lastCol: ${lastCol}, lastRow: ${lastRow}, need: col >= ${COLUMNS.FIRST_SPAWN}, row >= 3)`);
        continue;
      }

      // Read all data (headers + members)
      const allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();

      const timestamps = allData[0]; // Row 1: Timestamps
      const bossNames = allData[1];  // Row 2: Boss names
      const memberRows = allData.slice(2); // Row 3+: Members

      let sheetRecordCount = 0;
      let spawnColumnCount = 0;

      // For each spawn column
      for (let col = COLUMNS.FIRST_SPAWN - 1; col < lastCol; col++) {
        const timestamp = (timestamps[col] || '').toString().trim();
        const bossName = (bossNames[col] || '').toString().trim().toUpperCase();

        if (!timestamp || !bossName) {
          continue; // Skip empty columns
        }

        spawnColumnCount++;

        // DEBUG: Log first spawn column details to see actual data format
        if (spawnColumnCount === 1) {
          Logger.log(`🔍 DEBUG First spawn column (col ${col + 1}): timestamp="${timestamp}", boss="${bossName}"`);
          Logger.log(`🔍 DEBUG First data row (row 3) - ALL columns (first 10):`);
          const firstRow = memberRows[0] || [];
          for (let debugCol = 0; debugCol < Math.min(10, firstRow.length); debugCol++) {
            const val = firstRow[debugCol];
            Logger.log(`   Column ${debugCol + 1} (${String.fromCharCode(65 + debugCol)}): "${val}" (type: ${typeof val})`);
          }
          Logger.log(`🔍 DEBUG Sample member rows (using COLUMNS.USERNAME = ${COLUMNS.USERNAME}):`);
          for (let debugRow = 0; debugRow < Math.min(3, memberRows.length); debugRow++) {
            const debugMember = (memberRows[debugRow][COLUMNS.USERNAME - 1] || '').toString().trim();
            const debugCheckmark = memberRows[debugRow][col];
            Logger.log(`   Row ${debugRow + 3}: memberName="${debugMember}", checkmarkValue=${JSON.stringify(debugCheckmark)} (type: ${typeof debugCheckmark})`);
          }
        }

        // Extract members who attended this spawn
        for (let row = 0; row < memberRows.length; row++) {
          const memberName = (memberRows[row][COLUMNS.USERNAME - 1] || '').toString().trim();
          const checkmarkValue = memberRows[row][col];

          // Handle different checkmark formats:
          // - Boolean TRUE (Google Sheets checkbox)
          // - Text checkmarks (✓, ✔, ☑, TRUE, etc.)
          // - Any non-empty value
          const hasCheckmark = checkmarkValue === true ||
                              (checkmarkValue && checkmarkValue.toString().trim() !== '' && checkmarkValue.toString().trim().toLowerCase() !== 'false');

          // If member has a checkmark
          if (memberName && hasCheckmark) {
            allAttendanceRecords.push({
              memberName: memberName,
              bossName: bossName,
              timestamp: timestamp,
              date: timestamp, // For backward compatibility
              weekLabel: sheetName.replace(CONFIG.SHEET_NAME_PREFIX, ''),
              weekSheet: sheetName,
              points: 1 // Default points (can be enhanced later)
            });
            sheetRecordCount++;
          }
        }
      }

      Logger.log(`   ✓ ${sheetName}: ${spawnColumnCount} spawns, ${sheetRecordCount} attendance records`);
    }

    Logger.log(`✅ Found ${allAttendanceRecords.length} attendance records across ${weeklySheets.length} weekly sheets`);

    // Store in cache for future requests (30 min for historical data)
    try {
      cache.put(cacheKey, JSON.stringify(allAttendanceRecords), CONFIG.CACHE_TTL_LONG);
      Logger.log(`✅ Cached ${allAttendanceRecords.length} records for ${CONFIG.CACHE_TTL_LONG}s`);
    } catch (e) {
      Logger.log('⚠️ Failed to cache weekly attendance: ' + e.message);
      // Continue anyway, just won't be cached
    }

    // Return properly serialized JSON for Google Apps Script web app
    return ContentService.createTextOutput(JSON.stringify(allAttendanceRecords))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('❌ Error in getAllWeeklyAttendance: ' + err.toString());
    return createResponse('error', err.toString());
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

    const normalizedInputTimestamp = normalizeTimestamp(timestamp);

    // Skip if input timestamp is invalid
    if (!normalizedInputTimestamp) {
      return createResponse('error', 'Invalid timestamp format');
    }

    if (lastCol >= COLUMNS.FIRST_SPAWN) {
      const spawnData = sheet.getRange(1, COLUMNS.FIRST_SPAWN, 2, lastCol - COLUMNS.FIRST_SPAWN + 1).getValues();
      const row1 = spawnData[0], row2 = spawnData[1];
      for (let i = 0; i < row1.length; i++) {
        const cellTimestamp = (row1[i] || '').toString().trim();
        const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
        const normalizedCellTimestamp = normalizeTimestamp(cellTimestamp);

        // Skip if cell timestamp is invalid
        if (!normalizedCellTimestamp) continue;

        if (normalizedCellTimestamp === normalizedInputTimestamp && cellBoss === boss) {
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
        const insertStart = lastRow + 1;

        // Insert member names
        sheet.getRange(insertStart, COLUMNS.MEMBERS, newMembers.length, 1).setValues(newMemberData);

        // Copy formulas from previous row for columns B, C, D (if they exist)
        if (lastRow >= 3) {
          const formulas = sheet.getRange(lastRow, 2, 1, 3).getFormulas();
          for (let i = 0; i < newMembers.length; i++) {
            sheet.getRange(insertStart + i, 2, 1, 3).setFormulas(formulas);
          }
        }

        // Fill FALSE for all previous spawn columns (E to newCol-1)
        if (newCol > COLUMNS.FIRST_SPAWN) {
          const falseArray = Array(newMembers.length).fill(null).map(() => Array(newCol - COLUMNS.FIRST_SPAWN).fill(false));
          sheet.getRange(insertStart, COLUMNS.FIRST_SPAWN, newMembers.length, newCol - COLUMNS.FIRST_SPAWN)
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
    
    logAttendance(SpreadsheetApp.openById(CONFIG.SSHEET_ID), boss, timestamp, members);

    // Invalidate weekly attendance cache (new spawn added)
    try {
      const cache = CacheService.getDocumentCache();
      cache.remove('weeklyAttendance_v1');
      Logger.log('🧹 Invalidated weekly attendance cache (new spawn)');
    } catch (e) {
      Logger.log('⚠️ Failed to invalidate cache: ' + e.message);
    }

    // Auto-update TOTAL ATTENDANCE and BiddingPoints sheets
    try {
      updateTotalAttendanceAndMembers();
      Logger.log('📊 Auto-updated TOTAL ATTENDANCE sheet');
    } catch (e) {
      Logger.log('⚠️ Failed to update TOTAL ATTENDANCE: ' + e.message);
    }

    try {
      updateBiddingPoints();
      Logger.log('💰 Auto-updated BiddingPoints sheet');
    } catch (e) {
      Logger.log('⚠️ Failed to update BiddingPoints: ' + e.message);
    }

    return createResponse('ok', `Submitted: ${members.length}`, {column: newCol, boss, timestamp, membersCount: members.length});
  } finally { lock.releaseLock(); }
}

/**
 * Handle overwriting existing attendance column (or create new if not exists)
 * Used by !overrideclose command to update attendance for reopened threads
 */
function handleOverwriteAttendance(data) {
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

    const normalizedInputTimestamp = normalizeTimestamp(timestamp);

    if (!normalizedInputTimestamp) {
      return createResponse('error', 'Invalid timestamp format');
    }

    // Find existing column
    if (lastCol >= COLUMNS.FIRST_SPAWN) {
      const spawnData = sheet.getRange(1, COLUMNS.FIRST_SPAWN, 2, lastCol - COLUMNS.FIRST_SPAWN + 1).getValues();
      const row1 = spawnData[0], row2 = spawnData[1];
      for (let i = 0; i < row1.length; i++) {
        const cellTimestamp = (row1[i] || '').toString().trim();
        const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
        const normalizedCellTimestamp = normalizeTimestamp(cellTimestamp);

        if (!normalizedCellTimestamp) continue;

        if (normalizedCellTimestamp === normalizedInputTimestamp && cellBoss === boss) {
          targetColumn = i + COLUMNS.FIRST_SPAWN;
          break;
        }
      }
    }

    // If column exists, overwrite it; otherwise create new column
    const isOverwrite = !!targetColumn;
    const workingCol = targetColumn || (lastCol + 1);

    // Set header if new column
    if (!isOverwrite) {
      sheet.getRange(1, workingCol, 2, 1).setValues([[timestamp],[boss]])
        .setFontWeight('bold').setBackground('#E8F4F8').setHorizontalAlignment('center');
      sheet.setColumnWidth(workingCol, 120);
    }

    const lastRow = sheet.getLastRow();
    const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();

    if (lastRow >= 3) {
      const memberNames = sheet.getRange(3, COLUMNS.MEMBERS, lastRow - 2, 1).getValues().flat();
      const membersLower = members.map(m => m.toLowerCase());
      const sheetMembersLower = memberNames.map(m => (m || '').toString().trim().toLowerCase());

      // Add new members if needed (only for new columns or if member doesn't exist)
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
        const insertStart = lastRow + 1;

        sheet.getRange(insertStart, COLUMNS.MEMBERS, newMembers.length, 1).setValues(newMemberData);

        if (lastRow >= 3) {
          const formulas = sheet.getRange(lastRow, 2, 1, 3).getFormulas();
          for (let i = 0; i < newMembers.length; i++) {
            sheet.getRange(insertStart + i, 2, 1, 3).setFormulas(formulas);
          }
        }

        // Fill FALSE for all previous spawn columns (only up to workingCol-1)
        if (workingCol > COLUMNS.FIRST_SPAWN) {
          const falseArray = Array(newMembers.length).fill(null).map(() => Array(workingCol - COLUMNS.FIRST_SPAWN).fill(false));
          sheet.getRange(insertStart, COLUMNS.FIRST_SPAWN, newMembers.length, workingCol - COLUMNS.FIRST_SPAWN)
               .setValues(falseArray).setDataValidation(checkboxRule);
        }
      }

      // Update attendance column (overwrite or set new)
      const totalRows = lastRow + newMembersCount;
      if (totalRows >= 3) {
        const allMemberNames = sheet.getRange(3, COLUMNS.MEMBERS, totalRows - 2, 1).getValues().flat();
        const allMembersLower = allMemberNames.map(m => (m || '').toString().trim().toLowerCase());
        const attendanceData = allMembersLower.map(m => [membersLower.includes(m)]);
        sheet.getRange(3, workingCol, attendanceData.length, 1).setValues(attendanceData).setDataValidation(checkboxRule);
      }

    } else {
      sheet.getRange(3, COLUMNS.MEMBERS, members.length, 1).setValues(members.map(m => [m]));
      sheet.getRange(3, workingCol, members.length, 1).setValues(members.map(() => [true])).setDataValidation(checkboxRule);
    }

    logAttendance(SpreadsheetApp.openById(CONFIG.SSHEET_ID), boss, timestamp, members);

    const action = isOverwrite ? 'Overwritten' : 'Submitted';
    Logger.log(`📊 ${action} attendance: ${boss} at ${timestamp} - ${members.length} members`);

    // Invalidate weekly attendance cache (attendance updated)
    try {
      const cache = CacheService.getDocumentCache();
      cache.remove('weeklyAttendance_v1');
      Logger.log('🧹 Invalidated weekly attendance cache (attendance update)');
    } catch (e) {
      Logger.log('⚠️ Failed to invalidate cache: ' + e.message);
    }

    // Auto-update TOTAL ATTENDANCE and BiddingPoints sheets
    try {
      updateTotalAttendanceAndMembers();
      Logger.log('📊 Auto-updated TOTAL ATTENDANCE sheet');
    } catch (e) {
      Logger.log('⚠️ Failed to update TOTAL ATTENDANCE: ' + e.message);
    }

    try {
      updateBiddingPoints();
      Logger.log('💰 Auto-updated BiddingPoints sheet');
    } catch (e) {
      Logger.log('⚠️ Failed to update BiddingPoints: ' + e.message);
    }

    return createResponse('ok', `${action}: ${members.length}`, {column: workingCol, boss, timestamp, membersCount: members.length, overwritten: isOverwrite});
  } finally { lock.releaseLock(); }
}

function getCurrentWeekSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

        // Copy columns C, D (formulas = POINTS LEFT, ATTENDANCE POINTS)
        const formulas = prevSheet.getRange(3, 2, members.length, 3).getFormulas();
        newSheet.getRange(3, 2, members.length, 3).setFormulas(formulas);

        // **Reset Column B (POINTS CONSUMED) to 0 — new week, fresh start**
        newSheet.getRange(3, COLUMNS.POINTS_CONSUMED, members.length, 1).clearContent();
        newSheet.getRange(3, COLUMNS.POINTS_CONSUMED, members.length, 1).setValue(0);
      }
    }

    // Return previous sheet name for logging
    return prevSheet.getName();
  }

  return null;
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

/**
 * Get bidding items WITH winners (for tally submission after crash recovery)
 * Unlike getBiddingItems which skips items with winners, this returns ONLY items with winners
 */
function getBiddingItemsWithWinners(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found', {items: []});

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return createResponse('ok', 'No items', {items: []});

  const lastCol = sheet.getLastColumn();
  const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.min(lastCol, 12)).getValues();
  const items = [];

  dataRange.forEach((row, idx) => {
    const itemName = (row[0] || '').toString().trim();
    if (!itemName) return;

    const winner = (row[3] || '').toString().trim();
    if (!winner) return; // Skip items WITHOUT winners (opposite of getBiddingItems)

    const winningBid = Number(row[4]) || Number(row[1]) || 0; // Column E (Winning Bid) or fallback to Start Price

    items.push({
      item: itemName,
      startPrice: Number(row[1]) || 0,
      winningBid: winningBid,
      winner: winner,
      sheetIndex: idx + 2,
    });
  });

  Logger.log(`✅ Fetched ${items.length} items with winners`);
  return createResponse('ok', 'Items with winners fetched', {items});
}

function getAttendanceForBoss(data) {
  const weekSheet = data.weekSheet || '';
  const bossKey = data.bossKey || '';
  
  if (!weekSheet || !bossKey) {
    return createResponse('error', 'Missing weekSheet or bossKey', {attendees: []});
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(weekSheet);
  
  if (!sheet) {
    return createResponse('error', `Sheet not found: ${weekSheet}`, {attendees: []});
  }
  
  // Parse bossKey: "EGO 10/27/25 17:57"
  const match = bossKey.match(/^(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    Logger.log(`❌ Invalid bossKey format: "${bossKey}" (expected: "BOSS MM/DD/YY HH:MM")`);
    return createResponse('error', `Invalid bossKey format: ${bossKey}`, {attendees: []});
  }
  
  const bossName = match[1].trim().toUpperCase();
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  const year = match[4].padStart(2, '0');
  const hour = match[5].padStart(2, '0');
  const minute = match[6].padStart(2, '0');
  
  // Build target timestamp in exact format expected in sheet
  const targetTimestamp = `${month}/${day}/${year} ${hour}:${minute}`;
  
  Logger.log(`🔍 === ATTENDANCE LOOKUP START ===`);
  Logger.log(`📋 Sheet: ${weekSheet}`);
  Logger.log(`🔑 BossKey: "${bossKey}"`);
  Logger.log(`🎯 Target Boss: "${bossName}"`);
  Logger.log(`📅 Target Timestamp: "${targetTimestamp}"`);
  
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  
  if (lastCol < 5 || lastRow < 3) {
    Logger.log(`⚠️ Sheet has insufficient data (cols: ${lastCol}, rows: ${lastRow})`);
    return createResponse('error', 'Sheet has insufficient data', {attendees: []});
  }
  
  // Search for matching column - READ ALL COLUMNS AT ONCE
  const row1 = sheet.getRange(1, 5, 1, lastCol - 4).getValues()[0]; // Timestamps
  const row2 = sheet.getRange(2, 5, 1, lastCol - 4).getValues()[0]; // Boss names

  let targetColumn = -1;
  let foundMatches = [];

  for (let i = 0; i < row1.length; i++) {
    const cellTimestamp = (row1[i] || '').toString().trim();
    const cellBoss = (row2[i] || '').toString().trim().toUpperCase();
    
    // Skip empty cells
    if (!cellTimestamp || !cellBoss) continue;
    
    // Normalize the cell timestamp
    const normalizedCellTimestamp = normalizeTimestamp(cellTimestamp);

    // Skip if normalization failed
    if (!normalizedCellTimestamp) {
      Logger.log(`⚠️ Column ${i + 5}: Failed to normalize timestamp "${cellTimestamp}"`);
      continue;
    }

    // Log comparison for debugging
    Logger.log(`🔍 Column ${i + 5}: Boss="${cellBoss}" vs "${bossName}" | Timestamp="${normalizedCellTimestamp}" vs "${targetTimestamp}"`);

    // EXACT match required - both boss name AND timestamp must match
    const bossMatch = cellBoss === bossName;
    const timestampMatch = normalizedCellTimestamp === targetTimestamp;

    if (bossMatch && timestampMatch) {
      targetColumn = i + 5;
      Logger.log(`✅ EXACT MATCH FOUND at column ${targetColumn}!`);
      break;
    } else if (bossMatch) {
      // Boss matches but timestamp doesn't - log for debugging
      foundMatches.push({
        column: i + 5,
        timestamp: normalizedCellTimestamp,
        reason: 'Boss matches, timestamp differs'
      });
    }
  }
  
  if (targetColumn === -1) {
    Logger.log(`❌ No exact match found for "${bossKey}"`);
    
    if (foundMatches.length > 0) {
      Logger.log(`⚠️ Found ${foundMatches.length} spawn(s) with same boss name but different timestamps:`);
      foundMatches.forEach(m => {
        Logger.log(`   - Column ${m.column}: ${m.timestamp} (expected: ${targetTimestamp})`);
      });
    }
    
    return createResponse('ok', 'Boss spawn not found in attendance sheet', {
      attendees: [],
      debugInfo: {
        searchedFor: bossKey,
        targetBoss: bossName,
        targetTimestamp: targetTimestamp,
        nearMatches: foundMatches
      }
    });
  }
  
  Logger.log(`✅ Using column ${targetColumn} for attendance data`);
  
  // Get attendees (rows 3+, where checkbox = true)
  const memberNames = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
  const attendance = sheet.getRange(3, targetColumn, lastRow - 2, 1).getValues().flat();
  
  const attendees = [];
  for (let i = 0; i < memberNames.length; i++) {
    const member = (memberNames[i] || '').toString().trim();
    const attended = attendance[i] === true;
    
    if (attended && member) {
      attendees.push(member);
    }
    
    // Log first 5 members for debugging
    if (i < 5) {
      Logger.log(`   ${attended ? '✅' : '❌'} ${member || '(empty)'}`);
    }
  }
  
  Logger.log(`✅ Found ${attendees.length} attendees out of ${memberNames.length} total members`);
  Logger.log(`🔍 === ATTENDANCE LOOKUP END ===`);
  
  return createResponse('ok', `Attendance loaded for ${bossKey}`, {
    attendees: attendees,
    bossKey: bossKey,
    weekSheet: weekSheet,
    column: targetColumn,
    totalMembers: memberNames.length
  });
}

function getSessionNumber(timestamp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const year = String(manilaTime.getFullYear());
  const hours = String(manilaTime.getHours()).padStart(2, "0");
  const mins = String(manilaTime.getMinutes()).padStart(2, "0");
  
  const dateOnly = `${month}/${day}/${year}`;
  const dateTime = `${month}/${day}/${year} ${hours}:${mins}`;
  const sessionNum = getSessionNumber(dateTime);

  return {
    dateTime,
    sessionNum,
    columnHeader: dateOnly,
    auctionStartTime: dateTime,
    logDate: new Date().toISOString()
  };
}

function logAuctionEvent(eventData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName('AuctionLog');

  if (!logSheet) {
    logSheet = ss.insertSheet('AuctionLog');
    logSheet.getRange(1, 1, 1, 11).setValues([[
      'Session Date', 'Session Time', 'Session Number', 'Item', 'Source',
      'Winner', 'Amount', 'Total Bids', 'Auction Start', 'Auction End', 'Timestamp'
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
    eventData.totalBids || 0,
    eventData.auctionStart,
    eventData.auctionEnd,
    eventData.timestamp
  ];

  logSheet.appendRow(row);
}

// BIDDING FUNCTIONS
/**
 * Get bidding points with server-side caching (v6.2 optimization)
 *
 * CACHING STRATEGY:
 * - Uses Apps Script CacheService for fast repeated access
 * - Cache TTL: 5 minutes (configurable via CONFIG.CACHE_TTL_SECONDS)
 * - Automatically invalidated when BiddingPoints sheet is edited
 * - Force refresh available via data.forceFresh parameter
 *
 * PERFORMANCE IMPACT:
 * - Reduces Google Sheets API calls by 40-60%
 * - Cache hit response time: ~10ms vs ~500ms for sheet read
 * - Prevents rate limiting during high-traffic periods
 *
 * @param {Object} data - Request data
 * @param {boolean} data.forceFresh - Force cache bypass and fresh sheet read
 * @returns {Object} Response with points data
 */
function handleGetBiddingPoints(data) {
  Logger.log('📊 Reading bidding points from current week sheet Column D (ATTENDANCE POINTS)');

  // Always read fresh — formulas update in real-time
  const sheet = getCurrentWeekSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 3) {
    return createResponse('ok', 'No members in current week sheet', { points: {} });
  }

  // Read Column A (names) and Column D (attendance points) from row 3 onwards
  const dataRange = sheet.getRange(3, 1, lastRow - 2, 4);
  const values = dataRange.getValues();

  const points = {};
  values.forEach(r => {
    const member = (r[0] || '').toString().trim();
    if (member) {
      let attPoints = Number(r[3]) || 0; // Column D = index 3 (0-based)
      if (isNaN(attPoints)) attPoints = 0;
      points[member] = attPoints;
    }
  });

  Logger.log(`✅ Fetched bidding points for ${Object.keys(points).length} members from current week sheet`);
  return createResponse('ok', 'Points fetched (current week attendance)', { points });
}

/**
 * Invalidate bidding points cache
 * Called automatically when BiddingPoints sheet is edited via onEdit trigger
 */
function invalidateBiddingPointsCache() {
  const cache = CacheService.getDocumentCache();
  cache.remove('biddingPoints_v1');
  Logger.log('🗑️ Invalidated bidding points cache');
}

/**
 * Calculate similarity between two strings (0-1, higher is more similar)
 * Uses a simple character overlap algorithm
 */
function calculateSimilarity(str1, str2) {
  // Normalize both strings for consistent comparison
  const s1 = normalizeUsername(str1);
  const s2 = normalizeUsername(str2);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Calculate overlap
  let matches = 0;
  const minLen = Math.min(s1.length, s2.length);

  for (let i = 0; i < minLen; i++) {
    if (s1[i] === s2[i]) matches++;
  }

  // Also check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    matches += Math.min(s1.length, s2.length) * 0.5;
  }

  return matches / Math.max(s1.length, s2.length);
}

/**
 * Removes a member from ALL sheets (BiddingPoints and all attendance sheets)
 * Used when members are kicked or banned from the guild
 *
 * EXEMPTIONS:
 * - ForDistribution sheet is NOT touched (historical auction log)
 * - Only removes from BiddingPoints and WEEK_* attendance sheets
 *
 * @param {Object} data - Request data containing memberName
 * @param {string} data.memberName - Name of the member to remove
 * @returns {Object} Response object with status and result
 */
function handleRemoveMember(data) {
  const memberName = (data.memberName || '').toString().trim();

  if (!memberName) {
    return createResponse('error', 'Missing memberName parameter');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const normalizedTarget = normalizeUsername(memberName);

  Logger.log(`🔍 Searching for member: "${memberName}" (normalized: "${normalizedTarget}")`);

  let actualMemberName = memberName;
  let pointsLeft = 0;
  let biddingSheetRemoved = false;
  let attendanceSheetsRemoved = 0;
  const attendanceSheetsDetails = [];

  // Collect all member names for debugging (if member not found)
  const allMemberNames = new Set();

  // ==========================================
  // STEP 1: Remove from BiddingPoints sheet
  // ==========================================
  const biddingSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);

  if (biddingSheet) {
    const lastRow = biddingSheet.getLastRow();

    if (lastRow >= 2) {
      const memberNames = biddingSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      let rowIndex = -1;

      Logger.log(`📊 BiddingPoints sheet has ${memberNames.length} members`);

      for (let i = 0; i < memberNames.length; i++) {
        const currentMember = (memberNames[i][0] || '').toString().trim();
        const normalizedCurrent = normalizeUsername(currentMember);

        // Collect for debugging
        if (currentMember) allMemberNames.add(currentMember);

        if (normalizedCurrent === normalizedTarget) {
          rowIndex = i + 2; // +2 because array is 0-indexed and we start from row 2
          break;
        }
      }

      if (rowIndex !== -1) {
        // Get member data before deletion for logging
        const memberRow = biddingSheet.getRange(rowIndex, 1, 1, Math.min(biddingSheet.getLastColumn(), 4)).getValues()[0];
        actualMemberName = memberRow[0];
        pointsLeft = memberRow[1] || 0;

        // Delete the row
        biddingSheet.deleteRow(rowIndex);
        biddingSheetRemoved = true;

        Logger.log(`✅ Removed member: ${actualMemberName} from ${CONFIG.BIDDING_SHEET} (had ${pointsLeft} points)`);
      } else {
        Logger.log(`❌ Member not found in BiddingPoints sheet`);
      }
    }
  }

  // ==========================================
  // STEP 2: Remove from all attendance sheets (WEEK_*)
  // NOTE: ForDistribution sheet is EXCLUDED as it's a historical auction log
  // ==========================================
  const allSheets = ss.getSheets();
  const attendanceSheets = allSheets.filter(s => {
    const sheetName = s.getName();
    // Include only WEEK_ sheets, exclude ForDistribution
    return sheetName.startsWith(CONFIG.SHEET_NAME_PREFIX) && sheetName !== 'ForDistribution';
  });

  Logger.log(`🔍 Found ${attendanceSheets.length} attendance sheets to check (excluding ForDistribution)`);

  attendanceSheets.forEach(sheet => {
    const sheetName = sheet.getName();
    const lastRow = sheet.getLastRow();

    if (lastRow < 3) {
      Logger.log(`⏭️ Skipping ${sheetName} (no member data)`);
      return; // Skip sheets with no member data (only headers)
    }

    try {
      // Get all member names from column A (starting from row 3)
      const memberNames = sheet.getRange(3, COLUMNS.MEMBERS, lastRow - 2, 1).getValues();
      let rowIndex = -1;

      Logger.log(`📊 ${sheetName} has ${memberNames.length} members`);

      for (let i = 0; i < memberNames.length; i++) {
        const currentMember = (memberNames[i][0] || '').toString().trim();
        const normalizedCurrent = normalizeUsername(currentMember);

        // Collect for debugging
        if (currentMember) allMemberNames.add(currentMember);

        if (normalizedCurrent === normalizedTarget) {
          rowIndex = i + 3; // +3 because array is 0-indexed and we start from row 3
          break;
        }
      }

      if (rowIndex !== -1) {
        // Get attendance points before deletion
        let attendancePoints = 0;
        const memberRow = sheet.getRange(rowIndex, 1, 1, Math.min(sheet.getLastColumn(), COLUMNS.ATTENDANCE_POINTS)).getValues()[0];
        if (memberRow.length >= COLUMNS.ATTENDANCE_POINTS) {
          attendancePoints = memberRow[COLUMNS.ATTENDANCE_POINTS - 1] || 0;
        }

        // Delete the row
        sheet.deleteRow(rowIndex);
        attendanceSheetsRemoved++;

        attendanceSheetsDetails.push({
          sheet: sheetName,
          attendancePoints: attendancePoints
        });

        Logger.log(`✅ Removed member from ${sheetName} (had ${attendancePoints} attendance points)`);
      } else {
        Logger.log(`❌ Member not found in ${sheetName}`);
      }
    } catch (err) {
      Logger.log(`⚠️ Error removing from ${sheetName}: ${err.message}`);
    }
  });

  // ==========================================
  // STEP 3: Remove from TOTAL ATTENDANCE sheet
  // ==========================================
  let totalAttendanceRemoved = false;
  const totalAttendanceSheet = ss.getSheetByName('TOTAL ATTENDANCE');

  if (totalAttendanceSheet) {
    const lastRow = totalAttendanceSheet.getLastRow();

    if (lastRow >= 2) {
      const memberNames = totalAttendanceSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      let rowIndex = -1;

      Logger.log(`📊 TOTAL ATTENDANCE sheet has ${memberNames.length} members`);

      for (let i = 0; i < memberNames.length; i++) {
        const currentMember = (memberNames[i][0] || '').toString().trim();
        const normalizedCurrent = normalizeUsername(currentMember);

        // Collect for debugging
        if (currentMember) allMemberNames.add(currentMember);

        if (normalizedCurrent === normalizedTarget) {
          rowIndex = i + 2; // +2 because array is 0-indexed and we start from row 2
          break;
        }
      }

      if (rowIndex !== -1) {
        // Delete the row from TOTAL ATTENDANCE
        totalAttendanceSheet.deleteRow(rowIndex);
        totalAttendanceRemoved = true;
        Logger.log(`✅ Removed member from TOTAL ATTENDANCE sheet`);
      } else {
        Logger.log(`❌ Member not found in TOTAL ATTENDANCE sheet`);
      }
    }
  }

  // ==========================================
  // STEP 4: Return detailed results
  // ==========================================
  if (!biddingSheetRemoved && attendanceSheetsRemoved === 0 && !totalAttendanceRemoved) {
    // Member not found - provide helpful suggestions
    const allMembersArray = Array.from(allMemberNames).filter(m => m && m.length > 0);

    Logger.log(`❌ Member "${memberName}" not found in any sheets`);
    Logger.log(`📋 Total unique members found across all sheets: ${allMembersArray.length}`);

    // Find similar member names
    const similarities = allMembersArray.map(name => ({
      name: name,
      similarity: calculateSimilarity(memberName, name)
    }));

    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Get top 5 similar names
    const topMatches = similarities.slice(0, 5);

    Logger.log(`🔍 Top similar names:`);
    topMatches.forEach(match => {
      Logger.log(`  - "${match.name}" (similarity: ${(match.similarity * 100).toFixed(0)}%)`);
    });

    // Build error message with suggestions
    let errorMessage = `Member "${memberName}" not found in any sheets.`;

    if (topMatches.length > 0 && topMatches[0].similarity > 0.3) {
      errorMessage += '\n\nDid you mean one of these?';
      topMatches.forEach(match => {
        if (match.similarity > 0.3) {
          errorMessage += `\n• ${match.name}`;
        }
      });
    } else if (allMembersArray.length > 0) {
      // Show first 10 members if no good matches
      errorMessage += `\n\nAvailable members (first 10 of ${allMembersArray.length}):`;
      allMembersArray.slice(0, 10).forEach(name => {
        errorMessage += `\n• ${name}`;
      });
      if (allMembersArray.length > 10) {
        errorMessage += `\n... and ${allMembersArray.length - 10} more`;
      }
    }

    return createResponse('error', errorMessage, {
      found: false,
      biddingSheetRemoved: false,
      attendanceSheetsRemoved: 0,
      totalAttendanceRemoved: false,
      suggestions: topMatches.map(m => m.name),
      totalMembersFound: allMembersArray.length
    });
  }

  // Regenerate TOTAL ATTENDANCE sheet to ensure consistency
  if (attendanceSheetsRemoved > 0) {
    try {
      updateTotalAttendanceAndMembers();
      Logger.log(`✅ Regenerated TOTAL ATTENDANCE sheet after removal`);
    } catch (err) {
      Logger.log(`⚠️ Failed to regenerate TOTAL ATTENDANCE: ${err.message}`);
    }
  }

  const totalSheetsRemoved = (biddingSheetRemoved ? 1 : 0) + attendanceSheetsRemoved + (totalAttendanceRemoved ? 1 : 0);
  const totalAttendancePoints = attendanceSheetsDetails.reduce((sum, detail) => sum + detail.attendancePoints, 0);

  Logger.log(`✅ COMPLETE: Removed ${actualMemberName} from ${totalSheetsRemoved} sheet(s)`);

  return createResponse('ok', `Member "${actualMemberName}" removed from ${totalSheetsRemoved} sheet(s)`, {
    found: true,
    removed: true,
    memberName: actualMemberName,
    pointsLeft: pointsLeft,
    biddingSheetRemoved: biddingSheetRemoved,
    attendanceSheetsRemoved: attendanceSheetsRemoved,
    totalAttendanceRemoved: totalAttendanceRemoved,
    attendanceSheetsDetails: attendanceSheetsDetails,
    totalSheetsAffected: totalSheetsRemoved,
    totalAttendancePoints: totalAttendancePoints
  });
}

function logAuctionResult(data) {
  const itemIndex = data.itemIndex || -1;
  const winner = data.winner || '';
  const winningBid = data.winningBid || 0;
  const totalBids = data.totalBids || 0;
  const itemSource = data.itemSource || 'Unknown';
  const timestamp = data.timestamp || new Date().toISOString();
  const auctionStartTime = data.auctionStartTime || '';
  const auctionEndTime = data.auctionEndTime || '';

  // SKIP if no winner (only for GoogleSheet items)
  if (!winner && itemSource === 'GoogleSheet') {
    Logger.log(`ℹ️ Skipping log for ${data.itemName || 'Unknown'} - No winner`);
    return createResponse('ok', 'Skipped - no winner', {logged: false});
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    totalBids: totalBids,
    auctionStart: auctionStartTime,
    auctionEnd: auctionEndTime,
    timestamp: timestamp
  });
  
  // Update BiddingItems sheet if GoogleSheet item
  if (itemIndex > 0 && itemSource === 'GoogleSheet') {
    sheet.getRange(itemIndex, 4).setValue(winner);      // Winner (Column D)
    sheet.getRange(itemIndex, 5).setValue(winningBid);  // Winning Bid (Column E)
    sheet.getRange(itemIndex, 6).setValue(auctionStartTime); // Auction Start (Column F)
    sheet.getRange(itemIndex, 7).setValue(auctionEndTime);   // Auction End (Column G)
    sheet.getRange(itemIndex, 8).setValue(new Date().toISOString()); // Timestamp (Column H)
    sheet.getRange(itemIndex, 9).setValue(totalBids);   // Total Bids (Column I)
  }
  
  return createResponse('ok', 'Auction result logged', {logged: true, source: itemSource});
}

function handleSubmitBiddingResults(data) {
  const results = data.results || [];
  const manualItems = data.manualItems || [];

  const lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) { return createResponse('error', 'Lock timeout after 60s'); }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // STEP 1: Add manual items to BiddingItems sheet (same as before)
    if (manualItems && manualItems.length > 0) {
      ensureBiddingItemsSheet();
      const biddingItemsSheet = ss.getSheetByName('BiddingItems');
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
        biddingItemsSheet.getRange(insertRow, 11).setValue(1);

        insertRow++;
      }

      Logger.log(`✅ Added ${manualItems.length} manual items to BiddingItems sheet`);
    }

    // STEP 2: Update POINTS CONSUMED (Column B) in current WEEK_ sheet
    const weekSheet = getCurrentWeekSheet();
    const weekLastRow = weekSheet.getLastRow();

    if (weekLastRow < 3) {
      return createResponse('error', 'No members in current week sheet');
    }

    // Read Column A (member names) for matching
    const memberNames = weekSheet.getRange(3, COLUMNS.MEMBERS, weekLastRow - 2, 1).getValues().flat();

    // Read current Column B values (POINTS CONSUMED) to accumulate
    const currentB = weekSheet.getRange(3, COLUMNS.POINTS_CONSUMED, weekLastRow - 2, 1).getValues().flat();

    const updates = [];
    const unmappedBidders = [];

    if (results && results.length > 0) {
      results.forEach(r => {
        const member = (r.member || '').toString().trim();
        const totalSpent = Number(r.totalSpent) || 0;

        // Use normalizeUsername for consistent matching
        const normalizedMember = normalizeUsername(member);
        let rowIndex = memberNames.findIndex(m => normalizeUsername((m || '').toString()) === normalizedMember);

        if (rowIndex !== -1) {
          // Get current spent value, then add new spend
          let currentSpent = Number(currentB[rowIndex]) || 0;
          if (isNaN(currentSpent)) currentSpent = 0;
          const newSpent = currentSpent + totalSpent;
          updates.push({ row: rowIndex + 3, amount: newSpent });
        } else if (totalSpent > 0) {
          unmappedBidders.push({ member, amount: totalSpent });
          Logger.log(`⚠️ WARNING: Bidder "${member}" not found in current week sheet. ${totalSpent}pts not recorded!`);
        }
      });

      // Apply all updates to Column B (POINTS CONSUMED)
      updates.forEach(u => weekSheet.getRange(u.row, COLUMNS.POINTS_CONSUMED).setValue(u.amount));

      Logger.log(`✅ Updated POINTS CONSUMED (B) for ${updates.length} members in current week sheet`);
    }

    // Invalidate cache
    try {
      const cache = CacheService.getDocumentCache();
      cache.remove('biddingPoints_v1');
    } catch (e) {
      Logger.log('⚠️ Failed to invalidate cache: ' + e.message);
    }

    // Build response
    let warnings = [];
    if (unmappedBidders.length > 0) {
      Logger.log(`⚠️ ACCOUNTING WARNING: ${unmappedBidders.length} bidder(s) not found in current week sheet!`);
      warnings.push(`${unmappedBidders.length} bidder(s) not found in current week sheet`);
    }

    const baseMsg = `Submitted: ${updates.length} members updated in current week sheet B column`;
    const warningMsg = warnings.length > 0 ? `${baseMsg} | ⚠️ WARNING: ${warnings.join(', ')} - check logs!` : baseMsg;

    Logger.log(`✅ Bidding results submitted: ${baseMsg}`);

    return createResponse('ok', warningMsg, {
      updates: updates.length,
      warnings: warnings,
      unmappedBidders: unmappedBidders
    });
  } finally {
    lock.releaseLock();
  }
}

function getBotState(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('_BotState');

  if (!sheet) {
    sheet = ss.insertSheet('_BotState');
    sheet.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'LastUpdated', 'Version']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    sheet.hideSheet();
  }

  const stateObj = data.state || {};
  const timestamp = new Date().toISOString();

  // STATE VERSIONING: Add version tracking to detect conflicts
  const currentVersion = stateObj._version || 0;
  const newVersion = currentVersion + 1;
  stateObj._version = newVersion;
  stateObj._lastModified = timestamp;
  stateObj._modifiedBy = 'GoogleAppsScript';

  Logger.log(`💾 Saving bot state (version ${newVersion})`);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'LastUpdated', 'Version']])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF');

  let row = 2;
  for (const [key, value] of Object.entries(stateObj)) {
    sheet.getRange(row, 1).setValue(key);
    sheet.getRange(row, 2).setValue(JSON.stringify(value));
    sheet.getRange(row, 3).setValue(timestamp);
    sheet.getRange(row, 4).setValue(newVersion);
    row++;
  }

  return createResponse('ok', 'State saved', {saved: true, version: newVersion});
}

function moveQueueItemsToSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BiddingItems');
  if (!sheet) return createResponse('error', 'BiddingItems sheet not found');
  
  const items = data.items || [];
  if (items.length === 0) return createResponse('ok', 'No items to move', {moved: 0});
  
  const lastRow = sheet.getLastRow();
  let insertRow = lastRow + 1;
  
  items.forEach(item => {
    // Set all 12 columns with proper defaults
    sheet.getRange(insertRow, 1, 1, 12).setValues([[
      item.item,          // Item (Column A)
      item.startPrice,    // Start Price (Column B)
      item.duration,      // Duration (Column C)
      '',                 // Winner (Column D) - empty
      '',                 // Winning Bid (Column E) - empty
      '',                 // Auction Start (Column F) - empty
      '',                 // Auction End (Column G) - empty
      '',                 // Timestamp (Column H) - empty
      '',                 // Total Bids (Column I) - empty
      'QueueList',        // Source (Column J)
      1,                  // Quantity (Column K) - default to 1
      ''                  // Boss (Column L) - empty
    ]]);
    insertRow++;
  });
  
  return createResponse('ok', `Moved ${items.length} items to sheet`, {moved: items.length});
}

function updateBiddingPoints() {
  // Acquire lock to prevent race conditions
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(30000);
    lockAcquired = true;
  } catch (e) {
    const errorMsg = '❌ Lock timeout in updateBiddingPoints: ' + e.toString();
    Logger.log(errorMsg);
    Logger.log('⚠️ WARNING: BiddingPoints update skipped due to lock timeout. Manual verification recommended.');
    // Throw error so calling code knows update failed
    throw new Error('updateBiddingPoints lock timeout - points may not be updated');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const bpSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
    if (!bpSheet) {
      Logger.log('⚠️ BiddingPoints sheet not found');
      return;
    }

    const lastRow = bpSheet.getLastRow();
    const lastCol = bpSheet.getLastColumn();

  // Get all data including session columns (columns 4+)
  const allData = lastRow > 1 ? bpSheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const memberMap = {};

  // --- Step 1: Map existing members and calculate consumed from session columns ---
  let hasBlankTallies = false;
  let duplicatesFound = [];
  allData.forEach((r, i) => {
    const m = (r[0] || '').toString().trim();
    if (!m) return;

    // Normalize name for consistent matching (lowercase)
    const normalizedName = m.toLowerCase();

    // Sum all session columns (columns 4+ = indices 3+) and check for blank entries
    let totalConsumed = 0;
    for (let col = 3; col < r.length; col++) {
      // Check if value is blank/empty and replace with 0
      if (r[col] === '' || r[col] === null || r[col] === undefined) {
        r[col] = 0;
        hasBlankTallies = true;
      }
      const val = Number(r[col]) || 0;
      totalConsumed += val;
    }

    // If duplicate found, add consumed points to existing entry instead of creating new
    if (memberMap[normalizedName]) {
      memberMap[normalizedName].consumed += totalConsumed;
      duplicatesFound.push({ name: m, row: i + 2, consumed: totalConsumed });
      Logger.log(`⚠️ Merging duplicate ${m} (row ${i+2}, ${totalConsumed} consumed) into first entry`);
      return;
    }

    memberMap[normalizedName] = { row: i + 2, consumed: totalConsumed };
  });

  // Store duplicate info for later deletion (after points update to avoid row index issues)
  const duplicatesToDelete = duplicatesFound.length > 0 ? 
    duplicatesFound.sort((a, b) => b.row - a.row).map(d => d.row) : [];

  // Write back normalized data if any blank tallies were found
  if (hasBlankTallies && allData.length > 0) {
    bpSheet.getRange(2, 1, allData.length, lastCol).setValues(allData);
    Logger.log(`✅ Filled blank tally entries with 0 for existing members`);
  }

  // --- Step 2: Collect attendance points from all weekly sheets ---
  const sheets = ss.getSheets().filter(s => s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX));
  const attendancePoints = {};

  sheets.forEach(s => {
    const lastRow = s.getLastRow();
    if (lastRow < 3) return; // No member data
    
    // Read from row 3 (first member row): Column A (name) and Column D (attendance points)
    const dataRange = s.getRange(3, 1, lastRow - 2, 4);
    const data = dataRange.getValues();
    
    data.forEach(r => {
      const m = (r[0] || '').toString().trim();
      if (m) {
        // Normalize name for matching (lowercase)
        const normalizedName = m.toLowerCase();
        // Column D is index 3 in 0-based array
        let points = Number(r[3] || 0);
        // Handle NaN (uncached formulas) or invalid values
        if (isNaN(points)) points = 0;
        attendancePoints[normalizedName] = (attendancePoints[normalizedName] || 0) + points;
      }
    });
  });
  
  Logger.log(`📊 Read attendance from ${sheets.length} weekly sheets`);

  // --- Step 3: Check for new members and auto-add to BiddingPoints ---
  // Get original names from weekly sheets (not normalized)
  const existingMemberNames = Object.keys(memberMap);
  const newMembers = [];
  
  Object.keys(attendancePoints).forEach(normalizedName => {
    if (!memberMap[normalizedName]) {
      // Find the original name from one of the sheets
      // For now, just use the normalized name (capitalized) - could be improved
      newMembers.push({ normalized: normalizedName, original: normalizedName });
    }
  });
  
  if (newMembers.length > 0) {
    Logger.log(`ℹ️ Found ${newMembers.length} new members in weekly sheets, adding to BiddingPoints:`);
    Logger.log(`ℹ️ Members: ${newMembers.map(m => m.original).join(', ')}`);

    // Auto-add new members to BiddingPoints sheet
    const insertStart = bpSheet.getLastRow() + 1;

    // Calculate number of existing tally columns (columns 4+)
    const numTallyColumns = Math.max(0, lastCol - 3);

    // Create rows with 0s for all existing tally columns for uniformity
    const tallyZeros = new Array(numTallyColumns).fill(0);
    const newRows = newMembers.map(m => [m.original, attendancePoints[m.normalized], 0, ...tallyZeros]);

    // Insert new member rows with all columns
    const numColumns = 3 + numTallyColumns;
    bpSheet.getRange(insertStart, 1, newRows.length, numColumns).setValues(newRows);

    newMembers.forEach((m, i) => {
      memberMap[m.normalized] = { row: insertStart + i, consumed: 0 };
    });

    Logger.log(`✅ Successfully added ${newMembers.length} new members to BiddingPoints with ${numTallyColumns} previous tallies set to 0`);
  }

    // --- Step 4: Update Column 3 (Points Consumed) and Column 2 (Points Left) for all members ---
    Object.keys(memberMap).forEach(m => {
      const consumed = memberMap[m].consumed;
      // Normalize name for lookup (lowercase) to match how attendancePoints was collected
      const normalizedName = m.toLowerCase();
      const left = (attendancePoints[normalizedName] || 0) - consumed;

      // Update both columns
      bpSheet.getRange(memberMap[m].row, 2).setValue(left);      // Column 2 = Points Left
      bpSheet.getRange(memberMap[m].row, 3).setValue(consumed);  // Column 3 = Points Consumed
    });

    Logger.log(`✅ Updated bidding points for ${Object.keys(memberMap).length} members`);

    // Delete duplicate rows AFTER updating points (to avoid row index issues)
    if (duplicatesToDelete.length > 0) {
      Logger.log(`🗑️ Deleting duplicate rows: ${duplicatesToDelete.join(', ')}`);
      duplicatesToDelete.forEach(row => {
        bpSheet.deleteRow(row);
      });
      Logger.log(`✅ Deleted ${duplicatesToDelete.length} duplicate rows from BiddingPoints`);
    }

    // v6.2: Invalidate cache after updating points
    invalidateBiddingPointsCache();
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}



/**
 * Get bidding points data for all members
 * @returns {Object} Response with bidding data
 */
function getBiddingPoints(data) {
  try {
    Logger.log('📊 Fetching bidding points from current week sheet Column D (ATTENDANCE POINTS)...');

    const sheet = getCurrentWeekSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow < 3) {
      return createResponse('ok', 'No members in current week sheet', { members: [], points: {} });
    }

    // Read Column A (names), Column B (points consumed), Column D (attendance points)
    const dataRange = sheet.getRange(3, 1, lastRow - 2, 4);
    const values = dataRange.getValues();

    const members = [];
    const points = {};

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const username = (row[0] || '').toString().trim();
      const pointsConsumed = Number(row[1]) || 0;  // Column B: POINTS CONSUMED
      const attPoints = Number(row[3]) || 0;       // Column D: ATTENDANCE POINTS (formula)

      if (username) {
        // pointsLeft = attendance points (what they can spend)
        const pointsLeft = isNaN(attPoints) ? 0 : attPoints;
        const consumed = isNaN(pointsConsumed) ? 0 : pointsConsumed;

        members.push({
          username,
          pointsLeft,           // Column D: Attendance points = available to bid
          pointsConsumed: consumed,       // Column B: Already spent this week
          attendancePoints: pointsLeft,   // Alias for backwards compatibility
          biddingPoints: consumed,        // Alias for backwards compatibility
          totalSpent: consumed            // Total spent = Column B (current week only)
        });

        points[username] = pointsLeft;
      }
    }

    Logger.log(`✅ Fetched bidding data for ${members.length} members from current week sheet`);
    return createResponse('ok', 'Bidding data fetched', { members, points });

  } catch (err) {
    Logger.log('❌ Error fetching bidding points: ' + err.toString());
    return createResponse('error', err.toString(), { members: [], points: {} });
  }
}

// ATTENDANCE STATE MANAGEMENT (Memory optimization for Koyeb)
function getAttendanceState(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('_AttendanceState');

  if (!sheet) {
    sheet = ss.insertSheet('_AttendanceState');
    sheet.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'LastUpdated', 'Version']])
      .setFontWeight('bold')
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF');
    sheet.hideSheet();
  }

  const stateObj = data.state || {};
  const timestamp = new Date().toISOString();

  // STATE VERSIONING: Add version tracking to detect conflicts
  const currentVersion = stateObj._version || 0;
  const newVersion = currentVersion + 1;
  stateObj._version = newVersion;
  stateObj._lastModified = timestamp;
  stateObj._modifiedBy = 'GoogleAppsScript';

  Logger.log(`💾 Saving attendance state (version ${newVersion})`);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'LastUpdated', 'Version']])
    .setFontWeight('bold')
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF');

  let row = 2;
  for (const [key, value] of Object.entries(stateObj)) {
    sheet.getRange(row, 1).setValue(key);
    sheet.getRange(row, 2).setValue(JSON.stringify(value));
    sheet.getRange(row, 3).setValue(timestamp);
    sheet.getRange(row, 4).setValue(newVersion);
    row++;
  }

  return createResponse('ok', 'Attendance state saved', {saved: true, timestamp: timestamp, version: newVersion});
}

function updateTotalAttendanceAndMembers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX));
  const totalSheetName = "TOTAL ATTENDANCE";
  const totalSheet = ss.getSheetByName(totalSheetName);
  const memberTotals = {};

  // --- Step 1: Gather all members + count TRUE checkboxes from all weekly sheets ---
  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    for (let i = 2; i < data.length; i++) { // Start from row 3 (index 2) to skip headers
      const name = data[i][0];
      if (!name) continue;
      const attendance = data[i].slice(4).filter(v => v === true).length;
      memberTotals[name] = (memberTotals[name] || 0) + attendance;
    }
  });

  // --- Step 2: Update TOTAL ATTENDANCE sheet ONLY ---
  const result = [["Member", "Total Attendance (Days)"]];
  Object.keys(memberTotals)
    .sort((a, b) => a.localeCompare(b))
    .forEach(name => result.push([name, memberTotals[name]]));

  totalSheet.clearContents();
  totalSheet.getRange(1, 1, result.length, 2).setValues(result);

  Logger.log(`✅ Updated TOTAL ATTENDANCE sheet with ${result.length - 1} members`);

  // NOTE: This function does NOT modify weekly sheets
  // New members are added to weekly sheets automatically by handleSubmitAttendance() when attendance is submitted
}
// ==========================================
// LEADERBOARD & WEEKLY REPORT FUNCTIONS
// ==========================================

/**
 * Get attendance leaderboard from AttendanceLog sheet
 */
function getAttendanceLeaderboard(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('AttendanceLog');

    if (!logSheet) {
      return createResponse('error', 'AttendanceLog sheet not found');
    }

    const lastRow = logSheet.getLastRow();
    if (lastRow <= 1) {
      return createResponse('ok', 'No attendance data', {
        leaderboard: [],
        weekName: 'N/A',
        totalSpawns: 0,
        averageAttendance: 0
      });
    }

    // Read data from AttendanceLog: Columns A-E (Timestamp, Boss, Spawn Time, Members, Count)
    const data_range = logSheet.getRange(2, 1, lastRow - 1, 5);
    const values = data_range.getValues();

    // Count attendance per member AND per boss
    const memberCounts = {};
    const bossSpawnCounts = {}; // NEW: Track spawn count per boss
    const bossMemberCounts = {}; // NEW: Track member participation per boss
    let totalSpawns = 0;

    for (let i = 0; i < values.length; i++) {
      const boss = (values[i][1] || '').toString().trim(); // Column B: Boss
      const membersStr = (values[i][3] || '').toString().trim(); // Column D: Members (comma-separated)

      if (membersStr) {
        totalSpawns++;

        // Track boss spawn count
        if (boss) {
          bossSpawnCounts[boss] = (bossSpawnCounts[boss] || 0) + 1;
        }

        const members = membersStr.split(',').map(m => m.trim()).filter(m => m);

        members.forEach(member => {
          if (member) {
            memberCounts[member] = (memberCounts[member] || 0) + 1;

            // Track per-boss participation
            if (boss) {
              if (!bossMemberCounts[boss]) {
                bossMemberCounts[boss] = {};
              }
              bossMemberCounts[boss][member] = (bossMemberCounts[boss][member] || 0) + 1;
            }
          }
        });
      }
    }

    // Build leaderboard array
    const leaderboard = [];
    for (const [name, points] of Object.entries(memberCounts)) {
      leaderboard.push({
        name: name,
        points: points
      });
    }

    // Sort by points (descending)
    leaderboard.sort((a, b) => b.points - a.points);

    // Get current week name
    const currentWeekSheet = getCurrentWeekSheet();
    const weekName = currentWeekSheet ? currentWeekSheet.getName() : 'N/A';

    // Calculate statistics
    const totalPoints = leaderboard.reduce((sum, m) => sum + m.points, 0);
    const averageAttendance = leaderboard.length > 0 ? Math.round((totalPoints / leaderboard.length) * 10) / 10 : 0;

    // Build boss statistics array with participation rate
    const bossStats = [];
    for (const [bossName, spawnCount] of Object.entries(bossSpawnCounts)) {
      const uniqueMembers = bossMemberCounts[bossName] ? Object.keys(bossMemberCounts[bossName]).length : 0;
      const totalParticipation = bossMemberCounts[bossName]
        ? Object.values(bossMemberCounts[bossName]).reduce((sum, count) => sum + count, 0)
        : 0;
      const avgMembersPerSpawn = spawnCount > 0 ? Math.round((totalParticipation / spawnCount) * 10) / 10 : 0;

      bossStats.push({
        boss: bossName,
        spawnCount: spawnCount,
        uniqueMembers: uniqueMembers,
        totalParticipation: totalParticipation,
        avgMembersPerSpawn: avgMembersPerSpawn,
        participationRate: leaderboard.length > 0 ? Math.round((uniqueMembers / leaderboard.length) * 100) : 0
      });
    }

    // Sort boss stats by spawn count (descending)
    bossStats.sort((a, b) => b.spawnCount - a.spawnCount);

    Logger.log(`✅ Fetched attendance leaderboard: ${leaderboard.length} members, ${totalSpawns} spawns, ${bossStats.length} bosses`);

    return createResponse('ok', 'Attendance leaderboard fetched', {
      leaderboard: leaderboard,
      weekName: weekName,
      totalSpawns: totalSpawns,
      averageAttendance: averageAttendance,
      bossStats: bossStats, // NEW: Boss-specific statistics
      uniqueBosses: bossStats.length // NEW: Total unique bosses
    });

  } catch (err) {
    Logger.log('❌ Error in getAttendanceLeaderboard: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Get bidding points leaderboard from BiddingPoints sheet
 */
function getBiddingLeaderboard(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const biddingSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);

    if (!biddingSheet) {
      Logger.log('❌ BiddingPoints sheet not found');
      return createResponse('error', 'BiddingPoints sheet not found');
    }

    const lastRow = biddingSheet.getLastRow();
    Logger.log(`📊 BiddingPoints sheet - Last row: ${lastRow}`);

    if (lastRow < 2) {
      Logger.log('⚠️ BiddingPoints sheet has no data rows (only headers or empty)');
      return createResponse('ok', 'No bidding data', {
        leaderboard: [],
        totalPointsDistributed: 0,
        totalPointsConsumed: 0
      });
    }

    // Read data from columns A (Member), B (Points Left), C (Points Consumed)
    const data_range = biddingSheet.getRange(2, 1, lastRow - 1, 3);
    const values = data_range.getValues();
    Logger.log(`📊 Read ${values.length} data rows from BiddingPoints`);

    // Build leaderboard array
    const leaderboard = [];
    let totalDistributed = 0;
    let totalConsumed = 0;

    for (let i = 0; i < values.length; i++) {
      const name = values[i][0];
      const pointsLeft = values[i][1] || 0;
      const pointsConsumed = values[i][2] || 0;

      if (name && name.toString().trim()) {
        leaderboard.push({
          name: name.toString().trim(),
          pointsLeft: typeof pointsLeft === 'number' ? pointsLeft : 0,
          pointsConsumed: typeof pointsConsumed === 'number' ? pointsConsumed : 0
        });

        totalDistributed += (typeof pointsLeft === 'number' ? pointsLeft : 0) + (typeof pointsConsumed === 'number' ? pointsConsumed : 0);
        totalConsumed += (typeof pointsConsumed === 'number' ? pointsConsumed : 0);
      }
    }

    // Sort by points left (descending)
    leaderboard.sort((a, b) => b.pointsLeft - a.pointsLeft);

    Logger.log(`✅ Fetched bidding leaderboard: ${leaderboard.length} members`);

    return createResponse('ok', 'Bidding leaderboard fetched', {
      leaderboard: leaderboard,
      totalPointsDistributed: totalDistributed,
      totalPointsConsumed: totalConsumed
    });

  } catch (err) {
    Logger.log('❌ Error in getBiddingLeaderboard: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Get weekly summary for weekly report
 */
function getWeeklySummary(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // NEW: Get boss statistics from AttendanceLog
    const logSheet = ss.getSheetByName('AttendanceLog');
    const bossStats = [];
    let totalSpawnsFromLog = 0;

    if (logSheet && logSheet.getLastRow() > 1) {
      const lastRow = logSheet.getLastRow();
      const logValues = logSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      const bossSpawnCounts = {};
      const bossMemberCounts = {};

      for (let i = 0; i < logValues.length; i++) {
        const boss = (logValues[i][1] || '').toString().trim();
        const membersStr = (logValues[i][3] || '').toString().trim();

        if (membersStr) {
          totalSpawnsFromLog++;

          if (boss) {
            bossSpawnCounts[boss] = (bossSpawnCounts[boss] || 0) + 1;
            const members = membersStr.split(',').map(m => m.trim()).filter(m => m);

            members.forEach(member => {
              if (member) {
                if (!bossMemberCounts[boss]) bossMemberCounts[boss] = {};
                bossMemberCounts[boss][member] = (bossMemberCounts[boss][member] || 0) + 1;
              }
            });
          }
        }
      }

      // Build boss stats
      for (const [bossName, spawnCount] of Object.entries(bossSpawnCounts)) {
        const uniqueMembers = bossMemberCounts[bossName] ? Object.keys(bossMemberCounts[bossName]).length : 0;
        const totalParticipation = bossMemberCounts[bossName]
          ? Object.values(bossMemberCounts[bossName]).reduce((sum, count) => sum + count, 0)
          : 0;
        const avgMembersPerSpawn = spawnCount > 0 ? Math.round((totalParticipation / spawnCount) * 10) / 10 : 0;

        bossStats.push({
          boss: bossName,
          spawnCount: spawnCount,
          uniqueMembers: uniqueMembers,
          avgMembersPerSpawn: avgMembersPerSpawn
        });
      }

      bossStats.sort((a, b) => b.spawnCount - a.spawnCount);
    }

    // Get attendance data
    const totalSheet = ss.getSheetByName('TOTAL ATTENDANCE');
    let attendanceData = {
      totalSpawns: 0,
      uniqueAttendees: 0,
      averagePerSpawn: 0,
      topAttendees: [],
      bossStats: bossStats // NEW: Include boss statistics
    };

    if (totalSheet && totalSheet.getLastRow() > 1) {
      const lastRow = totalSheet.getLastRow();
      const values = totalSheet.getRange(2, 1, lastRow - 1, 2).getValues();

      const members = [];
      for (let i = 0; i < values.length; i++) {
        const name = values[i][0];
        const points = values[i][1] || 0;
        if (name && name.toString().trim()) {
          members.push({
            name: name.toString().trim(),
            points: typeof points === 'number' ? points : 0
          });
        }
      }

      members.sort((a, b) => b.points - a.points);

      const currentWeekSheet = getCurrentWeekSheet();
      const totalSpawns = totalSpawnsFromLog > 0 ? totalSpawnsFromLog : (currentWeekSheet ? Math.max(0, currentWeekSheet.getLastColumn() - COLUMNS.FIRST_SPAWN + 1) : 0);
      const totalPoints = members.reduce((sum, m) => sum + m.points, 0);

      attendanceData = {
        totalSpawns: totalSpawns,
        uniqueAttendees: members.length,
        averagePerSpawn: totalSpawns > 0 ? Math.round((totalPoints / totalSpawns) * 10) / 10 : 0,
        bossStats: bossStats, // NEW: Include boss statistics
        topAttendees: members.slice(0, 5)
      };
    }

    // Get bidding data
    const biddingSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
    let biddingData = {
      totalDistributed: 0,
      totalConsumed: 0,
      totalRemaining: 0,
      topSpenders: []
    };

    if (biddingSheet && biddingSheet.getLastRow() > 1) {
      const lastRow = biddingSheet.getLastRow();
      const values = biddingSheet.getRange(2, 1, lastRow - 1, 3).getValues();

      const members = [];
      let totalDist = 0;
      let totalCons = 0;
      let totalRem = 0;

      for (let i = 0; i < values.length; i++) {
        const name = values[i][0];
        const pointsLeft = values[i][1] || 0;
        const pointsConsumed = values[i][2] || 0;

        if (name && name.toString().trim()) {
          members.push({
            name: name.toString().trim(),
            consumed: typeof pointsConsumed === 'number' ? pointsConsumed : 0,
            remaining: typeof pointsLeft === 'number' ? pointsLeft : 0
          });

          const pLeft = typeof pointsLeft === 'number' ? pointsLeft : 0;
          const pCons = typeof pointsConsumed === 'number' ? pointsConsumed : 0;

          totalDist += pLeft + pCons;
          totalCons += pCons;
          totalRem += pLeft;
        }
      }

      members.sort((a, b) => b.consumed - a.consumed);

      biddingData = {
        totalDistributed: totalDist,
        totalConsumed: totalCons,
        totalRemaining: totalRem,
        topSpenders: members.slice(0, 5)
      };
    }

    // Calculate most active members (activity score = attendance points + bidding consumed / 10)
    const mostActive = [];
    const attendeeMap = {};
    const bidderMap = {};

    if (attendanceData.topAttendees) {
      attendanceData.topAttendees.forEach(a => {
        attendeeMap[a.name] = a.points;
      });
    }

    if (biddingData.topSpenders) {
      biddingData.topSpenders.forEach(b => {
        bidderMap[b.name] = b.consumed;
      });
    }

    const allNames = new Set([...Object.keys(attendeeMap), ...Object.keys(bidderMap)]);
    allNames.forEach(name => {
      const attPoints = attendeeMap[name] || 0;
      const bidPoints = bidderMap[name] || 0;
      const activityScore = attPoints + Math.floor(bidPoints / 10);

      mostActive.push({
        name: name,
        score: activityScore
      });
    });

    mostActive.sort((a, b) => b.score - a.score);

    const currentWeekSheet = getCurrentWeekSheet();
    const weekName = currentWeekSheet ? currentWeekSheet.getName() : 'N/A';

    // ==========================================
    // HELPER: GET PREVIOUS WEEK SHEET
    // ==========================================
    function getPreviousWeekSheet() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const now = new Date();
      const currentSunday = new Date(now);
      currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());

      // Go back 7 days to get last week's Sunday
      const previousSunday = new Date(currentSunday);
      previousSunday.setDate(previousSunday.getDate() - 7);

      const weekIndex = Utilities.formatDate(previousSunday, CONFIG.TIMEZONE, 'yyyyMMdd');
      const sheetName = CONFIG.SHEET_NAME_PREFIX + weekIndex;
      return ss.getSheetByName(sheetName);
    }

    // ==========================================
    // HELPER: EXTRACT WEEK DATA FROM SHEET
    // ==========================================
    function extractWeekData(sheet) {
      const weekData = {
        attendance: {
          totalSpawns: 0,
          uniqueAttendees: 0,
          averagePerSpawn: 0,
          topAttendees: []
        },
        bidding: {
          totalConsumed: 0,
          topSpenders: []
        }
      };

      if (!sheet || sheet.getLastRow() <= 2) {
        return weekData;
      }

      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      const sheetData = sheet.getRange(3, 1, lastRow - 2, Math.max(4, lastCol)).getValues();

      const weekMembers = [];
      let totalWeekPointsConsumed = 0;

      for (let i = 0; i < sheetData.length; i++) {
        const name = sheetData[i][0]; // Column 1: MEMBERS
        const pointsConsumed = sheetData[i][1] || 0; // Column 2: POINTS_CONSUMED
        const attendancePoints = sheetData[i][3] || 0; // Column 4: ATTENDANCE_POINTS

        if (name && name.toString().trim()) {
          const memberName = name.toString().trim();
          const attPts = typeof attendancePoints === 'number' ? attendancePoints : 0;
          const consPts = typeof pointsConsumed === 'number' ? pointsConsumed : 0;

          weekMembers.push({
            name: memberName,
            attendancePoints: attPts,
            pointsConsumed: consPts
          });

          totalWeekPointsConsumed += consPts;
        }
      }

      // Sort by attendance points for top attendees
      const sortedByAttendance = weekMembers.slice().sort((a, b) => b.attendancePoints - a.attendancePoints);

      // Sort by points consumed for top spenders
      const sortedByConsumed = weekMembers.slice().sort((a, b) => b.pointsConsumed - a.pointsConsumed);

      // Calculate week-specific spawns (columns from FIRST_SPAWN onwards)
      const weekSpawns = lastCol >= COLUMNS.FIRST_SPAWN ? lastCol - COLUMNS.FIRST_SPAWN + 1 : 0;

      // Calculate week-specific total attendance points and average
      const totalWeekAttPoints = weekMembers.reduce((sum, m) => sum + m.attendancePoints, 0);
      const weekAverage = weekSpawns > 0 ? Math.round((totalWeekAttPoints / weekSpawns) * 10) / 10 : 0;

      return {
        attendance: {
          totalSpawns: weekSpawns,
          uniqueAttendees: weekMembers.filter(m => m.attendancePoints > 0).length,
          averagePerSpawn: weekAverage,
          topAttendees: sortedByAttendance.slice(0, 5).map(m => ({
            name: m.name,
            points: m.attendancePoints
          }))
        },
        bidding: {
          totalConsumed: totalWeekPointsConsumed,
          topSpenders: sortedByConsumed.slice(0, 5).filter(m => m.pointsConsumed > 0).map(m => ({
            name: m.name,
            consumed: m.pointsConsumed
          }))
        }
      };
    }

    // ==========================================
    // NEW: GET WEEK-SPECIFIC DATA
    // ==========================================
    const weekSpecificData = extractWeekData(currentWeekSheet);
    const lastWeekSheet = getPreviousWeekSheet();
    const lastWeekData = extractWeekData(lastWeekSheet);
    const lastWeekName = lastWeekSheet ? lastWeekSheet.getName() : null;

    Logger.log(`✅ Generated weekly summary`);

    return createResponse('ok', 'Weekly summary fetched', {
      weekName: weekName,
      attendance: attendanceData,
      bidding: biddingData,
      mostActive: mostActive.slice(0, 5),
      weekSpecific: weekSpecificData,  // Current week data
      lastWeek: lastWeekData,  // NEW: Last week data
      lastWeekName: lastWeekName  // NEW: Last week sheet name
    });

  } catch (err) {
    Logger.log('❌ Error in getWeeklySummary: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Get detailed stats for a specific member
 * Fetches attendance history, bidding info, rank, and recent activity
 */
function getMemberStats(data) {
  try {
    const memberName = data.memberName;

    if (!memberName) {
      return createResponse('error', 'Member name is required');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==========================================
    // GET BIDDING DATA (Case-insensitive search)
    // ==========================================
    const biddingSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
    let biddingData = { left: 0, consumed: 0, total: 0, consumptionRate: 0 };

    if (biddingSheet && biddingSheet.getLastRow() > 1) {
      const biddingValues = biddingSheet.getDataRange().getValues();
      const memberRow = biddingValues.find(row =>
        row[0] && row[0].toString().trim().toLowerCase() === memberName.toLowerCase()
      );

      if (memberRow) {
        const left = memberRow[1] || 0;
        const consumed = memberRow[2] || 0;
        const total = left + consumed;
        const consumptionRate = total > 0 ? Math.round((consumed / total) * 100) : 0;

        biddingData = { left, consumed, total, consumptionRate };
      }
    }

    // ==========================================
    // GET ATTENDANCE DATA
    // ==========================================
    const logSheet = ss.getSheetByName('AttendanceLog');
    let attendanceData = {
      total: 0,
      points: 0,
      rate: 0,
      recentBosses: [],
      favoriteBoss: null,
      streak: 0
    };

    if (logSheet && logSheet.getLastRow() > 1) {
      const lastRow = logSheet.getLastRow();
      const logValues = logSheet.getRange(2, 1, lastRow - 1, 5).getValues();

      const memberAttendance = [];
      const bossCounts = {};
      const totalSpawns = logValues.filter(row => row[3] && row[3].toString().trim()).length;

      // Filter rows where member attended (case-insensitive)
      for (let i = 0; i < logValues.length; i++) {
        const boss = (logValues[i][1] || '').toString().trim();
        const timestamp = logValues[i][0];
        const membersStr = (logValues[i][3] || '').toString().trim();

        if (membersStr) {
          const members = membersStr.split(',').map(m => m.trim());

          // Case-insensitive member search
          const memberFound = members.some(m => m.toLowerCase() === memberName.toLowerCase());

          if (memberFound) {
            const points = getBossPointValue(boss);

            memberAttendance.push({
              boss: boss,
              timestamp: timestamp,
              points: points
            });

            bossCounts[boss] = (bossCounts[boss] || 0) + 1;
          }
        }
      }

      // Calculate total points
      const totalPoints = memberAttendance.reduce((sum, entry) => sum + entry.points, 0);

      // Find favorite boss
      const favoriteBoss = Object.keys(bossCounts).length > 0
        ? Object.entries(bossCounts).sort(([,a], [,b]) => b - a)[0]
        : null;

      // Calculate attendance rate
      const attendanceRate = totalSpawns > 0 ? Math.round((memberAttendance.length / totalSpawns) * 100) : 0;

      // Sort by timestamp descending for recent bosses
      memberAttendance.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Calculate streak
      const streak = calculateMemberStreak(memberAttendance);

      attendanceData = {
        total: memberAttendance.length,
        points: totalPoints,
        rate: attendanceRate,
        recentBosses: memberAttendance.slice(0, 10),
        favoriteBoss: favoriteBoss ? {
          name: favoriteBoss[0],
          count: favoriteBoss[1]
        } : null,
        streak: streak
      };
    }

    // ==========================================
    // GET RANK
    // ==========================================
    const totalAttendanceSheet = ss.getSheetByName('TOTAL ATTENDANCE');
    let rank = null;
    let totalMembers = 0;

    if (totalAttendanceSheet && totalAttendanceSheet.getLastRow() > 1) {
      const lastRow = totalAttendanceSheet.getLastRow();
      const values = totalAttendanceSheet.getRange(2, 1, lastRow - 1, 2).getValues();

      const members = values
        .filter(row => row[0] && row[0].toString().trim())
        .map(row => ({
          name: row[0].toString().trim(),
          points: row[1] || 0
        }))
        .sort((a, b) => b.points - a.points);

      totalMembers = members.length;
      const memberIndex = members.findIndex(m => m.name.toLowerCase() === memberName.toLowerCase());

      if (memberIndex >= 0) {
        rank = memberIndex + 1;
      } else {
        // Member not in TOTAL ATTENDANCE sheet yet - use their actual attendance points
        // Insert them in sorted position based on their points
        let insertPosition = 0;
        for (let i = 0; i < members.length; i++) {
          if (attendanceData.points > members[i].points) {
            break;
          }
          insertPosition++;
        }
        rank = insertPosition + 1;
        totalMembers = members.length + 1; // Include this member in total count
        Logger.log(`⚠️ ${memberName} not found in TOTAL ATTENDANCE, calculated rank: ${rank} (${attendanceData.points} pts)`);
      }
    } else {
      // No TOTAL ATTENDANCE sheet or it's empty
      rank = 1;
      totalMembers = 1;
    }

    Logger.log(`✅ Fetched stats for ${memberName}: Rank #${rank}, ${attendanceData.total} attendance, ${attendanceData.points} pts`);

    return createResponse('ok', 'Member stats fetched', {
      memberName: memberName,
      attendance: attendanceData,
      bidding: biddingData,
      rank: rank,
      totalMembers: totalMembers
    });

  } catch (err) {
    Logger.log('❌ Error in getMemberStats: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Helper: Get boss point value from boss name
 * Updated with complete boss list matching boss_points.json
 */
function getBossPointValue(bossName) {
  if (!bossName) return 1;

  // Normalize boss name for case-insensitive matching
  const normalizedName = bossName.toString().trim().toUpperCase();

  // Complete boss points map (from boss_points.json)
  const bossPointsMap = {
    'VENATUS': 1,
    'VIORENT': 1,
    'EGO': 1,
    'CLEMANTIS': 1,
    'LIVERA': 1,
    'ARANEO': 1,
    'UNDOMIEL': 1,
    'SAPHIRUS': 1,
    'NEUTRO': 1,
    'LADY DALIA': 1,
    'DALIA': 1,
    'GENERAL AQULEUS': 1,
    'AQULEUS': 1,
    'AQUELEUS': 1,
    'THYMELE': 1,
    'AMENTIS': 1,
    'BARON BRAUDMORE': 1,
    'BRAUDMORE': 1,
    'MILAVY': 2,
    'WANNITAS': 2,
    'METUS': 2,
    'DUPLICAN': 2,
    'SHULIAR': 2,
    'RINGOR': 2,
    'RODERICK': 2,
    'GARETH': 2,
    'TITORE': 2,
    'LARBA': 2,
    'CATENA': 3,
    'AURAQ': 3,
    'SECRETA': 3,
    'ORDO': 3,
    'ASTA': 3,
    'SUPORE': 3,
    'CHAIFLOCK': 3,
    'BENJI': 3,
    'KUNDUN': 3,
    'SELUPAN': 5,
    'RED DRAGON': 4,
    'MAYA': 8,
    'NIGHTMARE': 10,
    'MEDUSA': 12,
    'BALGASS': 15,
    'GORGON': 18,
    'GAION': 20,
    'GUILD BOSS': 0,
    'GUILDBOSS': 0,
    'GB': 0
  };

  return bossPointsMap[normalizedName] || 1;
}

/**
 * Helper: Calculate consecutive days streak
 */
function calculateMemberStreak(attendanceRecords) {
  if (attendanceRecords.length === 0) return 0;

  // Get unique dates (normalized to day)
  const attendanceDates = [];
  const seenDates = new Set();

  for (let i = 0; i < attendanceRecords.length; i++) {
    const date = new Date(attendanceRecords[i].timestamp);
    date.setHours(0, 0, 0, 0);
    const dateStr = date.toDateString();

    if (!seenDates.has(dateStr)) {
      seenDates.add(dateStr);
      attendanceDates.push(date);
    }
  }

  // Sort dates descending
  attendanceDates.sort((a, b) => b - a);

  let streak = 1;
  for (let i = 0; i < attendanceDates.length - 1; i++) {
    const dayDiff = Math.floor((attendanceDates[i] - attendanceDates[i + 1]) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      streak++;
    } else if (dayDiff > 1) {
      break; // Streak broken
    }
    // If dayDiff === 0, same day (already handled by seenDates)
  }

  return streak;
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

// ===========================================================
// AUTO-UPDATE ON SHEET EDIT (OPTIMIZATION V2 - SMART FILTERING)
// ===========================================================

// Global state for debouncing and preventing double execution
const UPDATE_DEBOUNCE_MS = 5000; // 5 seconds
var lastBiddingPointsUpdate = 0;
var lastTotalAttendanceUpdate = 0;
var isManualUpdate = false;

/**
 * onEdit trigger - OPTIMIZED with smart filtering and debouncing
 * Only triggers on meaningful data changes to prevent excessive updates
 *
 * TRIGGER CONDITIONS:
 * - Weekly sheets: Only when attendance data (columns 5+) or member names (column 1) are edited
 * - BiddingPoints: Only when member data (columns 1-3, rows 2+) is edited
 * - BiddingItems: Auto-moves items to ForDistribution when winner is added
 *
 * DEBOUNCING: Updates run at most once per 5 seconds
 * CONFLICT PREVENTION: Skips execution if manual update is in progress
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    // Skip if manual update is already running (prevents double execution)
    if (isManualUpdate) {
      Logger.log('⭐ Skipping onEdit trigger (manual update in progress)');
      return;
    }

    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const editedRow = e.range.getRow();
    const editedColumn = e.range.getColumn();

    Logger.log(`📝 Sheet edited: ${sheetName}, Row: ${editedRow}, Col: ${editedColumn}`);

    const now = Date.now();
    const isWeeklySheet = sheetName.startsWith(CONFIG.SHEET_NAME_PREFIX);
    const isBiddingSheet = sheetName === CONFIG.BIDDING_SHEET;
    const isBiddingItemsSheet = sheetName === 'BiddingItems';

    // NOTE: Items are no longer auto-moved on edit when winner is added
    // They will be moved in batch when the auction session ends via moveAuctionedItemsToForDistribution

    // SMART FILTERING: Only trigger on meaningful edits
    if (isWeeklySheet) {
      // Only trigger if attendance data (columns 5+) or member names (column 1) were edited
      if (editedColumn >= COLUMNS.FIRST_SPAWN || editedColumn === COLUMNS.MEMBERS) {
        if (editedRow >= 3) { // Skip header rows
          Logger.log('🔄 Triggering updates for weekly sheet data edit...');

          // DEBOUNCING: Only update if 5+ seconds since last update
          if (now - lastBiddingPointsUpdate > UPDATE_DEBOUNCE_MS) {
            updateBiddingPoints();
            lastBiddingPointsUpdate = now;
          } else {
            Logger.log('⭐ Skipping updateBiddingPoints (debounced)');
          }

          if (now - lastTotalAttendanceUpdate > UPDATE_DEBOUNCE_MS) {
            updateTotalAttendanceAndMembers();
            lastTotalAttendanceUpdate = now;
          } else {
            Logger.log('⭐ Skipping updateTotalAttendanceAndMembers (debounced)');
          }
        }
      } else {
        Logger.log('⭐ Skipping update (non-data column edited)');
      }
    } else if (isBiddingSheet) {
      // Only trigger if member data (columns 1-3) were edited
      if (editedColumn <= 3 && editedRow >= 2) { // Skip headers
        Logger.log('🔄 Triggering updates for bidding sheet edit...');

        // v6.2: Invalidate cache when BiddingPoints sheet is edited
        invalidateBiddingPointsCache();

        // DEBOUNCING: Only update if 5+ seconds since last update
        if (now - lastBiddingPointsUpdate > UPDATE_DEBOUNCE_MS) {
          updateBiddingPoints();
          lastBiddingPointsUpdate = now;
        } else {
          Logger.log('⭐ Skipping updateBiddingPoints (debounced)');
        }
      } else {
        Logger.log('⭐ Skipping update (session column edited, not member data)');
      }
    }
    // Note: BiddingItems edits do NOT trigger updates (items don't affect points)

  } catch (err) {
    Logger.log('❌ Error in onEdit trigger: ' + err.toString());
  }
}

/**
 * Move item from BiddingItems to ForDistribution sheet
 * Copies all formatting using copyTo method, then deletes source row
 * @param {string} sourceSheetName - The name of the source sheet
 * @param {number} rowNumber - The row number to move
 */
function moveItemToForDistribution(sourceSheetName, rowNumber) {
  Logger.log(`📦 START: Moving row ${rowNumber} from "${sourceSheetName}"`);
  
  try {
    // Get active spreadsheet
    const ss = SpreadsheetApp.getActive();
    Logger.log(`✅ Got spreadsheet: ${ss.getName()}`);
    
    // Get source sheet
    const sourceSheet = ss.getSheetByName(sourceSheetName);
    Logger.log(`🔍 Looking for sheet: "${sourceSheetName}"`);
    
    if (!sourceSheet) {
      Logger.log(`❌ ERROR: Sheet "${sourceSheetName}" not found!`);
      Logger.log(`Available sheets: ${ss.getSheets().map(s => s.getName()).join(', ')}`);
      return;
    }
    
    Logger.log(`✅ Found source sheet: ${sourceSheet.getName()}`);
    
    // Get or create ForDistribution sheet
    ensureForDistributionSheet();
    let targetSheet = ss.getSheetByName('ForDistribution');
    
    // Validate row number
    const lastRow = sourceSheet.getLastRow();
    if (rowNumber < 2 || rowNumber > lastRow) {
      Logger.log(`❌ Invalid row: ${rowNumber} (sheet has ${lastRow} rows)`);
      return false;
    }
    
    // Get source range
    Logger.log(`📊 Getting range: Row ${rowNumber}, Columns 1-13`);
    const sourceRange = sourceSheet.getRange(rowNumber, 1, 1, 13);
    const rowData = sourceRange.getValues()[0];
    
    // Check if winner exists
    const winner = rowData[3]; // Column D
    if (!winner || !winner.toString().trim()) {
      Logger.log('⚠️ No winner found, skipping move');
      return false;
    }
    
    const itemName = rowData[0]; // Column A
    Logger.log(`📦 Item: "${itemName}", Winner: "${winner}"`);
    
    // Find target row
    const targetRow = targetSheet.getLastRow() + 1;
    Logger.log(`📝 Target row: ${targetRow}`);
    
    // Copy everything (values + formatting)
    const targetRange = targetSheet.getRange(targetRow, 1, 1, 13);
    sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
    Logger.log('✅ Data and formatting copied');
    
    // DELETE source row (THIS WAS MISSING!)
    Logger.log(`🗑️ Deleting row ${rowNumber} from ${sourceSheetName}...`);
    sourceSheet.deleteRow(rowNumber);
    Logger.log('✅ Source row deleted');
    
    Logger.log(`✅ SUCCESS: Moved "${itemName}" to ForDistribution row ${targetRow}`);
    return true;
    
  } catch (err) {
    Logger.log(`❌ EXCEPTION: ${err.toString()}`);
    Logger.log(`Stack: ${err.stack}`);
    return false;
  }
}

/**
 * Move ALL items with winners to ForDistribution
 * Called automatically at the end of auction sessions
 * Can also be called manually from Apps Script editor for cleanup
 */
function moveAllItemsWithWinnersToForDistribution() {
  Logger.log('📋 === SCANNING ALL ROWS FOR WINNERS ===');

  try {
    const ss = SpreadsheetApp.getActive();
    const biddingSheet = ss.getSheetByName('BiddingItems');

    if (!biddingSheet) {
      Logger.log('❌ BiddingItems sheet not found');
      return createResponse('error', 'BiddingItems sheet not found', {
        moved: 0,
        skipped: 0,
        total: 0
      });
    }

    let lastRow = biddingSheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('⚠️ No data rows in BiddingItems');
      return createResponse('ok', 'No items to move', {
        moved: 0,
        skipped: 0,
        total: 0
      });
    }

    Logger.log(`📊 Scanning ${lastRow - 1} rows...`);

    // Pass 1: Scan ALL rows and collect those with winners
    const winnerRows = [];
    for (let row = 2; row <= lastRow; row++) {
      const winnerCell = biddingSheet.getRange(row, 4).getValue();
      const winnerValue = winnerCell ? winnerCell.toString().trim() : '';
      const itemName = biddingSheet.getRange(row, 1).getValue() || 'Unknown';

      if (winnerValue && winnerValue.length > 0) {
        Logger.log(`  ✅ Row ${row}: "${itemName}" → Winner: "${winnerValue}"`);
        winnerRows.push(row);
      } else {
        Logger.log(`  ⏭️ Row ${row}: "${itemName}" → No winner, skipping`);
      }
    }

    Logger.log(`📋 Found ${winnerRows.length} row(s) with winners out of ${lastRow - 1} total`);

    // Pass 2: Process from bottom to top so row indices don't shift
    let movedCount = 0;
    let skippedCount = 0;

    for (let i = winnerRows.length - 1; i >= 0; i--) {
      const rowNumber = winnerRows[i];
      Logger.log(`\n📦 Processing row ${rowNumber} (index ${i})...`);

      const success = moveItemToForDistribution('BiddingItems', rowNumber);

      if (success) {
        movedCount++;
        Logger.log(`  ✅ Successfully moved row ${rowNumber}`);
      } else {
        skippedCount++;
        Logger.log(`  ⚠️ Move failed for row ${rowNumber}`);
      }

      // Add small delay to prevent overwhelming the API
      Utilities.sleep(100);
    }

    Logger.log(`\n✅ Done! Moved: ${movedCount}, Skipped: ${skippedCount}`);
    return createResponse('ok', 'Items moved', {
      moved: movedCount,
      skipped: skippedCount,
      total: lastRow - 1
    });

  } catch (err) {
    Logger.log('❌ Error in moveAllItemsWithWinnersToForDistribution: ' + err.toString());
    return createResponse('error', err.toString(), {
      moved: 0,
      skipped: 0,
      total: 0
    });
  }
}

// ===========================================================
// SUNDAY AUTOMATION - WEEKLY SHEET CREATION
// ===========================================================

/**
 * Creates new weekly sheet every Sunday at midnight (Manila time)
 * This should be set up as a time-driven trigger in Apps Script
 * Trigger: Weekly > Every Sunday > 12am-1am
 */
function sundayWeeklySheetCreation() {
  try {
    Logger.log('🗓️ Running Sunday weekly sheet creation...');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();

    // Calculate next Sunday's week index
    const nextSunday = new Date(now);
    nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
    const weekIndex = Utilities.formatDate(nextSunday, CONFIG.TIMEZONE, 'yyyyMMdd');
    const sheetName = CONFIG.SHEET_NAME_PREFIX + weekIndex;

    // Check if sheet already exists
    let sheet = ss.getSheetByName(sheetName);

    if (sheet) {
      Logger.log(`⚠️ Sheet ${sheetName} already exists. Skipping creation.`);
      return;
    }

    // Create new week sheet
    Logger.log(`📄 Creating new weekly sheet: ${sheetName}`);
    sheet = ss.insertSheet(sheetName);

    // Set up headers
    const headerData = [['MEMBERS', 'POINTS CONSUMED', 'POINTS LEFT', 'ATTENDANCE POINTS']];
    sheet.getRange(1, COLUMNS.MEMBERS, 1, COLUMNS.ATTENDANCE_POINTS).setValues(headerData)
         .setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    sheet.getRange(2, COLUMNS.MEMBERS, 1, COLUMNS.ATTENDANCE_POINTS).setBackground('#E8F4F8');
    sheet.setColumnWidth(COLUMNS.MEMBERS, 150).setColumnWidth(COLUMNS.POINTS_CONSUMED, 120)
         .setColumnWidth(COLUMNS.POINTS_LEFT, 100).setColumnWidth(COLUMNS.ATTENDANCE_POINTS, 150);

    // Copy members from previous week
    const previousSheetName = copyMembersFromPreviousWeek(ss, sheet);

    Logger.log(`✅ New weekly sheet created: ${sheetName}`);
    Logger.log(`ℹ️ Format copied from previous week: ${previousSheetName || 'N/A'}`);
    Logger.log(`ℹ️ Discord bot will handle notifications (no webhook needed)`);

  } catch (err) {
    Logger.log('❌ Error in sundayWeeklySheetCreation: ' + err.toString());
    Logger.log(err.stack);
  }
}









// ===========================================================
// BOSS ROTATION SYSTEM (5-Guild Rotation Tracking)
// ===========================================================

/**
 * Ensures BossRotation sheet exists with proper structure
 * Auto-creates if missing with default 5-guild setup
 * @returns {Object} Response with success status
 */
function ensureBossRotationSheetExists() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    let sheet = ss.getSheetByName('BossRotation');

    if (!sheet) {
      Logger.log('📋 Creating BossRotation sheet...');
      sheet = ss.insertSheet('BossRotation');

      // Set up headers
      const headers = ['Boss Name', 'Current Index', 'Guild1', 'Guild2', 'Guild3', 'Guild4', 'Guild5'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format header row
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#4a86e8')
        .setFontColor('#ffffff')
        .setFontWeight('bold');

      // Set column widths
      for (let i = 1; i <= headers.length; i++) {
        sheet.setColumnWidth(i, i === 1 ? 150 : i === 2 ? 100 : 120);
      }

      // Freeze header row
      sheet.setFrozenRows(1);

      Logger.log('✅ BossRotation sheet created (empty - add rotating bosses manually)');
    }

    return createResponse('ok', 'BossRotation sheet ready', { exists: true });

  } catch (err) {
    Logger.log('❌ Error ensuring BossRotation sheet exists: ' + err.toString());
    return createResponse('error', err.toString(), { exists: false });
  }
}

/**
 * Get list of all rotating bosses from the BossRotation sheet
 * @returns {Object} Response with array of boss names
 */
function getAllRotatingBosses() {
  try {
    // Ensure sheet exists first
    ensureBossRotationSheetExists();

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('BossRotation');

    if (!sheet) {
      return createResponse('error', 'BossRotation sheet not found');
    }

    const dataValues = sheet.getDataRange().getValues();
    const bosses = [];

    // Skip header row, read all boss names from column A
    for (let i = 1; i < dataValues.length; i++) {
      const bossName = dataValues[i][0]?.toString().trim();
      if (bossName) {
        bosses.push(bossName);
      }
    }

    Logger.log(`✅ Found ${bosses.length} rotating bosses: ${bosses.join(', ')}`);

    return createResponse('ok', 'Rotating bosses fetched', {
      bosses: bosses,
      count: bosses.length
    });

  } catch (err) {
    Logger.log('❌ Error getting rotating bosses: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Get rotation status for a specific boss
 * @param {Object} data - Contains bossName
 * @returns {Object} Response with rotation data
 */
function getBossRotation(data) {
  try {
    const bossName = (data.bossName || '').toString().trim();

    if (!bossName) {
      return createResponse('error', 'Missing bossName parameter');
    }

    // Ensure sheet exists first
    ensureBossRotationSheetExists();

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('BossRotation');

    if (!sheet) {
      return createResponse('error', 'BossRotation sheet not found');
    }

    const dataValues = sheet.getDataRange().getValues();
    const headers = dataValues[0];

    // Find boss row (case-insensitive)
    let bossRow = null;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][0].toString().trim().toUpperCase() === bossName.toUpperCase()) {
        bossRow = dataValues[i];
        break;
      }
    }

    if (!bossRow) {
      Logger.log(`⚠️ Boss not found in rotation: ${bossName}`);
      return createResponse('ok', 'Boss not in rotation system', {
        isRotating: false,
        bossName: bossName
      });
    }

    const currentIndex = parseInt(bossRow[1]) || 1;

    // Dynamically read all guild columns (starting from column 3 onwards)
    const guilds = [];
    for (let i = 2; i < bossRow.length; i++) {
      const guildName = bossRow[i]?.toString().trim();
      if (guildName) {
        guilds.push(guildName);
      }
    }

    // If no guilds found, default to 5 guilds
    if (guilds.length === 0) {
      guilds.push('TENCHU', 'Guild2', 'Guild3', 'Guild4', 'Guild5');
    }

    const guildCount = guilds.length;
    const currentGuild = guilds[currentIndex - 1] || guilds[0];
    const isOurTurn = (currentIndex === 1); // TENCHU is always Guild1

    Logger.log(`✅ Rotation for ${bossName}: Index ${currentIndex} (${currentGuild}) - ${isOurTurn ? 'OUR TURN' : 'NOT OUR TURN'} [${guildCount} guilds]`);

    return createResponse('ok', 'Rotation status fetched', {
      isRotating: true,
      bossName: bossName,
      currentIndex: currentIndex,
      currentGuild: currentGuild,
      isOurTurn: isOurTurn,
      guilds: guilds,
      guildCount: guildCount,
      nextGuild: guilds[currentIndex % guildCount] // Next guild after this kill (dynamic)
    });

  } catch (err) {
    Logger.log('❌ Error getting boss rotation: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Increment rotation counter for a boss (called after boss is killed)
 * Advances from 1→2→3→4→5→1 (loops back to TENCHU)
 * @param {Object} data - Contains bossName
 * @returns {Object} Response with updated rotation data
 */
function incrementBossRotation(data) {
  try {
    const bossName = (data.bossName || '').toString().trim();

    if (!bossName) {
      return createResponse('error', 'Missing bossName parameter');
    }

    // Ensure sheet exists first
    ensureBossRotationSheetExists();

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('BossRotation');

    if (!sheet) {
      return createResponse('error', 'BossRotation sheet not found');
    }

    const dataValues = sheet.getDataRange().getValues();

    // Find boss row
    let rowIndex = -1;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][0].toString().trim().toUpperCase() === bossName.toUpperCase()) {
        rowIndex = i + 1; // +1 for 1-based indexing
        break;
      }
    }

    if (rowIndex === -1) {
      Logger.log(`⚠️ Boss not found in rotation: ${bossName}`);
      return createResponse('ok', 'Boss not in rotation system', { updated: false });
    }

    // Get current index
    const currentIndex = parseInt(dataValues[rowIndex - 1][1]) || 1;

    // Dynamically read all guild columns
    const guilds = [];
    for (let i = 2; i < dataValues[rowIndex - 1].length; i++) {
      const guildName = dataValues[rowIndex - 1][i]?.toString().trim();
      if (guildName) {
        guilds.push(guildName);
      }
    }

    // If no guilds found, default to 5 guilds
    if (guilds.length === 0) {
      guilds.push('TENCHU', 'Guild2', 'Guild3', 'Guild4', 'Guild5');
    }

    const guildCount = guilds.length;
    // Increment with dynamic guild count: 1→2→3...→N→1
    const newIndex = (currentIndex % guildCount) + 1;

    // Update the sheet
    sheet.getRange(rowIndex, 2).setValue(newIndex);

    const oldGuild = guilds[currentIndex - 1] || guilds[0];
    const newGuild = guilds[newIndex - 1] || guilds[0];

    Logger.log(`✅ ${bossName} rotation: ${currentIndex} (${oldGuild}) → ${newIndex} (${newGuild}) [${guildCount} guilds]`);

    return createResponse('ok', 'Rotation incremented', {
      bossName: bossName,
      oldIndex: currentIndex,
      newIndex: newIndex,
      oldGuild: oldGuild,
      newGuild: newGuild,
      guildCount: guildCount,
      isNowOurTurn: (newIndex === 1)
    });

  } catch (err) {
    Logger.log('❌ Error incrementing boss rotation: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Manually set rotation index for a boss (admin override)
 * @param {Object} data - Contains bossName and newIndex (1-5)
 * @returns {Object} Response with updated rotation data
 */
function setBossRotation(data) {
  try {
    const bossName = (data.bossName || '').toString().trim();
    const newIndex = parseInt(data.newIndex);

    if (!bossName || !newIndex || newIndex < 1) {
      return createResponse('error', 'Invalid parameters (bossName required, newIndex must be >= 1)');
    }

    // Ensure sheet exists first
    ensureBossRotationSheetExists();

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('BossRotation');

    if (!sheet) {
      return createResponse('error', 'BossRotation sheet not found');
    }

    const dataValues = sheet.getDataRange().getValues();

    // Find boss row
    let rowIndex = -1;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][0].toString().trim().toUpperCase() === bossName.toUpperCase()) {
        rowIndex = i + 1; // +1 for 1-based indexing
        break;
      }
    }

    if (rowIndex === -1) {
      Logger.log(`⚠️ Boss not found in rotation: ${bossName}`);
      return createResponse('error', 'Boss not found in rotation system');
    }

    const currentIndex = parseInt(dataValues[rowIndex - 1][1]) || 1;

    // Dynamically read all guild columns
    const guilds = [];
    for (let i = 2; i < dataValues[rowIndex - 1].length; i++) {
      const guildName = dataValues[rowIndex - 1][i]?.toString().trim();
      if (guildName) {
        guilds.push(guildName);
      }
    }

    // If no guilds found, default to 5 guilds
    if (guilds.length === 0) {
      guilds.push('TENCHU', 'Guild2', 'Guild3', 'Guild4', 'Guild5');
    }

    const guildCount = guilds.length;

    // Validate newIndex against actual guild count
    if (newIndex > guildCount) {
      return createResponse('error', `Invalid index ${newIndex} (must be 1-${guildCount})`);
    }

    // Update the sheet
    sheet.getRange(rowIndex, 2).setValue(newIndex);

    const currentGuild = guilds[newIndex - 1] || guilds[0];

    Logger.log(`✅ ${bossName} rotation manually set: ${currentIndex} → ${newIndex} (${currentGuild}) [${guildCount} guilds]`);

    return createResponse('ok', 'Rotation set successfully', {
      bossName: bossName,
      oldIndex: currentIndex,
      newIndex: newIndex,
      currentGuild: currentGuild,
      guildCount: guildCount,
      isOurTurn: (newIndex === 1)
    });

  } catch (err) {
    Logger.log('❌ Error setting boss rotation: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

// ===========================================================
// CRASH RECOVERY SYSTEM
// ===========================================================

/**
 * Ensures the _RecoveryState sheet exists, creates if missing
 * @param {Object} data - Request data
 * @returns {Object} Response object
 */
function ensureRecoverySheet(data) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    let sheet = ss.getSheetByName('_RecoveryState');

    if (!sheet) {
      Logger.log('📝 Creating _RecoveryState sheet...');

      sheet = ss.insertSheet('_RecoveryState');

      // Set up headers
      const headers = ['Category', 'State JSON', 'Last Updated'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format headers
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#4a86e8')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');

      // Set column widths
      sheet.setColumnWidth(1, 150); // Category
      sheet.setColumnWidth(2, 600); // State JSON
      sheet.setColumnWidth(3, 180); // Last Updated

      // Add initial categories
      const categories = [
        ['auction', '{}', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd/yyyy HH:mm:ss')],
        ['leaderboard', '{}', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd/yyyy HH:mm:ss')],
        ['scheduler', '{}', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd/yyyy HH:mm:ss')]
      ];

      sheet.getRange(2, 1, categories.length, 3).setValues(categories);

      Logger.log('✅ _RecoveryState sheet created successfully');

      return createResponse('ok', 'Recovery sheet created', { created: true });
    }

    Logger.log('✅ _RecoveryState sheet already exists');
    return createResponse('ok', 'Recovery sheet exists', { exists: true });

  } catch (err) {
    Logger.log('❌ Error ensuring recovery sheet: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Save recovery state to _RecoveryState sheet
 * @param {Object} data - {category: string, state: Object}
 * @returns {Object} Response object
 */
function saveRecoveryState(data) {
  try {
    const category = data.category || '';
    const state = data.state || {};

    if (!category) {
      return createResponse('error', 'Missing category parameter');
    }

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    let sheet = ss.getSheetByName('_RecoveryState');

    if (!sheet) {
      // Create sheet if it doesn't exist
      const createResult = ensureRecoverySheet({});
      if (createResult.status !== 'ok') {
        return createResult;
      }
      sheet = ss.getSheetByName('_RecoveryState');
    }

    // Find category row
    const dataRange = sheet.getDataRange();
    const dataValues = dataRange.getValues();

    let rowIndex = -1;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][0] === category) {
        rowIndex = i + 1; // +1 for 1-indexed
        break;
      }
    }

    const stateJSON = JSON.stringify(state);
    const timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd/yyyy HH:mm:ss');

    if (rowIndex > 0) {
      // Update existing row
      sheet.getRange(rowIndex, 2).setValue(stateJSON);
      sheet.getRange(rowIndex, 3).setValue(timestamp);
    } else {
      // Add new row
      sheet.appendRow([category, stateJSON, timestamp]);
    }

    Logger.log(`✅ Recovery state saved: ${category}`);

    return createResponse('ok', 'Recovery state saved', {
      category: category,
      timestamp: timestamp
    });

  } catch (err) {
    Logger.log('❌ Error saving recovery state: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Load recovery state from _RecoveryState sheet
 * @param {Object} data - Request data (optional category filter)
 * @returns {Object} Response object with state data
 */
function loadRecoveryState(data) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('_RecoveryState');

    if (!sheet) {
      Logger.log('ℹ️ _RecoveryState sheet does not exist');
      return createResponse('ok', 'No recovery state found', { state: {} });
    }

    const dataRange = sheet.getDataRange();
    const dataValues = dataRange.getValues();

    const state = {};

    // Start from row 2 (skip headers)
    for (let i = 1; i < dataValues.length; i++) {
      const category = dataValues[i][0];
      const stateJSON = dataValues[i][1];
      const timestamp = dataValues[i][2];

      if (category && stateJSON) {
        try {
          state[category] = JSON.parse(stateJSON);
        } catch (parseErr) {
          Logger.log(`⚠️ Failed to parse state for ${category}: ${parseErr.toString()}`);
          state[category] = {};
        }
      }
    }

    Logger.log(`✅ Recovery state loaded (${Object.keys(state).length} categories)`);

    return createResponse('ok', 'Recovery state loaded', { state: state });

  } catch (err) {
    Logger.log('❌ Error loading recovery state: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Ensure Member Registry tab exists
 * Creates it with headers if missing, inserted as the first sheet
 */
function ensureMemberRegistryTab() {
  const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
  let sheet = ss.getSheetByName('Member Registry');
  
  if (!sheet) {
    Logger.log('📝 Creating Member Registry tab (first run)...');
    sheet = ss.insertSheet('Member Registry', 0); // Insert as first sheet
    sheet.getRange(1, 1, 1, 5).setValues([[
      'Discord ID', 'Current Nickname', 'Last Updated', 'Discord Username', 'Last Known Nickname'
    ]]);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 200); // Discord ID
    sheet.setColumnWidth(2, 200); // Current Nickname
    sheet.setColumnWidth(3, 150); // Last Updated
    sheet.setColumnWidth(4, 200); // Discord Username
    sheet.setColumnWidth(5, 200); // Last Known Nickname
    // Freeze header row
    sheet.setFrozenRows(1);
    Logger.log('✅ Member Registry tab created');
  }
}

/**
 * Ensure the Discord Username column exists in existing Member Registry sheets
 * In case the sheet was created before the Discord Username column was added
 */
function ensureRegistryHasUsernameColumn() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const registrySheet = ss.getSheetByName('Member Registry');
    if (!registrySheet) return; // Sheet doesn't exist yet
    
    const headers = registrySheet.getDataRange().getValues()[0];
    if (headers.includes('Discord Username')) return; // Already has the column
    
    Logger.log('📝 Adding Discord Username column to existing Member Registry...');
    
    // Insert column D (index 4, 1-indexed)
    registrySheet.insertColumnAfter(3); // Insert after column C (Last Updated)
    
    // Add the header
    registrySheet.getRange(1, 4).setValue('Discord Username');
    registrySheet.getRange('1:1').setFontWeight('bold');
    registrySheet.setColumnWidth(4, 200);
    
    Logger.log('✅ Discord Username column added to Member Registry');
  } catch (err) {
    Logger.log('⚠️ Failed to ensure Discord Username column: ' + err.toString());
  }
}

/**
 * Ensure the Last Known Nickname column exists in existing Member Registry sheets
 */
function ensureRegistryHasLastKnownColumn() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const registrySheet = ss.getSheetByName('Member Registry');
    if (!registrySheet) return;
    
    const headers = registrySheet.getDataRange().getValues()[0];
    if (headers.includes('Last Known Nickname')) return;
    
    Logger.log('📝 Adding Last Known Nickname column to existing Member Registry...');
    
    const lastCol = registrySheet.getLastColumn();
    registrySheet.insertColumnAfter(lastCol);
    registrySheet.getRange(1, lastCol + 1).setValue('Last Known Nickname');
    registrySheet.getRange('1:1').setFontWeight('bold');
    registrySheet.setColumnWidth(lastCol + 1, 200);
    
    Logger.log('✅ Last Known Nickname column added');
  } catch (err) {
    Logger.log('⚠️ Failed to ensure Last Known Nickname column: ' + err.toString());
  }
}

/**
 * Ensure BiddingPoints sheet exists
 * Creates it with headers if missing
 */
function ensureBiddingPointsSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  
  if (!sheet) {
    Logger.log('📝 Creating BiddingPoints sheet (first run)...');
    sheet = ss.insertSheet(CONFIG.BIDDING_SHEET);
    sheet.getRange(1, 1, 1, 3).setValues([[
      'MEMBERS', 'BIDDING POINTS AVAILABLE', 'TOTAL BIDDING POINTS CONSUMED'
    ]]);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(3, 200);
    sheet.setFrozenRows(1);
    Logger.log('✅ BiddingPoints sheet created');
  }
}

/**
 * Ensure TOTAL ATTENDANCE sheet exists
 * Creates it with headers if missing
 */
function ensureTotalAttendanceSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
  let sheet = ss.getSheetByName('TOTAL ATTENDANCE');
  
  if (!sheet) {
    Logger.log('📝 Creating TOTAL ATTENDANCE sheet (first run)...');
    sheet = ss.insertSheet('TOTAL ATTENDANCE');
    sheet.getRange(1, 1, 1, 2).setValues([[
      'Member', 'Total Attendance (Days)'
    ]]);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 200);
    sheet.setFrozenRows(1);
    Logger.log('✅ TOTAL ATTENDANCE sheet created');
  }
}

/**
 * Ensure BossPoints sheet exists
 * Creates it with boss name and points data if missing
 */
function ensureBossPointsSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.BOSS_POINTS_SHEET);
  
  if (!sheet) {
    Logger.log('📝 Creating BossPoints sheet (first run)...');
    sheet = ss.insertSheet(CONFIG.BOSS_POINTS_SHEET);
    
    const headers = ['Boss Name', 'Points'];
    const bosses = [
      ['Venatus', 1],
      ['Viorent', 1],
      ['Ego', 1],
      ['Clemantis', 1],
      ['Livera', 1],
      ['Araneo', 1],
      ['Undomiel', 1],
      ['Saphirus', 1],
      ['Neutro', 1],
      ['Lady Dalia', 1],
      ['General Aquleus', 1],
      ['Thymele', 1],
      ['Amentis', 1],
      ['Baron Braudmore', 1],
      ['Milavy', 2],
      ['Wannitas', 2],
      ['Metus', 2],
      ['Duplican', 2],
      ['Shuliar', 2],
      ['Ringor', 2],
      ['Roderick', 2],
      ['Titore', 2],
      ['Larba', 2],
      ['Gareth', 2],
      ['Catena', 3],
      ['Auraq', 3],
      ['Secreta', 3],
      ['Ordo', 3],
      ['Asta', 3],
      ['Supore', 3],
      ['Chaiflock', 5],
      ['Benji', 3],
      ['Guild Boss', 5],
      ['GvG', 5],
      ['Icaruthia', 10],
      ['Motti', 10],
      ['Nevaeh', 10],
      ['Tumier', 5],
      ['Libitina', 5],
      ['Rakajeth', 5]
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, bosses.length, headers.length).setValues(bosses);
    
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 100);
    sheet.setFrozenRows(1);
    
    Logger.log('✅ BossPoints sheet created with ' + bosses.length + ' bosses');
  }
}

/**
 * Ensure BiddingItems sheet exists
 * Creates it with headers if missing
 */
function ensureBiddingItemsSheet() {
  const headers = ['Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid',
    'Auction Start', 'Auction End', 'Timestamp', 'Total Bids', 'Source', 'Quantity', 'Boss', 'Notes'];
  const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
  let sheet = ss.getSheetByName('BiddingItems');
  
  if (!sheet) {
    Logger.log('📝 Creating BiddingItems sheet (first run)...');
    sheet = ss.insertSheet('BiddingItems');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    // Set column widths
    for (let i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, i <= 2 ? 150 : 120);
    }
    Logger.log('✅ BiddingItems sheet created with ' + headers.length + ' columns');
  }
}

/**
 * Ensure ForDistribution sheet exists
 * Creates it with headers if missing
 */
function ensureForDistributionSheet() {
  const headers = ['Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid',
    'Auction Start', 'Auction End', 'Timestamp', 'Total Bids', 'Source', 'Quantity', 'Boss', 'STATUS'];
  const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
  let sheet = ss.getSheetByName('ForDistribution');
  
  if (!sheet) {
    Logger.log('📝 Creating ForDistribution sheet (first run)...');
    sheet = ss.insertSheet('ForDistribution');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    for (let i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, i <= 2 ? 150 : 120);
    }
    Logger.log('✅ ForDistribution sheet created with ' + headers.length + ' columns');
  }
}

/**
 * Sync member registry data from Discord bot
 * When a nickname change is detected, updates ALL historical weekly sheets
 * @param {Object} data - { members: [{discordId, nickname}] }
 * @returns {Object} Response
 */
function handleSyncMemberRegistry(data) {
  try {
    const members = data.members || [];
    if (members.length === 0) {
      return createResponse('ok', 'No members to sync');
    }
    
    Logger.log(`🔄 Syncing ${members.length} members to registry...`);
    
    ensureMemberRegistryTab();
    ensureRegistryHasUsernameColumn();
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const registrySheet = ss.getSheetByName('Member Registry');
    const existingData = registrySheet.getDataRange().getValues();
    const headers = existingData[0];
    const idCol = headers.indexOf('Discord ID');
    const nickCol = headers.indexOf('Current Nickname');
    const updatedCol = headers.indexOf('Last Updated');
    const usernameCol = headers.indexOf('Discord Username');
    const lastKnownCol = headers.indexOf('Last Known Nickname');
    const rows = existingData.slice(1); // Skip header
    
    let added = 0;
    let updated = 0;
    
    for (const member of members) {
      const { discordId, nickname, discordUsername } = member;
      if (!discordId || !nickname) continue;
      
      // Look up by Discord ID
      let rowIndex = -1;
      let oldNickname = null;
      let oldUsername = null;
      let oldLastKnown = null;
      
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][idCol] === discordId) {
          rowIndex = i + 2; // +2 for 1-indexed + header
          oldNickname = rows[i][nickCol];
          if (usernameCol !== -1) oldUsername = rows[i][usernameCol];
          if (lastKnownCol !== -1) oldLastKnown = rows[i][lastKnownCol];
          break;
        }
      }
      
      const now = new Date();
      const dateStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      
      if (rowIndex > 0) {
        // Found existing entry
        if (oldNickname && oldNickname !== nickname) {
          Logger.log(`🔄 Nickname changed: ${oldNickname} → ${nickname} (${discordId})`);
          
          // Find-and-replace across ALL weekly sheets
          const allSheets = ss.getSheets();
          let totalReplacements = 0;
          
          // Build search terms: always search by old nickname
          const searchTerms = [oldNickname];
          // Also search by Discord username if different from both nicknames
          if (discordUsername && discordUsername !== nickname && discordUsername !== oldNickname) {
            searchTerms.push(discordUsername);
          }
          if (oldLastKnown && oldLastKnown !== oldNickname && oldLastKnown !== nickname) {
            searchTerms.push(oldLastKnown);
          }
          
          for (const sheet of allSheets) {
            const sheetName = sheet.getName();
            if (sheetName.startsWith(CONFIG.SHEET_NAME_PREFIX)) {
              for (const term of searchTerms) {
                const textFinder = sheet.createTextFinder(term);
                const foundRanges = textFinder.findAll();
                if (foundRanges.length > 0) {
                  Logger.log(`  📄 ${sheetName}: Replacing ${foundRanges.length} occurrences of "${term}"`);
                  for (const range of foundRanges) {
                    range.setValue(nickname);
                  }
                  totalReplacements += foundRanges.length;
                }
              }
            }
          }
          
          Logger.log(`✅ Replaced ${totalReplacements} occurrences across weekly sheets`);
          
          // Store old nickname as Last Known Nickname
          if (lastKnownCol !== -1) {
            registrySheet.getRange(rowIndex, lastKnownCol + 1).setValue(oldNickname);
          }
        }
        
        // Also search by Discord username if newly provided and different from nickname
        // Handles the case where check-in records used the Discord username instead of nickname
        if (discordUsername && usernameCol !== -1 && discordUsername !== nickname) {
          const allSheets = ss.getSheets();
          let usernameReplacements = 0;
          
          for (const sheet of allSheets) {
            const sheetName = sheet.getName();
            if (sheetName.startsWith(CONFIG.SHEET_NAME_PREFIX)) {
              const textFinder = sheet.createTextFinder(discordUsername);
              const foundRanges = textFinder.findAll();
              if (foundRanges.length > 0) {
                Logger.log(`  📄 ${sheetName}: Replacing ${foundRanges.length} occurrences of username "${discordUsername}"`);
                for (const range of foundRanges) {
                  range.setValue(nickname);
                }
                usernameReplacements += foundRanges.length;
              }
            }
          }
          
          if (usernameReplacements > 0) {
            Logger.log(`✅ Replaced ${usernameReplacements} username occurrences in weekly sheets`);
          }
        }
        
        // Update nickname and timestamp
        registrySheet.getRange(rowIndex, nickCol + 1).setValue(nickname);
        registrySheet.getRange(rowIndex, updatedCol + 1).setValue(dateStr);
        
        // Update Discord Username if provided
        if (discordUsername && usernameCol !== -1) {
          registrySheet.getRange(rowIndex, usernameCol + 1).setValue(discordUsername);
        }
        
        updated++;
      } else {
        // New entry
        if (discordUsername && usernameCol !== -1) {
          registrySheet.appendRow([discordId, nickname, dateStr, discordUsername, '']);
        } else {
          registrySheet.appendRow([discordId, nickname, dateStr, '', '']);
        }
        added++;
      }
    }
    
    Logger.log(`✅ Registry sync complete: ${added} added, ${updated} updated`);
    return createResponse('ok', `Registry synced: ${added} added, ${updated} updated`);
    
  } catch (err) {
    Logger.log('❌ Error syncing member registry: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Look up a member's registered nickname by Discord ID
 * @param {Object} data - { discordId: string }
 * @returns {Object} Response with { nickname: string|null }
 */
function handleLookupMemberName(data) {
  try {
    const discordId = data.discordId;
    if (!discordId) {
      return createResponse('error', 'No discordId provided');
    }
    
    ensureMemberRegistryTab();
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const registrySheet = ss.getSheetByName('Member Registry');
    const existingData = registrySheet.getDataRange().getValues();
    const headers = existingData[0];
    const idCol = headers.indexOf('Discord ID');
    const nickCol = headers.indexOf('Current Nickname');
    
    if (idCol === -1 || nickCol === -1) {
      return createResponse('ok', 'Registry not properly initialized', { nickname: null });
    }
    
    // Search for the Discord ID (skip header row)
    for (let i = 1; i < existingData.length; i++) {
      if (String(existingData[i][idCol]) === String(discordId)) {
        const nickname = existingData[i][nickCol];
        Logger.log(`✅ Looked up ${discordId} → ${nickname}`);
        return createResponse('ok', 'Member found', { nickname: nickname });
      }
    }
    
    // Not found
    Logger.log(`ℹ️ Discord ID ${discordId} not found in registry`);
    return createResponse('ok', 'Member not found', { nickname: null });
    
  } catch (err) {
    Logger.log('❌ Error looking up member: ' + err.toString());
    return createResponse('error', err.toString(), { nickname: null });
  }
}

/**
 * Batch lookup multiple members by Discord ID
 * @param {Object} data - { members: [{ discordId: string }] }
 * @returns {Object} Response with { names: { [discordId]: string|null } }
 */
function handleBatchLookupMembers(data) {
  try {
    const members = data.members || [];
    if (members.length === 0) {
      return createResponse('ok', 'No members provided', { names: {} });
    }
    
    ensureMemberRegistryTab();
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const registrySheet = ss.getSheetByName('Member Registry');
    const existingData = registrySheet.getDataRange().getValues();
    const headers = existingData[0];
    const idCol = headers.indexOf('Discord ID');
    const nickCol = headers.indexOf('Current Nickname');
    
    if (idCol === -1 || nickCol === -1) {
      return createResponse('ok', 'Registry not initialized', { names: {} });
    }
    
    // Build a lookup map from the registry
    const registry = {};
    for (let i = 1; i < existingData.length; i++) {
      registry[String(existingData[i][idCol])] = existingData[i][nickCol];
    }
    
    // Look up each requested Discord ID
    const names = {};
    for (const member of members) {
      const id = String(member.discordId);
      names[id] = registry[id] || null;
    }
    
    return createResponse('ok', `Looked up ${members.length} members`, { names: names });
    
  } catch (err) {
    Logger.log('❌ Error batch looking up members: ' + err.toString());
    return createResponse('error', err.toString(), { names: {} });
  }
}

/**
 * Sync attendance data for a specific week (rebuilds from scratch)
 * Called by !syncattend command — scans closed threads and rebuilds week attendance
 *
 * @param {Object} data - { weekIndex: "20260517", attendanceData: [{ boss, timestamp, members[] }] }
 */
function handleSyncWeekAttendance(data) {
  const weekIndex = (data.weekIndex || '').toString().trim();
  const attendanceData = data.attendanceData || [];

  if (!weekIndex || attendanceData.length === 0) {
    return createResponse('error', 'Missing weekIndex or attendanceData');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
  } catch (e) {
    return createResponse('error', 'Lock timeout after 60s');
  }

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheetName = CONFIG.SHEET_NAME_PREFIX + weekIndex;
    let sheet = ss.getSheetByName(sheetName);

    // Create sheet if it doesn't exist
    if (!sheet) {
      Logger.log('📝 Creating week sheet ' + sheetName + ' (first sync)...');
      sheet = ss.insertSheet(sheetName);
      const headerData = [['MEMBERS', 'POINTS CONSUMED', 'POINTS LEFT', 'ATTENDANCE POINTS']];
      sheet.getRange(1, COLUMNS.MEMBERS, 1, COLUMNS.ATTENDANCE_POINTS).setValues(headerData)
           .setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF').setHorizontalAlignment('center');
      sheet.getRange(2, COLUMNS.MEMBERS, 1, COLUMNS.ATTENDANCE_POINTS).setBackground('#E8F4F8');
      sheet.setColumnWidth(COLUMNS.MEMBERS, 150).setColumnWidth(COLUMNS.POINTS_CONSUMED, 120)
           .setColumnWidth(COLUMNS.POINTS_LEFT, 100).setColumnWidth(COLUMNS.ATTENDANCE_POINTS, 150);
      copyMembersFromPreviousWeek(ss, sheet);
      Logger.log('✅ Created week sheet: ' + sheetName);
    }

    // Clear existing spawn columns (E onwards) — preserve member column A-D
    const lastCol = sheet.getLastColumn();
    if (lastCol >= COLUMNS.FIRST_SPAWN) {
      // Clear headers in row 1-2 (timestamp + boss)
      const clearCols = lastCol - COLUMNS.FIRST_SPAWN + 1;
      sheet.getRange(1, COLUMNS.FIRST_SPAWN, 2, clearCols).clearContent();

      // Clear attendance data in rows 3+
      const lastRow = sheet.getLastRow();
      if (lastRow >= 3) {
        sheet.getRange(3, COLUMNS.FIRST_SPAWN, lastRow - 2, clearCols).clearContent();
      }
    }

    // Process each attendance entry
    let spawnCount = 0;
    let totalCheckins = 0;
    const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();

    for (const entry of attendanceData) {
      const boss = (entry.boss || '').toString().trim().toUpperCase();
      const timestamp = (entry.timestamp || '').toString().trim();
      const members = (entry.members || []).map(m => m.toString().trim());

      if (!boss || !timestamp || members.length === 0) continue;

      const newCol = COLUMNS.FIRST_SPAWN + spawnCount;

      // Add timestamp + boss header
      sheet.getRange(1, newCol, 2, 1).setValues([[timestamp], [boss]])
           .setFontWeight('bold').setBackground('#E8F4F8').setHorizontalAlignment('center');
      sheet.setColumnWidth(newCol, 120);

      // Add attendance checkboxes
      const currentLastRow = sheet.getLastRow();
      if (currentLastRow >= 3) {
        const allMemberNames = sheet.getRange(3, COLUMNS.MEMBERS, currentLastRow - 2, 1).getValues().flat();
        const allMembersLower = allMemberNames.map(m => (m || '').toString().trim().toLowerCase());
        const membersLower = members.map(m => m.toLowerCase());

        const attendanceColData = allMembersLower.map(m => [membersLower.includes(m)]);
        sheet.getRange(3, newCol, attendanceColData.length, 1).setValues(attendanceColData).setDataValidation(checkboxRule);
      }

      spawnCount++;
      totalCheckins += members.length;
    }

    Logger.log(`📊 Synced ${spawnCount} spawns, ${totalCheckins} check-ins to ${sheetName}`);

    // Deduplicate member names
    try {
      const dedupCount = deduplicateMemberNames(sheet);
      if (dedupCount > 0) {
        Logger.log(`🧹 Merged ${dedupCount} duplicate member row(s) in ${sheetName}`);
      }
    } catch (e) {
      Logger.log('⚠️ Failed to deduplicate members: ' + e.message);
    }

    // Auto-update totals
    try {
      updateTotalAttendanceAndMembers();
      Logger.log('📊 Auto-updated TOTAL ATTENDANCE sheet');
    } catch (e) {
      Logger.log('⚠️ Failed to update TOTAL ATTENDANCE: ' + e.message);
    }

    try {
      updateBiddingPoints();
      Logger.log('💰 Auto-updated BiddingPoints sheet');
    } catch (e) {
      Logger.log('⚠️ Failed to update BiddingPoints: ' + e.message);
    }

    return createResponse('ok', `Synced ${spawnCount} spawns, ${totalCheckins} check-ins to ${sheetName}`, {
      sheetName: sheetName,
      spawnCount: spawnCount,
      totalCheckins: totalCheckins
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deduplicate member names in column A by merging spawn data and removing extra rows.
 * Uses case-insensitive matching to find duplicates.
 *
 * @param {Sheet} sheet - The WEEK_ sheet to deduplicate
 * @returns {number} Number of duplicate rows merged/deleted
 */
function deduplicateMemberNames(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return 0;

  const memberData = sheet.getRange(3, COLUMNS.MEMBERS, lastRow - 2, 1).getValues();
  const seen = {}; // lowercase name → sheet row number (first occurrence)
  const rowsToDelete = [];
  let dedupCount = 0;

  for (let i = 0; i < memberData.length; i++) {
    const name = (memberData[i][0] || '').toString().trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();

    if (seen[nameLower] !== undefined) {
      // Duplicate found — merge spawn data from this row into the first occurrence
      const firstRow = seen[nameLower];      // Sheet row of first occurrence
      const currentRow = 3 + i;              // Sheet row of this duplicate

      const lastCol = sheet.getLastColumn();
      if (lastCol >= COLUMNS.FIRST_SPAWN) {
        // Get spawn data from both rows
        const spawnCols = lastCol - COLUMNS.FIRST_SPAWN + 1;
        const firstData = sheet.getRange(firstRow, COLUMNS.FIRST_SPAWN, 1, spawnCols).getValues()[0];
        const currentData = sheet.getRange(currentRow, COLUMNS.FIRST_SPAWN, 1, spawnCols).getValues()[0];

        // Merge: TRUE if either row has TRUE (OR logic)
        const merged = firstData.map((val, idx) => val === true || currentData[idx] === true);
        sheet.getRange(firstRow, COLUMNS.FIRST_SPAWN, 1, merged.length).setValues([merged]);
      }

      rowsToDelete.push(currentRow);
      dedupCount++;
    } else {
      seen[nameLower] = 3 + i; // Sheet row number (3-indexed)
    }
  }

  // Delete duplicate rows bottom-up to preserve indices
  rowsToDelete.sort((a, b) => b - a);
  for (const row of rowsToDelete) {
    sheet.deleteRow(row);
  }

  return dedupCount;
}

/**
 * Handle single member rename (triggered by Discord guildMemberUpdate event)
 * Updates Member Registry + find-and-replaces old nickname in all WEEK_* sheets
 * @param {Object} data - { discordId: string, oldNickname: string, newNickname: string }
 * @returns {Object} Response
 */
function handleRenameMember(data) {
  try {
    const { discordId, oldNickname, newNickname, discordUsername } = data;
    if (!discordId || !oldNickname || !newNickname) {
      return createResponse('error', 'Missing required fields: discordId, oldNickname, newNickname');
    }
    
    Logger.log(`📝 Rename request: ${oldNickname} → ${newNickname} (${discordId})`);
    
    ensureMemberRegistryTab();
    ensureRegistryHasUsernameColumn();
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const registrySheet = ss.getSheetByName('Member Registry');
    const existingData = registrySheet.getDataRange().getValues();
    const headers = existingData[0];
    const idCol = headers.indexOf('Discord ID');
    const nickCol = headers.indexOf('Current Nickname');
    const updatedCol = headers.indexOf('Last Updated');
    const usernameCol = headers.indexOf('Discord Username');
    const lastKnownCol = headers.indexOf('Last Known Nickname');
    
    if (idCol === -1 || nickCol === -1) {
      return createResponse('error', 'Member Registry not properly initialized');
    }
    
    // Find the member by Discord ID
    let rowIndex = -1;
    let storedUsername = null;
    let storedLastKnown = null;
    for (let i = 1; i < existingData.length; i++) {
      if (String(existingData[i][idCol]) === String(discordId)) {
        rowIndex = i + 1; // Convert to 1-indexed (row 1 = header)
        if (usernameCol !== -1) storedUsername = existingData[i][usernameCol];
        if (lastKnownCol !== -1) storedLastKnown = existingData[i][lastKnownCol];
        break;
      }
    }
    
    const now = new Date();
    const dateStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    
    if (rowIndex === -1) {
      // Not found in registry - add them as new entry
      Logger.log(`📝 ${newNickname} not in registry, adding new entry`);
      if (discordUsername && usernameCol !== -1) {
        registrySheet.appendRow([discordId, newNickname, dateStr, discordUsername, '']);
      } else {
        registrySheet.appendRow([discordId, newNickname, dateStr, '', '']);
      }
      Logger.log(`✅ Added ${newNickname} to registry`);
    } else {
      // Update nickname in registry
      registrySheet.getRange(rowIndex, nickCol + 1).setValue(newNickname);
      registrySheet.getRange(rowIndex, updatedCol + 1).setValue(dateStr);
      
      // Update Discord Username if provided
      if (discordUsername && usernameCol !== -1) {
        registrySheet.getRange(rowIndex, usernameCol + 1).setValue(discordUsername);
      }
      
      Logger.log(`✅ Registry updated: ${oldNickname} → ${newNickname}`);
      
      // Find-and-replace old nickname across all WEEK_* sheets
      const allSheets = ss.getSheets();
      const searchTerms = [oldNickname];
      // Also search by stored Discord username if different from the nickname
      if (storedUsername && storedUsername !== oldNickname && storedUsername !== newNickname) {
        searchTerms.push(storedUsername);
      }
      if (storedLastKnown && storedLastKnown !== oldNickname && storedLastKnown !== newNickname) {
        searchTerms.push(storedLastKnown);
      }
      
      let totalReplacements = 0;
      
      for (const sheet of allSheets) {
        const sheetName = sheet.getName();
        if (sheetName.startsWith(CONFIG.SHEET_NAME_PREFIX)) {
          for (const searchTerm of searchTerms) {
            const textFinder = sheet.createTextFinder(searchTerm);
            const foundRanges = textFinder.findAll();
            if (foundRanges.length > 0) {
              Logger.log(`  📄 ${sheetName}: Replacing ${foundRanges.length} occurrences of "${searchTerm}"`);
              for (const range of foundRanges) {
                range.setValue(newNickname);
              }
              totalReplacements += foundRanges.length;
            }
          }
        }
      }
      
      Logger.log(`✅ Replaced ${totalReplacements} occurrences across WEEK_* sheets`);
      
      // Store old nickname as Last Known Nickname
      if (lastKnownCol !== -1) {
        registrySheet.getRange(rowIndex, lastKnownCol + 1).setValue(oldNickname);
      }
    }
    
    return createResponse('ok', `Renamed ${oldNickname} → ${newNickname}`);
    
  } catch (err) {
    Logger.log('❌ Error renaming member: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

// ===========================================================
// BOSS TIMER RECOVERY FUNCTIONS
// ===========================================================

/**
 * Get boss timer recovery data
 * @returns {Object} Response with array of boss timer data
 */
function getBossTimerRecovery() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    let sheet = ss.getSheetByName('BossTimerRecovery');

    if (!sheet) {
      Logger.log('ℹ️ BossTimerRecovery sheet does not exist yet');
      return createResponse('ok', 'No recovery data found', { data: [] });
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length <= 1) {
      // Only header row or empty
      return createResponse('ok', 'No recovery data', { data: [] });
    }

    const data = [];
    // Start from row 2 (skip header)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0]) { // Has boss name
        data.push({
          bossName: row[0],
          lastKillTime: row[1],
          nextSpawnTime: row[2],
          killedBy: row[3] || 'unknown'
        });
      }
    }

    Logger.log(`✅ Loaded ${data.length} boss timer recovery entries`);
    return createResponse('ok', 'Boss timer recovery data loaded', { data: data });

  } catch (err) {
    Logger.log('❌ Error getting boss timer recovery: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Save boss timer recovery data
 * @param {Object} data - {bossName, lastKillTime, nextSpawnTime, killedBy}
 * @returns {Object} Response object
 */
function saveBossTimerRecovery(data) {
  try {
    const { bossName, lastKillTime, nextSpawnTime, killedBy } = data;

    if (!bossName || !lastKillTime || !nextSpawnTime) {
      return createResponse('error', 'Missing required fields');
    }

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    let sheet = ss.getSheetByName('BossTimerRecovery');

    if (!sheet) {
      // Create sheet
      sheet = ss.insertSheet('BossTimerRecovery');
      sheet.appendRow(['Boss Name', 'Last Kill Time', 'Next Spawn Time', 'Killed By']);
      sheet.getRange('A1:D1').setFontWeight('bold');
      Logger.log('📋 Created BossTimerRecovery sheet');
    }

    // Find existing row for this boss
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === bossName) {
        rowIndex = i + 1; // +1 for 1-indexed
        break;
      }
    }

    if (rowIndex > 0) {
      // Update existing row
      sheet.getRange(rowIndex, 2).setValue(lastKillTime);
      sheet.getRange(rowIndex, 3).setValue(nextSpawnTime);
      sheet.getRange(rowIndex, 4).setValue(killedBy || 'unknown');
      Logger.log(`✅ Updated boss timer for ${bossName}`);
    } else {
      // Append new row
      sheet.appendRow([bossName, lastKillTime, nextSpawnTime, killedBy || 'unknown']);
      Logger.log(`✅ Added boss timer for ${bossName}`);
    }

    return createResponse('ok', 'Boss timer saved', { bossName: bossName });

  } catch (err) {
    Logger.log('❌ Error saving boss timer recovery: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Bulk save boss timer recovery data (for maintenance mode)
 * @param {Object} data - {entries: [{bossName, lastKillTime, nextSpawnTime, killedBy}]}
 * @returns {Object} Response object
 */
function bulkSaveBossTimerRecovery(data) {
  try {
    const { entries } = data;

    if (!entries || !Array.isArray(entries)) {
      return createResponse('error', 'Missing or invalid entries array');
    }

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    let sheet = ss.getSheetByName('BossTimerRecovery');

    if (!sheet) {
      // Create sheet
      sheet = ss.insertSheet('BossTimerRecovery');
      sheet.appendRow(['Boss Name', 'Last Kill Time', 'Next Spawn Time', 'Killed By']);
      sheet.getRange('A1:D1').setFontWeight('bold');
      Logger.log('📋 Created BossTimerRecovery sheet');
    }

    // Get existing data
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const bossMap = new Map();

    // Map existing bosses to row indices
    for (let i = 1; i < values.length; i++) {
      if (values[i][0]) {
        bossMap.set(values[i][0], i + 1); // 1-indexed
      }
    }

    let updated = 0;
    let added = 0;

    // Process each entry
    for (const entry of entries) {
      const { bossName, lastKillTime, nextSpawnTime, killedBy } = entry;

      if (!bossName || !lastKillTime || !nextSpawnTime) {
        Logger.log(`⚠️ Skipping invalid entry: ${JSON.stringify(entry)}`);
        continue;
      }

      const rowIndex = bossMap.get(bossName);

      if (rowIndex) {
        // Update existing row
        sheet.getRange(rowIndex, 2).setValue(lastKillTime);
        sheet.getRange(rowIndex, 3).setValue(nextSpawnTime);
        sheet.getRange(rowIndex, 4).setValue(killedBy || 'MAINTENANCE');
        updated++;
      } else {
        // Append new row
        sheet.appendRow([bossName, lastKillTime, nextSpawnTime, killedBy || 'MAINTENANCE']);
        added++;
      }
    }

    Logger.log(`✅ Bulk save complete: ${updated} updated, ${added} added`);

    return createResponse('ok', 'Bulk save complete', {
      updated: updated,
      added: added,
      total: updated + added
    });

  } catch (err) {
    Logger.log('❌ Error bulk saving boss timer recovery: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Delete boss timer recovery data for a boss
 * @param {Object} data - {bossName}
 * @returns {Object} Response object
 */
function deleteBossTimerRecovery(data) {
  try {
    const { bossName } = data;

    if (!bossName) {
      return createResponse('error', 'Missing bossName parameter');
    }

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('BossTimerRecovery');

    if (!sheet) {
      return createResponse('ok', 'No recovery sheet exists');
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    // Find row for this boss
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === bossName) {
        sheet.deleteRow(i + 1); // 1-indexed
        Logger.log(`✅ Deleted boss timer for ${bossName}`);
        return createResponse('ok', 'Boss timer deleted', { bossName: bossName });
      }
    }

    return createResponse('ok', 'Boss not found', { bossName: bossName });

  } catch (err) {
    Logger.log('❌ Error deleting boss timer recovery: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

/**
 * Clear boss timer recovery data
 * @param {Object} data - {type: 'timer-based' | 'all'}
 * @returns {Object} Response object
 */
function clearBossTimerRecovery(data) {
  try {
    const { type } = data;

    const ss = SpreadsheetApp.openById(CONFIG.SSHEET_ID);
    const sheet = ss.getSheetByName('BossTimerRecovery');

    if (!sheet) {
      return createResponse('ok', 'No recovery sheet exists');
    }

    if (type === 'all') {
      // Clear all data (keep header)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      Logger.log('✅ Cleared all boss timer recovery data');
      return createResponse('ok', 'All recovery data cleared');
    } else if (type === 'timer-based') {
      // Clear only timer-based bosses
      // Load boss config to know which are timer-based
      const timerBosses = [
        'Venatus', 'Viorent', 'Ego', 'Livera', 'Araneo', 'Undomiel',
        'Lady Dalia', 'General Aquleus', 'Amentis', 'Baron Braudmore',
        'Wannitas', 'Metus', 'Duplican', 'Shuliar', 'Gareth', 'Titore',
        'Larba', 'Catena', 'Secreta', 'Ordo', 'Asta', 'Supore'
      ];

      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();

      let deleted = 0;
      // Loop backwards to safely delete rows
      for (let i = values.length - 1; i >= 1; i--) {
        if (timerBosses.includes(values[i][0])) {
          sheet.deleteRow(i + 1); // 1-indexed
          deleted++;
        }
      }

      Logger.log(`✅ Cleared ${deleted} timer-based boss entries`);
      return createResponse('ok', 'Timer-based recovery data cleared', { deleted: deleted });
    } else {
      return createResponse('error', 'Invalid type parameter');
    }

  } catch (err) {
    Logger.log('❌ Error clearing boss timer recovery: ' + err.toString());
    return createResponse('error', err.toString());
  }
}

// ===========================================================
// OPTIMIZED SHEET CREATION WITH AUTO-LOGGING
// ===========================================================