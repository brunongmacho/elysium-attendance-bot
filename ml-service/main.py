"""
Elysium Bot ML Service - Optimized for Koyeb 512MB
FastAPI service providing ML predictions with automatic fallback
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import logging

# Import model handlers
from models.price_predictor import PricePredictor
from utils.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Elysium ML Service",
    description="Machine Learning service for guild bot predictions",
    version="1.0.0"
)

# CORS for Node.js bot communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your bot's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instances (loaded once on startup)
price_predictor = None

# ============================================================================
# Startup/Shutdown Events
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Load ML models into memory on startup"""
    global price_predictor

    logger.info("🚀 Starting ML Service...")
    logger.info(f"📊 Memory limit: ~400MB (leaving 112MB for system)")

    try:
        # Initialize price predictor
        price_predictor = PricePredictor()
        logger.info("✅ Price prediction model loaded")

    except Exception as e:
        logger.error(f"❌ Error loading models: {e}")
        # Continue anyway - will use rule-based fallback

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("👋 Shutting down ML Service...")

# ============================================================================
# Health Check Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Elysium ML Service",
        "status": "operational",
        "version": "1.0.0",
        "models": {
            "price_prediction": price_predictor is not None
        }
    }

@app.get("/health")
async def health_check():
    """Health check for Koyeb"""
    return {
        "status": "healthy",
        "models_loaded": price_predictor is not None
    }

# ============================================================================
# Request/Response Models
# ============================================================================

class PricePredictionRequest(BaseModel):
    item_name: str
    features: Dict[str, Any]

class PricePredictionResponse(BaseModel):
    predicted_price: float
    confidence: float
    model_used: str  # 'ml' or 'rule_based'
    confidence_interval: Dict[str, float]
    important_features: Optional[List[Dict[str, Any]]] = None
    message: Optional[str] = None

# ============================================================================
# ML Prediction Endpoints
# ============================================================================

@app.post("/predict/price", response_model=PricePredictionResponse)
async def predict_price(request: PricePredictionRequest):
    """
    Predict auction price for an item using ML

    Features expected:
    - item_avg_price: Historical average
    - item_median_price: Historical median
    - item_price_std: Standard deviation
    - item_auction_count: Number of previous auctions
    - day_of_week: 0-6 (Monday to Sunday)
    - hour_of_day: 0-23
    - active_members_count: Number of active guild members
    - recent_price_trend: Recent price trend (multiplier)
    """

    if not price_predictor:
        raise HTTPException(
            status_code=503,
            detail="Price prediction model not available"
        )

    try:
        # Get ML prediction
        result = price_predictor.predict(
            item_name=request.item_name,
            features=request.features
        )

        logger.info(
            f"Predicted price for '{request.item_name}': "
            f"{result['predicted_price']:.0f} pts (confidence: {result['confidence']:.2f})"
        )

        return PricePredictionResponse(**result)

    except Exception as e:
        logger.error(f"Error in price prediction: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Prediction error: {str(e)}"
        )

@app.get("/models/info")
async def get_models_info():
    """Get information about loaded models"""
    info = {
        "price_predictor": {
            "loaded": price_predictor is not None,
            "type": "XGBoost" if price_predictor else None,
            "status": "operational" if price_predictor else "not_loaded"
        }
    }

    if price_predictor:
        info["price_predictor"].update(price_predictor.get_info())

    return info

# ============================================================================
# Training Endpoints (for future use)
# ============================================================================

@app.post("/train/price")
async def train_price_model(background_tasks=None):
    """
    Trigger price model retraining
    In production, this should:
    1. Fetch latest data from Google Sheets
    2. Train new model
    3. Validate performance
    4. Replace old model if better
    """
    return {
        "status": "not_implemented",
        "message": "Training endpoint coming in Phase 2"
    }

# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    return {
        "error": "Endpoint not found",
        "available_endpoints": [
            "/",
            "/health",
            "/predict/price",
            "/models/info"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=1)
