"""
ELYSIUM Guild Bot - Python Version 4.0 (COMPLETE)
Main entry point with ALL systems: Attendance + Bidding + Auctioneering
"""
import os
import discord
from discord.ext import commands
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import all systems
from config import load_config
from attendance import AttendanceSystem
from bidding import BiddingSystem
from auctioneering import AuctioneeringSystem

# Bot constants
BOT_VERSION = "4.0-PY-FULL"
INTENTS = discord.Intents.default()
INTENTS.message_content = True
INTENTS.guilds = True
INTENTS.members = True
INTENTS.reactions = True

# Initialize bot
bot = commands.Bot(command_prefix='!', intents=INTENTS, help_command=None)

# Global systems
config = None
attendance = None
bidding = None
auctioneering = None

# Command aliases
COMMAND_ALIASES = {
    '!?': '!help',
    '!st': '!status',
    '!b': '!bid',
    '!ql': '!queuelist',
    '!queue': '!queuelist',
    '!rm': '!removeitem',
    '!start': '!startauction',
    '!bstatus': '!bidstatus',
    '!pts': '!mypoints',
    '!mypts': '!mypoints',
    '!mp': '!mypoints',
}

@bot.event
async def on_ready():
    """Bot ready event"""
    global config, attendance, bidding, auctioneering
    
    print(f"✅ Bot logged in as {bot.user}")
    print(f"🤖 Version: {BOT_VERSION}")
    print(f"🟢 Main Guild: {config.main_guild_id}")
    
    # Initialize all systems
    attendance = AttendanceSystem(bot, config)
    bidding = BiddingSystem(bot, config)
    auctioneering = AuctioneeringSystem(bot, config, bidding)
    
    # Recover state
    await attendance.recover_state()
    
    print("🎉 Bot ready! All systems initialized.")

@bot.event
async def on_message(message: discord.Message):
    """Handle all messages"""
    # Ignore bot messages
    if message.author.bot:
        return
    
    # Process commands
    await bot.process_commands(message)
    
    # Timer server spawn detection
    if message.guild and str(message.guild.id) == config.timer_server_id:
        if config.get('timer_channel_id') and str(message.channel.id) == config.get('timer_channel_id'):
            if 'will spawn in' in message.content.lower() and 'minutes!' in message.content.lower():
                await handle_spawn_detection(message)
                return
    
    # Check-in handling in spawn threads
    if (message.channel.type == discord.ChannelType.public_thread and
        str(message.channel.parent_id) == config.attendance_channel_id):
        
        content = message.content.strip().lower()
        keyword = content.split()[0] if content else ""
        
        if keyword in ['present', 'here', 'join', 'checkin', 'check-in']:
            await attendance.handle_checkin(message)
            return
        
        # Admin commands in spawn threads
        if config.is_admin(message.author):
            if content == 'close':
                await handle_close_spawn(message)
                return
    
    # Bidding in auction threads
    if (message.channel.type == discord.ChannelType.public_thread and
        str(message.channel.parent_id) == config.bidding_channel_id):
        
        cmd = message.content.strip().lower().split()[0] if message.content.strip() else ""
        
        # Check for bid command
        if cmd in ['!bid', '!b']:
            args = message.content.strip().split()[1:]
            if args:
                await bidding.process_bid(message, args[0])
                return

@bot.event
async def on_reaction_add(reaction: discord.Reaction, user: discord.User):
    """Handle reaction additions"""
    if user.bot:
        return
    
    # Attendance verification reactions
    await attendance.handle_reaction(reaction, user)
    
    # Bidding confirmation reactions
    if reaction.message.id in bidding.pending_confirmations:
        if str(reaction.emoji) == '✅':
            await bidding.confirm_bid(reaction.message, user)
        elif str(reaction.emoji) == '❌':
            await bidding.cancel_bid(reaction.message)

