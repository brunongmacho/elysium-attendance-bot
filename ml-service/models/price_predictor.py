"""
Price Prediction Model
Uses XGBoost for item price prediction with fallback to statistical methods
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
import logging
import os
import joblib
from datetime import datetime

logger = logging.getLogger(__name__)

class PricePredictor:
    """
    ML-based price predictor with statistical fallback
    """

    def __init__(self, model_path: Optional[str] = None):
        """Initialize predictor"""
        self.model = None
        self.model_loaded = False
        self.feature_names = [
            'item_avg_price',
            'item_median_price',
            'item_price_std',
            'item_auction_count',
            'day_of_week',
            'hour_of_day',
            'active_members_count',
            'recent_price_trend'
        ]

        # Try to load pre-trained model
        if model_path and os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                self.model_loaded = True
                logger.info(f"✅ Loaded pre-trained model from {model_path}")
            except Exception as e:
                logger.warning(f"⚠️ Could not load model: {e}. Using statistical fallback.")
        else:
            logger.info("📊 No pre-trained model found. Using statistical fallback.")

    def predict(self, item_name: str, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict price for an item

        Args:
            item_name: Name of the item
            features: Dictionary of features

        Returns:
            Dictionary with prediction results
        """

        # If we have a trained ML model, use it
        if self.model_loaded and self.model:
            return self._predict_ml(item_name, features)

        # Otherwise use statistical fallback (current bot logic)
        return self._predict_statistical(item_name, features)

    def _predict_ml(self, item_name: str, features: Dict[str, Any]) -> Dict[str, Any]:
        """ML-based prediction using XGBoost"""

        try:
            # Prepare features
            X = self._prepare_features(features)

            # Get prediction
            predicted_price = float(self.model.predict(X)[0])

            # Calculate confidence based on feature quality
            confidence = self._calculate_confidence_ml(features, predicted_price)

            # Calculate confidence interval (using historical std if available)
            std = features.get('item_price_std', predicted_price * 0.15)
            confidence_interval = {
                'lower': predicted_price - (1.96 * std),
                'upper': predicted_price + (1.96 * std)
            }

            # Get feature importance
            if hasattr(self.model, 'feature_importances_'):
                important_features = self._get_important_features(
                    features,
                    self.model.feature_importances_
                )
            else:
                important_features = None

            return {
                'predicted_price': predicted_price,
                'confidence': confidence,
                'model_used': 'ml',
                'confidence_interval': confidence_interval,
                'important_features': important_features,
                'message': f'ML prediction for {item_name}'
            }

        except Exception as e:
            logger.error(f"ML prediction failed: {e}. Falling back to statistical.")
            return self._predict_statistical(item_name, features)

    def _predict_statistical(self, item_name: str, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Statistical prediction (fallback method)
        This mimics your current intelligence-engine.js logic
        """

        # Get base statistics
        avg_price = features.get('item_avg_price', 1000)
        median_price = features.get('item_median_price', avg_price)
        std = features.get('item_price_std', avg_price * 0.2)
        auction_count = features.get('item_auction_count', 0)
        trend = features.get('recent_price_trend', 1.0)

        # Use median as base (more robust than mean)
        base_price = median_price

        # Apply trend adjustment
        predicted_price = base_price * trend

        # Calculate confidence based on data quality
        confidence = self._calculate_confidence_statistical(
            auction_count, std, avg_price
        )

        # Confidence interval
        confidence_interval = {
            'lower': predicted_price - (1.96 * std),
            'upper': predicted_price + (1.96 * std)
        }

        return {
            'predicted_price': float(predicted_price),
            'confidence': float(confidence),
            'model_used': 'statistical',
            'confidence_interval': confidence_interval,
            'important_features': [
                {'feature': 'item_median_price', 'value': median_price, 'importance': 0.4},
                {'feature': 'recent_price_trend', 'value': trend, 'importance': 0.3},
                {'feature': 'item_auction_count', 'value': auction_count, 'importance': 0.2}
            ],
            'message': f'Statistical prediction for {item_name} (no ML model trained yet)'
        }

    def _prepare_features(self, features: Dict[str, Any]) -> np.ndarray:
        """Convert feature dict to numpy array for model"""
        X = []
        for feature_name in self.feature_names:
            value = features.get(feature_name, 0)
            X.append(float(value))
        return np.array(X).reshape(1, -1)

    def _calculate_confidence_ml(self, features: Dict[str, Any], predicted_price: float) -> float:
        """Calculate prediction confidence for ML model"""

        confidence = 0.70  # Base confidence for ML

        # Boost based on historical data
        auction_count = features.get('item_auction_count', 0)
        if auction_count >= 20:
            confidence += 0.15
        elif auction_count >= 10:
            confidence += 0.10
        elif auction_count >= 5:
            confidence += 0.05

        # Boost based on consistency (low std = high consistency)
        std = features.get('item_price_std', 0)
        avg = features.get('item_avg_price', predicted_price)
        if avg > 0:
            cv = std / avg  # Coefficient of variation
            if cv < 0.10:  # Very consistent
                confidence += 0.10
            elif cv < 0.20:
                confidence += 0.05

        return min(confidence, 0.98)  # Cap at 98%

    def _calculate_confidence_statistical(
        self,
        auction_count: int,
        std: float,
        avg_price: float
    ) -> float:
        """Calculate confidence for statistical prediction"""

        confidence = 0.60  # Base confidence for statistical

        # Adjust based on sample size
        if auction_count >= 30:
            confidence += 0.20
        elif auction_count >= 15:
            confidence += 0.15
        elif auction_count >= 10:
            confidence += 0.10
        elif auction_count >= 5:
            confidence += 0.05

        # Adjust based on consistency
        if avg_price > 0:
            cv = std / avg_price
            if cv < 0.15:
                confidence += 0.10
            elif cv < 0.25:
                confidence += 0.05

        return min(confidence, 0.90)  # Statistical caps at 90%

    def _get_important_features(
        self,
        features: Dict[str, Any],
        importances: np.ndarray
    ) -> List[Dict[str, Any]]:
        """Get top important features"""

        feature_importance = []
        for name, importance in zip(self.feature_names, importances):
            if importance > 0.01:  # Only include if >1% importance
                feature_importance.append({
                    'feature': name,
                    'value': features.get(name, 0),
                    'importance': float(importance)
                })

        # Sort by importance
        feature_importance.sort(key=lambda x: x['importance'], reverse=True)
        return feature_importance[:5]  # Top 5

    def get_info(self) -> Dict[str, Any]:
        """Get model information"""
        return {
            'model_loaded': self.model_loaded,
            'model_type': type(self.model).__name__ if self.model else 'None',
            'features': self.feature_names,
            'fallback_available': True
        }
