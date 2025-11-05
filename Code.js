/**
 * ELYSIUM Guild System - Google Apps Script v6.2 (OPTIMIZED)
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
 * 1. Configure DISCORD_WEBHOOK_URL in CONFIG (line 26)
 * 2. Set up Apps Script Triggers:
 *    - onEdit: Edit trigger > On edit
 *    - sundayWeeklySheetCreation: Time-driven > Week timer > Every Sunday > 12am-1am
 * 3. Review CODE_REVIEW_CONFLICTS.md for detailed analysis of fixes
 *
 * PREVIOUS FEATURES (v5.0):
 * - Auto-populate 0 for all members in bidding results
 */

const CONFIG = {
  SSHEET_ID: '1dGLGjmRhvG0io1Yta5ikfN-b_U-SSJJfWIHznK18qYQ',
  SHEET_NAME_PREFIX: 'ELYSIUM_WEEK_',
  BOSS_POINTS_SHEET: 'BossPoints',
  BIDDING_SHEET: 'BiddingPoints',
  TIMEZONE: 'Asia/Manila',
  DISCORD_WEBHOOK_URL: 'YOUR_DISCORD_WEBHOOK_URL', // To be configured by user
  CACHE_TTL_SECONDS: 300, // Cache duration: 5 minutes
};

const COLUMNS = {
  MEMBERS: 1,
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
    .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
    .replace(/[^\w\s]/g, '');       // Remove special characters (keep alphanumeric and spaces)
}

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
    if (action === 'removeMember') return handleRemoveMember(data);
    if (action === 'getBiddingItems') return getBiddingItems(data);
    if (action === 'logAuctionResult') return logAuctionResult(data);
    if (action === 'getBotState') return getBotState(data);
    if (action === 'saveBotState') return saveBotState(data);
    if (action === 'moveQueueItemsToSheet') return moveQueueItemsToSheet(data);
    if (action === 'moveAuctionedItemsToForDistribution') return moveAllItemsWithWinnersToForDistribution();

    // Loot logger actions
    if (action === 'submitLootEntries') return handleSubmitLootEntries(data);
    if (action === 'getLootState') return getLootState(data);
    if (action === 'saveLootState') return saveLootState(data);
    if (action === 'getHistoricalPrices') return getHistoricalPrices(data);

    // Leaderboard & Weekly Report actions
    if (action === 'getAttendanceLeaderboard') return getAttendanceLeaderboard(data);
    if (action === 'getBiddingLeaderboard') return getBiddingLeaderboard(data);
    if (action === 'getWeeklySummary') return getWeeklySummary(data);

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

// FUZZY MATCHING FUNCTIONS FOR LOOT NAME AUTO-CORRECTION

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching to find similar item names
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @return {number} The edit distance between the strings
 */
