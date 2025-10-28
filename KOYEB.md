# Koyeb Deployment Guide

## Overview
This bot is optimized for deployment on **Koyeb**, a serverless container platform. The codebase has been adapted to handle Koyeb's ephemeral file system and stateless architecture.

## Critical Koyeb Considerations

### 1. Ephemeral File System
**Issue:** Koyeb containers have ephemeral storage - any files written locally are lost on restart.

**Solution:**
- ✅ **State is persisted to Google Sheets** (`_BotState` sheet)
- ✅ **Automatic periodic sync** (every 5 minutes)
- ✅ **State recovery on startup** from Google Sheets
- ✅ **Local files are cached** for performance, but not relied upon

**Files affected:**
- `bidding-state.json` - Cached locally, backed up to Google Sheets
- `tmp_*.png` - Temporary OCR files (auto-cleaned after use)

### 2. Required Environment Variables

Set these in Koyeb's environment configuration:

```bash
DISCORD_TOKEN=your_discord_bot_token
PORT=3000  # Optional, defaults to 8000
```

### 3. Exposed Ports

The Dockerfile exposes:
- Port **3000** (HTTP server)
- Port **8000** (Alternative/fallback)

Configure Koyeb to use port **3000** or **8000** depending on your preference.

### 4. Google Apps Script Integration

The bot requires a deployed Google Apps Script for data persistence:

1. Deploy `Code.js` to Google Apps Script
2. Get the web app URL
3. Update `config.json` with the URL:
   ```json
   {
     "sheet_webhook_url": "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
   }
   ```

### 5. State Management

#### How State Persistence Works:

**Local Storage (Cache):**
- Fast reads/writes
- Lost on container restart
- Used for performance

**Google Sheets (Persistent):**
- Slow but reliable
- Survives container restarts
- Auto-synced every 5 minutes
- Force-synced on critical operations

#### State Recovery Flow:

```
Container Start
  ↓
Check local bidding-state.json
  ↓ (if missing)
Load from Google Sheets (_BotState)
  ↓
Recover active auctions
  ↓
Resume normal operation
```

### 6. Docker Build

The Dockerfile uses multi-stage builds for optimization:

**Stage 1:** Install dependencies
**Stage 2:** Copy source and build
**Stage 3:** Distroless Node.js image (secure)

### 7. Memory and CPU Constraints

Koyeb free tier limits:
- **Memory:** 512MB
- **CPU:** Shared

**Optimizations:**
- Lazy loading of large data
- Efficient caching strategies
- Periodic cache cleanup

### 8. Container Health

The bot logs important health metrics:
- State sync status
- Cache age
- Recovery attempts
- API errors

Monitor these logs in Koyeb dashboard.

## Deployment Steps

### 1. Prepare Repository

```bash
# Ensure all dependencies are in package.json
npm install

# Verify Docker builds locally
docker build -t elysium-bot .
```

### 2. Configure Koyeb

1. **Connect GitHub Repository**
   - Koyeb → New Service → GitHub
   - Select `elysium-attendance-bot` repo
   - Branch: `main` (or your deployment branch)

2. **Build Settings**
   - Builder: Docker
   - Dockerfile: `./Dockerfile`

3. **Environment Variables**
   ```
   DISCORD_TOKEN=<your_token>
   ```

4. **Service Settings**
   - Port: 3000
   - Health Check: HTTP GET on `/` (if you add a health endpoint)
   - Instance: Nano (free tier)

5. **Auto-Deploy**
   - Enable automatic deployments on push to main

### 3. Verify Deployment

1. Check Koyeb logs for startup messages:
   ```
   ✅ Bot online as <BotName>
   📊 Local file not found, loading from Google Sheets...
   ✅ Loaded state from Google Sheets
   ```

2. Test bot commands in Discord:
   ```
   !status
   !help
   !mypoints
   ```

3. Monitor for errors:
   ```
   ⚠️ Local file save failed (expected on Koyeb)
   ```
   This is normal - state is backed up to Google Sheets

## Troubleshooting

### Bot doesn't start

**Check:**
1. `DISCORD_TOKEN` environment variable is set
2. Google Sheets webhook URL is correct in `config.json`
3. Koyeb logs for specific errors

### State is lost on restart

**Check:**
1. Google Sheets `_BotState` sheet exists
2. Webhook permissions allow script execution
3. State sync logs show successful writes

### Memory limits exceeded

**Solutions:**
1. Upgrade Koyeb plan
2. Reduce cache size
3. Clear old data from Google Sheets

### Commands not responding

**Check:**
1. Bot has correct Discord permissions
2. Channel IDs in `config.json` are correct
3. Admin roles are properly configured

## Key Features for Koyeb

✅ **Zero downtime deployments**
- State persists across container restarts
- Active auctions are recovered automatically

✅ **Automatic scaling**
- Handles multiple concurrent operations
- Rate-limited Google Sheets API calls

✅ **Secure environment**
- Distroless container image
- No shell access for attackers
- Environment-based secrets

✅ **Cost-effective**
- Free tier compatible
- Efficient resource usage
- Serverless architecture

## Maintenance

### Regular Tasks

1. **Monitor Google Sheets quota**
   - Limit: 1000 requests/day
   - Auto-syncs every 5 minutes max

2. **Check state integrity**
   - Review `_BotState` sheet periodically
   - Verify data consistency

3. **Update dependencies**
   - Keep Discord.js updated
   - Security patches

### Emergency Recovery

If bot crashes with corrupted state:

1. Access Google Sheets
2. Delete `_BotState` sheet rows
3. Restart Koyeb service
4. Bot will start with fresh state

## Performance Tips

1. **Optimize Google Sheets structure**
   - Index frequently accessed columns
   - Archive old data

2. **Monitor API usage**
   - Google Sheets API has quotas
   - Use batch operations when possible

3. **Cache strategically**
   - Points cache refreshes every 30 minutes during auctions
   - Attendance data cached per boss session

## Security Notes

- ✅ Never commit `DISCORD_TOKEN` to repository
- ✅ Use environment variables for secrets
- ✅ Restrict Google Sheets access to bot account only
- ✅ Review admin role permissions regularly
- ✅ Monitor audit logs in Discord and Google

## Support

For issues specific to Koyeb deployment:
1. Check Koyeb logs first
2. Verify Google Sheets connectivity
3. Review this documentation
4. Check GitHub issues

---

**Last Updated:** 2025-10-28
**Bot Version:** 6.0+
**Koyeb Compatibility:** Tested on Nano instances
