# Command System Audit - Issues Found and Fixes

## Issues Found

### 1. **Auction Command Mismatches**
- Help system documents `!auction` but handler is `!startauction` - no alias exists
- Help system documents `!pauseauction` but handler is `!pause` - no alias exists
- Help system documents `!resumeauction` but handler is `!resume` - no alias exists

**Fix:** Add aliases in COMMAND_ALIASES

### 2. **Intelligence Command Conflicts**
- Help system says `!analyze @member` for single member engagement analysis
- But COMMAND_ALIASES maps `!analyze` to `!analyzeengagement` (ALL members)
- The actual handler for single member is `engagement`

**Conflict:** `!analyze` should be for single member, not all members

**Fix:**
- Change `!analyze` alias to map to `!engagement` (single member)
- Add new alias `!analyzeall` to map to `!analyzeengagement` (all members)

### 3. **Emergency Commands Structure Mismatch**
- Help system documents standalone commands:
  - `!forceclosethread` (!fct)
  - `!forcecloseallthreads` (!fcat)
  - `!forceendauction` (!fea)
  - `!unlockallpoints` (!unlock)
  - `!clearallbids` (!clearbids)
  - `!diagnostics` (!diag)
  - `!forcesync` (!fsync)

- But actual implementation uses subcommands:
  - `!emergency close`
  - `!emergency closeall`
  - `!emergency endauction`
  - `!emergency unlock`
  - `!emergency clearbids`
  - `!emergency diag`
  - `!emergency sync`

**Fix:** Create standalone command handlers for each emergency command with proper aliases

### 4. **Missing Aliases**
- `!predictattendance` - needs short alias like `!predatt`
- `!analyzequeue` - needs alias `!auctionqueue` or `!aq`

### 5. **Commands Not in Help System**
The following commands exist but are not documented in help-system.js:
- `!debugthread` - debug spawn thread state
- `!closeallthread` - close all spawn threads
- `!startauctionnow` - bypass cooldown
- `!queuelist` - view auction queue
- `!forcesubmitresults` - force submit auction results
- `!endauction` - end current auction session
- `!maintenance` - create maintenance spawn threads
- `!removemember` - remove member from sheets
- `!recommendations` - AI recommendations
- `!performance` - system performance metrics
- `!predictattendance` - predict member attendance
- `!predictspawn` - predict next spawn time

**Fix:** Add all missing commands to help system

## Summary of Changes Needed

### 1. index2.js - COMMAND_ALIASES
```javascript
// Add/fix these aliases:
"!auction": "!startauction",
"!pauseauction": "!pause",
"!resumeauction": "!resume",
"!analyze": "!engagement",  // FIX: was !analyzeengagement
"!analyzeall": "!analyzeengagement",  // NEW
"!guildanalyze": "!analyzeengagement",  // keep this
"!forceclosethread": "!forceclosethread",  // NEW standalone
"!fct": "!forceclosethread",  // NEW
"!forcecloseallthreads": "!forcecloseallthreads",  // NEW standalone
"!fcat": "!forcecloseallthreads",  // NEW
"!forceendauction": "!forceendauction",  // NEW standalone
"!fea": "!forceendauction",  // NEW
"!unlockallpoints": "!unlockallpoints",  // NEW standalone
"!unlock": "!unlockallpoints",  // NEW
"!clearallbids": "!clearallbids",  // NEW standalone
"!clearbids": "!clearallbids",  // NEW
"!diagnostics": "!diagnostics",  // NEW standalone
"!diag": "!diagnostics",  // NEW
"!forcesync": "!forcesync",  // NEW standalone
"!fsync": "!forcesync",  // NEW
"!predatt": "!predictattendance",  // NEW
"!aq": "!analyzequeue",  // NEW
"!auctionqueue": "!analyzequeue",  // NEW
```

### 2. index2.js - commandHandlers
Add standalone emergency command handlers:
- `forceclosethread`
- `forcecloseallthreads`
- `forceendauction`
- `unlockallpoints`
- `clearallbids`
- `diagnostics`
- `forcesync`

### 3. help-system.js - COMMANDS
Fix command names and add missing commands:
- Fix `auction` -> keep as `auction` but ensure alias works
- Fix `pauseauction` -> keep as `pauseauction` but ensure alias works
- Fix `resumeauction` -> keep as `resumeauction` but ensure alias works
- Fix `analyze` -> keep for single member, add `analyzeall` for all members
- Add emergency commands as standalone (not subcommands)
- Add all missing commands to appropriate categories

## Priority Fixes

1. **HIGH**: Fix `!analyze` conflict (currently broken for single member analysis)
2. **HIGH**: Add aliases for auction commands (!auction, !pauseauction, !resumeauction)
3. **MEDIUM**: Create standalone emergency command handlers
4. **LOW**: Add missing commands to help system
5. **LOW**: Add convenience aliases for long commands
