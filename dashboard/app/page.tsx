"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { Section, Stack, Grid } from "@/components/layout";
import { Typography } from "@/components/ui";
import { Icon } from "@/components/icons";
import AnimatedCounter from "@/components/AnimatedCounter";
import Tooltip from "@/components/Tooltip";

import type { BossTimersResponse } from "@/types/api";
import { swrFetcher } from "@/lib/fetch-utils";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useSpecialUser } from "@/hooks/useSpecialUser";
import { LINKS } from "@/lib/constants";

interface MemberLoreData {
  title: string;
  lore: string;
  recent_developments: string;
  specialty: string;
  reputation: string;
  stats: string;
  skills: string[];
}

// Helper to get an icon/emoji based on member specialty
  function getIconForMember(name: string, data: MemberLoreData): string {
    // Member-specific icon mapping (prevents duplicates)
    const memberIcons: Record<string, string> = {
      'Carrera': '⏰',         // Temporal Weapons Specialist
      'Evand3r': '🥄',         // Legendary Spoon Seeker
      'Fever': '📋',           // Apocalypse Administrator
      'Hercules': '💪',        // Divine Retirement Plan
      'HODAKA': '⛅',          // Weather Criminal Weatherboy (forecast)
      'Iguro': '🌀',           // Accidental Recruitment Director (portals)
      'ladyhoho': '😂',        // Laughing Abyss
      'lanZ6': '🦋',           // Vibes Prophet Chancellor (butterfly)
      'LaxusLawliet': '🍬',   // Disappointed Namesake (sweets)
      'Marsha11': '📁',        // Archival Martyr (files)
      'Ztig': '🎯',            // Friendly Fire Legend
      '路易丝': '👑',          // Aristocratic Chaos Lord (fake nobility)
    };

  // Check for member-specific icon first
  if (memberIcons[name]) {
    return memberIcons[name];
  }

  // Fallback to keyword-based matching
  const specialty = data.specialty.toLowerCase();
  const title = data.title.toLowerCase();

  // Time & Prophecy
  if (specialty.includes('time') || title.includes('temporal') || specialty.includes('chrono')) return '🔮';

  // Food & Culinary
  if (specialty.includes('food') || specialty.includes('snack') || title.includes('caloric')) return '🍪';
  if (specialty.includes('consumption') || specialty.includes('eating') || specialty.includes('culinary')) return '🍖';
  if (specialty.includes('cookie') || specialty.includes('sweet')) return '🍰';
  if (specialty.includes('chef') || specialty.includes('cooking')) return '👨‍🍳';

  // Finance & Economics
  if (specialty.includes('finance') || specialty.includes('economic') || specialty.includes('wealth')) return '💎';
  if (specialty.includes('crypto') || specialty.includes('currency')) return '💰';
  if (specialty.includes('bidding') || specialty.includes('auction')) return '💸';

  // Death, Therapy & Darkness
  if (specialty.includes('therapy') || specialty.includes('death')) return '☠️';
  if (specialty.includes('assassination') || specialty.includes('assassin')) return '🗡️';
  if (specialty.includes('shadow') || specialty.includes('darkness')) return '🌑';
  if (specialty.includes('reaper') || specialty.includes('grim')) return '💀';

  // Communication & Sound
  if (specialty.includes('silence') || specialty.includes('quiet') || title.includes('deaf')) return '🔇';
  if (specialty.includes('music') || specialty.includes('sound')) return '🎵';
  if (specialty.includes('voice') || specialty.includes('speech')) return '🎙️';

  // Art & Design
  if (specialty.includes('font') || specialty.includes('design')) return '🎨';
  if (specialty.includes('aesthetic') || specialty.includes('visual')) return '🖼️';

  // Combat & Warfare
  if (specialty.includes('combat') || specialty.includes('warrior') || specialty.includes('battle')) return '⚔️';
  if (specialty.includes('tactics') || specialty.includes('tactical')) return '🎖️';
  if (specialty.includes('sniper') || specialty.includes('precision')) return '🎯';
  if (specialty.includes('hunter') || specialty.includes('hunting')) return '🏹';
  if (specialty.includes('defense') || specialty.includes('fortress')) return '🛡️';

  // Knowledge & Academia
  if (specialty.includes('academic') || specialty.includes('scholar')) return '📚';
  if (specialty.includes('philosophy') || specialty.includes('philosophical')) return '🤔';
  if (specialty.includes('research') || specialty.includes('study')) return '🔬';
  if (specialty.includes('enlighten') || specialty.includes('wisdom')) return '💡';
  if (specialty.includes('teaching') || specialty.includes('professor')) return '🎓';

  // Divine & Mythical
  if (specialty.includes('divine') || title.includes('tiger') || title.includes('byakko')) return '🐯';
  if (specialty.includes('angel') || specialty.includes('celestial')) return '👼';
  if (specialty.includes('dragon') || specialty.includes('serpent')) return '🐉';

  // Magic & Mystical
  if (specialty.includes('portal') || specialty.includes('magic')) return '🌀';
  if (specialty.includes('spell') || specialty.includes('enchant')) return '✨';
  if (specialty.includes('crystal') || specialty.includes('gem')) return '💠';
  if (specialty.includes('arcane') || specialty.includes('mystical')) return '🔯';

  // Chaos & Disorder
  if (specialty.includes('chaos') || specialty.includes('random')) return '💥';
  if (specialty.includes('apocalypse') || specialty.includes('filing')) return '📊';
  if (specialty.includes('disaster') || specialty.includes('catastrophe')) return '🌪️';

  // Leadership & Strategy
  if (specialty.includes('leader') || specialty.includes('command')) return '👑';
  if (specialty.includes('strategy') || specialty.includes('strategic')) return '🧠';
  if (specialty.includes('planning') || specialty.includes('coordination')) return '📋';

  // Technology & Engineering
  if (specialty.includes('engineer') || specialty.includes('tech')) return '⚙️';
  if (specialty.includes('bot') || specialty.includes('automation')) return '🤖';
  if (specialty.includes('mechanical') || specialty.includes('machine')) return '🔧';

  // Stealth & Intelligence
  if (specialty.includes('spy') || specialty.includes('espionage')) return '🕵️';
  if (specialty.includes('stealth') || specialty.includes('infiltration')) return '👁️';
  if (specialty.includes('intelligence') || specialty.includes('reconnaissance')) return '🔍';

  // Nature & Elements
  if (specialty.includes('fire') || specialty.includes('flame') || specialty.includes('burn')) return '🔥';
  if (specialty.includes('ice') || specialty.includes('frost') || specialty.includes('cold')) return '❄️';
  if (specialty.includes('lightning') || specialty.includes('thunder') || specialty.includes('electric')) return '⚡';
  if (specialty.includes('nature') || specialty.includes('forest') || specialty.includes('plant')) return '🌿';
  if (specialty.includes('water') || specialty.includes('ocean')) return '🌊';
  if (specialty.includes('earth') || specialty.includes('stone')) return '🪨';
  if (specialty.includes('wind') || specialty.includes('air')) return '💨';

  // Healing & Support
  if (specialty.includes('heal') || specialty.includes('medic')) return '💚';
  if (specialty.includes('support') || specialty.includes('buff')) return '✨';
  if (specialty.includes('resurrect') || specialty.includes('revival')) return '🌟';

  // Luck & Fortune
  if (specialty.includes('luck') || specialty.includes('fortune')) return '🍀';
  if (specialty.includes('gambling') || specialty.includes('chance')) return '🎲';

  // Social & Communication
  if (specialty.includes('diplomacy') || specialty.includes('negotiation')) return '🤝';
  if (specialty.includes('charisma') || specialty.includes('charm')) return '💫';

  // Miscellaneous
  if (specialty.includes('nightlight') || specialty.includes('light')) return '💡';
  if (specialty.includes('vegan') || specialty.includes('vegetarian')) return '🥗';
  if (specialty.includes('alcohol') || specialty.includes('drink')) return '🍺';
  if (specialty.includes('speed') || specialty.includes('fast')) return '💨';
  if (specialty.includes('strength') || specialty.includes('power')) return '💪';

  // Default icons based on position in alphabet
  const firstChar = name.charAt(0).toUpperCase();
  const icons = ['⚡', '🔥', '✨', '💫', '🌟', '⭐', '🎯', '⚔️', '🛡️', '🎨', '🔮', '💎'];
  return icons[firstChar.charCodeAt(0) % icons.length];
}

