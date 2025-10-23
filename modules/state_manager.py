# modules/state_manager.py
import re
import discord
import aiohttp
from datetime import datetime, timezone
from modules.logger import info, warn, error, recovery, log
from modules.boss_utils import find_boss_match # Assumed utility

# --- Global State Variables ---
active_spawns = {} 
active_columns = {} 
pending_verifications = {} 
pending_closures = {} 

aiohttp_sess = None 
last_sheet_call = 0.0 


# --- Session Management for Koyeb Health Check and API ---
async def create_http_session():
    """Initializes the global aiohttp ClientSession."""
    global aiohttp_sess
    aiohttp_sess = aiohttp.ClientSession()
    info("Created global aiohttp session.")

async def close_http_session():
    """Closes the global aiohttp ClientSession."""
    global aiohttp_sess
    if aiohttp_sess and not aiohttp_sess.closed:
        await aiohttp_sess.close()
        info("Closed global aiohttp session.")


# --- Recovery Logic (Simplified for clarity) ---
def parse_thread_name(name: str):
    match = re.match(r"\[(\d{1,2}/\d{1,2}/\d{2,4}) (\d{1,2}:\d{2})\]\s*(.+)", name)
    if match:
        date, time, boss = match.groups()
        return {
            "date": date,
            "time": time,
            "timestamp": f"{date} {time}",
            "boss": boss.strip()
        }
    return None

async def recover_state_from_threads(bot, config):
    recovery("Recovering state from threads...")
    # NOTE: The full implementation requires iterating through all threads, 
    # fetching the first message to check the owner, and fetching history to 
    # rebuild 'active_spawns' and 'pending_verifications'.
    
    # Placeholder for recovery logic execution:
    guild = bot.get_guild(int(config["main_guild_id"]))
    if not guild:
         warn("Guild not available for recovery.")
         return
         
    # Example snippet:
    # for thread in guild.threads:
    #     parsed = parse_thread_name(thread.name)
    #     if parsed:
    #         # ... rebuild state based on thread history
    #         pass 

    info(f"Recovery complete. {len(active_spawns)} spawns active, {len(pending_verifications)} pending.")