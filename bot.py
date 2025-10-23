# bot.py
import os
import asyncio
import re
import discord
from discord.ext import commands
from datetime import datetime, timezone
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
import json
with open("config.json", "r", encoding="utf-8") as f:
    CONFIG = json.load(f)

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", CONFIG.get("discord_token"))
BOT_VERSION = CONFIG.get("version", "2.8")
BOT_PREFIX = "!"

# ---------------------------------------------------------------------
#  BOT INIT
# ---------------------------------------------------------------------
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix=BOT_PREFIX, intents=intents)
BOT_START_TIME = datetime.now(timezone.utc)

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
    await state_manager.recover_state_from_threads(bot, CONFIG, active_spawns, active_columns, pending_verifications)
    await health_server.start_health_server()

# ---------------------------------------------------------------------
#  MESSAGE HANDLER
# ---------------------------------------------------------------------
@bot.event
async def on_message(message):
    # ignore self or bot messages
    if message.author == bot.user or message.author.bot:
        return

    content = message.content.strip()

    # -------------------- COMMAND HANDLER --------------------
    if content.startswith(BOT_PREFIX):
        parts = content[len(BOT_PREFIX):].split(" ")
        cmd_name = parts[0].lower()
        args = parts[1:]

        if cmd_name == "help":
            await cmd.handle_help(message, args)
        elif cmd_name == "status":
            await cmd.handle_status(message, active_spawns, pending_verifications, pending_closures, last_sheet_call, BOT_VERSION, BOT_START_TIME)
        elif cmd_name == "debugthread":
            await cmd.handle_debug_thread(message, active_spawns, pending_verifications)
        elif cmd_name == "addthread":
            await cmd.handle_add_thread(message, CONFIG, bot)
        elif cmd_name == "reload":
            boss_utils.load_boss_points()
            await message.reply("♻️ Boss list reloaded.")
        else:
            await message.reply(f"❓ Unknown command: `{cmd_name}`")
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
        await thread_manager.create_spawn_threads(bot, guild, att_ch, admin_log, boss_name, date_str, time_str, full_ts)
        return

    await bot.process_commands(message)

# ---------------------------------------------------------------------
#  ENTRY POINT
# ---------------------------------------------------------------------
async def main():
    await bot.start(DISCORD_TOKEN)

if __name__ == "__main__":
    asyncio.run(main())