// Quick Stats Component with Real-time Data
function QuickStats() {
  const { data: session } = useSession();
  
  // Fetch boss timers (always call hooks unconditionally)
  const { data: bossData, error, isLoading } = useSWR<BossTimersResponse>(
    '/api/bosses',
    swrFetcher,
    { refreshInterval: 60000, shouldRetryOnError: false }
  );

  const stats = useMemo(() => {
    // If no access, show zeros
    if (!session?.canAccessBossTimers || !bossData?.bosses) {
      return {
        total: 0,
        spawned: 0,
        soon: 0,
        tracking: 0,
      };
    }

    return {
      total: bossData.count || 0,
      spawned: bossData.bosses.filter((b) => b.status === 'spawned').length,
      soon: bossData.bosses.filter((b) => b.status === 'soon').length,
      tracking: bossData.bosses.filter((b) => b.status === 'ready').length,
    };
  }, [bossData, session]);

  // If user doesn't have access, render empty stats
  if (!session?.canAccessBossTimers) {
    return (
      <Grid columns={{ xs: 2, sm: 4 }} gap="sm">
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-3 sm:p-4 text-center">
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary font-game-decorative">0</div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Total</div>
        </div>
        <div className="glass backdrop-blur-sm rounded-lg border border-danger/30 p-3 sm:p-4 text-center">
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-danger font-game-decorative">0</div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Spawned</div>
        </div>
        <div className="glass backdrop-blur-sm rounded-lg border border-accent/30 p-3 sm:p-4 text-center">
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-accent font-game-decorative">0</div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Soon</div>
        </div>
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-3 sm:p-4 text-center">
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary font-game-decorative">0</div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Tracking</div>
        </div>
      </Grid>
    );
  }

  // Show loading state
  if (isLoading && !bossData) {
    return (
      <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 text-center">
        <div className="text-primary text-sm animate-pulse">⏳ Loading live stats...</div>
      </div>
    );
  }

  // Show error message if API fails or returns unsuccessful response
  if (error || (bossData && !bossData.success)) {
    const errorMessage = bossData?.error || error?.message || 'Connection unavailable';
    return (
      <div className="glass backdrop-blur-sm rounded-lg border border-warning/30 p-4 text-center">
        <div className="text-warning text-sm mb-2">⚠️ Unable to load live stats</div>
        <div className="text-gray-400 text-xs">
          {errorMessage}
          <br />
          <span className="text-gray-500 mt-1 block">
            This is expected in development. Stats will work in production deployment.
          </span>
        </div>
      </div>
    );
  }

  return (
    <Grid columns={{ xs: 2, md: 4 }} gap="md">
      <Tooltip content="Total number of bosses being tracked" fullWidth>
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-help glow-primary">
          <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary font-game-decorative">
            <AnimatedCounter value={stats.total} />
          </div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Total Bosses</div>
        </div>
      </Tooltip>
      <Tooltip content="Bosses currently alive and ready to fight!" fullWidth>
        <div className="glass backdrop-blur-sm rounded-lg border border-danger p-3 sm:p-4 text-center glow-danger hover:scale-105 transition-transform duration-200 cursor-help">
          <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-danger font-game-decorative">
            <AnimatedCounter value={stats.spawned} />
          </div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Spawned Now</div>
        </div>
      </Tooltip>
      <Tooltip content="Bosses spawning within 30 minutes" fullWidth>
        <div className="glass backdrop-blur-sm rounded-lg border border-accent p-3 sm:p-4 text-center glow-accent hover:scale-105 transition-transform duration-200 cursor-help">
          <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-accent font-game-decorative">
            <AnimatedCounter value={stats.soon} />
          </div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Spawning Soon</div>
        </div>
      </Tooltip>
      <Tooltip content="Bosses with active countdown timers" fullWidth>
        <div className="glass backdrop-blur-sm rounded-lg border border-primary p-3 sm:p-4 text-center glow-primary hover:scale-105 transition-transform duration-200 cursor-help">
          <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary font-game-decorative">
            <AnimatedCounter value={stats.tracking} />
          </div>
          <div className="text-xs sm:text-sm text-gray-400 font-game">Tracking</div>
        </div>
      </Tooltip>
    </Grid>
  );
}

