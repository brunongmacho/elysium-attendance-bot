# ----------------------------
# Discord Attendance Bot - Python v2.8
# ----------------------------

FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy dependency files first
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot files
COPY bot.py .
COPY config.json .
COPY boss_points.json .

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Expose port for Koyeb healthcheck
EXPOSE 8000

# Start the bot
CMD ["python", "bot.py"]
