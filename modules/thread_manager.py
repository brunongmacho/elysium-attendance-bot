# modules/thread_manager.py
import discord
from datetime import datetime, timezone
from modules.logger import info, error
from modules.boss_utils import get_boss_points

async def create_spawn_threads(bot, guild, att_channel, admin_logs, boss_name, date_str, time_str, full_timestamp):
    """Create attendance + confirmation threads for a detected boss."""
    thread_title = f"[{date_str} {time_str}] {boss_name}"
    att_thread = None
    confirm_thread = None

    try:
        att_thread = await att_channel.create_thread(
            name=thread_title,
            auto_archive_duration=60
        )
        info(f"Attendance thread created: {thread_title}")
    except Exception as e:
        error(f"Failed to create attendance thread: {e}")

    if admin_logs:
        try:
            confirm_thread = await admin_logs.create_thread(
                name=f"✅ {thread_title}",
                auto_archive_duration=60
            )
            info(f"Confirmation thread created for {boss_name}")
        except Exception as e:
            error(f"Failed to create confirmation thread: {e}")

    if not att_thread:
        return None, None

    # Build embed
    points = get_boss_points(boss_name)
    embed = (
        discord.Embed(
            title=f"🎯 {boss_name}",
            description="Boss detected! Please check in below."
        )
        .add_field(
            name="📸 How to Check In",
            value="1. Post `present` or `here`\n2. Attach a screenshot (admins exempt)\n3. Wait for admin ✅",
            inline=False
        )
        .add_field(name="📊 Points", value=f"{points} points", inline=True)
        .add_field(name="🕐 Time", value=time_str, inline=True)
        .add_field(name="📅 Date", value=date_str, inline=True)
        .set_footer(text='Admins: type "close" to finalize and submit attendance')
    )
    embed.timestamp = datetime.now(timezone.utc)

    try:
        await att_thread.send(content="@everyone", embed=embed)
        if confirm_thread:
            await confirm_thread.send(
                f"🟨 **{boss_name}** spawn detected ({full_timestamp}). Verifications will appear here."
            )
        info(f"Spawn threads for {boss_name} announced successfully.")
    except Exception as e:
        error(f"Failed to send spawn message: {e}")

    return att_thread, confirm_thread
