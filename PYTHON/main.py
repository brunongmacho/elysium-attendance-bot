"""
ELYSIUM Guild Bot - Python Version 4.0 (100% COMPLETE)
Main entry point with ALL systems: Attendance + Bidding + Auctioneering
FULL FEATURE PARITY WITH JS VERSION
"""
import os
import discord
from discord.ext import commands
import asyncio
import aiohttp
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
import http.server
import threading

# Load environment variables
load_dotenv()

# Import all systems
from config import load_config
from attendance import AttendanceSystem
from bidding import BiddingSystem
from auctioneering import AuctioneeringSystem
import help_system

# Bot constants
BOT_VERSION = "4.0-PY-COMPLETE"
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

# State
BOT_START_TIME = 0
last_auction_end_time = 0
is_recovering = False
AUCTION_COOLDOWN = 10 * 60 * 1000  # 10 minutes in ms
cleanup_timer = None

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
    '!bs': '!bidstatus',
    '!pts': '!mypoints',
    '!mypts': '!mypoints',
    '!mp': '!mypoints',
    '!auc-start': '!startauction',
    '!auc-now': '!startauctionnow',
    '!auc-pause': '!pause',
    '!hold': '!pause',
    '!auc-resume': '!resume',
    '!continue': '!resume',
    '!auc-stop': '!stop',
    '!end-item': '!stop',
    '!ext': '!extend',
    '!auc-extend': '!extend',
}

# ==========================================
# HTTP HEALTH CHECK SERVER
# ==========================================

class HealthCheckHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ['/health', '/']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            import json
            uptime = int((datetime.now().timestamp() - BOT_START_TIME) * 1000)
            
            response = {
                'status': 'healthy',
                'version': BOT_VERSION,
                'uptime': uptime,
                'bot': bot.user.tag if bot.user else 'not ready',
                'activeSpawns': len(attendance.active_spawns) if attendance else 0,
                'pendingVerifications': len(attendance.pending_verifications) if attendance else 0,
                'timestamp': datetime.now().isoformat()
            }
            
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Suppress logs

def start_health_server():
    port = int(os.getenv('PORT', 8000))
    server = http.server.HTTPServer(('0.0.0.0', port), HealthCheckHandler)
    print(f"🌐 Health check server on port {port}")
    
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

# ==========================================
# BIDDING CHANNEL CLEANUP
# ==========================================

async def cleanup_bidding_channel():
    """Clean up non-admin messages from bidding channel"""
    try:
        print("🧹 Starting bidding channel cleanup...")
        
        guild = bot.get_guild(int(config.main_guild_id))
        if not guild:
            return
        
        bidding_channel = guild.get_channel(int(config.bidding_channel_id))
        if not bidding_channel:
            return
        
        messages_deleted = 0
        messages_fetched = 0
        
        async for message in bidding_channel.history(limit=500):
            messages_fetched += 1
            
            # Skip bot messages
            if message.author.bot:
                continue
            
            # Skip admin messages
            member = guild.get_member(message.author.id)
            if member and config.is_admin(member):
                continue
            
            # Delete non-admin, non-bot messages
            try:
                await message.delete()
                messages_deleted += 1
                await asyncio.sleep(0.5)  # Rate limit
            except:
                pass
        
        print(f"✅ Cleanup complete: {messages_deleted}/{messages_fetched} deleted")
        
    except Exception as e:
        print(f"❌ Cleanup error: {e}")

async def schedule_cleanup():
    """Schedule periodic cleanup every 12 hours"""
    while True:
        await asyncio.sleep(12 * 60 * 60)  # 12 hours
        await cleanup_bidding_channel()

# ==========================================
# UTILITY FUNCTIONS
# ==========================================

def resolve_alias(cmd: str) -> str:
    """Resolve command alias to actual command"""
    return COMMAND_ALIASES.get(cmd.lower(), cmd.lower())

