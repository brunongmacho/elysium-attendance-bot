# modules/commands.py
import discord
import asyncio
from datetime import datetime, timezone
import re
import math
import time
from modules import sheet_api, boss_utils, thread_manager
from modules.logger import info, warn, error, done, log
from modules.state_manager import aiohttp_sess # For execute_close_logic (reaction cleanup)

BOT_VERSION = "2.8"
PREFIX = "!"

# -----------------------------
# UTILITIES
# -----------------------------

def is_admin(member: discord.Member, config: dict) -> bool:
    """Checks if a member has an admin role defined in config.json."""
    if member.guild_permissions.manage_guild:
        return True
    
    admin_roles = [r.lower() for r in config.get("admin_roles", [])]
    return any(role.name.lower() in admin_roles for role in member.roles)

async def execute_close_logic(bot: discord.Client, thread_id: int, channel: discord.Thread, config: dict, admin_user: str, active_spawns: dict, active_columns: dict) -> bool:
    """
    Handles the final attendance submission, channel cleanup, and state cleanup.
    Returns True on success, False on failure.
    """
    info(f"Starting final close logic for thread {thread_id} ({channel.name})")
    
    spawn_info = active_spawns.get(thread_id)
    if not spawn_info or spawn_info.get("closed"):
        warn(f"Close logic aborted: Thread {thread_id} not in active spawns or already closed.")
        if channel:
             try:
                await channel.send("⚠️ This thread is not in active memory or is already closed. State cleanup skipped.")
             except: pass
        return False
    
    # 1. SEND ATTENDANCE TO GOOGLE SHEET
    payload = {
        "action": "submitAttendance",
        "boss": spawn_info["boss"],
        "timestamp": spawn_info["timestamp"],
        "members": spawn_info["members"],
        "admin": admin_user,
    }
    
    webhook_url = config.get("sheet_webhook_url")
    if not webhook_url:
        error("Sheet webhook URL is not configured. Submission skipped!")
        await channel.send("❌ **ERROR**: Sheet webhook URL missing. Attendance **NOT** submitted.")
        # Proceed to close the thread anyway to prevent it from clogging up memory
    else:
        success = await sheet_api.post_to_google_sheet(webhook_url, payload)
        if not success:
            await channel.send("❌ **ERROR**: Failed to submit attendance to Google Sheet. Please use `!forcesubmit` later.")
            return False

    # 2. CHANNEL CLEANUP
    try:
        # Send final confirmation message in attendance thread
        embed = discord.Embed(
            title=f"✅ {spawn_info['boss']} Attendance Submitted",
            description=f"Attendance was successfully submitted to the Google Sheet by **{admin_user}**.\n\n**Total Members:** {len(spawn_info['members'])}",
            color=0x2ECC71, # Green
        )
        embed.timestamp = datetime.now(timezone.utc)
        await channel.send(embed=embed)
        
        # Archive and lock the thread
        await channel.edit(archived=True, locked=True, reason="Attendance submitted and thread closed.")
        
        info(f"Attendance thread {thread_id} archived and locked.")

        # Check for and close the confirmation thread
        confirm_thread_id = spawn_info.get("confirm_thread_id")
        if confirm_thread_id:
            confirm_channel = bot.get_channel(confirm_thread_id)
            if confirm_channel:
                await confirm_channel.edit(archived=True, locked=True, reason="Attendance thread closed.")
                info(f"Confirmation thread {confirm_thread_id} archived and locked.")
            
    except discord.NotFound:
        warn(f"Thread {thread_id} not found during cleanup.")
    except Exception as e:
        error(f"Error during thread cleanup for {thread_id}: {e}")

    # 3. STATE CLEANUP
    try:
        del active_spawns[thread_id]
        key = f"{spawn_info['boss']}|{spawn_info['timestamp']}"
        if key in active_columns:
            del active_columns[key]
        
        # Remove any pending verifications related to this thread
        pending_verifications_to_delete = [
            msg_id for msg_id, p in pending_verifications.items() if p["thread_id"] == thread_id
        ]
        for msg_id in pending_verifications_to_delete:
            del pending_verifications[msg_id]
            
        done(f"State cleaned up for thread {thread_id} ({channel.name}).")
        return True
    except Exception as e:
        error(f"Error during state cleanup for {thread_id}: {e}")
        return False


