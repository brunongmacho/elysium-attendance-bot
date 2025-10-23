# modules/commands.py
import discord
from datetime import datetime, timezone
from modules.state_manager import active_spawns, pending_verifications, pending_closures
from modules.logger import info

BOT_VERSION = "2.8"
PREFIX = "!"

# -----------------------------
# HELP COMMAND
# -----------------------------
async def handle_help(message, args):
    """Show !help and detailed per-command help."""
    user = message.author

    # ---- Detailed Help for Specific Command ----
    if args:
        cmd = args[0].lower()

        if cmd == "status":
            embed = (
                discord.Embed(
                    title="📊 Command: !status",
                    description="Show bot health, active spawns, and system statistics.",
                    color=0x4A90E2,
                )
                .add_field(name="📍 Where to Use", value="Admin logs channel only", inline=False)
                .add_field(name="📝 Syntax", value="!status", inline=False)
                .add_field(
                    name="📊 Output Shows",
                    value="• Bot uptime and version\n• Active spawn threads with clickable links\n• Sorted oldest first with age indicators\n• Pending verifications count\n• Last sheet API call time",
                    inline=False,
                )
                .set_footer(text="Type !help for full command list")
            )
            await message.reply(embed=embed)
            info(f"{user.name} used !help {cmd}")
            return

        elif cmd == "addthread":
            embed = (
                discord.Embed(
                    title="🧵 Command: !addthread",
                    description="Manually create a spawn attendance thread for a specific boss.",
                    color=0x4A90E2,
                )
                .add_field(name="📍 Where to Use", value="Any text channel", inline=False)
                .add_field(name="📝 Syntax", value="!addthread <BossName>", inline=False)
                .add_field(name="📊 Example", value="!addthread Venatus", inline=False)
                .set_footer(text="Type !help for full command list")
            )
            await message.reply(embed=embed)
            info(f"{user.name} used !help {cmd}")
            return

        elif cmd == "debugthread":
            embed = (
                discord.Embed(
                    title="🔍 Command: !debugthread",
                    description="Show internal memory and verification details of this thread.",
                    color=0x4A90E2,
                )
                .add_field(name="📍 Where to Use", value="Inside an attendance thread", inline=False)
                .add_field(name="📝 Syntax", value="!debugthread", inline=False)
                .set_footer(text="Type !help for full command list")
            )
            await message.reply(embed=embed)
            info(f"{user.name} used !help {cmd}")
            return

        elif cmd == "reload":
            embed = (
                discord.Embed(
                    title="♻️ Command: !reload",
                    description="Reload boss list from file without restarting the bot.",
                    color=0x4A90E2,
                )
                .add_field(name="📝 Syntax", value="!reload", inline=False)
                .set_footer(text="Type !help for full command list")
            )
            await message.reply(embed=embed)
            info(f"{user.name} used !help {cmd}")
            return

        # Unknown subcommand
        await message.reply(f"❓ No detailed help found for `{cmd}`.")
        info(f"{user.name} used !help {cmd} (unknown)")
        return

    # ---- General Help ----
    embed = (
        discord.Embed(
            title="📖 ELYSIUM Attendance Bot Commands",
            description="Use `!help <command>` for detailed info on a specific command.",
            color=0x4A90E2,
        )
        .add_field(name="🧵 !addthread", value="Manually create a spawn attendance thread for a boss.", inline=False)
        .add_field(name="📊 !status", value="Show bot health, uptime, and active spawns.", inline=False)
        .add_field(name="🔍 !debugthread", value="Display debug info for current thread.", inline=False)
        .add_field(name="♻️ !reload", value="Reload boss list from file.", inline=False)
        .set_footer(text="ELYSIUM Attendance Bot • Type !help <command> for details")
    )
    await message.reply(embed=embed)
    info(f"{user.name} used !help")

# -----------------------------
# STATUS COMMAND
# -----------------------------
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
    info(f"{message.author.name} used !status")

# -----------------------------
# DEBUG THREAD
# -----------------------------
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
    info(f"{message.author.name} used !debugthread")
