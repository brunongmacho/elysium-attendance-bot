"""
ELYSIUM Bot - Auctioneering System
Manages automated auction sessions from Google Sheets + manual queue
"""
import discord
import asyncio
import aiohttp
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, List
from dataclasses import dataclass, field

@dataclass
class AuctionItem:
    item: str
    start_price: int
    duration: int
    quantity: int
    source: str  # "GoogleSheet" or "QueueList"
    sheet_index: Optional[int] = None
    batch_number: Optional[int] = None
    batch_total: Optional[int] = None
    auction_start_time: Optional[str] = None

@dataclass
class CurrentItem:
    item: str
    start_price: int
    duration: int
    quantity: int
    source: str
    cur_bid: int
    cur_winner: Optional[str] = None
    cur_winner_id: Optional[int] = None
    bids: List[Dict] = field(default_factory=list)
    end_time: float = 0
    ext_count: int = 0
    status: str = "active"
    going_once: bool = False
    going_twice: bool = False
    auction_start_time: Optional[str] = None
    auction_end_time: Optional[str] = None
    sheet_index: Optional[int] = None

class AuctioneeringSystem:
    def __init__(self, bot, config, bidding_system):
        self.bot = bot
        self.config = config
        self.bidding = bidding_system
        
        # State
        self.active = False
        self.current_item: Optional[CurrentItem] = None
        self.item_queue: List[AuctionItem] = []
        self.session_items: List[Dict] = []
        self.current_item_index = 0
        self.paused = False
        self.paused_time: Optional[float] = None
        
        # Tracking
        self.session_start_time: Optional[float] = None
        self.session_timestamp: Optional[str] = None
        self.manual_items_auctioned: List[Dict] = []
        
        # Constants
        self.ITEM_WAIT = 20.0  # seconds between items
        self.PREVIEW_TIME = 20.0  # seconds preview before bidding starts
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
    
    async def fetch_sheet_items(self) -> Optional[List[Dict]]:
        """Fetch items from BiddingItems sheet"""
        resp = await self.post_to_sheet({'action': 'getBiddingItems'})
        if not resp['ok']:
            return None
        
        try:
            data = json.loads(resp['text'])
            return data.get('items', [])
        except:
            return None
    
    def get_manila_timestamp(self) -> dict:
        """Get current Manila time formatted"""
        manila_tz = timezone(timedelta(hours=8))
        now = datetime.now(manila_tz)
        
        month = now.strftime("%m")
        day = now.strftime("%d")
        year = now.strftime("%y")
        hours = now.strftime("%H")
        mins = now.strftime("%M")
        
        return {
            'date': f"{month}/{day}/{year}",
            'time': f"{hours}:{mins}",
            'full': f"{month}/{day}/{year} {hours}:{mins}"
        }
    
    async def start_auctioneering(self, channel: discord.TextChannel) -> dict:
        """Start auctioneering session"""
        if self.active:
            return {'ok': False, 'msg': 'Already running'}
        
        # Load points cache
        if not await self.bidding.load_points_cache():
            return {'ok': False, 'msg': 'Failed to load points cache'}
        
        # Fetch items from Google Sheet
        sheet_items = await self.fetch_sheet_items()
        if sheet_items is None:
            return {'ok': False, 'msg': 'Failed to fetch sheet items'}
        
        # Get queue items from bidding system
        queue_items = self.bidding.queue.copy()
        
        # Clear queues
        self.item_queue.clear()
        self.session_items.clear()
        self.manual_items_auctioned.clear()
        
        # Get session info
        session_ts = self.get_manila_timestamp()
        self.session_timestamp = f"{session_ts['date']} {session_ts['time']}"
        self.session_start_time = datetime.now().timestamp()
        
        # Add sheet items first (only those without winners)
        for idx, item in enumerate(sheet_items):
            item_name = item.get('item', '').strip()
            if not item_name:
                continue
            
            winner = item.get('winner', '').strip()
            if winner:
                continue  # Skip items with winners
            
            qty = item.get('quantity', 1)
            
            if qty > 1:
                # Batch items - create separate entries
                for q in range(qty):
                    self.item_queue.append(AuctionItem(
                        item=item_name,
                        start_price=item.get('startPrice', 0),
                        duration=item.get('duration', 30),
                        quantity=1,
                        source='GoogleSheet',
                        sheet_index=idx,
                        batch_number=q + 1,
                        batch_total=qty,
                        auction_start_time=self.session_timestamp
                    ))
            else:
                self.item_queue.append(AuctionItem(
                    item=item_name,
                    start_price=item.get('startPrice', 0),
                    duration=item.get('duration', 30),
                    quantity=1,
                    source='GoogleSheet',
                    sheet_index=idx,
                    auction_start_time=self.session_timestamp
                ))
        
        # Add manual queue items
        for queue_item in queue_items:
            qty = queue_item.quantity
            
            if qty > 1:
                for q in range(qty):
                    self.item_queue.append(AuctionItem(
                        item=queue_item.item,
                        start_price=queue_item.start_price,
                        duration=queue_item.duration,
                        quantity=1,
                        source='QueueList',
                        batch_number=q + 1,
                        batch_total=qty,
                        auction_start_time=self.session_timestamp
                    ))
            else:
                self.item_queue.append(AuctionItem(
                    item=queue_item.item,
                    start_price=queue_item.start_price,
                    duration=queue_item.duration,
                    quantity=1,
                    source='QueueList',
                    auction_start_time=self.session_timestamp
                ))
        
        if len(self.item_queue) == 0:
            return {'ok': False, 'msg': 'No items to auction'}
        
        self.active = True
        self.current_item_index = 0
        
        # Announce start
        sheet_count = sum(1 for i in self.item_queue if i.source == 'GoogleSheet')
        queue_count = sum(1 for i in self.item_queue if i.source == 'QueueList')
        
        embed = discord.Embed(
            title="🔥 Auctioneering Session Started!",
            description=f"**{len(self.item_queue)} item(s)** queued",
            color=0xFFD700
        )
        embed.add_field(name="📋 From Google Sheet", value=str(sheet_count), inline=True)
        embed.add_field(name="📋 From Queue", value=str(queue_count), inline=True)
        embed.add_field(name="🕐 Session Time", value=self.session_timestamp, inline=True)
        embed.set_footer(text="Starting first item in 20 seconds...")
        embed.timestamp = datetime.now(timezone.utc)
        
        await channel.send(embed=embed)
        
        # Start first item after delay
        await asyncio.sleep(self.ITEM_WAIT)
        await self.auction_next_item(channel)
        
        return {'ok': True}
    
    async def auction_next_item(self, channel: discord.TextChannel):
        """Start next item in queue"""
        if not self.active or self.current_item_index >= len(self.item_queue):
            await self.finalize_session(channel)
            return
        
        item = self.item_queue[self.current_item_index]
        
        # Create current item
        self.current_item = CurrentItem(
            item=item.item,
            start_price=item.start_price,
            duration=item.duration,
            quantity=item.quantity,
            source=item.source,
            cur_bid=item.start_price,
            status='active',
            auction_start_time=item.auction_start_time,
            sheet_index=item.sheet_index
        )
        
        # Format display name
        display_name = item.item
        if item.batch_number and item.batch_total:
            display_name += f" [{item.batch_number}/{item.batch_total}]"
        
        # Create embed
        embed = discord.Embed(
            title="🔥 BIDDING NOW!",
            description=f"**{display_name}**\n\nType `!bid <amount>` or `!b <amount>` to bid",
            color=0x00FF00
        )
        embed.add_field(name="💰 Starting Bid", value=f"{item.start_price}pts", inline=True)
        embed.add_field(name="⏱️ Duration", value=f"{item.duration}m", inline=True)
        embed.add_field(
            name="📋 Item #",
            value=f"{self.current_item_index + 1}/{len(self.item_queue)}",
            inline=True
        )
        embed.add_field(
            name="ℹ️ Source",
            value="📊 Google Sheet" if item.source == 'GoogleSheet' else "📝 Manual Queue",
            inline=True
        )
        embed.set_footer(text="🕐 10s confirm • 💰 Fastest wins")
        embed.timestamp = datetime.now(timezone.utc)
        
        await channel.send(embed=embed)
        
        # Wait for preview
        await asyncio.sleep(self.PREVIEW_TIME)
        
        # Set end time and schedule timers
        self.current_item.end_time = datetime.now().timestamp() + (item.duration * 60)
        self.schedule_item_timers(channel)
    
    def schedule_item_timers(self, channel: discord.TextChannel):
        """Schedule going once, twice, final timers"""
        if not self.current_item:
            return
        
        time_left = self.current_item.end_time - datetime.now().timestamp()
        
        if time_left > 60 and not self.current_item.going_once:
            asyncio.create_task(self.item_going_once(channel, time_left - 60))
        if time_left > 30 and not self.current_item.going_twice:
            asyncio.create_task(self.item_going_twice(channel, time_left - 30))
        if time_left > 10:
            asyncio.create_task(self.item_final_call(channel, time_left - 10))
        
        asyncio.create_task(self.item_end(channel, time_left))
    
    async def item_going_once(self, channel: discord.TextChannel, delay: float):
        """Going once announcement"""
        await asyncio.sleep(delay)
        if not self.active or not self.current_item or self.current_item.status != 'active':
            return
        
        self.current_item.going_once = True
        
        embed = discord.Embed(
            title="⚠️ GOING ONCE!",
            description="1 minute left",
            color=0xFFA500
        )
        current = f"{self.current_item.cur_winner} - {self.current_item.cur_bid}pts" if self.current_item.cur_winner else f"{self.current_item.start_price}pts (no bids)"
        embed.add_field(name="💰 Current", value=current)
        
        await channel.send(embed=embed)
    
    async def item_going_twice(self, channel: discord.TextChannel, delay: float):
        """Going twice announcement"""
        await asyncio.sleep(delay)
        if not self.active or not self.current_item or self.current_item.status != 'active':
            return
        
        self.current_item.going_twice = True
        
        embed = discord.Embed(
            title="⚠️ GOING TWICE!",
            description="30 seconds left",
            color=0xFFA500
        )
        current = f"{self.current_item.cur_winner} - {self.current_item.cur_bid}pts" if self.current_item.cur_winner else f"{self.current_item.start_price}pts (no bids)"
        embed.add_field(name="💰 Current", value=current)
        
        await channel.send(embed=embed)
    
    async def item_final_call(self, channel: discord.TextChannel, delay: float):
        """Final call announcement"""
        await asyncio.sleep(delay)
        if not self.active or not self.current_item or self.current_item.status != 'active':
            return
        
        embed = discord.Embed(
            title="⚠️ FINAL CALL!",
            description="10 seconds left",
            color=0xFF0000
        )
        current = f"{self.current_item.cur_winner} - {self.current_item.cur_bid}pts" if self.current_item.cur_winner else f"{self.current_item.start_price}pts (no bids)"
        embed.add_field(name="💰 Current", value=current)
        
        await channel.send(embed=embed)
    
    async def item_end(self, channel: discord.TextChannel, delay: float):
        """End current item"""
        await asyncio.sleep(delay)
        if not self.active or not self.current_item:
            return
        
        self.current_item.status = 'ended'
        
        timestamp = self.get_manila_timestamp()
        end_time_str = f"{timestamp['date']} {timestamp['time']}"
        self.current_item.auction_end_time = end_time_str
        
        if self.current_item.cur_winner:
            # Item has winner
            embed = discord.Embed(
                title="🔨 SOLD!",
                description=f"**{self.current_item.item}** sold!",
                color=0xFFD700
            )
            embed.add_field(name="🔥 Winner", value=f"<@{self.current_item.cur_winner_id}>", inline=True)
            embed.add_field(name="💰 Price", value=f"{self.current_item.cur_bid}pts", inline=True)
            embed.add_field(
                name="ℹ️ Source",
                value="📊 Google Sheet" if self.current_item.source == 'GoogleSheet' else "📝 Manual Queue",
                inline=True
            )
            embed.set_footer(text=timestamp['full'])
            embed.timestamp = datetime.now(timezone.utc)
            
            await channel.send(embed=embed)
            
            # Log to Google Sheet
            log_payload = {
                'action': 'logAuctionResult',
                'itemIndex': self.current_item.sheet_index + 2 if self.current_item.sheet_index is not None else -1,
                'winner': self.current_item.cur_winner,
                'winningBid': self.current_item.cur_bid,
                'totalBids': len(self.current_item.bids),
                'bidCount': sum(1 for b in self.current_item.bids if b['username'] == self.current_item.cur_winner),
                'itemSource': self.current_item.source,
                'itemName': self.current_item.item,
                'timestamp': timestamp['full'],
                'auctionStartTime': self.current_item.auction_start_time,
                'auctionEndTime': end_time_str
            }
            
            await self.post_to_sheet(log_payload)
            
            # Add to session items
            self.session_items.append({
                'item': self.current_item.item,
                'winner': self.current_item.cur_winner,
                'winnerId': self.current_item.cur_winner_id,
                'amount': self.current_item.cur_bid,
                'source': self.current_item.source,
                'timestamp': timestamp['full'],
                'auctionStartTime': self.current_item.auction_start_time,
                'auctionEndTime': end_time_str
            })
            
            # Track manual items
            if self.current_item.source == 'QueueList':
                self.manual_items_auctioned.append({
                    'item': self.current_item.item,
                    'startPrice': self.current_item.start_price,
                    'duration': self.current_item.duration,
                    'winner': self.current_item.cur_winner,
                    'winningBid': self.current_item.cur_bid,
                    'auctionStartTime': self.current_item.auction_start_time,
                    'auctionEndTime': end_time_str
                })
        else:
            # No winner
            embed = discord.Embed(
                title="❌ NO BIDS",
                description=f"**{self.current_item.item}** - no bids\n*Will be re-auctioned next session*",
                color=0x4A90E2
            )
            embed.add_field(
                name="ℹ️ Source",
                value="📊 Google Sheet (stays in queue)" if self.current_item.source == 'GoogleSheet' else "📝 Manual Queue (added to Google Sheet)",
                inline=False
            )
            
            await channel.send(embed=embed)
            
            # Track manual items with no winner
            if self.current_item.source == 'QueueList':
                self.manual_items_auctioned.append({
                    'item': self.current_item.item,
                    'startPrice': self.current_item.start_price,
                    'duration': self.current_item.duration,
                    'winner': '',
                    'winningBid': '',
                    'auctionStartTime': self.current_item.auction_start_time,
                    'auctionEndTime': end_time_str
                })
        
        # Move to next item
        self.current_item_index += 1
        
        if self.current_item_index < len(self.item_queue):
            next_item = self.item_queue[self.current_item_index]
            await channel.send(f"🕐 Next in 20s...\n📋 **{next_item.item}** - {next_item.start_price}pts")
            await asyncio.sleep(self.ITEM_WAIT)
            await self.auction_next_item(channel)
        else:
            await self.finalize_session(channel)
    
    async def finalize_session(self, channel: discord.TextChannel):
        """Finalize auctioneering session"""
        if not self.active:
            return
        
        self.active = False
        
        # Build summary
        summary_lines = []
        for i, item in enumerate(self.session_items):
            source_emoji = "📊" if item['source'] == 'GoogleSheet' else "📝"
            summary_lines.append(
                f"{i+1}. **{item['item']}** ({source_emoji}): {item['winner']} - {item['amount']}pts"
            )
        
        summary = '\n'.join(summary_lines) if summary_lines else "No sales"
        
        embed = discord.Embed(
            title="✅ Auctioneering Session Complete!",
            description=f"**{len(self.session_items)}** item(s) auctioned",
            color=0x00FF00
        )
        embed.add_field(name="📋 Summary", value=summary, inline=False)
        embed.add_field(
            name="ℹ️ Session Info",
            value=(
                f"📊 Google Sheet Items Auctioned: {sum(1 for i in self.item_queue if i.source == 'GoogleSheet')}\n"
                f"📝 Manual Items Auctioned: {len(self.manual_items_auctioned)}"
            ),
            inline=False
        )
        embed.set_footer(text="Processing results and submitting to sheets...")
        embed.timestamp = datetime.now(timezone.utc)
        
        await channel.send(embed=embed)
        
        # Build combined results
        combined_results = await self.build_combined_results()
        
        # Submit to sheets
        submit_payload = {
            'action': 'submitBiddingResults',
            'results': combined_results,
            'manualItems': self.manual_items_auctioned
        }
        
        await self.post_to_sheet(submit_payload)
        
        # Send detailed summary to admin logs
        guild = channel.guild
        admin_logs = guild.get_channel(int(self.config.admin_logs_channel_id))
        
        if admin_logs:
            sheet_with_winners = sum(1 for s in self.session_items if s['source'] == 'GoogleSheet')
            manual_with_winners = sum(1 for s in self.session_items if s['source'] == 'QueueList')
            total_revenue = sum(s['amount'] for s in self.session_items)
            
            admin_embed = discord.Embed(
                title=f"✅ Session Summary - {self.session_timestamp}",
                description="Auctioneering session completed successfully",
                color=0x00FF00
            )
            admin_embed.add_field(
                name="📊 Google Sheet Items",
                value=f"**Auctioned:** {sum(1 for i in self.item_queue if i.source == 'GoogleSheet')}\n**With Winners:** {sheet_with_winners}\n**No Bids:** {sum(1 for i in self.item_queue if i.source == 'GoogleSheet') - sheet_with_winners}",
                inline=True
            )
            admin_embed.add_field(
                name="📝 Manual Items",
                value=f"**Auctioned:** {len(self.manual_items_auctioned)}\n**With Winners:** {manual_with_winners}\n**No Bids:** {len(self.manual_items_auctioned) - manual_with_winners}",
                inline=True
            )
            admin_embed.add_field(
                name="💰 Revenue",
                value=f"**Total:** {total_revenue}pts",
                inline=True
            )
            admin_embed.add_field(
                name="📋 Results",
                value=summary or "No sales recorded",
                inline=False
            )
            admin_embed.set_footer(text="Session completed by !startauction")
            admin_embed.timestamp = datetime.now(timezone.utc)
            
            await admin_logs.send(embed=admin_embed)
        
        # Clear state
        self.session_items.clear()
        self.item_queue.clear()
        self.manual_items_auctioned.clear()
    
    async def build_combined_results(self) -> List[Dict]:
        """Build combined results for all members"""
        # Fetch fresh points
        resp = await self.post_to_sheet({'action': 'getBiddingPoints'})
        
        all_points = {}
        if resp['ok']:
            try:
                data = json.loads(resp['text'])
                all_points = data.get('points', {})
            except:
                pass
        
        all_members = list(all_points.keys())
        
        # Combine winners
        winners = {}
        for item in self.session_items:
            winner_lower = item['winner'].lower().strip()
            winners[winner_lower] = winners.get(winner_lower, 0) + item['amount']
        
        # Build results for all members
        results = []
        for member in all_members:
            member_lower = member.lower().strip()
            results.append({
                'member': member,
                'totalSpent': winners.get(member_lower, 0)
            })
        
        return results
    
    def pause_session(self) -> bool:
        """Pause auctioneering session"""
        if not self.active or self.paused:
            return False
        
        self.paused = True
        self.paused_time = datetime.now().timestamp()
        print("⏸️ Session paused")
        return True
    
    def resume_session(self) -> bool:
        """Resume auctioneering session"""
        if not self.active or not self.paused or not self.current_item:
            return False
        
        self.paused = False
        
        # Add paused duration to end time
        if self.paused_time:
            paused_duration = datetime.now().timestamp() - self.paused_time
            self.current_item.end_time += paused_duration
        
        print("▶️ Session resumed")
        return True
    
    def stop_current_item(self) -> bool:
        """Stop current item immediately"""
        if not self.active or not self.current_item:
            return False
        
        # This will be handled by calling item_end directly
        return True
    
    def extend_current_item(self, minutes: int) -> bool:
        """Extend current item by minutes"""
        if not self.active or not self.current_item:
            return False
        
        self.current_item.end_time += minutes * 60
        print(f"⏱️ Extended by {minutes}m")
        return True