# ELYSIUM Guild Bot

Discord bot for managing guild attendance tracking and auction-based loot distribution.

![Status](https://img.shields.io/badge/status-production-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

### 🎯 Attendance System
- Boss spawn check-ins with screenshot verification
- Automatic points assignment
- Admin verification workflow (✅/❌ reactions)
- Google Sheets integration
- State recovery on restart

### 🔨 Auction System
**Two Modes:**
- **Attendance-Based** - Only attendees can bid on boss-specific items
- **Open Auctions** - Manual queue items open to all members

**Features:**
- 30-second preview before each item with @everyone ping
- Automatic pause if bid in last 10 seconds
- +1 minute extension on confirmed bids
- Point-based bidding with locked points system
- Race condition protection

### 🎁 Loot System
- OCR-powered screenshot reading
- Automatic item logging to Google Sheets
- Boss loot tracking with blacklist filtering

### 🚨 Emergency Recovery
Complete toolkit for stuck states (requires confirmation):
- Force close threads
- Force end auctions
- Unlock locked points
- Clear pending confirmations
- State diagnostics
- Force sync to Google Sheets

## Quick Start

```bash
# Install
npm install

# Configure
cp config.example.json config.json
# Edit config.json with your Discord IDs and Google Sheets webhook

# Set environment variable
echo "DISCORD_TOKEN=your_token_here" > .env

# Run
node index2.js
```

## Key Commands

### For Members
- `present` or `here` - Check in for boss spawns (requires screenshot)
- `!bid <amount>` - Bid on auction items
- `!mypoints` - Check available points

### For Admins

**Attendance:**
- `!status` - Bot health check
- `!verify @member` - Manual verification
- `!forceclose` - Force close thread
- `!closeallthread` - Mass close all threads

**Auctions:**
- `!startauction` - Start auction session
- `!auction <item> <price> <duration>` - Add manual item
- `!pause` / `!resume` - Control auction
- `!stop` - End current item

**Emergency (use when stuck):**
- `!emergency diag` - Show state
- `!emergency closeall` - Force close all threads
- `!emergency endauction` - Force end auction
- `!emergency unlock` - Unlock all points
- `!emergency sync` - Force save to sheets

Type `!help` in Discord for complete command list.

## Configuration

Edit `config.json`:

```json
{
  "main_guild_id": "YOUR_GUILD_ID",
  "attendance_channel_id": "CHANNEL_ID",
  "admin_logs_channel_id": "CHANNEL_ID",
  "bidding_channel_id": "CHANNEL_ID",
  "timer_server_id": "SERVER_ID",
  "sheet_webhook_url": "GOOGLE_APPS_SCRIPT_URL",
  "admin_roles": ["Admin", "Officer"]
}
```

## Google Sheets Setup

Required sheets:
1. **Attendance** - Boss spawn tracking
2. **BiddingPoints** - Member points
3. **BiddingItems** - Auction queue
4. **BotState** - State persistence

Deploy Apps Script with `doPost()` webhook handler.

## How It Works

### Attendance Flow
1. Boss spawn detected → Thread created
2. Members type `present` with screenshot
3. Admin verifies with ✅ reaction
4. Points auto-assigned
5. Thread closed → Data submitted to sheets

### Auction Flow
1. Admin runs `!startauction`
2. Items grouped by boss (attendance required)
3. **30-second preview** with @everyone ping
4. Members bid → 10-second confirmation
5. If bid in last 10s → **auction pauses**
6. On confirmation → **+1 min extension**
7. Winner announced, points deducted

## Emergency Recovery

If bot gets stuck:
1. `!emergency diag` - Check state
2. Use appropriate recovery command
3. Confirm with ✅ reaction
4. State auto-saves to Google Sheets

## Architecture

```
index2.js              - Main bot
attendance.js          - Attendance system
auctioneering.js       - Auction sessions
bidding.js             - Bidding engine
loot-system.js         - OCR processing
emergency-commands.js  - Recovery toolkit
help-system.js         - Command docs
```

## State Persistence

- **Local:** `bidding-state.json` (fast access)
- **Cloud:** Google Sheets `BotState` tab (survives restarts)
- Auto-sync every 5 minutes
- Full recovery on startup

## Security

- Admin role verification
- Confirmation for destructive actions
- Rate limiting (3s cooldown on bids)
- Screenshot verification required
- Race condition protection

## Support

- Type `!help` in Discord
- Use `!emergency diag` for diagnostics
- Check GitHub issues
- Contact guild admins

## License

MIT License

---

**Version:** 3.1
**Last Updated:** 2025-10-29
