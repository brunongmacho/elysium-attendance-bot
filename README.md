# Elysium Attendance Bot

Purpose
- A Discord bot to detect boss spawn announcements (from a "timer" server), create attendance threads in the main guild, accept member check-ins with screenshots, and record verified attendance into a Google Sheet via a webhook.
- Points per boss are defined in `boss_points.json`. Verification is performed by admins reacting with ✅.

Repository layout (key files)
- index.js — Main Node.js bot. Connects to Discord, detects spawn messages, creates threads, collects check-ins, handles admin verification reactions, and posts attendance payloads to a Google Apps Script webhook.
- config.json — Non-sensitive runtime configuration (IDs, webhook URL, timezone, roles). Replace or override with environment variables for secrets.
- boss_points.json — Boss list and points mapping (used for display and point values).
- Code.gs — Google Apps Script source to receive webhook POSTs, manage weekly sheets, mark attendance checkboxes, and log verifications.
- package.json / package-lock.json — Node dependencies (discord.js, node-fetch, fast-levenshtein).
- Dockerfile — Multi-stage image optimized to cache dependency installation.
- .dockerignore / .gitignore (recommended) — Exclude node_modules, .git, logs to speed Docker builds and avoid pushing large uploads.

How it works (high level)
1. The bot connects to Discord using DISCORD_TOKEN (must be set as env var).
2. It listens to messages in the configured timer server/channel. When a message matches a "will spawn in" pattern and contains a bolded boss name, it fuzzy-matches that name against `boss_points.json`.
3. On match:
   - Creates an attendance thread in the configured attendance channel.
   - Creates a confirmation/admin thread in the admin logs channel.
   - Posts instructions and tracks the spawn in runtime state.
4. Members check in by posting the keywords (present, here, join, checkin) inside the attendance thread and must attach a screenshot.
   - The bot reacts with ✅ to indicate a pending verification and stores a pending record in memory.
5. Admins verify attendance by reacting ✅ to the member message.
   - The bot validates the reactor is an admin (matching role names from config) and not the attendee.
   - The bot POSTs attendance details to the Google Apps Script webhook (configured in config.json).
   - On success, the Apps Script updates the weekly sheet (creates spawn column, sets checkboxes, marks attendance) and returns success. The bot posts confirmation into the admin/confirmation thread.

Configuration
- Recommended: keep secrets out of VCS. Use Railway / environment variables.
- Required env:
  - DISCORD_TOKEN — bot token (index.js exits if missing).
- config.json fields (example present in repo):
  - main_guild_id, timer_server_id, timer_channel_id, attendance_channel_id, admin_logs_channel_id
  - admin_roles — array of role names allowed to verify
  - sheet_webhook_url — URL to deployed Google Apps Script web app (receives POST attendance payloads)
  - timezone, auto_archive_minutes, week_start

Google Sheets integration (Code.gs)
- Deploy Code.gs as a Web App (Execute as: Me, Access: Anyone with the link) to obtain the webhook URL.
- doPost(e) expects JSON with: user, boss, spawnLabel, verifier, verifierId, timestamp.
- The script:
  - Ensures a weekly sheet exists (prefix `ELYSIUM_WEEK_YYYYMMDD` using the week's Sunday).
  - Creates a spawn column (two header rows: date and boss+number) and checkbox validation for member rows.
  - Finds or creates the member row and marks the checkbox true.
  - Logs verifications into an `AttendanceLog` sheet.
- Important: Code.gs persists data in Google Sheets — ensure proper permissions and that the webhook URL is kept private.

Running locally
1. Install dependencies:
   - npm ci
2. Provide DISCORD_TOKEN as an environment variable:
   - Windows (cmd): set DISCORD_TOKEN=token_here
   - PowerShell: $env:DISCORD_TOKEN="token_here"
   - Or use Railway secrets / .env and a loader (not present in repo).
3. Start:
   - npm start
4. The bot reads config.json at startup. Consider replacing secrets in config.json with env var usage for production.

Deployment notes (Railway / Docker)
- Use the provided Dockerfile which copies package*.json first to leverage caching.
- Important: add `.dockerignore` to exclude `node_modules`, `.git`, logs — this greatly reduces file upload size and speeds builds.
- Do NOT commit node_modules. If already committed, remove it from the repo index:
  - git rm -r --cached node_modules
  - add node_modules/ to .gitignore
  - commit & push
- Railway builds may be slow if the uploaded build context is large or if dependencies need compilation. Cancel and re-run builds after fixing .dockerignore.

Data persistence and recommendations
- The bot keeps spawn and pending attendance in memory. If the process restarts, that runtime state is lost. The authoritative record is the Google Sheet.
- boss_points.json is a static mapping in the repo. For safer runtime updates, consider moving it to the Google Sheet `BossPoints` sheet or a small persistent DB.
- Avoid writing mutable runtime data to committed JSON files in the repo.

Security & best practices
- Never commit tokens, private keys, or node_modules.
- Use Railway / GitHub secrets or environment variables for DISCORD_TOKEN and any other credentials.
- Limit the exposed Google Apps Script webhook (rotate URL if leaked) and validate incoming requests if possible.

Troubleshooting (common issues)
- Bot exits with "DISCORD_TOKEN environment variable not set!" — set DISCORD_TOKEN before running.
- Fuzzy name matching fails — add aliases in `boss_points.json` or adjust Levenshtein tolerance in index.js.
- Duplicate attendance/verification errors — the Apps Script checks for duplicates and returns a duplicate response; the bot surfaces that to admins.
- Railway build slow or failing — check build logs: is the upload stage slow (context too large) or npm install slow? Fix `.dockerignore` and use the Dockerfile caching pattern.
- Push failing due to large files — run: git ls-files --larger-than=100M and remove large files from history if present.

Suggested next improvements
- Read secrets from environment variables rather than committing them to config.json.
- Persist active spawn/pending state to a small DB or file storage to survive restarts.
- Add request authentication to the Google Apps Script webhook (e.g., secret token header).
- Move boss points into the Google Sheet `BossPoints` and use Code.gs getBossPoints for authoritative values.
- Add clearer error logging and admin commands to reconcile attendance.

If you want, I can:
- Modify index.js to read config values from environment variables with sensible fallbacks.
- Add a sample .env.example and update README run instructions.
- Add .dockerignore to this repo if missing and a shorter Dockerfile tweak to further speed Railway builds.

