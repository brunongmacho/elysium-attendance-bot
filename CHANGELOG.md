# Changelog

All notable changes to the ELYSIUM Guild Bot project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [9.0.0] - 2025-11-27 - Fully Optimized Edition

### 🎉 Major Release - Performance & Stability Improvements

This release focuses on performance optimization, code quality improvements, and comprehensive documentation updates.

### Added
- **Channel-Aware Help System v10.0** - Context-sensitive command discovery
  - Smart channel detection (Attendance/Auction/Admin/Guild Chat/Boss Timer)
  - Permission-aware filtering (admins see admin commands, members see member commands)
  - Category grouping and clear usage examples
- **Enhanced Graceful Shutdown** - Comprehensive resource cleanup on exit
  - Removes all event listeners to prevent memory leaks
  - 30-second timeout with forced shutdown fallback
  - State persistence before shutdown
  - Step-by-step shutdown logging
- **Configuration Validation** - Early validation of all required config fields
  - Validates Discord IDs, roles, and webhook URLs at startup
  - Clear error messages for missing or invalid configuration
  - Prevents late failures during bot operation
- **Boss Thumbnails** - Visual improvements to all boss-related messages
  - Embedded thumbnails for better visual identification
  - Converted plain text messages to rich embeds
  - Case-insensitive boss thumbnail lookup
- **Zero-Attendee Handling** - Graceful handling of empty attendance threads
  - Prevents Google Sheets API errors when closing threads with 0 members
  - Clear warning messages to admins
  - Proper thread state cleanup

### Changed
- **Dependencies Updated**
  - `discord.js`: 14.11.0 → 14.25.1 (14 versions newer)
  - `fast-levenshtein`: 2.0.6 → 3.0.0
  - `node-fetch`: 2.6.7 → 3.3.2
  - All dependencies now use caret ranges (^) for automatic minor updates
- **Documentation Overhaul**
  - README.md: Accurate metrics (57,000+ lines, 51 modules)
  - Fixed PORT documentation (8000, not 3000)
  - Added Channel-Aware Help System section
  - Enhanced architecture documentation with file line counts
  - Clarified dependency versions and upgrade paths
  - package.json version: 1.0.0 → 9.0.0
- **Event Times Updated** - Individual, Coop, and GvG events shifted +1 hour
- **Maintenance Command Enhanced** - Creates immediate threads for all timer-based bosses

### Fixed
- **Close Command Errors** - Fixed errors when closing attendance threads with zero attendees
  - `!close` button handler now validates member count
  - `!forceclose` command now validates member count
  - Proper warning messages and state cleanup
- **!predictspawn Command** - Fixed null handling for scheduled bosses
  - Handles null `lastSpawnTime` gracefully
  - Handles null `avgIntervalHours` for scheduled bosses
  - Handles null `killTime` for scheduled bosses
- **Rotation System** - Fixed undefined rotation.guilds error in `!rotation status`
- **Emergency Command Buttons** - Added error handling to button interactions
- **Duplicate Detection** - Prevented false duplicate detection in closeall and close commands
- **Maintenance Rate Limiting** - Single API call to clear timer-based bosses
- **CrashRecovery Errors** - Resolved state restoration errors on startup
- **NoSpawn Threads** - Prevented auto-submission after 30 minutes

### Performance
- **API Call Reduction** - Skip duplicate column checks for maintenance threads
- **Optimized Close Operations** - Batch processing for bulk thread closures

---

## [8.1.0] - 2025-11-26

### Added
- **Auto-Populate Tallies** - Automatically fills blank tally entries with 0
  - Existing members get 0 for missing entries
  - New members get previous tallies populated with 0
- **Scheduled Bosses** - Added Icaruthia, Motti, and Nevaeh timer-based bosses

### Fixed
- **Duplicate Attendance Threads** - Prevented duplicates for scheduled bosses

---

## [8.0.0] - 2025-11-25

### Major Features
- Complete rewrite of auction system
- Enhanced leaderboard functionality
- Improved state persistence
- Advanced error handling

---

## [7.x] - Historical Releases

For detailed information about versions 1.0 through 7.x, please refer to the git commit history:

```bash
git log --oneline --all --graph
```

---

## Version Comparison

| Version | Lines of Code | Modules | Key Feature |
|---------|---------------|---------|-------------|
| 9.0.0   | ~57,320      | 51      | Channel-Aware Help, Optimization |
| 8.1.0   | ~56,500      | 50      | Auto-Populate Tallies |
| 8.0.0   | ~55,000      | 48      | Auction Rewrite |
| 7.x     | ~50,000      | 45      | Leaderboard System |

---

## Migration Guide

### Upgrading to 9.0.0

**Breaking Changes:**
- None - This release is fully backward compatible

**New Features to Enable:**
- Use `!help` in different channels to see context-aware help
- Boss thumbnails appear automatically in all boss messages

**Configuration:**
- No changes required to existing `config.json`
- Bot now validates configuration on startup
- If validation fails, check error messages for missing fields

**Dependencies:**
- Run `npm install` to update to latest versions
- Discord.js v14.25.1 is backward compatible with v14.11.0
- fast-levenshtein v3.0.0 is backward compatible with v2.0.6
- node-fetch v3.3.2 requires minor code changes (already implemented)

---

## Upcoming Features (Roadmap)

### Planned for 10.0.0
- [ ] Comprehensive test suite expansion
- [ ] ESLint/Prettier integration
- [ ] Pre-commit hooks with Husky
- [ ] Async file operations migration
- [ ] Standardized error handling across all modules

### Under Consideration
- [ ] Refactor index2.js into smaller modules
- [ ] Database integration (PostgreSQL/MongoDB) as alternative to Google Sheets
- [ ] Multi-server support
- [ ] Advanced analytics dashboard

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
