"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { THEME_COLORS, type ThemeColors } from '@/lib/theme-constants';

export type ThemeName = 'crimson' | 'wine' | 'magenta' | 'peach' | 'sunset' | 'golden' | 'lime' | 'olive' | 'emerald' | 'forest' | 'mint' | 'default' | 'navy' | 'arctic' | 'cyber' | 'purple' | 'quantum' | 'starlight' | 'chaos' | 'unstable' | 'portal' | 'grill' | 'wrong' | 'chrono' | 'nightlight' | 'ocean' | 'snack' | 'royal' | 'blade' | 'tiger' | 'boss' | 'void' | 'meme' | 'shadow' | 'neon' | 'chaoscoin' | 'spoon' | 'bureaucracy' | 'stats' | 'olympus' | 'weather' | 'speed' | 'morale' | 'recycle' | 'abyss' | 'chaosgun' | 'lightning' | 'sonic' | 'archive' | 'vintage' | 'art' | 'pancake' | 'pharmacy' | 'horn' | 'book' | 'shadowdance' | 'tidal' | 'rhythm' | 'vanish' | 'wisdom' | 'reverse' | 'dragon' | 'blur' | 'elegance' | 'sky';

interface Theme {
  name: ThemeName;
  label: string;
  colors: ThemeColors;
  description: string;
  icon: string;
}

