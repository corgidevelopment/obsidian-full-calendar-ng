/**
 * @file Timezone.ts
 * @brief Provides core utility functions for timezone conversions.
 *
 * @description
 * This file contains the foundational `convertEvent` function, which is the
 * single source of truth for translating an OFCEvent object from one IANA
 * timezone to another. It uses the `luxon` library to handle the complexities
 * of date and time math, including DST adjustments, ensuring that all time
 * conversions are accurate and consistent.
 *
 * @see FullNoteCalendar.ts
 * @see DailyNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { Notice } from 'obsidian';
import { OFCEvent } from '../../types';
import FullCalendarPlugin from '../../main';

/**
 * Helper function to parse a time string (HH:mm or h:mm a) into a Luxon DateTime object.
 * Note: This returns a full DateTime, but we only use the time part.
 */
function parseTime(time: string): DateTime | null {
  let parsed = DateTime.fromFormat(time, 'HH:mm');
  if (!parsed.isValid) {
    parsed = DateTime.fromFormat(time, 'h:mm a');
  }
  return parsed.isValid ? parsed : null;
}

/**
 * Translates the date/time fields of an OFCEvent from a source timezone to a target timezone.
 * All-day events are returned unmodified.
 * @param event The event to convert.
 * @param sourceZone The IANA timezone the event's times are currently in.
 * @param targetZone The IANA timezone to convert the event's times to.
 * @returns A new OFCEvent object with its time fields adjusted to the target timezone.
 */
export function convertEvent<T extends OFCEvent>(
  event: T,
  sourceZone: string,
  targetZone: string
): T {
  // All-day events are timezone-agnostic and returned as is.
  if (event.allDay) {
    return { ...event };
  }

  // Cast the event to its timed version. The `allDay` check above ensures this is safe.
  const newEvent = { ...event } as T & { allDay: false };

  const startTime = parseTime(newEvent.startTime);
  if (!startTime) {
    return newEvent; // Return if start time is invalid.
  }

  // Helper function to perform the core conversion logic on a given date string.
  const convert = (date: string, time: DateTime) =>
    DateTime.fromISO(`${date}T${time.toFormat('HH:mm')}`, { zone: sourceZone }).setZone(targetZone);

  // Handle conversion based on the event type.
  switch (newEvent.type) {
    case 'single': {
      const newStart = convert(newEvent.date, startTime);
      newEvent.date = newStart.toISODate()!;
      newEvent.startTime = newStart.toFormat('HH:mm');

      if (newEvent.endTime) {
        const endTime = parseTime(newEvent.endTime);
        if (endTime) {
          const endDateSrc = newEvent.endDate || newEvent.date;
          const newEnd = convert(endDateSrc, endTime);
          newEvent.endTime = newEnd.toFormat('HH:mm');
          newEvent.endDate = newEnd.toISODate()! !== newEvent.date ? newEnd.toISODate()! : null;
        }
      }
      break;
    }

    case 'recurring': {
      if (Array.isArray(newEvent.skipDates) && newEvent.skipDates.length) {
        newEvent.skipDates = newEvent.skipDates.map(
          (d: string) => convert(d, startTime).toISODate()!
        );
      }

      const dateStr = newEvent.startRecur;
      if (!dateStr) break;

      const newStart = convert(dateStr, startTime);
      newEvent.startRecur = newStart.toISODate()!;
      newEvent.startTime = newStart.toFormat('HH:mm');

      const originalStart = DateTime.fromISO(`${dateStr}T${startTime.toFormat('HH:mm')}`, {
        zone: sourceZone
      });
      const dayShift = Math.round(
        newStart.startOf('day').diff(originalStart.startOf('day'), 'days').get('days')
      );

      if (dayShift !== 0 && newEvent.daysOfWeek) {
        const dayMap: Record<string, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
        const reverseDayMap: string[] = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];

        newEvent.daysOfWeek = newEvent.daysOfWeek.map((day: string) => {
          const originalIndex = dayMap[day];
          if (originalIndex === undefined) return day;
          const newIndex = (originalIndex + dayShift + 7) % 7;
          return reverseDayMap[newIndex];
        }) as typeof newEvent.daysOfWeek;
      }

      if (newEvent.endTime) {
        const endTime = parseTime(newEvent.endTime);
        if (endTime) {
          const endDateSrc = newEvent.endRecur || dateStr;
          const newEnd = convert(endDateSrc, endTime);
          newEvent.endTime = newEnd.toFormat('HH:mm');
          if (newEvent.endRecur) {
            newEvent.endRecur = newEnd.toISODate()!;
          }
        }
      }
      break;
    }
    // ^^^ END OF REPLACEMENT ^^^

    case 'rrule': {
      if (Array.isArray(newEvent.skipDates) && newEvent.skipDates.length) {
        newEvent.skipDates = newEvent.skipDates.map(
          (d: string) => convert(d, startTime).toISODate()!
        );
      }
      const dateStr = newEvent.startDate;
      if (!dateStr) break;

      const newStart = convert(dateStr, startTime);
      newEvent.startDate = newStart.toISODate()!;
      newEvent.startTime = newStart.toFormat('HH:mm');

      if (newEvent.endTime) {
        const endTime = parseTime(newEvent.endTime);
        if (endTime) {
          const endDateSrc = newEvent.startDate;
          const newEnd = convert(endDateSrc, endTime);
          newEvent.endTime = newEnd.toFormat('HH:mm');
        }
      }
      break;
    }
  }

  return newEvent;
}

/**
 * Manages the plugin's timezone settings by comparing the system timezone with stored settings.
 * This function should be called once when the plugin loads.
 *
 * @param plugin The instance of the FullCalendarPlugin.
 */
export async function manageTimezone(plugin: FullCalendarPlugin): Promise<void> {
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const settings = plugin.settings;

  if (!settings.lastSystemTimezone || settings.displayTimezone === null) {
    // Case 1: First run, or settings are in a pre-timezone-feature state.
    // Initialize everything to the current system's timezone.
    settings.lastSystemTimezone = systemTimezone;
    settings.displayTimezone = systemTimezone;
    // Use saveData directly to avoid triggering a full cache reset.
    await plugin.saveData(settings);
    // console.log(`Full Calendar: Initialized timezone to ${systemTimezone}`);
  } else if (settings.lastSystemTimezone !== systemTimezone) {
    // Case 2: The system timezone has changed since the last time Obsidian was run.
    // This is a critical change. We must update the user's view.
    settings.displayTimezone = systemTimezone; // Force reset the display timezone.
    settings.lastSystemTimezone = systemTimezone;
    await plugin.saveData(settings);

    new Notice(
      `System timezone changed to ${systemTimezone}. Full Calendar view updated to match.`,
      10000 // 10-second notice
    );
  }
  // Case 3: System timezone is unchanged. We do nothing, respecting the user's
  // potentially custom `displayTimezone` setting from the settings tab.
}
