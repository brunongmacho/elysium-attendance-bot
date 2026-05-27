/**
 * Application Constants
 * Centralized location for all magic numbers and configuration values
 */

// Time constants (in milliseconds)
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

// Timezone constants
export const TIMEZONE = {
  GMT_PLUS_8_OFFSET: 8 * TIME.HOUR,
  GMT_PLUS_8_NAME: 'Asia/Manila',
} as const;

// Boss timer constants
export const BOSS_TIMER = {
  GRACE_PERIOD: 35 * TIME.MINUTE, // 35 minutes after expected spawn
  SOON_THRESHOLD: 30 * TIME.MINUTE, // < 30 minutes = "soon"
  REFRESH_INTERVAL: 30 * TIME.SECOND, // Auto-refresh every 30 seconds
} as const;

// API caching constants
export const CACHE = {
  BOSS_TIMERS: 30, // seconds
  LEADERBOARD: 60, // seconds
  STALE_WHILE_REVALIDATE_MULTIPLIER: 2,
} as const;

// Leaderboard constants
export const LEADERBOARD = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  DEBOUNCE_DELAY: 300, // milliseconds
} as const;

// Validation constants
export const VALIDATION = {
  DISCORD_SNOWFLAKE_REGEX: /^\d{17,19}$/,
  BOSS_NAME_MAX_LENGTH: 100,
  SEARCH_MIN_LENGTH: 1,
  SEARCH_MAX_LENGTH: 50,
} as const;

// Auth/Session constants
export const AUTH = {
  CACHE_AGE: 5 * TIME.MINUTE, // Refresh Discord data every 5 minutes
  SESSION_MAX_AGE: 30 * TIME.MINUTE, // Session expires after 30 minutes
  REMEMBER_ME_MAX_AGE: 7 * TIME.DAY, // Remember me: session expires after 7 days
} as const;

// UI/UX constants
export const UI = {
  BACK_TO_TOP_THRESHOLD: 300, // pixels scrolled before showing back-to-top button
  ANIMATION_DURATION_MS: 300, // default animation duration
  TRANSITION_DURATION_SLOW: 1000, // slow transitions
  ERROR_RETRY_INTERVAL: 5000, // SWR error retry interval
  ERROR_RETRY_COUNT: 3, // maximum retry attempts
  REFRESH_BUTTON_DELAY: 500, // delay to show loading state on manual refresh
} as const;

// External links
export const LINKS = {
  APK_DOWNLOAD: 'https://github.com/brunongmacho/elysium-guild/releases/download/v2.0.4/app-debug.apk',
  DISCORD_INVITE: 'https://discord.gg/EUWXd5tPa7',
} as const;

// Special user theme assignments - each user gets a unique theme based on their lore
export interface SpecialUserConfig {
  name: string;
  theme: string;
  customGreeting?: string;
  subtitle?: string;
  badge?: string;
  message?: string;
  quotes?: {
    homeAbout?: string;
    floatingBanner?: string;
    profile?: string;
    footer?: string;
  };
  extraQuotes?: {
    subtitle?: string;
    banner?: string;
  };
}

