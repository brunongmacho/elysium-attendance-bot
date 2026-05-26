"use client";

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";

interface TimerContextValue {
  currentTime: number;
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined);

export function TimerProvider({ children }: { children: ReactNode }) {
  // Initialize with 0 to prevent hydration errors (will update immediately on client)
  const [currentTime, setCurrentTime] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Set actual time on client mount
    setIsMounted(true);
    setCurrentTime(Date.now());

    // Single interval for all components
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({ currentTime }), [currentTime]);

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error("useTimer must be used within a TimerProvider");
  }
  return context;
}
