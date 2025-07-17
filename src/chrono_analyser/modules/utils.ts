/**
 * @file Contains pure, stateless utility functions for common calculations and data transformations.
 * These helpers are used for date manipulation, duration calculation, and other reusable logic.
 */

import { OFCEvent } from 'src/types'; // No other imports from './types'

export function getISODate(date: Date | null): string | null {
  if (!date || isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

export function getWeekStartDate(date: Date): Date | null {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday as start
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
}

export function getMonthStartDate(date: Date): Date | null {
  if (!date || isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function getHourFromTimeStr(timeStr: any): number | null {
  if (timeStr == null) return null;
  if (typeof timeStr === 'number') {
    const hour = Math.floor(timeStr);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  const sTimeStr = String(timeStr);
  const timeMatch = sTimeStr.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  try {
    const d = new Date(sTimeStr);
    if (!isNaN(d.getTime())) {
      const hour = d.getUTCHours();
      return hour >= 0 && hour <= 23 ? hour : null;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

export function getDayOfWeekNumber(dayChar: string): number | undefined {
  const mapping: { [key: string]: number } = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
  return mapping[String(dayChar).trim().toUpperCase()];
}

/**
 * Calculates the duration in hours between a start and end time.
 * It can handle overnight events (e.g., 22:00 to 02:00) and multiplies
 * the result by the number of days.
 *
 * @param startTime - The start time, can be a string (HH:mm) or a number.
 * @param endTime - The end time, can be a string (HH:mm) or a number.
 * @param days - The number of days the event spans. Defaults to 1.
 * @returns The total duration in hours.
 */
export function calculateDuration(
  startTime: any,
  endTime: any,
  days: number | undefined = 1
): number {
  const parseTime = (timeStr: any): { hours: number; minutes: number } | null => {
    if (timeStr == null) return null;
    if (typeof timeStr === 'number') {
      if (isNaN(timeStr) || !isFinite(timeStr)) return null;
      return {
        hours: Math.floor(timeStr),
        minutes: Math.round((timeStr - Math.floor(timeStr)) * 60)
      };
    }
    const sTimeStr = String(timeStr);
    const timeMatch = sTimeStr.match(/^(\d{1,2}):(\d{2})/);
    if (timeMatch) return { hours: parseInt(timeMatch[1]), minutes: parseInt(timeMatch[2]) };
    try {
      const d = new Date(sTimeStr);
      if (!isNaN(d.getTime())) return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
    } catch (e) {
      /* ignore */
    }
    return null;
  };

  try {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (!start || !end) return 0;
    let startMinutes = start.hours * 60 + start.minutes;
    let endMinutes = end.hours * 60 + end.minutes;
    if (endMinutes < startMinutes) endMinutes += 24 * 60; // Handles overnight
    const durationForOneDay = (endMinutes - startMinutes) / 60;
    const numDays = Number(days) || 0;
    return durationForOneDay * Math.max(0, numDays);
  } catch (err) {
    return 0;
  }
}

/**
 * Calculates how many times a recurring event occurs within a given date range.
 *
 * @param metadata - The metadata of the time record, containing recurrence rules.
 * @param filterStartDate - The start date of the filter period.
 * @param filterEndDate - The end date of the filter period.
 * @returns The total number of occurrences within the range.
 */
export function calculateRecurringInstancesInDateRange(
  metadata: OFCEvent,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): number {
  if (metadata.type !== 'recurring') return 0;

  const {
    startRecur: metaStartRecurStr,
    endRecur: metaEndRecurStr,
    daysOfWeek: metaDaysOfWeek
  } = metadata;
  if (!metaStartRecurStr || !metaDaysOfWeek) return 0;

  let recurrenceStart: Date | null = null;
  const tempStartDate = new Date(metaStartRecurStr);
  if (!isNaN(tempStartDate.getTime())) {
    recurrenceStart = new Date(
      Date.UTC(tempStartDate.getFullYear(), tempStartDate.getMonth(), tempStartDate.getDate())
    );
  }
  if (!recurrenceStart) return 0;

  let recurrenceEnd: Date = new Date(Date.UTC(9999, 11, 31));
  if (metaEndRecurStr) {
    const tempEndDate = new Date(metaEndRecurStr);
    if (!isNaN(tempEndDate.getTime())) {
      recurrenceEnd = new Date(
        Date.UTC(tempEndDate.getFullYear(), tempEndDate.getMonth(), tempEndDate.getDate())
      );
    }
  }

  const effectiveStart = new Date(
    Math.max(recurrenceStart.getTime(), filterStartDate?.getTime() || recurrenceStart.getTime())
  );
  const effectiveEnd = new Date(
    Math.min(recurrenceEnd.getTime(), filterEndDate?.getTime() || recurrenceEnd.getTime())
  );

  if (effectiveStart > effectiveEnd) return 0;

  const targetDays = (
    Array.isArray(metaDaysOfWeek)
      ? metaDaysOfWeek
      : String(metaDaysOfWeek)
          .replace(/[\[\]\s]/g, '')
          .split(',')
  )
    .map(d => getDayOfWeekNumber(d))
    .filter((d): d is number => d !== undefined);

  if (targetDays.length === 0) return 0;

  let count = 0;
  const currentDate = new Date(effectiveStart.getTime());
  while (currentDate.getTime() <= effectiveEnd.getTime()) {
    if (targetDays.includes(currentDate.getUTCDay())) {
      count++;
    }
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  return count;
}
