"""
ELYSIUM Bot - Configuration Management
Loads config.json and boss_points.json
"""
import json
from pathlib import Path
from typing import Dict, Any

class Config:
    def __init__(self, config_path: str = "config.json", boss_path: str = "boss_points.json"):
        self.config_path = Path(config_path)
        self.boss_path = Path(boss_path)
        self.data: Dict[str, Any] = {}
        self.boss_points: Dict[str, Dict] = {}
        self.load()
    
    def load(self):
        """Load configuration files"""
        # Load main config
        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                self.data = json.load(f)
        else:
            raise FileNotFoundError(f"Config file not found: {self.config_path}")
        
        # Load boss points
        if self.boss_path.exists():
            with open(self.boss_path, 'r') as f:
                self.boss_points = json.load(f)
        else:
            raise FileNotFoundError(f"Boss points file not found: {self.boss_path}")
    
    def __getattr__(self, name):
        """Allow dot notation access to config values"""
        if name in self.data:
            return self.data[name]
        raise AttributeError(f"Config has no attribute '{name}'")
    
    def get(self, key: str, default=None):
        """Get config value with default"""
        return self.data.get(key, default)
    
    def is_admin(self, member) -> bool:
        """Check if member has admin role"""
        return any(role.name in self.admin_roles for role in member.roles)
    
    def find_boss_match(self, input_text: str) -> str | None:
        """
        Find boss name by exact match or fuzzy match (Levenshtein distance)
        Returns canonical boss name or None
        """
        query = input_text.lower().strip()
        
        # Exact match first
        for boss_name, boss_data in self.boss_points.items():
            if boss_name.lower() == query:
                return boss_name
            for alias in boss_data.get('aliases', []):
                if alias.lower() == query:
                    return boss_name
        
        # Fuzzy match with Levenshtein distance
        try:
            from Levenshtein import distance
        except ImportError:
            # Fallback to simple implementation
            def distance(s1, s2):
                if len(s1) < len(s2):
                    return distance(s2, s1)
                if len(s2) == 0:
                    return len(s1)
                prev = range(len(s2) + 1)
                for i, c1 in enumerate(s1):
                    curr = [i + 1]
                    for j, c2 in enumerate(s2):
                        curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (c1 != c2)))
                    prev = curr
                return prev[-1]
        
        best_match = None
        best_distance = 999
        
        for boss_name, boss_data in self.boss_points.items():
            dist = distance(query, boss_name.lower())
            if dist < best_distance:
                best_distance = dist
                best_match = boss_name
            
            for alias in boss_data.get('aliases', []):
                dist = distance(query, alias.lower())
                if dist < best_distance:
                    best_distance = dist
                    best_match = boss_name
        
        # Only return match if distance <= 2
        return best_match if best_distance <= 2 else None

# Global config instance
config = None

def load_config() -> Config:
    """Load and return config instance"""
    global config
    config = Config()
    return config

def get_config() -> Config:
    """Get existing config instance"""
    global config
    if config is None:
        config = load_config()
    return config