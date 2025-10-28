"""
Enhanced Help System for ELYSIUM Bot v7.0 (Python)
Updated with all current features and attendance-based auctions
"""

import discord
from discord import Embed

# Module-level variables
config = None
is_admin_func = None
BOT_VERSION = None

def initialize(cfg, admin_func, version):
    global config, is_admin_func, BOT_VERSION
    config = cfg
    is_admin_func = admin_func
    BOT_VERSION = version

COMMAND_HELP = {
    # === ATTENDANCE COMMANDS ===
    "status": {
        "usage": "!status",
        "description": "View bot health, active spawns, and system statistics",
        "category": "Attendance",
        "admin_only": True,
        "example": "!status",
    },
    "addthread": {
        "usage": "!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)",
        "description": "Manually create a spawn thread with custom timestamp",
        "category": "Attendance",
        "admin_only": True,
        "example": "!addthread Clemantis will spawn in 5 minutes! (2025-10-22 14:30)",
    },
    "verify": {
        "usage": "!verify @member",
        "description": "Manually verify a member for the current spawn",
        "category": "Attendance",
        "admin_only": True,
        "example": "!verify @Username",
    },
    "verifyall": {
        "usage": "!verifyall",
        "description": "Auto-verify ALL pending members in current spawn thread",
        "category": "Attendance",
        "admin_only": True,
        "example": "!verifyall",
    },
    "resetpending": {
        "usage": "!resetpending",
        "description": "Clear all pending verifications in current thread",
        "category": "Attendance",
        "admin_only": True,
        "example": "!resetpending",
    },
    "forcesubmit": {
        "usage": "!forcesubmit",
        "description": "Submit attendance to Sheets WITHOUT closing thread",
        "category": "Attendance",
        "admin_only": True,
        "example": "!forcesubmit",
    },
    "forceclose": {
        "usage": "!forceclose",
        "description": "Force close spawn ignoring pending verifications",
        "category": "Attendance",
        "admin_only": True,
        "example": "!forceclose",
    },
    "debugthread": {
        "usage": "!debugthread",
        "description": "Show detailed info about current spawn thread",
        "category": "Attendance",
        "admin_only": True,
        "example": "!debugthread",
    },
    "closeallthread": {
        "usage": "!closeallthread",
        "description": "Mass close ALL open spawn threads at once",
        "category": "Attendance",
        "admin_only": True,
        "example": "!closeallthread",
    },
    "clearstate": {
        "usage": "!clearstate",
        "description": "Reset ALL bot memory and state",
        "category": "Attendance",
        "admin_only": True,
        "example": "!clearstate",
    },
    
    # === AUCTIONEERING COMMANDS ===
    "startauction": {
        "usage": "!startauction",
        "description": "Start auction session (Sheet items + queue, attendance-filtered)",
        "category": "Auctioneering",
        "admin_only": True,
        "example": "!startauction",
        "aliases": ["!start", "!auc-start"],
    },
    "pause": {
        "usage": "!pause",
        "description": "Pause active auctioneering session",
        "category": "Auctioneering",
        "admin_only": True,
        "example": "!pause",
        "aliases": ["!auc-pause"],
    },
    "resume": {
        "usage": "!resume",
        "description": "Resume paused auctioneering session",
        "category": "Auctioneering",
        "admin_only": True,
        "example": "!resume",
        "aliases": ["!auc-resume"],
    },
    "stop": {
        "usage": "!stop",
        "description": "End current item immediately and move to next",
        "category": "Auctioneering",
        "admin_only": True,
        "example": "!stop",
        "aliases": ["!auc-stop"],
    },
    "extend": {
        "usage": "!extend <minutes>",
        "description": "Add time to current auction",
        "category": "Auctioneering",
        "admin_only": True,
        "example": "!extend 5",
        "aliases": ["!ext"],
    },
    
    # === BIDDING COMMANDS (Admin) ===
    "auction": {
        "usage": "!auction <item> <startPrice> <duration> [quantity]",
        "description": "Add item to manual queue (will be auctioned OPEN to all)",
        "category": "Bidding",
        "admin_only": True,
        "example": "!auction Dragon Sword 500 30",
    },
    "queuelist": {
        "usage": "!queuelist",
        "description": "View auction queue preview (shows sessions)",
        "category": "Bidding",
        "admin_only": True,
        "example": "!queuelist",
        "aliases": ["!ql", "!queue"],
    },
    "removeitem": {
        "usage": "!removeitem <itemName>",
        "description": "Remove item from queue",
        "category": "Bidding",
        "admin_only": True,
        "example": "!removeitem Dragon Sword",
        "aliases": ["!rm"],
    },
    "clearqueue": {
        "usage": "!clearqueue",
        "description": "Remove ALL items from queue",
        "category": "Bidding",
        "admin_only": True,
        "example": "!clearqueue",
    },
    
    # === MEMBER COMMANDS ===
    "bid": {
        "usage": "!bid <amount>",
        "description": "Place bid on current auction item (attendance-checked for boss items)",
        "category": "Member",
        "admin_only": False,
        "example": "!bid 750",
        "aliases": ["!b"],
    },
    "bidstatus": {
        "usage": "!bidstatus",
        "description": "View bidding system status",
        "category": "Member",
        "admin_only": False,
        "example": "!bidstatus",
        "aliases": ["!bstatus"],
    },
    "mypoints": {
        "usage": "!mypoints",
        "description": "Check your available bidding points",
        "category": "Member",
        "admin_only": False,
        "example": "!mypoints",
        "aliases": ["!pts", "!mp"],
    },
    "present": {
        "usage": 'present (or "here")',
        "description": "Check in for boss spawn attendance",
        "category": "Member",
        "admin_only": False,
        "example": "present",
    },
}

