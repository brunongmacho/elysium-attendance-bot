# ---------- BASE IMAGE ----------
FROM python:3.12-slim

# ---------- ENVIRONMENT ----------
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Manila

# ---------- WORKDIR ----------
WORKDIR /app

# ---------- DEPENDENCIES ----------
# Install system dependencies (for psutil, aiohttp, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirement files first for caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# ---------- COPY BOT SOURCE ----------
COPY . .

# ---------- PORTS ----------
# (For Koyeb health checks)
EXPOSE 8000

# ---------- STARTUP ----------
# Run your Python bot (auto-start)
CMD ["python", "bot.py"]