async def recover_crashed_state():
    """Recover from crashed auction state"""
    global last_auction_end_time, is_recovering
    
    print("🔄 Checking for crashed state...")
    is_recovering = True
    
    try:
        # Check if there's a crashed auction in sheets
        resp = await bidding.post_to_sheet({'action': 'getBotState'})
        
        if resp['ok']:
            import json
            data = json.loads(resp['text'])
            state = data.get('state')
            
            if state and state.get('auctionState', {}).get('active'):
                print("⚠️ Found crashed auction state, recovering...")
                
                # Get admin logs channel
                guild = bot.get_guild(int(config.main_guild_id))
                admin_logs = guild.get_channel(int(config.admin_logs_channel_id))
                
                if admin_logs:
                    await admin_logs.send(
                        "🔄 **Bot Recovery Started**\n"
                        "Recovering crashed auction state..."
                    )
                
                # Set cooldown
                last_auction_end_time = datetime.now().timestamp() * 1000
                
                if admin_logs:
                    await admin_logs.send(
                        "✅ **Recovery Complete**\n"
                        "Ready for next `!startauction`"
                    )
    except Exception as e:
        print(f"❌ Recovery error: {e}")
    finally:
        is_recovering = False

# ==========================================
# BOT READY EVENT
# ==========================================

@bot.event
async def on_ready():
    global config, attendance, bidding, auctioneering, BOT_START_TIME
    
    BOT_START_TIME = datetime.now().timestamp()
    
    print(f"✅ Bot logged in as {bot.user}")
    print(f"🤖 Version: {BOT_VERSION}")
    print(f"🟢 Main Guild: {config.main_guild_id}")
    
    # Initialize all systems
    attendance = AttendanceSystem(bot, config)
    bidding = BiddingSystem(bot, config)
    auctioneering = AuctioneeringSystem(bot, config, bidding)
    help_system.initialize(config, lambda m: config.is_admin(m), BOT_VERSION)
    
    # Recover state
    await recover_crashed_state()
    await attendance.recover_state()
    
    # Start cleanup schedule
    bot.loop.create_task(schedule_cleanup())
    
    # Run initial cleanup
    await cleanup_bidding_channel()
    
    print("🎉 Bot ready! All systems initialized.")

# ==========================================
# MESSAGE HANDLER
# ==========================================

@bot.event
async def on_message(message: discord.Message):
    """Handle all messages"""
    try:
        # Ignore bot messages
        if message.author.bot:
            return
        
        # Process commands first
        await bot.process_commands(message)
        
        # Bidding channel protection - delete non-admin messages
        if (message.guild and 
            message.channel.id == int(config.bidding_channel_id) and
            not message.channel.type == discord.ChannelType.public_thread):
            
            member = message.guild.get_member(message.author.id)
            if member and not config.is_admin(member):
                try:
                    await message.delete()
                    print(f"🧹 Deleted non-admin message from {message.author.name}")
                except:
                    pass
                return
        
        # Timer server spawn detection
        if (message.guild and 
            str(message.guild.id) == config.timer_server_id and
            config.get('timer_channel_id') and
            str(message.channel.id) == config.get('timer_channel_id')):
            
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
                cmd = resolve_alias(content.split()[0] if content else "")
                
                if cmd == '!verify':
                    await handle_verify(message)
                    return
                elif cmd == '!verifyall':
                    await handle_verifyall(message)
                    return
                elif content == 'close':
                    await handle_close_spawn(message)
                    return
                elif cmd == '!forceclose':
                    await handle_forceclose(message)
                    return
                elif cmd in ['!forcesubmit', '!debugthread', '!resetpending']:
                    # Already handled by commands
                    pass
        
        # Bidding in auction threads
        if (message.channel.type == discord.ChannelType.public_thread and
            str(message.channel.parent_id) == config.bidding_channel_id):
            
            cmd = message.content.strip().lower().split()[0] if message.content.strip() else ""
            cmd = resolve_alias(cmd)
            
            # Check for bid command
            if cmd == '!bid':
                args = message.content.strip().split()[1:]
                if args:
                    # Check if auctioneering is active
                    auction_state = auctioneering.get_auction_state()
                    if auction_state['active'] and auction_state['currentItem']:
                        # Handle auctioneering bid with attendance check
                        username = message.author.display_name or message.author.username
                        
                        # Check attendance eligibility
                        if not auctioneering.can_user_bid(username):
                            current_item = auction_state['currentItem']
                            session = current_item.current_session
                            boss_name = session.boss_name if session else "Unknown"
                            
                            error_msg = await message.channel.send(
                                f"❌ <@{message.author.id}> You didn't attend **{boss_name}**. "
                                f"Only attendees can bid on this item.\n\n*This message will be deleted in 10 seconds.*"
                            )
                            
                            try:
                                await message.delete()
                            except:
                                pass
                            
                            await asyncio.sleep(10)
                            try:
                                await error_msg.delete()
                            except:
                                pass
                            
                            print(f"❌ Bid rejected: {username} didn't attend {boss_name}")
                            return
                    
                    # Process bid
                    await bidding.process_bid(message, args[0])
                return
    
    except Exception as err:
        print(f"❌ Message handler error: {err}")

