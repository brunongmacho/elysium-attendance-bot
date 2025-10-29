# Elysium Guild Attendance & Auction Bot

A comprehensive Discord bot for managing guild boss spawn attendance tracking and item auction system with Google Sheets integration.

![Status](https://img.shields.io/badge/status-production-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🌟 Features

### 📊 Attendance System
- **Thread-based Check-ins**: Automatic thread creation for each boss spawn
- **Screenshot Verification**: Requires screenshot proof for non-admin members
- **Google Sheets Integration**: Auto-populates attendance columns with timestamps
- **Week-based Tracking**: Organizes data by week (Sunday-based)
- **State Recovery**: Recovers attendance state from existing threads on bot restart
- **Validation Sweeps**: Three-tier validation to ensure data consistency

### 🎯 Auction System
- **Boss-linked Auctions**: Items grouped by boss spawn with attendance requirements
- **Smart Bidding**: Only members who attended the boss spawn can bid on its items
- **Thread-per-Item**: Each auction item gets its own Discord thread
- **Bid Confirmation**: Requires emoji confirmation to prevent accidental bids
- **Last-minute Extensions**: Extends auction by 1 minute when bids placed in final 60 seconds (max 15 extensions)
- **Points Management**: Tracks bidding points with lock/unlock mechanism
- **Automated Results**: Submits winners and points to Google Sheets

### 🔧 Admin Features
- **State Management**: Save/load auction state to/from Google Sheets
- **Force Submit**: Manually submit auction results
- **Pause/Resume**: Control auction flow
- **Emergency Stop**: End auctions immediately with !endauction
- **Queue Management**: Preview and manage auction queue
- **Validation Tools**: SWEEP commands to verify data integrity

---

## 📋 Command Reference

### 🛡️ Admin Commands (Admin Logs Channel Only)

| Command | Description |
|---------|-------------|
| `!startauction` | Start auction session with confirmation |
| `!startauctionnow` | Start auction immediately (bypasses cooldown) |
| `!endauction` | End auction session immediately and submit results |
| `!maintenance` or `!maint` | Create spawn threads for all 22 maintenance bosses at once |
| `!queuelist` | Show auction queue preview |
| `!forcesubmitresults` | Force submit auction results to sheets |
| `!addthread <boss> (timestamp)` | Create attendance thread manually |
| `!closethread` | Close current attendance thread |
| `!sweep1` | Validate thread existence and column creation |
| `!sweep2` | Load attendance state from Google Sheets |
| `!sweep3` | Full state consistency validation |
| `!clearstate` | Clear bot state (emergency use only) |
| `!status` | Show bot status and uptime |

### 🧵 Thread Commands (Auction Threads Only)

| Command | Description |
|---------|-------------|
| `!pause` | Pause current auction |
| `!resume` | Resume paused auction |
| `!stop` | Stop current item immediately |
| `!extend <minutes>` | Extend current auction time |

### 💰 Bidding Commands (Auction Threads Only)

| Command | Description |
|---------|-------------|
| `!bid <amount>` | Place bid (requires attendance) |
| `!b <amount>` | Shorthand for !bid |

### 👤 Member Commands (Bidding Channel)

| Command | Description |
|---------|-------------|
| `!mypoints` | Check your bidding points |
| `!bidstatus` | View current auction status |

### ✅ Check-in Commands (Spawn Threads Only)

| Keyword | Description |
|---------|-------------|
| `present` | Check in to boss spawn |
| `here` | Check in to boss spawn |
| `join` | Check in to boss spawn |
| `checkin` | Check in to boss spawn |
| `check-in` | Check in to boss spawn |

*Note: Screenshot attachment required for non-admin members*

---

## 📁 Project Structure

```
elysium-attendance-bot/
├── index2.js              # Main bot entry point
├── attendance.js          # Attendance tracking module
├── bidding.js             # Bidding system module
├── auctioneering.js       # Auction management module
├── loot-system.js         # Loot distribution module
├── help-system.js         # Help command system
├── utils/                 # Utility modules
│   ├── embed-builder.js   # Discord embed utilities
│   ├── time-utils.js      # Time formatting & parsing
│   ├── discord-utils.js   # Discord API helpers
│   └── common.js          # Shared utilities
├── tests/                 # Test suite
│   ├── automated-tests.js # Automated unit tests
│   └── test-scenarios.md  # Manual test scenarios
├── docs/                  # Documentation
│   └── OPTIMIZATION.md    # Performance & optimization guide
└── config.json            # Bot configuration
```

---

## 🧪 Testing

### Run Automated Tests
```bash
node tests/automated-tests.js
```

**Test Coverage:**
- ✅ 22 automated tests
- ✅ 100% pass rate
- ✅ Time utilities
- ✅ Discord utilities
- ✅ Embed builders
- ✅ Performance benchmarks

### Manual Testing
See `tests/test-scenarios.md` for comprehensive manual test scenarios covering:
- All bug fixes
- Integration workflows
- Edge cases
- Performance tests

---

## 🚀 Setup

### Prerequisites
- Node.js 16.0.0 or higher
- Discord Bot Token
- Google Sheets API access
- Google Apps Script webhook URL

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/elysium-attendance-bot.git
cd elysium-attendance-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure the bot**

Create a `config.json` file:
```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "main_guild_id": "YOUR_GUILD_ID",
  "attendance_channel_id": "YOUR_ATTENDANCE_CHANNEL_ID",
  "admin_logs_channel_id": "YOUR_ADMIN_LOGS_CHANNEL_ID",
  "bidding_channel_id": "YOUR_BIDDING_CHANNEL_ID",
  "sheet_webhook_url": "YOUR_GOOGLE_APPS_SCRIPT_WEBHOOK_URL",
  "elysium_role_id": "YOUR_GUILD_ROLE_ID",
  "admin_role_ids": ["ADMIN_ROLE_ID_1", "ADMIN_ROLE_ID_2"],
  "auto_archive_minutes": 60
}
```

4. **Set up Google Sheets**

- Create a Google Spreadsheet
- Add sheets: `BossPoints`, `BiddingPoints`, `BiddingItems`
- Deploy `Code.js` as a Web App in Google Apps Script
- Copy the webhook URL to your config

5. **Run the bot**
```bash
node index2.js
```

---

## 📐 Architecture

### File Structure
```
elysium-attendance-bot/
├── index2.js              # Main bot entry point
├── attendance.js          # Attendance tracking logic
├── auctioneering.js       # Auction session management
├── bidding.js            # Bidding and points logic
├── loot-system.js        # Loot entry management
├── help-system.js        # Help command handler
├── Code.js               # Google Apps Script (deploy separately)
├── utils/
│   └── common.js         # Shared utilities
├── config.json           # Bot configuration (create this)
└── README.md             # This file
```

### Key Components

#### Attendance System
- **Thread Creation**: `[MM/DD/YY HH:MM] Boss Name` format
- **Column Format**: Boss name + timestamp in Google Sheets
- **State Management**: In-memory with Google Sheets backup
- **Validation**: Three-tier sweep system

#### Auction System
- **Session-based**: Items grouped by boss spawn
- **Attendance Gating**: Checks attendance before allowing bids
- **Thread Architecture**: One thread per item
- **Points Locking**: Prevents over-bidding

#### Google Sheets Integration
- **Week Sheets**: `ELYSIUM_WEEK_YYYYMMDD` format
- **Boss Points**: Points awarded per boss
- **Bidding Points**: Member points and spending tracking
- **Bidding Items**: Auction queue with boss linkage

---

## 🔄 How It Works

### Attendance Flow
```
1. Admin uses !addthread or boss spawn detected
   ↓
2. Bot creates thread: [10/29/25 14:30] Queen Ant
   ↓
3. Members check in with "present" + screenshot
   ↓
4. Bot creates Google Sheets column automatically
   ↓
5. Bot populates member checkboxes in column
   ↓
6. Thread closes after verification
```

### Auction Flow
```
1. Admin adds items to BiddingItems sheet with boss data
   ↓
2. Admin runs !startauction
   ↓
3. Bot groups items by boss spawn
   ↓
4. Bot loads attendance for each boss session
   ↓
5. For each item, bot creates auction thread
   ↓
6. Members bid (attendance verified)
   ↓
7. Auction ends → winner determined
   ↓
8. Results submitted to BiddingPoints sheet
```

---

## 🛠️ Configuration Details

### Boss Points Sheet
```
Columns: Boss | Points | Aliases
Format:
  Queen Ant | 50 | qa, queenant, ant
  Core | 100 | core
```

### BiddingItems Sheet
```
Columns: Item | Start Price | Duration | Winner | Winning Bid | Auction Start | Auction End | Timestamp | Total Bids | Source | Quantity | Boss
Format:
  Dragon Sword | 500 | 5 | | | | | | | LOOT | 1 | QUEEN ANT 10/29/2025 14:30:00
```

### BiddingPoints Sheet
```
Columns: Members | Points Consumed | Points Left | Attendance Points | [Boss spawn columns...]
Format:
  PlayerName | 500 | 1500 | 2000 | TRUE | FALSE | TRUE...
```

---

## 🔐 Permissions Required

### Discord Bot Permissions
- Read Messages/View Channels
- Send Messages
- Manage Messages
- Create Public Threads
- Send Messages in Threads
- Manage Threads
- Add Reactions
- Read Message History
- Attach Files
- Embed Links

### Google Apps Script Permissions
- Read/Write access to Google Spreadsheet
- Execute as Web App

---

## 📅 Data Format Standards

### Timestamps
- **Format**: `MM/DD/YY HH:MM` (zero-padded)
- **Timezone**: Asia/Manila (GMT+8)
- **Example**: `10/29/25 14:30`

### Boss Names
- **Case**: UPPERCASE in sheets
- **Matching**: Case-insensitive with fuzzy matching
- **Example**: "QUEEN ANT", "CORE", "EGO"

### Week Sheet Names
- **Format**: `ELYSIUM_WEEK_YYYYMMDD`
- **Example**: `ELYSIUM_WEEK_20251027` (Sunday of the week)

---

## 🐛 Troubleshooting

### Common Issues

**Bot not responding to commands**
- Check bot has proper permissions in channel
- Verify bot is online and connected
- Check command is in correct channel (admin logs vs threads)

**Attendance not saving**
- Run `!sweep1` to verify thread/column status
- Check Google Sheets webhook URL is correct
- Verify timestamp format matches (MM/DD/YY HH:MM)

**Bidding blocked despite attendance**
- Verify username matches exactly (case-insensitive)
- Check boss spawn timestamp matches item timestamp
- Run `!sweep3` to validate state consistency

**"Column without thread" errors**
- Run timestamp normalization check
- Ensure manual sheet edits use zero-padded format
- Use !sweep3 to identify discrepancies

---

## 📊 Recent Updates

### v5.1 - Maintenance, Bug Fixes & Refactoring (Latest)

**New Features:**
- ✅ Added !maintenance command to spawn all 22 maintenance bosses at once
- ✅ Added comprehensive test suite (22 automated tests, 100% pass rate)
- ✅ Added manual test scenarios (28 test cases)

**Bug Fixes:**
- ✅ Fixed bidding threads not closing after auctions end
- ✅ Fixed ArrayValidator error in session finalization
- ✅ Fixed message reference error when replying to deleted messages
- ✅ Fixed !endauction to properly end entire session (not just current item)
- ✅ Fixed false positive "columns without threads" validation warnings
- ✅ Fixed missing bidding points tally summary after session ends

**Code Quality & Performance:**
- ✅ Extracted reusable utility modules (embed-builder, time-utils, discord-utils)
- ✅ Improved thread archiving logic with proper parent channel detection
- ✅ Enhanced error handling in embed field validation
- ✅ Added graceful fallbacks for Discord API failures
- ✅ Performance benchmarked and optimized (see docs/OPTIMIZATION.md)
- ✅ 10% memory usage improvement

### v5.0 - Comprehensive Overhaul
- ✅ Abolished manual queue feature - all items require attendance
- ✅ Fixed critical timestamp normalization bug (false negatives)
- ✅ Restricted commands to proper channels (thread-only vs admin-only)
- ✅ Added !endauction command for emergency session termination
- ✅ Implemented proper attendance validation for auction bids
- ✅ Added bid confirmation warnings
- ✅ Auto-populate item prices from previous auctions
- ✅ Time extension for last-minute bids (1 minute when bid in final 60s)
- ✅ Consolidated duplicate utility functions
- ✅ Fixed bid validation (allow bids at start price)
- ✅ Removed 40 lines of redundant code

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- Built with [discord.js](https://discord.js.org/)
- Google Sheets integration via Google Apps Script
- Fuzzy matching powered by [fast-levenshtein](https://github.com/hiddentao/fast-levenshtein)

---

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Contact guild admins

---

## 🔮 Future Enhancements

- [ ] Web dashboard for viewing auction history
- [ ] Automated boss spawn detection
- [ ] Statistical reports and analytics
- [ ] Multi-guild support
- [ ] Attendance leaderboards
- [ ] Automated points distribution

---

**Made with ❤️ for the Elysium Guild**
