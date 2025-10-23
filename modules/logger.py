# modules/logger.py
import logging
from datetime import datetime

# Clean console formatter (like JS console.log style)
class CleanFormatter(logging.Formatter):
    def format(self, record):
        ts = datetime.now().strftime("[%H:%M:%S]")
        level_emoji = {
            "INFO": "ℹ️",
            "WARNING": "⚠️",
            "ERROR": "❌",
            "CRITICAL": "💥",
        }.get(record.levelname, "🔸")
        return f"{ts} {level_emoji} {record.getMessage()}"

# Create main logger
log = logging.getLogger("attendance-bot")
log.setLevel(logging.INFO)

# Console output handler
console_handler = logging.StreamHandler()
console_handler.setFormatter(CleanFormatter())
log.addHandler(console_handler)

# Silence noisy libs
logging.getLogger("aiohttp.access").setLevel(logging.ERROR)
logging.getLogger("discord.client").setLevel(logging.WARNING)
logging.getLogger("discord.gateway").setLevel(logging.WARNING)
logging.getLogger("discord.http").setLevel(logging.ERROR)

# Emoji-style helper shortcuts
def info(msg): log.info(f"✅ {msg}")
def warn(msg): log.warning(f"⚠️ {msg}")
def error(msg): log.error(f"❌ {msg}")
def sheet(msg): log.info(f"📤 {msg}")
def done(msg): log.info(f"📄 {msg}")
