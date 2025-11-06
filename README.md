# ELYSIUM Guild Bot v8.1

> A comprehensive Discord bot for guild management, featuring attendance tracking, auction-based loot distribution, and automated leaderboards.

![Status](https://img.shields.io/badge/status-production-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Commands](#-commands)
- [System Architecture](#-system-architecture)
- [Google Sheets Integration](#-google-sheets-integration)
- [How It Works](#-how-it-works)
- [Emergency Recovery](#-emergency-recovery)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🎯 Attendance System
- **Boss spawn check-ins** with screenshot verification for non-admins
- **Automated verification workflow** using Discord reactions (✅/❌)
- **Points system** with automatic assignment on verification
- **20-minute auto-close** - threads automatically close to prevent attendance cheating
- **Multi-thread management** with spawn tracking and closure automation
- **Google Sheets integration** for persistent data storage
- **State recovery** on bot restart with full crash recovery
- **Bulk operations** - verify all, close all, reset pending
- **Thread locking** and archiving automation

### 💰 Auction System
**Open Bidding for All ELYSIUM Members:**
- All guild members can participate in auctions
- No attendance requirements or restrictions
- Point-based bidding system with real-time balance tracking

**Advanced Features:**
- **Automatic scheduler** - auctions start every Saturday at 12:00 PM GMT+8
- **30-second preview** with @everyone ping before each item
- **Auto-pause system** - auction pauses if bid placed in last 10 seconds
- **Dynamic extensions** - +1 minute added on confirmed bids
- **Bid confirmation** - 10-second window to confirm bids
- **Locked points system** - prevents double-spending
- **Race condition protection** - thread locking for bid safety
- **Reliable time calculations** - always displays non-negative time values
- **10-minute cooldown** between auction sessions
- **Queue system** - loads items from Google Sheets
- **Session history** - tracks all winners and bids
- **Auto-cleanup** - removes old messages every 12 hours

**Auction Controls:**
- Pause/Resume sessions
- Extend time for current item
- Skip or cancel items with refunds
- Force submit results for recovery

### 🎁 Loot System
- **OCR-powered** screenshot reading using Google Vision API
- **Automatic logging** to Google Sheets
- **Boss loot tracking** with source tagging (Loot/Guild Boss)
- **Blacklist filtering** to exclude unwanted items
- **Multi-screenshot support** in single command
- **Preview before submission** to verify accuracy

### 📊 Leaderboard System
- **Attendance leaderboard** - top 10 members by attendance points
- **Bidding leaderboard** - top 10 members by remaining points
- **Weekly automated reports** - sent every Saturday at 11:59 PM
- **Visual progress bars** for rankings
- **Real-time statistics** with percentage calculations
- **Manual trigger** available for admins

### 🚨 Emergency Recovery System
Complete toolkit for handling stuck states (all require confirmation):
- **Force close threads** - individual or all attendance threads
- **Force end auctions** - terminate stuck auction sessions
- **Unlock points** - release all locked bidding points
- **Clear bids** - remove pending bid confirmations
- **Diagnostics** - comprehensive state inspection
- **Force sync** - manually save state to Google Sheets

### 🤖 AI/ML Intelligence Engine (NEW!)
**Predictive Analytics & Smart Automation:**
- **Price Prediction** - Auto-suggest starting bids based on historical auction data
  - Machine learning price estimation with confidence intervals
  - Trend analysis for item value changes over time
  - Similar item recommendations when data is insufficient
  - Statistical analysis with outlier detection
  - **NEW!** `!suggestauction` - Analyze entire queue before auction

- **Member Engagement Analytics** - Predict attendance likelihood and identify at-risk members
  - Engagement scoring (attendance + bidding activity + consistency)
  - Next event attendance prediction with confidence levels
  - Personalized recommendations for each member
  - Guild-wide engagement analysis with top performers & at-risk identification

- **Anomaly Detection & Fraud Prevention** - Automatically flag suspicious patterns
  - Collusion detection in bidding patterns
  - Unusual bid amount identification (statistical outliers)
  - Attendance pattern anomaly detection
  - Item duplication/frequency monitoring

- **Smart Recommendations** - AI-powered insights for guild management
  - Optimal auction timing based on member activity patterns
  - Personalized attendance reminders for at-risk members
  - Item ordering optimization for maximum engagement

- **Performance Monitoring** - Real-time system health and optimization
  - Memory usage tracking and auto-optimization
  - Cache management with intelligent cleanup
  - Performance recommendations based on system metrics
  - Supports up to 512MB RAM deployment

### 🔔 Proactive Intelligence System (NEW!)
**Automated Monitoring & Alerts:**
- **Pre-Auction Readiness Check** (Saturday 10 AM, 2h before auction)
  - Checks if guild is ready (70% members with 100+ points)
  - Sends alert to Admin Logs with @here if low readiness
  - Suggests postponing or adjusting starting bids

- **Weekly Engagement Digest** (Monday 9 AM)
  - Guild-wide engagement analysis sent to Admin Logs
  - Identifies at-risk members needing attention
  - Suggests manual reminders (admin sends, not auto-DM)

- **Daily Anomaly Digest** (6 PM Manila time)
  - Scans for suspicious patterns and fraud
  - Sends alert to Admin Logs with @here if anomalies found
  - Provides actionable recommendations

- **Weekly Positive Summary** (Sunday 8 PM)
  - Motivational recap sent to Guild Chat
  - Celebrates top 5 performers
  - Guild achievements and milestones

- **Milestone Celebrations** (Every hour)
  - Detects members reaching 500/1000/2000/5000 points
  - Public celebration in Guild Chat
  - Motivates guild engagement

### 💬 Natural Language Processing (NEW!)
**Flexible Command Syntax:**
- Works in **Admin Logs** and **Auction Threads** only (NOT guild chat)
- Understands natural language instead of strict commands
- Does NOT interfere with existing ! commands

**Examples:**
```
In Auction Threads:
"bid 500" → !bid 500
"offer 300 points" → !bid 300
"300 pts" → !bid 300

In Admin Logs:
"how many points do i have" → !mypoints
"show me the leaderboard" → !leaderboard
"what's the auction status" → !bidstatus
"bot status" → !status
```

### 🧠 Bot Learning System (NEW!)
**The bot improves over time by learning from past predictions!**

**How It Works:**
1. Bot makes prediction (e.g., item price, member engagement)
2. Prediction saved to `BotLearning` Google Sheet with confidence
3. Event completes → actual outcome observed
4. System calculates accuracy by comparing predicted vs actual
5. Future predictions adjusted based on historical accuracy

**What the Bot Learns:**
- **Price Predictions** (Auctions): Learns optimal starting bids
  - If 90%+ accurate → increases confidence on future predictions
  - If <70% accurate → decreases confidence
  - After 10+ predictions, bot knows when it's reliable

- **Engagement Predictions** (Members): Predicts who will attend events
  - Learns attendance patterns over time
  - Identifies at-risk members before they leave
  - Improves prediction accuracy week by week

- **Anomaly Detection** (Fraud): Learns what "normal" looks like
  - Better at catching suspicious bidding patterns
  - Reduces false positives over time
  - Learns from admin feedback on investigations

**Commands:**
```
!learningmetrics    - View bot's learning stats and accuracy
!updateprediction   - Manually update prediction with actual result
!viewlearning       - See recent predictions and their accuracy
!performance        - Includes learning metrics in system report
```

**Data Storage:**
All learning data is stored in the `BotLearning` Google Sheet:
- Timestamp, Type, Target, Predicted, Actual, Accuracy, Confidence, Features, Status
- Admins can view/audit all predictions
- Persistent across bot restarts (Koyeb-friendly)
- Privacy-friendly (no sensitive personal data)

**Benefits:**
✅ Bot gets smarter the more it's used
✅ Confidence scores calibrated to actual performance
✅ Transparent learning (all data visible in Google Sheets)
✅ Works for multiple prediction types (auctions, engagement, fraud)
✅ Zero breaking changes to existing features

> 📖 **Full documentation**: See `LEARNING_SYSTEM_DOCUMENTATION.md` for technical details

### 🛡️ Security & Reliability
- **Admin role verification** on all privileged commands
- **Confirmation prompts** for destructive operations
- **Rate limiting** - 3-second cooldown on bids
- **Screenshot verification** required for check-ins (non-admins)
- **Race condition protection** with thread locking
- **Memory optimization** with cache sweeping (512MB RAM optimized)
- **State persistence** to Google Sheets every 5 minutes
- **Automatic crash recovery** on startup
- **Error handling** with detailed logging

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16.0.0 or higher
- Discord Bot Token
- Google Cloud Project with Apps Script
- Discord Guild with appropriate permissions

### Installation

```bash
# Clone the repository
git clone https://github.com/brunongmacho/elysium-attendance-bot.git
cd elysium-attendance-bot

# Install dependencies
npm install

# Create configuration file
cp config.example.json config.json

# Edit config.json with your Discord IDs and webhook URL
nano config.json

# Create environment file
echo "DISCORD_TOKEN=your_discord_bot_token_here" > .env

# Run the bot
node index2.js
```

---

## 🐳 Docker Deployment (Koyeb)

The bot is optimized for deployment on **Koyeb** using Docker with 256MB RAM.

### Prerequisites
- Docker installed (if building locally)
- Koyeb account ([koyeb.com](https://www.koyeb.com))
- GitHub repository (for automatic deployments)
- `config.json` and environment variables configured

### Deployment Steps

#### 1. Prepare Configuration Files

Ensure you have:
- `config.json` with Discord IDs and webhook URL
- `.env` file with `DISCORD_TOKEN` (add via Koyeb secrets)

#### 2. Deploy to Koyeb

**Option A: GitHub Integration (Recommended)**
1. Push your code to GitHub
2. Log in to Koyeb dashboard
3. Create new service → GitHub repository
4. Select repository: `elysium-attendance-bot`
5. Set build type: **Dockerfile**
6. Configure environment:
   - Add secret: `DISCORD_TOKEN` (from Discord Developer Portal)
   - Set memory: **256MB**
   - Set port: **3000** (for health checks)
7. Deploy

**Option B: Docker Registry**
1. Build image locally:
   ```bash
   docker build -t elysium-bot:latest .
   ```
2. Push to Docker Hub or GitHub Container Registry
3. Deploy from registry in Koyeb

#### 3. Configure Health Checks

Koyeb will automatically use the health check endpoint:
- **URL**: `/health` or `/`
- **Port**: `3000`
- **Returns**: JSON with bot status and metrics

### Docker Configuration

The included `Dockerfile` uses:
- **Multi-stage build** for optimized image size
- **Distroless runtime** for security (nodejs18)
- **Memory limit**: 220MB (leaves 36MB for system)
- **GC flags**: `--expose-gc --max-old-space-size=220`
- **Health check server** on port 3000

### Environment Variables

Required environment variables for Koyeb:
```bash
DISCORD_TOKEN=your_discord_bot_token
PORT=3000  # Optional, defaults to 3000
NODE_ENV=production  # Set automatically in Dockerfile
```

### Memory Management

The bot is optimized for 256MB RAM:
- **Heap size**: 220MB limit
- **Automatic GC**: Runs every 10 minutes
- **Cache sweepers**: Discord cache cleanup
  - Messages: 15-minute lifetime
  - Users: 1 hour (filters bots)
  - Members: 1 hour
- **State persistence**: Syncs to Google Sheets every 5 minutes

### Monitoring

**Health Check Response:**
```json
{
  "status": "healthy",
  "version": "8.1",
  "uptime": 123456,
  "bot": "BotName#1234",
  "activeSpawns": 2,
  "pendingVerifications": 5,
  "timestamp": "2025-11-05T12:00:00.000Z"
}
```

**Access health endpoint:**
```bash
curl https://your-koyeb-app.koyeb.app/health
```

### Automatic Features

When deployed, the bot automatically:
- **Recovers state** from Google Sheets on startup
- **Starts weekly auction scheduler** (Saturday 12:00 PM GMT+8)
- **Enables bidding channel cleanup** (every 12 hours)
- **Sends weekly leaderboard reports** (Saturday 11:59 PM)
- **Syncs state to Sheets** every 5 minutes
- **Auto-closes attendance threads** after 20 minutes to prevent cheating

### Troubleshooting

**Bot not responding:**
- Check Koyeb logs for errors
- Verify `DISCORD_TOKEN` is set correctly
- Ensure health check is passing (`/health` endpoint)

**Memory issues:**
- Monitor memory usage in Koyeb dashboard
- Check if heap limit is appropriate (currently 220MB)
- Review GC logs for memory pressure

**State loss after restart:**
- Verify Google Sheets webhook URL is correct
- Check Apps Script deployment is active
- Review state sync logs every 5 minutes

---

## ⚙️ Configuration

### config.json

Create a `config.json` file with the following structure:

```json
{
  "main_guild_id": "YOUR_MAIN_GUILD_ID",
  "attendance_channel_id": "ATTENDANCE_CHANNEL_ID",
  "admin_logs_channel_id": "ADMIN_LOGS_CHANNEL_ID",
  "bidding_channel_id": "BIDDING_CHANNEL_ID",
  "timer_server_id": "TIMER_SERVER_ID",
  "sheet_webhook_url": "https://script.google.com/macros/s/.../exec",
  "admin_roles": ["Admin", "Officer", "Guild Master"],
  "elysium_role_name": "ELYSIUM"
}
```

#### Configuration Fields:

| Field | Description | Required |
|-------|-------------|----------|
| `main_guild_id` | Your main Discord server ID | ✅ |
| `attendance_channel_id` | Channel for boss spawn threads | ✅ |
| `admin_logs_channel_id` | Channel for admin notifications | ✅ |
| `bidding_channel_id` | Channel for auctions | ✅ |
| `timer_server_id` | Server ID for timer integration | ✅ |
| `sheet_webhook_url` | Google Apps Script webhook URL | ✅ |
| `admin_roles` | Array of admin role names | ✅ |
| `elysium_role_name` | Guild member role name | ✅ |

### boss_points.json

Define boss names and point values:

```json
{
  "Clematis": 1,
  "Morokai": 1,
  "Riftmaker": 1,
  "Cornelius": 2,
  "Guild Boss": 1
}
```

### Environment Variables

Create a `.env` file:

```bash
DISCORD_TOKEN=your_discord_bot_token_here
PORT=8000  # Optional, defaults to 8000
```

---

## 📝 Commands

### Member Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `present` | `here`, `join`, `checkin` | Check in for boss spawn (requires screenshot for non-admins) |
| `!bid <amount>` | `!b <amount>` | Place bid on current auction item |
| `!bidstatus` | `!bstatus`, `!bs` | View auction status and queue |
| `!mypoints` | `!pts`, `!mypts`, `!mp` | Check available bidding points (bidding channel only) |

### Attendance Commands (Admin)

| Command | Aliases | Description |
|---------|---------|-------------|
| `!status` | `!st` | View bot health, active spawns, and statistics |
| `!addthread <boss> will spawn in X minutes!` | `!addth` | Manually create spawn thread with custom timestamp |
| `!verify @member` | `!v` | Manually verify member for attendance |
| `!verifyall` | `!vall` | Auto-verify all pending members (with confirmation) |
| `!resetpending` | `!resetpend` | Clear all pending verifications |
| `!fs` | - | Submit attendance WITHOUT closing thread |
| `!forceclose` | `!fc` | Force close thread ignoring pending verifications |
| `!debugthread` | `!debug` | Show detailed thread diagnostic info |
| `!closeallthread` | `!closeall` | Mass close all open spawn threads |
| `!clearstate` | `!clear` | Reset all bot memory and state |
| `!maintenance` | `!maint` | Bulk create threads for maintenance bosses |
| `!removemember <name>` | `!removemem`, `!rmmember`, `!delmember` | Remove member from ALL sheets (excludes ForDistribution) |
| `close` | - | Close spawn thread manually (threads auto-close after 20 min) |

### Leaderboard Commands (Admin)

| Command | Aliases | Description |
|---------|---------|-------------|
| `!leaderboardattendance` | `!leadatt` | Display attendance leaderboard |
| `!leaderboardbidding` | `!leadbid` | Display bidding points leaderboard |
| `!weeklyreport` | `!week` | Manually trigger weekly report |

### Auctioneering Commands (Admin)

| Command | Aliases | Description |
|---------|---------|-------------|
| `!startauction` | `!start`, `!auc-start` | Start auction session (10-min cooldown) |
| `!startauctionnow` | `!auc-now` | Override cooldown and start immediately |
| `!pause` | `!auc-pause`, `!hold` | Pause active auction session |
| `!resume` | `!auc-resume`, `!continue` | Resume paused auction |
| `!stop` | `!auc-stop`, `!end-item` | End current item and move to next |
| `!extend <minutes>` | `!ext`, `!auc-extend` | Add extra time to current item |

### Bidding Commands (Admin)

| Command | Aliases | Description |
|---------|---------|-------------|
| `!queuelist` | `!ql`, `!queue` | View complete auction queue preview |
| `!resetbids` | `!resetb` | Reset entire bidding system (confirmation required) |
| `!forcesubmitresults` | `!forcesubmit` | Manually submit auction results to sheets |
| `!cancelitem` | `!cancel` | Cancel current item and refund all bids |
| `!skipitem` | `!skip` | Skip current item (no sale) |

### Loot Commands (Admin)

| Command | Description |
|---------|-------------|
| `!loot <boss> <date> <time>` | Process loot screenshots with OCR |

**Example:**
```
!loot EGO 10/27/2025 5:57:00
!loot LADY DALIA 10/27/2025 3:32:00
!loot GUILD BOSS 10/27/2025 21:00:00
```

### Emergency Commands (Admin)

| Command | Subcommand | Description |
|---------|------------|-------------|
| `!emergency` | `closeall` | Force close all attendance threads |
| | `close <threadID>` | Force close specific thread |
| | `endauction` | Force end stuck auction |
| | `unlock` | Unlock all locked points |
| | `clearbids` | Clear pending bid confirmations |
| | `diag` | Show diagnostics |
| | `sync` | Force sync to Google Sheets |

### Intelligence Engine Commands (Admin) 🤖

| Command | Aliases | Description |
|---------|---------|-------------|
| `!predictprice <item name>` | `!predict`, `!suggestprice` | AI-powered price prediction for single item with historical analysis |
| `!suggestauction` | `!analyzequeue` | **NEW!** Analyze ALL items in queue and suggest prices BEFORE auction |
| `!engagement <username>` | `!engage` | Analyze member engagement and predict attendance |
| `!analyzeengagement` | `!analyze` | Guild-wide engagement analysis (all members) |
| `!detectanomalies` | `!anomaly`, `!fraud` | Scan for suspicious patterns and fraud |
| `!recommendations` | `!recommend`, `!suggest` | Smart recommendations for optimal guild management |
| `!performance` | `!perf` | System performance report and optimization insights |

**Examples:**
```
!predictprice Crimson Pendant
→ Suggests starting bid based on 10+ historical auctions with 85% confidence

!suggestauction
→ Analyzes ALL 15 items in queue
→ Crimson Pendant: 400pts → AI: 450pts (+50) ✅ 85% confidence
→ Ancient Scroll: 300pts → AI: 320pts (+20) ⚠️ 65% confidence
→ Use BEFORE auction to adjust prices in Google Sheets

!engagement PlayerName
→ Shows 75/100 engagement score, 80% likelihood to attend next event

!analyzeengagement
→ Guild average: 68/100, identifies 5 at-risk members

!detectanomalies
→ Scans 500+ auctions, flags 2 suspicious bidding patterns

!recommendations
→ Optimal auction time: Saturday 8PM, 15 members need reminders
```

### Learning System Commands (Admin) 🧠

| Command | Aliases | Description |
|---------|---------|-------------|
| `!learningmetrics` | `!learnstats` | View bot learning statistics and accuracy trends across all prediction types |
| `!updateprediction <item> <actual price>` | | Manually update prediction accuracy when auction completes |
| `!viewlearning [type] [limit]` | `!predictions` | View recent predictions with accuracy (filter by type, limit results) |
| `!performance` | `!perf` | System performance + learning metrics (includes bot accuracy stats) |

**Examples:**
```
!learningmetrics
→ PRICE PREDICTION:
→   • Total: 47 predictions
→   • Average Accuracy: 87.3%
→   • Recent Accuracy: 92.1% (📈 improving)
→ ENGAGEMENT:
→   • Total: 23 predictions
→   • Average Accuracy: 78.5%

!updateprediction Crimson Pendant 475
→ ✅ Updated prediction accuracy for "Crimson Pendant" with actual price 475pts!
→ 🧠 Bot is learning... Accuracy: 94.7%

!viewlearning price_prediction 5
→ Recent Price Predictions:
→ 1. Crimson Pendant: 450 → 475 (94.7% ✅) completed
→ 2. Ruby Ring: 300 → 295 (98.3% ✅) completed
→ 3. Ancient Scroll: 320 → [pending]
→ 4. Dragon Scale: 500 → 450 (90.0% ✅) completed
→ 5. Mystic Orb: 400 → 420 (95.2% ✅) completed

!performance
→ [System stats...]
→ 🧠 Learning Metrics:
→   • 70 total predictions made
→   • Price predictions: 92.1% recent accuracy (📈 +4.8%)
→   • Bot confidence calibrated based on performance
```

> 💡 **Note**: The more the bot is used, the smarter it gets! Predictions improve over time as more data is collected in the BotLearning Google Sheet.

### Help Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `!help` | `!?`, `!commands`, `!cmds` | Display complete help system |
| `!help <command>` | - | Get detailed info about specific command |

---

## 🏗️ System Architecture

### Project Structure

```
elysium-attendance-bot/
├── index2.js                 # Main bot entry point & message handler
├── attendance.js             # Attendance tracking system
├── bidding.js                # Bidding engine & points management
├── auctioneering.js          # Auction session management
├── help-system.js            # Command documentation system
├── loot-system.js            # OCR loot processing
├── emergency-commands.js     # Recovery toolkit
├── leaderboard-system.js     # Leaderboard generation
├── utils/
│   ├── common.js             # Shared utilities
│   ├── error-handler.js      # Error handling utilities
│   ├── cache-manager.js      # Caching system
│   ├── constants.js          # Shared constants
│   └── auction-cache.js      # Auction cache manager
├── config.json               # Bot configuration
├── boss_points.json          # Boss point values
├── Code.js                   # Google Apps Script backend
├── appsscript.json           # Apps Script configuration
└── package.json              # Node.js dependencies
```

### Module Responsibilities

#### index2.js
- Discord client initialization
- Event handling (messages, reactions)
- Command routing and alias resolution
- HTTP health check server
- State recovery on startup
- Bidding channel cleanup scheduler

#### attendance.js
- Spawn thread creation and management
- Verification workflow (pending → verified)
- Points calculation and assignment
- Google Sheets submission
- State persistence and recovery
- Confirmation message management

#### bidding.js
- Bid processing and validation
- Points locking/unlocking system
- Bid confirmation workflow
- Points cache management
- Session history tracking
- State persistence to Google Sheets

#### auctioneering.js
- Auction session lifecycle management
- Queue management (loading from sheets)
- Timer management (preview, auction, extensions)
- Pause/resume functionality
- Item skip/cancel with refunds
- Winner announcement
- Results submission to sheets

#### help-system.js
- Command documentation database
- Dynamic help embed generation
- Admin/member command filtering
- Category-based organization
- Alias display

#### loot-system.js
- OCR processing via Google Vision API
- Screenshot parsing
- Item quantity detection
- Blacklist filtering
- Boss name validation
- Loot logging to Google Sheets

#### emergency-commands.js
- Force close operations
- Auction termination
- Point unlock utilities
- State diagnostics
- Manual sync operations

#### leaderboard-system.js
- Attendance leaderboard generation
- Bidding leaderboard generation
- Weekly report scheduler (Saturday 11:59 PM)
- Manual report triggering
- Progress bar visualization

---

## 📊 Google Sheets Integration

### Required Sheets

Your Google Spreadsheet must have these tabs:

#### 1. Attendance Sheet
Tracks boss spawn attendance and points.

| Column | Description |
|--------|-------------|
| Member | Discord username |
| [Boss Names] | Dynamic columns for each boss |
| Total Points | Sum of all attendance |

#### 2. BiddingPoints Sheet
Manages member bidding points.

| Column | Description |
|--------|-------------|
| Member | Discord username |
| Points Left | Current available points |
| Points Consumed | Total points spent |
| Total Points | Lifetime total points |

#### 3. BiddingItems Sheet
Queue of items for auction.

| Column | Description |
|--------|-------------|
| Item | Item name |
| Starting Price | Minimum bid amount |
| Duration | Auction duration (minutes) |
| Source | Loot source (Loot/Guild Boss) |

#### 4. BotState Sheet
Persists bot state for crash recovery.

| Column | Description |
|--------|-------------|
| Key | State identifier |
| Value | JSON-encoded state data |
| Updated | Last update timestamp |

### Google Apps Script Setup

Deploy `Code.js` as a web app:

#### Method 1: Using clasp (Recommended)

The project is configured to use [clasp](https://github.com/google/clasp) for automated deployment.

```bash
# Install clasp globally (one-time)
npm install -g @google/clasp

# Login to Google account (one-time)
clasp login

# Push Code.js to Google Apps Script
clasp push

# Create a new deployment
clasp deploy --description "Initial deployment"
```

After deployment, get the web app URL:
1. Run `clasp open` to open the script in browser
2. Click "Deploy" → "Manage deployments"
3. Copy the web app URL
4. Add it to `config.json` as `sheet_webhook_url`

**Updating the deployment:**
When you update `Code.js`, always push changes:
```bash
# Option 1: Using clasp directly
clasp push

# Option 2: Using npm script (recommended)
npm run deploy
```

No need to create a new deployment - the web app URL stays the same.

#### Method 2: Manual Deployment

1. Open Google Sheets
2. Extensions → Apps Script
3. Copy contents of `Code.js`
4. Paste into the script editor
5. Deploy → New deployment
6. Select "Web app"
7. Execute as: "Me"
8. Who has access: "Anyone"
9. Copy deployment URL to `config.json` as `sheet_webhook_url`

**Note:** When using manual deployment, you must manually update the script whenever `Code.js` changes.

### Webhook Actions

The bot sends POST requests with the following actions:

| Action | Purpose |
|--------|---------|
| `addAttendance` | Add attendance record |
| `addBulkAttendance` | Add multiple attendance records |
| `getPoints` | Fetch member points |
| `updatePoints` | Update points (deduct/refund) |
| `removeMember` | Remove member from all sheets |
| `loadQueue` | Load auction items |
| `submitResults` | Submit auction winners |
| `logLoot` | Add loot items |
| `saveBotState` | Save state for recovery |
| `loadBotState` | Load state on startup |

---

## 🔄 How It Works

### Attendance Flow

```
1. Boss Spawn Detected (or manually created with !addthread)
   ↓
2. Attendance Thread + Confirmation Thread Created
   Thread shows: "⏰ Auto-closes in 20 minutes"
   ↓
3. Member Types "present" or "here"
   ↓
4. Non-Admin: Screenshot Required + Pending Verification
   Admin: Instant Verification (no screenshot needed)
   ↓
5. Admin Reacts with ✅ to Verify
   ↓
6. Member Added to Verified List
   Confirmation Thread Updated
   ↓
7. Admin Types "close" in Thread (Manual Option)
   OR
   Thread Auto-Closes After 20 Minutes
   ↓
8. Validation: No Pending Verifications?
   (Auto-close: All pending members auto-verified)
   ↓
9. Submit Attendance to Google Sheets
   ↓
10. Archive Thread + Cleanup Confirmation Thread
    ↓
11. Points Auto-Assigned Based on boss_points.json
```

### Auction Flow

```
1. Admin Runs !startauction
   ↓
2. Load Items from Google Sheets BiddingItems Tab
   ↓
3. Create Auction Thread in Bidding Channel
   ↓
4. FOR EACH ITEM:
   ↓
   a. 30-Second Preview
      - Show item details
      - @everyone ping
      - Display starting price & duration
   ↓
   b. Auction Starts
      - Members type !bid <amount>
      - 10-second confirmation window
      - React ✅ to confirm bid
   ↓
   c. Bid Logic:
      - If bid in last 10s → PAUSE auction
      - On confirmation → +1 minute extension
      - Points locked immediately on bid
      - Previous bidder points unlocked
   ↓
   d. Auction Ends
      - Winner announced
      - Points deducted
      - 20-second delay before next item
   ↓
5. Session Complete
   ↓
6. Submit Results to Google Sheets
   - Winner name
   - Item name
   - Bid amount
   - Timestamp
   ↓
7. Update BiddingPoints Sheet
   ↓
8. Archive Auction Thread
   ↓
9. 10-Minute Cooldown Starts
```

### Loot Processing Flow

```
1. Admin Types: !loot <boss> <date> <time>
   Attaches Screenshot(s)
   ↓
2. Bot Sends Screenshot to Google Vision API (OCR)
   ↓
3. Extract Text from Screenshot
   ↓
4. Parse Items and Quantities
   - Filter blacklisted items
   - Validate boss name
   ↓
5. Show Preview Embed
   - Boss name
   - Timestamp
   - Item list with quantities
   ↓
6. Admin Confirms with ✅
   ↓
7. Submit to Google Sheets BiddingItems Tab
   - Item name
   - Starting price (default: 50)
   - Duration (default: 5 minutes)
   - Source: "Loot" or "Guild Boss"
   ↓
8. Success Confirmation
```

### State Recovery Flow

```
1. Bot Starts
   ↓
2. Check Google Sheets BotState Tab
   ↓
3. Found Crashed State?
   ├─ YES:
   │  ↓
   │  a. Load Auction State
   │  b. Award Current Item to Last Winner
   │  c. Move Unfinished Queue to BiddingItems Sheet
   │  d. Submit Session Tally
   │  e. Start 10-Minute Cooldown
   │  ↓
   └─ NO: Start Fresh
   ↓
4. Initialize All Modules
   ↓
5. Recover Attendance State from Threads
   - Scan all active threads
   - Rebuild activeSpawns map
   - Rebuild pendingVerifications
   ↓
6. Ready for Commands
```

---

## 🚨 Emergency Recovery

### When to Use Emergency Commands

Use emergency commands when:
- Threads are stuck and won't close
- Auction won't end despite using !stop
- Points are locked indefinitely
- Bot state is corrupted
- Normal commands aren't working

### Emergency Command Guide

#### 1. Diagnostics First
```
!emergency diag
```
Shows current state: active threads, locked points, pending bids, auction status.

#### 2. Force Close Threads
```
!emergency closeall
```
Closes all attendance threads immediately. **WARNING**: Does not submit to sheets!

#### 3. Force End Auction
```
!emergency endauction
```
Terminates stuck auction, awards current item to highest bidder, clears state.

#### 4. Unlock Points
```
!emergency unlock
```
Releases all locked bidding points. Use if points stuck after failed bids.

#### 5. Clear Pending Bids
```
!emergency clearbids
```
Removes all pending bid confirmations from memory.

#### 6. Force Sync
```
!emergency sync
```
Manually saves current bot state to Google Sheets.

### Recovery Workflow

```
PROBLEM: Auction won't end
  ↓
1. !emergency diag (check state)
  ↓
2. !emergency endauction (force end)
  ↓
3. !emergency unlock (if points stuck)
  ↓
4. !emergency sync (save state)
  ↓
RESOLVED

PROBLEM: Threads won't close
  ↓
1. !emergency diag (check active threads)
  ↓
2. !emergency closeall (force close)
  ↓
3. !clearstate (reset bot memory)
  ↓
4. !emergency sync (save state)
  ↓
RESOLVED
```

---

## 🛠️ Development

### Running Locally

```bash
# Install dependencies
npm install

# Development mode with auto-restart (requires nodemon)
npm install -g nodemon
nodemon index2.js

# Production mode
node index2.js
```

### Environment Setup

**Memory Optimization:**
The bot is configured for 256MB RAM environments (like Render.com free tier).

**Cache Sweeping:**
- Messages: every 5 minutes (keep last 10 minutes)
- Users: every 10 minutes (keep non-bots only)
- Guild members: every 15 minutes

**Health Check:**
HTTP server runs on port 8000 (or `PORT` env variable).

```bash
# Check health
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "version": "8.1",
  "uptime": 12345,
  "bot": "ELYSIUM Bot#1234",
  "activeSpawns": 2,
  "pendingVerifications": 5,
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

### Adding New Commands

1. Add command handler in `index2.js`:
```javascript
commandHandlers = {
  mycommand: async (message, member) => {
    // Command logic here
    await message.reply("Command executed!");
  }
};
```

2. Add alias in `COMMAND_ALIASES`:
```javascript
const COMMAND_ALIASES = {
  "!mc": "!mycommand"
};
```

3. Add to help system in `help-system.js`:
```javascript
const COMMAND_HELP = {
  mycommand: {
    usage: "!mycommand",
    description: "Does something cool",
    category: "Admin",
    adminOnly: true,
    example: "!mycommand",
    aliases: ["!mc"],
    features: ["Feature 1", "Feature 2"]
  }
};
```

### Adding New Boss

Add to `boss_points.json`:
```json
{
  "New Boss Name": 2
}
```

The bot will automatically:
- Recognize the boss in attendance threads
- Create column in Google Sheets (on first use)
- Assign 2 points on verification

### Debugging

Enable verbose logging:
```javascript
// In index2.js, uncomment:
console.log(`🔍 Debug: ${JSON.stringify(data, null, 2)}`);
```

Common debug locations:
- `index2.js:1800` - Message handling
- `bidding.js:500` - Bid processing
- `auctioneering.js:300` - Auction logic
- `attendance.js:200` - Verification workflow

---

## 🐛 Troubleshooting

### Common Issues

#### Bot Not Responding
**Symptoms:** Commands don't trigger any response.

**Solutions:**
1. Check bot is online: `!status` in admin channel
2. Verify bot has message read permissions
3. Check `DISCORD_TOKEN` in `.env`
4. Restart bot: `node index2.js`

#### Attendance Not Submitting
**Symptoms:** Thread closes but data doesn't appear in sheets.

**Solutions:**
1. Check `sheet_webhook_url` in `config.json`
2. Test webhook: `curl -X POST <webhook_url>`
3. Verify Google Sheets permissions
4. Check Apps Script deployment is active
5. Use `!emergency sync` to force save

#### Auction Won't Start
**Symptoms:** `!startauction` shows error or cooldown.

**Solutions:**
1. Wait for 10-minute cooldown
2. Use `!startauctionnow` to override (admin)
3. Check BiddingItems sheet has items
4. Use `!emergency endauction` if previous auction stuck

#### Points Not Deducting
**Symptoms:** Winner announced but points still same.

**Solutions:**
1. Check BiddingPoints sheet for update
2. Verify Google Sheets webhook connection
3. Use `!forcesubmitresults` to retry submission
4. Check Apps Script logs for errors

#### Unknown Action Error
**Symptoms:** Commands fail with `Error: Unknown action: <actionName>` (e.g., `removeMember`).

**Cause:** The deployed Google Apps Script is outdated and missing new action handlers.

**Solutions:**
1. **Using clasp (recommended):**
   ```bash
   # Option 1: Using npm script
   npm run deploy

   # Option 2: Using clasp directly
   clasp push
   ```
   This updates the deployed script with the latest `Code.js`.

2. **Manual deployment:**
   - Open Google Apps Script (Extensions → Apps Script in Google Sheets)
   - Copy the latest `Code.js` from the repository
   - Paste and save
   - No need to redeploy - changes take effect immediately

3. Verify the fix by running the failing command again

**Note:** Always run `clasp push` or manually update the script after pulling repository updates.

#### Threads Not Closing
**Symptoms:** Threads stay open despite `close` command.

**Solutions:**
1. Check for pending verifications: `!debugthread`
2. Use `!resetpending` to clear pending
3. Use `!forceclose` to close thread
4. Use `!emergency closeall` for mass closure

#### Locked Points Won't Release
**Symptoms:** Points stuck as locked after failed bid.

**Solutions:**
1. Check locked points: `!emergency diag`
2. Use `!emergency unlock` to release all
3. Restart bot to clear memory state
4. Verify bidding cache sync

### Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `❌ Admin only command` | Missing admin role | Add user to admin role |
| `⚠️ Wait X minutes (cooldown)` | Command on cooldown | Wait or use override command |
| `❌ No active spawn in this thread` | Command used outside spawn thread | Use in attendance thread |
| `⚠️ This spawn is already closed` | Thread already processed | Create new thread |
| `❌ Insufficient points` | Not enough points for bid | Check `!mypoints` |
| `⚠️ Sheet connection failed` | Google Sheets unreachable | Check webhook URL |
| `❌ No active auction` | Auction not running | Start auction with `!startauction` |

### Logs

Check console output for detailed logs:

```bash
# Error logs
❌ Error: <error details>

# Warning logs
⚠️ Warning: <warning details>

# Success logs
✅ Success: <success details>

# Info logs
ℹ️ Info: <info details>
```

---

## 🤝 Contributing

### Guidelines

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/my-feature`
3. **Commit changes:** `git commit -m "Add my feature"`
4. **Push to branch:** `git push origin feature/my-feature`
5. **Open a Pull Request**

### Code Style

- Use descriptive variable names
- Add comments for complex logic
- Follow existing code formatting
- Test all commands before committing
- Update README for new features

### Testing Checklist

Before submitting PR:
- [ ] Bot starts without errors
- [ ] All commands tested and working
- [ ] Google Sheets integration verified
- [ ] State persistence works
- [ ] Emergency commands functional
- [ ] No memory leaks observed
- [ ] Help system updated
- [ ] README updated (if needed)

---

## 📄 License

MIT License

Copyright (c) 2025 ELYSIUM Guild

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 📞 Support

- **Discord Help:** Type `!help` in your guild
- **Emergency Issues:** Use `!emergency diag` command
- **GitHub Issues:** [Report bugs here](https://github.com/brunongmacho/elysium-attendance-bot/issues)
- **Contact:** Guild admins

---

## 📈 Changelog

### Version 8.1.1 (2025-11-05)
- 🐛 Fixed negative time display issues in auction system
  - Clamped `remainingTime` when pausing to prevent negative values
  - Clamped time display in status embed (always non-negative)
  - Clamped timer calculations to prevent negative setTimeout values
- 🔧 Improved username normalization consistency
  - Normalized usernames in bid count filter for accuracy
  - Ensures consistent username matching across all operations
- 📝 Enhanced documentation for pause/resume functionality
- ✅ Better edge case handling for late pauses and timer operations

### Version 8.1 (2025-11-05)
- ✨ Added missing `!weeklyreport` command documentation
- 🐛 Fixed `!fs` vs `!forcesubmit` naming conflict in help system
- 📝 Updated version numbers across all files
- 🔧 Improved help system command descriptions

### Version 8.0
- ✨ Open bidding system (all members can bid)
- 🎯 OCR-powered loot system
- 📊 Automated weekly leaderboards
- 🚨 Emergency recovery toolkit
- 💾 State persistence to Google Sheets
- ⏱️ 10-minute auction cooldown
- 🧹 Auto bidding channel cleanup (12h)
- 🏗️ Maintenance bulk thread creation

---

**Version:** 8.1.1
**Last Updated:** 2025-11-05
**Maintainer:** ELYSIUM Guild
**Status:** Production Ready ✅
