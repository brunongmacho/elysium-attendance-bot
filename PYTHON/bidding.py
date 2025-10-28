"""
ELYSIUM Bot - Bidding System
Handles auction queue, bidding, and point management
"""
import discord
import asyncio
import aiohttp
import json
from datetime import datetime, timezone
from typing import Dict, Optional, List
from dataclasses import dataclass, field

@dataclass
class QueueItem:
    id: str
    item: str
    start_price: int
    duration: int
    quantity: int
    added_at: float

@dataclass
class ActiveAuction:
    id: str
    item: str
    start_price: int
    duration: int
    quantity: int
    thread_id: int
    cur_bid: int
    cur_winner: Optional[str] = None
    cur_winner_id: Optional[int] = None
    bids: List[Dict] = field(default_factory=list)
    winners: List[Dict] = field(default_factory=list)  # For batch auctions
    end_time: float = 0
    ext_count: int = 0
    status: str = "preview"
    going_once: bool = False
    going_twice: bool = False

@dataclass
class PendingConfirmation:
    user_id: int
    username: str
    thread_id: Optional[int]
    amount: int
    timestamp: float
    orig_msg_id: int
    is_self: bool
    needed: int

class BiddingSystem:
    def __init__(self, bot, config):
        self.bot = bot
        self.config = config
        self.queue: List[QueueItem] = []
        self.active_auction: Optional[ActiveAuction] = None
        self.locked_points: Dict[str, int] = {}
        self.history: List[Dict] = []
        self.pending_confirmations: Dict[int, PendingConfirmation] = {}
        self.cached_points: Optional[Dict[str, int]] = None
        self.cache_timestamp: Optional[float] = None
        self.last_bid_time: Dict[int, float] = {}
        self.session_date: Optional[str] = None
        self.paused = False
        self.pause_timer = None
        
        # Constants
        self.CONFIRM_TIMEOUT = 10.0
        self.RATE_LIMIT = 3.0
        self.MAX_EXTENSIONS = 15
        self.PREVIEW_TIME = 30.0
    
    async def post_to_sheet(self, payload: dict) -> dict:
        """Post data to Google Sheets"""
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
    
    async def load_points_cache(self) -> bool:
        """Load points from Google Sheets into cache"""
        print("🔄 Loading points cache...")
        start = datetime.now().timestamp()
        
        resp = await self.post_to_sheet({'action': 'getBiddingPoints'})
        
        if not resp['ok']:
            print("❌ Cache load failed")
            return False
        
        try:
            data = json.loads(resp['text'])
            self.cached_points = data.get('points', {})
            self.cache_timestamp = datetime.now().timestamp()
            elapsed = datetime.now().timestamp() - start
            print(f"✅ Cache loaded: {elapsed:.2f}s - {len(self.cached_points)} members")
            return True
        except Exception as e:
            print(f"❌ Cache parse error: {e}")
            return False
    
    def get_points(self, username: str) -> int:
        """Get cached points for user"""
        if not self.cached_points:
            return 0
        
        # Try exact match
        points = self.cached_points.get(username)
        if points is not None:
            return points
        
        # Try case-insensitive match
        username_lower = username.lower()
        for name, pts in self.cached_points.items():
            if name.lower() == username_lower:
                return pts
        
        return 0
    
    def get_available_points(self, username: str) -> int:
        """Get available points (total - locked)"""
        total = self.get_points(username)
        locked = self.locked_points.get(username, 0)
        return max(0, total - locked)
    
    def lock_points(self, username: str, amount: int):
        """Lock points for user"""
        self.locked_points[username] = self.locked_points.get(username, 0) + amount
    
    def unlock_points(self, username: str, amount: int):
        """Unlock points for user"""
        current = self.locked_points.get(username, 0)
        new_amount = max(0, current - amount)
        if new_amount == 0:
            self.locked_points.pop(username, None)
        else:
            self.locked_points[username] = new_amount
    
    def add_to_queue(self, item: str, start_price: int, duration: int, quantity: int = 1) -> QueueItem:
        """Add item to auction queue"""
        import random
        queue_item = QueueItem(
            id=f"a_{int(datetime.now().timestamp())}_{random.randint(1000, 9999)}",
            item=item.strip(),
            start_price=start_price,
            duration=duration,
            quantity=quantity,
            added_at=datetime.now().timestamp()
        )
        self.queue.append(queue_item)
        return queue_item
    
    def remove_from_queue(self, item_name: str) -> Optional[QueueItem]:
        """Remove item from queue by name"""
        for i, queue_item in enumerate(self.queue):
            if queue_item.item.lower() == item_name.lower():
                return self.queue.pop(i)
        return None
    
    def clear_queue(self) -> int:
        """Clear all items from queue"""
        count = len(self.queue)
        self.queue.clear()
        return count
    
    async def start_auction(self, item: QueueItem, channel: discord.TextChannel):
        """Start auction for an item"""
        if not await self.load_points_cache():
            await channel.send("❌ Failed to load points cache")
            return False
        
        # Create auction thread
        thread_name = f"{item.item} - {self.get_timestamp()} | {item.start_price}pts | {item.duration}min"
        if item.quantity > 1:
            thread_name = f"{item.item} x{item.quantity} - {self.get_timestamp()} | {item.start_price}pts | {item.duration}min"
        
        thread = await channel.create_thread(
            name=thread_name,
            auto_archive_duration=60,
            reason=f"Auction: {item.item}"
        )
        
        # Create auction object
        self.active_auction = ActiveAuction(
            id=item.id,
            item=item.item,
            start_price=item.start_price,
            duration=item.duration,
            quantity=item.quantity,
            thread_id=thread.id,
            cur_bid=item.start_price,
            status="preview"
        )
        
        # Send preview
        is_batch = item.quantity > 1
        embed = discord.Embed(
            title="🏆 AUCTION STARTING",
            description=f"**{item.item}**{f' x{item.quantity}' if is_batch else ''}",
            color=0xFFD700
        )
        embed.add_field(name="💰 Starting Bid", value=f"{item.start_price} points", inline=True)
        embed.add_field(name="⏱️ Duration", value=f"{item.duration}min", inline=True)
        embed.add_field(name="📋 Items Left", value=f"{len(self.queue) - 1}", inline=True)
        
        if is_batch:
            embed.add_field(
                name="🔥 Batch Auction",
                value=f"Top {item.quantity} bidders will win!",
                inline=False
            )
        
        embed.set_footer(text="Starts in 30 seconds")
        embed.timestamp = datetime.now(timezone.utc)
        
        await thread.send(content="@everyone", embed=embed)
        
        # Wait for preview
        await asyncio.sleep(self.PREVIEW_TIME)
        
        # Start bidding
        await self.activate_auction(thread)
        
        return True
    
    async def activate_auction(self, thread: discord.Thread):
        """Activate bidding for current auction"""
        if not self.active_auction:
            return
        
        self.active_auction.status = "active"
        self.active_auction.end_time = datetime.now().timestamp() + (self.active_auction.duration * 60)
        
        is_batch = self.active_auction.quantity > 1
        
        embed = discord.Embed(
            title="🔥 BIDDING NOW!",
            description=f"Type `!bid <amount>` or `!b <amount>` to bid",
            color=0x00FF00
        )
        
        if is_batch:
            embed.description += f"\n\n**{self.active_auction.quantity} items available** - Top {self.active_auction.quantity} bidders win!"
        
        embed.add_field(name="💰 Current", value=f"{self.active_auction.cur_bid} pts", inline=True)
        embed.add_field(name="⏱️ Time", value=f"{self.active_auction.duration}min", inline=True)
        embed.set_footer(text="🕐 10s confirm • 🔒 3s rate limit")
        
        await thread.send(embed=embed)
        
        # Schedule timers
        self.schedule_auction_timers()
    
    def schedule_auction_timers(self):
        """Schedule going once, twice, final call timers"""
        if not self.active_auction:
            return
        
        time_left = self.active_auction.end_time - datetime.now().timestamp()
        
        if time_left > 60 and not self.active_auction.going_once:
            asyncio.create_task(self.timer_going_once(time_left - 60))
        if time_left > 30 and not self.active_auction.going_twice:
            asyncio.create_task(self.timer_going_twice(time_left - 30))
        if time_left > 10:
            asyncio.create_task(self.timer_final_call(time_left - 10))
        
        asyncio.create_task(self.timer_end_auction(time_left))
    
    async def timer_going_once(self, delay: float):
        """Timer for 'going once' announcement"""
        await asyncio.sleep(delay)
        if not self.active_auction or self.active_auction.status != "active" or self.paused:
            return
        
        thread = self.bot.get_channel(self.active_auction.thread_id)
        if thread:
            embed = discord.Embed(
                title="⚠️ GOING ONCE!",
                description="1 minute left",
                color=0xFFA500
            )
            current = f"{self.active_auction.cur_winner} - {self.active_auction.cur_bid}pts" if self.active_auction.cur_winner else f"{self.active_auction.start_price}pts (no bids)"
            embed.add_field(name="💰 Current", value=current)
            await thread.send(content="@everyone", embed=embed)
        
        self.active_auction.going_once = True
    
    async def timer_going_twice(self, delay: float):
        """Timer for 'going twice' announcement"""
        await asyncio.sleep(delay)
        if not self.active_auction or self.active_auction.status != "active" or self.paused:
            return
        
        thread = self.bot.get_channel(self.active_auction.thread_id)
        if thread:
            embed = discord.Embed(
                title="⚠️ GOING TWICE!",
                description="30 seconds left",
                color=0xFFA500
            )
            current = f"{self.active_auction.cur_winner} - {self.active_auction.cur_bid}pts" if self.active_auction.cur_winner else f"{self.active_auction.start_price}pts (no bids)"
            embed.add_field(name="💰 Current", value=current)
            await thread.send(content="@everyone", embed=embed)
        
        self.active_auction.going_twice = True
    
    async def timer_final_call(self, delay: float):
        """Timer for final call"""
        await asyncio.sleep(delay)
        if not self.active_auction or self.active_auction.status != "active" or self.paused:
            return
        
        thread = self.bot.get_channel(self.active_auction.thread_id)
        if thread:
            embed = discord.Embed(
                title="⚠️ FINAL CALL!",
                description="10 seconds left",
                color=0xFF0000
            )
            current = f"{self.active_auction.cur_winner} - {self.active_auction.cur_bid}pts" if self.active_auction.cur_winner else f"{self.active_auction.start_price}pts (no bids)"
            embed.add_field(name="💰 Current", value=current)
            await thread.send(content="@everyone", embed=embed)
    
    async def timer_end_auction(self, delay: float):
        """Timer for ending auction"""
        await asyncio.sleep(delay)
        if not self.active_auction or self.active_auction.status != "active":
            return
        
        await self.end_auction()
    
    async def end_auction(self):
        """End current auction"""
        if not self.active_auction:
            return
        
        self.active_auction.status = "ended"
        thread = self.bot.get_channel(self.active_auction.thread_id)
        
        if not thread:
            return
        
        is_batch = self.active_auction.quantity > 1
        
        if is_batch and len(self.active_auction.bids) > 0:
            # Batch auction - determine winners
            sorted_bids = sorted(self.active_auction.bids, key=lambda x: x['amount'], reverse=True)
            winners = sorted_bids[:self.active_auction.quantity]
            
            self.active_auction.winners = winners
            
            winners_list = '\n'.join([
                f"{i+1}. <@{w['user_id']}> - {w['amount']}pts"
                for i, w in enumerate(winners)
            ])
            
            embed = discord.Embed(
                title="🔨 SOLD!",
                description=f"**{self.active_auction.item}** x{self.active_auction.quantity} sold!",
                color=0xFFD700
            )
            embed.add_field(name="🏆 Winners", value=winners_list, inline=False)
            embed.set_footer(text="Points deducted after session")
            embed.timestamp = datetime.now(timezone.utc)
            
            await thread.send(embed=embed)
            
            # Add to history
            for winner in winners:
                self.history.append({
                    'item': self.active_auction.item,
                    'winner': winner['username'],
                    'winner_id': winner['user_id'],
                    'amount': winner['amount'],
                    'timestamp': datetime.now().timestamp()
                })
        
        elif self.active_auction.cur_winner:
            # Single item auction with winner
            embed = discord.Embed(
                title="🔨 SOLD!",
                description=f"**{self.active_auction.item}** sold!",
                color=0xFFD700
            )
            embed.add_field(name="🏆 Winner", value=f"<@{self.active_auction.cur_winner_id}>", inline=True)
            embed.add_field(name="💰 Price", value=f"{self.active_auction.cur_bid}pts", inline=True)
            embed.set_footer(text="Points deducted after session")
            embed.timestamp = datetime.now(timezone.utc)
            
            await thread.send(embed=embed)
            
            # Add to history
            self.history.append({
                'item': self.active_auction.item,
                'winner': self.active_auction.cur_winner,
                'winner_id': self.active_auction.cur_winner_id,
                'amount': self.active_auction.cur_bid,
                'timestamp': datetime.now().timestamp()
            })
        
        else:
            # No bids
            embed = discord.Embed(
                title="❌ NO BIDS",
                description=f"**{self.active_auction.item}** - no bids",
                color=0x4A90E2
            )
            embed.set_footer(text="Next item...")
            await thread.send(embed=embed)
        
        # Archive thread
        await thread.edit(archived=True, reason="Auction ended")
        
        # Remove from queue
        self.queue = [q for q in self.queue if q.id != self.active_auction.id]
        self.active_auction = None
        
        # Start next auction
        if len(self.queue) > 0:
            channel = thread.parent
            await asyncio.sleep(20)  # 20 second gap
            next_item = self.queue[0]
            await channel.send(f"🕐 Next in 20s...\n📋 **{next_item.item}** - {next_item.start_price}pts")
            await asyncio.sleep(20)
            await self.start_auction(next_item, channel)
        else:
            # Session complete - submit results
            await self.finalize_session()
    
    async def finalize_session(self):
        """Finalize bidding session and submit results"""
        if len(self.history) == 0:
            print("ℹ️ No items sold this session")
            return
        
        if not self.session_date:
            self.session_date = self.get_timestamp()
        
        # Build results
        all_members = list(self.cached_points.keys())
        winners = {}
        
        for item in self.history:
            winner_lower = item['winner'].lower().strip()
            winners[winner_lower] = winners.get(winner_lower, 0) + item['amount']
        
        results = []
        for member in all_members:
            member_lower = member.lower().strip()
            results.append({
                'member': member,
                'totalSpent': winners.get(member_lower, 0)
            })
        
        # Submit to sheets
        resp = await self.post_to_sheet({
            'action': 'submitBiddingResults',
            'results': results,
            'timestamp': self.session_date
        })
        
        if resp['ok']:
            print("✅ Session results submitted")
            # Clear state
            self.history.clear()
            self.locked_points.clear()
            self.session_date = None
            self.cached_points = None
        else:
            print(f"❌ Failed to submit results: {resp.get('error', 'Unknown')}")
    
    def get_timestamp(self) -> str:
        """Get current Manila time formatted"""
        from datetime import timezone, timedelta
        manila_tz = timezone(timedelta(hours=8))
        now = datetime.now(manila_tz)
        return now.strftime("%m/%d/%y %H:%M")
    
    async def process_bid(self, message: discord.Message, amount: str) -> dict:
        """Process a bid command"""
        if not self.active_auction or self.active_auction.status != "active":
            return {'ok': False, 'msg': 'No active auction'}
        
        if message.channel.id != self.active_auction.thread_id:
            return {'ok': False, 'msg': 'Wrong thread'}
        
        member = message.author
        username = message.author.display_name or message.author.name
        
        # Check role
        if not self.config.is_admin(member) and not any(role.name == "ELYSIUM" for role in member.roles):
            await message.reply("❌ You need the ELYSIUM role to bid")
            return {'ok': False, 'msg': 'No role'}
        
        # Rate limit
        now = datetime.now().timestamp()
        if member.id in self.last_bid_time:
            time_since = now - self.last_bid_time[member.id]
            if time_since < self.RATE_LIMIT:
                wait = int(self.RATE_LIMIT - time_since) + 1
                await message.reply(f"🕐 Wait {wait}s (rate limit)")
                return {'ok': False, 'msg': 'Rate limited'}
        
        # Parse bid
        try:
            bid = int(amount)
            if bid <= 0:
                raise ValueError
        except:
            await message.reply("❌ Invalid bid (integers only)")
            return {'ok': False, 'msg': 'Invalid'}
        
        if bid <= self.active_auction.cur_bid:
            await message.reply(f"❌ Must be > {self.active_auction.cur_bid}pts")
            return {'ok': False, 'msg': 'Too low'}
        
        # Check points
        if not self.cached_points:
            await message.reply("❌ Cache not loaded")
            return {'ok': False, 'msg': 'No cache'}
        
        total = self.get_points(username)
        available = self.get_available_points(username)
        
        if total == 0:
            await message.reply("❌ No points")
            return {'ok': False, 'msg': 'No points'}
        
        # Check if self-overbid
        is_self = self.active_auction.cur_winner and self.active_auction.cur_winner.lower() == username.lower()
        cur_locked = self.locked_points.get(username, 0)
        needed = max(0, bid - cur_locked) if is_self else bid
        
        if needed > available:
            await message.reply(
                f"❌ **Insufficient!**\n"
                f"💰 Total: {total}\n"
                f"🔒 Locked: {cur_locked}\n"
                f"📊 Available: {available}\n"
                f"⚠️ Need: {needed}"
            )
            return {'ok': False, 'msg': 'Insufficient'}
        
        # Create confirmation
        embed = discord.Embed(
            title="🕐 Confirm Bid",
            description=f"**{self.active_auction.item}**",
            color=0xFFD700
        )
        embed.add_field(name="💰 Your Bid", value=f"{bid}pts", inline=True)
        embed.add_field(name="📊 Current", value=f"{self.active_auction.cur_bid}pts", inline=True)
        embed.add_field(name="💳 After", value=f"{available - needed}pts", inline=True)
        
        if is_self:
            embed.add_field(
                name="🔄 Self-Overbid",
                value=f"Current: {self.active_auction.cur_bid}pts → New: {bid}pts\n**+{needed}pts needed**",
                inline=False
            )
        
        embed.set_footer(text="✅ confirm / ❌ cancel • 10s timeout")
        
        conf_msg = await message.reply(embed=embed)
        await conf_msg.add_reaction("✅")
        await conf_msg.add_reaction("❌")
        
        # Store confirmation
        self.pending_confirmations[conf_msg.id] = PendingConfirmation(
            user_id=member.id,
            username=username,
            thread_id=self.active_auction.thread_id,
            amount=bid,
            timestamp=now,
            orig_msg_id=message.id,
            is_self=is_self,
            needed=needed
        )
        
        self.last_bid_time[member.id] = now
        
        # Wait for confirmation
        def check(reaction, user):
            return (
                reaction.message.id == conf_msg.id and
                user.id == member.id and
                str(reaction.emoji) in ['✅', '❌']
            )
        
        try:
            reaction, user = await self.bot.wait_for('reaction_add', timeout=self.CONFIRM_TIMEOUT, check=check)
            
            if str(reaction.emoji) == '✅':
                await self.confirm_bid(conf_msg, member)
            else:
                await self.cancel_bid(conf_msg)
            
        except asyncio.TimeoutError:
            await self.timeout_bid(conf_msg)
        
        return {'ok': True}
    
    async def confirm_bid(self, conf_msg: discord.Message, user: discord.User):
        """Confirm a bid"""
        pending = self.pending_confirmations.get(conf_msg.id)
        if not pending or not self.active_auction:
            return
        
        # Validate bid still valid
        if pending.amount <= self.active_auction.cur_bid:
            await conf_msg.channel.send(f"❌ <@{user.id}> Bid invalid. Current: {self.active_auction.cur_bid}pts")
            await conf_msg.clear_reactions()
            await conf_msg.delete()
            del self.pending_confirmations[conf_msg.id]
            return
        
        # Handle previous winner
        if self.active_auction.cur_winner and not pending.is_self:
            self.unlock_points(self.active_auction.cur_winner, self.active_auction.cur_bid)
            await conf_msg.channel.send(
                f"<@{self.active_auction.cur_winner_id}>",
                embed=discord.Embed(
                    title="⚠️ Outbid!",
                    description=f"Someone bid **{pending.amount}pts** on **{self.active_auction.item}**",
                    color=0xFFA500
                )
            )
        
        # Lock points
        self.lock_points(pending.username, pending.needed)
        
        # Update auction
        prev_bid = self.active_auction.cur_bid
        self.active_auction.cur_bid = pending.amount
        self.active_auction.cur_winner = pending.username
        self.active_auction.cur_winner_id = pending.user_id
        self.active_auction.bids.append({
            'username': pending.username,
            'user_id': pending.user_id,
            'amount': pending.amount,
            'timestamp': datetime.now().timestamp()
        })
        
        # Extension logic
        time_left = self.active_auction.end_time - datetime.now().timestamp()
        if time_left < 60 and self.active_auction.ext_count < self.MAX_EXTENSIONS:
            self.active_auction.end_time += 60
            self.active_auction.ext_count += 1
            self.active_auction.going_once = False
            self.active_auction.going_twice = False
        
        # Update confirmation message
        embed = discord.Embed(
            title="✅ Bid Confirmed!",
            description=f"Highest bidder on **{self.active_auction.item}**",
            color=0x00FF00
        )
        embed.add_field(name="💰 Your Bid", value=f"{pending.amount}pts", inline=True)
        embed.add_field(name="📊 Previous", value=f"{prev_bid}pts", inline=True)
        embed.add_field(name="⏱️ Time Left", value=f"{int(time_left)}s", inline=True)
        embed.set_footer(text="Self-overbid" if pending.is_self else "Good luck!")
        
        await conf_msg.edit(embed=embed)
        await conf_msg.clear_reactions()
        
        # Announce new bid
        await conf_msg.channel.send(
            embed=discord.Embed(
                title="🔥 New High Bid!",
                color=0xFFD700
            ).add_field(name="💰 Amount", value=f"{pending.amount}pts", inline=True)
             .add_field(name="👤 Bidder", value=pending.username, inline=True)
        )
        
        # Delete messages
        await asyncio.sleep(5)
        await conf_msg.delete()
        try:
            orig_msg = await conf_msg.channel.fetch_message(pending.orig_msg_id)
            await orig_msg.delete()
        except:
            pass
        
        del self.pending_confirmations[conf_msg.id]
        
        print(f"✅ Bid: {pending.username} - {pending.amount}pts")
    
    async def cancel_bid(self, conf_msg: discord.Message):
        """Cancel a bid"""
        pending = self.pending_confirmations.get(conf_msg.id)
        if not pending:
            return
        
        embed = discord.Embed(
            title="❌ Bid Canceled",
            description="Not placed",
            color=0x4A90E2
        )
        await conf_msg.edit(embed=embed)
        await conf_msg.clear_reactions()
        
        await asyncio.sleep(3)
        await conf_msg.delete()
        
        try:
            orig_msg = await conf_msg.channel.fetch_message(pending.orig_msg_id)
            await orig_msg.delete()
        except:
            pass
        
        del self.pending_confirmations[conf_msg.id]
    
    async def timeout_bid(self, conf_msg: discord.Message):
        """Timeout a bid confirmation"""
        pending = self.pending_confirmations.get(conf_msg.id)
        if not pending:
            return
        
        embed = discord.Embed(
            title="🕐 Timed Out",
            description="Bid not placed",
            color=0x4A90E2
        )
        await conf_msg.edit(embed=embed)
        await conf_msg.clear_reactions()
        
        await asyncio.sleep(3)
        await conf_msg.delete()
        
        del self.pending_confirmations[conf_msg.id]