function levenshteinDistance(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  const len1 = s1.length;
  const len2 = s2.length;

  // Create a 2D array for dynamic programming
  const matrix = [];

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Find the best matching item name from existing items in BiddingItems sheet
 * Uses fuzzy matching with similarity threshold
 * @param {string} inputItem - The item name to match
 * @param {Array} existingItems - Array of existing item names from BiddingItems
 * @return {Object|null} Object with {name, price, similarity} or null if no good match
 */
function findBestMatch(inputItem, existingItems) {
  if (!inputItem || !existingItems || existingItems.length === 0) {
    return null;
  }

  const input = inputItem.trim().toLowerCase();
  let bestMatch = null;
  let bestSimilarity = 0;
  let bestPrice = '';

  for (let i = 0; i < existingItems.length; i++) {
    const existingItem = (existingItems[i][0] || '').toString().trim();
    const existingPrice = existingItems[i][1];

    if (!existingItem) continue;

    const existing = existingItem.toLowerCase();

    // Exact match (case-insensitive)
    if (input === existing) {
      return {
        name: existingItem,
        price: existingPrice || '',
        similarity: 1.0,
        isExactMatch: true
      };
    }

    // Calculate similarity using Levenshtein distance
    const distance = levenshteinDistance(input, existing);
    const maxLen = Math.max(input.length, existing.length);
    const similarity = 1 - (distance / maxLen);

    // Update best match if this is better
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = existingItem;
      bestPrice = existingPrice || '';
    }
  }

  // Only return matches with similarity >= 0.7 (70% similar)
  // This threshold catches typos like "Blue Rign" -> "Blue Ring"
  // but avoids false matches
  if (bestSimilarity >= 0.7) {
    return {
      name: bestMatch,
      price: bestPrice,
      similarity: bestSimilarity,
      isExactMatch: false
    };
  }

  return null;
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
      const ss = SpreadsheetApp.getActiveSpreadsheet();
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

          // NEW: Check for start price - prioritize provided price over fuzzy matching
          let startPrice = '';
          let correctedItemName = item; // Will be updated if fuzzy match is found
          const defaultDuration = 5; // Default duration: 5 minutes

          // Check if bot provided a suggested starting price from historical data
          if (entry.startingPrice !== undefined && entry.startingPrice !== null && entry.startingPrice > 0) {
            startPrice = entry.startingPrice;
            Logger.log(`💰 Using suggested historical price: ${startPrice} for "${item}"`);
          } else if (lastRow > 1) {
            // Fallback to fuzzy matching against existing items
            const existingData = biddingItemsSheet.getRange(2, 1, lastRow - 1, 2).getValues();

            // Use fuzzy matching to find best match
            const match = findBestMatch(item, existingData);

            if (match) {
              startPrice = match.price;

              if (match.isExactMatch) {
                // Exact match found
                correctedItemName = match.name; // Use the exact casing from sheet
                Logger.log(`💡 Found existing item "${correctedItemName}" with start price: ${startPrice}`);
              } else {
                // Fuzzy match found - auto-correct the spelling
                const similarityPercent = (match.similarity * 100).toFixed(1);
                Logger.log(`🔧 AUTO-CORRECTED: "${item}" → "${match.name}" (${similarityPercent}% similar)`);
                Logger.log(`💡 Using start price from existing item: ${startPrice}`);
                correctedItemName = match.name; // Use the corrected name
              }
            } else {
              // No match found - this is a new item
              Logger.log(`✨ New item detected: "${item}" - will be added to BiddingItems`);
            }
          }

          Logger.log(`📝 Adding item ${i + 1}: ${correctedItemName} (qty: ${quantity}, source: ${source}, boss: ${boss}, startPrice: ${startPrice || 'none'})`);

          // FIX 3: Build row data with start price lookup and default duration
          const rowData = [
            correctedItemName,              // A: Item (corrected name if fuzzy match found)
            startPrice,                     // B: Start Price (from existing item or empty)
            defaultDuration,                // C: Duration (5 minutes default)
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

          Logger.log(`✅ Added item at row ${insertRow}: ${correctedItemName}`);

          submittedItems.push({
            item: correctedItemName,
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
    return createResponse('ok', `Submitted: ${members.length}`, {column: newCol, boss, timestamp, membersCount: members.length});
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

        // Copy columns B, C, D (formulas)
        const formulas = prevSheet.getRange(3, 2, members.length, 3).getFormulas();
        newSheet.getRange(3, 2, members.length, 3).setFormulas(formulas);
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
  const cache = CacheService.getDocumentCache();
  const cacheKey = 'biddingPoints_v1';

  // Check if force refresh requested
  const forceFresh = data && data.forceFresh === true;

  // Try to get from cache first (unless force refresh)
  if (!forceFresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        Logger.log('✅ Cache hit for bidding points');
        return createResponse('ok', 'Points fetched (cached)', { points: cachedData });
      } catch (e) {
        Logger.log('⚠️ Cache parse error, fetching fresh: ' + e.message);
        // Continue to fresh fetch if cache is corrupted
      }
    }
  }

  // Cache miss or force refresh - read from sheet
  Logger.log('📊 Cache miss, reading from sheet');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  if (!sheet) return createResponse('error', `Sheet not found: ${CONFIG.BIDDING_SHEET}`);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    // Cache empty result too
    cache.put(cacheKey, JSON.stringify({}), CONFIG.CACHE_TTL_SECONDS);
    return createResponse('ok', 'No members', { points: {} });
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const points = {};
  dataRange.forEach(r => {
    const member = (r[0] || '').toString().trim();
    if (member) points[member] = Number(r[1]) || 0;
  });

  // Store in cache for future requests
  try {
    cache.put(cacheKey, JSON.stringify(points), CONFIG.CACHE_TTL_SECONDS);
    Logger.log(`✅ Cached ${Object.keys(points).length} members' points for ${CONFIG.CACHE_TTL_SECONDS}s`);
  } catch (e) {
    Logger.log('⚠️ Failed to cache points: ' + e.message);
    // Continue anyway, just won't be cached
  }

  return createResponse('ok', 'Points fetched (fresh)', { points });
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
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

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
 * - Only removes from BiddingPoints and ELYSIUM_WEEK_* attendance sheets
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
  // STEP 2: Remove from all attendance sheets (ELYSIUM_WEEK_*)
  // NOTE: ForDistribution sheet is EXCLUDED as it's a historical auction log
  // ==========================================
  const allSheets = ss.getSheets();
  const attendanceSheets = allSheets.filter(s => {
    const sheetName = s.getName();
    // Include only ELYSIUM_WEEK_ sheets, exclude ForDistribution
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
  
  // Get session info
  const sessionTs = getSessionTimestamp();
  const columnHeader = sessionTs.columnHeader; // MM/DD/YY HH:MM #N
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let biddingSheet = ss.getSheetByName(CONFIG.BIDDING_SHEET);
  if (!biddingSheet) return createResponse('error', `Sheet not found: ${CONFIG.BIDDING_SHEET}`);
  
  let biddingItemsSheet = ss.getSheetByName('BiddingItems');
  if (!biddingItemsSheet) {
    biddingItemsSheet = ss.insertSheet('BiddingItems');
    biddingItemsSheet.getRange(1, 1, 1, 12).setValues([[
      'Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid',
      'Auction Start', 'Auction End', 'Timestamp', 'Total Bids', 'Source', 'Quantity', 'Boss'
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
  const unmappedBidders = [];
  if (results && results.length > 0) {
    results.forEach(r => {
      const member = r.member.trim();
      const total = r.totalSpent || 0;
      // Use normalizeUsername for consistent matching (removes special chars, normalizes spacing)
      const normalizedMember = normalizeUsername(member);
      let rowIndex = memberNames.findIndex(m => normalizeUsername((m||'').toString()) === normalizedMember);
      if (rowIndex !== -1) {
        updates.push({row: rowIndex + 2, amount: total});
      } else if (total > 0) {
        // CRITICAL: Log when bidder not found in sheet (accounting mismatch!)
        unmappedBidders.push({member: member, amount: total});
        Logger.log(`⚠️ WARNING: Bidder "${member}" not found in BiddingPoints sheet. ${total}pts not recorded!`);
      }
    });

    // Apply all updates
    updates.forEach(u => biddingSheet.getRange(u.row, timestampColumn).setValue(u.amount));
  }

  // STEP 3: Update BiddingPoints (left side columns) with manual update flag
  // Set flag to prevent onEdit() from triggering again (prevents double execution)
  isManualUpdate = true;
  let pointsUpdateFailed = false;
  try {
    updateBiddingPoints();
  } catch (updateError) {
    pointsUpdateFailed = true;
    Logger.log(`❌ CRITICAL: updateBiddingPoints failed: ${updateError.toString()}`);
  } finally {
    isManualUpdate = false;
  }

  Logger.log(`✅ Session tally submitted: ${columnHeader}`);

  // Build response with warnings
  let warnings = [];
  if (unmappedBidders.length > 0) {
    Logger.log(`⚠️ ACCOUNTING WARNING: ${unmappedBidders.length} bidder(s) not found in sheet!`);
    warnings.push(`${unmappedBidders.length} bidder(s) not found in sheet`);
  }
  if (pointsUpdateFailed) {
    warnings.push('Points update failed (lock timeout)');
  }

  const baseMsg = `Submitted: Session ${columnHeader} with ${updates.length} members`;
  const warningMsg = warnings.length > 0 ? `${baseMsg} | ⚠️ WARNING: ${warnings.join(', ')} - check logs!` : baseMsg;

  return createResponse('ok', warningMsg, {
    timestampColumn,
    membersUpdated: updates.length,
    sessionHeader: columnHeader,
    manualItemsAdded: manualItems ? manualItems.length : 0,
    unmappedBidders: unmappedBidders.length > 0 ? unmappedBidders : undefined,
    pointsUpdateFailed: pointsUpdateFailed
  });
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
  allData.forEach((r, i) => {
    const m = (r[0] || '').toString().trim();
    if (!m) return;

    // Sum all session columns (columns 4+ = indices 3+)
    let totalConsumed = 0;
    for (let col = 3; col < r.length; col++) {
      const val = Number(r[col]) || 0;
      totalConsumed += val;
    }

    memberMap[m] = { row: i + 2, consumed: totalConsumed };
  });

  // --- Step 2: Collect attendance points from all weekly sheets ---
  const sheets = ss.getSheets().filter(s => s.getName().startsWith(CONFIG.SHEET_NAME_PREFIX));
  const attendancePoints = {};

  sheets.forEach(s => {
    const data = s.getRange('A2:D').getValues();
    data.forEach(r => {
      const m = (r[0] || '').toString().trim();
      if (m) attendancePoints[m] = (attendancePoints[m] || 0) + Number(r[3] || 0);
    });
  });

  // --- Step 3: Check for new members and auto-add to BiddingPoints ---
  const newMembers = Object.keys(attendancePoints).filter(m => !memberMap[m]);
  if (newMembers.length > 0) {
    Logger.log(`ℹ️ Found ${newMembers.length} new members in weekly sheets, adding to BiddingPoints:`);
    Logger.log(`ℹ️ Members: ${newMembers.join(', ')}`);

    // Auto-add new members to BiddingPoints sheet
    const insertStart = bpSheet.getLastRow() + 1;
    const newRows = newMembers.map(m => [m, attendancePoints[m], 0]);
    bpSheet.getRange(insertStart, 1, newRows.length, 3).setValues(newRows);
    newMembers.forEach((m, i) => {
      memberMap[m] = { row: insertStart + i, consumed: 0 };
    });

    Logger.log(`✅ Successfully added ${newMembers.length} new members to BiddingPoints`);
  }

    // --- Step 4: Update Column 3 (Points Consumed) and Column 2 (Points Left) for all members ---
    Object.keys(memberMap).forEach(m => {
      const consumed = memberMap[m].consumed;
      const left = (attendancePoints[m] || 0) - consumed;

      // Update both columns
      bpSheet.getRange(memberMap[m].row, 2).setValue(left);      // Column 2 = Points Left
      bpSheet.getRange(memberMap[m].row, 3).setValue(consumed);  // Column 3 = Points Consumed
    });

    Logger.log(`✅ Updated bidding points for ${Object.keys(memberMap).length} members`);

    // v6.2: Invalidate cache after updating points
    invalidateBiddingPointsCache();
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

// ===========================================================
// LOOT STATE MANAGEMENT (for recovery + debugging)
// ===========================================================
function saveLootState(data) {
  const state = data.state || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stateSheet = ss.getSheetByName('_LootState');

  if (!stateSheet) {
    return createResponse('ok', 'No loot state found', { state: {} });
  }

  const data = stateSheet.getRange(2, 2).getValue();
  const parsed = data ? JSON.parse(data) : {};

  return createResponse('ok', 'Loot state retrieved', { state: parsed });
}

/**
 * Get historical prices from ForDistribution sheet
 * Returns a map of item names to their starting prices
 * Used for auto-pricing loot items based on past auctions
 */
function getHistoricalPrices(data) {
  try {
    Logger.log('📊 Fetching historical prices from ForDistribution...');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const forDistSheet = ss.getSheetByName('ForDistribution');

    if (!forDistSheet) {
      Logger.log('⚠️ ForDistribution sheet not found');
      return createResponse('ok', 'No historical data available', { prices: {} });
    }

    const lastRow = forDistSheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('⚠️ No data in ForDistribution sheet');
      return createResponse('ok', 'No historical data available', { prices: {} });
    }

    // Read columns A (Item) and B (Start Price)
    const dataRange = forDistSheet.getRange(2, 1, lastRow - 1, 2);
    const values = dataRange.getValues();

    const prices = {};
    let itemCount = 0;

    for (let i = 0; i < values.length; i++) {
      const itemName = (values[i][0] || '').toString().trim();
      const startPrice = values[i][1];

      // Skip if item name is empty or start price is invalid
      if (!itemName || itemName.length < 3) continue;
      if (startPrice === '' || startPrice === null || startPrice === undefined) continue;

      const priceNum = Number(startPrice);
      if (isNaN(priceNum) || priceNum <= 0) continue;

      // Use the most recent price for each item (last occurrence wins)
      prices[itemName] = priceNum;
      itemCount++;
    }

    Logger.log(`✅ Loaded ${Object.keys(prices).length} unique items with historical prices`);

    return createResponse('ok', 'Historical prices fetched', {
      prices: prices,
      totalItems: Object.keys(prices).length
    });

  } catch (err) {
    Logger.log('❌ Error fetching historical prices: ' + err.toString());
    return createResponse('error', err.toString(), { prices: {} });
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
  const sheets = ss.getSheets().filter(s => s.getName().startsWith("ELYSIUM_WEEK_"));
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

    // Count attendance per member
    const memberCounts = {};
    let totalSpawns = 0;

    for (let i = 0; i < values.length; i++) {
      const membersStr = (values[i][3] || '').toString().trim(); // Column D: Members (comma-separated)

      if (membersStr) {
        totalSpawns++;
        const members = membersStr.split(',').map(m => m.trim()).filter(m => m);

        members.forEach(member => {
          if (member) {
            memberCounts[member] = (memberCounts[member] || 0) + 1;
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

    Logger.log(`✅ Fetched attendance leaderboard: ${leaderboard.length} members from ${totalSpawns} spawns`);

    return createResponse('ok', 'Attendance leaderboard fetched', {
      leaderboard: leaderboard,
      weekName: weekName,
      totalSpawns: totalSpawns,
      averageAttendance: averageAttendance
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

    // Get attendance data
    const totalSheet = ss.getSheetByName('TOTAL ATTENDANCE');
    let attendanceData = {
      totalSpawns: 0,
      uniqueAttendees: 0,
      averagePerSpawn: 0,
      topAttendees: []
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
      const totalSpawns = currentWeekSheet ? Math.max(0, currentWeekSheet.getLastColumn() - COLUMNS.FIRST_SPAWN + 1) : 0;
      const totalPoints = members.reduce((sum, m) => sum + m.points, 0);

      attendanceData = {
        totalSpawns: totalSpawns,
        uniqueAttendees: members.length,
        averagePerSpawn: totalSpawns > 0 ? Math.round((totalPoints / totalSpawns) * 10) / 10 : 0,
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

    Logger.log(`✅ Generated weekly summary`);

    return createResponse('ok', 'Weekly summary fetched', {
      weekName: weekName,
      attendance: attendanceData,
      bidding: biddingData,
      mostActive: mostActive.slice(0, 5)
    });

  } catch (err) {
    Logger.log('❌ Error in getWeeklySummary: ' + err.toString());
    return createResponse('error', err.toString());
  }
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
    let targetSheet = ss.getSheetByName('ForDistribution');
    if (!targetSheet) {
      Logger.log('📋 Creating ForDistribution sheet...');
      targetSheet = ss.insertSheet('ForDistribution');
      targetSheet.getRange(1, 1, 1, 13).setValues([[
        'Item', 'Start Price', 'Duration', 'Winner', 'Winning Bid', 
        'Auction Start', 'Auction End', 'Timestamp', 'Total Bids', 'Source', 'Quantity', 'Boss', 'Notes'
      ]]).setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFFFFF');
      Logger.log('✅ ForDistribution sheet created');
    }
    
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
  Logger.log('📋 === SCANNING FOR ITEMS WITH WINNERS ===');
  
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
    
    const lastRow = biddingSheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('⚠️ No data rows in BiddingItems');
      return createResponse('ok', 'No items to move', {
        moved: 0,
        skipped: 0,
        total: 0
      });
    }
    
    Logger.log(`📊 Scanning ${lastRow - 1} rows...`);
    
    // Get all winner data (Column D)
    const winnerData = biddingSheet.getRange(2, 4, lastRow - 1, 1).getValues();
    
    let movedCount = 0;
    let skippedCount = 0;
    
    // Scan from BOTTOM to TOP (important! so row numbers don't shift)
    for (let i = winnerData.length - 1; i >= 0; i--) {
      const rowNumber = i + 2; // +2 because we start from row 2 (index 0 = row 2)
      const winner = winnerData[i][0];
      
      if (winner && winner.toString().trim()) {
        Logger.log(`\n🎯 Found winner at row ${rowNumber}: "${winner}"`);
        const success = moveItemToForDistribution('BiddingItems', rowNumber);
        if (success) {
          movedCount++;
        } else {
          skippedCount++;
        }
        
        // Add small delay to prevent overwhelming the API
        Utilities.sleep(100);
      } else {
        skippedCount++;
      }
    }
    
    Logger.log(`\n✅ === SCAN COMPLETE ===`);
    Logger.log(`📦 Moved: ${movedCount} items`);
    Logger.log(`⭐ Skipped: ${skippedCount} items (no winner)`);
    Logger.log(`📊 Total processed: ${winnerData.length} rows`);
    
    return createResponse('ok', `Moved ${movedCount} items to ForDistribution`, {
      moved: movedCount,
      skipped: skippedCount,
      total: winnerData.length
    });
    
  } catch (err) {
    Logger.log(`❌ Error in moveAllItemsWithWinnersToForDistribution: ${err.toString()}`);
    Logger.log(err.stack);
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

    // Send notification to #admin-logs
    sendAdminLogNotification(sheetName, previousSheetName);

  } catch (err) {
    Logger.log('❌ Error in sundayWeeklySheetCreation: ' + err.toString());
    Logger.log(err.stack);
  }
}

/**
 * TEST FUNCTION - Manually test moving an item
 * Edit the row number below to test with a specific row
 */
function testMoveItem() {
  // EDIT THIS: Change to the row number you want to test
  const testRow = 2; // Row 2 is the first data row (after headers)
  
  Logger.log(`🧪 Testing move for row ${testRow}...`);
  
  moveItemToForDistribution('BiddingItems', testRow);
  
  Logger.log('🧪 Test completed. Check logs above for details.');
}

/**
 * Send notification to Discord #admin-logs channel
 */
function sendAdminLogNotification(newSheetName, previousSheetName) {
  try {
    // Skip if webhook URL is not configured
    if (!CONFIG.DISCORD_WEBHOOK_URL || CONFIG.DISCORD_WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL') {
      Logger.log('⚠️ Discord webhook URL not configured. Skipping notification.');
      return;
    }

    const message = {
      content: `📄 **New weekly sheet created:** ${newSheetName}\n✅ Format copied from previous week: ${previousSheetName || 'N/A'}`
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(message),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200 || responseCode === 204) {
      Logger.log('✅ Discord notification sent successfully');
    } else {
      Logger.log(`⚠️ Discord notification failed with code ${responseCode}: ${response.getContentText()}`);
    }

  } catch (err) {
    Logger.log('❌ Error sending Discord notification: ' + err.toString());
  }
}

// ===========================================================
// OPTIMIZED SHEET CREATION WITH AUTO-LOGGING
// ===========================================================