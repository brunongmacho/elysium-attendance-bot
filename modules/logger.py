# modules/logger.py
import logging
from datetime import datetime

class CleanFormatter(logging.Formatter):
    def format(self, record):
        ts = datetime.now().strftime("[%H:%M:%S]")
        level_emoji = {
            "INFO": "ℹ️",
            "WARNING": "⚠️",
            "ERROR": "❌",
            "CRITICAL": "💥",
        }.get(record.levelname, "🔸")
        
        msg = record.getMessage()
        # Check for all wrapper emojis to use clean timestamp format
        if msg.startswith(("✅ ", "⚠️ ", "❌ ", "📤 ", "📄 ", "🔄 ", "🛑 ", "🔸 ", "🔍 ", "🌐 ")):
            return f"{ts} {msg}"
            
        return f"{ts} {level_emoji} {record.getMessage()}"

log = logging.getLogger("attendance-bot")
log.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setFormatter(CleanFormatter())
log.addHandler(console_handler)

# Silence noisy libs
logging.getLogger("aiohttp.access").setLevel(logging.ERROR)
logging.getLogger("discord.client").setLevel(logging.WARNING)
logging.getLogger("discord.gateway").setLevel(logging.WARNING)
logging.getLogger("discord.http").setLevel(logging.ERROR)
logging.getLogger("discord.state").setLevel(logging.WARNING)

# Emoji-style helper shortcuts
def info(msg): log.info(f"✅ {msg}") # Success / General action
def warn(msg): log.warning(f"⚠️ {msg}") # Non-critical issue
def error(msg): log.error(f"❌ {msg}") # Critical error
def sheet(msg): log.info(f"📤 {msg}") # Posting to sheet
def done(msg): log.info(f"📄 {msg}") # Sheet response
def recovery(msg): log.info(f"🔄 {msg}") # State recovery
def system(msg): log.info(f"🔸 {msg}") # Startup/Shutdown
def debug(msg): log.info(f"🔍 {msg}") # Debug output
def web(msg): log.info(f"🌐 {msg}") # Web/HTTP actions