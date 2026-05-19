# ELYSIUM Guild Bot

A production Discord bot for MMORPG guild management — attendance tracking, auction systems, boss spawn timers, leaderboards, and emergency recovery. Built for the ELYSIUM guild, adaptable to any game.

![Status](https://img.shields.io/badge/status-production-success)
![Version](https://img.shields.io/badge/version-9.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Discord.js](https://img.shields.io/badge/discord.js-v14.25.1-5865F2)
![MongoDB](https://img.shields.io/badge/MongoDB-primary-success)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Architecture](#architecture)
- [Boss System](#boss-system)
- [Tech Stack](#tech-stack)
- [Deployment](#deployment)
- [Development](#development)

---

## Overview

ELYSIUM Guild Bot handles the day-to-day operations of an active MMORPG guild inside Discord. Members check in to boss spawns, bid on loot, and track their stats — all without leaving the server. Admins get tools for rotation management, emergency recovery, attendance verification, and detailed reporting.

The bot runs on Node.js with Discord.js v14, stores data in MongoDB (with a Google Sheets backup layer), and uses cron-based scheduling for weekly reports, daily rotation posts, and event reminders.

### What changed in v9.0

The codebase was refactored from a monolithic 8,199-line entry point into a modular structure:
- Core systems extracted into `bot/` modules (message handler, command handlers, interaction handler, confirm utils, init orchestration)
- Boss timer broken into `modules/boss-timer/` submodules
- Slash command system lives in `commands/` with definitions, handlers, autocomplete, and registration
- 69 slash commands registered alongside traditional `!` prefix commands
- Help system rebuilt to show both forms with aliases and tips
- MongoDB provides 40–200x speedup over legacy Google Sheets

---

## Features

### Attendance Tracking

Members check in to boss spawns via attendance threads. Screenshot uploads are required for non-admin members. Admins verify submissions with reaction buttons (checkmark / cross). Threads auto-close after 30 minutes to prevent late submissions. Points sync automatically to MongoDB and Google Sheets.

### Auction System

Open point-based bidding — any ELYSIUM member can bid on loot items. The system includes a 30-second preview phase, auto-extend on last-minute bids (anti-snipe), dedicated threads per item, session history, and admin controls (pause, resume, extend, skip, cancel). Auctions run on a Sunday schedule with a 10-minute cooldown between sessions.

### Boss Timer & Spawn Prediction

37 bosses tracked across two modes:
- **Timer-based** (22 bosses) — dynamic predictions using kill time + spawn interval (10h–62h)
- **Schedule-based** (14 bosses) — fixed weekly schedule with 99% confidence predictions
- **Guild Boss** (15 points) — special tracked event

Fuzzy name matching handles typos via Levenshtein distance. All predictions use Discord native relative timestamps for live countdowns.

### Boss Rotation

Multi-guild rotation tracking for shared world bosses. Supports any number of guilds (typically 3–5). ELYSIUM is always position 1. Auto-increments after kills, posts daily schedule at midnight Manila time, and falls back to attendance records when timers are unavailable.

### Leaderboards & Reports

- Attendance rankings (top 10 by points)
- Bidding rankings (top 10 by remaining points)
- Weekly reports (auto-posted Monday)
- Monthly reports (auto-posted last day of month)
- Activity heatmap for 24-hour guild activity visualization

### Emergency Recovery

A full toolkit for stuck states: force-close threads, force-end auctions, unlock points, clear bids, diagnostics, and force-sync to Google Sheets. All emergency commands require confirmation with a 30-second timeout.

### Help System

Channel-aware — shows only relevant commands based on where you are. Attendance threads show attendance commands. Auction threads show bidding commands. Admin channels show admin commands. Both `!` prefix and `/` slash forms are displayed together with aliases.

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- A Discord bot token (from Discord Developer Portal)
- A MongoDB Atlas account (free tier works)
- Google Sheets with Apps Script webhook (optional, for backup)
- 512 MB RAM minimum

### Setup

```bash
# Clone and enter
git clone <your-repo-url>
cd elysium-attendance-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Discord token and MongoDB URI

# Configure bot settings
# Edit config.json with your Discord server IDs and channel IDs

# Start the bot
npm start
```

On first run, the bot syncs historical data from Google Sheets to MongoDB, then connects to Discord and restores any active state from MongoDB.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `NODE_ENV` | No | `production` or `development` |
| `PORT` | No | HTTP server port (default 3000) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `SKIP_ATTENDANCE_SYNC` | No | Skip sync on startup |

---

## Configuration

The main configuration file is `config.json`:

```json
{
  "version": "3.0",
  "main_guild_id": "YOUR_GUILD_ID",
  "attendance_channel_id": "CHANNEL_ID",
  "bidding_channel_id": "CHANNEL_ID",
  "admin_logs_channel_id": "CHANNEL_ID",
  "elysium_commands_channel_id": "CHANNEL_ID",
  "boss_timer_channel_id": "CHANNEL_ID",
  "admin_roles": ["GUILD LEADER", "ELITE", "Admin"],
  "elysium_role": "ELYSIUM",
  "timezone": "Asia/Manila",
  "auto_archive_minutes": 60,
  "sheet_webhook_url": "YOUR_WEBHOOK_URL"
}
```

Game-specific data lives in separate JSON files:
- `boss_points.json` — boss names, point values, aliases
- `boss_spawn_config.json` — spawn intervals and schedules

Member lore and profiles are in `member-lore.json`.

---

## Commands

Every command comes in two forms: `!prefix` for fast typing and `/slash` for discoverability. Both work identically.

### Help

| Command | Description |
|---------|-------------|
| `!help` / `/help` | Channel-aware command reference |
| `!?` `!commands` `!cmds` | Aliases for help |

### Boss Timer (boss_timer channel)

| Command | Description |
|---------|-------------|
| `!killed <boss> [time]` | Record a boss kill |
| `!spawned <boss>` | Confirm boss spawned, open attendance thread |
| `!nextspawn` | View upcoming spawns |
| `!setboss <boss> <status>` | Set boss status (alive/killed/spawned) |
| `!clearkills` | Clear all kill records (admin) |
| `!nospawn <boss>` | Report boss didn't spawn |
| `!unkill <boss>` | Remove a kill record |
| `!timers` | Show boss timer help |

**Aliases:** `!whennext`, `!spawntimer`

### Admin (admin_logs channel, admin only)

| Command | Description | Aliases |
|---------|-------------|---------|
| `!status` / `/status` | Bot health dashboard | `!st` |
| `!closeallthread` / `/closeall` | Close all spawn threads | `!closeall` |
| `!maintenance` / `/maintenance` | Create maintenance threads | `!maint` |
| `!openthread <boss>` / `/openthread` | Open new attendance thread | |
| `!overrideclose` / `/overrideclose` | Force-close current thread | |
| `!removemember` / `/remove-member` | Remove a member | `!removemem`, `!rmmember`, `!delmember` |
| `!rotation` / `/rotation` | Manage boss rotation (status/set/increment/refresh) | |
| `!weekly` / `/weekly` | Generate weekly report | `!week` |
| `!monthly` / `/monthly` | Generate monthly report | `!month` |

### Auction Admin (admin_logs, admin only)

| Command | Description | Aliases |
|---------|-------------|---------|
| `!startauction` / `/auction start` | Start auction | `!auction`, `!start`, `!startauc` |
| `!startauctionnow` / `/auction start-now` | Start immediately | `!auc-now`, `!begin-auction` |
| `!endauction` / `/auction end` | End auction session | |
| `!forcesubmitresults` / `/auction force-submit` | Force submit results | |
| `!queuelist` / `/queue list` | View auction queue | `!ql`, `!queue` |

### Emergency (admin_logs, admin only)

All available via `!emergency <subcommand>` / `/emergency <subcommand>` (alias: `!emerg`).

| Command | Description | Alias |
|---------|-------------|-------|
| `!emergency close [thread]` | Force-close a thread | `!fct` |
| `!emergency close-all` | Close all threads | `!fcat` |
| `!emergency end-auction` | End a stuck auction | `!fea` |
| `!emergency unlock-points` | Release all locked points | `!unlock` |
| `!emergency clear-bids` | Clear pending bids | `!clearbids` |
| `!emergency diagnostics` | System diagnostics | `!diag` |
| `!emergency force-sync` | Force Google Sheets sync | `!fsync` |

### Member Commands (guild_chat, bot_commands)

| Command | Description | Aliases |
|---------|-------------|---------|
| `!stats [member]` / `/stats [member]` | View stats | `!profile`, `!info`, `!mystats` |
| `!newmember` / `/newmember` | New member guide | `!nm` |
| `!leaderboardattendance` / `/leaderboards attendance` | Attendance rankings | `!lba`, `!lbattendance`, `!leadatt` |
| `!leaderboardbidding` / `/leaderboards bidding` | Bidding rankings | `!lbb`, `!lbbidding`, `!leadbid` |
| `!leaderboards` / `/leaderboards combined` | Combined view | `!lb`, `!leaderboard` |
| `!activity [week]` / `/activity [week]` | Activity heatmap | `!heatmap`, `!guildactivity` |

### Auction Thread

| Command | Description | Alias |
|---------|-------------|-------|
| `!bid <amount>` / `/bid <amount>` | Place a bid | `!b` |

### Attendance Thread

The following keywords trigger attendance check-in (with screenshot):
`present`, `here`, `join`, `checkin`

---

## Architecture

```
elysium-attendance-bot/
├── index2.js                  # Entry point — wires modules together (1,104 lines)
├── bot/                       # Extracted modules
│   ├── message-handler.js     # Message create event dispatch
│   ├── command-handlers.js    # All !prefix command handlers (30 handlers)
│   ├── interaction-handler.js # Slash interaction handling
│   ├── init.js                # Module initialization orchestration
│   └── confirm-utils.js       # Confirmation dialog helpers
├── commands/                  # Slash command system
│   ├── slash-commands.js      # 69 slash command definitions
│   ├── handlers.js            # Slash command → synthetic message bridge
│   ├── autocomplete.js        # Autocomplete suggestions
│   ├── register-commands.js   # Command registration with Discord
│   └── tip-system.js          # Command usage tips
├── modules/boss-timer/        # Boss timer submodules
│   ├── index.js, state.js, admin-commands.js, spawn-tracking.js
├── utils/                     # Shared infrastructure
│   ├── database-api.js        # MongoDB connection pooling
│   ├── mongodb-helpers.js     # CRUD operations
│   ├── sheet-api.js           # Google Sheets API wrapper
│   ├── logger.js              # Pino structured logging
│   ├── error-handler.js       # Centralized error handling
│   ├── crash-recovery.js      # State persistence and recovery
│   └── shutdown-manager.js    # Graceful shutdown
├── config/                    # Configuration
│   ├── config.json            # Bot settings (channels, roles, timezone)
│   ├── command-aliases.js     # 47 command aliases
│   ├── boss_points.json       # Boss names and point values
│   └── boss_spawn_config.json # Spawn intervals and schedules
└── scripts/                   # Startup and maintenance
    ├── startup.js             # Full startup with sync
    ├── sync-sheets-to-mongodb.js
```

### Data Flow

```
Discord Client
      ↓
index2.js (entry point)
      ↓
┌────────────────┬───────────────┬──────────────┐
│  bot/ modules  │  commands/    │  core systems │
│  handlers      │  slash cmds   │  attendance   │
│  message       │  handlers     │  bidding      │
│  interaction   │  autocomplete │  boss-timer   │
└────────────────┴───────────────┴──────────────┘
      ↓
┌──────────────────────────────┐
│         utils/ layer         │
│  database-api  ── MongoDB    │
│  sheet-api     ── Sheets     │
│  logger, error-handler       │
└──────────────────────────────┘
```

### Design Principles

- **Module pattern** — clean function APIs for each system
- **Dual-write** — MongoDB primary with Google Sheets backup (zero data loss)
- **Circuit breaker** — graceful degradation for external services
- **In-memory cache** — O(1) lookups for hot paths
- **Self-healing** — full state restoration in <1 second on restart

---

## Boss System

### All 37 Bosses

**Timer-based (22)** — spawn interval determines next spawn time:

| Boss | Interval | Boss | Interval |
|------|----------|------|----------|
| Venatus | 10h | Viorent | 10h |
| Ego | 21h | Livera | 24h |
| Araneo | 24h | Undomiel | 24h |
| Lady Dalia | 18h | General Aquleus | 29h |
| Amentis | 29h | Baron Braudmore | 32h |
| Wannitas | 48h | Metus | 48h |
| Duplican | 48h | Shuliar | 35h |
| Gareth | 32h | Titore | 37h |
| Larba | 35h | Catena | 35h |
| Secreta | 62h | Ordo | 62h |
| Asta | 62h | Supore | 62h |

**Schedule-based (14)** — fixed weekly schedule:

| Boss | Schedule |
|------|----------|
| Clemantis | Mon 11:30, Thu 19:00 |
| Saphirus | Sun 17:00, Tue 11:30 |
| Neutro | Tue 19:00, Thu 11:30 |
| Thymele | Mon 19:00, Wed 11:30 |
| Milavy | Sat 15:00 |
| Ringor | Sat 17:00 |
| Roderick | Fri 19:00 |
| Auraq | Fri 22:00, Wed 21:00 |
| Chaiflock | Sat 22:00 |
| Benji | Sun 21:00 |
| Guild Boss | Mon 21:30 |
| Icaruthia | Tue 21:00, Fri 21:00 |
| Motti | Wed 19:00, Sat 19:00 |
| Nevaeh | Sun 22:00 |

### Points

| Points | Bosses |
|--------|--------|
| 1 | Venatus, Viorent, Ego, Clemantis, Livera, Araneo, Undomiel, Saphirus, Neutro, Lady Dalia, General Aquleus, Thymele, Amentis, Baron Braudmore |
| 2 | Milavy, Wannitas, Metus, Duplican, Shuliar, Ringor, Roderick, Gareth, Titore, Larba |
| 3 | Catena, Auraq, Secreta, Ordo, Asta, Supore, Chaiflock, Benji |
| 4 | Icaruthia, Motti, Nevaeh |
| 5 | GvG |
| 15 | Guild Boss |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Discord | Discord.js v14.25.1 |
| Database | MongoDB (Atlas) |
| Backup | Google Sheets + Apps Script |
| Scheduling | node-cron |
| Logging | Pino + pino-pretty |
| Fuzzy matching | fast-levenshtein |
| HTTP | axios, node-fetch |

### Dependencies

```
discord.js ^14.25.1    axios ^1.13.2          mongodb ^7.0.0
node-cron ^4.2.1       node-fetch ^3.3.2      pino ^10.1.0
pino-pretty ^13.1.3    fast-levenshtein ^3.0.0  uuid ^13.0.0
```

### Performance

- MongoDB queries: 10–500ms depending on operation
- Memory: ~95–105 MB RSS, fits comfortably in 512 MB instances
- Crash recovery: <1 second with full state restoration
- CPU: <5% average under normal load

---

## Deployment

### Production Start

```bash
npm start                    # Fast start (sync in background)
npm run start:sync           # Full sync before bot starts
npm run start:direct         # Direct start with GC flags
```

### Docker

```bash
docker build -t elysium-bot .
docker run -d \
  --name elysium-bot \
  -e DISCORD_TOKEN=your_token \
  -e MONGODB_URI=your_mongodb_uri \
  elysium-bot
```

### PM2 (recommended for production)

```bash
npm install -g pm2
pm2 start index2.js --name elysium-bot
pm2 save
pm2 startup
```

### Health Check

An HTTP server exposes health status at `/health`:
```json
{
  "status": "ok",
  "uptime": 86400,
  "memory": { "heapUsed": 23.5, "heapTotal": 25.0, "rss": 102.3 }
}
```

### Supported Platforms

Koyeb, Railway, Render, Heroku, or any VPS with Node.js 18+ and 512 MB RAM.

---

## Development

### Project Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Fast startup (sync in background) |
| `npm run start:sync` | Full sync before bot starts |
| `npm run start:direct` | Direct start with GC flags |
| `npm run sync` | Manual MongoDB sync |
| `npm test` | Run Jest tests |
| `npm run test:coverage` | Coverage report |

### Adding a New Command

1. Add the handler function in `bot/command-handlers.js`
2. Add the command to the help system in `help-system-v2.js`
3. Wire it in `bot/message-handler.js` for `!` prefix routing
4. Add a slash command definition in `commands/slash-commands.js`
5. Add the handler in `commands/handlers.js`
6. Register the command: `node commands/register-commands.js`
7. Add aliases to `config/command-aliases.js` if needed

### Convention

- ES6+ JavaScript with async/await
- Try-catch on all async operations
- Structured logging with Pino
- Modules stay focused on one responsibility
- Both `!` and `/` forms for every command

---

## License

MIT License — see [LICENSE](./LICENSE).

Built for ELYSIUM Guild with Discord.js v14 and MongoDB.
