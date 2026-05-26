import { EventSchedule } from '../types/eventSchedule';

// All times are in GMT+8 (Asia/Manila timezone)
export const GAME_EVENTS: EventSchedule[] = [
  {
    id: 'individual-arena',
    name: 'Individual Arena',
    icon: '⚔️',
    days: [1, 3, 5], // Monday, Wednesday, Friday
    startTime: { hour: 20, minute: 30 },
    durationMinutes: 60,
    color: '#ff6b6b',
    reminderOffsetMinutes: 10,
  },
  {
    id: 'coop-arena',
    name: 'Coop Round Arena',
    icon: '🤝',
    days: [2, 4, 6], // Tuesday, Thursday, Saturday
    startTime: { hour: 20, minute: 30 },
    durationMinutes: 60,
    color: '#4ecdc4',
    reminderOffsetMinutes: 10,
  },
  {
    id: 'gvg',
    name: 'GvG / Guild War',
    icon: '⚔️',
    days: [5, 6, 0], // Friday, Saturday, Sunday
    startTime: { hour: 20, minute: 25 },
    durationMinutes: 3,
    color: '#f39c12',
    reminderOffsetMinutes: 20,
  },
  {
    id: 'guild-boss',
    name: 'Guild Boss',
    icon: '👹',
    days: [1], // Monday only
    startTime: { hour: 21, minute: 30 },
    durationMinutes: 5,
    color: '#e74c3c',
    reminderOffsetMinutes: 20,
  },
  {
    id: 'guild-war-queue',
    name: 'Guild War Queue Reminder',
    icon: '🎯',
    days: [4, 5, 6], // Thursday, Friday, Saturday
    startTime: { hour: 23, minute: 0 },
    durationMinutes: 120,
    color: '#9b59b6',
    reminderOffsetMinutes: 0,
  },
];

export const DAILY_EVENTS: EventSchedule[] = [
  {
    id: 'world-boss-morning',
    name: 'World Boss Event (Morning)',
    icon: '🐉',
    startTime: { hour: 11, minute: 0 },
    durationMinutes: 30,
    color: '#9b59b6',
    isDaily: true,
    reminderOffsetMinutes: 10,
  },
  {
    id: 'world-boss-evening',
    name: 'World Boss Event (Evening)',
    icon: '🐉',
    startTime: { hour: 20, minute: 0 },
    durationMinutes: 30,
    color: '#9b59b6',
    isDaily: true,
    reminderOffsetMinutes: 10,
  },
];

// Ancient Citadel - Different boss each day, 2 times per day
export const ANCIENT_CITADEL_EVENTS: EventSchedule[] = [
  // Monday
  { id: 'ancient-citadel-mon-morning', name: 'Ancient Citadel - Duplican', icon: '🏰', days: [1], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-mon-evening', name: 'Ancient Citadel - Wannitas', icon: '🏰', days: [1], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  // Tuesday
  { id: 'ancient-citadel-tue-morning', name: 'Ancient Citadel - Metus', icon: '🏰', days: [2], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-tue-evening', name: 'Ancient Citadel - Saphirus', icon: '🏰', days: [2], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  // Wednesday
  { id: 'ancient-citadel-wed-morning', name: 'Ancient Citadel - Clemantis', icon: '🏰', days: [3], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-wed-evening', name: 'Ancient Citadel - Secreta', icon: '🏰', days: [3], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  // Thursday
  { id: 'ancient-citadel-thu-morning', name: 'Ancient Citadel - Neutro', icon: '🏰', days: [4], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-thu-evening', name: 'Ancient Citadel - Roderick', icon: '🏰', days: [4], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  // Friday
  { id: 'ancient-citadel-fri-morning', name: 'Ancient Citadel - Auraq', icon: '🏰', days: [5], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-fri-evening', name: 'Ancient Citadel - Thymele', icon: '🏰', days: [5], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  // Saturday
  { id: 'ancient-citadel-sat-morning', name: 'Ancient Citadel - Titore', icon: '🏰', days: [6], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-sat-evening', name: 'Ancient Citadel - Ringor', icon: '🏰', days: [6], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  // Sunday
  { id: 'ancient-citadel-sun-morning', name: 'Ancient Citadel - Chaiflock', icon: '🏰', days: [0], startTime: { hour: 12, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
  { id: 'ancient-citadel-sun-evening', name: 'Ancient Citadel - Benji', icon: '🏰', days: [0], startTime: { hour: 21, minute: 0 }, durationMinutes: 60, color: '#3498db', reminderOffsetMinutes: 10 },
];

// TODO: Re-enable Ancient Citadel events when needed
// export const ALL_EVENTS: EventSchedule[] = [...GAME_EVENTS, ...DAILY_EVENTS, ...ANCIENT_CITADEL_EVENTS];
export const ALL_EVENTS: EventSchedule[] = [...GAME_EVENTS, ...DAILY_EVENTS];