# ==========================================
# SPAWN DETECTION
# ==========================================

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
        match_emoji = re.search(r'[⚠️📝⏰]+\s*([A-Za-z\s]+?)\s*will spawn', message.content, re.IGNORECASE)
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
        bot, boss_name, date_str, time_str, full_timestamp, "timer"
    )

# ==========================================
# ATTENDANCE COMMANDS
# ==========================================

async def handle_verify(message: discord.Message):
    """Handle !verify @member command"""
    mentioned = message.mentions[0] if message.mentions else None
    if not mentioned:
        await message.reply("⚠️ Usage: `!verify @member`")
        return
    
    spawn_info = attendance.active_spawns.get(message.channel.id)
    if not spawn_info or spawn_info.closed:
        await message.reply("⚠️ This spawn is closed or not found.")
        return
    
    username = mentioned.display_name or mentioned.name
    
    if any(m.lower() == username.lower() for m in spawn_info.members):
        await message.reply(f"⚠️ **{username}** is already verified for this spawn.")
        return
    
    spawn_info.members.append(username)
    
    await message.reply(f"✅ **{username}** manually verified by {message.author.name}")
    
    if spawn_info.confirm_thread_id:
        confirm_thread = bot.get_channel(spawn_info.confirm_thread_id)
        if confirm_thread:
            await confirm_thread.send(
                f"✅ **{username}** verified by {message.author.name} (manual override)"
            )

async def handle_verifyall(message: discord.Message):
    """Handle !verifyall command"""
    spawn_info = attendance.active_spawns.get(message.channel.id)
    if not spawn_info:
        await message.reply("⚠️ This spawn is not found.")
        return
    
    pending_in_thread = [
        (msg_id, p) for msg_id, p in attendance.pending_verifications.items()
        if p.thread_id == message.channel.id
    ]
    
    if not pending_in_thread:
        await message.reply("ℹ️ No pending verifications in this thread.")
        return
    
    # Process all
    verified_count = 0
    for msg_id, pending in pending_in_thread:
        if not any(m.lower() == pending.author.lower() for m in spawn_info.members):
            spawn_info.members.append(pending.author)
            verified_count += 1
        
        try:
            msg = await message.channel.fetch_message(msg_id)
            await msg.clear_reactions()
        except:
            pass
        
        del attendance.pending_verifications[msg_id]
    
    await message.reply(
        f"✅ **Verify All Complete!**\n\n"
        f"Verified {verified_count} member(s)"
    )

async def handle_close_spawn(message: discord.Message):
    """Handle close command in spawn thread"""
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

async def handle_forceclose(message: discord.Message):
    """Handle !forceclose command"""
    spawn_info = attendance.active_spawns.get(message.channel.id)
    if not spawn_info or spawn_info.closed:
        await message.reply("⚠️ This spawn is already closed or not found.")
        return
    
    # Clear all pending
    pending_in_thread = [
        msg_id for msg_id, p in attendance.pending_verifications.items()
        if p.thread_id == message.channel.id
    ]
    for msg_id in pending_in_thread:
        del attendance.pending_verifications[msg_id]
    
    await message.reply(
        f"⚠️ **FORCE CLOSING** spawn **{spawn_info.boss}**...\n"
        f"Submitting {len(spawn_info.members)} members (ignoring {len(pending_in_thread)} pending verifications)"
    )
    
    await submit_and_close(message.channel, spawn_info, message.author.name)

# ==========================================
# COMMAND HANDLERS
# ==========================================

@bot.command(name='help')
async def help_command(ctx):
    """Show help"""
    args = ctx.message.content.split()[1:] if len(ctx.message.content.split()) > 1 else []
    await help_system.handle_help(ctx.message, args, ctx.author)

