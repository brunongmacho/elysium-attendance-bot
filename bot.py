# bot.py
"""
Full migration of index.js v2.8 -> Python (discord.py) with feature parity.
- Uses discord.py (v2.x)
- Uses aiohttp for webhook + health server
- Implements: all message commands (!help, !addthread, !clearstate, !forcesubmit, !status, !verifyall, !verify, !resetpending, !debugthread, !closeallthread)
- Reaction verification workflow
- State recovery on startup
- Mass close + reaction cleanup with retry logic
- Preserves sheet webhook payloads (action: checkColumn, submitAttendance)
"""

import os
import re
import json
import asyncio
import logging
from datetime import datetime, timezone
import aiohttp
import discord
from discord import Embed, Intents, Thread
from discord.ext import commands
from dotenv import load_dotenv
from rapidfuzz import fuzz, process  # fast fuzzy matching
import zoneinfo

# Load env
load_dotenv()
PORT = int(os.getenv("PORT", "8000"))
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")  # required in Koyeb secrets

# Load local config
with open("config.json", "r", encoding="utf-8") as f:
    CONFIG = json.load(f)
with open("boss_points.json", "r", encoding="utf-8") as f:
    BOSS_POINTS = json.load(f)

# Logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("attendance-bot")

# Timing constants (kept parity with index.js)
TIMING = {
    "MIN_SHEET_DELAY": 2000,
    "OVERRIDE_COOLDOWN": 10000,
    "CONFIRMATION_TIMEOUT": 30_000,
    "RETRY_DELAY": 5000,
    "MASS_CLOSE_DELAY": 3000,
    "REACTION_RETRY_ATTEMPTS": 3,
    "REACTION_RETRY_DELAY": 1000
}
BOT_VERSION = "2.8"
BOT_START_TIME = datetime.now(timezone.utc)

# Intents & bot
intents = Intents.default()
intents.message_content = True
intents.guilds = True
intents.guild_messages = True
intents.reactions = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

# Runtime state (mirror index.js)
active_spawns = {}         # thread_id -> {boss, date, time, timestamp, members: [], confirm_thread_id, closed}
active_columns = {}        # "boss|timestamp" -> thread_id
pending_verifications = {} # msg_id -> {author, author_id, thread_id, timestamp}
pending_closures = {}      # msg_id -> {threadId, adminId, type}
confirmation_messages = {} # thread_id -> [msg ids]
last_sheet_call = 0

# aiohttp session
aiohttp_sess = aiohttp.ClientSession()

# timezone
MANILA = zoneinfo.ZoneInfo(CONFIG.get("timezone", "Asia/Manila"))

# Helper functions ----------------------------------------------------------

def get_current_timestamp():
    now = datetime.now(MANILA)
    date_str = now.strftime("%-m/%-d/%y")
    time_str = now.strftime("%H:%M")
    return {"date": date_str, "time": time_str, "full": f"{date_str} {time_str}"}

def format_uptime(delta_ms):
    seconds = int(delta_ms / 1000)
    minutes = seconds // 60
    hours = minutes // 60
    days = hours // 24
    if days > 0: return f"{days}d {hours % 24}h {minutes % 60}m"
    if hours > 0: return f"{hours}h {minutes % 60}m {seconds % 60}s"
    if minutes > 0: return f"{minutes}m {seconds % 60}s"
    return f"{seconds}s"

async def post_to_sheet(payload):
    """POST to Google Apps Script webhook (sheet_webhook_url). Rate-limited + retry on 429."""
    global last_sheet_call
    now_ms = int(asyncio.get_event_loop().time() * 1000)
    diff = now_ms - last_sheet_call
    if diff < TIMING["MIN_SHEET_DELAY"]:
        wait = (TIMING["MIN_SHEET_DELAY"] - diff) / 1000
        await asyncio.sleep(wait)
    last_sheet_call = int(asyncio.get_event_loop().time() * 1000)

    url = CONFIG.get("sheet_webhook_url")
    if not url:
        return {"ok": False, "err": "No webhook URL in config"}

    try:
        async with aiohttp_sess.post(url, json=payload, timeout=30) as resp:
            text = await resp.text()
            log.info("Sheet response: %s - %s", resp.status, text[:200])
            if resp.status == 429:
                log.warning("Rate limited by sheet webhook; retrying after delay")
                await asyncio.sleep(TIMING["RETRY_DELAY"]/1000)
                return await post_to_sheet(payload)
            return {"ok": resp.status < 400, "status": resp.status, "text": text}
    except Exception as e:
        log.exception("Webhook error")
        return {"ok": False, "err": str(e)}

async def check_column_exists(boss, timestamp):
    """Memory-first, then webhook checkColumn call"""
    key = f"{boss}|{timestamp}"
    if key in active_columns:
        return True
    resp = await post_to_sheet({"action": "checkColumn", "boss": boss, "timestamp": timestamp})
    if resp.get("ok"):
        try:
            data = json.loads(resp.get("text", "{}"))
            return data.get("exists", False)
        except Exception:
            return False
    return False