async def handle_spawn_detection(message: discord.Message):
    """Detect and create spawn threads from timer bot"""
    import re
    
    # Extract timestamp
    timestamp_match = re.search(r'\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)', message.content)
    timestamp = timestamp_match.group(1) if timestamp_match else None
    
    # Extract boss name
    detected_boss = None
    
    # Try bold format
    match_bold = re.search(r'\*\*(.*?)\*\*\s*will spawn', message.content, re.IGNORECASE)
    if match_bold:
        detected_boss = match_bold.group(1).strip()
    else:
        # Try emoji format
        match_emoji = re.search(r'[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn', message.content, re.IGNORECASE)
        if match_emoji:
            detected_boss = match_emoji.group(1).strip()
        else:
            # Try plain format
            match_plain = re.match(r'^([A-Za-z\s]+?)\s*will spawn', message.content, re.IGNORECASE)
            if match_plain:
                detected_boss = match_plain.group(1).strip()
    
    if not detected_boss:
        print(f"⚠️ Could not extract boss name from: {message.content}")
        return
    
    boss_name = config.find_boss_match(detected_boss)
    if not boss_name:
        print(f"⚠️ Unknown boss: {detected_boss}")
        return
    
    print(f"🎯 Boss spawn detected: {boss_name} (from {message.author.name})")
    
    # Format timestamp
    if timestamp:
        date_part, time_part = timestamp.split()
        year, month, day = date_part.split('-')
        date_str = f"{month}/{day}/{year[2:]}"
        time_str = time_part
        full_timestamp = f"{date_str} {time_str}"
        print(f"⏰ Using timestamp from timer: {full_timestamp}")
    else:
        ts = attendance.get_manila_timestamp()
        date_str = ts['date']
        time_str = ts['time']
        full_timestamp = ts['full']
        print(f"⏰ Using current timestamp: {full_timestamp}")
    
    await attendance.create_spawn_threads(
        boss_name, date_str, time_str, full_timestamp, "timer"
    )

async def handle_close_spawn(message: discord.Message):
    """Handle spawn thread closure"""
    spawn_info = attendance.active_spawns.get(message.channel.id)
    if not spawn_info or spawn_info.closed:
        await message.reply("⚠️ This spawn is already closed or not found.")
        return
    
    # Check for pending verifications
    pending_in_thread = [
        (msg_id, p) for msg_id, p in attendance.pending_verifications.items()
        if p.thread_id == message.channel.id
    ]
    
    if pending_in_thread:
        pending_list = '\n'.join([
            f"• **{p.author}** - [View Message](https://discord.com/channels/{message.guild.id}/{message.channel.id}/{msg_id})"
            for msg_id, p in pending_in_thread
        ])
        
        await message.reply(
            f"⚠️ **Cannot close spawn!**\n\n"
            f"There are **{len(pending_in_thread)} pending verification(s)**:\n\n"
            f"{pending_list}\n\n"
            f"Please verify (✅) or deny (❌) all check-ins first, then type `close` again.\n\n"
            f"💡 Or use `!resetpending` to clear them."
        )
        return
    
    # Send confirmation
    confirm_msg = await message.reply(
        f"🔒 Close spawn **{spawn_info.boss}** ({spawn_info.timestamp})?\n\n"
        f"**{len(spawn_info.members)} members** will be submitted to Google Sheets.\n\n"
        f"React ✅ to confirm or ❌ to cancel."
    )
    
    await confirm_msg.add_reaction("✅")
    await confirm_msg.add_reaction("❌")
    
    # Wait for reaction
    def check(reaction, user):
        return (
            reaction.message.id == confirm_msg.id and
            user.id == message.author.id and
            str(reaction.emoji) in ['✅', '❌']
        )
    
    try:
        reaction, user = await bot.wait_for('reaction_add', timeout=30.0, check=check)
        
        if str(reaction.emoji) == '✅':
            await submit_and_close(message.channel, spawn_info, message.author.name)
        else:
            await confirm_msg.reply("❌ Close canceled.")
        
        await confirm_msg.clear_reactions()
    
    except asyncio.TimeoutError:
        await confirm_msg.reply("⏱️ Confirmation timed out.")
        await confirm_msg.clear_reactions()

