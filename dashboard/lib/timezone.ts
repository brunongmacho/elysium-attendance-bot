/**
 * Timezone Utilities
 * Handle all date/time formatting in GMT+8 (Asia/Manila)
 */

import { format as dateFnsFormat } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// Default timezone for the application
export const DEFAULT_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Manila";

/**
 * Format a date in GMT+8 timezone
 * @param date - Date to format (Date object, ISO string, or timestamp)
 * @param formatString - date-fns format string (e.g., "MMM dd, yyyy hh:mm a")
 * @returns Formatted date string in GMT+8, or '--' if invalid
 */
export function formatInGMT8(date: Date | string | number, formatString: string): string {
  if (!date) return '--';

  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    console.warn('Invalid date passed to formatInGMT8:', date);
    return '--';
  }

  const zonedDate = toZonedTime(dateObj, DEFAULT_TIMEZONE);
  return dateFnsFormat(zonedDate, formatString);
}

/**
 * Convert a date to GMT+8 timezone
 * @param date - Date to convert
 * @returns Date object in GMT+8 timezone, or current date if invalid
 */
export function toGMT8(date: Date | string | number): Date {
  if (!date) return new Date();

  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    console.warn('Invalid date passed to toGMT8:', date);
    return new Date();
  }

  return toZonedTime(dateObj, DEFAULT_TIMEZONE);
}

/**
 * Format date with locale string in GMT+8
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string, or '--' if invalid
 */
export function toLocaleStringGMT8(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '--';

  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    console.warn('Invalid date passed to toLocaleStringGMT8:', date);
    return '--';
  }

  return dateObj.toLocaleString('en-US', {
    ...options,
    timeZone: DEFAULT_TIMEZONE,
  });
}