async def remove_all_reactions_with_retry(message, attempts=TIMING["REACTION_RETRY_ATTEMPTS"]):
    for i in range(attempts):
        try:
            await message.clear_reactions()
            log.info("Reactions removed from message %s (attempt %d)", message.id, i+1)
            return True
        except Exception as e:
            log.warning("Failed to remove reactions on %s (attempt %d): %s", message.id, i+1, e)
            if i < attempts - 1:
                await asyncio.sleep(TIMING["REACTION_RETRY_DELAY"]/1000)
    log.error("Failed to remove reactions after %d attempts: %s", attempts, message.id)
    return False

async def cleanup_all_thread_reactions(thread: Thread):
    """Remove reactions from up to 100 messages in thread; returns stats"""
    try:
        messages = [m async for m in thread.history(limit=100)]
    except Exception:
        log.exception("Could not fetch messages for thread cleanup")
        return {"success": 0, "failed": 0}

    success = 0
    failed = 0
    for msg in messages:
        if not msg.reactions:
            continue
        ok = await remove_all_reactions_with_retry(msg)
        if ok:
            success += 1
        else:
            failed += 1
        await asyncio.sleep(0.2)
    log.info("Thread cleanup for %s: %d success, %d failed", thread.id, success, failed)
    return {"success": success, "failed": failed}

def find_boss_match(q):
    """Exact, alias, then fuzzy via rapidfuzz. Returns canonical boss name or None."""
    q_norm = q.strip().lower()
    # exact & aliases
    for name, meta in BOSS_POINTS.items():
        if name.lower() == q_norm:
            return name
        for alias in meta.get("aliases", []):
            if alias.lower() == q_norm:
                return name
    # fuzzy: use rapidfuzz process.extractOne against boss keys + aliases
    choices = []
    for name, meta in BOSS_POINTS.items():
        choices.append(name)
        for alias in meta.get("aliases", []):
            choices.append(alias)
    best = process.extractOne(q, choices, scorer=fuzz.ratio)
    if best and best[1] >= 80:  # threshold ~80%
        # if best is an alias, map back to canonical
        candidate = best[0]
        for name, meta in BOSS_POINTS.items():
            if name == candidate:
                return name
            if candidate in meta.get("aliases", []):
                return name
    return None

def is_admin(member: discord.Member):
    try:
        for r in member.roles:
            if r.name in CONFIG.get("admin_roles", []):
                return True
    except Exception:
        pass
    return False

def parse_thread_name(name):
    m = re.match(r'^\[(.*?)\s+(.*?)\]\s+(.+)$', name)
    if not m: return None
    return {"date": m.group(1), "time": m.group(2), "timestamp": f"{m.group(1)} {m.group(2)}", "boss": m.group(3)}

# Thread creation -----------------------------------------------------------

async def create_spawn_threads(boss_name, date_str, time_str, full_timestamp, trigger_source="manual"):
    guild = bot.get_guild(int(CONFIG["main_guild_id"]))
    if not guild:
        log.error("Main guild not found")
        return

    att_channel = guild.get_channel(int(CONFIG["attendance_channel_id"]))
    admin_logs = guild.get_channel(int(CONFIG["admin_logs_channel_id"]))
    if not att_channel:
        log.error("Attendance channel not found")
        return

    if await check_column_exists(boss_name, full_timestamp):
        if admin_logs:
            await admin_logs.send(f"⚠️ **BLOCKED SPAWN:** {boss_name} at {full_timestamp}\nA column for this boss at this timestamp already exists. Close the existing thread first.")
        return

    thread_title = f"[{date_str} {time_str}] {boss_name}"
    att_thread = None
    confirm_thread = None
    try:
        att_thread = await att_channel.create_thread(name=thread_title, auto_archive_duration=CONFIG.get("auto_archive_minutes", 60))
    except Exception:
        log.exception("Failed to create attendance thread")
    if admin_logs:
        try:
            confirm_thread = await admin_logs.create_thread(name=f"✅ {thread_title}", auto_archive_duration=CONFIG.get("auto_archive_minutes", 60))
        except Exception:
            log.exception("Failed to create confirm thread")

    if not att_thread:
        return

    active_spawns[att_thread.id] = {
        "boss": boss_name,
        "date": date_str,
        "time": time_str,
        "timestamp": full_timestamp,
        "members": [],
        "confirm_thread_id": confirm_thread.id if confirm_thread else None,
        "closed": False
    }
    active_columns[f"{boss_name}|{full_timestamp}"] = att_thread.id

    points = BOSS_POINTS.get(boss_name, {}).get("points", "N/A")
    embed = (Embed(title=f"🎯 {boss_name}", description="Boss detected! Please check in below.")
             .add_field(name="📸 How to Check In", value="1. Post `present` or `here`\n2. Attach a screenshot (admins exempt)\n3. Wait for admin ✅", inline=False)
             .add_field(name="📊 Points", value=f"{points} points", inline=True)
             .add_field(name="🕐 Time", value=time_str, inline=True)
             .add_field(name="📅 Date", value=date_str, inline=True)
             .set_footer(text='Admins: type "close" to finalize and submit attendance')
             .set_timestamp(datetime.now(timezone.utc)))
    try:
        await att_thread.send(content="@everyone", embed=embed)
        if confirm_thread:
            await confirm_thread.send(f"🟨 **{boss_name}** spawn detected ({full_timestamp}). Verifications will appear here.")
    except Exception:
        log.exception("Failed to send spawn messages")
    log.info("Created threads for %s at %s (%s)", boss_name, full_timestamp, trigger_source)

