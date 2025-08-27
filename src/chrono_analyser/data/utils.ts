/**
 * @file Contains pure, stateless utility functions for common calculations and data transformations.
 * These helpers are used for date manipulation, duration calculation, and other reusable logic.
 */

import { rrulestr } from 'rrule';
import { OFCEvent } from '../../types';
import { TimeRecord } from './types';

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

export function getHourFromTimeStr(
  timeStr: string | number | Date | null | undefined
): number | null {
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

export function calculateDuration(
  startTime: string | number | Date | null | undefined,
  endTime: string | number | Date | null | undefined,
  days: number | undefined = 1
): number {
  const parseTime = (
    timeStr: string | number | Date | null | undefined
  ): { hours: number; minutes: number } | null => {
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

function getRecurrenceDateRange(
  metadata: OFCEvent,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): { effectiveStart: Date; effectiveEnd: Date; targetDays: number[] } | null {
  // TYPE GUARD: Ensure we are dealing with a recurring event.
  if (metadata.type !== 'recurring') return null;

  const {
    startRecur: metaStartRecurStr,
    endRecur: metaEndRecurStr,
    daysOfWeek: metaDaysOfWeek
  } = metadata;
  if (!metaStartRecurStr || !metaDaysOfWeek) return null;

  let recurrenceStart: Date | null = null;
  const tempStartDate = new Date(metaStartRecurStr);
  if (!isNaN(tempStartDate.getTime())) {
    recurrenceStart = new Date(
      Date.UTC(tempStartDate.getFullYear(), tempStartDate.getMonth(), tempStartDate.getDate())
    );
  }
  if (!recurrenceStart) return null;

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

  if (effectiveStart > effectiveEnd) return null;

  const targetDays = (
    Array.isArray(metaDaysOfWeek)
      ? metaDaysOfWeek
      : String(metaDaysOfWeek)
          .replace(/[\[\]\s]/g, '')
          .split(',')
  )
    .map(d => getDayOfWeekNumber(d))
    .filter((d): d is number => d !== undefined);

  if (targetDays.length === 0) return null;

  return { effectiveStart, effectiveEnd, targetDays };
}

/**
 * NEW FUNCTION: Returns an array of dates for each occurrence of a recurring event within a range.
 * Filters out any dates that exist in the event's skipDates array.
 */
export function getRecurringInstances(
  record: TimeRecord,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): Date[] {
  if (record.metadata.type !== 'recurring') return [];
  const rangeInfo = getRecurrenceDateRange(record.metadata, filterStartDate, filterEndDate);
  if (!rangeInfo) return [];

  const { effectiveStart, effectiveEnd, targetDays } = rangeInfo;
  const instances: Date[] = [];
  const currentDate = new Date(effectiveStart.getTime());

  // Get skipDates as a Set of ISO date strings for fast lookup
  const skipDatesSet = new Set(record.metadata.skipDates || []);

  while (currentDate.getTime() <= effectiveEnd.getTime()) {
    if (targetDays.includes(currentDate.getUTCDay())) {
      const dateStr = getISODate(currentDate);
      // Only include the date if it's not in the skipDates list
      if (dateStr && !skipDatesSet.has(dateStr)) {
        instances.push(new Date(currentDate.getTime()));
      }
    }
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  return instances;
}

/**
 * Calculates how many times a recurring event occurs within a given date range.
 * Excludes any dates that exist in the event's skipDates array.
 */
export function calculateRecurringInstancesInDateRange(
  metadata: OFCEvent,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): number {
  if (metadata.type !== 'recurring') return 0;
  const rangeInfo = getRecurrenceDateRange(metadata, filterStartDate, filterEndDate);
  if (!rangeInfo) return 0;

  const { effectiveStart, effectiveEnd, targetDays } = rangeInfo;
  let count = 0;
  const currentDate = new Date(effectiveStart.getTime());

  // Get skipDates as a Set of ISO date strings for fast lookup
  const skipDatesSet = new Set(metadata.skipDates || []);

  while (currentDate.getTime() <= effectiveEnd.getTime()) {
    if (targetDays.includes(currentDate.getUTCDay())) {
      const dateStr = getISODate(currentDate);
      // Only count the date if it's not in the skipDates list
      if (dateStr && !skipDatesSet.has(dateStr)) {
        count++;
      }
    }
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  return count;
}

/**
 * Returns an array of dates for each occurrence of an rrule event within a range.
 * Filters out any dates that exist in the event's skipDates array.
 */
export function getRruleInstances(
  record: TimeRecord,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): Date[] {
  if (record.metadata.type !== 'rrule') return [];

  const { rrule: rruleString, startDate, skipDates = [] } = record.metadata;
  if (!rruleString || !startDate) return [];

  try {
    // Parse the start date
    const dtstart = new Date(startDate);
    if (isNaN(dtstart.getTime())) return [];

    // Create rrule object
    const rule = rrulestr(rruleString, { dtstart });

    // Set up date range for expansion
    const rangeStart = filterStartDate || new Date('1900-01-01');
    const rangeEnd = filterEndDate || new Date('2100-12-31');

    // Get all instances in the range
    const instances = rule.between(rangeStart, rangeEnd, true);

    // Filter out skipDates
    const skipDatesSet = new Set(skipDates);

    return instances.filter(date => {
      const dateStr = getISODate(date);
      return dateStr && !skipDatesSet.has(dateStr);
    });
  } catch (error) {
    console.warn('Failed to expand rrule:', rruleString, error);
    return [];
  }
}

/**
 * Calculates how many times an rrule event occurs within a given date range.
 * Excludes any dates that exist in the event's skipDates array.
 */
export function calculateRruleInstancesInDateRange(
  metadata: OFCEvent,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): number {
  if (metadata.type !== 'rrule') return 0;

  const { rrule: rruleString, startDate, skipDates = [] } = metadata;
  if (!rruleString || !startDate) return 0;

  try {
    // Parse the start date
    const dtstart = new Date(startDate);
    if (isNaN(dtstart.getTime())) return 0;

    // Create rrule object
    const rule = rrulestr(rruleString, { dtstart });

    // Set up date range for expansion
    const rangeStart = filterStartDate || new Date('1900-01-01');
    const rangeEnd = filterEndDate || new Date('2100-12-31');

    // Get all instances in the range
    const instances = rule.between(rangeStart, rangeEnd, true);

    // Filter out skipDates and count
    const skipDatesSet = new Set(skipDates);

    return instances.filter(date => {
      const dateStr = getISODate(date);
      return dateStr && !skipDatesSet.has(dateStr);
    }).length;
  } catch (error) {
    console.warn('Failed to count rrule instances:', rruleString, error);
    return 0;
  }
}
