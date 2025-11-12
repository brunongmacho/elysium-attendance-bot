"""
Configuration management for ML service
"""

import os
from typing import Optional

# Simple config class (not using pydantic to reduce dependencies)

class Settings:
    """Application settings"""

    def __init__(self):
        # Service settings
        self.SERVICE_NAME = "elysium-ml-service"
        self.VERSION = "1.0.0"
        self.DEBUG = os.getenv("DEBUG", "false").lower() == "true"

        # Google Sheets API (for data fetching)
        self.SHEETS_WEBHOOK_URL = os.getenv("SHEETS_WEBHOOK_URL")

        # Model settings
        self.MODEL_PATH = os.getenv("MODEL_PATH", "/app/saved_models")
        self.ENABLE_MODEL_CACHING = True

        # Memory limits (for 512MB instance)
        self.MAX_MEMORY_MB = 400  # Leave 112MB for system

settings = Settings()
