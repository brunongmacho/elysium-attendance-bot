"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import dynamic from "next/dynamic";
import ThemeSelector from "./ThemeSelector";
import NotificationButton from "./NotificationButton";
import Tooltip from "./Tooltip";
import { Icon } from "@/components/icons";
import { useTimer } from "@/contexts/TimerContext";
import { useVisualEffects } from "@/contexts/VisualEffectsContext";
import type { BossTimersResponse } from "@/types/api";
import { swrFetcher } from "@/lib/fetch-utils";
import { ALL_EVENTS } from "@/data/eventSchedules";
import { calculateNextOccurrence } from "@/lib/event-utils";
import { LINKS } from "@/lib/constants";
import { useSpecialUser } from "@/hooks/useSpecialUser";

// Dynamically import LoginModal to prevent SSR hydration issues
const LoginModal = dynamic(() => import("./LoginModal").then(mod => ({ default: mod.LoginModal })), {
  ssr: false,
});

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { currentTime } = useTimer();
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Check for special user (only applies when THIS user is logged in)
  const { isSpecialUser, specialConfig } = useSpecialUser();
  const isQuantum = isSpecialUser && specialConfig?.theme === 'quantum';
  const isUnstable = isSpecialUser && specialConfig?.theme === 'unstable';
  const isStarlight = isSpecialUser && specialConfig?.theme === 'starlight';
  const isChaos = isSpecialUser && specialConfig?.theme === 'chaos';
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

  // Fetch boss timers to show notification badge (only if user can access)
  const { data: bossData } = useSWR<BossTimersResponse>(
    session?.canAccessBossTimers ? '/api/bosses' : undefined,
    swrFetcher,
    { refreshInterval: 30000 }
  );

  // Count spawned bosses
  const spawnedBossCount = bossData?.bosses?.filter(boss => boss.status === 'spawned').length || 0;

  // Count active events
  const activeEventCount = useMemo(() => {
    const now = currentTime;
    let activeCount = 0;

    ALL_EVENTS.forEach((event) => {
      const nextOcc = calculateNextOccurrence(event, now);
      const timeUntil = nextOcc.getTime() - now;
      const eventEndTime = nextOcc.getTime() + (event.durationMinutes * 60 * 1000);

      // Check if currently active
      if (timeUntil < 0 && now < eventEndTime) {
        activeCount++;
      }
    });

    return activeCount;
  }, [currentTime]);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Consolidated event handlers for mobile menu (Escape key and click outside)
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    const handleClickOutside = (event: Event) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest('button[aria-label="Toggle mobile menu"]')
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    // Add all event listeners
    document.addEventListener('keydown', handleEscape);
    // Use capture phase to ensure we catch the event before other handlers
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [isMobileMenuOpen]);

  return (
    <nav className={`glass backdrop-blur-sm border-b sticky top-0 z-50 ${
      isGrill ? 'border-lime-500/20' : isPortal ? 'border-indigo-500/20' : isUnstable ? 'border-teal-500/20' : isQuantum ? 'border-cyan-500/20' : isStarlight ? 'border-purple-500/20' : isChaos ? 'border-orange-500/20' : 'border-primary/20'
    }`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Mobile Logo - Only on mobile */}
          <div className="flex items-center flex-shrink-0 md:hidden">
            <h1 className={`text-xl font-bold ${isGrill ? 'text-lime-300' : isPortal ? 'text-indigo-300' : isUnstable ? 'text-teal-300' : isQuantum ? 'text-cyan-300' : isStarlight ? 'text-purple-300' : isChaos ? 'text-orange-300' : 'text-white'}`}>
              {isGrill ? '🔥 Dashboard' : isPortal ? '🌀 Dashboard' : isUnstable ? '❓ Dashboard' : isQuantum ? '∞ Dashboard' : isStarlight ? '💜 Dashboard' : isChaos ? '🖍️ Dashboard' : isSpecialUser && specialConfig?.customGreeting ? specialConfig.customGreeting : 'Dashboard'}
            </h1>
          </div>

          {/* Desktop Navigation - Centered with proper spacing */}
          <div className="hidden md:flex items-center space-x-1 flex-1 justify-center max-w-5xl mx-auto">
            <NavLink href="/" active={pathname === '/'} icon={<Icon name="home" size="sm" />}>
              Home
            </NavLink>
            {session?.canAccessBossTimers && (
              <NavLink
                href="/timers"
                active={pathname === '/timers'}
                icon={<Icon name="clock" size="sm" />}
                badge={spawnedBossCount > 0 ? spawnedBossCount : undefined}
              >
                Boss Timers
              </NavLink>
            )}
            <NavLink
              href="/events"
              active={pathname === '/events'}
              icon={<Icon name="calendar" size="sm" />}
              badge={activeEventCount > 0 ? activeEventCount : undefined}
            >
              Events
            </NavLink>
            <NavLink href="/leaderboard" active={pathname === '/leaderboard'} icon={<Icon name="trophy" size="sm" />}>
              Leaderboards
            </NavLink>
            <NavLink href="/relic-calculator" active={pathname === '/relic-calculator'} icon={<Icon name="calculator" size="sm" />}>
              Relic Calculator
            </NavLink>
            {session?.canAccessBossTimers && (
              <NavLink 
                href={LINKS.APK_DOWNLOAD} 
                active={false} 
                icon={<Icon name="smartphone" size="sm" />}
                external
              >
                Mobile App
              </NavLink>
            )}
          </div>

          {/* Right Side - Theme & Auth */}
          <div className="hidden md:flex items-center gap-2 lg:gap-3 flex-shrink-0">
            {/* Notification Button */}
            <NotificationButton />

            {/* Animations Toggle */}
            <AnimationsToggle />

            {/* Theme Selector - hidden for special users */}
            {!isSpecialUser && <ThemeSelector />}

            {/* Auth Section */}
            <div className="flex items-center">
              {status === "loading" ? (
                <div className="text-gray-400 text-sm whitespace-nowrap">Loading...</div>
              ) : session ? (
                <div className="flex items-center gap-2">
                  {/* Special user badge - VIP banner for all special themes */}
                  {(isUnstable || isQuantum || isStarlight || isChaos || isPortal || isGrill || isWrong || isChrono || isNightlight || isOcean || isSnack || isRoyal || isBlade || isTiger || isBoss || isVoid || isMeme || isShadow || isNeon || isChaoscoin || isSpoon || isBureaucracy || isStats || isOlympus || isWeather || isSpeed || isMorale || isRecycle || isAbyss || isChaosgun || isLightning || isSonic || isArchive || isVintage || isArt || isPancake || isPharmacy || isHorn || isBook || isShadowdance || isTidal || isRhythm || isVanish || isWisdom || isReverse || isDragon || isBlur || isElegance || isSky) && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`hidden lg:flex items-center gap-1 px-2 py-1 rounded-full ${
                        isChaos 
                          ? 'bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30'
                          : isPortal
                          ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30'
                          : isUnstable
                          ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border border-teal-500/30'
                          : isQuantum 
                          ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30' 
                          : isStarlight
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                          : isGrill
                          ? 'bg-gradient-to-r from-lime-500/20 to-green-500/20 border border-lime-500/30'
                          : isWrong
                          ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30'
                          : isChrono
                          ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30'
                          : isNightlight
                          ? 'bg-gradient-to-r from-pink-500/20 to-yellow-500/20 border border-pink-500/30'
                          : isOcean
                          ? 'bg-gradient-to-r from-sky-500/20 to-cyan-500/20 border border-sky-500/30'
                          : isSnack
                          ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30'
                          : isRoyal
                          ? 'bg-gradient-to-r from-purple-500/20 to-yellow-500/20 border border-purple-500/30'
                          : isBlade
                          ? 'bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30'
                          : isTiger
                          ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30'
                          : isBoss
                          ? 'bg-gradient-to-r from-red-500/20 to-yellow-500/20 border border-red-500/30'
                          : isVoid
                          ? 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30'
                          : isMeme
                          ? 'bg-gradient-to-r from-cyan-500/20 to-pink-500/20 border border-cyan-500/30'
                          : isShadow
                          ? 'bg-gradient-to-r from-slate-500/20 to-indigo-500/20 border border-slate-500/30'
                          : isNeon
                          ? 'bg-gradient-to-r from-green-500/20 to-teal-500/20 border border-green-500/30'
                          : isChaoscoin
                          ? 'bg-gradient-to-r from-amber-500/20 to-lime-500/20 border border-amber-500/30'
                          : isSpoon
                          ? 'bg-gradient-to-r from-slate-400/20 to-white/20 border border-slate-400/30'
                          : isBureaucracy
                          ? 'bg-gradient-to-r from-slate-500/20 to-orange-500/20 border border-slate-500/30'
                          : isStats
                          ? 'bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/30'
                          : isOlympus
                          ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30'
                          : isWeather
                          ? 'bg-gradient-to-r from-sky-500/20 to-purple-500/20 border border-sky-500/30'
                          : isSpeed
                          ? 'bg-gradient-to-r from-yellow-500/20 to-red-500/20 border border-yellow-500/30'
                          : isMorale
                          ? 'bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30'
                          : isRecycle
                          ? 'bg-gradient-to-r from-olive-500/20 to-lime-500/20 border border-olive-500/30'
                          : isAbyss
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                          : isChaosgun
                          ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30'
                          : isLightning
                          ? 'bg-gradient-to-r from-yellow-500/20 to-sky-500/20 border border-yellow-500/30'
                          : isSonic
                          ? 'bg-gradient-to-r from-rose-500/20 to-orange-500/20 border border-rose-500/30'
                          : isArchive
                          ? 'bg-gradient-to-r from-stone-500/20 to-sky-500/20 border border-stone-500/30'
                          : isVintage
                          ? 'bg-gradient-to-r from-amber-700/20 to-yellow-600/20 border border-amber-700/30'
                          : isArt
                          ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30'
                          : isPancake
                          ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30'
                          : isPharmacy
                          ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30'
                          : isHorn
                          ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30'
                          : isBook
                          ? 'bg-gradient-to-r from-amber-800/20 to-yellow-500/20 border border-amber-800/30'
                          : isShadowdance
                          ? 'bg-gradient-to-r from-slate-500/20 to-purple-500/20 border border-slate-500/30'
                          : isTidal
                          ? 'bg-gradient-to-r from-sky-500/20 to-cyan-500/20 border border-sky-500/30'
                          : isRhythm
                          ? 'bg-gradient-to-r from-fuchsia-500/20 to-purple-500/20 border border-fuchsia-500/30'
                          : isVanish
                          ? 'bg-gradient-to-r from-slate-400/20 to-indigo-500/20 border border-slate-400/30'
                          : isWisdom
                          ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30'
                          : isReverse
                          ? 'bg-gradient-to-r from-green-500/20 to-red-500/20 border border-green-500/30'
                          : isDragon
                          ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30'
                          : isBlur
                          ? 'bg-gradient-to-r from-yellow-500/20 to-lime-500/20 border border-yellow-500/30'
                          : isElegance
                          ? 'bg-gradient-to-r from-pink-300/20 to-lavender-500/20 border border-pink-300/30'
                          : isSky
                          ? 'bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-500/30'
                          : 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30'
                      }`}
                    >
                      <span className={isChaos ? 'text-orange-400' : isGrill ? 'text-lime-400' : isPortal ? 'text-indigo-400' : isUnstable ? 'text-teal-400' : isQuantum ? 'text-cyan-400' : isStarlight ? 'text-pink-400' : isWrong ? 'text-yellow-400' : isChrono ? 'text-blue-400' : isNightlight ? 'text-pink-400' : isOcean ? 'text-sky-400' : isSnack ? 'text-amber-400' : isRoyal ? 'text-violet-400' : isBlade ? 'text-rose-400' : isTiger ? 'text-orange-400' : isBoss ? 'text-red-400' : isVoid ? 'text-violet-400' : isMeme ? 'text-cyan-400' : isShadow ? 'text-indigo-400' : isNeon ? 'text-green-400' : isChaoscoin ? 'text-amber-400' : isSpoon ? 'text-slate-300' : isBureaucracy ? 'text-orange-400' : isStats ? 'text-blue-400' : isOlympus ? 'text-yellow-400' : isWeather ? 'text-sky-400' : isSpeed ? 'text-yellow-400' : isMorale ? 'text-orange-400' : isRecycle ? 'text-lime-400' : isAbyss ? 'text-pink-400' : isChaosgun ? 'text-red-400' : isLightning ? 'text-yellow-400' : isSonic ? 'text-rose-400' : isArchive ? 'text-stone-400' : isVintage ? 'text-amber-600' : isArt ? 'text-pink-400' : isPancake ? 'text-amber-400' : isPharmacy ? 'text-cyan-400' : isHorn ? 'text-yellow-400' : isBook ? 'text-amber-700' : isShadowdance ? 'text-indigo-400' : isTidal ? 'text-sky-400' : isRhythm ? 'text-fuchsia-400' : isVanish ? 'text-indigo-400' : isWisdom ? 'text-indigo-400' : isReverse ? 'text-green-400' : isDragon ? 'text-red-400' : isBlur ? 'text-yellow-400' : isElegance ? 'text-pink-300' : isSky ? 'text-sky-400' : 'text-purple-400'}>
                        {isChaos ? '🖍️' : isGrill ? '🔥' : isPortal ? '🌀' : isUnstable ? '❓' : isQuantum ? '∞' : isStarlight ? '💜' : isWrong ? '🔮' : isChrono ? '⏰' : isNightlight ? '🌟' : isOcean ? '⚓' : isSnack ? '🍖' : isRoyal ? '👑' : isBlade ? '⚔️' : isTiger ? '🐯' : isBoss ? '💰' : isVoid ? '🕳️' : isMeme ? '📱' : isShadow ? '🌑' : isNeon ? '💚' : isChaoscoin ? '💸' : isSpoon ? '🥄' : isBureaucracy ? '📋' : isStats ? '📊' : isOlympus ? '🏛️' : isWeather ? '🌤️' : isSpeed ? '⚡' : isMorale ? '💪' : isRecycle ? '♻️' : isAbyss ? '😈' : isChaosgun ? '🎯' : isLightning ? '⚡' : isSonic ? '🔊' : isArchive ? '📁' : isVintage ? '📻' : isArt ? '🎨' : isPancake ? '🥞' : isPharmacy ? '💊' : isHorn ? '📯' : isBook ? '📚' : isShadowdance ? '🌑' : isTidal ? '🌊' : isRhythm ? '🎵' : isVanish ? '💨' : isWisdom ? '🏛️' : isReverse ? '🔄' : isDragon ? '🐉' : isBlur ? '💨' : isElegance ? '🌸' : isSky ? '🌌' : '✨'}
                      </span>
                      <span className={isChaos ? 'text-orange-300' : isGrill ? 'text-lime-300' : isPortal ? 'text-indigo-300' : isUnstable ? 'text-teal-300' : isQuantum ? 'text-cyan-300' : isStarlight ? 'text-purple-300' : isWrong ? 'text-yellow-300' : isChrono ? 'text-blue-300' : isNightlight ? 'text-pink-300' : isOcean ? 'text-sky-300' : isSnack ? 'text-amber-300' : isRoyal ? 'text-violet-300' : isBlade ? 'text-rose-300' : isTiger ? 'text-orange-300' : isBoss ? 'text-red-300' : isVoid ? 'text-violet-300' : isMeme ? 'text-cyan-300' : isShadow ? 'text-indigo-300' : isNeon ? 'text-green-300' : isChaoscoin ? 'text-amber-300' : isSpoon ? 'text-slate-200' : isBureaucracy ? 'text-orange-300' : isStats ? 'text-blue-300' : isOlympus ? 'text-yellow-300' : isWeather ? 'text-sky-300' : isSpeed ? 'text-yellow-300' : isMorale ? 'text-orange-300' : isRecycle ? 'text-lime-300' : isAbyss ? 'text-pink-300' : isChaosgun ? 'text-red-300' : isLightning ? 'text-yellow-300' : isSonic ? 'text-rose-300' : isArchive ? 'text-stone-300' : isVintage ? 'text-amber-200' : isArt ? 'text-pink-300' : isPancake ? 'text-amber-300' : isPharmacy ? 'text-cyan-300' : isHorn ? 'text-yellow-300' : isBook ? 'text-amber-300' : isShadowdance ? 'text-indigo-300' : isTidal ? 'text-sky-300' : isRhythm ? 'text-fuchsia-300' : isVanish ? 'text-indigo-300' : isWisdom ? 'text-indigo-300' : isReverse ? 'text-green-300' : isDragon ? 'text-red-300' : isBlur ? 'text-yellow-300' : isElegance ? 'text-pink-200' : isSky ? 'text-sky-300' : 'text-purple-300'} text-xs font-game>
                        {specialConfig?.badge || 'VIP'}
                      </span>
                    </motion.div>
                  )}
                  {/* User Info - Clickable to Profile */}
                  <a
                    href={`/profile/${session.user?.id}`}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0"
                  >
                    {session.user?.image && (
                      <motion.div
                        animate={isPortal || isUnstable || isQuantum || isStarlight ? { 
                          boxShadow: isPortal 
                            ? ['0 0 5px rgba(99,102,241,0.5)', '0 0 10px rgba(139,92,246,0.5)', '0 0 5px rgba(99,102,241,0.5)']
                            : isUnstable 
                            ? ['0 0 5px rgba(20,184,166,0.5)', '0 0 10px rgba(45,212,191,0.5)', '0 0 5px rgba(20,184,166,0.5)']
                            : isQuantum 
                            ? ['0 0 5px rgba(6,182,212,0.5)', '0 0 10px rgba(168,85,247,0.5)', '0 0 5px rgba(6,182,212,0.5)']
                            : ['0 0 5px rgba(168,85,247,0.5)', '0 0 10px rgba(199,210,254,0.5)', '0 0 5px rgba(168,85,247,0.5)']
                        } : {}}
                        transition={isPortal || isUnstable || isQuantum || isStarlight ? { duration: 3, repeat: Infinity } : {}}
                        className="relative"
                      >
                        <Image
                          src={session.user.image}
                          alt={session.user.name || "User"}
                          width={32}
                          height={32}
                          className={`rounded-full flex-shrink-0 ${isGrill ? 'ring-2 ring-lime-500/50' : isPortal ? 'ring-2 ring-indigo-500/50' : isUnstable ? 'ring-2 ring-teal-500/50' : isQuantum ? 'ring-2 ring-cyan-500/50' : isStarlight ? 'ring-2 ring-purple-500/50' : ''}`}
                        />
                      </motion.div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className={`text-sm font-medium hover:transition-colors truncate max-w-[120px] lg:max-w-none ${
                        isChaos ? 'text-orange-300 hover:text-orange-200' :
                        isGrill ? 'text-lime-300 hover:text-lime-200' :
                        isPortal ? 'text-indigo-300 hover:text-indigo-200' :
                        isUnstable ? 'text-teal-300 hover:text-teal-200' :
                        isQuantum ? 'text-cyan-300 hover:text-cyan-200' : 
                        isStarlight ? 'text-purple-300 hover:text-purple-200' : 
                        'text-white hover:text-primary'
                      }`}>
                        {session.user?.name}
                      </span>
                      {!session.isInGuild && (
                        <span className="text-danger text-xs whitespace-nowrap">
                          Not in guild
                        </span>
                      )}
                      {session.roleBadge && (
                        <span className={`text-xs whitespace-nowrap ${isGrill ? 'text-green-400' : isPortal ? 'text-violet-400' : isUnstable ? 'text-cyan-400' : isQuantum ? 'text-purple-400' : isStarlight ? 'text-indigo-400' : 'text-success'}`}>
                          {session.roleBadge}
                        </span>
                      )}
                    </div>
                  </a>

                  {/* Sign Out Button */}
                  <button
                    onClick={() => signOut()}
                    className="text-gray-300 hover:text-white px-2 lg:px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="group flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-3 lg:px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign in
                </button>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <Icon name="close" size="lg" />
            ) : (
              <Icon name="menu" size="lg" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Mobile menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            ref={mobileMenuRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="md:hidden border-t border-primary/20 overflow-hidden relative z-50"
          >
            <motion.div
              initial={{ y: -20 }}
              animate={{ y: 0 }}
              exit={{ y: -20 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="px-2 pt-2 pb-3 space-y-1 glass backdrop-blur-sm"
            >
              <MobileNavLink href="/" active={pathname === '/'} icon={<Icon name="home" size="sm" />}>
                Home
              </MobileNavLink>
              {session?.canAccessBossTimers && (
                <MobileNavLink
                  href="/timers"
                  active={pathname === '/timers'}
                  icon={<Icon name="clock" size="sm" />}
                  badge={spawnedBossCount > 0 ? spawnedBossCount : undefined}
                >
                  Boss Timers
                </MobileNavLink>
              )}
              <MobileNavLink
                href="/events"
                active={pathname === '/events'}
                icon={<Icon name="calendar" size="sm" />}
                badge={activeEventCount > 0 ? activeEventCount : undefined}
              >
                Events
              </MobileNavLink>
              <MobileNavLink href="/leaderboard" active={pathname === '/leaderboard'} icon={<Icon name="trophy" size="sm" />}>
                Leaderboards
              </MobileNavLink>
              <MobileNavLink href="/relic-calculator" active={pathname === '/relic-calculator'} icon={<Icon name="calculator" size="sm" />}>
                Relic Calculator
              </MobileNavLink>
              {session?.canAccessBossTimers && (
                <MobileNavLink href={LINKS.APK_DOWNLOAD} active={false} icon={<Icon name="smartphone" size="sm" />} external>
                  Get Mobile App
                </MobileNavLink>
              )}

            {/* Notification, Animations Toggle & Theme */}
            <div className="px-3 py-2 flex items-center gap-3">
              <NotificationButton />
              <AnimationsToggle />
              {!isSpecialUser && <ThemeSelector />}
            </div>

            {/* Auth Section Mobile */}
            <div className="border-t border-primary/20 pt-4">
              {status === "loading" ? (
                <div className="px-3 text-gray-400 text-sm">Loading...</div>
              ) : session ? (
                <div className="space-y-3">
                  {/* User Profile Link */}
                  <a
                    href={`/profile/${session.user?.id}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-700 rounded-md transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {session.user?.image && (
                      <Image
                        src={session.user.image}
                        alt={session.user?.name || "User"}
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="text-white text-base font-medium">
                        {session.user?.name}
                      </span>
                      {!session.isInGuild && (
                        <span className="text-danger text-xs">
                          Not in guild
                        </span>
                      )}
                      {session.roleBadge && (
                        <span className="text-success text-xs">
                          {session.roleBadge}
                        </span>
                      )}
                    </div>
                  </a>

                  {/* Sign Out Button */}
                  <button
                    onClick={() => {
                      signOut();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left text-gray-300 hover:text-white px-3 py-2 rounded-md text-base font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsLoginModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="group w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-3 rounded-md text-base font-medium transition-colors"
                >
                  <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign in
                </button>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </nav>
  );
}

// Desktop NavLink Component with subtle animations
interface NavLinkProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
  external?: boolean;
}

function NavLink({ href, active, icon, badge, children, external }: NavLinkProps) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`
        relative group flex items-center gap-2 px-2 py-2 rounded-md text-sm font-medium font-game whitespace-nowrap
        transition-all duration-200
        ${active
          ? 'text-primary-bright bg-primary/10'
          : 'text-gray-300 hover:text-primary-light hover:bg-gray-800/50'
        }
      `}
      aria-current={active ? 'page' : undefined}
    >
      <span className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </span>
      <span className="relative">
        {children}
        {/* Subtle underline animation */}
        <span
          className={`
            absolute -bottom-1 left-0 h-0.5 bg-primary
            transition-all duration-300 ease-out
            ${active ? 'w-full' : 'w-0 group-hover:w-full'}
          `}
        />
      </span>
      {badge !== undefined && badge > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 bg-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-lg shadow-danger/50"
        >
          {badge > 9 ? '9+' : badge}
        </motion.span>
      )}
    </a>
  );
}

// Mobile NavLink Component
function MobileNavLink({ href, active, icon, badge, children, external }: NavLinkProps) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`
        relative flex items-center gap-3 px-3 py-2.5 rounded-md text-base font-medium font-game
        transition-all duration-200
        ${active
          ? 'text-primary-bright bg-primary/10 border-l-4 border-primary'
          : 'text-gray-300 hover:text-white hover:bg-gray-700/50 border-l-4 border-transparent'
        }
      `}
      aria-current={active ? 'page' : undefined}
    >
      <span className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-danger text-white text-xs rounded-full px-2 py-0.5 font-bold shadow-lg shadow-danger/50">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </a>
  );
}

// Animations Toggle Component
function AnimationsToggle() {
  const { animationsEnabled, setAnimationsEnabled, isLoaded } = useVisualEffects();

  return (
    <Tooltip content={animationsEnabled ? "Disable animations" : "Enable animations"} position="bottom">
      <button
        onClick={() => setAnimationsEnabled(!animationsEnabled)}
        disabled={!isLoaded}
        className={`
          relative p-2 rounded-md flex-shrink-0
          ${!isLoaded ? "opacity-50 cursor-wait" : ""}
          ${animationsEnabled
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
          }
        `}
        aria-label={animationsEnabled ? "Disable animations" : "Enable animations"}
        aria-pressed={animationsEnabled}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {animationsEnabled ? (
            // Play icon (animations enabled)
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          ) : (
            // Pause icon (animations disabled)
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
      </button>
    </Tooltip>
  );
}