# -----------------------------
# HELP COMMAND
# -----------------------------
async def handle_help(message, args):
    """Show !help and detailed per-command help."""
    user = message.author

    # ---- Detailed Help for Specific Command ----
    if args:
        cmd = args[0].lower()

        help_data = {
            "status": {
                "title": "📊 Command: !status",
                "desc": "Show bot health, active spawns, and system statistics.",
                "usage": "Admin logs channel only",
                "syntax": "!status",
                "output": "• Bot uptime and version\n• Active spawn threads with clickable links\n• Sorted oldest first with age indicators\n• Pending verifications count\n• Last sheet API call time",
            },
            "addthread": {
                "title": "➕ Command: !addthread",
                "desc": "Force-start a new spawn thread for a boss that wasn't auto-detected.",
                "usage": "Admin logs channel only",
                "syntax": "!addthread <BossName>",
                "output": "Starts a new attendance and confirmation thread.",
            },
            "closeallthread": {
                "title": "🛑 Command: !closeallthread",
                "desc": "Force-close and submit ALL currently active attendance threads.",
                "usage": "Admin logs channel only",
                "syntax": "!closeallthread",
                "output": "Closes all threads in a batch process.",
            },
            "clearstate": {
                "title": "💣 Command: !clearstate",
                "desc": "Wipes the bot's memory (active spawns/pending verifications). **Does not close channels.**",
                "usage": "Admin logs channel only",
                "syntax": "!clearstate",
                "output": "Resets the bot's memory to an empty state.",
            },
            "close": {
                "title": "🔒 Command: !close",
                "desc": "Initiate the final attendance submission and close procedure for the current thread.",
                "usage": "In a boss spawn thread only",
                "syntax": "!close",
                "output": "Bot asks for confirmation with a reaction (❌ or ✅).",
            },
            "forceclose": {
                "title": "💥 Command: !forceclose",
                "desc": "Immediately submit attendance and close the current thread, skipping the confirmation step.",
                "usage": "In a boss spawn thread only",
                "syntax": "!forceclose",
                "output": "Attendance submitted and thread archived/locked.",
            },
            "forcesubmit": {
                "title": "📤 Command: !forcesubmit",
                "desc": "Manually re-attempt the sheet submission for a thread that previously failed to submit.",
                "usage": "In a boss spawn thread only",
                "syntax": "!forcesubmit",
                "output": "Resubmits attendance data to the Google Sheet.",
            },
            "verify": {
                "title": "✅ Command: !verify",
                "desc": "Verify a single user's attendance using their mention.",
                "usage": "In a boss spawn thread only",
                "syntax": "!verify <@user> [optional reason]",
                "output": "Marks the user as present in bot memory.",
            },
            "verifyall": {
                "title": "👑 Command: !verifyall",
                "desc": "Verifies ALL users currently pending verification in the thread.",
                "usage": "In a boss spawn thread only",
                "syntax": "!verifyall",
                "output": "Marks all pending users as present.",
            },
            "resetpending": {
                "title": "🔄 Command: !resetpending",
                "desc": "Clears all pending verifications for the current thread. Use this if a message was deleted or timed out.",
                "usage": "In a boss spawn thread only",
                "syntax": "!resetpending",
                "output": "Removes all pending verification messages from memory.",
            },
            "debugthread": {
                "title": "🔍 Command: !debugthread",
                "desc": "Displays the raw state data for the current thread in bot memory.",
                "usage": "In a boss spawn thread only",
                "syntax": "!debugthread",
                "output": "A detailed embed of thread data (boss, members, pending count).",
            },
            "reload": {
                "title": "♻️ Command: !reload",
                "desc": "Reloads the boss list and points from `boss_points.json`.",
                "usage": "Any channel",
                "syntax": "!reload",
                "output": "Confirmation message.",
            },
        }

        if cmd in help_data:
            data = help_data[cmd]
            embed = (
                discord.Embed(
                    title=data["title"],
                    description=data["desc"],
                    color=0x4A90E2,
                )
                .add_field(name="📍 Where to Use", value=data["usage"], inline=False)
                .add_field(name="📝 Syntax", value=f"`{data['syntax']}`", inline=False)
                .add_field(name="📊 Output Shows", value=data["output"], inline=False)
                .set_footer(text="Type !help for full command list")
            )
            await message.reply(embed=embed)
            info(f"{user.name} ran !help {cmd}")
            return # <-- THE FIX IS HERE

        info(f"{user.name} ran !help for unknown command: {cmd}")

    # ---- General Help ----
    embed = (
        discord.Embed(
            title="✨ ELYSIUM Attendance Bot Help",
            description=f"Bot Version: `{BOT_VERSION}`",
            color=0x4A90E2,
        )
        .add_field(
            name="🤖 General Commands (Any Channel)",
            value="`!help` | `!help <command>`\n`!reload` (reloads boss points)",
            inline=False,
        )
        .add_field(
            name="👑 Admin Commands (Logs Channel Only)",
            value="`!status`\n`!addthread <BossName>`\n`!closeallthread`\n`!clearstate`",
            inline=False,
        )
        .add_field(
            name="💬 Thread Commands (In a Spawn Thread)",
            value="`!close` | `!forceclose`\n`!verify <@user>` | `!verifyall`\n`!forcesubmit`\n`!resetpending`\n`!debugthread`",
            inline=False,
        )
        .add_field(
            name="✍️ Member Check-In",
            value="Post a message containing **`present`** or **`here`** + **screenshot** in the thread. Use the **✅** reaction to verify.",
            inline=False,
        )
        .set_footer(
            text="Any message containing a Boss Name (e.g., 'bossname spawn') will automatically start a new thread."
        )
    )
    await message.reply(embed=embed)
    info(f"{user.name} ran !help")