// Guild Pulse component — cycles between 3 content types every 30s
function PulseCycle({ memberLore, pulseCycle }: {
  memberLore: Record<string, MemberLoreData> | undefined;
  pulseCycle: number;
}) {
  // Shuffled member list that re-shuffles each rotation
  const [shuffledMembers, setShuffledMembers] = useState<string[]>([]);

  // Reshuffle when pulseCycle changes (or memberLore loads)
  useEffect(() => {
    if (!memberLore) return;
    const names = Object.keys(memberLore);
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    setShuffledMembers(shuffled);
  }, [memberLore, pulseCycle]);

  // Curated guild-wide stat groups for Cycle B
  const guildWideStats: { value: string; label: string; sublabel: string; color: string }[][] = [
    [
      { value: "∞", label: "Bovo Leadership Approval", sublabel: "(Unanimous)", color: "primary" },
      { value: "70", label: "Active Members", sublabel: "(All Legendary)", color: "success" },
      { value: "↑∞", label: "Guild Treasury", sublabel: "(Growing)", color: "accent" },
      { value: "MAX", label: "Chaos Level", sublabel: "(Operational)", color: "danger" },
    ],
    [
      { value: "99%", label: "Attendance Rate", sublabel: "(This Month)", color: "success" },
      { value: "0", label: "Diplomatic Incidents", sublabel: "(This Week)", color: "primary" },
      { value: "∞", label: "Boss Slay Count", sublabel: "(Cumulative)", color: "danger" },
      { value: "100%", label: "Meme Quality", sublabel: "(Guild Standard)", color: "accent" },
    ],
  ];

  // Pick current stat group based on cycle
  const currentStatGroup = guildWideStats[pulseCycle % guildWideStats.length];

  // Get visible members for Cycles A and C
  const visibleMembers = useMemo(() => {
    if (!memberLore || shuffledMembers.length < 2) return [];
    return shuffledMembers.slice(0, 2).map(name => ({
      name,
      data: memberLore[name],
    }));
  }, [shuffledMembers, memberLore]);

  const cycleLabels = [
    { heading: "\uD83D\uDDE3 Voices of Tenchu", subtitle: "What the guild is saying..." },
    { heading: "\uD83D\uDCCA Guild Pulse Stats", subtitle: "Live guild-wide metrics" },
    { heading: "\uD83C\uDFC6 Guild Legends", subtitle: "Members who shape the guild's story" },
  ];

  const currentLabel = cycleLabels[pulseCycle];

  return (
    <motion.div
      className="glass backdrop-blur-sm rounded-lg border border-primary/20 p-4 sm:p-6 card-3d"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
    >
      <Typography variant="h2" className="text-xl sm:text-2xl md:text-3xl text-gold mb-2">
        {currentLabel.heading}
      </Typography>
      <Typography variant="caption" className="text-gray-400 italic mb-6 block">
        {currentLabel.subtitle}
      </Typography>

      <AnimatePresence mode="wait">
        <motion.div
          key={pulseCycle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
        >
          {/* Cycle A: Voices of Tenchu */}
          {pulseCycle === 0 && (
            <Grid columns={{ xs: 1, md: 2 }} gap="md">
              {visibleMembers.map(({ name, data }) => (
                <div key={name} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30">
                  <span className="text-2xl flex-shrink-0">{getIconForMember(name, data)}</span>
                  <div>
                    <a
                      href={`/profile/${name}`}
                      className="text-accent-bright font-medium hover:text-accent hover:underline transition-all duration-200"
                    >
                      {name}
                    </a>
                    <p className="text-gray-400 text-sm mt-1 italic">
                      &ldquo;{data.reputation}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
              {visibleMembers.length === 0 && (
                <p className="text-gray-500 italic text-sm">Loading guild voices...</p>
              )}
            </Grid>
          )}

          {/* Cycle B: Guild Pulse Stats */}
          {pulseCycle === 1 && (
            <Grid columns={{ xs: 2, md: 4 }} gap="md">
              {currentStatGroup.map((stat, idx) => {
                const colorMap: Record<string, string> = {
                  primary: 'border-primary/30 text-primary-bright',
                  danger: 'border-danger/30 text-danger-bright',
                  success: 'border-success/30 text-success-bright',
                  accent: 'border-accent/30 text-accent-bright',
                };
                const colorClasses = colorMap[stat.color] || colorMap.primary;
                return (
                  <div
                    key={idx}
                    className={`glass backdrop-blur-sm rounded-lg border ${colorClasses} p-3 text-center`}
                  >
                    <div className={`text-2xl sm:text-3xl font-bold ${colorClasses} mb-1 font-game-decorative`}>
                      {stat.value}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400 font-game">{stat.label}</div>
                    {stat.sublabel && (
                      <div className="text-xs text-gray-500 font-game mt-1">{stat.sublabel}</div>
                    )}
                  </div>
                );
              })}
            </Grid>
          )}

          {/* Cycle C: Titles of Renown */}
          {pulseCycle === 2 && (
            <Grid columns={{ xs: 1, md: 2 }} gap="md">
              {visibleMembers.map(({ name, data }) => (
                <div key={name} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30">
                  <span className="text-2xl flex-shrink-0">{getIconForMember(name, data)}</span>
                  <div className="min-w-0">
                    <a
                      href={`/profile/${name}`}
                      className="text-accent-bright font-medium hover:text-accent hover:underline transition-all duration-200"
                    >
                      {name}
                    </a>
                    <p className="text-gold text-xs font-semibold mt-0.5">{data.title}</p>
                    <p className="text-gray-400 text-xs mt-1 line-clamp-2">
                      {data.lore.length > 120 ? data.lore.substring(0, 120) + '...' : data.lore}
                    </p>
                  </div>
                </div>
              ))}
              {visibleMembers.length === 0 && (
                <p className="text-gray-500 italic text-sm">Loading guild legends...</p>
              )}
            </Grid>
          )}
        </motion.div>
      </AnimatePresence>

      <Typography variant="caption" className="mt-4 text-center italic block">
        Rotating every 30 seconds &bull; Pulse cycle {pulseCycle + 1}/3
      </Typography>
    </motion.div>
  );
}

export default function GuildHomePage() {
  const { data: session } = useSession();
  const [pulseCycle, setPulseCycle] = useState(0);

  // Check for special user
  const { isSpecialUser, specialConfig } = useSpecialUser();
  const isStarlight = isSpecialUser && specialConfig?.theme === 'starlight';
  const isChaos = isSpecialUser && specialConfig?.theme === 'chaos';
  const isQuantum = isSpecialUser && specialConfig?.theme === 'quantum';
  const isUnstable = isSpecialUser && specialConfig?.theme === 'unstable';
  const isPortal = isSpecialUser && specialConfig?.theme === 'portal';
  const isGrill = isSpecialUser && specialConfig?.theme === 'grill';
  const isWrong = isSpecialUser && specialConfig?.theme === 'wrong';
  const isChrono = isSpecialUser && specialConfig?.theme === 'chrono';
  const isNightlight = isSpecialUser && specialConfig?.theme === 'nightlight';
  const isOcean = isSpecialUser && specialConfig?.theme === 'ocean';
  const isSnack = isSpecialUser && specialConfig?.theme === 'snack';
  const isRoyal = isSpecialUser && specialConfig?.theme === 'royal';
  const isBlade = isSpecialUser && specialConfig?.theme === 'blade';
  const isTiger = isSpecialUser && specialConfig?.theme === 'tiger';
  const isBoss = isSpecialUser && specialConfig?.theme === 'boss';
  const isVoid = isSpecialUser && specialConfig?.theme === 'void';
  const isMeme = isSpecialUser && specialConfig?.theme === 'meme';
  const isShadow = isSpecialUser && specialConfig?.theme === 'shadow';
  const isNeon = isSpecialUser && specialConfig?.theme === 'neon';
  const isChaoscoin = isSpecialUser && specialConfig?.theme === 'chaoscoin';
  const isSpoon = isSpecialUser && specialConfig?.theme === 'spoon';
  const isBureaucracy = isSpecialUser && specialConfig?.theme === 'bureaucracy';
  const isStats = isSpecialUser && specialConfig?.theme === 'stats';
  const isOlympus = isSpecialUser && specialConfig?.theme === 'olympus';
  const isWeather = isSpecialUser && specialConfig?.theme === 'weather';
  const isSpeed = isSpecialUser && specialConfig?.theme === 'speed';
  const isMorale = isSpecialUser && specialConfig?.theme === 'morale';
  const isRecycle = isSpecialUser && specialConfig?.theme === 'recycle';
  const isAbyss = isSpecialUser && specialConfig?.theme === 'abyss';
  const isChaosgun = isSpecialUser && specialConfig?.theme === 'chaosgun';
  const isLightning = isSpecialUser && specialConfig?.theme === 'lightning';
  const isSonic = isSpecialUser && specialConfig?.theme === 'sonic';
  const isArchive = isSpecialUser && specialConfig?.theme === 'archive';
  const isVintage = isSpecialUser && specialConfig?.theme === 'vintage';
  const isArt = isSpecialUser && specialConfig?.theme === 'art';
  const isPancake = isSpecialUser && specialConfig?.theme === 'pancake';
  const isPharmacy = isSpecialUser && specialConfig?.theme === 'pharmacy';
  const isHorn = isSpecialUser && specialConfig?.theme === 'horn';
  const isBook = isSpecialUser && specialConfig?.theme === 'book';
  const isShadowdance = isSpecialUser && specialConfig?.theme === 'shadowdance';
  const isTidal = isSpecialUser && specialConfig?.theme === 'tidal';
  const isRhythm = isSpecialUser && specialConfig?.theme === 'rhythm';
  const isVanish = isSpecialUser && specialConfig?.theme === 'vanish';
  const isWisdom = isSpecialUser && specialConfig?.theme === 'wisdom';
  const isReverse = isSpecialUser && specialConfig?.theme === 'reverse';
  const isDragon = isSpecialUser && specialConfig?.theme === 'dragon';
  const isBlur = isSpecialUser && specialConfig?.theme === 'blur';
  const isElegance = isSpecialUser && specialConfig?.theme === 'elegance';
  const isSky = isSpecialUser && specialConfig?.theme === 'sky';
  const isCat = isSpecialUser && specialConfig?.theme === 'cat';
  const isCasino = isSpecialUser && specialConfig?.theme === 'casino';

  // Fetch member lore and guild stats from API
  const { data: memberLore } = useSWR<Record<string, MemberLoreData>>(
    '/api/lore',
    swrFetcher,
    { refreshInterval: 60000 }
  );



  // Scroll animation hooks
  const quickAccessAnim = useScrollAnimation({ threshold: 0.2 });
  const quickStatsAnim = useScrollAnimation({ threshold: 0.2 });

  // Rotate Guild Pulse cycle every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseCycle(prev => (prev + 1) % 3);
    }, 30000);
    return () => clearInterval(interval);
  }, []);





  return (
    <Stack gap="xl" className="pb-32">
      {/* Hero Section - Guild Welcome */}
      <section className="relative py-6 sm:py-10 md:py-12 overflow-hidden">
        {/* Background Glow Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {isSpecialUser && specialConfig?.theme === 'starlight' ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-purple-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-indigo-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-purple-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '25s' }}></div>
            </>
          ) : isSpecialUser && specialConfig?.theme === 'chaos' ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-orange-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-yellow-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-orange-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '15s' }}></div>
            </>
          ) : isSpecialUser && specialConfig?.theme === 'unstable' ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-teal-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '8s' }}></div>
            </>
          ) : isSpecialUser && specialConfig?.theme === 'portal' ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-indigo-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-violet-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-indigo-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '30s' }}></div>
            </>
          ) : isSpecialUser && specialConfig?.theme === 'grill' ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-red-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-orange-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-red-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '10s' }}></div>
            </>
          ) : isSpecialUser && specialConfig?.theme === 'quantum' ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-cyan-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '20s' }}></div>
            </>
          ) : isCasino ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-red-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-yellow-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-yellow-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '15s' }}></div>
            </>
          ) : isCat ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-purple-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-pink-500/25 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-purple-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '25s' }}></div>
            </>
          ) : isSpecialUser ? (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-accent/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 md:w-[500px] md:h-[500px] bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '20s' }}></div>
            </>
          ) : (
            <>
              <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-primary/20 rounded-full blur-3xl"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96 bg-danger/20 rounded-full blur-3xl"></div>
            </>
          )}
        </div>

        <div className="relative">
          <Stack gap="md" align="center" className="text-center">
            {/* Special user greeting */}
            {isSpecialUser && specialConfig?.customGreeting && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`text-2xl sm:text-3xl md:text-4xl animate-pulse ${
                  specialConfig.theme === 'starlight' ? 'text-purple-400' :
                  specialConfig.theme === 'quantum' ? 'text-cyan-400' : 
                  specialConfig.theme === 'chaos' ? 'text-orange-400' :
                  specialConfig.theme === 'unstable' ? 'text-teal-400' :
                  specialConfig.theme === 'portal' ? 'text-indigo-400' :
                  specialConfig.theme === 'grill' ? 'text-red-400' :
                  specialConfig.theme === 'wrong' ? 'text-yellow-400' :
                  specialConfig.theme === 'chrono' ? 'text-blue-400' :
                  specialConfig.theme === 'nightlight' ? 'text-pink-400' :
                  specialConfig.theme === 'ocean' ? 'text-sky-400' :
                  specialConfig.theme === 'snack' ? 'text-rose-400' :
                  specialConfig.theme === 'royal' ? 'text-violet-400' :
                  specialConfig.theme === 'blade' ? 'text-rose-400' :
                  specialConfig.theme === 'tiger' ? 'text-orange-400' :
                  specialConfig.theme === 'boss' ? 'text-red-400' :
                  specialConfig.theme === 'void' ? 'text-purple-400' :
                  specialConfig.theme === 'meme' ? 'text-cyan-400' :
                  specialConfig.theme === 'shadow' ? 'text-slate-400' :
                  specialConfig.theme === 'neon' ? 'text-green-400' :
                  specialConfig.theme === 'chaoscoin' ? 'text-emerald-400' :
                  specialConfig.theme === 'spoon' ? 'text-slate-400' :
                  specialConfig.theme === 'bureaucracy' ? 'text-slate-400' :
                  specialConfig.theme === 'stats' ? 'text-cyan-400' :
                  specialConfig.theme === 'olympus' ? 'text-yellow-400' :
                  specialConfig.theme === 'weather' ? 'text-sky-400' :
                  specialConfig.theme === 'speed' ? 'text-purple-400' :
                  specialConfig.theme === 'morale' ? 'text-pink-400' :
                  specialConfig.theme === 'recycle' ? 'text-lime-400' :
                  specialConfig.theme === 'abyss' ? 'text-purple-400' :
                  specialConfig.theme === 'chaosgun' ? 'text-violet-400' :
                  specialConfig.theme === 'lightning' ? 'text-yellow-400' :
                  specialConfig.theme === 'sonic' ? 'text-rose-400' :
                  specialConfig.theme === 'archive' ? 'text-stone-400' :
                  specialConfig.theme === 'vintage' ? 'text-amber-400' :
                  specialConfig.theme === 'art' ? 'text-pink-400' :
                  specialConfig.theme === 'pancake' ? 'text-orange-400' :
                  specialConfig.theme === 'pharmacy' ? 'text-cyan-400' :
                  specialConfig.theme === 'horn' ? 'text-fuchsia-400' :
                  specialConfig.theme === 'book' ? 'text-amber-400' :
                  specialConfig.theme === 'shadowdance' ? 'text-blue-400' :
                  specialConfig.theme === 'tidal' ? 'text-teal-400' :
                  specialConfig.theme === 'rhythm' ? 'text-fuchsia-400' :
                  specialConfig.theme === 'vanish' ? 'text-slate-400' :
                  specialConfig.theme === 'wisdom' ? 'text-indigo-400' :
                  specialConfig.theme === 'reverse' ? 'text-green-400' :
                  specialConfig.theme === 'dragon' ? 'text-green-400' :
                  specialConfig.theme === 'blur' ? 'text-purple-400' :
                  specialConfig.theme === 'elegance' ? 'text-pink-400' :
                  specialConfig.theme === 'sky' ? 'text-sky-400' :
                  specialConfig.theme === 'cat' ? 'text-purple-400' :
                  specialConfig.theme === 'casino' ? 'text-red-400' :
                  'text-gold'
                }`}
              >
                {specialConfig.customGreeting}
              </motion.div>
            )}
            {/* Guild Name */}
            <Typography variant="display" className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl ${
              isStarlight ? 'text-purple-300' :
              isQuantum ? 'text-cyan-300' :
              isChaos ? 'text-orange-300' :
              isUnstable ? 'text-teal-300' :
              isPortal ? 'text-indigo-300' :
              isGrill ? 'text-red-300' :
              isWrong ? 'text-yellow-300' :
              isChrono ? 'text-blue-300' :
              isNightlight ? 'text-pink-300' :
              isOcean ? 'text-sky-300' :
              isSnack ? 'text-rose-300' :
              isRoyal ? 'text-violet-300' :
              isBlade ? 'text-rose-300' :
              isTiger ? 'text-orange-300' :
              isBoss ? 'text-red-300' :
              isVoid ? 'text-purple-300' :
              isMeme ? 'text-cyan-300' :
              isShadow ? 'text-slate-300' :
              isNeon ? 'text-green-300' :
              isChaoscoin ? 'text-emerald-300' :
              isSpoon ? 'text-slate-300' :
              isBureaucracy ? 'text-slate-300' :
              isStats ? 'text-cyan-300' :
              isOlympus ? 'text-yellow-300' :
              isWeather ? 'text-sky-300' :
              isSpeed ? 'text-purple-300' :
              isMorale ? 'text-pink-300' :
              isRecycle ? 'text-lime-300' :
              isAbyss ? 'text-purple-300' :
              isChaosgun ? 'text-violet-300' :
              isLightning ? 'text-yellow-300' :
              isSonic ? 'text-rose-300' :
              isArchive ? 'text-stone-300' :
              isVintage ? 'text-amber-300' :
              isArt ? 'text-pink-300' :
              isPancake ? 'text-orange-300' :
              isPharmacy ? 'text-cyan-300' :
              isHorn ? 'text-fuchsia-300' :
              isBook ? 'text-amber-300' :
              isShadowdance ? 'text-blue-300' :
              isTidal ? 'text-teal-300' :
              isRhythm ? 'text-fuchsia-300' :
              isVanish ? 'text-slate-300' :
              isWisdom ? 'text-indigo-300' :
              isReverse ? 'text-green-300' :
              isDragon ? 'text-green-300' :
              isBlur ? 'text-purple-300' :
              isElegance ? 'text-pink-300' :
              isSky ? 'text-sky-300' :
              isCat ? 'text-purple-300' :
              isCasino ? 'text-red-300' :
              'text-gold'
            }`}>
              {isStarlight ? '💜 TENCHU 💜' : 
               isQuantum ? '∞ TENCHU ∞' :
               isChaos ? '🖍️ TENCHU 🖍️' :
               isUnstable ? '❓ TENCHU ❓' :
               isPortal ? '🌀 TENCHU 🌀' :
               isGrill ? '🔥 TENCHU 🔥' :
               isWrong ? '❌ TENCHU ❌' :
               isChrono ? '⏰ TENCHU ⏰' :
               isNightlight ? '🌙 TENCHU 🌙' :
               isOcean ? '🌊 TENCHU 🌊' :
               isSnack ? '🍖 TENCHU 🍖' :
               isRoyal ? '👑 TENCHU 👑' :
               isBlade ? '⚔️ TENCHU ⚔️' :
               isTiger ? '🐯 TENCHU 🐯' :
               isBoss ? '👹 TENCHU 👹' :
               isVoid ? '🕳️ TENCHU 🕳️' :
               isMeme ? '📱 TENCHU 📱' :
               isShadow ? '🌑 TENCHU 🌑' :
               isNeon ? '💚 TENCHU 💚' :
               isChaoscoin ? '💰 TENCHU 💰' :
               isSpoon ? '🥄 TENCHU 🥄' :
               isBureaucracy ? '📋 TENCHU 📋' :
               isStats ? '📊 TENCHU 📊' :
               isOlympus ? '🏛️ TENCHU 🏛️' :
               isWeather ? '🌤️ TENCHU 🌤️' :
               isSpeed ? '⚡ TENCHU ⚡' :
               isMorale ? '💪 TENCHU 💪' :
               isRecycle ? '♻️ TENCHU ♻️' :
               isAbyss ? '😈 TENCHU 😈' :
               isChaosgun ? '🔫 TENCHU 🔫' :
               isLightning ? '⚡ TENCHU ⚡' :
               isSonic ? '🔊 TENCHU 🔊' :
               isArchive ? '📁 TENCHU 📁' :
               isVintage ? '📻 TENCHU 📻' :
               isArt ? '🎨 TENCHU 🎨' :
               isPancake ? '🥞 TENCHU 🥞' :
               isPharmacy ? '💊 TENCHU 💊' :
               isHorn ? '📯 TENCHU 📯' :
               isBook ? '📚 TENCHU 📚' :
               isShadowdance ? '🌑 TENCHU 🌑' :
               isTidal ? '🌊 TENCHU 🌊' :
               isRhythm ? '🎵 TENCHU 🎵' :
               isVanish ? '💨 TENCHU 💨' :
               isWisdom ? '🏛️ TENCHU 🏛️' :
               isReverse ? '🔄 TENCHU 🔄' :
               isDragon ? '🐉 TENCHU 🐉' :
               isBlur ? '💨 TENCHU 💨' :
               isElegance ? '🌸 TENCHU 🌸' :
               isSky ? '🌌 TENCHU 🌌' :
               isCat ? '🐱 TENCHU 🐱' :
               isCasino ? '🎰 TENCHU 🎰' :
               '⚔️ TENCHU'}
            </Typography>
            {/* Special user subtitle */}
            {isSpecialUser && specialConfig?.subtitle ? (
              <Typography variant="h2" className={`text-lg sm:text-xl md:text-2xl ${
                specialConfig.theme === 'starlight' ? 'text-indigo-200' :
                specialConfig.theme === 'quantum' ? 'text-cyan-300' :
                specialConfig.theme === 'chaos' ? 'text-yellow-300' :
                specialConfig.theme === 'unstable' ? 'text-teal-300' :
                specialConfig.theme === 'portal' ? 'text-indigo-300' :
                specialConfig.theme === 'grill' ? 'text-red-300' :
                specialConfig.theme === 'wrong' ? 'text-yellow-300' :
                specialConfig.theme === 'chrono' ? 'text-blue-300' :
                specialConfig.theme === 'nightlight' ? 'text-pink-300' :
                specialConfig.theme === 'ocean' ? 'text-sky-300' :
                specialConfig.theme === 'snack' ? 'text-rose-300' :
                specialConfig.theme === 'royal' ? 'text-violet-300' :
                specialConfig.theme === 'blade' ? 'text-rose-300' :
                specialConfig.theme === 'tiger' ? 'text-orange-300' :
                specialConfig.theme === 'boss' ? 'text-red-300' :
                specialConfig.theme === 'void' ? 'text-purple-300' :
                specialConfig.theme === 'meme' ? 'text-cyan-300' :
                specialConfig.theme === 'shadow' ? 'text-slate-300' :
                specialConfig.theme === 'neon' ? 'text-green-300' :
                specialConfig.theme === 'chaoscoin' ? 'text-emerald-300' :
                specialConfig.theme === 'spoon' ? 'text-slate-300' :
                specialConfig.theme === 'bureaucracy' ? 'text-slate-300' :
                specialConfig.theme === 'stats' ? 'text-cyan-300' :
                specialConfig.theme === 'olympus' ? 'text-yellow-300' :
                specialConfig.theme === 'weather' ? 'text-sky-300' :
                specialConfig.theme === 'speed' ? 'text-purple-300' :
                specialConfig.theme === 'morale' ? 'text-pink-300' :
                specialConfig.theme === 'recycle' ? 'text-lime-300' :
                specialConfig.theme === 'abyss' ? 'text-purple-300' :
                specialConfig.theme === 'chaosgun' ? 'text-violet-300' :
                specialConfig.theme === 'lightning' ? 'text-yellow-300' :
                specialConfig.theme === 'sonic' ? 'text-rose-300' :
                specialConfig.theme === 'archive' ? 'text-stone-300' :
                specialConfig.theme === 'vintage' ? 'text-amber-300' :
                specialConfig.theme === 'art' ? 'text-pink-300' :
                specialConfig.theme === 'pancake' ? 'text-orange-300' :
                specialConfig.theme === 'pharmacy' ? 'text-cyan-300' :
                specialConfig.theme === 'horn' ? 'text-fuchsia-300' :
                specialConfig.theme === 'book' ? 'text-amber-300' :
                specialConfig.theme === 'shadowdance' ? 'text-blue-300' :
                specialConfig.theme === 'tidal' ? 'text-teal-300' :
                specialConfig.theme === 'rhythm' ? 'text-fuchsia-300' :
                specialConfig.theme === 'vanish' ? 'text-slate-300' :
                specialConfig.theme === 'wisdom' ? 'text-indigo-300' :
                specialConfig.theme === 'reverse' ? 'text-green-300' :
                specialConfig.theme === 'dragon' ? 'text-green-300' :
                specialConfig.theme === 'blur' ? 'text-purple-300' :
                specialConfig.theme === 'elegance' ? 'text-pink-300' :
                specialConfig.theme === 'sky' ? 'text-sky-300' :
                specialConfig.theme === 'cat' ? 'text-purple-300' :
                specialConfig.theme === 'casino' ? 'text-red-300' :
                'text-purple-300'
              }`}>
                {specialConfig.subtitle}
              </Typography>
            ) : (
              <Typography variant="h2" className="text-lg sm:text-xl md:text-2xl text-silver">
                {isSpecialUser && specialConfig?.message ? specialConfig.message : 'Where Chaos Becomes Strategy'}
              </Typography>
            )}
            <Typography variant="body" className="text-sm sm:text-base md:text-lg text-gray-300 max-w-3xl italic px-4">
              "Where stupidity becomes genius and friendly fire is tactical."
            </Typography>
            <Typography variant="small" className="text-xs sm:text-sm text-gray-400 px-4">
              Led by Bovo's Vision | Powered by Organized Chaos | Where Legends Are Made
            </Typography>
          </Stack>
        </div>
      </section>

      {/* Quick Access Navigation */}
      <motion.div
        ref={quickAccessAnim.ref as any}
        initial={{ opacity: 0, y: 50 }}
        animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <Section>
          <Grid columns={{ xs: 1, sm: 2, xl: 3 }} gap="md">
            {/* Boss Timers - Only show for members with access */}
            {session?.canAccessBossTimers && (
              <Tooltip content="View and track all boss spawn timers" position="top" fullWidth>
                <motion.a
                  href="/timers"
                  className="block w-full group glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 sm:p-6 hover:border-primary transition-all duration-200 card-3d hover:scale-105 glow-primary"
                  initial={{ opacity: 0, y: 30 }}
                  animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <Icon
                      name="clock"
                      size="2xl"
                      className="text-primary group-hover:text-primary-light transition-all duration-200 group-hover:scale-110 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <Typography variant="h3" className="text-lg sm:text-xl font-bold text-primary-bright break-words">
                        Boss Timers
                      </Typography>
                      <Typography variant="caption" className="text-xs sm:text-sm text-gray-400 break-words">
                        Track spawn times
                      </Typography>
                    </div>
                  </div>
                </motion.a>
              </Tooltip>
            )}

            {/* Event Schedule */}
            <Tooltip content="Browse daily and weekly guild events" position="top" fullWidth>
              <motion.a
                href="/events"
                className="block w-full group glass backdrop-blur-sm rounded-lg border border-accent/30 p-4 sm:p-6 hover:border-accent transition-all duration-200 card-3d hover:scale-105 glow-accent"
                initial={{ opacity: 0, y: 30 }}
                animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.2 }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <Icon
                    name="calendar"
                    size="2xl"
                    className="text-accent group-hover:text-accent-light transition-all duration-200 group-hover:scale-110 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <Typography variant="h3" className="text-lg sm:text-xl font-bold text-accent-bright break-words">
                      Events
                    </Typography>
                    <Typography variant="caption" className="text-xs sm:text-sm text-gray-400 break-words">
                      Daily & weekly events
                    </Typography>
                  </div>
                </div>
              </motion.a>
            </Tooltip>

            {/* Leaderboards */}
            <Tooltip content="View member attendance and points rankings" position="top" fullWidth>
              <motion.a
                href="/leaderboard"
                className="block w-full group glass backdrop-blur-sm rounded-lg border border-accent/30 p-4 sm:p-6 hover:border-accent transition-all duration-200 card-3d hover:scale-105 glow-accent"
                initial={{ opacity: 0, y: 30 }}
                animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.3 }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <Icon
                    name="trophy"
                    size="2xl"
                    className="text-accent group-hover:text-accent-light transition-all duration-200 group-hover:scale-110 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <Typography variant="h3" className="text-lg sm:text-xl font-bold text-accent-bright break-words">
                      Leaderboards
                    </Typography>
                    <Typography variant="caption" className="text-xs sm:text-sm text-gray-400 break-words">
                      View rankings
                    </Typography>
                  </div>
                </div>
              </motion.a>
            </Tooltip>

            {/* Relic Calculator */}
            <Tooltip content="Calculate relic upgrade costs" position="top" fullWidth>
              <motion.a
                href="/relic-calculator"
                className="block w-full group glass backdrop-blur-sm rounded-lg border border-accent/30 p-4 sm:p-6 hover:border-accent transition-all duration-200 card-3d hover:scale-105 glow-accent"
                initial={{ opacity: 0, y: 30 }}
                animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.4 }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <Icon
                    name="calculator"
                    size="2xl"
                    className="text-accent group-hover:text-accent-light transition-all duration-200 group-hover:scale-110 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <Typography variant="h3" className="text-lg sm:text-xl font-bold text-accent-bright break-words">
                      Relic Calculator
                    </Typography>
                    <Typography variant="caption" className="text-xs sm:text-sm text-gray-400 break-words">
                      Calculate upgrade costs
                    </Typography>
                  </div>
                </div>
              </motion.a>
            </Tooltip>

            {/* Mobile App - Only show for members with access */}
            {session?.canAccessBossTimers && (
              <Tooltip content="Download the mobile app for on-the-go access" position="top" fullWidth>
                <motion.a
                href={LINKS.APK_DOWNLOAD}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full group glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 sm:p-6 hover:border-primary transition-all duration-200 card-3d hover:scale-105 glow-primary"
                initial={{ opacity: 0, y: 30 }}
                animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.5 }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <Icon
                    name="smartphone"
                    size="2xl"
                    className="text-primary group-hover:text-primary-light transition-all duration-200 group-hover:scale-110 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <Typography variant="h3" className="text-lg sm:text-xl font-bold text-primary-bright break-words">
                      Mobile App
                    </Typography>
                    <Typography variant="caption" className="text-xs sm:text-sm text-gray-400 break-words">
                      Get the Android app
                    </Typography>
                  </div>
                </div>
              </motion.a>
              </Tooltip>
            )}

            {/* Discord Link */}
            <Tooltip content="Join our Discord community server" position="top" fullWidth>
              <motion.a
                href={LINKS.DISCORD_INVITE}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full group glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 sm:p-6 hover:border-primary transition-all duration-200 card-3d hover:scale-105 glow-primary"
                initial={{ opacity: 0, y: 30 }}
                animate={quickAccessAnim.isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.4 }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <Icon
                    name="discord"
                    size="2xl"
                    className="text-primary group-hover:text-primary-light transition-all duration-200 group-hover:scale-110 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <Typography variant="h3" className="text-lg sm:text-xl font-bold text-primary-bright break-words">
                      Discord
                    </Typography>
                    <Typography variant="caption" className="text-xs sm:text-sm text-gray-400 break-words">
                      Join the community
                    </Typography>
                  </div>
                </div>
              </motion.a>
            </Tooltip>
          </Grid>
        </Section>
      </motion.div>

      {/* Quick Stats - Real-time Data */}
      <motion.div
        ref={quickStatsAnim.ref as any}
        initial={{ opacity: 0, y: 50 }}
        animate={quickStatsAnim.isVisible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <Section>
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={quickStatsAnim.isVisible ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Typography variant="h1" className="text-2xl sm:text-3xl md:text-4xl text-gold mb-6">
              📊 Live Guild Stats
            </Typography>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={quickStatsAnim.isVisible ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <QuickStats />
          </motion.div>
        </Section>
      </motion.div>

      {/* Guild Pulse — Rotating Content Block */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Section>
          <PulseCycle memberLore={memberLore} pulseCycle={pulseCycle} />
        </Section>
      </motion.div>

      {/* About Tenchu — Single Column */}
      <motion.section
        className="py-6 sm:py-8 md:py-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <Section>
          <motion.div
            className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 sm:p-6 card-3d"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Typography variant="h2" className="text-xl sm:text-2xl md:text-3xl text-gold mb-6">
              About Tenchu
            </Typography>
            <Stack gap="md" className="text-gray-300 text-sm sm:text-base">
              <Typography variant="body" className="leading-relaxed">
                We are a guild where impossibilities become strategies. Where a deaf oracle sees everything,
                a vegan grillmaster defends fortresses, and our Chrono-Tactician wins battles by showing up late to yesterday.
              </Typography>
              <Typography variant="body" className="leading-relaxed">
                Led by Bovo&apos;s bold leadership (somehow they work), managed by organized chaos
                and powered by members who turn their failures into legendary victories.
              </Typography>
              <Typography variant="small" className="italic text-primary-bright leading-relaxed">
                &ldquo;The guild where being wrong becomes being right, allergies become weapons, and friendly fire is just tactical positioning.&rdquo;
              </Typography>
              {/* QUOTE OPTION 1: About Section Quote - only for logged-in special user */}
              {isSpecialUser && specialConfig?.quotes?.homeAbout && (
                <Typography variant="small" className={`italic mt-4 text-xs sm:text-sm px-2 ${
                  isStarlight ? 'text-purple-300/70' :
                  isQuantum ? 'text-cyan-400/70' : 'text-cyan-400/70'
                }`}>
                  &ldquo;{specialConfig.quotes.homeAbout}&rdquo;
                </Typography>
              )}
            </Stack>
          </motion.div>
        </Section>
      </motion.section>
    </Stack>
  );
}