async def submit_and_close(channel, spawn_info, admin_name):
    """Submit attendance and close thread"""
    spawn_info.closed = True
    
    await channel.send(
        f"🔒 Closing spawn **{spawn_info.boss}**... "
        f"Submitting {len(spawn_info.members)} members to Google Sheets..."
    )
    
    payload = {
        'action': 'submitAttendance',
        'boss': spawn_info.boss,
        'date': spawn_info.date,
        'time': spawn_info.time,
        'timestamp': spawn_info.timestamp,
        'members': spawn_info.members
    }
    
    resp = await attendance.post_to_sheet(payload)
    
    if resp['ok']:
        await channel.send("✅ Attendance submitted successfully! Archiving thread...")
        
        # Delete confirmation thread
        if spawn_info.confirm_thread_id:
            confirm_thread = bot.get_channel(spawn_info.confirm_thread_id)
            if confirm_thread:
                await confirm_thread.send(
                    f"✅ Spawn closed: **{spawn_info.boss}** ({spawn_info.timestamp}) - "
                    f"{len(spawn_info.members)} members recorded"
                )
                await confirm_thread.delete()
        
        # Archive thread
        await channel.edit(archived=True, reason=f"Closed by {admin_name}")
        
        # Clean up state
        del attendance.active_spawns[channel.id]
        del attendance.active_columns[f"{spawn_info.boss}|{spawn_info.timestamp}"]
        
        print(f"🔒 Spawn closed: {spawn_info.boss} at {spawn_info.timestamp} "
              f"({len(spawn_info.members)} members)")
    else:
        await channel.send(
            f"⚠️ **Failed to submit attendance!**\n\n"
            f"Error: {resp.get('text', resp.get('error', 'Unknown error'))}\n\n"
            f"**Members list (for manual entry):**\n{', '.join(spawn_info.members)}\n\n"
            f"Please manually update the Google Sheet."
        )

# ==========================================
# ADMIN COMMANDS
# ==========================================

@bot.command(name='status')
async def status(ctx):
    """Show bot status"""
    if not config.is_admin(ctx.author):
        return
    
    embed = discord.Embed(
        title="📊 Bot Status",
        description="✅ **Healthy**",
        color=0x00FF00
    )
    embed.add_field(name="🤖 Version", value=BOT_VERSION, inline=True)
    embed.add_field(name="🎯 Active Spawns", value=str(len(attendance.active_spawns)), inline=True)
    embed.add_field(name="⏳ Pending Verifications", value=str(len(attendance.pending_verifications)), inline=True)
    embed.add_field(name="📋 Bidding Queue", value=str(len(bidding.queue)), inline=True)
    embed.add_field(name="🔥 Active Auction", value="Yes" if bidding.active_auction else "No", inline=True)
    embed.add_field(name="🏛️ Auctioneering", value="Active" if auctioneering.active else "Idle", inline=True)
    embed.timestamp = discord.utils.utcnow()
    
    await ctx.reply(embed=embed)

@bot.command(name='clearstate')
async def clearstate(ctx):
    """Clear all bot state"""
    if not config.is_admin(ctx.author):
        return
    
    confirm_msg = await ctx.reply(
        f"⚠️ **WARNING: Clear all bot memory?**\n\n"
        f"This will clear:\n"
        f"• {len(attendance.active_spawns)} active spawn(s)\n"
        f"• {len(attendance.pending_verifications)} pending verification(s)\n"
        f"• {len(bidding.queue)} bidding queue item(s)\n\n"
        f"React ✅ to confirm or ❌ to cancel."
    )
    
    await confirm_msg.add_reaction("✅")
    await confirm_msg.add_reaction("❌")
    
    def check(reaction, user):
        return (
            reaction.message.id == confirm_msg.id and
            user.id == ctx.author.id and
            str(reaction.emoji) in ['✅', '❌']
        )
    
    try:
        reaction, user = await bot.wait_for('reaction_add', timeout=30.0, check=check)
        
        if str(reaction.emoji) == '✅':
            # Clear all state
            attendance.active_spawns.clear()
            attendance.active_columns.clear()
            attendance.pending_verifications.clear()
            bidding.queue.clear()
            bidding.active_auction = None
            bidding.locked_points.clear()
            auctioneering.active = False
            auctioneering.item_queue.clear()
            
            await ctx.reply("✅ **State cleared successfully!**\n\nAll bot memory has been reset.")
        else:
            await ctx.reply("❌ Clear state canceled.")
        
        await confirm_msg.clear_reactions()
    
    except asyncio.TimeoutError:
        await ctx.reply("⏱️ Confirmation timed out.")
        await confirm_msg.clear_reactions()