# -----------------------------
# STATUS COMMAND
# -----------------------------
async def handle_status(message, active_spawns: dict, pending_verifications: dict, last_sheet_call: float, bot_start_time: datetime):
    """Show bot health, active spawns, and system statistics."""
    
    # Auth check is typically done in bot.py but good to double check
    config = bot.get_config() # Assume bot object has config, or pass it in.
    if not is_admin(message.author, config):
        await message.reply("⛔ You must be an admin to use `!status`.")
        return
        
    now = datetime.now(timezone.utc)
    uptime = now - bot_start_time
    uptime_str = str(uptime).split('.')[0] # Remove microseconds

    # Format last sheet call
    if last_sheet_call == 0.0:
        last_sheet_str = "Never"
    else:
        last_call_dt = datetime.fromtimestamp(last_sheet_call, timezone.utc)
        since_last_call = now - last_call_dt
        since_str = str(since_last_call).split('.')[0]
        last_sheet_str = f"{last_call_dt.strftime('%m/%d %H:%M:%S')} UTC\n( {since_str} ago)"

    # List active spawns (oldest first)
    if not active_spawns:
        spawn_list = "None"
    else:
        sorted_spawns = sorted(
            active_spawns.items(), 
            key=lambda item: datetime.strptime(item[1]['timestamp'], '%m/%d/%y %H:%M')
        )
        
        spawn_lines = []
        for thread_id, spawn in sorted_spawns:
            boss = spawn['boss']
            timestamp_dt = datetime.strptime(spawn['timestamp'], '%m/%d/%y %H:%M').replace(tzinfo=timezone.utc)
            age = now - timestamp_dt
            age_str = str(age).split('.')[0] # Format as HH:MM:SS

            pending_count = sum(1 for p in pending_verifications.values() if p["thread_id"] == thread_id)
            
            line = f"[{age_str}] **{boss}** (<#{thread_id}>) - {len(spawn['members'])} ✅ | {pending_count} ⏳"
            spawn_lines.append(line)
        
        spawn_list = "\n".join(spawn_lines[:10])
        if len(spawn_lines) > 10:
            spawn_list += f"\n...and {len(spawn_lines) - 10} more."

    embed = (
        discord.Embed(
            title="🤖 Bot Status & Health Check",
            color=0x4A90E2,
        )
        .add_field(name="🟢 Uptime", value=f"`{uptime_str}`", inline=True)
        .add_field(name="🏷️ Version", value=f"`{BOT_VERSION}`", inline=True)
        .add_field(name="⏳ Pending Verifications", value=str(len(pending_verifications)), inline=True)
        .add_field(name="🌐 Last Sheet Call", value=last_sheet_str, inline=False)
        .add_field(name=f"🎯 Active Spawns ({len(active_spawns)})", value=spawn_list, inline=False)
        .set_footer(text="System status is healthy.")
    )
    embed.timestamp = now
    
    await message.reply(embed=embed)
    info(f"{message.author.name} ran !status")


