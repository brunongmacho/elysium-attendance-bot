"use client";

import { useMemo, useState, useEffect } from "react";
import EventScheduleCard from "@/components/EventScheduleCard";
import AnimatedCounter from "@/components/AnimatedCounter";
import Tooltip from "@/components/Tooltip";
import BorderEffect from "@/components/BorderEffect";
import EffectModeToggle from "@/components/EffectModeToggle";
import { Breadcrumb, Typography } from "@/components/ui";
import { FilterChip } from "@/components/ui/FilterChip";
import { Stack, Grid } from "@/components/layout";
import { TimerProvider, useTimer } from "@/contexts/TimerContext";
import { ALL_EVENTS } from "@/data/eventSchedules";
import { calculateNextOccurrence } from "@/lib/event-utils";

function EventScheduleContent() {
  const { currentTime } = useTimer();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate event statistics
  const stats = useMemo(() => {
    const now = currentTime;
    let activeCount = 0;
    let soonCount = 0; // Within 1 hour
    let todayCount = 0;

    ALL_EVENTS.forEach((event) => {
      const nextOcc = calculateNextOccurrence(event, now);
      const timeUntil = nextOcc.getTime() - now;
      const eventEndTime = nextOcc.getTime() + (event.durationMinutes * 60 * 1000);

      // Check if currently active
      if (timeUntil < 0 && now < eventEndTime) {
        activeCount++;
      }

      // Check if coming soon (within 1 hour)
      if (timeUntil > 0 && timeUntil <= 60 * 60 * 1000) {
        soonCount++;
      }

      // Check if today
      const nowDate = new Date(now);
      const nextDate = new Date(nextOcc);
      if (
        nowDate.getFullYear() === nextDate.getFullYear() &&
        nowDate.getMonth() === nextDate.getMonth() &&
        nowDate.getDate() === nextDate.getDate()
      ) {
        todayCount++;
      }
    });

    return {
      total: ALL_EVENTS.length,
      active: activeCount,
      soon: soonCount,
      today: todayCount,
    };
  }, [currentTime]);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let events = [...ALL_EVENTS];

    // Apply search filter
    if (searchQuery) {
      events = events.filter((event) =>
        event.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter) {
      events = events.filter((event) => {
        const nextOcc = calculateNextOccurrence(event, currentTime);
        const remaining = nextOcc.getTime() - currentTime;
        const eventEndTime = nextOcc.getTime() + (event.durationMinutes * 60 * 1000);
        const isActive = remaining < 0 && currentTime < eventEndTime;

        if (statusFilter === 'active') {
          return isActive;
        } else if (statusFilter === 'soon') {
          return !isActive && remaining > 0 && remaining <= 60 * 60 * 1000;
        } else if (statusFilter === 'today') {
          const nowDate = new Date(currentTime);
          const nextDate = new Date(nextOcc);
          return (
            nowDate.getFullYear() === nextDate.getFullYear() &&
            nowDate.getMonth() === nextDate.getMonth() &&
            nowDate.getDate() === nextDate.getDate()
          );
        }
        return true;
      });
    }

    // Sort by next occurrence
    return events.sort((a, b) => {
      const nextA = calculateNextOccurrence(a, currentTime);
      const nextB = calculateNextOccurrence(b, currentTime);
      return nextA.getTime() - nextB.getTime();
    });
  }, [currentTime, searchQuery, statusFilter]);

  // Show loading during SSR to prevent hydration errors
  if (!isMounted) {
    return (
      <Stack gap="lg">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Event Schedule', current: true },
          ]}
        />
        <div className="text-center py-12">
          <div className="text-gray-400">Loading events...</div>
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Event Schedule', current: true },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <Stack gap="sm">
          <Typography variant="h1" className="text-2xl sm:text-3xl md:text-4xl text-gold">
            Event Schedule
          </Typography>
          <Typography variant="body" className="text-sm sm:text-base text-gray-300">
            Daily and weekly game event countdowns (GMT+8)
          </Typography>
        </Stack>

        {/* Effect Mode Toggle */}
        <EffectModeToggle />
      </div>

      {/* Stats Bar */}
      <Grid columns={{ xs: 2, md: 4 }} gap="md">
        <Tooltip content="Click to show all events" fullWidth>
          <div
            className="glass backdrop-blur-sm rounded-lg border border-primary/30 p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
            onClick={() => setStatusFilter(null)}
            style={{ opacity: statusFilter === null ? 1 : 0.7 }}
          >
            <BorderEffect intensity="low" color="#fca5a5" />
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary font-game-decorative relative z-10">
              <AnimatedCounter value={stats.total} />
            </div>
            <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Total Events</div>
          </div>
        </Tooltip>
        <Tooltip content="Click to toggle active events filter" fullWidth>
          <div
            className="glass backdrop-blur-sm rounded-lg border border-success p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
            onClick={() => setStatusFilter(statusFilter === 'active' ? null : 'active')}
            style={{ opacity: statusFilter === 'active' ? 1 : 0.7 }}
          >
            <BorderEffect intensity="extreme" color="#047857" />
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-success font-game-decorative relative z-10">
              <AnimatedCounter value={stats.active} />
            </div>
            <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Active Now</div>
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
              <AnimatedCounter value={stats.soon} />
            </div>
            <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Soon (&lt;1hr)</div>
          </div>
        </Tooltip>
        <Tooltip content="Click to toggle today filter" fullWidth>
          <div
            className="glass backdrop-blur-sm rounded-lg border border-primary p-3 sm:p-4 text-center hover:scale-105 transition-transform duration-200 cursor-pointer relative"
            onClick={() => setStatusFilter(statusFilter === 'today' ? null : 'today')}
            style={{ opacity: statusFilter === 'today' ? 1 : 0.7 }}
          >
            <BorderEffect intensity="medium" color="#dc2626" />
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary font-game-decorative relative z-10">
              <AnimatedCounter value={stats.today} />
            </div>
            <div className="text-xs sm:text-sm text-gray-400 font-game relative z-10">Today</div>
          </div>
        </Tooltip>
      </Grid>

      {/* Filters and Search */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-3 sm:p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Search */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
              Search Event
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type event name..."
              className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              aria-label="Search for events by name"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
              Status
            </label>
            <select
              value={statusFilter || "all"}
              onChange={(e) => setStatusFilter(e.target.value === "all" ? null : e.target.value)}
              className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              aria-label="Filter events by status"
            >
              <option value="all">All Events</option>
              <option value="active">🟢 Active Now ({stats.active})</option>
              <option value="soon">🟡 Soon ({stats.soon})</option>
              <option value="today">📅 Today ({stats.today})</option>
            </select>
          </div>
        </div>

        {/* Active Filters Chips */}
        {(searchQuery || statusFilter) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {searchQuery && (
              <FilterChip
                label={`Search: "${searchQuery}"`}
                onRemove={() => setSearchQuery("")}
                color="primary"
                icon={<span>🔍</span>}
              />
            )}
            {statusFilter && (
              <FilterChip
                label={
                  statusFilter === "active"
                    ? "Active Now"
                    : statusFilter === "soon"
                    ? "Soon"
                    : "Today"
                }
                onRemove={() => setStatusFilter(null)}
                color={
                  statusFilter === "active"
                    ? "success"
                    : statusFilter === "soon"
                    ? "warning"
                    : "primary"
                }
                icon={
                  statusFilter === "active"
                    ? <span>🟢</span>
                    : statusFilter === "soon"
                    ? <span>🟡</span>
                    : <span>📅</span>
                }
              />
            )}
          </div>
        )}

        {/* Results Count */}
        <div className="mt-4 text-sm text-gray-400">
          Showing {filteredEvents.length} of {ALL_EVENTS.length} events
        </div>
      </div>

      {/* Event Schedule Grid */}
      {filteredEvents.length > 0 ? (
        <Grid columns={{ xs: 1, sm: 2, lg: 3, xl: 4 }} gap="md">
          {filteredEvents.map((event) => (
            <EventScheduleCard key={event.id} event={event} />
          ))}
        </Grid>
      ) : (
        <div className="text-center py-12 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700">
          <div className="text-gray-400 text-lg">No events found</div>
          <div className="text-gray-500 text-sm mt-2">
            Try adjusting your filters or search query
          </div>
        </div>
      )}

      {/* Info Note */}
      <Typography variant="caption" className="text-center text-gray-500">
        All times are in GMT+8 (Asia/Manila timezone). Events automatically refresh every second.
      </Typography>
    </Stack>
  );
}

export default function EventSchedulePage() {
  return (
    <TimerProvider>
      <EventScheduleContent />
    </TimerProvider>
  );
}
