"use client";

import { useMemo, memo } from "react";
import CircularProgress from "./CircularProgress";
import { Badge } from "./ui";
import Tooltip from "./Tooltip";
import BorderEffect from "./BorderEffect";
import type { EventSchedule } from "@/types/eventSchedule";
import { formatInGMT8 } from "@/lib/timezone";
import { formatTimeRemaining } from "@/lib/boss-config";
import { useTimer } from "@/contexts/TimerContext";
import { calculateEventGlow } from "@/lib/event-glow";
import { calculateNextOccurrence, formatEventDays } from "@/lib/event-utils";

interface EventScheduleCardProps {
  event: EventSchedule;
}

function EventScheduleCard({ event }: EventScheduleCardProps) {
  const { currentTime } = useTimer();

  // Calculate next occurrence and time remaining
  const { nextOccurrence, timeRemaining, isActive, progressPercentage, status } = useMemo(() => {
    const nextOcc = calculateNextOccurrence(event, currentTime);
    const remaining = nextOcc.getTime() - currentTime;

    // Check if event is currently active
    const eventEndTime = nextOcc.getTime() + (event.durationMinutes * 60 * 1000);
    const active = remaining < 0 && currentTime < eventEndTime;

    // Calculate progress percentage for countdown
    const twentyFourHours = 24 * 60 * 60 * 1000;
    let percentage = 0;

    if (active) {
      // Event is active, show progress through event duration
      const eventDuration = event.durationMinutes * 60 * 1000;
      const elapsed = currentTime - nextOcc.getTime();
      percentage = (elapsed / eventDuration) * 100;
    } else if (remaining <= 0) {
      // Event just finished
      percentage = 100;
    } else if (remaining >= twentyFourHours) {
      // More than 24 hours away
      percentage = 0;
    } else {
      // Within 24 hours, show countdown progress
      percentage = ((twentyFourHours - remaining) / twentyFourHours) * 100;
    }

    // Determine status for CircularProgress (matches boss timer logic)
    let eventStatus: 'spawned' | 'soon' | 'ready' = 'ready';
    if (active) {
      eventStatus = 'spawned';
    } else if (remaining <= 30 * 60 * 1000) {
      // Within 30 minutes
      eventStatus = 'soon';
    }

    return {
      nextOccurrence: nextOcc,
      timeRemaining: active ? eventEndTime - currentTime : remaining,
      isActive: active,
      progressPercentage: percentage,
      status: eventStatus,
    };
  }, [event, currentTime]);

  // Format days for display
  const daysDisplay = formatEventDays(event.days, event.isDaily);

  // Calculate dynamic electric animation based on time remaining
  const { borderColor, electricIntensity, electricColor } = useMemo(() => {
    if (isActive) {
      return {
        borderColor: 'border-green-500',
        electricIntensity: 'extreme' as const,
        electricColor: '#10b981',
      };
    }
    const glowData = calculateEventGlow(timeRemaining);

    // Map electric class to intensity level
    const intensityMap: Record<string, 'low' | 'medium' | 'high' | 'extreme'> = {
      'electric-low': 'low',
      'electric-medium': 'medium',
      'electric-high': 'high',
      'electric-extreme': 'extreme',
    };

    return {
      borderColor: glowData.borderColor,
      electricIntensity: intensityMap[glowData.electricClass] || 'medium',
      electricColor: glowData.electricColor,
    };
  }, [timeRemaining, isActive]);

  return (
    <div
      className={`glass backdrop-blur-sm rounded-lg border-2 ${borderColor} ${isActive ? 'event-active-border' : ''} shadow-lg p-4 card-3d transition-all duration-1000 overflow-visible h-full flex flex-col relative`}
    >
      {/* Border Effect */}
      <BorderEffect intensity={electricIntensity} color={electricColor} />
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex-1 min-w-0">
          <h3 className={`text-base sm:text-lg font-bold font-game-decorative ${isActive ? 'text-energy text-success' : 'text-text-primary'}`}>
            {event.name}
            <span className="sr-only">
              {isActive ? ', Status: Active Now' : ', Status: Upcoming'}
            </span>
          </h3>
          {/* Badges - First row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Tooltip content={event.isDaily ? "Occurs every day" : `Occurs on: ${daysDisplay}`} position="bottom">
              <Badge variant="primary" size="sm" className="cursor-help">
                📅 {daysDisplay}
              </Badge>
            </Tooltip>
            <Tooltip content={`Event duration: ${event.durationMinutes} minutes`} position="bottom">
              <Badge variant="warning" size="sm" className="cursor-help">
                ⏱️ {event.durationMinutes}m
              </Badge>
            </Tooltip>
          </div>
          {/* Second row: Active badge */}
          {isActive && (
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="success" size="sm" pulse className="glow-success font-semibold cursor-help">
                🎮 ACTIVE NOW
              </Badge>
            </div>
          )}
        </div>

        {/* Event Icon Display */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center text-4xl sm:text-5xl">
          {event.icon}
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Event Time Info */}
        <div className="mb-3 p-2 bg-surface-elevated rounded text-sm">
          <div className="text-text-secondary">
            <span className="text-text-muted">🕐 Start Time (GMT+8):</span>{" "}
            <span className="font-semibold text-text-primary">
              {(() => {
                const hour = event.startTime.hour;
                const minute = event.startTime.minute;
                const period = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
              })()}
            </span>
          </div>
          <div className="text-text-secondary">
            <span className="text-text-muted">📅 Schedule:</span>{" "}
            <span className="font-semibold text-text-primary">{daysDisplay}</span>
          </div>
        </div>

        {/* Next Occurrence */}
        <div className="mb-2">
          <div className="text-xs sm:text-sm font-semibold text-text-secondary mb-1">
            {isActive ? "🎮 Event Active - Ends:" : "⏰ Next Occurrence:"}
          </div>
          <div className="text-text-primary text-sm sm:text-base font-bold mb-2">
            {formatInGMT8(
              isActive ? new Date(nextOccurrence.getTime() + event.durationMinutes * 60 * 1000) : nextOccurrence,
              "MMM dd, yyyy hh:mm a"
            )}
          </div>

          {/* Countdown Timer with Circular Progress */}
          <div className="flex justify-center py-2">
            <div className="relative">
              <CircularProgress
                percentage={progressPercentage}
                size={140}
                strokeWidth={8}
                status={status}
                timeRemaining={timeRemaining}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xs text-text-muted mb-1 font-game">
                    {isActive ? 'Time Left' : 'Countdown'}
                  </div>
                  <div className="font-mono text-lg sm:text-xl font-bold text-text-primary leading-tight font-game-decorative">
                    {timeRemaining !== null
                      ? formatTimeRemaining(timeRemaining)
                      : "--:--:--"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(EventScheduleCard, (prevProps, nextProps) => {
  return prevProps.event.id === nextProps.event.id;
});
