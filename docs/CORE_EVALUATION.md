# ELYSIUM Core Member Evaluation System

## Overview

The Core Member Evaluation System tracks guild member CP (Combat Power) growth over 2-week evaluation cycles and selects the Top 5 Core members based on their Final Score.

---

## Timeline Flow

```
Push Code → Bot Start → Sunday 11:50PM Reminder → Monday 12:00AM Thread Created
    ↓
Monday 12:00AM - 11:59PM: Members submit !CP + Screenshot
    ↓
Tuesday 12:00AM: Thread Locked → Reminder Deleted → Congrats Report Sent
    ↓
(Two weeks later... next cycle)
```

---

## Commands

### Member Command
```
!CP <number> [with screenshot]

Examples:
!CP 90492
!CP 90,492
```

- Case insensitive
- Requires screenshot from Guild Member List in-game
- Screenshot must match the CP number submitted
- CP cannot be lower than previous submission
- One entry per member per cycle (latest overwrites)

### Slash Command
```
/CP <number>
```
(Redirects member to use !CP in thread with screenshot)

---

## Cycle System

| Cycle | Phase | Description |
|-------|-------|-------------|
| 1 | Current CP | First submission → Starting CP |
| 2 | Current CP | Second submission → Ending CP → Eligible for Core |
| 3 | Current CP | Previous Ending → New Starting |
| ... | ... | Continues alternating |

### New Member Rules
- **Cycle 1**: First submission = Starting CP (not eligible yet)
- **Cycle 2**: Second submission = Ending CP → Eligible
- **Missing a cycle**: RESET - fresh start from their submitted CP

---

## Google Sheets Structure

### Tab Naming
Each cycle gets its own tab:
- `Cycle 1`, `Cycle 2`, `Cycle 3`, etc.

### Columns
| Col | Column Name | Description |
|-----|-------------|-------------|
| A | Member Name | Discord nickname |
| B | Starting CP | Starting CP for the cycle |
| C | Ending CP | Ending CP for the cycle |
| D | Attendance | Manual entry (0-8 events) |
| E | CP Growth % | Auto-calculated |
| F | Bracket | Auto: C (≤84,999), B (85,000-99,999), A (≥100,000) |
| G | Bracket Avg Growth % | Auto-calculated (avg for bracket) |
| H | Relative Growth % | Auto-calculated |
| I | CP Points | Auto: 0-30 based on Relative Growth |
| J | Attendance Points | Auto: 0-70 based on Attendance |
| K | Final Score | Auto: CP Points + Attendance Points |
| L | Core Eligible | Auto: Yes if Attendance ≥5 |
| M | Selected Core | Ranking (1-5) for Top 5, else blank |

---

## Calculations

### CP Growth %
```
CP Growth % = (Ending CP − Starting CP) ÷ Starting CP × 100
```

### Bracket (Based on Starting CP)
- **C**: ≤ 84,999
- **B**: 85,000 – 99,999
- **A**: ≥ 100,000

### Bracket Average Growth %
```
Average of CP Growth % for all members in the same bracket
```

### Relative Growth %
```
Relative Growth % = (CP Growth % ÷ Bracket Average Growth %) × 100
```

### CP Points (Based on Relative Growth %)
| Relative Growth % | Points |
|-------------------|--------|
| ≥120 | 30 |
| 110-119 | 25 |
| 100-109 | 20 |
| 90-99 | 15 |
| 80-89 | 10 |
| <80 | 0 |

### Attendance Points (Based on Attendance)
| Attendance | Points |
|------------|--------|
| 8 | 70 |
| 7 | 60 |
| 6 | 50 |
| 5 | 40 |
| <5 | 0 |

### Final Score
```
Final Score = CP Points + Attendance Points
```

### Core Eligibility
```
Core Eligible = Yes if Attendance ≥ 5
```

### Selected Core
- Top 5 members by Final Score who are Core Eligible
- Ranked 1-5 in the Selected Core column
- Highlighted in gold in the sheet

---

## Scheduled Events

| Day | Time | Event |
|-----|------|-------|
| Sunday | 11:50 PM | Reminder posted (10 min before thread) |
| Monday | 12:00 AM | Thread created |
| Monday | 11:59 PM | Thread still open |
| Tuesday | 12:00 AM | Thread locked & archived → Reminder deleted → Congrats report sent |

---

## Deployment Commands

### Discord Bot
```bash
# Regular deployment (attendance system)
npm run deploy

# Core evaluation deployment
npm run deploy:core
```

### Google Apps Script
The core.js file is pushed to the Core Evaluation Google Sheet via `npm run deploy:core`.

---

## Data Flow

```
Discord Member (!CP + Screenshot)
    ↓
MongoDB (coreEvaluation collection)
    ↓
5 min idle check → Sync to Google Sheets
    ↓
Google Sheet (auto-calculates all stats)
    ↓
Tuesday Report (fetches from Sheet for Top 5)
```

---

## Files

| File | Purpose |
|------|---------|
| `core.js` | Google Apps Script for sheet calculations |
| `core-evaluation.js` | Discord bot module for CP submission |
| `.clasp.core.json` | Config for core deployment |
| `package.json` | Added `deploy:core` scripts |

---

## Configuration

### Google Sheet URLs
- **Attendance Sheet**: `16YAifAwB6cT-K1mLfXpW9-hBvB9KIOotnERWp8i9t4EbU7BlEABh4tTB`
- **Core Evaluation Sheet**: `AKfycbx4SWRJBQVz2vRndf7Wn7Cb-abqY02_Llwz8M5b2X_oHFavKdxsaoYC4PPUdjkmZfkldQ`

### Discord Channel
- Bot Commands: `1431640753238442014`

---

## Known Limitations

1. **Screenshot Verification**: Bot does not verify screenshot authenticity. Manual review recommended.
2. **Attendance**: Manually entered in Google Sheet (not synced from attendance system).
3. **No Auto-lock**: Thread stays open until Monday 11:59 PM (manual close at Tuesday 12:00 AM).

---

## Support

For issues or questions, refer to:
- Bot logs in console
- Google Apps Script logs in Apps Script dashboard
- MongoDB `coreEvaluation` and `coreEvaluationState` collections
