"use client";

import { memo, useMemo } from "react";
import { formatTimeRemaining } from "@/lib/boss-config";
import { BOSS_TIMER } from "@/lib/constants";
import { useTimer } from "@/contexts/TimerContext";

interface CountdownProps {
  targetDate: Date;
  className?: string;
}

const Countdown = memo(function Countdown({ targetDate, className = "" }: CountdownProps) {
  // Use shared timer instead of individual setInterval - reduces 50+ intervals to 1
  const { currentTime } = useTimer();

  // Calculate time remaining based on shared timer updates
  const timeRemaining = useMemo(() => {
    return targetDate.getTime() - currentTime;
  }, [targetDate, currentTime]);

  const formatted = useMemo(() => formatTimeRemaining(timeRemaining), [timeRemaining]);

  // Color based on time remaining (uses theme colors)
  const colorClass = useMemo(() => {
    if (timeRemaining <= 0) {
      return "text-danger animate-pulse";
    } else if (timeRemaining <= BOSS_TIMER.SOON_THRESHOLD) {
      // Less than 30 minutes = "soon"
      return "text-warning";
    }
    return "text-success";
  }, [timeRemaining]);

  return (
    <div className={`font-mono text-2xl font-bold ${colorClass} ${className}`}>
      {formatted}
    </div>
  );
});

export default Countdown;