# State recovery ------------------------------------------------------------

async def recover_state_from_threads():
    log.info("Recovering state from threads...")
    guild = bot.get_guild(int(CONFIG["main_guild_id"]))
    if not guild:
        log.warning("Guild not available for recovery")
        return

    att_channel = guild.get_channel(int(CONFIG["attendance_channel_id"]))
    admin_logs = guild.get_channel(int(CONFIG["admin_logs_channel_id"]))
    if not att_channel:
        log.warning("Attendance channel missing for recovery")
        return

    # fetch active threads using channel.active_threads()
    try:
        active_threads = await att_channel.active_threads()
        threads_iter = active_threads.threads
    except Exception:
        # fallback: iterate channel.threads attribute
        try:
            threads_iter = att_channel.threads
        except Exception:
            log.exception("Couldn't fetch threads for recovery")
            return

    recovered = 0
    pending_count = 0

    # The JS version fetches messages in parallel; we will fetch sequentially but efficiently
    for thread in threads_iter:
        parsed = parse_thread_name(thread.name)
        if not parsed:
            continue
        boss = find_boss_match(parsed["boss"])
        if not boss:
            continue
        # fetch messages
        try:
            messages = [m async for m in thread.history(limit=100)]
        except Exception:
            messages = []

        members = []
        for msg in messages:
            # bot verification messages
            if msg.author == bot.user and "verified by" in (msg.content or ""):
                m = re.search(r"\*\*(.+?)\*\* verified by", msg.content)
                if m:
                    members.append(m.group(1))
            # pending: reactions include check and x
            has_yes = any((r.emoji == "✅") or (getattr(r.emoji, "name", None) == "✅") for r in msg.reactions)
            has_no  = any((r.emoji == "❌") or (getattr(r.emoji, "name", None) == "❌") for r in msg.reactions)
            if has_yes and has_no:
                is_conf = any(k in (msg.content or "").lower() for k in ["close spawn", "react ✅ to confirm", "clear all bot memory", "force submit attendance", "mass close"])
                if is_conf:
                    continue
                # check if bot replied referencing this message
                bot_replied = any(m.reference and getattr(m.reference, "message_id", None) == msg.id and m.author == bot.user for m in messages)
                if not bot_replied:
                    # add to pending_verifications
                    try:
                        member_obj = guild.get_member(msg.author.id)
                        author_name = getattr(member_obj, "nick", None) or msg.author.name
                    except Exception:
                        author_name = msg.author.name
                    pending_verifications[msg.id] = {"author": author_name, "author_id": msg.author.id, "thread_id": thread.id, "timestamp": msg.created_at.timestamp()}
                    pending_count += 1

        active_spawns[thread.id] = {
            "boss": boss,
            "date": parsed["date"],
            "time": parsed["time"],
            "timestamp": parsed["timestamp"],
            "members": members,
            "confirm_thread_id": None,
            "closed": False
        }
        active_columns[f"{boss}|{parsed['timestamp']}"] = thread.id
        recovered += 1

    if recovered > 0:
        log.info("Recovered %d spawns, %d pending verifications", recovered, pending_count)
        if admin_logs:
            embed = (Embed(title="🔄 Bot State Recovered", description="Bot restarted and recovered existing threads")
                     .add_field(name="Spawns Recovered", value=str(recovered), inline=True)
                     .add_field(name="Pending Verifications", value=str(pending_count), inline=True)
                     .set_timestamp(datetime.now(timezone.utc)))
            try:
                await admin_logs.send(embed=embed)
            except Exception:
                log.exception("Failed to send recovery embed")
    else:
        log.info("No spawns recovered")

# Events & message handlers -------------------------------------------------