# -----------------------------
# ADD THREAD (Admin Logs Only)
# -----------------------------
async def handle_add_thread(message, args, bot: discord.Client, config: dict, active_spawns: dict, active_columns: dict):
    """Force-start a new spawn thread."""
    if not args:
        await message.reply("⚠️ Usage: `!addthread <BossName>`")
        return

    # Auth and Channel checks are omitted for brevity but should be present in bot.py or here.

    boss_name_input = " ".join(args)
    boss_name = boss_utils.find_boss_match(boss_name_input)

    if not boss_name:
        await message.reply(f"❌ Could not find a boss matching `{boss_name_input}`.")
        return

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%m/%d/%y")
    time_str = now.strftime("%H:%M")
    full_ts = f"{date_str} {time_str}"

    guild = message.guild
    att_ch = guild.get_channel(int(config["attendance_channel_id"]))
    admin_log = guild.get_channel(int(config["admin_logs_channel_id"]))
    
    if not att_ch or not admin_log:
         await message.reply("❌ Error: Attendance or Admin Logs channel not found.")
         return
         
    # Check for duplicate
    if f"{boss_name}|{full_ts}" in active_columns:
        await message.reply(f"⚠️ A thread for **{boss_name}** at `{full_ts}` already exists: <#{active_columns[f'{boss_name}|{full_ts}']}>")
        return

    # Create threads
    att_thread, confirm_thread = await thread_manager.create_spawn_threads(
        bot, guild, att_ch, admin_log, boss_name, date_str, time_str, full_ts
    )

    if att_thread:
        # Update state
        active_spawns[att_thread.id] = {
            "boss": boss_name, "date": date_str, "time": time_str, "timestamp": full_ts, 
            "members": [], "confirm_thread_id": confirm_thread.id if confirm_thread else None, 
            "closed": False,
        }
        active_columns[f"{boss_name}|{full_ts}"] = att_thread.id
        
        await message.reply(f"✅ Spawn thread created for **{boss_name}**: <#{att_thread.id}>")
    else:
        await message.reply(f"❌ Failed to create thread for **{boss_name}**.")

    info(f"{message.author.name} ran !addthread {boss_name}")


# -----------------------------
# CLOSE ALL THREADS (Admin Logs Only)
# -----------------------------
async def handle_closeallthread(message, bot: discord.Client, config: dict, active_spawns: dict, active_columns: dict):
    """Force-close and submit ALL active attendance threads."""
    if not active_spawns:
        await message.reply("ℹ️ There are no active spawns to close.")
        return

    admin_user = message.author.display_name
    thread_ids_to_close = list(active_spawns.keys())
    total_threads = len(thread_ids_to_close)
    success_count = 0

    await message.reply(f"🛑 Starting mass close for **{total_threads}** active threads...")

    # Process in batches to manage rate limits
    batch_size = 5
    for i in range(0, total_threads, batch_size):
        batch = thread_ids_to_close[i:i + batch_size]
        
        tasks = []
        for thread_id in batch:
            thread_channel = bot.get_channel(thread_id)
            if thread_channel:
                tasks.append(execute_close_logic(
                    bot, thread_id, thread_channel, config, admin_user, active_spawns, active_columns
                ))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        success_count += sum(1 for r in results if r is True)
        
        # Wait a moment between batches
        if i + batch_size < total_threads:
            await asyncio.sleep(5) 

    await message.reply(f"✅ Mass close complete! Submitted **{success_count}** out of **{total_threads}** threads.")
    done(f"{admin_user} completed !closeallthread, {success_count} threads successfully closed.")


