#!/data/data/com.termux/files/usr/bin/bash
#===============================================================================
# Tenchu Bot + Dashboard — First-Time Termux Setup
# Run this on a fresh Termux installation to set up everything:
#   curl -fsSL https://raw.githubusercontent.com/brunongmacho/elysium-attendance-bot/main/scripts/setup-termux.sh | bash
#===============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   TENCHU BOT + DASHBOARD — TERMUX SETUP          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

#---------------------------------------
# Step 1 — Update Termux packages
#---------------------------------------
echo -e "${YELLOW}[1/9] Updating Termux packages...${NC}"
pkg update -y && pkg upgrade -y
echo -e "${GREEN}  ✅ Packages updated${NC}"

#---------------------------------------
# Step 2 — Install dependencies
#---------------------------------------
echo -e "${YELLOW}[2/9] Installing dependencies (nodejs, git, nano)...${NC}"
pkg install -y nodejs-lts git nano
echo -e "${GREEN}  ✅ Dependencies installed${NC}"

#---------------------------------------
# Step 3 — Request storage permission
#---------------------------------------
echo -e "${YELLOW}[3/9] Setting up storage access...${NC}"
termux-setup-storage 2>/dev/null || echo -e "  ⚠️  Skipped (not critical)"
echo -e "${GREEN}  ✅ Storage ready${NC}"

#---------------------------------------
# Step 4 — Clone repository
#---------------------------------------
echo -e "${YELLOW}[4/9] Cloning repository...${NC}"
if [ -d "elysium-attendance-bot" ]; then
  echo -e "  ${YELLOW}Repo already exists, updating...${NC}"
  cd elysium-attendance-bot
  git pull origin main
else
  git clone https://github.com/brunongmacho/elysium-attendance-bot.git
  cd elysium-attendance-bot
fi
echo -e "${GREEN}  ✅ Repository ready${NC}"

#---------------------------------------
# Step 5 — Install PM2 globally
#---------------------------------------
echo -e "${YELLOW}[5/9] Installing PM2...${NC}"
npm install -g pm2
echo -e "${GREEN}  ✅ PM2 installed${NC}"

#---------------------------------------
# Step 6 — Install bot dependencies
#---------------------------------------
echo -e "${YELLOW}[6/9] Installing bot dependencies...${NC}"
npm install
echo -e "${GREEN}  ✅ Bot dependencies installed${NC}"

#---------------------------------------
# Step 7 — Install dashboard dependencies
#---------------------------------------
echo -e "${YELLOW}[7/9] Installing dashboard dependencies...${NC}"
cd dashboard
npm install
cd ..
echo -e "${GREEN}  ✅ Dashboard dependencies installed${NC}"

#---------------------------------------
# Step 8 — Create config files if missing
#---------------------------------------
echo -e "${YELLOW}[8/9] Setting up config files...${NC}"

if [ ! -f "config.json" ]; then
  cat > config.json << 'CONFIGEOF'
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "main_guild_id": "YOUR_GUILD_ID",
  "attendance_channel_id": "YOUR_ATTENDANCE_CHANNEL_ID",
  "admin_logs_channel_id": "YOUR_ADMIN_LOGS_CHANNEL_ID",
  "bidding_channel_id": "YOUR_BIDDING_CHANNEL_ID",
  "tenchu_commands_channel_id": "YOUR_COMMANDS_CHANNEL_ID",
  "tenchu_role": "TENCHU",
  "admin_roles": [],
  "sheet_webhook_url": "YOUR_WEBHOOK_URL"
}
CONFIGEOF
  echo -e "  ${YELLOW}⚠️  Created config.json — EDIT THIS FILE: nano config.json${NC}"
else
  echo -e "  ✅ config.json already exists"
fi

if [ ! -f "ecosystem.config.js" ]; then
  cp ecosystem.config.example.js ecosystem.config.js
  echo -e "  ${YELLOW}⚠️  Created ecosystem.config.js — EDIT THIS FILE: nano ecosystem.config.js${NC}"
else
  echo -e "  ✅ ecosystem.config.js already exists"
fi

#---------------------------------------
# Step 9 — Build dashboard
#---------------------------------------
echo -e "${YELLOW}[9/9] Building dashboard...${NC}"
cd dashboard
npm run build 2>&1 | tail -5
cd ..
echo -e "${GREEN}  ✅ Dashboard built${NC}"

#---------------------------------------
# Done — show next steps
#---------------------------------------
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   SETUP COMPLETE!                                 ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Before starting, fill in your config files:"
echo -e "  ${YELLOW}1. nano config.json${NC}"
echo -e "     → Paste your Discord bot token, guild ID, channel IDs"
echo -e "     → Run !setup guild after starting the bot to auto-fill"
echo ""
echo -e "  ${YELLOW}2. nano ecosystem.config.js${NC}"
echo -e "     → Fill in DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET"
echo -e "     → NEXTAUTH_SECRET is already generated"
echo ""
echo -e "Then start everything:"
echo -e "  ${BLUE}pm2 start ecosystem.config.js${NC}"
echo -e "  ${BLUE}pm2 save${NC}"
echo ""
echo -e "Access dashboard at: http://localhost:3001"
echo ""