@bot.command(name='status')
async def status(ctx):
    """Show bot status"""
    if not config.is_admin(ctx.author):
        return
    
    uptime = datetime.now().timestamp() - BOT_START_TIME
    uptime_str = f"{int(uptime // 3600)}h {int((uptime % 3600) // 60)}m"
    
    embed = discord.Embed(
        title="📊 Bot Status",
        description="✅ **Healthy**",
        color=0x00FF00
    )
    embed.add_field(name="⏱️ Uptime", value=uptime_str, inline=True)
    embed.add_field(name="🤖 Version", value=BOT_VERSION, inline=True)
    embed.add_field(name="🎯 Active Spawns", value=str(len(attendance.active_spawns)), inline=True)
    embed.add_field(name="⏳ Pending Verifications", value=str(len(attendance.pending_verifications)), inline=True)
    embed.add_field(name="📋 Bidding Queue", value=str(len(bidding.queue)), inline=True)
    embed.add_field(name="🔥 Auctioneering", value="Active" if auctioneering.active else "Idle", inline=True)
    embed.timestamp = discord.utils.utcnow()
    
    await ctx.reply(embed=embed)

@bot.command(name='clearstate')
async def clearstate(ctx):
    """Clear all bot state"""
    if not config.is_admin(ctx.author):
        return
    
    attendance.active_spawns.clear()
    attendance.active_columns.clear()
    attendance.pending_verifications.clear()
    bidding.queue.clear()
    bidding.active_auction = None
    auctioneering.active = False
    auctioneering.sessions.clear()
    
    await ctx.reply("✅ **State cleared successfully!**\n\nAll bot memory has been reset.")

@bot.command(name='startauction')
async def startauction(ctx):
    """Start auctioneering session"""
    if not config.is_admin(ctx.author):
        return
    
    global last_auction_end_time
    
    if is_recovering:
        await ctx.reply("⚠️ Bot is recovering from crash, please wait...")
        return
    
    if auctioneering.active:
        await ctx.reply("❌ Auction session already running")
        return
    
    # Check cooldown
    now = datetime.now().timestamp() * 1000
    time_since_last = now - last_auction_end_time
    cooldown_remaining = AUCTION_COOLDOWN - time_since_last
    
    if time_since_last < AUCTION_COOLDOWN:
        mins = int(cooldown_remaining / 60000)
        await ctx.reply(
            f"⏱️ Cooldown active. Wait {mins} more minute(s). "
            f"Or use `!startauctionnow` to override."
        )
        return
    
    await auctioneering.start_auctioneering(ctx.channel)
    last_auction_end_time = now

@bot.command(name='startauctionnow')
async def startauctionnow(ctx):
    """Start auction immediately (override cooldown)"""
    if not config.is_admin(ctx.author):
        return
    
    global last_auction_end_time
    
    if auctioneering.active:
        await ctx.reply("❌ Auction session already running")
        return
    
    await auctioneering.start_auctioneering(ctx.channel)
    last_auction_end_time = datetime.now().timestamp() * 1000
    await ctx.reply("✅ Auction started immediately. Cooldown reset to 10 minutes.")

@bot.command(name='queuelist')
async def queuelist(ctx):
    """View auction queue"""
    # Implementation in auctioneering module
    await ctx.reply("📋 Queue list not yet implemented - check auctioneering.py")

@bot.command(name='mypoints')
async def mypoints(ctx):
    """Check your points"""
    if ctx.channel.type == discord.ChannelType.public_thread:
        await ctx.reply("⚠️ Use !mypoints in the main bidding channel, not in threads")
        return
    
    username = ctx.author.display_name or ctx.author.username
    
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

# ==========================================
# REACTION HANDLER
# ==========================================

@bot.event
async def on_reaction_add(reaction: discord.Reaction, user: discord.User):
    """Handle reaction additions"""
    if user.bot:
        return
    
    # Attendance verification reactions
    await attendance.handle_reaction(reaction, user)
    
    # Bidding confirmation reactions
    # (Handled by bidding module)

# ==========================================
# ERROR HANDLING
# ==========================================

@bot.event
async def on_error(event, *args, **kwargs):
    print(f"❌ Error in {event}")
    import traceback
    traceback.print_exc()

# ==========================================
# MAIN ENTRY
# ==========================================

if __name__ == '__main__':
    # Load config
    config = load_config()
    
    # Start health check server
    start_health_server()
    
    # Get token
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        print("❌ DISCORD_TOKEN environment variable not set!")
        exit(1)
    
    # Run bot
    print(f"🚀 Starting ELYSIUM Bot v{BOT_VERSION}...")
    bot.run(token)