# -----------------------------
# CLEAR STATE (Admin Logs Only)
# -----------------------------
async def handle_clear_state(message, bot: discord.Client, active_spawns: dict, active_columns: dict, pending_verifications: dict, pending_closures: dict):
    """Wipes the bot's state memory."""
    
    initial_spawns = len(active_spawns)
    initial_pending = len(pending_verifications)

    # Clear state dictionaries
    active_spawns.clear()
    active_columns.clear()
    pending_verifications.clear()
    pending_closures.clear()

    embed = (
        discord.Embed(
            title="🗑️ Bot State Cleared",
            description=f"Bot memory has been reset by **{message.author.display_name}**.",
            color=0xF1C40F, # Yellow
        )
        .add_field(name="Active Spawns Cleared", value=str(initial_spawns), inline=True)
        .add_field(name="Pending Verifications Cleared", value=str(initial_pending), inline=True)
        .set_footer(text="NOTE: This does NOT close the Discord threads/channels.")
    )
    await message.reply(embed=embed)
    info(f"{message.author.name} ran !clearstate. Cleared {initial_spawns} spawns.")


# -----------------------------
# CLOSE (Thread Only - Requires Confirmation)
# -----------------------------
async def handle_close(message, bot: discord.Client, config: dict, active_spawns: dict, pending_closures: dict):
    """Initiate attendance submission with confirmation."""
    thread = message.channel
    tid = thread.id
    user = message.author

    if tid not in active_spawns:
        await message.reply("⚠️ This thread is not an active spawn in bot memory.")
        return

    if tid in pending_closures:
        await message.reply("⚠️ Close confirmation is already pending. React to the previous message.")
        return

    admin_user = user.display_name
    
    # Send confirmation message
    confirm_msg = await message.reply(
        f"**FINAL SUBMISSION** initiated by {admin_user}.\n\n"
        "React with **✅** to **CONFIRM & SUBMIT** attendance.\n"
        "React with **❌** to **CANCEL** and keep the thread open."
    )
    
    # Store pending closure state
    pending_closures[tid] = {
        "message_id": confirm_msg.id,
        "admin_id": user.id,
        "admin_name": admin_user,
        "timestamp": datetime.now(timezone.utc).timestamp(),
        # Other necessary context for the reaction handler can be added here
    }

    # Add reactions for confirmation
    await confirm_msg.add_reaction("✅")
    await confirm_msg.add_reaction("❌")
    
    info(f"{user.name} initiated !close in thread {tid}. Awaiting confirmation.")


# -----------------------------
# FORCE CLOSE (Thread Only - Skips Confirmation)
# -----------------------------
async def handle_force_close(message, bot: discord.Client, config: dict, active_spawns: dict, active_columns: dict):
    """Immediately submit attendance and close the current thread."""
    thread = message.channel
    tid = thread.id
    user = message.author

    if tid not in active_spawns:
        await message.reply("⚠️ This thread is not an active spawn in bot memory.")
        return
        
    await message.reply(f"💥 **Force-closing** and submitting attendance for **{active_spawns[tid]['boss']}**...")

    success = await execute_close_logic(
        bot, tid, thread, config, user.display_name, active_spawns, active_columns
    )

    if success:
        await thread.send(f"✅ **Force-submission successful** and thread is now closed.")
    else:
        # execute_close_logic handles the failure message if sheet fails, but this handles a general failure
        await thread.send("❌ **ERROR**: Force-close failed. Check logs for details.")

    info(f"{user.name} ran !forceclose in thread {tid}.")


