# 🎯 Unified Milestone & Proactive Intelligence Schedule

## 📅 **Normalized Announcement Schedule**

All times in **GMT+8 (Manila Time)**

### **Daily 3:01 AM** - Daily Batch Announcements & Checks
**What Happens:**
1. ✅ **All Milestone Batch Announcements** (queued from previous day)
   - Attendance milestones (100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000)
   - Bidding milestones (200, 500, 1000, 1500, 2000, 3000, 4000, 6000, 10000, 15000, 20000)
   - Engagement score milestones (60, 70, 80, 85, 90, 95, 100)
   - Guild-wide milestones (10k, 25k, 50k, 100k attendance | 15k, 30k, 60k, 120k bidding | 20, 30, 40, 45, 50 active)
   - Streak milestones (consecutive spawns, calendar days)
   - Tenure milestones (30, 60, 90, 180, 365, 730, 1095 days)

2. ✅ **Daily Checks**
   - Calendar day streak check (5+ spawns yesterday = +1 day)
   - Tenure milestone check
   - Anomaly detection digest (moved from 6 PM)

**Destination:** Guild Announcements / Guild Chat (milestones), Admin Logs (anomalies)

---

### **Monday 3:01 AM** - Weekly Engagement Digest
**What Happens:**
- Engagement analysis (at-risk members, guild health)
- Sent to **Admin Logs** for leadership review

---

### **Saturday 10:00 AM** - Pre-Auction Readiness Check
**What Happens:**
- Check guild readiness 2 hours before auction (Saturday 12 PM)
- Alert if <70% members have 100+ points
- Sent to **Admin Logs**

**Note:** Kept at specific time (auction-related)

---

### **Sunday 8:00 PM** - Weekly Summary with Milestone Recap
**What Happens:**
1. Guild performance summary
2. Top 5 performers
3. **NEW: Milestone recap** (all milestones achieved this week)
4. Motivational message

**Destination:** Guild Announcements

---

### **Sunday 11:59 PM** - Perfect Attendance Week Check
**What Happens:**
- Check who attended 100% of spawns this week (Mon 3:01 AM to Sun 11:59 PM)
- Queue for next day's 3:01 AM batch announcement

---

### **On Attendance Verification** - Consecutive Spawn Streak Check
**What Happens:**
- When member attendance is verified, check if they attended previous spawn
- If yes: increment streak
- If no: reset to 1
- Queue milestone for next day's 3:01 AM batch

---

## 🎨 **Milestone Batching System**

### **Queue Structure**
```javascript
milestoneQueue = {
  attendance: [
    { nickname: 'John', milestone: 1000, totalPoints: 1034, type: 'attendance' }
  ],
  bidding: [
    { nickname: 'Jane', milestone: 2000, totalPoints: 2145, type: 'bidding' }
  ],
  engagement: [
    { nickname: 'Bob', milestone: 80, score: 82, type: 'engagement' }
  ],
  guildWide: [
    { milestoneType: 'attendance', threshold: 10000, totalValue: 10234 }
  ],
  spawnStreak: [
    { nickname: 'John', milestone: 50, streak: 52, type: 'consecutive_spawn' }
  ],
  calendarStreak: [
    { nickname: 'Jane', milestone: 14, streak: 15, type: 'calendar_day' }
  ],
  tenure: [
    { nickname: 'Bob', milestone: 365, days: 370, type: 'tenure' }
  ],
  perfectWeek: [
    { nickname: 'Alice', milestone: 5, weeks: 5, type: 'perfect_week' }
  ]
};
```

### **Batch Announcement Flow**
1. Throughout the day: Milestones detected → added to queue
2. 3:01 AM: Process entire queue
3. Group by milestone type and threshold
4. Create grouped embeds (multiple achievers per milestone)
5. Send to appropriate channels
6. Clear queue
7. Store milestone recap for weekly report

---

## 📊 **Milestone Thresholds**

### **Attendance Points** (1 point per spawn)
- **Minor (Guild Chat):** 100, 250, 500, 750
- **Major (Announcements):** 1000, 1500, 2000, 3000, 5000, 7500, 10000

### **Bidding Points** (boss points × attendance)
- **Minor (Guild Chat):** 200, 500, 1000, 1500
- **Major (Announcements):** 2000, 3000, 4000, 6000, 10000, 15000, 20000

### **Engagement Score** (AI-calculated 0-100)
- **Minor (Guild Chat):** 60, 70, 80
- **Major (Announcements):** 85, 90, 95, 100

### **Guild-Wide Collective**
- **Attendance Total:** 10,000 | 25,000 | 50,000 | 100,000
- **Bidding Total:** 15,000 | 30,000 | 60,000 | 120,000
- **Active Members:** 20 | 30 | 40 | 45 | 50

