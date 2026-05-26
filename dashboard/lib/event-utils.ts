import type { EventSchedule } from '@/types/eventSchedule';

/**
 * Calculate the next occurrence of an event based on its schedule
 * @param event The event schedule configuration
 * @param currentTime Current timestamp in milliseconds
 * @returns Date object representing the next occurrence
 */
export function calculateNextOccurrence(event: EventSchedule, currentTime: number): Date {
  const now = new Date(currentTime);
  const gmt8Offset = 8 * 60 * 60 * 1000;
  const gmt8Now = new Date(now.getTime() + gmt8Offset);

  const currentHour = gmt8Now.getUTCHours();
  const currentMinute = gmt8Now.getUTCMinutes();
  const currentDay = gmt8Now.getUTCDay();

  if (event.isDaily) {
    // For daily events, check if today's occurrence has completely finished
    const eventTime = new Date(gmt8Now);
    eventTime.setUTCHours(event.startTime.hour, event.startTime.minute, 0, 0);

    const eventStartMs = eventTime.getTime();
    const eventEndMs = eventStartMs + (event.durationMinutes * 60 * 1000);
    const nowMs = gmt8Now.getTime();

    // Check if event crosses midnight
    const eventEndTime = new Date(eventEndMs);
    const eventCrossesMidnight = eventEndTime.getUTCDate() !== eventTime.getUTCDate();

    if (eventCrossesMidnight) {
      // Event crosses midnight - need to check both today's and yesterday's occurrence
      const yesterdayEventStart = new Date(eventTime);
      yesterdayEventStart.setUTCDate(yesterdayEventStart.getUTCDate() - 1);
      const yesterdayEventEnd = yesterdayEventStart.getTime() + (event.durationMinutes * 60 * 1000);

      // If we're in the portion of yesterday's event that extends to today, return yesterday's start
      if (nowMs < yesterdayEventEnd) {
        return new Date(yesterdayEventStart.getTime() - gmt8Offset);
      }
      // Otherwise, if today's event hasn't ended, return today's start
      else if (nowMs < eventEndMs) {
        return new Date(eventStartMs - gmt8Offset);
      }
      // Event has completely finished, schedule for tomorrow
      else {
        eventTime.setUTCDate(eventTime.getUTCDate() + 1);
        return new Date(eventTime.getTime() - gmt8Offset);
      }
    } else {
      // Normal case - event doesn't cross midnight
      if (nowMs < eventEndMs) {
        return new Date(eventStartMs - gmt8Offset);
      } else {
        eventTime.setUTCDate(eventTime.getUTCDate() + 1);
        return new Date(eventTime.getTime() - gmt8Offset);
      }
    }
  } else {
    // For weekly events, find the next occurrence
    if (!event.days || event.days.length === 0) {
      return new Date(currentTime);
    }

    // First, check if yesterday's event is still running (for events that cross midnight)
    const yesterday = (currentDay - 1 + 7) % 7;
    if (event.days.includes(yesterday)) {
      const eventStartMinutes = event.startTime.hour * 60 + event.startTime.minute;
      const eventEndMinutes = eventStartMinutes + event.durationMinutes;

      if (eventEndMinutes >= 24 * 60) {
        // Yesterday's event crosses midnight
        const eventEndWrapped = eventEndMinutes - (24 * 60);
        const timeInMinutes = currentHour * 60 + currentMinute;

        // Check if we're in the wrapped portion (after midnight) of yesterday's event
        if (timeInMinutes <= eventEndWrapped) {
          // Return yesterday's event start time
          const yesterdayOccurrence = new Date(gmt8Now);
          yesterdayOccurrence.setUTCDate(yesterdayOccurrence.getUTCDate() - 1);
          yesterdayOccurrence.setUTCHours(event.startTime.hour, event.startTime.minute, 0, 0);
          return new Date(yesterdayOccurrence.getTime() - gmt8Offset);
        }
      }
    }

    // Find next day when event occurs
    let daysToAdd = 0;
    let found = false;

    for (let i = 0; i < 7; i++) {
      const checkDay = (currentDay + i) % 7;

      if (event.days.includes(checkDay)) {
        if (i === 0) {
          // Event is today, check if it has completely finished
          const timeInMinutes = currentHour * 60 + currentMinute;
          const eventStartMinutes = event.startTime.hour * 60 + event.startTime.minute;
          const eventEndMinutes = eventStartMinutes + event.durationMinutes;

          // Handle events that cross midnight (e.g., 23:00 + 120min = 01:00 next day)
          const crossesMidnight = eventEndMinutes >= 24 * 60;

          if (crossesMidnight) {
            // Event crosses midnight - it's still active if current time is after start
            // (We already checked the wrapped portion above for yesterday's event)
            if (timeInMinutes >= eventStartMinutes) {
              daysToAdd = 0;
              found = true;
              break;
            }
          } else {
            // Normal case - event doesn't cross midnight
            if (timeInMinutes < eventEndMinutes) {
              daysToAdd = 0;
              found = true;
              break;
            }
          }
          // Otherwise, continue searching for next occurrence
        } else {
          // Event is on a future day
          daysToAdd = i;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // No valid day found (shouldn't happen), default to next occurrence of first day
      const firstDay = event.days[0];
      daysToAdd = (firstDay - currentDay + 7) % 7;
      if (daysToAdd === 0) daysToAdd = 7;
    }

    const nextOccurrence = new Date(gmt8Now);
    nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
    nextOccurrence.setUTCHours(event.startTime.hour, event.startTime.minute, 0, 0);

    return new Date(nextOccurrence.getTime() - gmt8Offset);
  }
}

/**
 * Check if an event is currently active
 * @param event The event schedule configuration
 * @param currentTime Current timestamp in milliseconds
 * @returns True if the event is currently active
 */
export function isEventActive(event: EventSchedule, currentTime: number): boolean {
  const nextOccurrence = calculateNextOccurrence(event, currentTime);
  const timeUntilStart = nextOccurrence.getTime() - currentTime;
  const eventEndTime = nextOccurrence.getTime() + (event.durationMinutes * 60 * 1000);

  return timeUntilStart < 0 && currentTime < eventEndTime;
}

/**
 * Get time remaining until event starts or ends (if active)
 * @param event The event schedule configuration
 * @param currentTime Current timestamp in milliseconds
 * @returns Time remaining in milliseconds
 */
export function getEventTimeRemaining(event: EventSchedule, currentTime: number): number {
  const nextOccurrence = calculateNextOccurrence(event, currentTime);
  const timeUntilStart = nextOccurrence.getTime() - currentTime;
  const eventEndTime = nextOccurrence.getTime() + (event.durationMinutes * 60 * 1000);

  // If event is active, return time until it ends
  if (timeUntilStart < 0 && currentTime < eventEndTime) {
    return eventEndTime - currentTime;
  }

  // Otherwise return time until it starts
  return timeUntilStart;
}

/**
 * Format days array into readable string
 * @param days Array of day numbers (0=Sunday, 1=Monday, etc.)
 * @param isDaily Whether this is a daily event
 * @returns Formatted string like "Mon, Wed, Fri" or "Daily"
 */
export function formatEventDays(days: number[] | undefined, isDaily?: boolean): string {
  if (isDaily) return 'Daily';
  if (!days || days.length === 0) return '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map(d => dayNames[d]).join(', ');
}
