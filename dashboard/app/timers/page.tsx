"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import toast from "react-hot-toast";
import BossTimerGrid from "@/components/BossTimerGrid";
import { BossGridSkeleton } from "@/components/SkeletonLoader";
import AnimatedCounter from "@/components/AnimatedCounter";
import Tooltip from "@/components/Tooltip";
import BorderEffect from "@/components/BorderEffect";
import EffectModeToggle from "@/components/EffectModeToggle";
import { Breadcrumb, Typography } from "@/components/ui";
import { Stack, Grid } from "@/components/layout";
import { Icon } from "@/components/icons";
import { TimerProvider } from "@/contexts/TimerContext";
import type { BossTimersResponse, BossKillResponse } from "@/types/api";
import { toLocaleStringGMT8 } from "@/lib/timezone";
import { swrFetcher, fetchJson } from "@/lib/fetch-utils";
import { BOSS_TIMER, UI } from "@/lib/constants";

export default function Home() {
  const { data: session } = useSession();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [elysiumFilter, setElysiumFilter] = useState(false);

  // Access check - redirect if not allowed
  if (session && !session.canAccessBossTimers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center glass p-8 rounded-lg border border-red-500/30">
          <div className="text-4xl mb-4">🔒</div>
          <Typography variant="h2" className="text-red-400 mb-2">Access Denied</Typography>
          <Typography variant="body" className="text-gray-400">
            You need an Elysium, Core, Neto, Elite, Leader, or Admin role to view boss timers.
          </Typography>
        </div>
      </div>
    );
  }

  // Fetch boss timers with SWR (auto-refresh every 30 seconds)
  const { data, error, isLoading, mutate } = useSWR<BossTimersResponse>(
    `/api/bosses?t=${refreshKey}`,
    swrFetcher,
    {
      refreshInterval: BOSS_TIMER.REFRESH_INTERVAL,
      revalidateOnFocus: true,
      errorRetryCount: UI.ERROR_RETRY_COUNT,
      errorRetryInterval: UI.ERROR_RETRY_INTERVAL,
      shouldRetryOnError: (err) => {
        // Only retry on network errors, not on 4xx client errors
        if (err?.status && err.status >= 400 && err.status < 500) {
          return false;
        }
        return true;
      },
    }
  );

  // Helper to force refresh after user actions by changing the cache key
  const forceRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleMarkAsKilled = useCallback(async (
    bossName: string,
    killedBy: string,
    killTime?: string,
    spawnTime?: string
  ) => {
    const loadingToast = toast.loading(`Marking ${bossName} as killed...`);

    try {
      const result = await fetchJson<BossKillResponse>(
        `/api/bosses/${encodeURIComponent(bossName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ killedBy, killTime, spawnTime }),
        }
      );

      if (result.success && result.data) {
        const nextSpawnMsg = result.data.nextSpawnTime
          ? `\nNext spawn: ${toLocaleStringGMT8(result.data.nextSpawnTime)}`
          : '';
        toast.success(
          `${bossName} marked as killed!${nextSpawnMsg}`,
          { id: loadingToast }
        );
        // Immediately refresh the boss list to show changes
        forceRefresh();
      } else {
        toast.error(result.error || "Failed to mark boss as killed", { id: loadingToast });
      }
    } catch (err) {
      console.error("Error marking boss as killed:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to mark boss as killed",
        { id: loadingToast }
      );
    }
  }, [forceRefresh]);

  const handleCancelSpawn = useCallback(async (bossName: string) => {
    const loadingToast = toast.loading(`Cancelling spawn for ${bossName}...`);

    try {
      const result = await fetchJson<BossKillResponse>(
        `/api/bosses/${encodeURIComponent(bossName)}`,
        {
          method: "DELETE",
        }
      );

      if (result.success) {
        toast.success(
          `${bossName} spawn cancelled and timer deleted!`,
          { id: loadingToast }
        );
        // Immediately refresh the boss list to show changes
        forceRefresh();
      } else {
        toast.error(result.error || "Failed to cancel boss spawn", { id: loadingToast });
      }
    } catch (err) {
      console.error("Error cancelling boss spawn:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel boss spawn",
        { id: loadingToast }
      );
    }
  }, [forceRefresh]);

  return (
    <TimerProvider>
      <>
      <Stack gap="lg">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Boss Timers', current: true },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Stack gap="sm">
          <Typography variant="h1" className="text-2xl sm:text-3xl md:text-4xl text-gold">
            Boss Spawn Timers
          </Typography>
          <Typography variant="body" className="text-sm sm:text-base text-gray-300">
            Real-time tracking of all boss spawns
          </Typography>
        </Stack>

        <div className="flex items-center gap-3">
          {/* Elysium Filter Toggle */}
          <button
            onClick={() => setElysiumFilter(!elysiumFilter)}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 ${
              elysiumFilter 
                ? 'bg-primary/20 border-primary text-primary' 
                : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-primary/50 hover:text-primary'
            }`}
            title={elysiumFilter ? "Show all bosses" : "Show only Elysium's turn"}
            aria-label={elysiumFilter ? "Show all bosses" : "Show only Elysium's turn"}
          >
            <span className="text-sm font-medium">
              {elysiumFilter ? "⚔️ Elysium" : "⚔️"}
            </span>
            <span className="hidden sm:inline text-xs">
              {elysiumFilter ? "Filtered" : "Elysium Turn"}
            </span>
          </button>

          {/* Effect Mode Toggle */}
          <EffectModeToggle />

          {/* Refresh Button */}
          <button
            onClick={() => {
              setIsRefreshing(true);
              forceRefresh();
              // Small delay to show loading state
              setTimeout(() => setIsRefreshing(false), UI.REFRESH_BUTTON_DELAY);
            }}
            disabled={isRefreshing}
            className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 hover:border-primary/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh boss timers"
            aria-label="Refresh boss timers"
          >
            <Icon
              name="refresh"
              size="md"
              className={`text-gray-400 group-hover:text-primary transition-colors duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
            />
            <span className="hidden sm:inline text-sm text-gray-300 group-hover:text-white transition-colors">
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </span>
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {data && (
        <Grid columns={{ xs: 2, md: 4 }} gap="md">
          <Tooltip content="Click to show all bosses" fullWidth>
            <div
              className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
              onClick={() => setStatusFilter(null)}
              style={{ opacity: statusFilter === null ? 1 : 0.7 }}
            >
              <BorderEffect intensity="low" color="#fca5a5" />
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary font-game-decorative relative z-10">
                <AnimatedCounter value={data.count} />
              </div>
              <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Total Bosses</div>
            </div>
          </Tooltip>
          <Tooltip content="Click to toggle spawned bosses filter" fullWidth>
            <div
              className="glass backdrop-blur-sm rounded-lg border border-danger p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
              onClick={() => setStatusFilter(statusFilter === 'spawned' ? null : 'spawned')}
              style={{ opacity: statusFilter === 'spawned' ? 1 : 0.7 }}
            >
              <BorderEffect intensity="extreme" color="#dc2626" />
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-danger font-game-decorative relative z-10">
                <AnimatedCounter value={data.bosses.filter((b) => b.status === "spawned").length} />
              </div>
              <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Spawned</div>
            </div>
          </Tooltip>
          <Tooltip content="Click to toggle soon filter" fullWidth>
            <div
              className="glass backdrop-blur-sm rounded-lg border border-accent p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
              onClick={() => setStatusFilter(statusFilter === 'soon' ? null : 'soon')}
              style={{ opacity: statusFilter === 'soon' ? 1 : 0.7 }}
            >
              <BorderEffect intensity="high" color="#ea580c" />
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-accent font-game-decorative relative z-10">
                <AnimatedCounter value={data.bosses.filter((b) => b.status === "soon").length} />
              </div>
              <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Soon (&lt;30min)</div>
            </div>
          </Tooltip>
          <Tooltip content="Click to toggle tracking filter" fullWidth>
            <div
              className="glass backdrop-blur-sm rounded-lg border border-primary p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
              onClick={() => setStatusFilter(statusFilter === 'ready' ? null : 'ready')}
              style={{ opacity: statusFilter === 'ready' ? 1 : 0.7 }}
            >
              <BorderEffect intensity="medium" color="#dc2626" />
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary font-game-decorative relative z-10">
                <AnimatedCounter value={data.bosses.filter((b) => b.status === "ready").length} />
              </div>
              <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Tracking</div>
            </div>
          </Tooltip>
        </Grid>
      )}

      {/* Loading State */}
      {isLoading && <BossGridSkeleton count={8} />}

      {/* Error State */}
      {error && (
        <div className="glass backdrop-blur-sm rounded-lg border border-danger p-6 text-center glow-danger">
          <div className="text-danger text-lg font-semibold mb-2">
            ⚠️ Failed to load boss timers
          </div>
          <div className="text-gray-400 text-sm">
            {error.message || "Unknown error occurred"}
          </div>
          <div className="text-gray-500 text-xs mt-2">
            Note: MongoDB connection may not work in sandboxed environments.
          </div>
        </div>
      )}

      {/* Boss Grid */}
      {data && data.success && (
        <BossTimerGrid
          bosses={data.bosses}
          onMarkAsKilled={handleMarkAsKilled}
          onCancelSpawn={handleCancelSpawn}
          canMarkAsKilled={session?.canMarkAsKilled || false}
          isAdmin={session?.isAdmin || false}
          userName={session?.user?.name || ""}
          externalFilterStatus={statusFilter}
          onFilterStatusChange={setStatusFilter}
          elysiumFilter={elysiumFilter}
          onElysiumFilterChange={setElysiumFilter}
        />
      )}

      {/* Last Update Time */}
      {data && data.timestamp && (
        <Typography variant="caption" className="text-center">
          Last updated: {toLocaleStringGMT8(data.timestamp)}
        </Typography>
      )}
      </Stack>
      </>
    </TimerProvider>
  );
}