CATEGORIES = {
    "Attendance": "📋 Attendance System",
    "Auctioneering": "🔥 Auctioneering System",
    "Bidding": "💰 Bidding System",
    "Member": "👤 Member Commands",
}

async def handle_help(message, args, member):
    """Handle help command"""
    if not config or not is_admin_func:
        print("❌ Help system not initialized!")
        await message.reply("❌ Help system error. Contact admin.")
        return
    
    is_admin = is_admin_func(member)
    
    # Specific command help
    if args:
        cmd_name = args[0].lower().replace("!", "")
        cmd_info = COMMAND_HELP.get(cmd_name)
        
        if not cmd_info:
            await message.reply(
                f"❌ Unknown command: `{cmd_name}`\n\nUse `!help` to see all commands."
            )
            return
        
        if cmd_info["admin_only"] and not is_admin:
            await message.reply(
                f"🔒 `!{cmd_name}` is an admin-only command.\n\nUse `!help` to see member commands."
            )
            return
        
        embed = discord.Embed(
            title=f"📖 Command: !{cmd_name}",
            description=cmd_info["description"],
            color=0xFF6600 if cmd_info["admin_only"] else 0x00FF00
        )
        embed.add_field(name="📝 Usage", value=f"`{cmd_info['usage']}`", inline=False)
        embed.add_field(name="💡 Example", value=f"`{cmd_info['example']}`", inline=False)
        embed.add_field(name="🎯 Category", value=CATEGORIES[cmd_info["category"]], inline=True)
        embed.add_field(
            name="🔓 Access",
            value="👑 Admin Only" if cmd_info["admin_only"] else "👥 All Members",
            inline=True
        )
        
        if "aliases" in cmd_info:
            embed.add_field(name="🔀 Aliases", value=", ".join(cmd_info["aliases"]), inline=False)
        
        embed.set_footer(text="Use !help to see all commands")
        embed.timestamp = discord.utils.utcnow()
        
        await message.reply(embed=embed)
        return
    
    # General help
    if is_admin:
        attendance_cmds = "\n".join([
            f"`!{k}` - {v['description']}"
            for k, v in COMMAND_HELP.items()
            if v["category"] == "Attendance" and v["admin_only"]
        ])
        
        auctioneering_cmds = "\n".join([
            f"`!{k}` - {v['description']}"
            for k, v in COMMAND_HELP.items()
            if v["category"] == "Auctioneering" and v["admin_only"]
        ])
        
        bidding_cmds = "\n".join([
            f"`!{k}` - {v['description']}"
            for k, v in COMMAND_HELP.items()
            if v["category"] == "Bidding" and v["admin_only"]
        ])
        
        member_cmds = "\n".join([
            f"`!{k}` - {v['description']}"
            for k, v in COMMAND_HELP.items()
            if not v["admin_only"]
        ])
        
        embed = discord.Embed(
            title="🛡️ ELYSIUM Bot - Admin Commands",
            description=(
                "**New in v7.0:**\n"
                "✨ Attendance-based auction filtering\n"
                "✨ Session-based auctions (grouped by boss)\n"
                "✨ Manual items = OPEN (no attendance required)\n"
                "✨ Sheet items = ATTENDANCE REQUIRED\n"
                "✨ Automatic attendance loading per boss\n"
                "✨ State persistence to Google Sheets\n\n"
                "**Key Feature:** Only attendees can bid on boss-specific items!"
            ),
            color=0x4A90E2
        )
        embed.add_field(name="📋 Attendance Management", value=attendance_cmds or "None", inline=False)
        embed.add_field(name="🔥 Auctioneering (Session-Based)", value=auctioneering_cmds or "None", inline=False)
        embed.add_field(name="💰 Bidding Management", value=bidding_cmds or "None", inline=False)
        embed.add_field(name="👤 Member Commands", value=member_cmds or "None", inline=False)
        embed.set_footer(text=f"Version {BOT_VERSION} • {len(COMMAND_HELP)} commands available")
        embed.timestamp = discord.utils.utcnow()
        
        await message.reply(embed=embed)
    else:
        member_cmds = "\n\n".join([
            f"**!{k}** - {v['description']}\n*Example:* `{v['example']}`"
            for k, v in COMMAND_HELP.items()
            if not v["admin_only"]
        ])
        
        embed = discord.Embed(
            title="📚 ELYSIUM Bot - Member Guide",
            description=(
                "**Available commands for all members**\n\n"
                "💡 Use `!help <command>` for detailed info\n\n"
                "**Important:** Boss-specific auction items require attendance!\n"
                "Only members who attended that boss can bid on its items.\n"
                "Manual queue items are OPEN to everyone."
            ),
            color=0xFFD700
        )
        embed.add_field(name="👥 Your Commands", value=member_cmds or "None", inline=False)
        embed.add_field(
            name="📋 Attendance Check-In",
            value=(
                "1. Type `present` or `here` in spawn threads\n"
                "2. Attach screenshot (shows boss + timestamp)\n"
                "3. Wait for admin ✅ verification\n"
                "4. Points auto-added + auction eligibility granted"
            ),
            inline=False
        )
        embed.add_field(
            name="💰 Bidding Process",
            value=(
                "1. Wait for auction thread to open\n"
                "2. Type `!bid <amount>` or `!b <amount>`\n"
                "3. React ✅ to confirm within 10 seconds\n"
                "4. **NOTE:** If item is from a boss spawn, only attendees can bid!\n"
                "5. Winner announced at end"
            ),
            inline=False
        )
        embed.add_field(
            name="⚠️ Attendance-Based Bidding",
            value=(
                "• **Boss Items:** Only attendees can bid\n"
                "• **Manual Items:** Open to everyone\n"
                "• Check auction message for restrictions\n"
                "• Attend boss spawns to unlock more bidding!"
            ),
            inline=False
        )
        embed.set_footer(text="Need help? Ask an admin!")
        embed.timestamp = discord.utils.utcnow()
        
        await message.reply(embed=embed)