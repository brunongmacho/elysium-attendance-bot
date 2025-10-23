# modules/health_server.py
from aiohttp import web
from modules.logger import info

async def handle_health(request):
    return web.json_response({"status": "ok", "service": "elysium-attendance-bot"})

async def start_health_server():
    """Run a minimal aiohttp health server on port 8000."""
    app = web.Application()
    app.router.add_get("/health", handle_health)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8000)
    await site.start()
    info("Health server started on port 8000")
