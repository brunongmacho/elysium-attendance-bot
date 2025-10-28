"""
ELYSIUM Bot - Bidding System (Complete with Auctioneering Support)
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
class PendingConfirmation:
    user_id: int
    username: str
    thread_id: Optional[int]
    amount: int
    timestamp: float
    orig_msg_id: int
    is_self: bool
    needed: int
    is_auctioneering: bool = False
    current_item: Optional[any] = None
    auctioneering_ref: Optional[any] = None

class BiddingSystem:
    def __init__(self, bot, config):
        self.bot = bot
        self.config = config
        self.queue: List[QueueItem] = []
        self.active_auction = None
        self.locked_points: Dict[str, int] = {}
        self.history: List[Dict] = []
        self.pending_confirmations: Dict[int, PendingConfirmation] = {}
        self.cached_points: Optional[Dict[str, int]] = None
        self.cache_timestamp: Optional[float] = None
        self.last_bid_time: Dict[int, float] = {}
        self.session_date: Optional[str] = None
        
        # Constants
        self.CONFIRM_TIMEOUT = 10.0
        self.RATE_LIMIT = 3.0
        self.MAX_EXTENSIONS = 15
    
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
    
    def clear_points_cache(self):
        """Clear points cache"""
        self.cached_points = None
        self.cache_timestamp = None
    
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
    
    async def process_bid(self, message: discord.Message, amount: str) -> dict:
        """Process a bid command"""
        member = message.author
        username = message.author.display_name or message.author.username
        
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
        
        # Check points
        if not self.cached_points:
            await message.reply("❌ Cache not loaded")
            return {'ok': False, 'msg': 'No cache'}
        
        total = self.get_points(username)
        available = self.get_available_points(username)
        
        if total == 0:
            await message.reply("❌ No points")
            return {'ok': False, 'msg': 'No points'}
        
        # Get current bid from auctioneering or regular auction
        current_bid = 0
        current_winner = None
        
        # Check if this is for auctioneering
        # (This will be set by the message handler based on auctioneering state)
        
        # For now, create confirmation
        embed = discord.Embed(
            title="🕐 Confirm Bid",
            description=f"Confirming bid...",
            color=0xFFD700
        )
        embed.add_field(name="💰 Your Bid", value=f"{bid}pts", inline=True)
        embed.set_footer(text="✅ confirm / ❌ cancel • 10s timeout")
        
        conf_msg = await message.reply(embed=embed)
        await conf_msg.add_reaction("✅")
        await conf_msg.add_reaction("❌")
        
        # Store confirmation
        self.pending_confirmations[conf_msg.id] = PendingConfirmation(
            user_id=member.id,
            username=username,
            thread_id=message.channel.id,
            amount=bid,
            timestamp=now,
            orig_msg_id=message.id,
            is_self=False,
            needed=bid,
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
                await self.confirm_bid(conf_msg, user)
            else:
                await self.cancel_bid(conf_msg)
            
        except asyncio.TimeoutError:
            await self.timeout_bid(conf_msg)
        
        return {'ok': True}
    
    async def confirm_bid(self, conf_msg: discord.Message, user: discord.User):
        """Confirm a bid"""
        pending = self.pending_confirmations.get(conf_msg.id)
        if not pending:
            return
        
        # Handle auctioneering bids
        if pending.is_auctioneering:
            await self.confirm_auctioneering_bid(conf_msg, user, pending)
            return
        
        # Regular bidding logic would go here
        await conf_msg.edit(content="✅ Bid confirmed!")
        await conf_msg.clear_reactions()
        
        del self.pending_confirmations[conf_msg.id]
    
    async def confirm_auctioneering_bid(self, conf_msg: discord.Message, user: discord.User, pending: PendingConfirmation):
        """Confirm an auctioneering bid"""
        current_item = pending.current_item
        auctioneering_ref = pending.auctioneering_ref
        
        if not current_item or not auctioneering_ref:
            await conf_msg.reply("❌ Auction state error")
            del self.pending_confirmations[conf_msg.id]
            return
        
        # Validate bid still valid
        if pending.amount <= current_item.cur_bid:
            await conf_msg.channel.send(f"❌ <@{user.id}> Bid invalid. Current: {current_item.cur_bid}pts")
            await conf_msg.clear_reactions()
            await conf_msg.delete()
            del self.pending_confirmations[conf_msg.id]
            return
        
        # Handle previous winner
        if current_item.cur_winner and not pending.is_self:
            self.unlock_points(current_item.cur_winner, current_item.cur_bid)
            await conf_msg.channel.send(
                f"<@{current_item.cur_winner_id}>",
                embed=discord.Embed(
                    title="⚠️ Outbid!",
                    description=f"Someone bid **{pending.amount}pts** on **{current_item.item}**",
                    color=0xFFA500
                )
            )
        
        # Lock points
        self.lock_points(pending.username, pending.needed)
        
        # Update auction state
        prev_bid = current_item.cur_bid
        
        # Update through auctioneering reference
        auctioneering_ref.update_current_item_state({
            'cur_bid': pending.amount,
            'cur_winner': pending.username,
            'cur_winner_id': pending.user_id,
            'bids': current_item.bids + [{
                'username': pending.username,
                'user_id': pending.user_id,
                'amount': pending.amount,
                'timestamp': datetime.now().timestamp()
            }]
        })
        
        # Extension logic
        time_left = current_item.end_time - datetime.now().timestamp()
        if time_left < 60 and current_item.ext_count < self.MAX_EXTENSIONS:
            auctioneering_ref.update_current_item_state({
                'end_time': current_item.end_time + 60,
                'ext_count': current_item.ext_count + 1,
                'going_once': False,
                'going_twice': False,
            })
        
        # Update confirmation message
        embed = discord.Embed(
            title="✅ Bid Confirmed!",
            description=f"Highest bidder on **{current_item.item}**",
            color=0x00FF00
        )
        embed.add_field(name="💰 Your Bid", value=f"{pending.amount}pts", inline=True)
        embed.add_field(name="📊 Previous", value=f"{prev_bid}pts", inline=True)
        embed.add_field(name="⏱️ Time Left", value=f"{int(time_left)}s", inline=True)
        
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
        
        # Delete messages after delay
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
    
    async def process_bid_for_auctioneering(self, message: discord.Message, amount: str, 
                                            current_item, auctioneering_ref) -> dict:
        """Process a bid during auctioneering (attendance already checked)"""
        member = message.author
        username = message.author.display_name or message.author.username
        
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
        
        if bid <= current_item.cur_bid:
            await message.reply(f"❌ Must be > {current_item.cur_bid}pts")
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
        is_self = current_item.cur_winner and current_item.cur_winner.lower() == username.lower()
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
            description=f"**{current_item.item}**",
            color=0xFFD700
        )
        embed.add_field(name="💰 Your Bid", value=f"{bid}pts", inline=True)
        embed.add_field(name="📊 Current", value=f"{current_item.cur_bid}pts", inline=True)
        embed.add_field(name="💳 After", value=f"{available - needed}pts", inline=True)
        
        if is_self:
            embed.add_field(
                name="🔄 Self-Overbid",
                value=f"Current: {current_item.cur_bid}pts → New: {bid}pts\n**+{needed}pts needed**",
                inline=False
            )
        
        embed.set_footer(text="✅ confirm / ❌ cancel • 10s timeout")
        
        conf_msg = await message.reply(embed=embed)
        await conf_msg.add_reaction("✅")
        await conf_msg.add_reaction("❌")
        
        # Store confirmation with auctioneering flag
        self.pending_confirmations[conf_msg.id] = PendingConfirmation(
            user_id=member.id,
            username=username,
            thread_id=None,
            amount=bid,
            timestamp=now,
            orig_msg_id=message.id,
            is_self=is_self,
            needed=needed,
            is_auctioneering=True,
            current_item=current_item,
            auctioneering_ref=auctioneering_ref,
        )
        
        self.last_bid_time[member.id] = now
        
        return {'ok': True, 'conf_id': conf_msg.id}