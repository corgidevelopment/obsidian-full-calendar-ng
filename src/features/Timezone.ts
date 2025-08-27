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
import { OFCEvent } from '../types';
import FullCalendarPlugin from '../main';

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
    return event;
  }

  // This type guard is essential. Inside this block, `event` is known to have
  // `type: 'single'`, `allDay: false`, and all the necessary date/time properties.
  if (event.type === 'single' && !event.allDay) {
    const startTime = parseTime(event.startTime);
    if (!startTime) {
      return event; // Return original event if start time is invalid.
    }

    // Phase 1: Determine Authoritative Start and End DateTimes in the sourceZone.
    const startDateTime = DateTime.fromISO(`${event.date}T${startTime.toFormat('HH:mm')}`, {
      zone: sourceZone
    });

    let endDateTime: DateTime;
    if (event.endTime) {
      const endTime = parseTime(event.endTime);
      if (!endTime) {
        endDateTime = startDateTime.plus({ hours: 1 });
      } else {
        const endDateString = event.endDate || event.date;
        let tempEndDateTime = DateTime.fromISO(`${endDateString}T${endTime.toFormat('HH:mm')}`, {
          zone: sourceZone
        });

        if (!event.endDate && tempEndDateTime < startDateTime) {
          tempEndDateTime = tempEndDateTime.plus({ days: 1 });
        }
        endDateTime = tempEndDateTime;
      }
    } else {
      endDateTime = startDateTime.plus({ hours: 1 });
    }

    // Phase 2: Convert Authoritative DateTimes to the targetZone.
    const convertedStart = startDateTime.setZone(targetZone);
    const convertedEnd = endDateTime.setZone(targetZone);

    // Phase 3: Deconstruct into a new OFCEvent object within the return statement.
    const finalEndDate = convertedStart.hasSame(convertedEnd, 'day')
      ? null
      : convertedEnd.startOf('day').equals(convertedEnd)
        ? convertedEnd.minus({ milliseconds: 1 }).toISODate()!
        : convertedEnd.toISODate()!;

    return {
      ...event,
      date: convertedStart.toISODate()!,
      startTime: convertedStart.toFormat('HH:mm'),
      endTime: convertedEnd.toFormat('HH:mm'),
      endDate: finalEndDate
    };
  }

  // For recurring events or other types, return the event unmodified for now.
  return event;
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
