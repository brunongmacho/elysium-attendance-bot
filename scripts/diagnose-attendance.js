/**
 * Diagnostic script to check how many attendance records Google Sheets API returns
 */

const { SheetAPI } = require('../utils/sheet-api');
const config = require('../config.json');

async function diagnose() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 ATTENDANCE DATA DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const sheetAPI = new SheetAPI(config.sheet_webhook_url);

  try {
    console.log('📥 Fetching attendance from Google Sheets API...');
    console.log('🔄 Force fetching (bypassing cache)...');
    const response = await sheetAPI.call('getAllWeeklyAttendance', { forceFresh: true });

    console.log('');
    console.log('📊 RESULTS:');
    console.log('─────────────────────────────────────────────────────────────');

    if (!response) {
      console.log('❌ No response from API');
      return;
    }

    // Handle both array response (new) and wrapper object response (old/cached)
    let attendanceRecords = [];

    if (Array.isArray(response)) {
      // New format: direct array
      attendanceRecords = response;
      console.log('✅ Received direct array response (new format)');
    } else if (response.status === 'ok' && Array.isArray(response.sheets)) {
      // Old format: wrapper object (cached or old function)
      console.log('⚠️  Received wrapper object response (old format or cached)');
      if (response.sheets.length === 0) {
        console.log('❌ Empty sheets array - no data found!');
        console.log('');
        console.log('💡 Possible causes:');
        console.log('   1. Google Apps Script not updated with new function');
        console.log('   2. No sheets named "ELYSIUM_WEEK_*" found');
        console.log('   3. Sheets are empty (no attendance data)');
        console.log('   4. COLUMNS.FIRST_SPAWN constant issue');
        return;
      }
      // Old format returned column metadata, not attendance records
      console.log('⚠️  Old function format detected - need to update Google Apps Script!');
      return;
    } else {
      console.log('⚠️ Unexpected response format');
      console.log('Response type:', typeof response);
      console.log('Response:', JSON.stringify(response, null, 2).substring(0, 500));
      return;
    }

    console.log(`✅ Total records returned: ${attendanceRecords.length}`);
    console.log('');

    // Group by boss
    const byBoss = {};
    attendanceRecords.forEach(record => {
      const boss = record.bossName || 'Unknown';
      byBoss[boss] = (byBoss[boss] || 0) + 1;
    });

    console.log('📈 Records by Boss:');
    Object.entries(byBoss)
      .sort((a, b) => b[1] - a[1])
      .forEach(([boss, count]) => {
        console.log(`   ${boss}: ${count} records`);
      });

    console.log('');

    // Group by member
    const byMember = {};
    attendanceRecords.forEach(record => {
      const member = record.memberName || 'Unknown';
      byMember[member] = (byMember[member] || 0) + 1;
    });

    console.log('👥 Unique members:', Object.keys(byMember).length);
    console.log('');

    // Show first 5 records as sample
    console.log('📋 Sample records (first 5):');
    attendanceRecords.slice(0, 5).forEach((record, i) => {
      console.log(`   ${i + 1}. ${record.memberName} - ${record.bossName} - ${record.date || record.timestamp}`);
    });

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ DIAGNOSTIC COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📌 EXPECTED: 1,000-3,000 records (for 7 weeks of data)');
    console.log(`📌 ACTUAL: ${attendanceRecords.length} records`);
    console.log('');

    if (attendanceRecords.length < 500) {
      console.log('⚠️  WARNING: Record count is very low!');
      console.log('   Possible issues:');
      console.log('   1. Google Sheets API is limiting the response');
      console.log('   2. ELYSIUM_WEEK_* sheets have less data than expected');
      console.log('   3. Sheet structure doesn\'t match expected format');
      console.log('');
      console.log('💡 SOLUTION: Check your Google Sheets manually:');
      console.log('   - Count total attendance rows across all 7 sheets');
      console.log('   - Verify sheet names start with "ELYSIUM_WEEK_"');
      console.log('   - Check if data is in expected columns');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

diagnose();