### **Consecutive Spawn Streak** (attend every spawn)
- **Minor (Guild Chat):** 10, 25, 50
- **Major (Announcements):** 75, 100, 150, 200

### **Calendar Day Streak** (5+ spawns per day)
- **Minor (Guild Chat):** 7, 14, 21, 30
- **Major (Announcements):** 45, 60, 90, 180

### **Tenure** (days as member)
- **Minor (Guild Chat):** 30, 60, 90, 180
- **Major (Announcements):** 365, 730, 1095

### **Perfect Attendance Week** (100% spawns in week)
- **Minor (Guild Chat):** 1, 3, 5
- **Major (Announcements):** 10, 20, 30

---

## 🗄️ **Google Sheets Storage**

### **New Tabs (Auto-Created if Missing)**

#### **AttendanceStreaks** (Hidden)
```
Columns:
- nickname
- consecutiveSpawnStreak
- longestSpawnStreak
- lastSpawnDate
- lastSpawnStreakMilestone
- calendarDayStreak
- longestCalendarStreak
- lastCalendarStreakCheck
- lastCalendarStreakMilestone
- perfectWeeksCount
- lastPerfectWeekDate
- lastPerfectWeekMilestone
```

#### **GuildMilestones** (Hidden)
```
Columns:
- milestoneType (attendance/bidding/activeMembers)
- threshold
- achievedDate
- totalValue
- announced (TRUE/FALSE)
```

#### **WeeklyMilestoneLog** (Hidden)
```
Columns:
- weekStartDate
- weekEndDate
- milestoneType
- nickname (or 'Guild' for guild-wide)
- milestone
- value
- announcedDate
```

### **Enhanced Existing Tabs**

#### **MilestoneHistory** (existing, add columns)
```
NEW Columns:
- lastEngagementMilestone
```

#### **AttendanceTracker** (existing, add columns)
```
NEW Columns:
- memberSinceDate (earliest attendance date)
- lastTenureMilestone
```

---

## 🔧 **Apps Script Functions to Add**

