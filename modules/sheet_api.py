# modules/sheet_api.py
import aiohttp
import asyncio
import json
from datetime import datetime, timezone
from modules.logger import sheet, done, error, warn
from modules.state_manager import aiohttp_sess, last_sheet_call 

async def post_to_google_sheet(webhook_url: str, payload: dict, max_retries: int = 3):
    if not aiohttp_sess or aiohttp_sess.closed:
        error("aiohttp session is not active. Cannot post to sheet.")
        return False
        
    sheet(f"Posting to sheet webhook (action: {payload.get('action', 'N/A')})")
    
    for attempt in range(1, max_retries + 1):
        try:
            async with aiohttp_sess.post(webhook_url, json=payload, timeout=10) as resp:
                text = await resp.text()
                
                if resp.status == 200:
                    try:
                        data = json.loads(text)
                        if data.get("status") == "success":
                            done("Sheet post successful.")
                            global last_sheet_call
                            last_sheet_call = datetime.now(timezone.utc).timestamp()
                            return True
                    except json.JSONDecodeError:
                        done(f"Sheet response: OK (non-JSON body)")
                        return True
                        
                error(f"Sheet post failed (Status: {resp.status}, Body: {text[:100]}...)")
                
        except asyncio.TimeoutError:
            error(f"Attempt {attempt} failed: Request timed out after 10s.")
        except aiohttp.ClientError as e:
            error(f"Attempt {attempt} failed: Client connection error: {e}")
            
        if attempt < max_retries:
            warn(f"Retrying in {2 * attempt}s...")
            await asyncio.sleep(2 * attempt)
            
    error("All attempts to contact Google Sheet failed.")
    return False