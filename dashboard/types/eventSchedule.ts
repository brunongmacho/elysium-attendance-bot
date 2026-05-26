export interface EventSchedule {
  id: string;
  name: string;
  icon: string;
  days?: number[]; // 0=Sunday, 1=Monday, etc. (for weekly events)
  startTime: {
    hour: number;
    minute: number;
  };
  durationMinutes: number;
  color: string;
  isDaily?: boolean; // true for daily events, false/undefined for weekly
  reminderOffsetMinutes?: number;
}

export interface EventOccurrence {
  event: EventSchedule;
  nextOccurrence: Date;
  timeRemaining: string;
  isActive: boolean;
  progress: number; // 0-100 percentage for progress bar
}