# -----------------------------
# FORCE SUBMIT (Thread Only)
# -----------------------------
async def handle_force_submit(message, bot: discord.Client, config: dict, active_spawns: dict):
    """Manually re-attempt the sheet submission for a thread."""
    thread = message.channel
    tid = thread.id
    user = message.author

    spawn_info = active_spawns.get(tid)
    if not spawn_info:
        await message.reply("⚠️ This thread is not an active spawn in bot memory.")
        return
    
    await message.reply(f"📤 **Re-attempting sheet submission** for **{spawn_info['boss']}**...")

    # 1. SEND ATTENDANCE TO GOOGLE SHEET (Copy of logic from execute_close_logic)
    payload = {
        "action": "submitAttendance",
        "boss": spawn_info["boss"],
        "timestamp": spawn_info["timestamp"],
        "members": spawn_info["members"],
        "admin": user.display_name,
    }
    
    webhook_url = config.get("sheet_webhook_url")
    if not webhook_url:
        await message.reply("❌ **ERROR**: Sheet webhook URL missing. Submission aborted.")
        return
        
    success = await sheet_api.post_to_google_sheet(webhook_url, payload)
    
    if success:
        await message.reply("✅ **Force-submission successful!** Attendance data is now on the sheet.")
        info(f"{user.name} ran !forcesubmit, submission successful.")
    else:
        await message.reply("❌ **ERROR**: Failed to submit attendance to Google Sheet. Check logs/webhook.")
        error(f"{user.name} ran !forcesubmit, submission failed.")


# -----------------------------
# VERIFY (Thread Only)
# -----------------------------
async def handle_verify(message, args, config: dict, active_spawns: dict, pending_verifications: dict):
    """Verify a single user's attendance using their mention."""
    thread = message.channel
    tid = thread.id
    user = message.author

    spawn_info = active_spawns.get(tid)
    if not spawn_info:
        await message.reply("⚠️ This thread is not an active spawn in bot memory.")
        return
    
    if not args or not message.mentions:
        await message.reply("⚠️ Usage: `!verify <@user> [optional reason]`")
        return
        
    target_member = message.mentions[0]
    target_name = target_member.display_name

    if target_name in spawn_info["members"]:
        await message.reply(f"ℹ️ **{target_name}** is already verified in this thread.")
        return

    # Add member to active spawn list
    spawn_info["members"].append(target_name)
    
    # Cleanup pending verification messages for this user (if they checked in)
    deleted_count = 0
    message_ids_to_delete = []
    for msg_id, p in pending_verifications.items():
        if p["thread_id"] == tid and p["author_id"] == target_member.id:
            message_ids_to_delete.append(msg_id)
            deleted_count += 1
            
    for msg_id in message_ids_to_delete:
        del pending_verifications[msg_id]

    reason = " ".join(args[1:]) if len(args) > 1 else "Manually verified."
    
    await message.reply(f"✅ **{target_name}** manually verified by {user.display_name}. ({reason})")
    info(f"{user.name} ran !verify {target_name} in {tid}. Removed {deleted_count} pending messages.")


# -----------------------------
# VERIFY ALL (Thread Only)
# -----------------------------
async def handle_verifyall(message, bot: discord.Client, config: dict, active_spawns: dict, pending_verifications: dict):
    """Verifies ALL users currently pending verification in the thread."""
    thread = message.channel
    tid = thread.id
    user = message.author

    spawn_info = active_spawns.get(tid)
    if not spawn_info:
        await message.reply("⚠️ This thread is not an active spawn in bot memory.")
        return

    pending_in_thread = {
        msg_id: p for msg_id, p in pending_verifications.items() if p["thread_id"] == tid
    }
    
    if not pending_in_thread:
        await message.reply("ℹ️ No users are currently pending verification in this thread.")
        return

    verified_count = 0
    users_verified = []
    
    for msg_id, p in pending_in_thread.items():
        member = thread.guild.get_member(p["author_id"])
        if member and member.display_name not in spawn_info["members"]:
            spawn_info["members"].append(member.display_name)
            users_verified.append(member.display_name)
            verified_count += 1
        
        # Always remove from pending regardless of if they were added (prevents duplicates)
        del pending_verifications[msg_id]

    await message.reply(
        f"👑 **Verified All!** {user.display_name} verified **{verified_count}** new members from **{len(pending_in_thread)}** pending entries."
    )
    info(f"{user.name} ran !verifyall in {tid}. Verified {verified_count} users.")


