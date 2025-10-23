# Dockerfile
# Use a minimal Python image as the base
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create the modules directory structure
RUN mkdir -p modules

# Copy all local files into the container
# NOTE: Ensure config.json, boss_points.json, and the modules/ directory are present
COPY . .

# Expose the port (Koyeb requires this for the health check)
# The actual port number will be read from the PORT environment variable by the bot
EXPOSE 8000

# The command to run the bot.py file
# Koyeb will automatically set PORT and monitor the /health endpoint
CMD ["python", "bot.py"]