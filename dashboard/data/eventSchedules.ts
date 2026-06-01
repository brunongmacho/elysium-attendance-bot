import type { EventSchedule } from '../types/eventSchedule';
import rawEvents from './event-schedules.json';

// Cast the raw JSON to typed EventSchedule array
export const ALL_EVENTS: EventSchedule[] = rawEvents as EventSchedule[];
