"""
ELYSIUM Bot - Attendance System
Handles boss spawn threads, check-ins, and verification
"""
import discord
import asyncio
import aiohttp
from datetime import datetime, timezone
from typing import Dict, Optional, List
from dataclasses import dataclass, field

@dataclass
class SpawnInfo:
    boss: str
    date: str
    time: str
    timestamp: str
    members: List[str] = field(default_factory=list)
    confirm_thread_id: Optional[int] = None
    closed: bool = False

@dataclass
class PendingVerification:
    author: str
    author_id: int
    thread_id: int
    timestamp: float

class AttendanceSystem:
    def __init__(self, bot, config):
        self.bot = bot
        self.config = config
        self.active_spawns: Dict[int, SpawnInfo] = {}
        self.active_columns: Dict[str, int] = {}
        self.pending_verifications: Dict[int, PendingVerification] = {}
        self.pending_closures: Dict[int, Dict] = {}
        self.confirmation_messages: Dict[int, List[int]] = {}
        self.last_sheet_call = 0
        self.MIN_SHEET_DELAY = 2.0  # seconds
    
    async def post_to_sheet(self, payload: dict) -> dict:
        """Post data to Google Sheets webhook with rate limiting"""
        now = datetime.now().timestamp()
        time_since_last = now - self.last_sheet_call
        
        if time_since_last < self.MIN_SHEET_DELAY:
            wait_time = self.MIN_SHEET_DELAY - time_since_last
            await asyncio.sleep(wait_time)
        
        self.last_sheet_call = datetime.now().timestamp()
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    self.config.sheet_webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    text = await resp.text()
                    return {
                        'ok': resp.status == 200,
                        'status': resp.status,
                        'text': text
                    }
            except Exception as e:
                return {'ok': False, 'error': str(e)}
    
    async def check_column_exists(self, boss: str, timestamp: str) -> bool:
        """Check if column already exists in sheet"""
        key = f"{boss}|{timestamp}"
        
        if key in self.active_columns:
            return True
        
        resp = await self.post_to_sheet({
            'action': 'checkColumn',
            'boss': boss,
            'timestamp': timestamp
        })
        
        if resp['ok']:
            try:
                import json
                data = json.loads(resp['text'])
                return data.get('exists', False)
            except:
                return False
        return False
    
    def get_manila_timestamp(self) -> dict:
        """Get current Manila time formatted"""
        from datetime import timezone, timedelta
        manila_tz = timezone(timedelta(hours=8))
        now = datetime.now(manila_tz)
        
        date_str = now.strftime("%m/%d/%y")
        time_str = now.strftime("%H:%M")
        
        return {
            'date': date_str,
            'time': time_str,
            'full': f"{date_str} {time_str}"
        }
    
    def parse_thread_name(self, name: str) -> Optional[dict]:
        """Parse thread name to extract date, time, boss"""
        import re
        match = re.match(r'^\[(.*?)\s+(.*?)\]\s+(.+)$', name)
        if not match:
            return None
        
        return {
            'date': match.group(1),
            'time': match.group(2),
            'timestamp': f"{match.group(1)} {match.group(2)}",
            'boss': match.group(3)
        }
    
    async def create_spawn_threads(
        self, 
        boss_name: str, 
        date_str: str, 
        time_str: str, 
        full_timestamp: str,
        trigger_source: str
    ):
        """Create attendance and confirmation threads"""
        guild = self.bot.get_guild(int(self.config.main_guild_id))
        if not guild:
            return
        
        att_channel = guild.get_channel(int(self.config.attendance_channel_id))
        admin_logs = guild.get_channel(int(self.config.admin_logs_channel_id))
        
        if not att_channel or not admin_logs:
            print("❌ Could not find channels")
            return
        
        # Check if column exists
        if await self.check_column_exists(boss_name, full_timestamp):
            print(f"⚠️ Column exists for {boss_name} at {full_timestamp}")
            await admin_logs.send(
                f"⚠️ **BLOCKED SPAWN:** {boss_name} at {full_timestamp}\n"
                f"A column for this boss at this timestamp already exists."
            )
            return
        
        thread_title = f"[{date_str} {time_str}] {boss_name}"
        
        # Create threads
        att_thread = await att_channel.create_thread(
            name=thread_title,
            auto_archive_duration=self.config.get('auto_archive_minutes', 60),
            reason=f"Boss spawn: {boss_name}"
        )
        
        confirm_thread = await admin_logs.create_thread(
            name=f"✅ {thread_title}",
            auto_archive_duration=self.config.get('auto_archive_minutes', 60),
            reason=f"Confirmation thread: {boss_name}"
        )
        
        # Store spawn info
        self.active_spawns[att_thread.id] = SpawnInfo(
            boss=boss_name,
            date=date_str,
            time=time_str,
            timestamp=full_timestamp,
            members=[],
            confirm_thread_id=confirm_thread.id if confirm_thread else None,
            closed=False
        )
        
        self.active_columns[f"{boss_name}|{full_timestamp}"] = att_thread.id
        
        # Send messages
        boss_data = self.config.boss_points[boss_name]
        embed = discord.Embed(
            title=f"🎯 {boss_name}",
            description="Boss detected! Please check in below.",
            color=0xFFD700
        )
        embed.add_field(
            name="📸 How to Check In",
            value="1. Post `present` or `here`\n2. Attach a screenshot (admins exempt)\n3. Wait for admin ✅",
            inline=False
        )
        embed.add_field(name="📊 Points", value=f"{boss_data['points']} points", inline=True)
        embed.add_field(name="🕐 Time", value=time_str, inline=True)
        embed.add_field(name="📅 Date", value=date_str, inline=True)
        embed.set_footer(text='Admins: type "close" to finalize and submit attendance')
        embed.timestamp = datetime.now(timezone.utc)
        
        await att_thread.send(content="@everyone", embed=embed)
        
        if confirm_thread:
            await confirm_thread.send(
                f"🟨 **{boss_name}** spawn detected ({full_timestamp}). "
                f"Verifications will appear here."
            )
        
        print(f"✅ Created threads for {boss_name} at {full_timestamp} ({trigger_source})")
    
    async def handle_checkin(self, message: discord.Message):
        """Handle member check-in"""
        spawn_info = self.active_spawns.get(message.channel.id)
        if not spawn_info or spawn_info.closed:
            await message.reply("⚠️ This spawn is closed. No more check-ins accepted.")
            return
        
        member = message.author
        username = message.author.display_name or message.author.name
        is_admin = self.config.is_admin(message.author)
        
        # Check for screenshot (admins exempt)
        if not is_admin and len(message.attachments) == 0:
            await message.reply(
                "⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp."
            )
            return
        
        # Check for duplicate
        if any(m.lower() == username.lower() for m in spawn_info.members):
            await message.reply("⚠️ You already checked in for this spawn.")
            return
        
        # Add reactions
        await message.add_reaction("✅")
        await message.add_reaction("❌")
        
        # Store pending verification
        self.pending_verifications[message.id] = PendingVerification(
            author=username,
            author_id=member.id,
            thread_id=message.channel.id,
            timestamp=datetime.now().timestamp()
        )
        
        # Send confirmation
        status_text = (
            f"⚡ **{username}** (Admin) registered for **{spawn_info.boss}**\n\n"
            f"Fast-track verification (no screenshot required)..."
        ) if is_admin else (
            f"⏳ **{username}** registered for **{spawn_info.boss}**\n\n"
            f"Waiting for admin verification..."
        )
        
        embed = discord.Embed(
            description=status_text,
            color=0x00FF00 if is_admin else 0xFFA500
        )
        embed.set_footer(text="Admins: React ✅ to verify, ❌ to deny")
        
        await message.reply(embed=embed)
        
        # Notify confirmation thread
        if spawn_info.confirm_thread_id:
            confirm_thread = self.bot.get_channel(spawn_info.confirm_thread_id)
            if confirm_thread:
                notif = (
                    f"⚡ **{username}** (Admin) - Fast-track check-in (no screenshot)"
                ) if is_admin else (
                    f"⏳ **{username}** - Pending verification"
                )
                await confirm_thread.send(notif)
        
        print(f"📝 Pending: {username} for {spawn_info.boss}" + 
              (" (admin fast-track)" if is_admin else ""))
    
    async def handle_reaction(self, reaction: discord.Reaction, user: discord.User):
        """Handle admin verification reactions"""
        if user.bot:
            return
        
        guild = reaction.message.guild
        member = guild.get_member(user.id)
        
        if not member or not self.config.is_admin(member):
            try:
                await reaction.remove(user)
            except:
                pass
            return
        
        # Handle pending verification
        pending = self.pending_verifications.get(reaction.message.id)
        if pending:
            spawn_info = self.active_spawns.get(pending.thread_id)
            
            if not spawn_info or spawn_info.closed:
                await reaction.message.reply("⚠️ This spawn is already closed.")
                del self.pending_verifications[reaction.message.id]
                return
            
            if reaction.emoji == "✅":
                # Check for duplicate
                if any(m.lower() == pending.author.lower() for m in spawn_info.members):
                    await reaction.message.reply(
                        f"⚠️ **{pending.author}** is already verified. Ignoring duplicate."
                    )
                    await reaction.message.clear_reactions()
                    del self.pending_verifications[reaction.message.id]
                    return
                
                # Add to verified list
                spawn_info.members.append(pending.author)
                
                await reaction.message.clear_reactions()
                await reaction.message.reply(
                    f"✅ **{pending.author}** verified by {user.name}!"
                )
                
                # Update confirmation thread
                if spawn_info.confirm_thread_id:
                    confirm_thread = self.bot.get_channel(spawn_info.confirm_thread_id)
                    if confirm_thread:
                        boss_data = self.config.boss_points[spawn_info.boss]
                        embed = discord.Embed(
                            title="✅ Attendance Verified",
                            description=f"**{pending.author}** verified for **{spawn_info.boss}**",
                            color=0x00FF00
                        )
                        embed.add_field(name="Verified By", value=user.name, inline=True)
                        embed.add_field(name="Points", value=f"+{boss_data['points']}", inline=True)
                        embed.add_field(name="Total Verified", value=f"{len(spawn_info.members)}", inline=True)
                        embed.timestamp = datetime.now(timezone.utc)
                        await confirm_thread.send(embed=embed)
                
                del self.pending_verifications[reaction.message.id]
                print(f"✅ Verified: {pending.author} for {spawn_info.boss} by {user.name}")
            
            elif reaction.emoji == "❌":
                await reaction.message.delete()
                await reaction.message.channel.send(
                    f"<@{pending.author_id}>, your attendance was **denied** by {user.name}. "
                    f"Please repost with a proper screenshot."
                )
                del self.pending_verifications[reaction.message.id]
                print(f"❌ Denied: {pending.author} for {spawn_info.boss} by {user.name}")
    
    async def recover_state(self):
        """Recover state from existing threads on bot restart"""
        print("🔄 Scanning for existing threads...")
        
        guild = self.bot.get_guild(int(self.config.main_guild_id))
        if not guild:
            return
        
        att_channel = guild.get_channel(int(self.config.attendance_channel_id))
        admin_logs = guild.get_channel(int(self.config.admin_logs_channel_id))
        
        if not att_channel or not admin_logs:
            return
        
        recovered_count = 0
        pending_count = 0
        
        # Get active threads
        for thread in att_channel.threads:
            if thread.archived:
                continue
            
            parsed = self.parse_thread_name(thread.name)
            if not parsed:
                continue
            
            boss_name = self.config.find_boss_match(parsed['boss'])
            if not boss_name:
                continue
            
            # Fetch messages
            messages = []
            async for msg in thread.history(limit=100):
                messages.append(msg)
            
            members = []
            for msg in messages:
                if msg.author.id == self.bot.user.id and "verified by" in msg.content.lower():
                    import re
                    match = re.search(r'\*\*(.+?)\*\* verified by', msg.content)
                    if match:
                        members.append(match.group(1))
                
                # Check for pending verifications
                if msg.reactions:
                    has_check = any(r.emoji == "✅" for r in msg.reactions)
                    has_x = any(r.emoji == "❌" for r in msg.reactions)
                    
                    if has_check and has_x:
                        # Check if already replied to
                        has_reply = any(
                            m.reference and m.reference.message_id == msg.id and
                            m.author.id == self.bot.user.id and "verified" in m.content.lower()
                            for m in messages
                        )
                        
                        if not has_reply:
                            username = msg.author.display_name or msg.author.name
                            self.pending_verifications[msg.id] = PendingVerification(
                                author=username,
                                author_id=msg.author.id,
                                thread_id=thread.id,
                                timestamp=msg.created_at.timestamp()
                            )
                            pending_count += 1
            
            # Find confirmation thread
            confirm_thread_id = None
            for admin_thread in admin_logs.threads:
                if admin_thread.name == f"✅ {thread.name}":
                    confirm_thread_id = admin_thread.id
                    break
            
            # Store spawn info
            self.active_spawns[thread.id] = SpawnInfo(
                boss=boss_name,
                date=parsed['date'],
                time=parsed['time'],
                timestamp=parsed['timestamp'],
                members=members,
                confirm_thread_id=confirm_thread_id,
                closed=False
            )
            
            self.active_columns[f"{boss_name}|{parsed['timestamp']}"] = thread.id
            recovered_count += 1
            
            print(f"✅ Recovered: {boss_name} at {parsed['timestamp']} - "
                  f"{len(members)} verified, {pending_count} pending")
        
        if recovered_count > 0:
            print(f"🎉 State recovery complete! Recovered {recovered_count} spawn(s), "
                  f"{pending_count} pending verification(s)")
            
            if admin_logs:
                embed = discord.Embed(
                    title="🔄 Bot State Recovered",
                    description="Bot restarted and recovered existing threads",
                    color=0x00FF00
                )
                embed.add_field(name="Spawns Recovered", value=str(recovered_count), inline=True)
                embed.add_field(name="Pending Verifications", value=str(pending_count), inline=True)
                embed.timestamp = datetime.now(timezone.utc)
                await admin_logs.send(embed=embed)
        else:
            print("🔭 No active threads found to recover")