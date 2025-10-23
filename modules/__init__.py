# modules/__init__.py
"""
ELYSIUM Attendance Bot Modules
------------------------------
This package contains all helper modules used by bot.py:
- logger.py          → clean JS-style logging output
- sheet_api.py       → Google Sheets webhook posting
- boss_utils.py      → boss matching & points lookup
- thread_manager.py  → thread creation and attendance handling
- state_manager.py   → restore active spawns after restart
- commands.py        → !help, !status, !debugthread, etc.
- health_server.py   → uptime / health endpoint for Koyeb
"""

from . import logger, sheet_api, boss_utils, thread_manager, state_manager, commands, health_server

__all__ = [
    "logger",
    "sheet_api",
    "boss_utils",
    "thread_manager",
    "state_manager",
    "commands",
    "health_server",
]