@bot.command(name='addthread')
async def addthread(ctx, *, args):
    """Manually create spawn thread"""
    if not config.is_admin(ctx.author):
        return
    
    import re
    
    timestamp_match = re.search(r'\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)', args)
    if not timestamp_match:
        await ctx.reply(
            "⚠️ **Invalid format!**\n\n"
            "**Usage:** `!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)`"
        )
        return
    
    timestamp_str = timestamp_match.group(1)
    boss_match = re.match(r'^(.+?)\s+will spawn', args, re.IGNORECASE)
    
    if not boss_match:
        await ctx.reply("⚠️ **Cannot detect boss name!**")
        return
    
    detected_boss = boss_match.group(1).strip()
    boss_name = config.find_boss_match(detected_boss)
    
    if not boss_name:
        await ctx.reply(f"⚠️ **Unknown boss:** \"{detected_boss}\"")
        return
    
    date_part, time_part = timestamp_str.split()
    year, month, day = date_part.split('-')
    date_str = f"{month}/{day}/{year[2:]}"
    time_str = time_part
    full_timestamp = f"{date_str} {time_str}"
    
    await attendance.create_spawn_threads(
        boss_name, date_str, time_str, full_timestamp, "manual"
    )
    
    await ctx.reply(
        f"✅ **Spawn thread created successfully!**\n\n"
        f"**Boss:** {boss_name}\n**Time:** {full_timestamp}"
    )

@bot.command(name='verify')
async def verify(ctx, member: discord.Member):
    """Manually verify a member"""
    if not config.is_admin(ctx.author):
        return
    
    if ctx.channel.type != discord.ChannelType.public_thread:
        await ctx.reply("⚠️ Use this command in a spawn thread.")
        return
    
    spawn_info = attendance.active_spawns.get(ctx.channel.id)
    if not spawn_info or spawn_info.closed:
        await ctx.reply("⚠️ This spawn is closed or not found.")
        return
    
    username = member.display_name or member.name
    
    if any(m.lower() == username.lower() for m in spawn_info.members):
        await ctx.reply(f"⚠️ **{username}** is already verified for this spawn.")
        return
    
    spawn_info.members.append(username)
    await ctx.reply(f"✅ **{username}** manually verified by {ctx.author.name}")
    
    if spawn_info.confirm_thread_id:
        confirm_thread = bot.get_channel(spawn_info.confirm_thread_id)
        if confirm_thread:
            await confirm_thread.send(
                f"✅ **{username}** verified by {ctx.author.name} (manual override)"
            )

@bot.command(name='verifyall')
async def verifyall(ctx):
    """Auto-verify all pending members"""
    if not config.is_admin(ctx.author):
        return
    
    if ctx.channel.type != discord.ChannelType.public_thread:
        await ctx.reply("⚠️ Use this command in a spawn thread.")
        return
    
    spawn_info = attendance.active_spawns.get(ctx.channel.id)
    if not spawn_info:
        await ctx.reply("⚠️ This spawn is not found.")
        return
    
    pending_in_thread = [
        (msg_id, p) for msg_id, p in attendance.pending_verifications.items()
        if p.thread_id == ctx.channel.id
    ]
    
    if not pending_in_thread:
        await ctx.reply("ℹ️ No pending verifications in this thread.")
        return
    
    # Process all
    verified_count = 0
    for msg_id, pending in pending_in_thread:
        if not any(m.lower() == pending.author.lower() for m in spawn_info.members):
            spawn_info.members.append(pending.author)
            verified_count += 1
        
        try:
            msg = await ctx.channel.fetch_message(msg_id)
            await msg.clear_reactions()
        except:
            pass
        
        del attendance.pending_verifications[msg_id]
    
    await ctx.reply(
        f"✅ **Verify All Complete!**\n\n"
        f"Verified {verified_count} member(s)"
    )

