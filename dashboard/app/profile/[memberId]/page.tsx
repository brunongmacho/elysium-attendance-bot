"use client";

import { useMemo, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatInGMT8 } from "@/lib/timezone";
import Image from "next/image";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Breadcrumb, ProfileSkeleton, StatCard, ScrollReveal, Typography } from "@/components/ui";
import { Stack, Grid } from "@/components/layout";
import { Icon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useSpecialUser } from "@/hooks/useSpecialUser";

// SWR fetcher
const swrFetcher = (url: string) => fetch(url).then((res) => res.json());

interface MemberProfile {
  _id: string;
  username: string;
  pointsAvailable: number;
  pointsEarned: number;
  pointsSpent: number;
  attendance: {
    total: number;
    thisWeek: number;
    thisMonth: number;
    streak: {
      current: number;
      longest: number;
    };
  };
  rank: number;
  totalMembers: number;
  joinedAt: string;
  lastActive: string;
  nextMemberId?: string;
  prevMemberId?: string;
}

interface MemberLoreData {
  title: string;
  lore: string;
  recent_developments: string;
  specialty: string;
  reputation: string;
  stats: string;
  skills: string[];
}

export default function MemberProfilePage() {
  const params = useParams();
  const memberId = params.memberId as string;
  const { data: session } = useSession();
  const router = useRouter();
  
  // Check for special user (only applies when THIS user is logged in)
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

  // Track if we're mounted on client (prevents hydration errors)
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch profile data with SWR (auto-caching, revalidation)
  const { data: profileResponse, error: profileError, isLoading } = useSWR(
    `/api/members/${memberId}`,
    swrFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000, // Dedupe requests within 10s
    }
  );

  // Fetch member lore from API instead of bundling JSON
  const { data: memberLoreData } = useSWR<Record<string, MemberLoreData>>(
    '/api/lore',
    swrFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Cache for 60s
    }
  );

  const profile = profileResponse?.success ? profileResponse.data : null;
  const error = profileError || (profileResponse && !profileResponse.success ? profileResponse.error : null);

  // Memoize expensive calculations - MUST be before conditional returns (Rules of Hooks)
  const consumptionRate = useMemo(() => {
    if (!profile) return 0;
    return profile.pointsEarned > 0
      ? Math.round((profile.pointsSpent / profile.pointsEarned) * 100)
      : 0;
  }, [profile]);

  // Get member lore from API data if available
  const lore = useMemo(() => {
    if (!memberLoreData || !profile) return null;
    return memberLoreData[profile.username];
  }, [memberLoreData, profile]);

  // Show loading state during SSR to prevent hydration errors
  if (!isMounted || isLoading) {
    return (
      <Stack gap="lg">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Profile', current: true },
          ]}
        />
        <ProfileSkeleton />
      </Stack>
    );
  }

  if (error || !profile) {
    // Check if this is the signed-in user viewing their own profile
    const isOwnProfile = session?.user?.id === memberId;
    const isSignedIn = !!session;

    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh] pb-32">
          <div className="max-w-2xl w-full space-y-6">
            {/* Error Card */}
            <div className="glass backdrop-blur-sm rounded-lg border border-danger p-4 sm:p-6 text-center glow-danger card-3d">
              <div className="text-4xl sm:text-5xl mb-4">⚠️</div>

              {isSignedIn && isOwnProfile ? (
                // Signed in user viewing their own non-existent profile
                <>
                  <Typography variant="h2" className="text-xl sm:text-2xl text-gold mb-4">
                    Welcome, {session.user?.name}!
                  </Typography>
                  <div className="text-danger text-lg sm:text-xl font-game-decorative mb-6">
                    You're not in the guild database yet
                  </div>

                  {session.user?.image && (
                    <div className="flex justify-center mb-6">
                      <Image
                        src={session.user.image}
                        alt={session.user.name || "User"}
                        width={80}
                        height={80}
                        className="rounded-full border-2 border-primary"
                      />
                    </div>
                  )}

                  <div className="text-gray-300 font-game text-sm sm:text-base mb-6 space-y-3 text-left">
                    <p className="leading-relaxed">
                      <span className="text-accent-bright font-semibold">You're signed in</span>, but your profile hasn't been added to the guild member database yet.
                    </p>
                    <p className="leading-relaxed">
                      <span className="text-primary-bright font-semibold">To get added:</span>
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4">
                      <li>Join the Elysium Discord server using the button below</li>
                      <li>Contact a guild admin or officer</li>
                      <li>Participate in guild activities to get registered in the system</li>
                      <li>Your attendance and points will start tracking automatically once added</li>
                    </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a
                      href="https://discord.gg/EUWXd5tPa7"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group glass-strong backdrop-blur-sm rounded-lg border border-primary/30 px-6 py-3 hover:border-primary transition-all duration-200 card-3d hover:scale-105 glow-primary inline-flex items-center justify-center gap-3"
                    >
                      <svg
                        className="w-6 h-6 text-primary group-hover:text-primary-bright transition-colors"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                      <span className="text-white font-game-decorative font-semibold">Join Discord Server</span>
                    </a>
                    <a
                      href="/"
                      className="text-primary hover:text-primary-light text-sm sm:text-base font-game transition-colors inline-flex items-center justify-center gap-2 px-4 py-3"
                    >
                      ← Back to Home
                    </a>
                  </div>
                </>
              ) : (
                // Someone else's non-existent profile or generic error
                <>
                  <div className="text-danger text-xl sm:text-2xl font-game-decorative mb-4">
                    {error || "Member Profile Not Found"}
                  </div>
                  <p className="text-gray-300 font-game text-sm sm:text-base mb-6">
                    This member doesn't exist in the guild database.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a
                      href="/leaderboard"
                      className="text-primary hover:text-primary-light text-sm sm:text-base font-game transition-colors inline-flex items-center justify-center gap-2 px-4 py-2"
                    >
                      ← Back to Leaderboard
                    </a>
                    <a
                      href="/"
                      className="text-accent hover:text-accent-light text-sm sm:text-base font-game transition-colors inline-flex items-center justify-center gap-2 px-4 py-2"
                    >
                      ← Back to Home
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* Info Card - Only show for signed-in users viewing their own profile */}
            {isSignedIn && isOwnProfile && (
              <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-6 card-3d">
                <Typography variant="h3" className="text-lg sm:text-xl text-primary-bright mb-4">
                  💡 What happens once you're added?
                </Typography>
                <div className="text-gray-300 font-game text-sm space-y-2">
                  <p className="flex items-start gap-2">
                    <span className="text-success-bright">✓</span>
                    <span>Your boss kills and attendance will be automatically tracked</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-success-bright">✓</span>
                    <span>You'll earn and spend points through the guild's bidding system</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-success-bright">✓</span>
                    <span>Your profile will show your stats, rank, and legendary lore</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-success-bright">✓</span>
                    <span>You'll appear on the guild leaderboards</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <Stack gap="xl">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Leaderboard', href: '/leaderboard' },
            { label: profile.username, current: true },
          ]}
        />

        {/* Header */}
        <ScrollReveal>
          <Stack gap="sm" className="mb-8">
            <Typography variant="h1" className="text-4xl sm:text-5xl text-gold">
              {profile.username}
            </Typography>
          {lore && (
            <Typography variant="h2" className="text-xl sm:text-2xl text-silver italic">
              {lore.title}
            </Typography>
          )}
            <div className="flex items-center gap-3">
              <Typography variant="body" className="text-primary-light">
                Rank <span className="text-accent-bright font-semibold">#{profile.rank}</span> of {profile.totalMembers} members
              </Typography>
              <div className="flex items-center gap-1">
                {/* Previous Member Arrow */}
                {profile.prevMemberId && (
                  <button
                    onClick={() => router.push(`/profile/${profile.prevMemberId}`)}
                    className="p-1.5 rounded-md text-primary-light hover:text-primary-bright hover:bg-primary/10 transition-all duration-200"
                    title="Previous member"
                    aria-label="Navigate to previous member"
                  >
                    <Icon name="chevron-left" size="sm" />
                  </button>
                )}
                {/* Next Member Arrow */}
                {profile.nextMemberId && (
                  <button
                    onClick={() => router.push(`/profile/${profile.nextMemberId}`)}
                    className="p-1.5 rounded-md text-primary-light hover:text-primary-bright hover:bg-primary/10 transition-all duration-200"
                    title="Next member"
                    aria-label="Navigate to next member"
                  >
                    <Icon name="chevron-right" size="sm" />
                  </button>
                )}
              </div>
            </div>
          </Stack>
        </ScrollReveal>

        {/* Member Lore Section */}
        {lore && (
          <div className="glass backdrop-blur-sm rounded-lg border-2 border-accent/50 p-4 sm:p-6 mb-8 glow-accent card-3d hover:scale-[1.01] transition-transform duration-200">
            <Typography variant="h2" className="text-2xl sm:text-3xl text-gold mb-6">
              📜 Legend & Lore
            </Typography>

            <Stack gap="lg">
              <Stack gap="sm">
                <Typography variant="h3" className="text-lg sm:text-xl font-semibold text-accent-bright">
                  Origin Story
                </Typography>
                <Typography variant="body" className="text-gray-300 leading-relaxed text-sm sm:text-base">
                  {lore.lore}
                </Typography>
              </Stack>

              <Stack gap="sm">
                <Typography variant="h3" className="text-lg sm:text-xl font-semibold text-accent-bright">
                  Recent Developments
                </Typography>
                <Typography variant="body" className="text-gray-300 leading-relaxed text-sm sm:text-base">
                  {lore.recent_developments}
                </Typography>
              </Stack>

              <Grid columns={{ xs: 1, md: 2 }} gap="md" className="mt-4">
                <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4">
                  <Typography variant="h4" className="text-sm sm:text-base font-semibold text-primary-bright mb-2">
                    Specialty
                  </Typography>
                  <Typography variant="small" className="text-gray-300">
                    {lore.specialty}
                  </Typography>
                </div>
                <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4">
                  <Typography variant="h4" className="text-sm sm:text-base font-semibold text-primary-bright mb-2">
                    Reputation
                  </Typography>
                  <Typography variant="small" className="text-gray-300">
                    {lore.reputation}
                  </Typography>
                </div>
              </Grid>

              <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4">
                <Typography variant="h4" className="text-sm sm:text-base font-semibold text-primary-bright mb-2">
                  Stats
                </Typography>
                <Typography variant="caption" className="text-gray-300 font-mono">
                  {lore.stats}
                </Typography>
              </div>

              <Stack gap="sm">
                <Typography variant="h4" className="text-sm sm:text-base font-semibold text-primary-bright">
                  Signature Skills
                </Typography>
                <div className="flex flex-wrap gap-2">
                  {lore.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="bg-accent/20 border border-accent/50 text-accent-bright px-3 py-1.5 rounded-full text-xs sm:text-sm font-game transition-all duration-200 hover:bg-accent/30 hover:scale-105 cursor-default"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </Stack>
            </Stack>
          </div>
        )}

        {/* Stats Grid */}
        <ScrollReveal delay={0.1}>
          <Grid columns={{ xs: 1, sm: 2, lg: 3 }} gap="lg" className="mb-8">
            <StatCard
              label="💰 Points Available"
              value={profile.pointsAvailable}
              icon={
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label="📊 Total Attendance"
              value={profile.attendance.total}
              icon={
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
            <StatCard
              label="📈 Consumption Rate"
              value={`${consumptionRate}%`}
              trend={consumptionRate > 75 ? 'up' : consumptionRate > 50 ? 'neutral' : 'down'}
              change={consumptionRate > 75 ? 'High spender' : consumptionRate > 50 ? 'Moderate' : 'Conservative'}
              className="sm:col-span-2 lg:col-span-1"
            />
          </Grid>
        </ScrollReveal>

        {/* Points Breakdown */}
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 sm:p-6 mb-8 card-3d hover:scale-[1.01] transition-transform duration-200">
          <Typography variant="h2" className="text-xl sm:text-2xl md:text-3xl text-gold mb-6">
            💎 Points Summary
          </Typography>
          <Grid columns={{ xs: 1, sm: 3 }} gap="lg">
            <div className="glass-strong backdrop-blur-sm rounded-lg border border-primary/20 p-4 text-center">
              <div className="text-xs sm:text-sm text-primary-light font-game mb-1">Points Earned</div>
              <div className="text-xl sm:text-2xl font-bold text-accent-bright font-game-decorative">+{profile.pointsEarned}</div>
            </div>
            <div className="glass-strong backdrop-blur-sm rounded-lg border border-primary/20 p-4 text-center">
              <div className="text-xs sm:text-sm text-primary-light font-game mb-1">Points Spent</div>
              <div className="text-xl sm:text-2xl font-bold text-danger-bright font-game-decorative">{profile.pointsSpent}</div>
            </div>
            <div className="glass-strong backdrop-blur-sm rounded-lg border border-primary/20 p-4 text-center">
              <div className="text-xs sm:text-sm text-primary-light font-game mb-1">Points Available</div>
              <div className="text-xl sm:text-2xl font-bold text-primary-bright font-game-decorative">{profile.pointsAvailable}</div>
            </div>
          </Grid>
        </div>

        {/* Member Info */}
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-4 sm:p-6 mt-8 card-3d hover:scale-[1.01] transition-transform duration-200">
          <Typography variant="h2" className="text-xl sm:text-2xl md:text-3xl text-gold mb-6">
            ℹ️ Member Information
          </Typography>
          <Grid columns={{ xs: 1, md: 3 }} gap="md" className="text-xs sm:text-sm">
            <div className="glass-strong backdrop-blur-sm rounded-lg border border-primary/20 p-3 sm:p-4">
              <span className="text-primary-light font-game block mb-1">Last Active:</span>
              <span className="text-white font-game-decorative">{formatInGMT8(profile.lastActive, "MMM dd, yyyy hh:mm a")}</span>
            </div>
            <div className="glass-strong backdrop-blur-sm rounded-lg border border-primary/20 p-3 sm:p-4">
              <span className="text-primary-light font-game block mb-1">This Week:</span>
              <span className="text-accent-bright font-semibold font-game-decorative">{profile.attendance.thisWeek} bosses</span>
            </div>
            <div className="glass-strong backdrop-blur-sm rounded-lg border border-primary/20 p-3 sm:p-4">
              <span className="text-primary-light font-game block mb-1">This Month:</span>
              <span className="text-accent-bright font-semibold font-game-decorative">{profile.attendance.thisMonth} bosses</span>
            </div>
          </Grid>
        </div>

        {/* QUOTE OPTION 3: Profile Page Quote - only for logged-in special user viewing their own profile */}
        {isSpecialUser && specialConfig?.quotes?.profile && (
          <div className="mt-8 text-center p-4 sm:p-6 glass rounded-lg border border-purple-500/20">
            <Typography variant="body" className={`italic font-game text-sm sm:text-base px-2 ${
              isStarlight ? 'text-purple-300/80' :
              isChaos ? 'text-orange-300/80' :
              isUnstable ? 'text-teal-300/80' :
              isPortal ? 'text-indigo-300/80' :
              isGrill ? 'text-red-300/80' :
              isWrong ? 'text-yellow-300/80' :
              isChrono ? 'text-blue-300/80' :
              isNightlight ? 'text-pink-300/80' :
              isOcean ? 'text-sky-300/80' :
              isSnack ? 'text-rose-300/80' :
              isRoyal ? 'text-violet-300/80' :
              isBlade ? 'text-rose-300/80' :
              isTiger ? 'text-orange-300/80' :
              isBoss ? 'text-red-300/80' :
              isVoid ? 'text-purple-300/80' :
              isMeme ? 'text-cyan-300/80' :
              isShadow ? 'text-slate-300/80' :
              isNeon ? 'text-green-300/80' :
              isChaoscoin ? 'text-emerald-300/80' :
              isSpoon ? 'text-slate-300/80' :
              isBureaucracy ? 'text-slate-300/80' :
              isStats ? 'text-cyan-300/80' :
              isOlympus ? 'text-yellow-300/80' :
              isWeather ? 'text-sky-300/80' :
              isSpeed ? 'text-purple-300/80' :
              isMorale ? 'text-pink-300/80' :
              isRecycle ? 'text-lime-300/80' :
              isAbyss ? 'text-purple-300/80' :
              isChaosgun ? 'text-violet-300/80' :
              isLightning ? 'text-yellow-300/80' :
              isSonic ? 'text-rose-300/80' :
              isArchive ? 'text-stone-300/80' :
              isVintage ? 'text-amber-300/80' :
              isArt ? 'text-pink-300/80' :
              isPancake ? 'text-orange-300/80' :
              isPharmacy ? 'text-cyan-300/80' :
              isHorn ? 'text-fuchsia-300/80' :
              isBook ? 'text-amber-300/80' :
              isShadowdance ? 'text-blue-300/80' :
              isTidal ? 'text-teal-300/80' :
              isRhythm ? 'text-fuchsia-300/80' :
              isVanish ? 'text-slate-300/80' :
              isWisdom ? 'text-indigo-300/80' :
              isReverse ? 'text-green-300/80' :
              isDragon ? 'text-green-300/80' :
              isBlur ? 'text-purple-300/80' :
              isElegance ? 'text-pink-300/80' :
              isSky ? 'text-sky-300/80' :
              isCat ? 'text-purple-300/80' :
              isCasino ? 'text-red-300/80' :
              isQuantum ? 'text-cyan-300/80' : 'text-cyan-300/80'
            }`}>
              &quot;{specialConfig.quotes.profile}&quot;
            </Typography>
            <Typography variant="caption" className={`mt-2 block ${
              isStarlight ? 'text-pink-400/60' :
              isChaos ? 'text-orange-400/60' :
              isUnstable ? 'text-teal-400/60' :
              isPortal ? 'text-violet-400/60' :
              isGrill ? 'text-red-400/60' :
              isWrong ? 'text-amber-400/60' :
              isChrono ? 'text-indigo-400/60' :
              isNightlight ? 'text-yellow-400/60' :
              isOcean ? 'text-cyan-400/60' :
              isSnack ? 'text-rose-400/60' :
              isRoyal ? 'text-violet-400/60' :
              isBlade ? 'text-rose-400/60' :
              isTiger ? 'text-orange-400/60' :
              isBoss ? 'text-red-400/60' :
              isVoid ? 'text-purple-400/60' :
              isMeme ? 'text-cyan-400/60' :
              isShadow ? 'text-slate-400/60' :
              isNeon ? 'text-green-400/60' :
              isChaoscoin ? 'text-emerald-400/60' :
              isSpoon ? 'text-slate-400/60' :
              isBureaucracy ? 'text-slate-400/60' :
              isStats ? 'text-cyan-400/60' :
              isOlympus ? 'text-yellow-400/60' :
              isWeather ? 'text-sky-400/60' :
              isSpeed ? 'text-purple-400/60' :
              isMorale ? 'text-pink-400/60' :
              isRecycle ? 'text-lime-400/60' :
              isAbyss ? 'text-purple-400/60' :
              isChaosgun ? 'text-violet-400/60' :
              isLightning ? 'text-yellow-400/60' :
              isSonic ? 'text-rose-400/60' :
              isArchive ? 'text-stone-400/60' :
              isVintage ? 'text-amber-400/60' :
              isArt ? 'text-pink-400/60' :
              isPancake ? 'text-orange-400/60' :
              isPharmacy ? 'text-cyan-400/60' :
              isHorn ? 'text-fuchsia-400/60' :
              isBook ? 'text-amber-400/60' :
              isShadowdance ? 'text-blue-400/60' :
              isTidal ? 'text-teal-400/60' :
              isRhythm ? 'text-fuchsia-400/60' :
              isVanish ? 'text-slate-400/60' :
              isWisdom ? 'text-indigo-400/60' :
              isReverse ? 'text-green-400/60' :
              isDragon ? 'text-green-400/60' :
              isBlur ? 'text-purple-400/60' :
              isElegance ? 'text-pink-400/60' :
              isSky ? 'text-sky-400/60' :
              isCat ? 'text-purple-400/60' :
              isCasino ? 'text-red-400/60' :
              isQuantum ? 'text-cyan-400/60' : 'text-purple-400/60'
            }`}>
              — {specialConfig.name}
            </Typography>
            {/* Extra heart for starlight */}
            {isStarlight && (
              <div className="mt-2 text-pink-400">
                💜
              </div>
            )}
          </div>
        )}
    </Stack>
  );
}
