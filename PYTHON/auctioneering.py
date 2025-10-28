"""
ELYSIUM Bot - Auctioneering System v2.1 - PYTHON PORT
Session-based auction with attendance filtering
"""
import discord
import asyncio
import aiohttp
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, List
from dataclasses import dataclass, field

@dataclass
class AuctionSession:
    boss_key: str
    boss_name: str
    items: List[Dict]
    attendees: List[str]

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
    batch_number: Optional[int] = None
    batch_total: Optional[int] = None
    current_session: Optional[AuctionSession] = None

class AuctioneeringSystem:
    def __init__(self, bot, config, bidding_system):
        self.bot = bot
        self.config = config
        self.bidding = bidding_system
        
        # State
        self.active = False
        self.sessions: List[AuctionSession] = []
        self.current_session_index = 0
        self.current_item_index = 0
        self.current_item: Optional[CurrentItem] = None
        self.session_items: List[Dict] = []
        self.manual_items_auctioned: List[Dict] = []
        self.session_timestamp: Optional[str] = None
        self.attendance_cache: Dict[str, List[str]] = {}
        self.current_session_boss: Optional[str] = None
        
        # Timers
        self.timers: Dict[str, asyncio.Task] = {}
        
        # Constants
        self.ITEM_WAIT = 20.0
        self.PREVIEW_TIME = 20.0
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
    
    def can_user_bid(self, username: str) -> bool:
        """Check if user can bid on current item based on attendance"""
        if not self.current_item or not self.current_item.current_session:
            return True  # Open session
        
        if not self.current_item.current_session.boss_key:
            return True  # Open session
        
        attendees = self.current_item.current_session.attendees or []
        return any(m.lower() == username.lower() for m in attendees)
    
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
        
        # Clear state
        self.sessions.clear()
        self.session_items.clear()
        self.manual_items_auctioned.clear()
        self.attendance_cache.clear()
        
        # Get session info
        session_ts = self.get_manila_timestamp()
        self.session_timestamp = f"{session_ts['date']} {session_ts['time']}"
        
        # Calculate week sheet name
        sunday_date = self.get_sunday_of_week()
        week_sheet_name = f"ELYSIUM_WEEK_{sunday_date}"
        
        # Group items by boss
        boss_groups = {}
        manual_items = []
        
        # Manual queue items first (open to all)
        for item in queue_items:
            qty = item.get('quantity', 1)
            for q in range(qty):
                manual_items.append({
                    **item,
                    'quantity': 1,
                    'batchNumber': q + 1 if qty > 1 else None,
                    'batchTotal': qty if qty > 1 else None,
                    'source': 'QueueList',
                    'skipAttendance': True,
                })
        
        if manual_items:
            self.sessions.append(AuctionSession(
                boss_key=None,
                boss_name="OPEN",
                items=manual_items,
                attendees=[]
            ))
        
        # Group sheet items by boss
        for idx, item in enumerate(sheet_items):
            boss_data = (item.get('boss', '') or '').strip()
            if not boss_data:
                print(f"⚠️ Item {item.get('item')} has no boss data, skipping")
                continue
            
            # Parse boss: "EGO 10/27/25 17:57"
            import re
            match = re.match(r'^(.+?)\s+(\d{1,2})/(\d{1,2})/(\d{2})\s+(\d{1,2}):(\d{2})$', boss_data)
            if not match:
                print(f"⚠️ Invalid boss format: {boss_data}")
                continue
            
            boss = match.group(1).strip().upper()
            month = match.group(2).zfill(2)
            day = match.group(3).zfill(2)
            year = match.group(4)
            hour = match.group(5).zfill(2)
            minute = match.group(6).zfill(2)
            
            boss_key = f"{boss} {month}/{day}/{year} {hour}:{minute}"
            
            if boss_key not in boss_groups:
                boss_groups[boss_key] = []
            
            qty = int(item.get('quantity', 1))
            for q in range(qty):
                boss_groups[boss_key].append({
                    **item,
                    'quantity': 1,
                    'batchNumber': q + 1 if qty > 1 else None,
                    'batchTotal': qty if qty > 1 else None,
                    'source': 'GoogleSheet',
                    'sheetIndex': idx,
                    'bossName': boss,
                    'bossKey': boss_key,
                    'skipAttendance': False,
                })
        
        # Convert boss groups to sessions
        for boss_key, items in boss_groups.items():
            self.sessions.append(AuctionSession(
                boss_key=boss_key,
                boss_name=items[0]['bossName'],
                items=items,
                attendees=[]
            ))
        
        if not self.sessions:
            return {'ok': False, 'msg': 'No items to auction'}
        
        # Load attendance for each boss session
        for session in self.sessions:
            if not session.boss_key:
                continue  # Skip OPEN session
            
            payload = {
                'action': 'getAttendanceForBoss',
                'weekSheet': week_sheet_name,
                'bossKey': session.boss_key,
            }
            
            resp = await self.post_to_sheet(payload)
            if not resp['ok']:
                await channel.send(
                    f"❌ Failed to load attendance for {session.boss_key}\n"
                    f"Sheet: {week_sheet_name}\n"
                    f"Error: HTTP {resp['status']}"
                )
                return {'ok': False, 'msg': f'Failed to load attendance for {session.boss_key}'}
            
            data = json.loads(resp['text'])
            session.attendees = data.get('attendees', [])
            self.attendance_cache[session.boss_key] = session.attendees
        
        self.active = True
        self.current_session_index = 0
        self.current_item_index = 0
        
        # Show preview
        preview = []
        for i, s in enumerate(self.sessions):
            session_type = s.boss_name if s.boss_key else "OPEN (No Boss)"
            attendee_info = f" - {len(s.attendees)} attendees" if s.boss_key else " - Open to all"
            preview.append(f"{i + 1}. **{session_type}**: {len(s.items)} item(s){attendee_info}")
        
        embed = discord.Embed(
            title="🔥 Auctioneering Started!",
            description=f"**{len(self.sessions)} session(s)** queued\n\n" + "\n".join(preview),
            color=0xFFD700
        )
        embed.set_footer(text="Starting first session in 20s...")
        embed.timestamp = datetime.now(timezone.utc)
        
        await channel.send(embed=embed)
        await asyncio.sleep(20)
        await self.auction_next_item(channel)
        
        return {'ok': True}
    
    def get_sunday_of_week(self) -> str:
        """Get Sunday of current week in YYYYMMDD format"""
        manila_tz = timezone(timedelta(hours=8))
        now = datetime.now(manila_tz)
        sunday = now - timedelta(days=now.weekday() + 1 if now.weekday() != 6 else 0)
        return sunday.strftime("%Y%m%d")
    
    async def auction_next_item(self, channel: discord.TextChannel):
        """Start next item in queue"""
        current_session = self.sessions[self.current_session_index] if self.current_session_index < len(self.sessions) else None
        
        if not current_session or self.current_item_index >= len(current_session.items):
            # Move to next session
            self.current_session_index += 1
            self.current_item_index = 0
            
            if self.current_session_index >= len(self.sessions):
                await self.finalize_session(channel)
                return
            
            # Clear attendance cache for previous session
            if self.current_session_index > 0:
                prev_session = self.sessions[self.current_session_index - 1]
                if prev_session.boss_key:
                    self.attendance_cache.pop(prev_session.boss_key, None)
                    print(f"🧹 Cleared attendance cache for {prev_session.boss_key}")
            
            self.current_session_boss = self.sessions[self.current_session_index].boss_key
            
            await asyncio.sleep(10)
            await self.auction_next_item(channel)
            return
        
        item = current_session.items[self.current_item_index]
        self.current_session_boss = current_session.boss_key
        
        self.current_item = CurrentItem(
            item=item['item'],
            start_price=item['startPrice'],
            duration=item['duration'],
            quantity=item['quantity'],
            source=item['source'],
            cur_bid=item['startPrice'],
            status='active',
            auction_start_time=self.session_timestamp,
            sheet_index=item.get('sheetIndex'),
            batch_number=item.get('batchNumber'),
            batch_total=item.get('batchTotal'),
            current_session=current_session,
        )
        
        # Format display name
        display_name = item['item']
        if item.get('batchNumber') and item.get('batchTotal'):
            display_name += f" [{item['batchNumber']}/{item['batchTotal']}]"
        
        embed = discord.Embed(
            title="🔥 BIDDING NOW!",
            description=f"**{display_name}**\n\nType `!bid <amount>` or `!b <amount>` to bid",
            color=0x00FF00
        )
        embed.add_field(name="💰 Starting Bid", value=f"{item['startPrice']}pts", inline=True)
        embed.add_field(name="⏱️ Duration", value=f"{item['duration']}m", inline=True)
        embed.add_field(name="📋 Item #", value=f"{self.current_item_index + 1}/{len(current_session.items)}", inline=True)
        embed.add_field(name="ℹ️ Source", value="📊 Google Sheet" if item['source'] == 'GoogleSheet' else "📝 Manual Queue", inline=True)
        embed.set_footer(text="🕐 10s confirm • 💰 Fastest wins")
        embed.timestamp = datetime.now(timezone.utc)
        
        await channel.send(embed=embed)
        await asyncio.sleep(self.PREVIEW_TIME)
        
        self.current_item.end_time = datetime.now().timestamp() + (item['duration'] * 60)
        self.schedule_item_timers(channel)
    
    def schedule_item_timers(self, channel: discord.TextChannel):
        """Schedule going once, twice, final timers"""
        if not self.current_item:
            return
        
        time_left = self.current_item.end_time - datetime.now().timestamp()
        
        if time_left > 60 and not self.current_item.going_once:
            self.timers['go1'] = asyncio.create_task(self.item_going_once(channel, time_left - 60))
        if time_left > 30 and not self.current_item.going_twice:
            self.timers['go2'] = asyncio.create_task(self.item_going_twice(channel, time_left - 30))
        if time_left > 10:
            self.timers['go3'] = asyncio.create_task(self.item_final_call(channel, time_left - 10))
        
        self.timers['end'] = asyncio.create_task(self.item_end(channel, time_left))
    
    async def item_going_once(self, channel: discord.TextChannel, delay: float):
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
        await asyncio.sleep(delay)
        if not self.active or not self.current_item:
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
            embed.add_field(name="ℹ️ Source", value="📊 Google Sheet" if self.current_item.source == 'GoogleSheet' else "📝 Manual Queue", inline=True)
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
            embed.add_field(name="ℹ️ Source", value="📊 Google Sheet (stays in queue)" if self.current_item.source == 'GoogleSheet' else "📝 Manual Queue (added to Google Sheet)", inline=False)
            
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
        
        current_session = self.sessions[self.current_session_index]
        if self.current_item_index < len(current_session.items):
            next_item = current_session.items[self.current_item_index]
            await channel.send(f"🕐 Next in 20s...\n📋 **{next_item['item']}** - {next_item['startPrice']}pts")
            await asyncio.sleep(self.ITEM_WAIT)
            await self.auction_next_item(channel)
        else:
            await self.auction_next_item(channel)
    
    async def finalize_session(self, channel: discord.TextChannel):
        """Finalize auctioneering session"""
        if not self.active:
            return
        
        self.active = False
        self.clear_all_timers()
        
        summary = []
        for i, item in enumerate(self.session_items):
            source_emoji = "📊" if item['source'] == 'GoogleSheet' else "📝"
            summary.append(f"{i+1}. **{item['item']}** ({source_emoji}): {item['winner']} - {item['amount']}pts")
        
        summary_text = '\n'.join(summary) if summary else "No sales"
        
        embed = discord.Embed(
            title="✅ Auctioneering Session Complete!",
            description=f"**{len(self.session_items)}** item(s) auctioned",
            color=0x00FF00
        )
        embed.add_field(name="📋 Summary", value=summary_text, inline=False)
        embed.add_field(
            name="ℹ️ Session Info",
            value=f"📊 Google Sheet Items: {sum(1 for s in self.session_items if s['source'] == 'GoogleSheet')}\n"
                  f"📝 Manual Items: {len(self.manual_items_auctioned)}",
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
        
        # Clear state
        self.session_items.clear()
        self.sessions.clear()
        self.manual_items_auctioned.clear()
        self.attendance_cache.clear()
        self.current_session_boss = None
        self.bidding.clear_points_cache()
        
        print("✅ All session data cleared")
    
    async def build_combined_results(self) -> List[Dict]:
        """Build combined results for all members"""
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
    
    def clear_all_timers(self):
        """Clear all running timers"""
        for task in self.timers.values():
            if not task.done():
                task.cancel()
        self.timers.clear()
    
    def update_current_item_state(self, updates: dict) -> bool:
        """Update current item state"""
        if not self.current_item:
            return False
        
        for key, value in updates.items():
            setattr(self.current_item, key, value)
        
        return True
    
    def get_auction_state(self) -> dict:
        """Get current auction state"""
        return {
            'active': self.active,
            'currentItem': self.current_item,
            'sessions': self.sessions,
            'currentSessionIndex': self.current_session_index,
            'currentItemIndex': self.current_item_index,
        }