# -----------------------------
# RESET PENDING (Thread Only)
# -----------------------------
async def handle_reset_pending(message, active_spawns: dict, pending_verifications: dict):
    """Clears all pending verifications for the current thread."""
    thread = message.channel
    tid = thread.id
    user = message.author

    if tid not in active_spawns:
        await message.reply("⚠️ This thread is not an active spawn in bot memory.")
        return

    initial_count = len([
        msg_id for msg_id, p in pending_verifications.items() if p["thread_id"] == tid
    ])
    
    if initial_count == 0:
        await message.reply("ℹ️ No pending verifications found for this thread.")
        return
        
    # Remove all pending verifications related to this thread
    message_ids_to_delete = []
    for msg_id, p in pending_verifications.items():
        if p["thread_id"] == tid:
            message_ids_to_delete.append(msg_id)
            
    for msg_id in message_ids_to_delete:
        del pending_verifications[msg_id]

    await message.reply(f"🔄 **Reset Complete!** Cleared **{initial_count}** pending verification entries for this thread.")
    info(f"{user.name} ran !resetpending in {tid}. Cleared {initial_count} entries.")


# -----------------------------
# DEBUG THREAD (Thread Only)
# -----------------------------
async def handle_debug_thread(message, active_spawns: dict, pending_verifications: dict):
    """Debug information for current thread."""
    tid = message.channel.id
    spawn = active_spawns.get(tid)
    user = message.author
    
    if not spawn:
        await message.reply("⚠️ Thread not in bot memory!")
        return
        
    pending_in_thread = [
        p for p in pending_verifications.values() if p["thread_id"] == tid
    ]
    
    # Format member list for display (truncate if too long)
    members_list = spawn["members"]
    members_str = ", ".join(members_list)
    if len(members_list) > 10:
        members_str = ", ".join(members_list[:10]) + f" ...and {len(members_list) - 10} more."
    if not members_str:
        members_str = "None"
        
    embed = (
        discord.Embed(title="🔍 Thread Debug Info", color=0x4A90E2)
        .add_field(name="🎯 Boss", value=spawn["boss"], inline=True)
        .add_field(name="⏰ Timestamp", value=spawn["timestamp"], inline=True)
        .add_field(name="🔒 Closed", value="Yes" if spawn.get("closed") else "No", inline=True)
        .add_field(name="✅ Verified Members", value=str(len(spawn["members"])), inline=True)
        .add_field(name="⏳ Pending Verifications", value=str(len(pending_in_thread)), inline=True)
        .add_field(
            name="📋 Confirmation Thread",
            value=(f"<#{spawn['confirm_thread_id']}>" if spawn.get("confirm_thread_id") else "None"),
            inline=True
        )
        .add_field(name="👥 Member List", value=members_str, inline=False)
        .set_footer(text=f"Requested by {user.display_name}")
    )
    embed.timestamp = datetime.now(timezone.utc)
    
    await message.reply(embed=embed)
    info(f"{user.name} ran !debugthread in {tid}")

# -----------------------------
# COMMAND DISPATCHER (for bot.py to call)
# -----------------------------
# NOTE: The actual routing logic that checks if a channel is the 'admin logs channel' 
# or if the user is 'admin' is often placed in bot.py's on_message for central control.
# This function is the ultimate set of handlers used by that router.
# The `handle_command` structure shown in the previous snippet's notes is NOT 
# explicitly defined here but its contained logic is spread among the individual handlers above.