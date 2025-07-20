/**
 * @file Timezone.ts
 * @brief Provides core utility functions for timezone conversions.
 *
 * @description
 * This file contains the foundational `convertEvent` function, which is the
 * single source of truth for translating an OFCEvent object from one IANA
- * timezone to another. It uses the `luxon` library to handle the complexities
 * of date and time math, including DST adjustments, ensuring that all time
 * conversions are accurate and consistent.
 *
 * @see FullNoteCalendar.ts
 * @see DailyNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../types';
import { Notice } from 'obsidian';
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
export function convertEvent(event: OFCEvent, sourceZone: string, targetZone: string): OFCEvent {
  // All-day events are timezone-agnostic.
  if (event.allDay) {
    return { ...event };
  }

  // For debugging specific events from your ICS feed.
  // if (event.title.includes('PDE II exam')) {
  //   console.log('--- STAGE 3: Conversion Inputs ---');
  //   console.log('Event Title:', event.title);
  //   console.log('Source Zone:', sourceZone);
  //   console.log('Target Zone:', targetZone);
  //   console.log('Input Start Time:', event.startTime);
  //   console.log('----------------------------------');
  // }

  const newEvent = { ...event };

  // Only proceed if the event has a time component.
  if ('startTime' in event && event.startTime) {
    const dateStr = 'date' in event ? event.date : 'startDate' in event ? event.startDate : null;
    if (!dateStr) return newEvent; // Cannot proceed without a base date.

    const startTime = parseTime(event.startTime);
    if (!startTime) return newEvent; // Invalid start time format.

    // 1. Create a DateTime object representing the absolute start time in the source zone.
    const absoluteStart = DateTime.fromISO(dateStr, { zone: 'utc' }) // Read date as UTC to avoid local shifts
      .set({
        hour: startTime.hour,
        minute: startTime.minute,
        second: 0,
        millisecond: 0
      })
      .setZone(sourceZone, { keepLocalTime: true }); // Then, interpret that time in the source zone.

    // 2. Convert this absolute time to the target zone.
    const newStartInTarget = absoluteStart.setZone(targetZone);

    // 3. Update the new event object with date and time strings from the converted time.
    const newStartDate = newStartInTarget.toISODate();
    if (newStartDate) {
      if ('date' in newEvent) {
        newEvent.date = newStartDate;
      }
      if ('startDate' in newEvent) {
        newEvent.startDate = newStartDate;
      }
    }
    newEvent.startTime = newStartInTarget.toFormat('HH:mm');

    // Handle end time if it exists
    if ('endTime' in event && event.endTime) {
      const endTime = parseTime(event.endTime);
      const endDateStr = 'endDate' in event && event.endDate ? event.endDate : dateStr;

      if (endTime) {
        const absoluteEnd = DateTime.fromISO(endDateStr, { zone: 'utc' })
          .set({
            hour: endTime.hour,
            minute: endTime.minute,
            second: 0,
            millisecond: 0
          })
          .setZone(sourceZone, { keepLocalTime: true });

        const newEndInTarget = absoluteEnd.setZone(targetZone);

        if ('endDate' in newEvent) {
          // Only set endDate if it's on a different day than the start date in the target timezone.
          newEvent.endDate =
            newEndInTarget.toISODate() !== newStartInTarget.toISODate()
              ? newEndInTarget.toISODate()
              : null;
        }
        newEvent.endTime = newEndInTarget.toFormat('HH:mm');
      }
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
    console.log(`Full Calendar: Initialized timezone to ${systemTimezone}`);
  } else if (settings.lastSystemTimezone !== systemTimezone) {
    // Case 2: The system timezone has changed since the last time Obsidian was run.
    // This is a critical change. We must update the user's view.
    const oldDisplayZone = settings.displayTimezone;
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
