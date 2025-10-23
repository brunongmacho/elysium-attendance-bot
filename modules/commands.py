# modules/commands.py
import discord
from datetime import datetime, timezone
from modules.state_manager import active_spawns, pending_verifications, pending_closures
from modules.logger import info

BOT_VERSION = "2.8"

async def handle_help(message, args):
    """Respond to !help and subcommands."""
    prefix = "!"
    if args:
        cmd = args[0].lower()
        details = {
            "help": "Displays all available bot commands.",
            "status": "Shows current bot uptime, threads, and memory usage.",
            "debugthread": "Displays debug info for the current thread.",
            "addthread": "Manually creates a boss attendance thread.",
        }
        desc = details.get(cmd, "No details found for this command.")
        await message.reply(f"**Help detail for:** `{cmd}`\n{desc}")
    else:
        cmds = ["help", "status", "debugthread", "addthread"]
        await message.reply(
            "**Available Commands:**\n" + "\n".join([f"• `{prefix}{c}`" for c in cmds])
        )
    info(f"{message.author} used !help {' '.join(args) if args else ''}")

async def handle_status(message, bot_start_time, last_sheet_call):
    """Show current bot statistics."""
    uptime = datetime.now(timezone.utc) - bot_start_time
    uptime_str = f"{uptime.days}d {uptime.seconds//3600}h {(uptime.seconds//60)%60}m"

    embed = (
        discord.Embed(title="📊 Bot Status", color=0x00FF00)
        .add_field(name="⏱️ Uptime", value=uptime_str, inline=True)
        .add_field(name="🤖 Version", value=BOT_VERSION, inline=True)
        .add_field(name="🎯 Active Spawns", value=str(len(active_spawns)), inline=True)
        .add_field(name="⏳ Pending Verifications", value=str(len(pending_verifications)), inline=True)
        .add_field(name="🔒 Pending Closures", value=str(len(pending_closures)), inline=True)
    )
    embed.timestamp = datetime.now(timezone.utc)
    await message.reply(embed=embed)

async def handle_debug_thread(message):
    """Debug information for current thread."""
    tid = message.channel.id
    spawn = active_spawns.get(tid)
    if not spawn:
        await message.reply("⚠️ Thread not in bot memory!")
        return
    pending_in_thread = [
        p for p in pending_verifications.values() if p["thread_id"] == tid
    ]
    embed = (
        discord.Embed(title="🔍 Thread Debug Info", color=0x4A90E2)
        .add_field(name="🎯 Boss", value=spawn["boss"], inline=True)
        .add_field(name="⏰ Timestamp", value=spawn["timestamp"], inline=True)
        .add_field(name="🔒 Closed", value="Yes" if spawn.get("closed") else "No", inline=True)
        .add_field(name="✅ Verified Members", value=str(len(spawn["members"])), inline=False)
        .add_field(name="👥 Member List", value=", ".join(spawn["members"]) or "None", inline=False)
        .add_field(name="⏳ Pending Verifications", value=str(len(pending_in_thread)), inline=True)
        .add_field(
            name="📋 Confirmation Thread",
            value=(f"<#{spawn['confirm_thread_id']}>" if spawn.get("confirm_thread_id") else "None"),
            inline=True,
        )
        .set_footer(text=f"Requested by {message.author.name}")
    )
    embed.timestamp = datetime.now(timezone.utc)
    await message.reply(embed=embed)