@bot.event
async def on_ready():
    log.info("Bot logged in as %s", bot.user)
    log.info("Tracking %d bosses", len(BOSS_POINTS))
    log.info("Main Guild: %s", CONFIG.get("main_guild_id"))
    log.info("Timer Server: %s", CONFIG.get("timer_server_id"))
    log.info("Version: %s", BOT_VERSION)
    asyncio.create_task(recover_state_from_threads())

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    # prefix commands
    if message.content.startswith("!"):
        parts = message.content.split()
        cmd = parts[0].lower()
        # !help
        if cmd == "!help":
            await show_help(message, message.author, parts[1] if len(parts) > 1 else None)
            return
        if cmd == "!clearstate":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only. Type `!help` for member commands.")
                return
            await handle_clear_state(message, message.author)
            return
        if cmd == "!forcesubmit":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_force_submit(message, message.author)
            return
        if cmd == "!status":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_status(message, message.author)
            return
        if cmd == "!addthread":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_addthread(message, message.author)
            return
        if cmd == "!verifyall":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_verify_all(message, message.author)
            return
        if cmd == "!verify":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_verify_member(message, message.author)
            return
        if cmd == "!resetpending":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_reset_pending(message, message.author)
            return
        if cmd == "!debugthread":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_debug_thread(message, message.author)
            return
        if cmd == "!closeallthread":
            if not is_admin(message.author):
                await message.reply("⚠️ This command is admin-only.")
                return
            await handle_close_all_threads(message, message.author)
            return

    # non-prefix in-thread commands (e.g., 'close')
    content_lc = message.content.strip().lower()
    if content_lc == "close":
        await handle_close(message, message.author)
        return

    # check-ins (present/here/join/checkin)
    if content_lc in ("present", "here", "join", "checkin"):
        thread = message.channel
        spawn = active_spawns.get(thread.id)
        if not spawn:
            await message.reply("⚠️ This thread is not recognized as a spawn thread by the bot.")
            return
        try:
            await message.add_reaction("✅")
            await message.add_reaction("❌")
        except Exception:
            pass
        conf_id = spawn.get("confirm_thread_id")
        if conf_id:
            try:
                guild = bot.get_guild(int(CONFIG["main_guild_id"]))
                conf_thread = guild.get_channel(conf_id)
                if conf_thread:
                    sent = await conf_thread.send(f"**{message.author.display_name}** requested verification in <#{thread.id}>")
                    pending_verifications[sent.id] = {"author": message.author.display_name, "author_id": message.author.id, "thread_id": thread.id, "timestamp": sent.created_at.timestamp()}
            except Exception:
                log.exception("Failed to forward verification")
        await message.reply("✅ Your check-in has been noted. Wait for an admin to verify.")
        return

    await bot.process_commands(message)

@bot.event
async def on_reaction_add(reaction, user):
    # ignore bots
    if user.bot:
        return
    msg = reaction.message
    # pending_closures handled by awaiters, so ignore here for them
    if msg.id in pending_closures:
        return
    pv = pending_verifications.get(msg.id)
    if not pv:
        return
    # only admin actions
    guild = bot.get_guild(int(CONFIG["main_guild_id"]))
    try:
        member = guild.get_member(user.id)
    except Exception:
        member = None
    if not member or not is_admin(member):
        return

    emoji = str(reaction.emoji)
    spawn_thread_id = pv["thread_id"]
    spawn = active_spawns.get(spawn_thread_id)
    try:
        if emoji == "✅":
            username = pv["author"]
            if spawn and username not in spawn["members"]:
                spawn["members"].append(username)
            spawn_thread = bot.get_channel(spawn_thread_id)
            if spawn_thread:
                await spawn_thread.send(f"**{username}** verified by {user.display_name}")
            pending_verifications.pop(msg.id, None)
            await msg.channel.send(f"✅ {username} verified by {user.display_name}")
        elif emoji == "❌":
            pending_verifications.pop(msg.id, None)
            await msg.channel.send(f"❌ {pv['author']} denied by {user.display_name}")
        await remove_all_reactions_with_retry(msg)
    except Exception:
        log.exception("Error processing verification reaction")

# Commands implementations ---------------------------------------------------

async def show_help(message, member, specific=None):
    is_admin_user = is_admin(member)
    if specific:
        await message.reply("Help detail for: " + specific)
        return
    if is_admin_user:
        embed = (Embed(title="🛡️ ELYSIUM Attendance Bot - Admin Commands", color=0x4A90E2)
                 .add_field(name="Spawn Management (Admin Logs Only)", value="`!addthread`, `!clearstate`, `!status`, `!closeallthread`", inline=False)
                 .add_field(name="Spawn Actions", value="`close`, `!forceclose`, `!forcesubmit`, `!debugthread`, `!resetpending`", inline=False)
                 .add_field(name="Verification", value="React ✅/❌ to verify; `!verify @member`", inline=False)
                 .set_footer(text=f"Version {BOT_VERSION}"))
    else:
        embed = (Embed(title="📚 ELYSIUM Attendance Bot - Member Commands", color=0xFFD700)
                 .add_field(name="Check-In", value="`present` / `here` / `join` / `checkin` (attach screenshot)", inline=False)
                 .add_field(name="Need Help?", value="Contact an admin if issues arise", inline=False)
                 .set_footer(text="Type !help for more info"))
    await message.reply(embed=embed)

