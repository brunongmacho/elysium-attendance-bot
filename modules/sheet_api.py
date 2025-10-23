# modules/sheet_api.py
import aiohttp
import asyncio
import json
from modules.logger import sheet, done, error

async def post_to_google_sheet(webhook_url: str, payload: dict, max_retries: int = 3):
    """Post attendance data to Google Apps Script webhook."""
    for attempt in range(1, max_retries + 1):
        try:
            sheet(f"Posting to sheet webhook (domain): {webhook_url.split('/')[2]}")
            async with aiohttp.ClientSession() as session:
                async with session.post(webhook_url, json=payload) as resp:
                    text = await resp.text()
                    done(f"Sheet response status: {resp.status}")
                    done(f"Sheet response body: {text}")
                    if resp.status == 200:
                        data = json.loads(text)
                        if data.get("status") == "success":
                            return True
                    error(f"Unexpected response: {text}")
        except Exception as e:
            error(f"Attempt {attempt} failed: {e}")
        await asyncio.sleep(2 * attempt)
    error("All attempts to contact Google Sheet failed.")
    return False