# ==========================================
# BIDDING COMMANDS
# ==========================================

@bot.command(name='auction')
async def auction(ctx, *, args):
    """Add item to auction queue"""
    if not config.is_admin(ctx.author):
        return
    
    parts = args.strip().split()
    if len(parts) < 3:
        await ctx.reply("⚠️ Usage: `!auction <item> <price> <duration> [quantity]`")
        return
    
    # Check if last arg is quantity
    qty = 1
    duration = 0
    price = 0
    
    try:
        if len(parts) >= 4 and parts[-1].isdigit() and parts[-2].isdigit():
            qty = int(parts[-1])
            duration = int(parts[-2])
            price = int(parts[-3])
            item = ' '.join(parts[:-3])
        else:
            duration = int(parts[-1])
            price = int(parts[-2])
            item = ' '.join(parts[:-2])
    except:
        await ctx.reply("⚠️ Invalid format")
        return
    
    if qty > 10:
        await ctx.reply("⚠️ Max quantity is 10")
        return
    
    queue_item = bidding.add_to_queue(item, price, duration, qty)
    
    embed = discord.Embed(
        title="✅ Queued",
        description=f"**{item}**{f' x{qty}' if qty > 1 else ''}",
        color=0x00FF00
    )
    embed.add_field(name="💰 Price", value=f"{price}pts", inline=True)
    embed.add_field(name="⏱️ Duration", value=f"{duration}m", inline=True)
    embed.add_field(name="📋 Position", value=f"#{len(bidding.queue)}", inline=True)
    
    if qty > 1:
        embed.add_field(name="🔥 Batch", value=f"Top {qty} bidders win!", inline=False)
    
    await ctx.reply(embed=embed)

@bot.command(name='queuelist')
async def queuelist(ctx):
    """View auction queue"""
    if len(bidding.queue) == 0:
        await ctx.reply("📋 Queue is empty")
        return
    
    queue_text = '\n'.join([
        f"{i+1}. **{item.item}**{f' x{item.quantity}' if item.quantity > 1 else ''} - {item.start_price}pts • {item.duration}m"
        for i, item in enumerate(bidding.queue)
    ])
    
    embed = discord.Embed(
        title="📋 Auction Queue",
        description=queue_text,
        color=0x4A90E2
    )
    embed.add_field(name="📊 Total", value=str(len(bidding.queue)), inline=True)
    await ctx.reply(embed=embed)

@bot.command(name='removeitem')
async def removeitem(ctx, *, item_name):
    """Remove item from queue"""
    if not config.is_admin(ctx.author):
        return
    
    removed = bidding.remove_from_queue(item_name)
    if removed:
        await ctx.reply(f"✅ Removed **{removed.item}** from queue")
    else:
        await ctx.reply(f"❌ Item not found: {item_name}")

@bot.command(name='startauction')
async def startauction(ctx):
    """Start auctioneering session"""
    if not config.is_admin(ctx.author):
        return
    
    if auctioneering.active:
        await ctx.reply("❌ Auctioneering session already running")
        return
    
    result = await auctioneering.start_auctioneering(ctx.channel)
    
    if not result['ok']:
        await ctx.reply(f"❌ {result['msg']}")

@bot.command(name='pause')
async def pause_auction(ctx):
    """Pause auctioneering session"""
    if not config.is_admin(ctx.author):
        return
    
    if auctioneering.pause_session():
        await ctx.reply("⏸️ Auction paused")
    else:
        await ctx.reply("❌ No active auction to pause")

@bot.command(name='resume')
async def resume_auction(ctx):
    """Resume auctioneering session"""
    if not config.is_admin(ctx.author):
        return
    
    if auctioneering.resume_session():
        await ctx.reply("▶️ Auction resumed")
    else:
        await ctx.reply("❌ No paused auction to resume")