const themes: Record<ThemeName, Theme> = {
  // REDS
  crimson: {
    name: 'crimson',
    label: 'Crimson War',
    colors: THEME_COLORS.crimson,
    description: 'War and PvP themed',
    icon: '⚔️',
  },
  wine: {
    name: 'wine',
    label: 'Wine Burgundy',
    colors: THEME_COLORS.wine,
    description: 'Rich and sophisticated',
    icon: '🍷',
  },

  // PINKS
  magenta: {
    name: 'magenta',
    label: 'Ruby Magenta',
    colors: THEME_COLORS.magenta,
    description: 'Bold and luxurious',
    icon: '💎',
  },
  peach: {
    name: 'peach',
    label: 'Peach Blossom',
    colors: THEME_COLORS.peach,
    description: 'Soft and welcoming',
    icon: '🍑',
  },

  // ORANGES/YELLOWS
  sunset: {
    name: 'sunset',
    label: 'Sunset Orange',
    colors: THEME_COLORS.sunset,
    description: 'Warm sunset vibes',
    icon: '🌅',
  },
  golden: {
    name: 'golden',
    label: 'Royal Gold',
    colors: THEME_COLORS.golden,
    description: 'Prestige and luxury',
    icon: '👑',
  },

  // GREENS
  lime: {
    name: 'lime',
    label: 'Electric Lime',
    colors: THEME_COLORS.lime,
    description: 'Energetic and vibrant',
    icon: '⚡',
  },
  olive: {
    name: 'olive',
    label: 'Olive Military',
    colors: THEME_COLORS.olive,
    description: 'Military tactical theme',
    icon: '🎖️',
  },
  emerald: {
    name: 'emerald',
    label: 'Emerald Nature',
    colors: THEME_COLORS.emerald,
    description: 'Growth and community',
    icon: '💚',
  },
  forest: {
    name: 'forest',
    label: 'Forest Jade',
    colors: THEME_COLORS.forest,
    description: 'Deep forest serenity',
    icon: '🌲',
  },
  mint: {
    name: 'mint',
    label: 'Mint Fresh',
    colors: THEME_COLORS.mint,
    description: 'Fresh and cooling',
    icon: '🍃',
  },

  // BLUES
  default: {
    name: 'default',
    label: 'Default Blue',
    colors: THEME_COLORS.default,
    description: 'Classic blue and purple theme',
    icon: '💙',
  },
  navy: {
    name: 'navy',
    label: 'Navy Admiral',
    colors: THEME_COLORS.navy,
    description: 'Naval military elegance',
    icon: '⚓',
  },
  arctic: {
    name: 'arctic',
    label: 'Arctic Frost',
    colors: THEME_COLORS.arctic,
    description: 'Cool frost and ice',
    icon: '❄️',
  },
  cyber: {
    name: 'cyber',
    label: 'Cyber Neon',
    colors: THEME_COLORS.cyber,
    description: 'Tech and futuristic',
    icon: '🤖',
  },

  // PURPLES
  purple: {
    name: 'purple',
    label: 'Epic Purple',
    colors: THEME_COLORS.purple,
    description: 'Mythic and epic vibe',
    icon: '💜',
  },

  // SPECIAL USER THEMES
  quantum: {
    name: 'quantum',
    label: 'Quantum Finance',
    colors: THEME_COLORS.quantum,
    description: '∞ Both Zero AND Infinite ∞',
    icon: '∞',
  },

  starlight: {
    name: 'starlight',
    label: 'Starlight Eternity',
    colors: THEME_COLORS.starlight,
    description: '✨ Some endings are more beautiful than beginnings ✨',
    icon: '✨',
  },

  chaos: {
    name: 'chaos',
    label: 'Goblokian Chaos',
    colors: THEME_COLORS.chaos,
    description: 'The stupider the plan, the more genius it becomes',
    icon: '🖍️',
  },

  unstable: {
    name: 'unstable',
    label: 'Exponential Uncertainty',
    colors: THEME_COLORS.unstable,
    description: 'Has not cast the same spell twice successfully',
    icon: '❓',
  },

  portal: {
    name: 'portal',
    label: 'Dimensional Chaos',
    colors: THEME_COLORS.portal,
    description: 'Portals never go where intended — but the guild keeps growing',
    icon: '🌀',
  },

  grill: {
    name: 'grill',
    label: 'Ethical BBQ',
    colors: THEME_COLORS.grill,
    description: 'Vegan BBQ paradox: The more you grill, the more you convert',
    icon: '🔥',
  },

  wrong: {
    name: 'wrong',
    label: 'Oracle of Wrongness',
    colors: THEME_COLORS.wrong,
    description: 'Strategic inversion rate: 100%',
    icon: '🔮',
  },

  chrono: {
    name: 'chrono',
    label: 'Temporal Warrior',
    colors: THEME_COLORS.chrono,
    description: 'Weaponized temporal displacement',
    icon: '⏰',
  },

  nightlight: {
    name: 'nightlight',
    label: 'Illuminated Assassin',
    colors: THEME_COLORS.nightlight,
    description: 'Academic assassination with Hello Kitty',
    icon: '🌟',
  },

  ocean: {
    name: 'ocean',
    label: 'Admiral of None',
    colors: THEME_COLORS.ocean,
    description: 'Sea claims: Infinity | Naval Knowledge: 0%',
    icon: '⚓',
  },

  // Batch 1: New Themes
  snack: {
    name: 'snack',
    label: 'Caloric Warlord',
    colors: THEME_COLORS.snack,
    description: 'Hunger 12000 | Strategic Digestion Active',
    icon: '🍖',
  },

  royal: {
    name: 'royal',
    label: 'Puddle Empire',
    colors: THEME_COLORS.royal,
    description: 'Territories ruled: 14 | Subjects: 1 Gnome',
    icon: '👑',
  },

  blade: {
    name: 'blade',
    label: 'Thorned Blade',
    colors: THEME_COLORS.blade,
    description: 'Elegance meets lethality in perfect harmony',
    icon: '⚔️',
  },

  tiger: {
    name: 'tiger',
    label: 'Divine Squeak',
    colors: THEME_COLORS.tiger,
    description: 'Divine cuteness MONOPOLIZED',
    icon: '🐯',
  },

  // Batch 2: New Themes
  boss: {
    name: 'boss',
    label: 'Boss Basher',
    colors: THEME_COLORS.boss,
    description: 'Bosses Killed 999+ | Hiding Time: INFINITY',
    icon: '💰',
  },

  void: {
    name: 'void',
    label: 'Void Channeler',
    colors: THEME_COLORS.void,
    description: 'Channeled Emotions: 47 | Black Holes Created: 3',
    icon: '🕳️',
  },

  meme: {
    name: 'meme',
    label: 'Meme Legend',
    colors: THEME_COLORS.meme,
    description: 'Followers: 3.2M | Sword has its own social media',
    icon: '📱',
  },

  shadow: {
    name: 'shadow',
    label: 'Dark Comedy',
    colors: THEME_COLORS.shadow,
    description: 'Owl Impressions: 89 | Fear Actually Caused: 0',
    icon: '🌑',
  },

  // Batch 3: New Themes
  neon: {
    name: 'neon',
    label: 'Neon Glow',
    colors: THEME_COLORS.neon,
    description: 'Neon aesthetics: MAX | Visibility: 100%',
    icon: '💚',
  },

  chaoscoin: {
    name: 'chaoscoin',
    label: 'Financial Paradox',
    colors: THEME_COLORS.chaoscoin,
    description: 'Kingdoms Affected: 7 | Elysium Profit: +400%',
    icon: '💸',
  },

  spoon: {
    name: 'spoon',
    label: 'Spoon Seeker',
    colors: THEME_COLORS.spoon,
    description: 'Quest Duration: 4y 7m 23d | Spoon Status: MISSING',
    icon: '🥄',
  },

  bureaucracy: {
    name: 'bureaucracy',
    label: 'Apocalypse Admin',
    colors: THEME_COLORS.bureaucracy,
    description: 'Apocalypses Filed: 12 | Pending Dooms: 1',
    icon: '📋',
  },

  // Batch 4: New Themes
  stats: {
    name: 'stats',
    label: 'Number Navigator',
    colors: THEME_COLORS.stats,
    description: 'Spreadsheets: 47 | Understanding: 0%',
    icon: '📊',
  },

  olympus: {
    name: 'olympus',
    label: 'Divine Lazy',
    colors: THEME_COLORS.olympus,
    description: 'Strength: GODLIKE | Heroism: 0',
    icon: '🏛️',
  },

  weather: {
    name: 'weather',
    label: 'Weather Criminal',
    colors: THEME_COLORS.weather,
    description: 'Kingdoms Affected: 47 | Productivity Drops: 89%',
    icon: '🌤️',
  },

  speed: {
    name: 'speed',
    label: 'Hyperactive Haste',
    colors: THEME_COLORS.speed,
    description: 'Speed Multiplier: 4x | Comprehension: 0%',
    icon: '⚡',
  },

  // Batch 5: New Themes
  morale: {
    name: 'morale',
    label: 'Maximum Effort',
    colors: THEME_COLORS.morale,
    description: 'Enthusiasm: 1000% | Coordination: 0%',
    icon: '💪',
  },

  recycle: {
    name: 'recycle',
    label: 'Dumpster King',
    colors: THEME_COLORS.recycle,
    description: 'Dumpster Legendaries: 47 | Recycled Victories: 89%',
    icon: '♻️',
  },

  abyss: {
    name: 'abyss',
    label: 'Laughing Abyss',
    colors: THEME_COLORS.abyss,
    description: 'Combo Multiplier: 9999x | Therapists Defeated: 6',
    icon: '😈',
  },

  // Batch 6: New Themes
  chaosgun: {
    name: 'chaosgun',
    label: 'Calculated Chaos',
    colors: THEME_COLORS.chaosgun,
    description: 'Intentional Misses: 89 | Calculated Chaos: 9000',
    icon: '🎯',
  },

  lightning: {
    name: 'lightning',
    label: 'Lightning Lord',
    colors: THEME_COLORS.lightning,
    description: 'Watts Generated: INFINITY | Property Damage: 8900 GOLD',
    icon: '⚡',
  },

  sonic: {
    name: 'sonic',
    label: 'Decibel Tyrant',
    colors: THEME_COLORS.sonic,
    description: 'Decibel Level: 189 | Victory Rate: 100%',
    icon: '🔊',
  },

  archive: {
    name: 'archive',
    label: 'Archive Fortress',
    colors: THEME_COLORS.archive,
    description: 'Filing Cabinets: 47 | Arguments Won: 3',
    icon: '📁',
  },

  vintage: {
    name: 'vintage',
    label: 'Vintage Virtuoso',
    colors: THEME_COLORS.vintage,
    description: 'Years Active: 58 | Vintage Gear Value: INFINITY',
    icon: '📻',
  },

  art: {
    name: 'art',
    label: 'Assassination Artist',
    colors: THEME_COLORS.art,
    description: 'Gallery Exhibits: 3 | Note Value: 5000 GOLD',
    icon: '🎨',
  },

  pancake: {
    name: 'pancake',
    label: 'Pancake Commander',
    colors: THEME_COLORS.pancake,
    description: 'Pancakes Flipped: 9999 | Battle Breakfasts: 47',
    icon: '🥞',
  },

  pharmacy: {
    name: 'pharmacy',
    label: 'Pharmacy Phantom',
    colors: THEME_COLORS.pharmacy,
    description: 'Potions Stocked: 500+ | Cures Invented: 47',
    icon: '💊',
  },

  horn: {
    name: 'horn',
    label: 'Horn Hero',
    colors: THEME_COLORS.horn,
    description: 'Confusion Deployments: 89 | Successful Summons: 3',
    icon: '📯',
  },

  book: {
    name: 'book',
    label: 'Literary Launcher',
    colors: THEME_COLORS.book,
    description: 'Books Thrown: 500+ | Genre Coverage: INFINITY',
    icon: '📚',
  },

  shadowdance: {
    name: 'shadowdance',
    label: 'Shadow Dancer',
    colors: THEME_COLORS.shadowdance,
    description: 'Angles Conquered: INFINITY | Captured on Film: 0',
    icon: '🌑',
  },

  tidal: {
    name: 'tidal',
    label: 'Tidal Terror',
    colors: THEME_COLORS.tidal,
    description: 'Floods Caused: 12 | Tears Stored: INFINITY',
    icon: '🌊',
  },

  rhythm: {
    name: 'rhythm',
    label: 'Rhythmic Rambler',
    colors: THEME_COLORS.rhythm,
    description: 'Beats Per Minute: 180 | Rave Raids Won: 47',
    icon: '🎵',
  },

  vanish: {
    name: 'vanish',
    label: 'Instant Escape',
    colors: THEME_COLORS.vanish,
    description: 'Tactical Disappearances: 89 | Presence Issues: PERMANENT',
    icon: '💨',
  },

  wisdom: {
    name: 'wisdom',
    label: 'Wisdom Warrior',
    colors: THEME_COLORS.wisdom,
    description: 'Strategy Sessions: 47 | Tactical Insight: MAX',
    icon: '🏛️',
  },

  reverse: {
    name: 'reverse',
    label: 'Yak Attack',
    colors: THEME_COLORS.reverse,
    description: 'Reverse Success: 89% | Confusion Kills: INFINITY',
    icon: '🔄',
  },

  dragon: {
    name: 'dragon',
    label: 'Dragon Warrior',
    colors: THEME_COLORS.dragon,
    description: 'Dragon Flames: 89 | Scales Forged: 47',
    icon: '🐉',
  },

  blur: {
    name: 'blur',
    label: 'Lightning Speedster',
    colors: THEME_COLORS.blur,
    description: 'Speedrun Records: 47 | Server Complaints: INFINITY',
    icon: '💨',
  },

  elegance: {
    name: 'elegance',
    label: 'Elegant Enigma',
    colors: THEME_COLORS.elegance,
    description: 'Elegance Rating: 9999 | Combat Ballets: 12',
    icon: '🌸',
  },

  // Sky theme for Wren空
  sky: {
    name: 'sky',
    label: 'Empty Sky Walker',
    colors: THEME_COLORS.sky,
    description: 'Sky Mastery: INFINITY | Void Steps: 47',
    icon: '🌌',
  },
};

