"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import type {
  AttendanceLeaderboardEntry,
  PointsLeaderboardEntry,
} from "@/types/database";
import type { LeaderboardResponse } from "@/types/api";
import { toLocaleStringGMT8 } from "@/lib/timezone";
import { swrFetcher } from "@/lib/fetch-utils";
import { useDebounce } from "@/hooks/useDebounce";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { LeaderboardSkeleton } from "@/components/SkeletonLoader";
import LeaderboardPodium from "@/components/LeaderboardPodium";
import ProgressBar from "@/components/ProgressBar";
import SegmentedControl from "@/components/SegmentedControl";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Breadcrumb, Typography } from "@/components/ui";
import { Stack } from "@/components/layout";
import { LEADERBOARD, UI } from "@/lib/constants";

// Helper function to get rank tier styling
function getRankTier(rank: number) {
  if (rank === 1) return {
    borderClass: 'border-yellow-500',
    bgClass: 'hover:bg-yellow-500/10',
    textClass: 'text-yellow-400',
    glow: 'glow-gold',
    title: 'Guild Champion',
    badge: '👑'
  };
  if (rank <= 3) return {
    borderClass: 'border-gray-400',
    bgClass: 'hover:bg-gray-400/10',
    textClass: 'text-gray-300',
    glow: 'glow-silver',
    title: 'Elite Guardian',
    badge: '⚔️'
  };
  if (rank <= 10) return {
    borderClass: 'border-primary',
    bgClass: 'hover:bg-primary/10',
    textClass: 'text-primary-light',
    glow: 'glow-primary',
    title: 'Veteran Warrior',
    badge: '🛡️'
  };
  if (rank <= 25) return {
    borderClass: 'border-accent',
    bgClass: 'hover:bg-accent/10',
    textClass: 'text-accent-light',
    glow: 'glow-accent',
    title: 'Skilled Fighter',
    badge: '🗡️'
  };
  if (rank <= 50) return {
    borderClass: 'border-success',
    bgClass: 'hover:bg-success/10',
    textClass: 'text-success-light',
    glow: '',
    title: 'Brave Adventurer',
    badge: '⚡'
  };
  return {
    borderClass: 'border-gray-600',
    bgClass: 'hover:bg-gray-600/10',
    textClass: 'text-gray-400',
    glow: '',
    title: 'Guild Member',
    badge: '🎯'
  };
}

type SortColumn = "earned" | "available" | "spent";
type SortDirection = "asc" | "desc";