export const SPECIAL_USERS: Record<string, SpecialUserConfig> = {
  // Rohypnol - Quantum Theme
  '182081219062661120': {
    name: 'Rohypnol',
    theme: 'quantum',
    customGreeting: '💊 The Amnesiac Adorer 💊',
    subtitle: 'The Amnesiac Adorer',
    badge: 'Finance',
    message: 'Forget Attempts: INFINITY | Memory of Her: STRONGER',
    quotes: {
      homeAbout: 'Forget Attempts: INFINITY | Memory of Her: STRONGER | Vice Leader Status',
      floatingBanner: 'Some memories are not meant to be erased',
      profile: 'The sedated vice leader who remembers what he is supposed to forget',
      footer: 'Forget Attempts: INFINITY | Memory STRONGER | Tenchu Bot: 99%',
    },
    extraQuotes: {
      subtitle: 'Some feelings are the only thing keeping him awake',
    },
  },

  // AlterFrieren - Starlight Theme
  '517653312783253505': {
    name: 'AlterFrieren',
    theme: 'starlight',
    customGreeting: '✨ Eternal Moments ✨',
    subtitle: 'The Time-Touched Princess of Eternal Moments',
    badge: 'Lilith',
    message: 'Some endings are more beautiful than beginnings',
    quotes: {
      homeAbout: 'Age: BEYOND MEASURE | Times Time Stopped During Confession: 1',
      floatingBanner: 'She pretends not to notice how close he sits',
      profile: 'The ancient princess whose heart chose peace over words and found something softer',
      footer: 'Age: BEYOND MEASURE | Peace Chosen Over Words: 1 | Times Pretended Not To Notice: COUNTLESS',
    },
    extraQuotes: {
      subtitle: 'He told her once — and that was enough.',
    },
  },

  // Iguro - Portal Theme
  '154974203970453504': {
    name: 'Iguro',
    theme: 'portal',
    customGreeting: '🌀 Dimensional Disaster 🌀',
    subtitle: 'The Accidental Recruitment Director',
    badge: 'Recruiter',
    message: 'Portals never go where intended — but the guild keeps growing',
    quotes: {
      homeAbout: 'Portal accuracy: 0% | Recruitment success: 1200%',
      floatingBanner: 'Portals never go where intended — but the guild keeps growing',
      profile: 'The VP whose portals never work but the guild keeps expanding',
      footer: 'Accidental Recruits: 47 | Portal Success: 0% | Kingdom Alliances: 3',
    },
  },

  // Carrera - Chrono Theme
  '358982325821767690': {
    name: 'Carrera',
    theme: 'chrono',
    customGreeting: '⏰ Temporal Warrior ⏰',
    subtitle: 'The Weaponized Temporal Displacement Expert',
    badge: 'Time',
    message: 'Weaponized temporal displacement',
    quotes: {
      homeAbout: 'Time crimes: 892 (700 tactical)',
      floatingBanner: 'Weaponized temporal displacement',
      profile: 'The time warrior who made lateness a legitimate tactic',
      footer: 'Time Crimes: 892 | Successful Paradoxes: 34 | Quantum Breaks: 12',
    },
  },

  // Evand3r - Spoon Theme
  '1388814743011328075': {
    name: 'Evand3r',
    theme: 'spoon',
    customGreeting: '🥄 The Spoon Seeker 🥄',
    subtitle: 'The Legendary Spoon Seeker',
    badge: 'Spoon',
    message: 'Quest Duration: 4y 7m 23d | Spoon Status: MISSING',
    quotes: {
      homeAbout: 'Quest Duration: 4y 7m 23d | Improvised Kills: 9999',
      floatingBanner: 'Still searching for THE spoon',
      profile: 'The hero whose quest became longer than most wars',
      footer: 'Spoon Status: MISSING | Museum Pieces: 47',
    },
  },

  // Fever - Bureaucracy Theme
  '935913132822495262': {
    name: 'Fever',
    theme: 'bureaucracy',
    customGreeting: '📋 Organized Chaos 📋',
    subtitle: 'The Apocalypse Administrator',
    badge: 'Admin',
    message: 'Apocalypses Filed: 12 | Pending Dooms: 1',
    quotes: {
      homeAbout: 'Apocalypses Filed: 12 | Workshop Waitlist: 9 Months',
      floatingBanner: 'The void is now OPTIMIZED',
      profile: 'The administrator who organized the end times with enterprise-level tools',
      footer: 'Pivot Tables of Destruction: 89 | Pending Dooms: 1',
    },
  },

  // Marzhall - Archive Theme
  '352851532880019456': {
    name: 'Marzhall',
    theme: 'archive',
    customGreeting: '📁 Archive Fortress 📁',
    subtitle: 'The Archival Martyr',
    badge: 'Archive',
    message: 'Filing Cabinets: 47 | Arguments Won: 3',
    quotes: {
      homeAbout: 'Filing Cabinets: 47 | Backup Drives: 12',
      floatingBanner: 'The archivist whose correctness cannot overcome volume',
      profile: 'Documents everything but still loses arguments',
      footer: 'Course Students: 500 | Arguments Won (Total): 3',
    },
  },

  // MochiP - Art Theme
  '1301351696395407400': {
    name: 'MochiP',
    theme: 'art',
    customGreeting: '🎨 Assassination Artist 🎨',
    subtitle: 'The Assassination Artist',
    badge: 'Art',
    message: 'Gallery Exhibits: 3 | Note Value: 5000 GOLD',
    quotes: {
      homeAbout: 'Gallery Exhibits: 3 | Note Value: 5000 GOLD',
      floatingBanner: 'The killer who made murder into a gallery exhibition',
      profile: 'Assassination as performative art with incomprehensible apologies',
      footer: 'Note Value: 5000 GOLD | Assassination Requests (For Notes): 47',
    },
  },

  // Ztig - Blur Theme
  '1274666461998350389': {
    name: 'Ztig',
    theme: 'blur',
    customGreeting: '💨 Lightning Speedster 💨',
    subtitle: 'The Lightning Speedster',
    badge: 'Speedster',
    message: 'Speedrun Records: 47 | Server Complaints: INFINITY',
    quotes: {
      homeAbout: 'Speedrun Records: 47 | Server Complaints: INFINITY',
      floatingBanner: 'The blur who exists in lag and breaks records',
      profile: 'Speedrun mastery with server-breaking velocity',
      footer: 'Category Bans: 3 | Recognition Accuracy: 0%',
    },
  },

  // ladyhoho - Abyss Theme
  '1099004136588054578': {
    name: 'ladyhoho',
    theme: 'abyss',
    customGreeting: '😈 Laughing Abyss 😈',
    subtitle: 'The Laughing Abyss',
    badge: 'Abyss',
    message: 'Combo Multiplier: 9999x | Therapists Defeated: 6',
    quotes: {
      homeAbout: 'Therapy Days: 4/week | Combo Multiplier: 9999x',
      floatingBanner: 'The smile that launched a thousand therapy sessions',
      profile: 'The chaos soul who weaponized existential dread',
      footer: 'Weapon Classification: 4 KINGDOMS | Therapists Defeated: 6',
    },
  },

  // lanZ6 - Chaosgun Theme
  '284613140883308544': {
    name: 'lanZ6',
    theme: 'chaosgun',
    customGreeting: '🎯 Calculated Chaos 🎯',
    subtitle: 'The Laser Precision',
    badge: 'Precision',
    message: 'Intentional Misses: 89 | Calculated Chaos: 9000',
    quotes: {
      homeAbout: 'Intentional Misses: 89 | Ally Near-Misses: 47',
      floatingBanner: 'The shooter who misses on purpose better than others hit',
      profile: 'Chief Chaos Control Officer — irony intentional',
      footer: 'Calculated Chaos: 9000 | Bystander Recruitment: 3',
    },
  },

  // LaxusLawliet - Lightning Theme
  '758077966738522244': {
    name: 'LaxusLawliet',
    theme: 'lightning',
    customGreeting: '⚡ Lightning Lord ⚡',
    subtitle: 'The Lightning Lord',
    badge: 'Lightning',
    message: 'Watts Generated: INFINITY | Property Damage: 8900 GOLD',
    quotes: {
      homeAbout: 'Watts Generated: INFINITY | Blackouts Caused: 47',
      floatingBanner: 'The storm who bills himself as a power company',
      profile: "Tenchu's official power grid",
      footer: 'Phone Charges: 9999 | Property Damage: 8900 GOLD',
    },
  },

  // Mielle1968 - Vintage Theme
  '1178337129768702043': {
    name: 'Mielle1968',
    theme: 'vintage',
    customGreeting: '📻 Vintage Virtuoso 📻',
    subtitle: 'The Vintage Virtuoso',
    badge: 'Vintage',
    message: 'Years Active: 58 | Vintage Gear Value: INFINITY',
    quotes: {
      homeAbout: 'Years Active: 58 | Guilds Witnessed: 47',
      floatingBanner: 'The living legend whose complaints are educational',
      profile: 'Back in my day stories are mandatory orientation content',
      footer: 'Vintage Gear Value: INFINITY | Complaining Streak: 58 Years',
    },
  },

  // AndyVI - Royal Theme
  '680381103143649318': {
    name: 'AndyVI',
    theme: 'royal',
    customGreeting: '👑 Puddle Empire 👑',
    subtitle: 'The Royal Recovery Specialist',
    badge: 'Recovery',
    message: 'Territories ruled: 14 | Subjects (Real): 1 Gnome',
    quotes: {
      homeAbout: 'Territories Ruled: 14 | Subjects (Real): 1 Gnome',
      floatingBanner: 'Puddle Diplomacy: 100%',
      profile: 'The non-existent monarch whose tiny empire grows through absolute confidence',
      footer: 'Royal Declarations: 500 | Puddle Diplomacy: 100% | Tub Kingdom: ACTIVE',
    },
  },

  // 路易丝 - Elegance Theme
  '823022050066694154': {
    name: '路易丝',
    theme: 'elegance',
    customGreeting: '🌸 Elegant Enigma 🌸',
    subtitle: 'The Elegant Enigma',
    badge: 'Enigma',
    message: 'Elegance Rating: 9999 | Combat Ballets: 12',
    quotes: {
      homeAbout: 'Elegance Rating: 9999 | Combat Ballets: 12',
      floatingBanner: 'The elegant warrior who defeats enemies through confusion',
      profile: 'Aesthetic warfare with deadly grace',
      footer: 'Enemy Confusion: 47 | Instant Noodle Crowns: INFINITY',
    },
  },

  // HODAKA - Weather Theme
  '725358852953997382': {
    name: 'HODAKA',
    theme: 'weather',
    customGreeting: '🌤️ Weather Criminal 🌤️',
    subtitle: 'The Weather Criminal Weatherboy',
    badge: 'Weather',
    message: 'Kingdoms Affected: 47 | Productivity Drops: 89%',
    quotes: {
      homeAbout: 'Kingdoms Affected: 47 | Coudy Merch: INFINITY',
      floatingBanner: 'Physics is crying',
      profile: 'The weatherboy who made meteorology an emotional weapon',
      footer: 'Meteorologist Bounty: 25000 GOLD | Productivity Drops: 89%',
    },
  },

  // Channy - Void Theme
  '329211390500012032': {
    name: 'Channy',
    theme: 'void',
    customGreeting: '🕳️ The Void Channeler 🕳️',
    subtitle: 'The Emotional Void Weaver',
    badge: 'Weaver',
    message: 'Channeled Emotions: 47 | Black Holes Created: 3',
    quotes: {
      homeAbout: 'Channeled Emotions: 47 | Black Holes Created: 3',
      floatingBanner: 'Emotional Volatility: 9999',
      profile: 'The mage whose feelings become weapons and the void is their plus-one',
      footer: 'Channeled Emotions: 47 | Black Holes: 3 | Collateral Damage: INFINITY',
    },
  },

  // Hytrz - Speed Theme
  '944182403361038336': {
    name: 'Hytrz',
    theme: 'speed',
    customGreeting: '⚡ Hyperactive Haste ⚡',
    subtitle: 'The Hyperactive Haste',
    badge: 'Haste',
    message: 'Speed Multiplier: 4x | Comprehension: 0%',
    quotes: {
      homeAbout: 'Speed Multiplier: 4x | Quests Pre-Completed: 89',
      floatingBanner: 'Fastest. Still has not been understood.',
      profile: 'The blur who completes before starting and wins before arriving',
      footer: 'Speed: 4x | Words Per Second: 47 | Comprehension: 0%',
    },
  },

  // yakob - Reverse Theme
  '789894582874669117': {
    name: 'yakob',
    theme: 'reverse',
    customGreeting: '🔄 Yak Attack 🔄',
    subtitle: 'The Yak Attack',
    badge: 'Reverse',
    message: 'Reverse Success: 89% | Confusion Kills: INFINITY',
    quotes: {
      homeAbout: 'Reverse Success: 89% | Backwards Arrows: 47',
      floatingBanner: 'The backwards warrior who confuses enemies by doing wrong',
      profile: 'Everything about yakob is reversed',
      footer: 'Reverse Success: 89% | Comprehension: 0%',
    },
  },

  // DarKOwLZ - Shadow Theme
  '475850650060587009': {
    name: 'DarKOwLZ',
    theme: 'shadow',
    customGreeting: '🌑 Shadow Humor 🌑',
    subtitle: 'The Shadow Humor',
    badge: 'Humor',
    message: 'Owl Impressions: 89 | Fear Actually Caused: 0',
    quotes: {
      homeAbout: 'Shadow Comedy Sets: 12 | Owl Impressions: 89',
      floatingBanner: 'The owls are working on it',
      profile: 'The not-so-scary shadow who terrifies through sheer owl enthusiasm',
      footer: 'Owl Impressions: 89 | Shadow Comedy Sets: 12 | Owl Terror: INFINITY',
    },
  },

  // Pedsrow - Pharmacy Theme
  '1004611790568706049': {
    name: 'Pedsrow',
    theme: 'pharmacy',
    customGreeting: '💊 Pharmacy Phantom 💊',
    subtitle: 'The Pharmacy Phantom',
    badge: 'Pharmacy',
    message: 'Potions Stocked: 500+ | Cures Invented: 47',
    quotes: {
      homeAbout: 'Potions Stocked: 500+ | Organized By Vibe',
      floatingBanner: 'The walking pharmacy whose inventory is chaos',
      profile: 'Excessive potion mastery with organizational chaos',
      footer: 'Potions Stocked: 500+ | Expiration Ignored',
    },
  },

  // UmpaUmpa - Rhythm Theme
  '1449745042720948224': {
    name: 'UmpaUmpa',
    theme: 'rhythm',
    customGreeting: '🎵 Rhythmic Rambler 🎵',
    subtitle: 'The Rhythmic Rambler',
    badge: 'Rhythm',
    message: 'Beats Per Minute: 180 | Rave Raids Won: 47',
    quotes: {
      homeAbout: 'Beats Per Minute: 180 | Rave Raids Won: 47',
      floatingBanner: 'The groove warrior who turned battle into a rave',
      profile: 'Combat dancing with rhythmic hypnosis',
      footer: 'Groove Hypnosis: 89% | Music Terribleness: INFINITY',
    },
  },

  // JudeMaximus - Morale Theme
  '835901803358584870': {
    name: 'JudeMaximus',
    theme: 'morale',
    customGreeting: '💪 Maximum Effort 💪',
    subtitle: 'The Maximum Effort',
    badge: 'Effort',
    message: 'Enthusiasm: 1000% | Coordination: 0%',
    quotes: {
      homeAbout: 'Enthusiasm: 1000% | Coordination: 0%',
      floatingBanner: 'The inspiring disaster whose warcry is their own name',
      profile: 'The morale officer who charges forward and somehow wins',
      footer: 'Enthusiasm: 1000% | Friendly Fire: 47 | Enemy Surrenders: INFINITY',
    },
  },

  // Gnohaij03 - Stats Theme
  '268582266072989697': {
    name: 'Gnohaij03',
    theme: 'stats',
    customGreeting: '📊 The Number Navigator 📊',
    subtitle: 'The Number Navigator',
    badge: 'Stats',
    message: 'Spreadsheets: 47 | Understanding: 0%',
    quotes: {
      homeAbout: 'Spreadsheets: 47 | Color Codes: 12',
      floatingBanner: 'The numbers are very organized. The value is questionable.',
      profile: 'The analyst whose spreadsheets are beautiful and meaningless',
      footer: 'Spreadsheets: 47 | Understanding: 0% | Organized: INFINITY',
    },
  },

  // PHorns - Horn Theme
  '1417566252997546044': {
    name: 'PHorns',
    theme: 'horn',
    customGreeting: '📯 Horn Hero 📯',
    subtitle: 'The Horn Hero',
    badge: 'Horn',
    message: 'Confusion Deployments: 89 | Successful Summons: 3',
    quotes: {
      homeAbout: 'Confusion Deployments: 89 | Name Laughs: INFINITY',
      floatingBanner: 'The hero whose name is the joke and the weapon',
      profile: 'Signal confusion with accidental competence',
      footer: 'Confusion Deployments: 89 | Effectiveness: 47%',
    },
  },

  // bozzkie - Boss Theme
  '553891031217733673': {
    name: 'bozzkie',
    theme: 'boss',
    customGreeting: '💰 The Boss Basher 💰',
    subtitle: 'The Opportunistic Boss Killer',
    badge: 'BossKiller',
    message: 'Bosses Killed 999+ | Hiding Time: INFINITY',
    quotes: {
      homeAbout: 'Bosses Killed: 999+ | Final Blows Stolen: 89',
      floatingBanner: 'Strategic Hiding: 100% | Criticism: IGNORED',
      profile: 'The cunning basher who hides until winning and calls it tactics',
      footer: 'Bosses Killed: 999+ | Hiding Time: INFINITY | Criticism Ignored: 100%',
    },
  },

  // xAthena - Wisdom Theme
  '1173270959101333556': {
    name: 'xAthena',
    theme: 'wisdom',
    customGreeting: '🏛️ Wisdom Warrior 🏛️',
    subtitle: 'The Strategic Wisdom',
    badge: 'Wisdom',
    message: 'Strategy Sessions: 47 | Tactical Insight: MAX',
    quotes: {
      homeAbout: 'Strategy Sessions: 47 | Tactical Insight: MAX',
      floatingBanner: 'Guides the guild with ancient tactical knowledge',
      profile: 'Brings strategic wisdom to every battle',
      footer: 'Wisdom Applied: 100% | Battle Victory Increase: 47%',
    },
  },

  // HercuIes - Olympus Theme
  '731165019751841842': {
    name: 'HercuIes',
    theme: 'olympus',
    customGreeting: '🏛️ Divine Lazy 🏛️',
    subtitle: 'The Divine Retirement Plan',
    badge: 'Retire',
    message: 'Strength: GODLIKE | Heroism: 0',
    quotes: {
      homeAbout: 'Strength: GODLIKE | Heroism: 0',
      floatingBanner: 'Olympus most accomplished underachiever',
      profile: 'The son of Zeus who rejected heroism for legendary laziness',
      footer: 'Strength: GODLIKE | Mountains Lifted (For WiFi): 4 | Heroic Quests: 0',
    },
  },
} as const;
