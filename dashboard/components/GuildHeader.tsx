"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { guildTheme } from "@/lib/theme";
import { useSpecialUser } from "@/hooks/useSpecialUser";

export default function GuildHeader() {
  const { isSpecialUser, specialConfig } = useSpecialUser();

  const isQuantum = isSpecialUser && specialConfig?.theme === 'quantum';
  const isStarlight = isSpecialUser && specialConfig?.theme === 'starlight';
  const isChaos = isSpecialUser && specialConfig?.theme === 'chaos';
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

  return (
    <div className="relative overflow-hidden">
      {/* Animated background */}
      <div className={`absolute inset-0 animated-gradient opacity-50`} />

      {/* Special user gradient overlay */}
      {isQuantum && (
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/20 via-transparent to-purple-900/20" />
      )}
      {isStarlight && (
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-indigo-900/20" />
      )}
      {isUnstable && (
        <div className="absolute inset-0 bg-gradient-to-b from-teal-900/20 via-transparent to-cyan-900/20" />
      )}
      {isPortal && (
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 via-transparent to-violet-900/20" />
      )}
      {isGrill && (
        <div className="absolute inset-0 bg-gradient-to-b from-lime-900/20 via-transparent to-green-900/20" />
      )}
      {isWrong && (
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-900/20 via-transparent to-orange-900/20" />
      )}
      {isChrono && (
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-transparent to-indigo-900/20" />
      )}
      {isNightlight && (
        <div className="absolute inset-0 bg-gradient-to-b from-pink-900/20 via-transparent to-yellow-900/20" />
      )}
      {isOcean && (
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/20 via-transparent to-cyan-900/20" />
      )}
      {isSnack && (
        <div className="absolute inset-0 bg-gradient-to-b from-amber-900/20 via-transparent to-yellow-900/20" />
      )}
      {isRoyal && (
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-violet-900/20" />
      )}
      {isBlade && (
        <div className="absolute inset-0 bg-gradient-to-b from-rose-900/20 via-transparent to-pink-900/20" />
      )}
      {isTiger && (
        <div className="absolute inset-0 bg-gradient-to-b from-orange-900/20 via-transparent to-amber-900/20" />
      )}
      {isShadowdance && (
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/30 via-transparent to-yellow-900/20" />
      )}
      {isBoss && (
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/20 via-transparent to-yellow-900/20" />
      )}
      {isVoid && (
        <div className="absolute inset-0 bg-gradient-to-b from-violet-900/20 via-transparent to-purple-900/20" />
      )}
      {isMeme && (
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/20 via-transparent to-pink-900/20" />
      )}
      {isShadow && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-800/30 via-transparent to-yellow-900/20" />
      )}
      {isNeon && (
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/20 via-transparent to-teal-900/20" />
      )}
      {isChaoscoin && (
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/20 via-transparent to-green-900/20" />
      )}
      {isSpoon && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-600/20 via-transparent to-slate-400/20" />
      )}
      {isBureaucracy && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-700/20 via-transparent to-orange-900/20" />
      )}
      {isStats && (
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/20 via-transparent to-cyan-700/20" />
      )}
      {isOlympus && (
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-900/20 via-transparent to-amber-900/20" />
      )}
      {isWeather && (
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/20 via-transparent to-purple-900/20" />
      )}
      {isSpeed && (
        <div className="absolute inset-0 bg-gradient-to-b from-violet-900/20 via-transparent to-fuchsia-900/20" />
      )}
      {isMorale && (
        <div className="absolute inset-0 bg-gradient-to-b from-pink-900/20 via-transparent to-yellow-900/20" />
      )}
      {isRecycle && (
        <div className="absolute inset-0 bg-gradient-to-b from-lime-900/20 via-transparent to-green-900/20" />
      )}
      {isAbyss && (
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-pink-900/20" />
      )}
      {isChaosgun && (
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-rose-900/20" />
      )}
      {isLightning && (
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-900/20 via-transparent to-sky-900/20" />
      )}
      {isSonic && (
        <div className="absolute inset-0 bg-gradient-to-b from-rose-900/20 via-transparent to-orange-900/20" />
      )}
      {isArchive && (
        <div className="absolute inset-0 bg-gradient-to-b from-stone-700/20 via-transparent to-sky-900/20" />
      )}
      {isVintage && (
        <div className="absolute inset-0 bg-gradient-to-b from-amber-900/20 via-transparent to-yellow-900/20" />
      )}
      {isArt && (
        <div className="absolute inset-0 bg-gradient-to-b from-pink-900/20 via-transparent to-purple-900/20" />
      )}
      {isPancake && (
        <div className="absolute inset-0 bg-gradient-to-b from-orange-900/20 via-transparent to-peach-900/20" />
      )}
      {isPharmacy && (
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/20 via-transparent to-emerald-900/20" />
      )}
      {isHorn && (
        <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-900/20 via-transparent to-pink-900/20" />
      )}
      {isBook && (
        <div className="absolute inset-0 bg-gradient-to-b from-amber-900/20 via-transparent to-yellow-900/20" />
      )}
      {isTidal && (
        <div className="absolute inset-0 bg-gradient-to-b from-teal-900/20 via-transparent to-cyan-900/20" />
      )}
      {isRhythm && (
        <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-900/20 via-transparent to-purple-900/20" />
      )}
      {isVanish && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-600/20 via-transparent to-indigo-900/20" />
      )}
      {isWisdom && (
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 via-transparent to-violet-900/20" />
      )}
      {isReverse && (
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/20 via-transparent to-red-900/20" />
      )}
      {isDragon && (
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/20 via-transparent to-orange-900/20" />
      )}
      {isBlur && (
        <div className="absolute inset-0 bg-gradient-to-b from-purple-400/20 via-transparent to-pink-900/20" />
      )}
      {isElegance && (
        <div className="absolute inset-0 bg-gradient-to-b from-pink-300/20 via-transparent to-purple-900/20" />
      )}
      {isSky && (
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/20 via-transparent to-indigo-900/20" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/50 to-gray-900" />

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
          {/* Guild branding */}
          <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 w-full md:w-auto">
            {/* Guild icon with glow */}
            <div className="relative flex-shrink-0">
              <motion.div 
                animate={isWrong ? { 
                  boxShadow: ['0 0 20px rgba(234,179,8,0.5)', '0 0 40px rgba(249,115,22,0.5)', '0 0 20px rgba(234,179,8,0.5)']
                } : isChrono ? { 
                  boxShadow: ['0 0 20px rgba(59,130,246,0.5)', '0 0 40px rgba(99,102,241,0.5)', '0 0 20px rgba(59,130,246,0.5)']
                } : isNightlight ? { 
                  boxShadow: ['0 0 20px rgba(244,114,182,0.5)', '0 0 40px rgba(253,224,71,0.5)', '0 0 20px rgba(244,114,182,0.5)']
                } : isOcean ? { 
                  boxShadow: ['0 0 20px rgba(14,165,233,0.5)', '0 0 40px rgba(6,182,212,0.5)', '0 0 20px rgba(14,165,233,0.5)']
                } : isGrill ? { 
                  boxShadow: ['0 0 20px rgba(132,204,22,0.5)', '0 0 40px rgba(34,197,94,0.5)', '0 0 20px rgba(132,204,22,0.5)']
                } : isPortal ? { 
                  boxShadow: ['0 0 20px rgba(99,102,241,0.5)', '0 0 40px rgba(139,92,246,0.5)', '0 0 20px rgba(99,102,241,0.5)']
                } : isUnstable ? { 
                  boxShadow: ['0 0 20px rgba(20,184,166,0.5)', '0 0 40px rgba(45,212,191,0.5)', '0 0 20px rgba(20,184,166,0.5)']
                } : isQuantum ? { 
                  boxShadow: ['0 0 20px rgba(6,182,212,0.5)', '0 0 40px rgba(168,85,247,0.5)', '0 0 20px rgba(6,182,212,0.5)']
                } : isSnack ? { 
                  boxShadow: ['0 0 20px rgba(180,83,9,0.5)', '0 0 40px rgba(245,158,11,0.5)', '0 0 20px rgba(180,83,9,0.5)']
                } : isRoyal ? { 
                  boxShadow: ['0 0 20px rgba(124,58,237,0.5)', '0 0 40px rgba(251,191,36,0.5)', '0 0 20px rgba(124,58,237,0.5)']
                } : isBlade ? { 
                  boxShadow: ['0 0 20px rgba(190,18,60,0.5)', '0 0 40px rgba(251,113,133,0.5)', '0 0 20px rgba(190,18,60,0.5)']
                } : isTiger ? { 
                  boxShadow: ['0 0 20px rgba(234,88,12,0.5)', '0 0 40px rgba(251,191,36,0.5)', '0 0 20px rgba(234,88,12,0.5)']
                } : isShadowdance ? { 
                  boxShadow: ['0 0 20px rgba(30,58,138,0.6)', '0 0 40px rgba(251,191,36,0.5)', '0 0 20px rgba(30,58,138,0.6)']
                } : {}}
                transition={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isSnack || isRoyal || isBlade || isTiger || isShadowdance || isBoss || isVoid || isMeme || isShadow || isNeon || isChaoscoin || isSpoon || isBureaucracy ? { duration: 4, repeat: Infinity } : {}}
                className={`absolute inset-0 rounded-full blur-xl opacity-50 ${isWrong ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : isChrono ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : isNightlight ? 'bg-gradient-to-r from-pink-500 to-yellow-500' : isOcean ? 'bg-gradient-to-r from-sky-500 to-cyan-500' : isGrill ? 'bg-gradient-to-r from-lime-500 to-green-500' : isPortal ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : isUnstable ? 'bg-gradient-to-r from-teal-500 to-cyan-500' : isQuantum ? 'bg-gradient-to-r from-cyan-500 to-purple-500' : isSnack ? 'bg-gradient-to-r from-amber-600 to-yellow-500' : isRoyal ? 'bg-gradient-to-r from-purple-500 to-amber-400' : isBlade ? 'bg-gradient-to-r from-rose-600 to-pink-500' : isTiger ? 'bg-gradient-to-r from-orange-500 to-amber-400' : isShadowdance ? 'bg-gradient-to-r from-blue-700 to-yellow-500' : 'bg-primary'}`}
              />
              <div className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 ${isWrong ? 'border-yellow-500/50 shadow-2xl' : isChrono ? 'border-blue-500/50 shadow-2xl' : isNightlight ? 'border-pink-500/50 shadow-2xl' : isOcean ? 'border-sky-500/50 shadow-2xl' : isGrill ? 'border-lime-500/50 shadow-2xl' : isPortal ? 'border-indigo-500/50 shadow-2xl' : isUnstable ? 'border-teal-500/50 shadow-2xl' : isQuantum ? 'border-cyan-500/50 shadow-2xl' : isStarlight ? 'border-purple-500/50 shadow-2xl' : isChaos ? 'border-orange-500/50 shadow-2xl' : isSnack ? 'border-amber-500/50 shadow-2xl' : isRoyal ? 'border-purple-500/50 shadow-2xl' : isBlade ? 'border-rose-500/50 shadow-2xl' : isTiger ? 'border-orange-500/50 shadow-2xl' : isShadowdance ? 'border-blue-600/50 shadow-2xl' : 'border-primary/50 shadow-2xl'}`}>
                <Image
                  src={guildTheme.branding.logo}
                  alt={guildTheme.branding.name}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            {/* Guild name and tagline */}
            <div className="text-center sm:text-left flex-1">
              <motion.h1 
                animate={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger || isShadowdance ? { 
                  textShadow: isChaos ? 
                    ['0 0 10px rgba(249,115,22,0.7)', '0 0 20px rgba(234,179,8,0.7)', '0 0 10px rgba(249,115,22,0.7)'] :
                    isStarlight ? 
                    ['0 0 10px rgba(168,85,247,0.7)', '0 0 20px rgba(199,210,254,0.7)', '0 0 30px rgba(232,121,249,0.7)', '0 0 10px rgba(168,85,247,0.7)'] :
                    isUnstable ?
                    ['0 0 10px rgba(20,184,166,0.5)', '0 0 20px rgba(45,212,191,0.5)', '0 0 10px rgba(20,184,166,0.5)'] :
                    isPortal ?
                    ['0 0 10px rgba(99,102,241,0.5)', '0 0 20px rgba(139,92,246,0.5)', '0 0 10px rgba(99,102,241,0.5)'] :
                    isGrill ?
                    ['0 0 10px rgba(132,204,22,0.5)', '0 0 20px rgba(34,197,94,0.5)', '0 0 10px rgba(132,204,22,0.5)'] :
                    isWrong ?
                    ['0 0 10px rgba(234,179,8,0.5)', '0 0 20px rgba(249,115,22,0.5)', '0 0 10px rgba(234,179,8,0.5)'] :
                    isChrono ?
                    ['0 0 10px rgba(59,130,246,0.5)', '0 0 20px rgba(99,102,241,0.5)', '0 0 10px rgba(59,130,246,0.5)'] :
                    isNightlight ?
                    ['0 0 10px rgba(244,114,182,0.5)', '0 0 20px rgba(253,224,71,0.5)', '0 0 10px rgba(244,114,182,0.5)'] :
                    isOcean ?
                    ['0 0 10px rgba(14,165,233,0.5)', '0 0 20px rgba(6,182,212,0.5)', '0 0 10px rgba(14,165,233,0.5)'] :
                    isShadowdance ?
                    ['0 0 10px rgba(30,58,138,0.6)', '0 0 20px rgba(251,191,36,0.5)', '0 0 10px rgba(30,58,138,0.6)'] :
                    ['0 0 10px rgba(6,182,212,0.5)', '0 0 20px rgba(168,85,247,0.5)', '0 0 10px rgba(6,182,212,0.5)']
                } : {}}
                transition={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger ? { duration: 4, repeat: Infinity } : {}}
                className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-rpg-title mb-1 md:mb-2 leading-tight ${
                  isWrong ? 'text-yellow-300' : isChrono ? 'text-blue-300' : isNightlight ? 'text-pink-300' : isOcean ? 'text-sky-300' : isGrill ? 'text-lime-300' : isPortal ? 'text-indigo-300' : isUnstable ? 'text-teal-300' : isQuantum ? 'text-cyan-300' : isStarlight ? 'text-purple-200' : isChaos ? 'text-orange-300' : isSnack ? 'text-amber-300' : isRoyal ? 'text-purple-200' : isBlade ? 'text-rose-300' : isTiger ? 'text-orange-300' : 'text-gold'
                }`}
              >
                {isWrong ? '🔮 ELYSIUM 🔮' : isChrono ? '⏰ ELYSIUM ⏰' : isNightlight ? '🌟 ELYSIUM 🌟' : isOcean ? '⚓ ELYSIUM ⚓' : isGrill ? '🔥 ELYSIUM 🔥' : isPortal ? '🌀 ELYSIUM 🌀' : isUnstable ? '❓ ELYSIUM ❓' : isQuantum ? '∞ ELYSIUM ∞' : isStarlight ? '💜 ELYSIUM 💜' : isChaos ? '🖍️ ELYSIUM 🖍️' : isSnack ? '🍖 ELYSIUM 🍖' : isRoyal ? '👑 ELYSIUM 👑' : isBlade ? '⚔️ ELYSIUM ⚔️' : isTiger ? '🐯 ELYSIUM 🐯' : guildTheme.branding.name}
              </motion.h1>
              <p className={`text-base sm:text-lg md:text-xl font-game ${
                isWrong ? 'text-amber-300' : isChrono ? 'text-indigo-300' : isNightlight ? 'text-yellow-300' : isOcean ? 'text-cyan-300' : isGrill ? 'text-green-300' : isPortal ? 'text-violet-300' : isUnstable ? 'text-cyan-300' : isQuantum ? 'text-purple-300' : isStarlight ? 'text-indigo-200' : isChaos ? 'text-yellow-300' : isSnack ? 'text-amber-200' : isRoyal ? 'text-violet-200' : isBlade ? 'text-rose-200' : isTiger ? 'text-orange-200' : 'text-silver'
              }`}>
                {specialConfig?.message || guildTheme.branding.tagline}
              </p>
              {(isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger) && specialConfig?.subtitle && (
                <p className={`text-sm font-game mt-1 ${
                  isChaos ? 'text-orange-400/80' : isWrong ? 'text-yellow-400/80' : isChrono ? 'text-blue-400/80' : isNightlight ? 'text-pink-400/80' : isOcean ? 'text-sky-400/80' : isGrill ? 'text-lime-400/80' : isPortal ? 'text-violet-400/80' : isUnstable ? 'text-teal-400/80' : isQuantum ? 'text-cyan-400/80' : 'text-purple-300/80'
                }`}>
                  {specialConfig.subtitle}
                </p>
              )}
              {/* Extra quote for starlight theme (AlterFrieren) */}
              {isStarlight && specialConfig?.extraQuotes?.subtitle && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 1 }}
                  className="text-xs text-purple-400/60 italic mt-2 font-game"
                >
                  {specialConfig.extraQuotes.subtitle}
                </motion.p>
              )}
            </div>
          </div>

          {/* Optional: Quick stats or motto */}
          <div className={`hidden lg:block glass rounded-lg p-4 ${isWrong ? 'border-yellow-500/30' : isChrono ? 'border-blue-500/30' : isNightlight ? 'border-pink-500/30' : isOcean ? 'border-sky-500/30' : isGrill ? 'border-lime-500/30' : isPortal ? 'border-indigo-500/30' : isUnstable ? 'border-teal-500/30' : isQuantum ? 'border-cyan-500/30' : isStarlight ? 'border-purple-500/30' : isChaos ? 'border-orange-500/30' : isSnack ? 'border-amber-500/30' : isRoyal ? 'border-purple-500/30' : isBlade ? 'border-rose-500/30' : isTiger ? 'border-orange-500/30' : isBoss ? 'border-red-500/30' : isVoid ? 'border-violet-500/30' : isMeme ? 'border-cyan-500/30' : isShadow ? 'border-slate-500/30' : isNeon ? 'border-green-500/30' : isChaoscoin ? 'border-amber-500/30' : isSpoon ? 'border-slate-400/30' : isBureaucracy ? 'border-slate-500/30' : 'border-primary/30'}`}>
            <div className="flex items-center gap-3">
              <div className="text-center px-4 border-r border-gray-600">
                <motion.div 
                  animate={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger ? { scale: [1, 1.1, 1] } : {}}
                  transition={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger ? { duration: 2, repeat: Infinity } : {}}
                  className={`text-2xl font-bold font-game-decorative ${isChaos ? 'text-orange-400' : isWrong ? 'text-yellow-400' : isChrono ? 'text-blue-400' : isNightlight ? 'text-pink-400' : isOcean ? 'text-sky-400' : isGrill ? 'text-lime-400' : isPortal ? 'text-indigo-400' : isUnstable ? 'text-teal-400' : isQuantum ? 'text-cyan-400' : isStarlight ? 'text-purple-400' : isSnack ? 'text-amber-400' : isRoyal ? 'text-violet-400' : isBlade ? 'text-rose-400' : isTiger ? 'text-orange-400' : 'text-primary'}`}
                >
                  {isWrong ? '🔮' : isChrono ? '⏰' : isNightlight ? '🌟' : isOcean ? '⚓' : isGrill ? '🔥' : isPortal ? '🌀' : isUnstable ? '❓' : isQuantum ? '∞' : isStarlight ? '💜' : isSnack ? '🍖' : isRoyal ? '👑' : isBlade ? '⚔️' : isTiger ? '🐯' : '✨'}
                </motion.div>
                <div className="text-xs text-gray-400 font-game">Active</div>
              </div>
              <div className="text-center px-4 border-r border-gray-600">
                <motion.div 
                  animate={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger ? { rotate: [0, 360] } : {}}
                  transition={isWrong || isChrono || isNightlight || isOcean || isGrill || isPortal || isUnstable || isQuantum || isStarlight || isChaos || isSnack || isRoyal || isBlade || isTiger ? { duration: 10, repeat: Infinity, ease: 'linear' } : {}}
                  className={`text-2xl font-bold font-game-decorative ${isChaos ? 'text-yellow-400' : isWrong ? 'text-amber-400' : isChrono ? 'text-indigo-400' : isNightlight ? 'text-yellow-400' : isOcean ? 'text-cyan-400' : isGrill ? 'text-green-400' : isPortal ? 'text-violet-400' : isStarlight ? 'text-indigo-400' : isUnstable ? 'text-cyan-400' : isQuantum ? 'text-purple-400' : isSnack ? 'text-amber-400' : isRoyal ? 'text-purple-400' : isBlade ? 'text-rose-400' : isTiger ? 'text-orange-400' : 'text-accent'}`}
                >
                  ⚔️
                </motion.div>
                <div className="text-xs text-gray-400 font-game">Victories</div>
              </div>
              <div className="text-center px-4">
                <div className={`text-2xl font-bold font-game-decorative ${isChaos ? 'text-orange-400' : isWrong ? 'text-yellow-400' : isChrono ? 'text-blue-400' : isNightlight ? 'text-pink-400' : isOcean ? 'text-sky-400' : isGrill ? 'text-green-400' : isPortal ? 'text-indigo-400' : isStarlight ? 'text-purple-400' : isUnstable ? 'text-teal-400' : isQuantum ? 'text-cyan-400' : isSnack ? 'text-amber-400' : isRoyal ? 'text-violet-400' : isBlade ? 'text-rose-400' : isTiger ? 'text-orange-400' : 'text-success'}`}>
                  🏆
                </div>
                <div className="text-xs text-gray-400 font-game">Glory</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom border with gradient */}
      <div className={`h-1 bg-gradient-to-r from-transparent ${
        isWrong ? 'via-yellow-500 to-orange-500' : 
        isChrono ? 'via-blue-500 to-indigo-500' : 
        isNightlight ? 'via-pink-500 to-yellow-500' : 
        isOcean ? 'via-sky-500 to-cyan-500' : 
        isGrill ? 'via-lime-500 to-green-500' : 
        isPortal ? 'via-indigo-500 to-violet-500' : 
        isUnstable ? 'via-teal-500 to-cyan-500' : 
        isQuantum ? 'via-cyan-500 to-purple-500' : 
        isStarlight ? 'via-purple-500 to-indigo-500' : 
        isChaos ? 'via-orange-500 to-yellow-500' : 
        isSnack ? 'via-amber-500 to-yellow-500' : 
        isRoyal ? 'via-purple-500 to-violet-500' : 
        isBlade ? 'via-rose-500 to-pink-500' : 
        isTiger ? 'via-orange-500 to-amber-500' : 
        'via-primary'
      } to-transparent`} />
    </div>
  );
}
