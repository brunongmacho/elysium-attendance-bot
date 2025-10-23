# modules/boss_utils.py
import json
import os
from rapidfuzz import fuzz
from modules.logger import info, warn

BOSS_POINTS = {}

def load_boss_points(path="boss_points.json"):
    """Load boss point data from JSON."""
    global BOSS_POINTS
    if not os.path.exists(path):
        warn(f"Boss points file not found: {path}")
        return {}
    with open(path, "r", encoding="utf-8") as f:
        BOSS_POINTS = json.load(f)
    info(f"Loaded {len(BOSS_POINTS)} bosses")
    return BOSS_POINTS

def find_boss_match(name: str):
    """Find best boss name match using aliases and fuzzy logic."""
    if not BOSS_POINTS:
        load_boss_points()

    name_lower = name.lower().strip()

    # Direct or alias match
    for boss, data in BOSS_POINTS.items():
        if name_lower == boss.lower() or name_lower in [a.lower() for a in data.get("aliases", [])]:
            return boss

    # Fuzzy match fallback
    best_match = None
    best_score = 0
    for boss, data in BOSS_POINTS.items():
        score = fuzz.partial_ratio(name_lower, boss.lower())
        for alias in data.get("aliases", []):
            score = max(score, fuzz.partial_ratio(name_lower, alias.lower()))
        if score > best_score:
            best_match = boss
            best_score = score

    return best_match if best_score >= 70 else None

def get_boss_points(boss_name: str) -> int:
    """Return the point value for a given boss."""
    if not BOSS_POINTS:
        load_boss_points()
    return BOSS_POINTS.get(boss_name, {}).get("points", 0)
