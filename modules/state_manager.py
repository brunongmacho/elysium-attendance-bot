# modules/state_manager.py
import re
import discord
from datetime import datetime, timezone
from modules.logger import info, warn, error
from modules.boss_utils import find_boss_match

active_spawns = {}
active_columns = {}
pending_verifications = {}
pending_closures = {}

def parse_thread_name(name: str):
    """Extract boss, date, and time from thread name: [MM/DD/YY HH:MM] BossName"""
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
    """Rebuild active_spawns and pending_verifications on startup."""
    info("Recovering state from threads...")

    guild = bot.get_guild(int(config["main_guild_id"]))
    if not guild:
        warn("Guild not available for recovery")
        return

    att_channel = guild.get_channel(int(config["attendance_channel_id"]))
    admin_logs = guild.get_channel(int(config["admin_logs_channel_id"]))

    if not att_channel:
        warn("Attendance channel missing for recovery")
        return

    try:
        threads = await att_channel.active_threads()
        threads_iter = threads.threads
    except Exception:
        try:
            threads_iter = att_channel.threads
        except Exception:
            error("Couldn't fetch threads for recovery")
            return

    recovered = 0
    pending_count = 0

    for thread in threads_iter:
        parsed = parse_thread_name(thread.name)
        if not parsed:
            continue
        boss = find_boss_match(parsed["boss"])
        if not boss:
            continue

        try:
            messages = [m async for m in thread.history(limit=100)]
        except Exception:
            messages = []

        members = []
        for msg in messages:
            if msg.author == bot.user and "verified by" in (msg.content or ""):
                m = re.search(r"\*\*(.+?)\*\* verified by", msg.content)
                if m:
                    members.append(m.group(1))

            has_yes = any(
                (r.emoji == "✅") or (getattr(r.emoji, "name", None) == "✅") for r in msg.reactions
            )
            has_no = any(
                (r.emoji == "❌") or (getattr(r.emoji, "name", None) == "❌") for r in msg.reactions
            )
            if has_yes and has_no:
                bot_replied = any(
                    m.reference
                    and getattr(m.reference, "message_id", None) == msg.id
                    and m.author == bot.user
                    for m in messages
                )
                if not bot_replied:
                    try:
                        member_obj = guild.get_member(msg.author.id)
                        author_name = getattr(member_obj, "nick", None) or msg.author.name
                    except Exception:
                        author_name = msg.author.name
                    pending_verifications[msg.id] = {
                        "author": author_name,
                        "author_id": msg.author.id,
                        "thread_id": thread.id,
                        "timestamp": msg.created_at.timestamp(),
                    }
                    pending_count += 1

        active_spawns[thread.id] = {
            "boss": boss,
            "date": parsed["date"],
            "time": parsed["time"],
            "timestamp": parsed["timestamp"],
            "members": members,
            "confirm_thread_id": None,
            "closed": False,
        }
        active_columns[f"{boss}|{parsed['timestamp']}"] = thread.id
        recovered += 1

    if recovered > 0:
        info(f"Recovered {recovered} spawns, {pending_count} pending verifications")
        if admin_logs:
            embed = (
                discord.Embed(
                    title="🔄 Bot State Recovered",
                    description="Bot restarted and recovered existing threads"
                )
                .add_field(name="Spawns Recovered", value=str(recovered), inline=True)
                .add_field(name="Pending Verifications", value=str(pending_count), inline=True)
            )
            embed.timestamp = datetime.now(timezone.utc)
            try:
                await admin_logs.send(embed=embed)
            except Exception:
                error("Failed to send recovery embed")
    else:
        info("No spawns recovered")
