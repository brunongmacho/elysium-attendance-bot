# bot.py (FINAL WORKING VERSION)
import os
import asyncio
import re
import json
import discord
from discord.ext import commands
from datetime import datetime, timezone
# IMPORTING ALL MODULES
from modules import logger, sheet_api, boss_utils, thread_manager, state_manager, commands as cmd, health_server

# Shortcuts for cleaner logs
log = logger.log
info = logger.info
warn = logger.warn
error = logger.error
sheet = logger.sheet
done = logger.done

# ---------------------------------------------------------------------
#  CONFIG
# ---------------------------------------------------------------------
with open("config.json", "r", encoding="utf-8") as f:
    CONFIG = json.load(f)

# Ensure DISCORD_TOKEN is retrieved from environment or config
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", CONFIG.get("discord_token"))
BOT_VERSION = CONFIG.get("version", "2.8")
BOT_PREFIX = "!"

# ---------------------------------------------------------------------
#  BOT INIT & GLOBAL STATE
# ---------------------------------------------------------------------
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix=BOT_PREFIX, intents=intents)
BOT_START_TIME = datetime.now(timezone.utc)

# GLOBAL STATE DICTIONARIES (Passed to command handlers)
# These must remain in bot.py as they are the primary state holders
active_spawns = {}
active_columns = {}
pending_verifications = {}
pending_closures = {}
last_sheet_call = 0.0

boss_utils.load_boss_points()
info("Starting ELYSIUM Attendance Bot (Python)...")

# ---------------------------------------------------------------------
#  STARTUP
# ---------------------------------------------------------------------
@bot.event
async def on_ready():
    info(f"Bot logged in as {bot.user}")
    info(f"Version: {BOT_VERSION}")
    # Pass state variables to state manager for recovery
    await state_manager.recover_state_from_threads(
        bot, CONFIG, active_spawns, active_columns, pending_verifications
    )

# ---------------------------------------------------------------------
#  MESSAGE HANDLER
# ---------------------------------------------------------------------
@bot.event
async def on_message(message):
    # ignore self or bot messages
    if message.author == bot.user or message.author.bot:
        return

    content = message.content.strip()

    # -------------------- COMMAND ROUTER --------------------
    if content.startswith(BOT_PREFIX):
        await cmd.route_command(
            message, 
            bot, 
            CONFIG, 
            BOT_START_TIME, 
            active_spawns, 
            active_columns, 
            pending_verifications, 
            pending_closures, 
            # Note: last_sheet_call is managed by state_manager globally, 
            # but we pass the *local* value for status reports.
            # No need to pass it here, as commands.py now reads the global state directly
            # or is updated in sheet_api. The call for status is a specific case.
            last_sheet_call
        )
        return

    # -------------------- AUTO BOSS DETECTION --------------------
    boss_name = boss_utils.find_boss_match(content)
    if boss_name:
        guild = message.guild
        if not guild:
            return
        date_str = datetime.now().strftime("%m/%d/%y")
        time_str = datetime.now().strftime("%H:%M")
        full_ts = f"{date_str} {time_str}"
        
        att_ch = guild.get_channel(int(CONFIG["attendance_channel_id"]))
        admin_log = guild.get_channel(int(CONFIG["admin_logs_channel_id"]))
        
        # New spawn thread logic from thread_manager
        att_thread, confirm_thread = await thread_manager.create_spawn_threads(
            bot, guild, att_ch, admin_log, boss_name, date_str, time_str, full_ts
        )

        # Update state after successful creation (Moved from old bot.py logic)
        if att_thread:
            active_spawns[att_thread.id] = {
                "boss": boss_name, "date": date_str, "time": time_str, "timestamp": full_ts, 
                "members": [], "confirm_thread_id": confirm_thread.id if confirm_thread else None, 
                "closed": False,
            }
            active_columns[f"{boss_name}|{full_ts}"] = att_thread.id
            info(f"Auto-spawned {boss_name} in thread <#{att_thread.id}>")
        return

    await bot.process_commands(message)

# ---------------------------------------------------------------------
#  ENTRY POINT
# ---------------------------------------------------------------------
async def main_runner():
    """Wrapper function to handle startup, cleanup, and run the bot."""
    # 1. Start essential background services (HTTP Session & Health Server)
    await state_manager.create_http_session() # ⬅️ CRITICAL FIX: Initialize session
    await health_server.start_health_server()
    
    # 2. Start the Discord Bot
    await bot.start(DISCORD_TOKEN)

if __name__ == "__main__":
    try:
        asyncio.run(main_runner())
    except discord.LoginFailure:
        log.error("❌ Invalid Discord token. Set DISCORD_TOKEN env variable.")
    except KeyboardInterrupt:
        log.info("🛑 Interrupted, shutting down.")
    except Exception:
        log.exception("❌ Bot crashed")
    finally:
        # 3. Clean up the aiohttp session on exit
        log.info("🌐 Cleaning up HTTP session...")
        asyncio.run(state_manager.close_http_session()) # ⬅️ CRITICAL FIX: Close session
        log.info("🛑 Shutdown complete.")