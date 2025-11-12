# Elysium ML Service

Machine Learning microservice for the Elysium Guild Bot.

## Features

- 🤖 **Price Prediction**: ML-powered auction price predictions
- 📊 **Statistical Fallback**: Automatic fallback if ML unavailable
- 🚀 **Optimized for Koyeb**: Runs in 512MB RAM
- ⚡ **Fast API**: RESTful API with FastAPI
- 🔄 **Health Checks**: Built-in monitoring

## Quick Start

### Local Development

1. **Install dependencies:**
```bash
cd ml-service
pip install -r requirements.txt
```

2. **Create `.env` file:**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Run the service:**
```bash
python main.py
```

Service will be available at: http://localhost:8000

4. **Test it:**
```bash
# Health check
curl http://localhost:8000/health

# Test prediction
curl -X POST http://localhost:8000/predict/price \
  -H "Content-Type: application/json" \
  -d '{
    "item_name": "Dragon Weapon Fragment",
    "features": {
      "item_avg_price": 1500,
      "item_median_price": 1450,
      "item_price_std": 200,
      "item_auction_count": 25,
      "day_of_week": 6,
      "hour_of_day": 12,
      "active_members_count": 45,
      "recent_price_trend": 1.15
    }
  }'
```

### Docker Build

```bash
docker build -t elysium-ml-service .
docker run -p 8000:8000 elysium-ml-service
```

### Deploy to Koyeb

See [KOYEB_ML_DEPLOYMENT.md](../KOYEB_ML_DEPLOYMENT.md) for complete deployment guide.

## API Endpoints

### `GET /`
Service information

### `GET /health`
Health check (for Koyeb)

### `POST /predict/price`
Predict auction price

**Request:**
```json
{
  "item_name": "Item Name",
  "features": {
    "item_avg_price": 1500,
    "item_median_price": 1450,
    "item_price_std": 200,
    "item_auction_count": 25,
    "day_of_week": 6,
    "hour_of_day": 12,
    "active_members_count": 45,
    "recent_price_trend": 1.15
  }
}
```

**Response:**
```json
{
  "predicted_price": 1667.5,
  "confidence": 0.85,
  "model_used": "statistical",
  "confidence_interval": {
    "lower": 1275.5,
    "upper": 2059.5
  },
  "important_features": [...],
  "message": "Prediction message"
}
```

### `GET /models/info`
Get information about loaded models

## Project Structure

```
ml-service/
├── main.py                 # FastAPI application
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker configuration
├── models/                # ML model classes
│   ├── price_predictor.py # Price prediction model
│   └── __init__.py
├── utils/                 # Utilities
│   ├── config.py         # Configuration
│   └── __init__.py
└── saved_models/          # Trained models (gitignored)
```

## Memory Optimization

This service is optimized for 512MB RAM:
- Single worker process (~150MB)
- Lightweight models (XGBoost, scikit-learn)
- Efficient feature engineering
- Model caching
- Total footprint: ~200MB

## Next Steps

1. **Train Real Models**: Collect data and train XGBoost models
2. **Add More Features**: Churn prediction, spawn prediction, etc.
3. **Improve Accuracy**: Fine-tune hyperparameters
4. **Monitor Performance**: Add logging and metrics

## Development

### Adding New Models

1. Create model class in `models/`
2. Add endpoint in `main.py`
3. Update client in `ml-client.js`
4. Test locally
5. Deploy to Koyeb

### Testing

```bash
# Run tests (when added)
pytest

# Check memory usage
docker stats
```

## License

Same as parent project