async def handle_clear_state(message, member):
    confirm = await message.reply(
        f"⚠️ **WARNING: Clear all bot memory?**\n\nThis will clear:\n"
        f"• {len(active_spawns)} active spawn(s)\n• {len(pending_verifications)} pending verification(s)\n• {len(active_columns)} active column(s)\n\nReact ✅ to confirm or ❌ to cancel."
    )
    try:
        await confirm.add_reaction("✅")
        await confirm.add_reaction("❌")
    except Exception:
        pass

    def check(r, u):
        return u == message.author and str(r.emoji) in ["✅", "❌"]

    try:
        r, u = await bot.wait_for("reaction_add", timeout=30, check=check)
        if str(r.emoji) == "✅":
            active_spawns.clear(); active_columns.clear(); pending_verifications.clear(); pending_closures.clear(); confirmation_messages.clear()
            await message.reply("✅ **State cleared successfully!**")
            log.info("State cleared by %s", message.author)
        else:
            await message.reply("❌ Clear state canceled.")
    except asyncio.TimeoutError:
        await message.reply("⏱️ Confirmation timed out. Clear state canceled.")

async def handle_force_submit(message, member):
    spawn = active_spawns.get(message.channel.id)
    if not spawn:
        await message.reply("⚠️ This thread is not in bot memory. Use !debugthread to check state.")
        return
    confirm = await message.reply(
        f"📊 **Force submit attendance?**\n\n**Boss:** {spawn['boss']}\n**Timestamp:** {spawn['timestamp']}\n**Members:** {len(spawn['members'])}\n\nReact ✅ to confirm or ❌ to cancel."
    )
    try:
        await confirm.add_reaction("✅"); await confirm.add_reaction("❌")
    except Exception:
        pass
    pending_closures[confirm.id] = {"threadId": message.channel.id, "adminId": message.author.id, "type": "forcesubmit"}

    def check(r, u):
        return u == message.author and str(r.emoji) in ["✅", "❌"]

    try:
        r, u = await bot.wait_for("reaction_add", timeout=30, check=check)
        if str(r.emoji) == "✅":
            await message.channel.send(f"📊 Submitting {len(spawn['members'])} members to Google Sheets...")
            payload = {"action":"submitAttendance","boss":spawn["boss"],"date":spawn["date"],"time":spawn["time"],"timestamp":spawn["timestamp"],"members":spawn["members"]}
            resp = await post_to_sheet(payload)
            if resp.get("ok"):
                await message.channel.send(f"✅ **Attendance submitted successfully!**\n\n{len(spawn['members'])} members recorded.\nThread remains open for additional verifications if needed.")
                await remove_all_reactions_with_retry(confirm)
                pending_closures.pop(confirm.id, None)
                log.info("Force submit by %s: %s (%d members)", message.author, spawn['boss'], len(spawn['members']))
            else:
                await message.channel.send(f"⚠️ **Failed to submit attendance!**\n\nError: {resp.get('text') or resp.get('err')}\n\nMembers:\n{', '.join(spawn['members'])}")
                await remove_all_reactions_with_retry(confirm)
                pending_closures.pop(confirm.id, None)
        else:
            await message.reply("❌ Force submit canceled.")
            await remove_all_reactions_with_retry(confirm)
            pending_closures.pop(confirm.id, None)
    except asyncio.TimeoutError:
        await message.reply("⏱️ Confirmation timed out. Force submit canceled.")
        await remove_all_reactions_with_retry(confirm)
        pending_closures.pop(confirm.id, None)

