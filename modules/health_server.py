# modules/health_server.py
import os
from aiohttp import web
from modules.logger import web as web_log
from modules.state_manager import aiohttp_sess # Use imported session

PORT = int(os.getenv("PORT", "8000"))

async def handle_health(request):
    return web.json_response({"status": "ok", "service": "elysium-attendance-bot"})

async def start_health_server():
    """Run a minimal aiohttp health server on the required PORT (Koyeb)."""
    app = web.Application()
    app.router.add_get("/health", handle_health)
    
    # We use aiohttp's built-in TCP site to run concurrently with discord.py
    runner = web.AppRunner(app, shutdown_timeout=15.0, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    web_log(f"Health server started on port {PORT}")