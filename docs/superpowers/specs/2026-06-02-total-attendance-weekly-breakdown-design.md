# Total Attendance Weekly Breakdown Design

> **Goal:** Enhance the TOTAL ATTENDANCE sheet in Google Sheets to show per-week attendance breakdown alongside the running total.

**Architecture:** Single-function modification to `Code.js` (Google Apps Script). Only `updateTotalAttendanceAndMembers()` and `ensureTotalAttendanceSheet()` need changes. No new sheets, no new bot commands. All existing triggers (onEdit, Sunday weekly creation) continue working as-is.

**Tech Stack:** Google Apps Script (Code.js), Google Sheets API

---

## Current State

The TOTAL ATTENDANCE sheet currently has only 2 columns:
- `Member` — member name
- `Total Attendance (Days)` — sum of TRUE checkboxes across ALL weekly sheets

The function `updateTotalAttendanceAndMembers()` (line 2025) iterates all `WEEK_*` sheets, counts checkboxes per member, and writes a flat total.

## Proposed Sheet Layout

| Member | Total Attendance (Days) | 05/25/2026 | 06/01/2026 | 06/07/2026 | 06/14/2026 | ... |
| ------ | ----------------------- | ---------- | ---------- | ---------- | ---------- | --- |
| Alice  | 12                      | 3          | 4          | 2          | 3          | ... |
| Bob    | 8                       | 2          | 1          | 3          | 2          | ... |
| Charlie| 4                       |            | 1          | 0          | 3          | ... |

### Cell Semantics
- **Blank cell** — Member did not exist in that week's sheet (joined later)
- **`0`** — Member existed in that week but attended ZERO spawns
- **`3`** — Member existed and attended 3 spawns

## Column Headers

- Column 1: `Member`
- Column 2: `Total Attendance (Days)`
- Column 3+: One per unique `WEEK_*` sheet, labeled as `MM/DD/YYYY` format (derived from the sheet name `WEEK_yyyyMMdd`)

## Data Flow

On every call to `updateTotalAttendanceAndMembers()`:

1. **Scan all weekly sheets**: Get all sheets matching `WEEK_*` prefix, sorted by date ascending.
2. **Build member list**: Collect all unique member names across all weekly sheets, sorted alphabetically.
3. **Per-week counts**: For each member + each week, count TRUE checkboxes in that week's spawn columns (columns >= COLUMNS.FIRST_SPAWN, typically column 5+).
4. **Blank detection**: If a member's name does NOT appear in a given week's member list (rows 3+), leave the cell blank. If they appear but zero checkboxes, write `0`.
5. **Total column**: Sum of all per-week numbers (blank treated as 0).
6. **Auto-add new week columns**: If a `WEEK_*` sheet exists that doesn't yet have a column in the TOTAL ATTENDANCE sheet, add it.

## Functions Modified

### `updateTotalAttendanceAndMembers()` (line 2025)
- **Before**: Counts all TRUE checkboxes across all weeks → single total per member
- **After**: Counts TRUE checkboxes per week → writes per-week columns + computed total

### `ensureTotalAttendanceSheet()` (line 3786)
- **Before**: Creates headers `[Member, Total Attendance (Days)]`
- **After**: Same initial headers — additional columns are added dynamically by `updateTotalAttendanceAndMembers()`

## Triggers (Unchanged)

All existing triggers continue to work and will call `updateTotalAttendanceAndMembers()` as before:
- `onEdit` — debounced smart trigger on meaningful data changes
- Sunday weekly sheet creation trigger

## Error Handling

- If a weekly sheet has no spawn columns (newly created, empty), treat it as 0 attendance for all members
- If a member name has empty/whitespace-only value, skip it
- The function uses `LockService` (already used elsewhere) if needed to prevent concurrent writes

## Testing Approach

Since this is Google Apps Script, testing is manual:
1. After deployment, verify the TOTAL ATTENDANCE sheet shows correct per-week counts
2. Verify blank cells for new members in past weeks
3. Verify a new weekly sheet auto-adds a column
4. Verify the Total column equals sum of per-week numbers

## Backward Compatibility

- The existing 2-column layout will be extended with new columns on the next `updateTotalAttendanceAndMembers()` run
- No data loss — existing Total Attendance values are replaced by the computed sum (should match)
- No changes to weekly sheets or any other tab
