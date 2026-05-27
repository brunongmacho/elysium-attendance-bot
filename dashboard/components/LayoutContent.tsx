/**
 * LayoutContent Component
 * Client-side layout content with theme-aware features
 */

'use client'

import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import Navbar from '@/components/Navbar'
import GuildHeader from '@/components/GuildHeader'
import BackToTop from '@/components/BackToTop'
import Footer from '@/components/Footer'
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers'
import { useSpecialUser } from '@/hooks/useSpecialUser'
import { Typography } from '@/components/ui'

// Lazy load BackgroundParticles for performance - reduces initial bundle size
const BackgroundParticles = dynamic(
  () => import('@/components/BackgroundParticles').then(mod => ({ default: mod.BackgroundParticles })),
  { ssr: false }
)

interface LayoutContentProps {
  children: ReactNode
}

export function LayoutContent({ children }: LayoutContentProps) {
  // Enable notification triggers
  useNotificationTriggers()

  // Check for special user (only applies when THIS user is logged in)
  const { isSpecialUser, specialConfig } = useSpecialUser()

  // Check for specific themes
  const isQuantumTheme = isSpecialUser && specialConfig?.theme === 'quantum'
  const isStarlightTheme = isSpecialUser && specialConfig?.theme === 'starlight'
  const isPortalTheme = isSpecialUser && specialConfig?.theme === 'portal'
  const isChronoTheme = isSpecialUser && specialConfig?.theme === 'chrono'
  const isRoyalTheme = isSpecialUser && specialConfig?.theme === 'royal'
  const isBossTheme = isSpecialUser && specialConfig?.theme === 'boss'
  const isVoidTheme = isSpecialUser && specialConfig?.theme === 'void'
  const isShadowTheme = isSpecialUser && specialConfig?.theme === 'shadow'
  const isSpoonTheme = isSpecialUser && specialConfig?.theme === 'spoon'
  const isBureaucracyTheme = isSpecialUser && specialConfig?.theme === 'bureaucracy'
  const isStatsTheme = isSpecialUser && specialConfig?.theme === 'stats'
  const isOlympusTheme = isSpecialUser && specialConfig?.theme === 'olympus'
  const isWeatherTheme = isSpecialUser && specialConfig?.theme === 'weather'
  const isSpeedTheme = isSpecialUser && specialConfig?.theme === 'speed'
  const isMoraleTheme = isSpecialUser && specialConfig?.theme === 'morale'
  const isAbyssTheme = isSpecialUser && specialConfig?.theme === 'abyss'
  const isChaosgunTheme = isSpecialUser && specialConfig?.theme === 'chaosgun'
  const isLightningTheme = isSpecialUser && specialConfig?.theme === 'lightning'
  const isArchiveTheme = isSpecialUser && specialConfig?.theme === 'archive'
  const isVintageTheme = isSpecialUser && specialConfig?.theme === 'vintage'
  const isArtTheme = isSpecialUser && specialConfig?.theme === 'art'
  const isPharmacyTheme = isSpecialUser && specialConfig?.theme === 'pharmacy'
  const isHornTheme = isSpecialUser && specialConfig?.theme === 'horn'
  const isRhythmTheme = isSpecialUser && specialConfig?.theme === 'rhythm'
  const isWisdomTheme = isSpecialUser && specialConfig?.theme === 'wisdom'
  const isReverseTheme = isSpecialUser && specialConfig?.theme === 'reverse'
  const isBlurTheme = isSpecialUser && specialConfig?.theme === 'blur'
  const isEleganceTheme = isSpecialUser && specialConfig?.theme === 'elegance'

  return (
    <>
      {/* Special user animated background - only for logged-in special user */}
      {isQuantumTheme && (
        <div className="fixed inset-0 pointer-events-none z-[-2] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-cyan-900/20 via-purple-900/20 to-black"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-cyan-500/5 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '30s' }}></div>
        </div>
      )}

      {/* Starlight animated background */}
      {isStarlightTheme && (
        <div className="fixed inset-0 pointer-events-none z-[-2] overflow-hidden">
          {/* Frieren background image */}
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ 
              backgroundImage: 'url(/background/frieren.jpg)',
              opacity: 0.4,
            }}
          />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 via-gray-900/70 to-black/80"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-purple-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '40s' }}></div>
          {/* Extra sparkles for AlterFrieren - ✦ four-pointed star shape */}
          <div className="absolute top-[10%] left-[15%] w-4 h-4 bg-white/80 animate-ping" style={{ animationDuration: '2s', animationDelay: '0s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[20%] left-[70%] w-3 h-3 bg-purple-300/90 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.3s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[35%] left-[25%] w-3.5 h-3.5 bg-indigo-300/70 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.7s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[45%] left-[80%] w-4 h-4 bg-white/60 animate-ping" style={{ animationDuration: '3.5s', animationDelay: '1.2s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[55%] left-[10%] w-3 h-3 bg-pink-300/80 animate-ping" style={{ animationDuration: '2.8s', animationDelay: '0.5s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[65%] left-[60%] w-3.5 h-3.5 bg-purple-400/90 animate-ping" style={{ animationDuration: '3.2s', animationDelay: '1.8s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[75%] left-[35%] w-4 h-4 bg-white/70 animate-ping" style={{ animationDuration: '2.2s', animationDelay: '0.2s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[85%] left-[75%] w-3 h-3 bg-indigo-400/80 animate-ping" style={{ animationDuration: '3.8s', animationDelay: '1.5s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[15%] left-[45%] w-3 h-3 bg-purple-200/70 animate-ping" style={{ animationDuration: '2.7s', animationDelay: '0.9s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[40%] left-[55%] w-3.5 h-3.5 bg-white/90 animate-ping" style={{ animationDuration: '3.1s', animationDelay: '2.1s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[60%] left-[40%] w-4 h-4 bg-pink-400/60 animate-ping" style={{ animationDuration: '2.4s', animationDelay: '0.4s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[80%] left-[20%] w-3 h-3 bg-indigo-300/90 animate-ping" style={{ animationDuration: '3.6s', animationDelay: '1.1s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[25%] left-[90%] w-3.5 h-3.5 bg-purple-300/60 animate-ping" style={{ animationDuration: '2.9s', animationDelay: '2.3s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[70%] left-[85%] w-3 h-3 bg-white/50 animate-ping" style={{ animationDuration: '3.3s', animationDelay: '0.8s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
          <div className="absolute top-[50%] left-[50%] w-3 h-3 bg-pink-200/70 animate-ping" style={{ animationDuration: '3s', animationDelay: '1s', clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)' }}></div>
        </div>
      )}

      {/* Portal animated background for Iguro */}
      {isPortalTheme && (
        <div className="fixed inset-0 pointer-events-none z-[-2] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900/30 via-violet-900/20 to-black"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-indigo-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '12s' }}></div>
        </div>
      )}

      {/* Chrono animated background for Carrera */}
      {isChronoTheme && (
        <div className="fixed inset-0 pointer-events-none z-[-2] overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-black"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-blue-500/10 to-transparent rounded-full blur-3xl animate-spin" style={{ animationDuration: '8s' }}></div>
        </div>
      )}

      {/* Note: Only starlight theme has extra sparkle particles */}

      {/* Animated Background Particles */}
      <BackgroundParticles
        density={isQuantumTheme ? 30 : isStarlightTheme ? 25 : isPortalTheme ? 28 : isChronoTheme ? 26 : 50}
        speed={isQuantumTheme || isStarlightTheme || isPortalTheme || isChronoTheme ? 1.2 : 0.8}
        enableLinks={true}
        opacity={isQuantumTheme || isStarlightTheme || isPortalTheme || isChronoTheme ? 0.15 : 0.3}
        zIndex={-1}
      />

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className={`flex-1 flex flex-col animated-gradient relative ${isQuantumTheme ? 'quantum-glow' : isStarlightTheme ? 'starlight-glow' : isPortalTheme ? 'portal-glow' : isChronoTheme ? 'chrono-glow' : ''}`}>
        {/* Navigation */}
        <Navbar />

        {/* Guild Header Banner */}
        <GuildHeader />

        {/* Special User Custom Greeting Banner - only for logged-in special user */}
        {isSpecialUser && specialConfig?.customGreeting && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-center py-2 px-2 bg-gradient-to-r from-transparent ${
              isQuantumTheme ? 'via-cyan-900/30' : 
              isStarlightTheme ? 'via-purple-900/30' : 
              isPortalTheme ? 'via-indigo-900/30' : 
              isChronoTheme ? 'via-blue-900/30' : 
              isRoyalTheme ? 'via-purple-900/30' : 
              isBossTheme ? 'via-red-900/30' : 
              isVoidTheme ? 'via-violet-900/30' : 
              isShadowTheme ? 'via-slate-800/30' : 
              isSpoonTheme ? 'via-slate-600/30' : 
              isBureaucracyTheme ? 'via-slate-700/30' : 
              isStatsTheme ? 'via-cyan-900/30' : 
              isOlympusTheme ? 'via-yellow-900/30' : 
              isWeatherTheme ? 'via-sky-900/30' : 
              isSpeedTheme ? 'via-violet-900/30' : 
              isMoraleTheme ? 'via-pink-900/30' : 
              isAbyssTheme ? 'via-purple-900/30' : 
              isChaosgunTheme ? 'via-purple-900/30' : 
              isLightningTheme ? 'via-yellow-900/30' : 
              isArchiveTheme ? 'via-stone-700/30' : 
              isVintageTheme ? 'via-amber-900/30' : 
              isArtTheme ? 'via-pink-900/30' : 
              isPharmacyTheme ? 'via-cyan-900/30' : 
              isHornTheme ? 'via-fuchsia-900/30' : 
              isRhythmTheme ? 'via-fuchsia-900/30' : 
              isWisdomTheme ? 'via-indigo-900/30' : 
              isReverseTheme ? 'via-green-900/30' : 
              isBlurTheme ? 'via-purple-400/30' : 
              isEleganceTheme ? 'via-pink-300/30' : 
              'via-primary/20'
            } to-transparent`}
          >
            <Typography variant="body" className={`text-sm sm:text-base md:text-lg ${
              isQuantumTheme ? 'text-cyan-300' : 
              isStarlightTheme ? 'text-purple-300' : 
              isPortalTheme ? 'text-indigo-300' : 
              isChronoTheme ? 'text-blue-300' : 
              isRoyalTheme ? 'text-purple-300' : 
              isBossTheme ? 'text-red-300' : 
              isVoidTheme ? 'text-violet-300' : 
              isShadowTheme ? 'text-slate-300' : 
              isSpoonTheme ? 'text-slate-300' : 
              isBureaucracyTheme ? 'text-slate-300' : 
              isStatsTheme ? 'text-cyan-300' : 
              isOlympusTheme ? 'text-yellow-300' : 
              isWeatherTheme ? 'text-sky-300' : 
              isSpeedTheme ? 'text-violet-300' : 
              isMoraleTheme ? 'text-pink-300' : 
              isAbyssTheme ? 'text-purple-300' : 
              isChaosgunTheme ? 'text-purple-300' : 
              isLightningTheme ? 'text-yellow-300' : 
              isArchiveTheme ? 'text-stone-300' : 
              isVintageTheme ? 'text-amber-300' : 
              isArtTheme ? 'text-pink-300' : 
              isPharmacyTheme ? 'text-cyan-300' : 
              isHornTheme ? 'text-fuchsia-300' : 
              isRhythmTheme ? 'text-fuchsia-300' : 
              isWisdomTheme ? 'text-indigo-300' : 
              isReverseTheme ? 'text-green-300' : 
              isBlurTheme ? 'text-purple-300' : 
              isEleganceTheme ? 'text-pink-300' : 
              'text-primary'
            } animate-pulse`}>
              {specialConfig.customGreeting}
            </Typography>
          </motion.div>
        )}

        {/* QUOTE OPTION 2: Floating Quote Banner - only for logged-in special user */}
        {isSpecialUser && specialConfig?.quotes?.floatingBanner && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-2 sm:mx-4 mt-2 text-center"
          >
            <Typography variant="caption" className={`italic font-game block px-2 ${
              isStarlightTheme ? 'text-purple-300/80' : 
              isPortalTheme ? 'text-indigo-300/80' : 
              isChronoTheme ? 'text-blue-300/80' : 
              isRoyalTheme ? 'text-purple-300/80' : 
              isBossTheme ? 'text-red-300/80' : 
              isVoidTheme ? 'text-violet-300/80' : 
              isShadowTheme ? 'text-slate-300/80' : 
              isSpoonTheme ? 'text-slate-300/80' : 
              isBureaucracyTheme ? 'text-slate-300/80' : 
              isStatsTheme ? 'text-cyan-300/80' : 
              isOlympusTheme ? 'text-yellow-300/80' : 
              isWeatherTheme ? 'text-sky-300/80' : 
              isSpeedTheme ? 'text-violet-300/80' : 
              isMoraleTheme ? 'text-pink-300/80' : 
              isAbyssTheme ? 'text-purple-300/80' : 
              isChaosgunTheme ? 'text-purple-300/80' : 
              isLightningTheme ? 'text-yellow-300/80' : 
              isArchiveTheme ? 'text-stone-300/80' : 
              isVintageTheme ? 'text-amber-300/80' : 
              isArtTheme ? 'text-pink-300/80' : 
              isPharmacyTheme ? 'text-cyan-300/80' : 
              isHornTheme ? 'text-fuchsia-300/80' : 
              isRhythmTheme ? 'text-fuchsia-300/80' : 
              isWisdomTheme ? 'text-indigo-300/80' : 
              isReverseTheme ? 'text-green-300/80' : 
              isBlurTheme ? 'text-purple-300/80' : 
              isEleganceTheme ? 'text-pink-300/80' : 
              'text-cyan-300/80'
            } text-xs sm:text-sm`}>
              &quot;{specialConfig.quotes.floatingBanner}&quot;
            </Typography>
            {/* Extra banner quote for starlight theme */}
            {isStarlightTheme && specialConfig?.extraQuotes?.banner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-1"
              >
                <Typography variant="caption" className="text-pink-400/70 italic text-xs">
                  {specialConfig.extraQuotes.banner}
                </Typography>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Main Content */}
        <main id="main-content" className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="relative">{children}</div>
        </main>

        {/* QUOTE OPTION 4: Footer Quote - only for logged-in special user (before footer) */}
        {isSpecialUser && specialConfig?.quotes?.footer && (
          <div className="mx-2 sm:mx-4 text-center">
            <Typography variant="caption" className={`italic font-game text-xs sm:text-sm px-2 ${
              isStarlightTheme ? 'text-indigo-300/60' : 
              isPortalTheme ? 'text-violet-400/60' : 
              isChronoTheme ? 'text-indigo-400/60' : 
              'text-purple-300/60'
            }`}>
              &quot;{specialConfig.quotes.footer}&quot;
            </Typography>
          </div>
        )}

        {/* Footer - sticky at bottom */}
        <Footer />

        {/* Back to Top Button */}
        <BackToTop />
      </div>

      <style jsx global>{`
        .quantum-glow {
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(88, 28, 135, 0.05) 100%);
        }
        .starlight-glow {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(79, 70, 229, 0.08) 100%);
        }
        .portal-glow {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
        }
        .chrono-glow {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%);
        }
        .royal-glow {
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(251, 191, 36, 0.08) 100%);
        }
        .boss-glow {
          background: linear-gradient(135deg, rgba(220, 38, 38, 0.08) 0%, rgba(251, 191, 36, 0.08) 100%);
        }
        .void-glow {
          background: linear-gradient(135deg, rgba(76, 29, 149, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%);
        }
        .shadow-glow {
          background: linear-gradient(135deg, rgba(51, 65, 85, 0.08) 0%, rgba(251, 191, 36, 0.08) 100%);
        }
        .spoon-glow {
          background: linear-gradient(135deg, rgba(148, 163, 184, 0.08) 0%, rgba(248, 250, 252, 0.08) 100%);
        }
        .bureaucracy-glow {
          background: linear-gradient(135deg, rgba(71, 85, 105, 0.08) 0%, rgba(251, 146, 60, 0.08) 100%);
        }
        .stats-glow {
          background: linear-gradient(135deg, rgba(8, 145, 178, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%);
        }
        .olympus-glow {
          background: linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(251, 191, 36, 0.08) 100%);
        }
        .weather-glow {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%);
        }
        .speed-glow {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(217, 70, 239, 0.08) 100%);
        }
        .morale-glow {
          background: linear-gradient(135deg, rgba(244, 114, 182, 0.08) 0%, rgba(251, 191, 36, 0.08) 100%);
        }
        .abyss-glow {
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%);
        }
        .chaosgun-glow {
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(244, 63, 94, 0.08) 100%);
        }
        .lightning-glow {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(56, 189, 248, 0.08) 100%);
        }
        .archive-glow {
          background: linear-gradient(135deg, rgba(120, 113, 108, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%);
        }
        .vintage-glow {
          background: linear-gradient(135deg, rgba(180, 83, 9, 0.08) 0%, rgba(161, 98, 7, 0.08) 100%);
        }
        .art-glow {
          background: linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
        }
        .pharmacy-glow {
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%);
        }
        .horn-glow {
          background: linear-gradient(135deg, rgba(232, 121, 249, 0.08) 0%, rgba(244, 114, 182, 0.08) 100%);
        }
        .rhythm-glow {
          background: linear-gradient(135deg, rgba(217, 70, 239, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
        }
        .wisdom-glow {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
        }
        .reverse-glow {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(239, 68, 68, 0.08) 100%);
        }
        .blur-glow {
          background: linear-gradient(135deg, rgba(192, 132, 252, 0.08) 0%, rgba(244, 114, 182, 0.08) 100%);
        }
        .elegance-glow {
          background: linear-gradient(135deg, rgba(249, 168, 212, 0.08) 0%, rgba(196, 181, 253, 0.08) 100%);
        }

      `}</style>
    </>
  )
}