export default function LeaderboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<"attendance" | "points">("attendance");
  const [period, setPeriod] = useState<"all" | "monthly" | "weekly">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(""); // Format: YYYY-MM
  const [selectedWeek, setSelectedWeek] = useState<string>(""); // Format: YYYY-MM-DD (week start date)
  const [limit, setLimit] = useState<number>(LEADERBOARD.DEFAULT_LIMIT);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Scroll animation hooks
  const headerAnim = useScrollAnimation({ threshold: 0.2 });
  const statsAnim = useScrollAnimation({ threshold: 0.2 });
  const podiumAnim = useScrollAnimation({ threshold: 0.2 });
  const tableAnim = useScrollAnimation({ threshold: 0.2 });

  // Debounce search query to reduce API calls
  const debouncedSearch = useDebounce(searchQuery, LEADERBOARD.DEBOUNCE_DELAY);

  // OPTIMIZATION: Memoize month options to avoid recalculating on every render
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  }), []);

  // OPTIMIZATION: Memoize week options to avoid recalculating on every render
  const weekOptions = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const gmt8Offset = 8 * 60 * 60 * 1000;
    const now = new Date();

    // Go back i weeks
    const targetDate = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));

    // Convert to GMT+8
    const gmt8Time = new Date(targetDate.getTime() + gmt8Offset);
    const day = gmt8Time.getUTCDay();

    // Calculate Sunday of this week in GMT+8
    const sunday = new Date(gmt8Time);
    sunday.setUTCDate(gmt8Time.getUTCDate() - day);
    sunday.setUTCHours(0, 0, 0, 0);

    // Week start in UTC
    const weekStart = new Date(sunday.getTime() - gmt8Offset);

    // Week end (Saturday 23:59:59 GMT+8)
    const saturdayGMT8 = new Date(sunday);
    saturdayGMT8.setUTCDate(sunday.getUTCDate() + 6);
    saturdayGMT8.setUTCHours(23, 59, 59, 999);
    const weekEnd = new Date(saturdayGMT8.getTime() - gmt8Offset);

    // Convert to GMT+8 for display
    const displayStart = new Date(weekStart.getTime() + gmt8Offset);
    const displayEnd = new Date(weekEnd.getTime() + gmt8Offset);

    return {
      value: displayStart.toISOString().split('T')[0],
      label: i === 0
        ? 'This Week'
        : `${displayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${displayEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
    };
  }), []);

  // Build API URL for podium (top 3, no search filter)
  let podiumApiUrl = `/api/members?type=${leaderboardType}&period=${period}&limit=3`;

  if (period === "monthly" && selectedMonth) {
    podiumApiUrl += `&month=${selectedMonth}`;
  } else if (period === "weekly" && selectedWeek) {
    podiumApiUrl += `&week=${selectedWeek}`;
  }

  // Build API URL for table (with search filter)
  let tableApiUrl = `/api/members?type=${leaderboardType}&period=${period}&limit=${limit}&search=${debouncedSearch}`;

  if (period === "monthly" && selectedMonth) {
    tableApiUrl += `&month=${selectedMonth}`;
  } else if (period === "weekly" && selectedWeek) {
    tableApiUrl += `&week=${selectedWeek}`;
  }

  // Fetch podium data (top 3, no search)
  const { data: podiumResponse } = useSWR<LeaderboardResponse>(podiumApiUrl, swrFetcher, {
    refreshInterval: 30000,
    errorRetryCount: UI.ERROR_RETRY_COUNT,
    errorRetryInterval: UI.ERROR_RETRY_INTERVAL,
    shouldRetryOnError: (err) => {
      // Only retry on network errors, not on 4xx client errors
      if (err?.status && err.status >= 400 && err.status < 500) {
        return false;
      }
      return true;
    },
  });

  // Fetch table data (with search filter)
  const { data, error, isLoading } = useSWR<LeaderboardResponse>(tableApiUrl, swrFetcher, {
    refreshInterval: 30000,
    errorRetryCount: UI.ERROR_RETRY_COUNT,
    errorRetryInterval: UI.ERROR_RETRY_INTERVAL,
    shouldRetryOnError: (err) => {
      // Only retry on network errors, not on 4xx client errors
      if (err?.status && err.status >= 400 && err.status < 500) {
        return false;
      }
      return true;
    },
  });

  // Handle column sorting for Points leaderboard
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column - default to descending
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Get raw data from API
  const rawLeaderboardData: (AttendanceLeaderboardEntry | PointsLeaderboardEntry)[] =
    data?.data || [];

  // Apply sorting for Points leaderboard
  const leaderboardData = useMemo(() => {
    if (leaderboardType !== "points" || !sortColumn || rawLeaderboardData.length === 0) {
      return rawLeaderboardData;
    }

    const pointsData = [...rawLeaderboardData] as PointsLeaderboardEntry[];

    pointsData.sort((a, b) => {
      let aValue = 0;
      let bValue = 0;

      switch (sortColumn) {
        case "earned":
          aValue = a.pointsEarned;
          bValue = b.pointsEarned;
          break;
        case "available":
          aValue = a.pointsAvailable;
          bValue = b.pointsAvailable;
          break;
        case "spent":
          aValue = a.pointsSpent;
          bValue = b.pointsSpent;
          break;
      }

      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });

    return pointsData;
  }, [rawLeaderboardData, leaderboardType, sortColumn, sortDirection]);

  const podiumLeaderboardData: (AttendanceLeaderboardEntry | PointsLeaderboardEntry)[] =
    podiumResponse?.data || [];

  // Prepare podium data for top 3 (uses separate API call without search filter)
  const podiumData = useMemo(() => {
    if (podiumLeaderboardData.length === 0) return [];

    return podiumLeaderboardData.slice(0, 3).map((entry) => ({
      rank: entry.rank,
      memberId: entry.memberId,
      username: entry.username,
      value:
        leaderboardType === "attendance"
          ? (entry as AttendanceLeaderboardEntry).totalKills
          : (entry as PointsLeaderboardEntry).pointsEarned,
      label:
        leaderboardType === "attendance"
          ? "Total Kills"
          : "Points Earned",
    }));
  }, [podiumLeaderboardData, leaderboardType]);

  // Calculate statistics for cards
  const stats = useMemo(() => {
    if (!leaderboardData || leaderboardData.length === 0) {
      return { total: 0, topValue: 0, perfectCount: 0, avgValue: 0 };
    }

    if (leaderboardType === "attendance") {
      const attendanceData = leaderboardData as AttendanceLeaderboardEntry[];
      const totalKills = attendanceData.reduce((sum, e) => sum + e.totalKills, 0);
      const perfectAttendance = attendanceData.filter(e => e.attendanceRate === 100).length;
      const avgKills = Math.round(totalKills / attendanceData.length);
      const topKills = attendanceData[0]?.totalKills || 0;

      return { total: totalKills, topValue: topKills, perfectCount: perfectAttendance, avgValue: avgKills };
    } else {
      const pointsData = leaderboardData as PointsLeaderboardEntry[];
      const totalPoints = pointsData.reduce((sum, e) => sum + e.pointsEarned, 0);
      const topPoints = pointsData[0]?.pointsEarned || 0;
      const avgPoints = Math.round(totalPoints / pointsData.length);
      const richMembers = pointsData.filter(e => e.pointsAvailable >= 1000).length;

      return { total: totalPoints, topValue: topPoints, perfectCount: richMembers, avgValue: avgPoints };
    }
  }, [leaderboardData, leaderboardType]);

  // Show loading during SSR to prevent hydration errors
  if (!isMounted) {
    return (
      <Stack gap="lg">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Leaderboards', current: true },
          ]}
        />
        <div className="text-center py-12">
          <div className="text-gray-400">Loading leaderboard...</div>
        </div>
      </Stack>
    );
  }

  return (
    <>
    <Stack gap="lg">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Leaderboards', current: true },
        ]}
      />

      {/* Header - Responsive sizing with animation */}
      <motion.div
        ref={headerAnim.ref as any}
        initial={{ opacity: 0, y: 30 }}
        animate={headerAnim.isVisible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <Stack gap="sm">
          <Typography variant="h1" className="text-3xl sm:text-4xl text-gold">
            Leaderboards
          </Typography>
          <Typography variant="body" className="text-sm sm:text-base text-gray-300">
            Top performers in attendance and bidding points
          </Typography>
        </Stack>
      </motion.div>

      {/* Leaderboard Type Tabs */}
      <div className="flex justify-center">
        <SegmentedControl
          options={[
            { value: "attendance", label: "Attendance", icon: "📊" },
            { value: "points", label: "Points", icon: "💰" },
          ]}
          value={leaderboardType}
          onChange={(value) => {
            setLeaderboardType(value as "attendance" | "points");
            // Reset sort when switching leaderboard types
            setSortColumn(null);
            setSortDirection("desc");
          }}
        />
      </div>


      {/* Podium for Top 3 */}
      {!isLoading && !error && podiumData.length > 0 && (
        <LeaderboardPodium
          key={leaderboardType}
          entries={podiumData}
          type={leaderboardType}
        />
      )}

      {/* Filters */}
      <div
        className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-3 sm:p-4 card-3d hover:scale-[1.01] transition-transform duration-200"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Period Filter (Attendance only) */}
          {leaderboardType === "attendance" && (
            <>
              <div>
                <label className="block text-sm font-medium text-primary-light mb-2 font-game">
                  Time Period
                </label>
                <select
                  value={period}
                  onChange={(e) => {
                    const newPeriod = e.target.value as "all" | "monthly" | "weekly";
                    setPeriod(newPeriod);
                    // Reset selections when changing period
                    if (newPeriod === "monthly") {
                      setSelectedMonth(monthOptions[0].value);
                    } else if (newPeriod === "weekly") {
                      setSelectedWeek(weekOptions[0].value);
                    }
                  }}
                  className="w-full bg-gray-700/50 text-white border border-primary/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all hover:bg-gray-700"
                >
                  <option value="all">All Time</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              {/* Month Selector */}
              {period === "monthly" && (
                <div>
                  <label className="block text-sm font-medium text-primary-light mb-2 font-game">
                    Select Month
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full bg-gray-700/50 text-white border border-primary/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all hover:bg-gray-700"
                  >
                    {monthOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Week Selector */}
              {period === "weekly" && (
                <div>
                  <label className="block text-sm font-medium text-primary-light mb-2 font-game">
                    Select Week
                  </label>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full bg-gray-700/50 text-white border border-primary/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all hover:bg-gray-700"
                  >
                    {weekOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Top N Filter */}
          <div>
            <label className="block text-sm font-medium text-primary-light mb-2 font-game">
              Show Top
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="w-full bg-gray-700/50 text-white border border-primary/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all hover:bg-gray-700"
            >
              <option value={10}>Top 10</option>
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={0}>All Members</option>
            </select>
          </div>

          {/* Search */}
          <div className={
            leaderboardType === "points" ? "sm:col-span-2 lg:col-span-3" :
            period === "all" ? "sm:col-span-2 lg:col-span-2" :
            "sm:col-span-2 lg:col-span-1"
          }>
            <label className="block text-sm font-medium text-primary-light mb-2 font-game">
              Search Member
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type member name..."
              className="w-full bg-gray-700/50 text-white border border-primary/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all hover:bg-gray-700 placeholder:text-gray-500"
              aria-label="Search for members by name"
            />
          </div>
        </div>

        {/* Results Count */}
        {data && (
          <div className="mt-4 text-sm text-gray-400">
            Showing {data.count} of {data.total} members
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && <LeaderboardSkeleton />}

      {/* Error State */}
      {error && (
        <div className="glass backdrop-blur-sm rounded-lg border border-danger p-6 text-center glow-danger">
          <div className="text-danger text-lg font-semibold mb-2">
            ⚠️ Failed to load leaderboard
          </div>
          <div className="text-gray-400 text-sm">
            {error.message || "Unknown error occurred"}
          </div>
        </div>
      )}

      {/* Leaderboard Table - Mobile optimized */}
      {!isLoading && !error && leaderboardData.length > 0 && (
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/30 overflow-hidden">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full min-w-[600px] sm:min-w-0">
              <thead className="bg-primary/20 border-b border-primary/30">
                {leaderboardType === "attendance" ? (
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-primary-light font-game w-20 sm:w-28">
                      Rank
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-primary-light font-game w-24 sm:w-auto">
                      Member
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light font-game w-16 sm:w-20">
                      Kills
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light font-game w-20 sm:w-24">
                      Points
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light font-game w-24 sm:w-32">
                      Rate
                    </th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-primary-light font-game w-20 sm:w-28">
                      Rank
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-primary-light font-game w-24 sm:w-auto">
                      Member
                    </th>
                    <th
                      className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light font-game w-20 cursor-pointer hover:text-primary-bright transition-colors select-none"
                      onClick={() => handleSort("earned")}
                      title="Click to sort by Points Earned"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Earned</span>
                        {sortColumn === "earned" && (
                          <span className="text-accent-bright">
                            {sortDirection === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light hidden sm:table-cell font-game w-24 cursor-pointer hover:text-primary-bright transition-colors select-none"
                      onClick={() => handleSort("available")}
                      title="Click to sort by Points Available"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Available</span>
                        {sortColumn === "available" && (
                          <span className="text-accent-bright">
                            {sortDirection === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light hidden md:table-cell font-game w-20 cursor-pointer hover:text-primary-bright transition-colors select-none"
                      onClick={() => handleSort("spent")}
                      title="Click to sort by Points Spent"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Spent</span>
                        {sortColumn === "spent" && (
                          <span className="text-accent-bright">
                            {sortDirection === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-primary-light hidden md:table-cell font-game w-24">
                      Rate
                    </th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-primary/10">
                {leaderboardData.map((entry, index) => {
                  const tier = getRankTier(entry.rank || index + 1);
                  return (
                    <tr
                      key={entry.memberId}
                      onClick={() => window.location.href = `/profile/${entry.memberId}`}
                      className={`${tier.bgClass} transition-colors duration-150 group ${tier.glow} border-l-4 ${tier.borderClass} cursor-pointer`}
                      title={`Click to view ${entry.username}'s profile`}
                    >
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-white font-semibold">
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-2">
                            {(entry.rank || index + 1) <= 3 ? (
                              <span className="text-base sm:text-xl inline-block group-hover:scale-110 transition-transform duration-150">
                                {(entry.rank || index + 1) === 1 ? "🥇" : (entry.rank || index + 1) === 2 ? "🥈" : "🥉"}
                              </span>
                            ) : (
                              <span className={`${tier.textClass} text-sm sm:text-base font-game-decorative flex items-center gap-1`}>
                                <span className="text-base">{tier.badge}</span>
                                {entry.rank || index + 1}
                              </span>
                            )}
                          </div>
                          <div className={`text-xs ${tier.textClass} opacity-70 font-game hidden sm:block`}>
                            {tier.title}
                          </div>
                        </div>
                      </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="text-primary-bright font-medium text-xs sm:text-sm font-game">
                        {entry.username}
                      </div>
                    </td>
                    {leaderboardType === "attendance" ? (
                      <>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-white font-semibold text-xs sm:text-base font-game-decorative">
                          <AnimatedCounter value={(entry as AttendanceLeaderboardEntry).totalKills} duration={800} />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-accent-bright font-semibold text-xs sm:text-base font-game-decorative">
                          +<AnimatedCounter value={(entry as AttendanceLeaderboardEntry).pointsEarned} duration={800} />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <div className="flex-1 hidden sm:block max-w-[100px]">
                              <ProgressBar
                                value={(entry as AttendanceLeaderboardEntry).attendanceRate}
                                color="primary"
                                showPercentage={false}
                              />
                            </div>
                            <span className="text-primary-bright font-semibold text-xs sm:text-sm whitespace-nowrap font-game-decorative">
                              <AnimatedCounter value={(entry as AttendanceLeaderboardEntry).attendanceRate} duration={800} />%
                            </span>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-primary-bright font-semibold text-sm sm:text-base font-game-decorative">
                          +<AnimatedCounter value={(entry as PointsLeaderboardEntry).pointsEarned} duration={800} />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-accent-bright text-sm sm:text-base hidden sm:table-cell font-game-decorative">
                          <AnimatedCounter value={(entry as PointsLeaderboardEntry).pointsAvailable} duration={800} />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-danger-bright text-sm sm:text-base hidden md:table-cell font-game-decorative">
                          -<AnimatedCounter value={(entry as PointsLeaderboardEntry).pointsSpent} duration={800} />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <ProgressBar
                                value={(entry as PointsLeaderboardEntry).consumptionRate}
                                color="accent"
                                showPercentage={false}
                                className="min-w-[100px]"
                              />
                            </div>
                            <span className="text-accent-bright font-semibold text-sm min-w-[45px] text-right font-game-decorative">
                              <AnimatedCounter value={(entry as PointsLeaderboardEntry).consumptionRate} duration={800} />%
                            </span>
                          </div>
                        </td>
                      </>
                    )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && leaderboardData.length === 0 && (
        <div className="glass backdrop-blur-sm rounded-lg border border-primary/20 p-12 text-center">
          <div className="text-gray-400 text-lg">No members found</div>
          <div className="text-gray-500 text-sm mt-2">
            Try adjusting your filters or search query
          </div>
        </div>
      )}

      {/* Last Update Time */}
      {data && data.timestamp && (
        <Typography variant="caption" className="text-center">
          Last updated: {toLocaleStringGMT8(data.timestamp)}
        </Typography>
      )}
    </Stack>
    </>
  );
}