async def handle_status(message, member):
    uptime_ms = (datetime.now(timezone.utc) - BOT_START_TIME).total_seconds() * 1000
    uptime = format_uptime(uptime_ms)
    time_since_sheet = f"{int((asyncio.get_event_loop().time() * 1000 - last_sheet_call)/1000)} seconds ago" if last_sheet_call else "Never"
    total_spawns = len(active_spawns)
    # sort spawns by timestamp oldest first
    def parse_ts(ts):
        try:
            date, time = ts.split(' ')
            m,d,y = date.split('/')
            h,mi = time.split(':')
            return datetime(int("20"+y), int(m), int(d), int(h), int(mi)).timestamp()
        except Exception:
            return 0
    sorted_spawns = sorted(active_spawns.items(), key=lambda kv: parse_ts(kv[1].get("timestamp","")))
    spawn_list = []
    for i,(tid, info) in enumerate(sorted_spawns[:10], start=1):
        spawn_time = parse_ts(info.get("timestamp",""))
        age_ms = (datetime.now().timestamp() - spawn_time) * 1000
        age_hours = int(age_ms // 3600000)
        age_minutes = int((age_ms % 3600000) // 60000)
        age_text = f"{age_hours}h ago" if age_hours>0 else f"{age_minutes}m ago"
        spawn_list.append(f"{i}. **{info['boss']}** ({info['timestamp']}) - {len(info['members'])} verified - {age_text} - <#{tid}>")
    spawnListText = "\n".join(spawn_list) if spawn_list else "None"
    moreSpawns = f"\n\n*+{total_spawns - 10} more spawns (sorted oldest first - close old ones first!)*" if total_spawns > 10 else ""
    embed = (Embed(title="📊 Bot Status", color=0x00FF00)
             .set_footer(text=f"Requested by {message.author.name} • Version {BOT_VERSION}")
             .set_timestamp(datetime.now(timezone.utc)))
    embed.add_field(name="⏱️ Uptime", value=uptime, inline=True)
    embed.add_field(name="🤖 Version", value=BOT_VERSION, inline=True)
    embed.add_field(name="🎯 Active Spawns", value=str(total_spawns), inline=True)
    embed.add_field(name="📋 Recent Spawn Threads (Oldest First)", value=spawnListText + moreSpawns, inline=False)
    embed.add_field(name="⏳ Pending Verifications", value=str(len(pending_verifications)), inline=True)
    embed.add_field(name="🔒 Pending Closures", value=str(len(pending_closures)), inline=True)
    embed.add_field(name="📊 Last Sheet Call", value=time_since_sheet, inline=True)
    try:
        import psutil, os as _os
        mem_mb = int(psutil.Process(_os.getpid()).memory_info().rss / 1024 / 1024)
    except Exception:
        mem_mb = "N/A"
    embed.add_field(name="💾 Memory", value=f"{mem_mb}MB", inline=True)
    await message.reply(embed=embed)

async def handle_debug_thread(message, member):
    tid = message.channel.id
    spawn = active_spawns.get(tid)
    if not spawn:
        await message.reply("⚠️ Thread not in bot memory!")
        return
    pending_in_thread = [p for p in pending_verifications.values() if p["thread_id"] == tid]
    embed = (Embed(title="🔍 Thread Debug Info", color=0x4A90E2)
             .add_field(name="🎯 Boss", value=spawn["boss"], inline=True)
             .add_field(name="⏰ Timestamp", value=spawn["timestamp"], inline=True)
             .add_field(name="🔒 Closed", value="Yes" if spawn.get("closed") else "No", inline=True)
             .add_field(name="✅ Verified Members", value=str(len(spawn["members"])), inline=False)
             .add_field(name="👥 Member List", value=", ".join(spawn["members"]) or "None", inline=False)
             .add_field(name="⏳ Pending Verifications", value=str(len(pending_in_thread)), inline=True)
             .add_field(name="📋 Confirmation Thread", value=(f"<#{spawn['confirm_thread_id']}>" if spawn.get("confirm_thread_id") else "None"), inline=True)
             .set_footer(text=f"Requested by {message.author.name}")
             .set_timestamp(datetime.now(timezone.utc)))
    await message.reply(embed=embed)

async def handle_reset_pending(message, member):
    tid = message.channel.id
    pending_in_thread = [mid for mid,p in pending_verifications.items() if p["thread_id"] == tid]
    if not pending_in_thread:
        await message.reply("✅ No pending verifications in this thread.")
        return
    confirm = await message.reply(f"⚠️ **Clear {len(pending_in_thread)} pending verification(s)?**\nReact ✅ to confirm or ❌ to cancel.")
    try:
        await confirm.add_reaction("✅"); await confirm.add_reaction("❌")
    except Exception:
        pass
    def check(r,u): return u == message.author and str(r.emoji) in ["✅","❌"]
    try:
        r,u = await bot.wait_for("reaction_add", timeout=30, check=check)
        if str(r.emoji) == "✅":
            for mid in pending_in_thread: pending_verifications.pop(mid, None)
            await message.reply(f"✅ **Cleared {len(pending_in_thread)} pending verification(s).**")
            log.info("Reset pending in %s by %s", tid, message.author)
        else:
            await message.reply("❌ Reset pending canceled.")
    except asyncio.TimeoutError:
        await message.reply("⏱️ Confirmation timed out. Reset pending canceled.")

async def handle_addthread(message, member):
    # syntax: !addthread BossName will spawn ... (YYYY-MM-DD HH:MM)
    content = message.content
    m = re.search(r'\(([^)]*?)\)\s*$', content)
    if not m:
        await message.reply("❌ Could not parse timestamp. Use `(... YYYY-MM-DD HH:MM)` format.")
        return
    ts = m.group(1).strip()
    # find boss name (text before '(')
    before = content[:m.start()].strip()
    # remove "!addthread"
    before = re.sub(r'^!addthread\s+', '', before, flags=re.I).strip()
    # try to extract boss name from start of before
    boss_name = before.split(" will")[0].strip() if " will" in before.lower() else before
    boss_key = find_boss_match(boss_name) or boss_name
    # convert ts to desired format (manila locale formatting as in original)
    try:
        dt = datetime.strptime(ts, "%Y-%m-%d %H:%M")
        dt_manila = dt.replace(tzinfo=zoneinfo.ZoneInfo("UTC")).astimezone(MANILA) if dt.tzinfo is None else dt.astimezone(MANILA)
        date_str = dt_manila.strftime("%-m/%-d/%y")
        time_str = dt_manila.strftime("%H:%M")
        full = f"{date_str} {time_str}"
    except Exception:
        await message.reply("❌ Timestamp parse failed. Use `YYYY-MM-DD HH:MM`.")
        return
    await create_spawn_threads(boss_key, date_str, time_str, full, trigger_source=f"manual by {message.author.name}")
    await message.reply(f"✅ Spawn thread created for **{boss_key}** at {full} (if channel exists).")

async def handle_verify_all(message, member):
    tid = message.channel.id
    pending_in_thread = [mid for mid,p in pending_verifications.items() if p["thread_id"] == tid]
    if not pending_in_thread:
        await message.reply("✅ No pending verifications to verify.")
        return
    confirm = await message.reply(f"⚠️ Verify ALL {len(pending_in_thread)} pending members? React ✅ to confirm.")
    try:
        await confirm.add_reaction("✅"); await confirm.add_reaction("❌")
    except Exception:
        pass
    def check(r,u): return u == message.author and str(r.emoji) in ["✅","❌"]
    try:
        r,u = await bot.wait_for("reaction_add", timeout=30, check=check)
        if str(r.emoji) == "✅":
            verified = []
            for mid in pending_in_thread:
                p = pending_verifications.get(mid)
                if not p: continue
                username = p["author"]
                spawn = active_spawns.get(p["thread_id"])
                if spawn and username not in spawn["members"]:
                    spawn["members"].append(username)
                    verified.append(username)
                # post verification message into spawn thread
                spawn_thread = bot.get_channel(p["thread_id"])
                if spawn_thread:
                    await spawn_thread.send(f"**{username}** verified by {message.author.display_name}")
                # remove pending message reactions and delete pending record
                pending_verifications.pop(mid, None)
            await message.reply(f"✅ Verified {len(verified)} members: {', '.join(verified)}")
        else:
            await message.reply("❌ Verify all canceled.")
    except asyncio.TimeoutError:
        await message.reply("⏱️ Confirmation timed out. Verify all canceled.")

async def handle_verify_member(message, member):
    # expects !verify @member
    if not message.mentions:
        await message.reply("❌ Mention a user to verify, e.g. `!verify @username`")
        return
    target = message.mentions[0]
    # find pending for that user in this thread
    tid = message.channel.id
    pending_ids = [mid for mid,p in pending_verifications.items() if p["thread_id"]==tid and (p["author_id"]==target.id or p["author"].lower()==target.display_name.lower())]
    if not pending_ids:
        # optionally add directly to spawn members if member not pending but present
        spawn = active_spawns.get(tid)
        if spawn and target.display_name not in spawn["members"]:
            spawn["members"].append(target.display_name)
            await message.reply(f"✅ {target.display_name} added to verified list.")
            return
        await message.reply("⚠️ No pending verification found for that user.")
        return
    # verify each pending id
    for pid in pending_ids:
        p = pending_verifications.pop(pid, None)
        if p:
            spawn = active_spawns.get(p["thread_id"])
            if spawn and p["author"] not in spawn["members"]:
                spawn["members"].append(p["author"])
    await message.reply(f"✅ Verified {target.display_name} (cleared {len(pending_ids)} pending)")

async def handle_close(message, member):
    # only admin
    guild = bot.get_guild(int(CONFIG["main_guild_id"]))
    mem = guild.get_member(member.id) if guild else None
    if not mem or not is_admin(mem):
        await message.reply("⚠️ This command is admin-only.")
        return
    thread = message.channel
    spawn = active_spawns.get(thread.id)
    if not spawn:
        await message.reply("⚠️ This thread is not in bot memory.")
        return
    pending_here = [mid for mid,p in pending_verifications.items() if p["thread_id"] == thread.id]
    if pending_here:
        await message.reply(f"⚠️ There are still {len(pending_here)} pending verification(s). Resolve them before closing.")
        return
    confirm = await message.reply(f"🔒 Close spawn and submit attendance?\n**Boss:** {spawn['boss']}\n**Timestamp:** {spawn['timestamp']}\n**Members:** {len(spawn['members'])}\nReact ✅ to confirm or ❌ to cancel.")
    try:
        await confirm.add_reaction("✅"); await confirm.add_reaction("❌")
    except Exception:
        pass
    def check(r,u): return u == message.author and str(r.emoji) in ["✅","❌"]
    try:
        r,u = await bot.wait_for("reaction_add", timeout=30, check=check)
        if str(r.emoji) == "✅":
            await message.channel.send(f"📊 Submitting {len(spawn['members'])} members to Google Sheets...")
            resp = await post_to_sheet({"action":"submitAttendance","boss":spawn["boss"],"date":spawn["date"],"time":spawn["time"],"timestamp":spawn["timestamp"],"members":spawn["members"]})
            if resp.get("ok"):
                await message.channel.send("✅ **Attendance submitted and thread closed.**")
                try:
                    await thread.edit(archived=True)
                except Exception:
                    try:
                        await thread.archive()
                    except Exception:
                        log.exception("Failed to archive thread")
                if spawn.get("confirm_thread_id"):
                    conf = bot.get_channel(spawn["confirm_thread_id"])
                    if conf:
                        await conf.send(f"✅ Attendance for **{spawn['boss']}** ({spawn['timestamp']}) submitted by {message.author.display_name}.")
                active_spawns.pop(thread.id, None)
                active_columns.pop(f"{spawn['boss']}|{spawn['timestamp']}", None)
            else:
                await message.channel.send(f"⚠️ Failed to submit: {resp.get('text') or resp.get('err')}")
        else:
            await message.reply("❌ Close canceled.")
    except asyncio.TimeoutError:
        await message.reply("⏱️ Confirmation timed out. Close canceled.")
    finally:
        try: await remove_all_reactions_with_retry(confirm)
        except Exception: pass

async def handle_close_all_threads(message, member):
    guild = bot.get_guild(int(CONFIG["main_guild_id"]))
    att_channel = guild.get_channel(int(CONFIG["attendance_channel_id"]))
    if not att_channel:
        await message.reply("❌ Could not find attendance channel.")
        return
    # gather active threads from memory
    threads_to_close = list(active_spawns.items())
    if not threads_to_close:
        await message.reply("✅ No active spawns to close.")
        return
    confirm = await message.reply(f"⚠️ Mass close {len(threads_to_close)} spawn(s)? React ✅ to confirm.")
    try:
        await confirm.add_reaction("✅"); await confirm.add_reaction("❌")
    except Exception:
        pass
    def check(r,u): return u == message.author and str(r.emoji) in ["✅","❌"]
    try:
        r,u = await bot.wait_for("reaction_add", timeout=30, check=check)
        if str(r.emoji) != "✅":
            await message.reply("❌ Mass close canceled.")
            return
    except asyncio.TimeoutError:
        await message.reply("⏱️ Confirmation timed out. Mass close canceled.")
        return
    # process each spawn sequentially with delays and retry
    summary = []
    for tid, spawn in threads_to_close:
        thread = bot.get_channel(tid)
        if not thread:
            summary.append((spawn["boss"], "thread not found"))
            continue
        # auto-verify pending for this thread: verify all pending_verifications matching thread
        pending_ids = [mid for mid,p in pending_verifications.items() if p["thread_id"] == tid]
        for pid in pending_ids:
            p = pending_verifications.pop(pid, None)
            if p and p["author"] not in spawn["members"]:
                spawn["members"].append(p["author"])
        # remove reactions from thread messages
        await cleanup_all_thread_reactions(thread)
        # submit attendance
        resp = await post_to_sheet({"action":"submitAttendance","boss":spawn["boss"],"date":spawn["date"],"time":spawn["time"],"timestamp":spawn["timestamp"],"members":spawn["members"]})
        if resp.get("ok"):
            try:
                await thread.edit(archived=True)
            except Exception:
                try: await thread.archive()
                except Exception: pass
            summary.append((spawn["boss"], "submitted"))
            # notify confirm thread if any
            if spawn.get("confirm_thread_id"):
                conf = bot.get_channel(spawn["confirm_thread_id"])
                if conf:
                    await conf.send(f"✅ Attendance for **{spawn['boss']}** ({spawn['timestamp']}) auto-submitted by mass-close.")
            # cleanup memory
            active_spawns.pop(tid, None)
            active_columns.pop(f"{spawn['boss']}|{spawn['timestamp']}", None)
        else:
            summary.append((spawn["boss"], "failed"))
        await asyncio.sleep(TIMING["MASS_CLOSE_DELAY"]/1000)
    # create summary message
    lines = [f"{boss}: {status}" for boss, status in summary]
    await message.channel.send("🔥 Mass close complete:\n" + "\n".join(lines))

# Health server -------------------------------------------------------------

from aiohttp import web
async def handle_health(request):
    return web.json_response({
        "status": "healthy",
        "version": BOT_VERSION,
        "uptime": format_uptime((datetime.now(timezone.utc) - BOT_START_TIME).total_seconds()*1000),
        "bot": bot.user.name if bot.user else "not ready",
        "activeSpawns": len(active_spawns),
        "pendingVerifications": len(pending_verifications),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

async def start_health_server():
    app = web.Application()
    app.router.add_get("/", handle_health)
    app.router.add_get("/health", handle_health)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    log.info("Health server started on port %s", PORT)

# Startup & graceful shutdown ------------------------------------------------

async def main():
    await start_health_server()
    await bot.start(DISCORD_TOKEN)

if __name__ == "__main__":
    async def runner():
        try:
            log.info("Starting ELYSIUM Attendance Bot (Python) ...")
            log.info("Timezone: %s", CONFIG.get("timezone", "Asia/Manila"))
            log.info("Main guild ID: %s", CONFIG.get("main_guild_id"))
            log.info("Attendance channel ID: %s", CONFIG.get("attendance_channel_id"))
            w = CONFIG.get("sheet_webhook_url","")[:60] + "..." if CONFIG.get("sheet_webhook_url") else "not set"
            log.info("Webhook: %s", w)
            await main()
        except discord.LoginFailure:
            log.error("Invalid Discord token. Set DISCORD_TOKEN env variable.")
        except Exception:
            log.exception("Bot crashed")
        finally:
            log.info("Cleaning up HTTP session...")
            try:
                await aiohttp_sess.close()
            except Exception:
                pass
            log.info("Shutdown complete.")

    try:
        asyncio.run(runner())
    except KeyboardInterrupt:
        log.info("Interrupted, shutting down.")
    finally:
        # best-effort close
        try:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(aiohttp_sess.close())
        except Exception:
            pass