interface ThemeContextType {
  currentTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: Record<ThemeName, Theme>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always default to 'crimson' on server to avoid hydration mismatch
  // Client will update after mounting if user has a saved preference
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('crimson');
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage after mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('guild-theme') as ThemeName;
    if (savedTheme && themes[savedTheme]) {
      setCurrentTheme(savedTheme);
    }
    setMounted(true);
  }, []);

  // Update CSS variables when theme changes (only on client)
  useEffect(() => {
    if (!mounted) return;

    const theme = themes[currentTheme];
    const root = document.documentElement;

    // Primary and accent colors
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-primary-dark', theme.colors.primaryDark);
    root.style.setProperty('--color-primary-light', theme.colors.primaryLight);
    root.style.setProperty('--color-accent', theme.colors.accent);
    root.style.setProperty('--color-accent-dark', theme.colors.accentDark);
    root.style.setProperty('--color-accent-light', theme.colors.accentLight);

    // Status colors
    root.style.setProperty('--color-success', theme.colors.success);
    root.style.setProperty('--color-warning', theme.colors.warning);
    root.style.setProperty('--color-danger', theme.colors.danger);
    root.style.setProperty('--color-info', theme.colors.info);
  }, [currentTheme, mounted]);

  const setTheme = (theme: ThemeName) => {
    setCurrentTheme(theme);
    if (mounted) {
      localStorage.setItem('guild-theme', theme);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