### **Code.gs - Sheet Tab Creation**
```javascript
/**
 * Create milestone tracking tabs if they don't exist
 * Called automatically on first milestone check
 */
function ensureMilestoneTabsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create AttendanceStreaks if missing
  let streaksSheet = ss.getSheetByName('AttendanceStreaks');
  if (!streaksSheet) {
    streaksSheet = ss.insertSheet('AttendanceStreaks');
    streaksSheet.hideSheet();
    streaksSheet.appendRow([
      'nickname', 'consecutiveSpawnStreak', 'longestSpawnStreak', 'lastSpawnDate',
      'lastSpawnStreakMilestone', 'calendarDayStreak', 'longestCalendarStreak',
      'lastCalendarStreakCheck', 'lastCalendarStreakMilestone', 'perfectWeeksCount',
      'lastPerfectWeekDate', 'lastPerfectWeekMilestone'
    ]);
    streaksSheet.getRange('1:1').setFontWeight('bold');
  }

  // Create GuildMilestones if missing
  let guildSheet = ss.getSheetByName('GuildMilestones');
  if (!guildSheet) {
    guildSheet = ss.insertSheet('GuildMilestones');
    guildSheet.hideSheet();
    guildSheet.appendRow(['milestoneType', 'threshold', 'achievedDate', 'totalValue', 'announced']);
    guildSheet.getRange('1:1').setFontWeight('bold');
  }

  // Create WeeklyMilestoneLog if missing
  let logSheet = ss.getSheetByName('WeeklyMilestoneLog');
  if (!logSheet) {
    logSheet = ss.insertSheet('WeeklyMilestoneLog');
    logSheet.hideSheet();
    logSheet.appendRow(['weekStartDate', 'weekEndDate', 'milestoneType', 'nickname', 'milestone', 'value', 'announcedDate']);
    logSheet.getRange('1:1').setFontWeight('bold');
  }

  // Add columns to existing MilestoneHistory
  const historySheet = ss.getSheetByName('MilestoneHistory');
  if (historySheet) {
    const headers = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
    if (!headers.includes('lastEngagementMilestone')) {
      historySheet.getRange(1, historySheet.getLastColumn() + 1).setValue('lastEngagementMilestone');
    }
  }

  // Add columns to AttendanceTracker
  const trackerSheet = ss.getSheetByName('AttendanceTracker');
  if (trackerSheet) {
    const headers = trackerSheet.getRange(1, 1, 1, trackerSheet.getLastColumn()).getValues()[0];
    if (!headers.includes('memberSinceDate')) {
      trackerSheet.getRange(1, trackerSheet.getLastColumn() + 1).setValue('memberSinceDate');
    }
    if (!headers.includes('lastTenureMilestone')) {
      trackerSheet.getRange(1, trackerSheet.getLastColumn() + 1).setValue('lastTenureMilestone');
    }
  }

  return { success: true, message: 'All milestone tabs created/verified' };
}

/**
 * Get streak data for a member
 */
function getStreakData(e) {
  const nickname = e.parameter.nickname;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AttendanceStreaks');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'AttendanceStreaks sheet not found',
      data: null
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const nicknameCol = headers.indexOf('nickname');

  // Find member row
  for (let i = 1; i < data.length; i++) {
    if (data[i][nicknameCol] === nickname) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = data[i][idx];
      });
      return ContentService.createTextOutput(JSON.stringify({
        error: null,
        data: row
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Not found, return defaults
  return ContentService.createTextOutput(JSON.stringify({
    error: null,
    data: {
      nickname,
      consecutiveSpawnStreak: 0,
      longestSpawnStreak: 0,
      lastSpawnDate: null,
      lastSpawnStreakMilestone: 0,
      calendarDayStreak: 0,
      longestCalendarStreak: 0,
      lastCalendarStreakCheck: null,
      lastCalendarStreakMilestone: 0,
      perfectWeeksCount: 0,
      lastPerfectWeekDate: null,
      lastPerfectWeekMilestone: 0
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update streak data for a member
 */
function updateStreakData(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AttendanceStreaks');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'AttendanceStreaks sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData[0];
  const nicknameCol = headers.indexOf('nickname');

  // Find or create row
  let rowIndex = -1;
  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][nicknameCol] === data.nickname) {
      rowIndex = i + 1; // 1-indexed
      break;
    }
  }

  if (rowIndex === -1) {
    // Append new row
    const newRow = headers.map(h => data[h] || '');
    sheet.appendRow(newRow);
  } else {
    // Update existing row
    headers.forEach((header, idx) => {
      if (data[header] !== undefined) {
        sheet.getRange(rowIndex, idx + 1).setValue(data[header]);
      }
    });
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: null,
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get guild-wide milestone status
 */
function getGuildMilestones(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GuildMilestones');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: null,
      data: []
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const milestones = [];

  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = data[i][idx];
    });
    milestones.push(row);
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: null,
    data: milestones
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Record guild milestone achievement
 */
function recordGuildMilestone(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GuildMilestones');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'GuildMilestones sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([
    data.milestoneType,
    data.threshold,
    new Date().toISOString(),
    data.totalValue,
    true
  ]);

  return ContentService.createTextOutput(JSON.stringify({
    error: null,
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Log milestone for weekly recap
 */
function logWeeklyMilestone(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WeeklyMilestoneLog');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'WeeklyMilestoneLog sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([
    data.weekStartDate,
    data.weekEndDate,
    data.milestoneType,
    data.nickname,
    data.milestone,
    data.value,
    new Date().toISOString()
  ]);

  return ContentService.createTextOutput(JSON.stringify({
    error: null,
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get this week's milestone achievements for recap
 */
function getWeeklyMilestones(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WeeklyMilestoneLog');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      error: null,
      data: []
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const now = new Date();

  // Calculate start of current week (Monday 3:01 AM)
  const weekStart = new Date(now);
  weekStart.setHours(3, 1, 0, 0);
  const dayOfWeek = weekStart.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysToMonday);

  const milestones = [];
  const announcedDateCol = headers.indexOf('announcedDate');

  for (let i = 1; i < data.length; i++) {
    const announcedDate = new Date(data[i][announcedDateCol]);
    if (announcedDate >= weekStart) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = data[i][idx];
      });
      milestones.push(row);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: null,
    data: milestones
  })).setMimeType(ContentService.MimeType.JSON);
}
```

---

## 🎉 **Benefits of Unified System**

1. **Predictable Schedule** - Members know when to expect announcements (3:01 AM)
2. **Reduced Spam** - Batch announcements instead of scattered throughout day
3. **Better Logging** - Weekly milestone recap for easy reference
4. **Aligned with Game** - 3:01 AM matches server reset time
5. **Admin-Friendly** - All admin alerts consolidated
6. **Performance** - Fewer API calls (daily instead of hourly)
7. **Maintainable** - Centralized milestone logic

---

## 📝 **Implementation Checklist**

- [ ] Add Apps Script functions to Code.gs
- [ ] Create milestone queue system in proactive-intelligence.js
- [ ] Modify existing milestone checks to queue instead of announce
- [ ] Add 6 new milestone types (engagement, guild-wide, streaks, tenure, perfect week)
- [ ] Update cron schedules to normalized times
- [ ] Add milestone recap to weekly summary
- [ ] Test all milestone types
- [ ] Deploy and monitor