@bot.command(name='extend')
async def extend_auction(ctx, minutes: int):
    """Extend current item"""
    if not config.is_admin(ctx.author):
        return
    
    if auctioneering.extend_current_item(minutes):
        await ctx.reply(f"⏱️ Extended by {minutes} minute(s)")
    else:
        await ctx.reply("❌ No active auction to extend")

@bot.command(name='mypoints')
async def mypoints(ctx):
    """Check your points"""
    if ctx.channel.type == discord.ChannelType.public_thread:
        await ctx.reply("⚠️ Use !mypoints in the main bidding channel, not in threads")
        return
    
    username = ctx.author.display_name or ctx.author.name
    
    # Fetch fresh points
    resp = await bidding.post_to_sheet({'action': 'getBiddingPoints'})
    if not resp['ok']:
        await ctx.reply("❌ Failed to fetch points")
        return
    
    try:
        import json
        data = json.loads(resp['text'])
        all_points = data.get('points', {})
    except:
        await ctx.reply("❌ Failed to parse points")
        return
    
    points = all_points.get(username)
    if points is None:
        # Try case-insensitive
        for name, pts in all_points.items():
            if name.lower() == username.lower():
                points = pts
                break
    
    if points is None:
        embed = discord.Embed(
            title="❌ Not Found",
            description=f"**{username}**\n\nYou are not in the bidding system.",
            color=0xFF0000
        )
    else:
        embed = discord.Embed(
            title="💰 Your Points",
            description=f"**{username}**",
            color=0x00FF00
        )
        embed.add_field(name="📊 Available Points", value=f"{points} pts", inline=True)
        embed.set_footer(text="Auto-deletes in 30s")
    
    embed.timestamp = discord.utils.utcnow()
    pts_msg = await ctx.reply(embed=embed)
    
    # Delete both messages after 30s
    try:
        await ctx.message.delete()
    except:
        pass
    
    await asyncio.sleep(30)
    await pts_msg.delete()

@bot.command(name='help')
async def help_command(ctx):
    """Show help"""
    if config.is_admin(ctx.author):
        embed = discord.Embed(
            title="🛡️ ELYSIUM Bot - Admin Commands",
            description=f"**Python Version {BOT_VERSION}** - All Systems",
            color=0x4A90E2
        )
        embed.add_field(
            name="📋 Attendance",
            value=(
                "`!status` - Bot status\n"
                "`!addthread` - Manual spawn\n"
                "`!verify @user` - Verify member\n"
                "`!verifyall` - Verify all\n"
                "`close` - Close spawn (in thread)"
            ),
            inline=False
        )
        embed.add_field(
            name="💰 Bidding",
            value=(
                "`!auction <item> <price> <dur> [qty]` - Add to queue\n"
                "`!queuelist` - View queue\n"
                "`!removeitem <name>` - Remove item\n"
                "`!startauction` - Start session\n"
                "`!pause` / `!resume` - Control auction\n"
                "`!extend <min>` - Extend time"
            ),
            inline=False
        )
        embed.add_field(
            name="👤 Member",
            value="`!mypoints` - Check points (main channel only)",
            inline=False
        )
    else:
        embed = discord.Embed(
            title="📚 ELYSIUM Bot - Member Guide",
            description="Available commands",
            color=0xFFD700
        )
        embed.add_field(
            name="📋 Attendance",
            value="Type `present` or `here` in spawn threads (with screenshot)",
            inline=False
        )
        embed.add_field(
            name="💰 Bidding",
            value="`!bid <amount>` or `!b <amount>` - Bid in auction threads\n`!mypoints` - Check your points",
            inline=False
        )
    
    embed.set_footer(text=f"Version {BOT_VERSION}")
    await ctx.reply(embed=embed)

# Main entry
if __name__ == '__main__':
    # Load config
    config = load_config()
    
    # Get token
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        print("❌ DISCORD_TOKEN environment variable not set!")
        exit(1)
    
    # Run bot
    print(f"🚀 Starting ELYSIUM Bot v{BOT_VERSION}...")
    bot.run(token)