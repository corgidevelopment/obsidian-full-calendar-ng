/**
 * @file interop.ts
 * @brief Provides data conversion functions between OFCEvent and FullCalendar's EventInput.
 *
 * @description
 * This module acts as a data-translation layer between the plugin's internal `OFCEvent` format and FullCalendar's `EventInput` format.
 * It ensures correct INTEROPerability for displaying events and handling user interactions such as dragging and resizing.
 * The conversion logic supports single, recurring, and rrule-based events, including timezone-aware processing and category coloring.
 *
 * @packageDocumentation
 * @module interop
 *
 * @exports toEventInput
 * @exports fromEventApi
 * @exports dateEndpointsToFrontmatter
 *
 * @license See LICENSE.md
 */

import { rrulestr } from 'rrule';
import { DateTime, Duration } from 'luxon';

import { OFCEvent } from '../types';
import { getCalendarColors } from '../ui/view';
import { FullCalendarSettings } from '../types/settings';

import { EventApi, EventInput } from '@fullcalendar/core';

/**
 * Functions for converting between the types used by the FullCalendar view plugin and
 * types used internally by Obsidian Full Calendar.
 *
 */
const parseTime = (time: string): Duration | null => {
  let parsed = DateTime.fromFormat(time, 'h:mm a');
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'HH:mm');
  }
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'HH:mm:ss');
  }

  if (parsed.invalidReason) {
    console.error(`FC: Error parsing time string '${time}': ${parsed.invalidReason}'`);
    return null;
  }

  const isoTime = parsed.toISOTime({
    includeOffset: false,
    includePrefix: false
  });

  if (!isoTime) {
    console.error(`FC: Could not convert parsed time to ISO for '${time}'`);
    return null;
  }

  return Duration.fromISOTime(isoTime);
};

const normalizeTimeString = (time: string): string | null => {
  const parsed = parseTime(time);
  if (!parsed) {
    return null;
  }
  return parsed.toISOTime({
    suppressMilliseconds: true,
    includePrefix: false,
    suppressSeconds: true
  });
};

const add = (date: DateTime, time: Duration): DateTime => {
  let hours = time.hours;
  let minutes = time.minutes;
  return date.set({ hour: hours, minute: minutes });
};

const getTime = (date: Date): string => {
  const isoTime = DateTime.fromJSDate(date).toISOTime({
    suppressMilliseconds: true,
    includeOffset: false,
    suppressSeconds: true
  });
  if (!isoTime) {
    console.error('FC: Invalid time conversion from date:', date);
    return '';
  }
  return isoTime;
};

const getDate = (date: Date): string => DateTime.fromJSDate(date).toISODate() ?? '';

const combineDateTimeStrings = (date: string, time: string): string | null => {
  const parsedDate = DateTime.fromISO(date);
  if (parsedDate.invalidReason) {
    console.error(`FC: Error parsing time string '${date}': ${parsedDate.invalidReason}`);
    return null;
  }

  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return null;
  }

  return add(parsedDate, parsedTime).toISO({
    includeOffset: false,
    suppressMilliseconds: true
  });
};

const DAYS = 'UMTWRFS';

export function dateEndpointsToFrontmatter(
  start: Date,
  end: Date,
  allDay: boolean
): Partial<OFCEvent> {
  const date = getDate(start);
  const endDate = getDate(end);
  return {
    type: 'single',
    date,
    endDate: date !== endDate ? endDate : undefined,
    allDay,
    ...(allDay
      ? {}
      : {
          startTime: getTime(start),
          endTime: getTime(end)
        })
  };
}

/**
 * Converts an OFCEvent from the cache into an EventInput object that FullCalendar can render.
 * This function handles all event types (single, recurring, rrule) and correctly
 * formats dates, times, and recurrence rules.
 *
 * @param id The unique ID of the event.
 * @param frontmatter The OFCEvent object from the cache. Its dates/times have already been
 *                    converted to the display timezone by the `convertEvent` function.
 * @param settings The plugin settings, used for category coloring.
 * @returns An `EventInput` object, or `null` if the event data is invalid.
 */

export function toEventInput(
  id: string,
  frontmatter: OFCEvent,
  settings: FullCalendarSettings
): EventInput | null {
  // MODIFICATION: Return type is now EventInput | null
  const displayTitle = frontmatter.subCategory
    ? `${frontmatter.subCategory} - ${frontmatter.title}`
    : frontmatter.title;

  let baseEvent: EventInput = {
    id,
    title: displayTitle,
    allDay: frontmatter.allDay,
    extendedProps: {
      uid: frontmatter.uid,
      recurringEventId: frontmatter.recurringEventId,
      category: frontmatter.category,
      subCategory: frontmatter.subCategory,
      cleanTitle: frontmatter.title,
      isShadow: false // Flag to identify the real event
    },
    // Support for background events and other display types
    ...(frontmatter.display && { display: frontmatter.display })
  };

  // Assign category-level coloring
  if (settings.enableAdvancedCategorization && frontmatter.category) {
    const categorySetting = (settings.categorySettings || []).find(
      (c: { name: string; color: string }) => c.name === frontmatter.category
    );
    if (categorySetting) {
      const { color, textColor } = getCalendarColors(categorySetting.color);
      baseEvent.color = color;
      baseEvent.textColor = textColor;
    }

    // NEW: Assign resource ID for timeline view
    const subCategoryName = frontmatter.subCategory || '__NONE__';
    baseEvent.resourceId = `${frontmatter.category}::${subCategoryName}`;
  }

  // --- Main Event Logic (largely the same, but populates baseEvent) ---
  if (frontmatter.type === 'recurring') {
    // ====================================================================
    // Time-zone–aware conversion (fixed version)
    // ====================================================================

    // 1  Pick the zone
    const displayZone =
      frontmatter.timezone || settings.displayTimezone || DateTime.local().zoneName;

    // Use a recent default start date to avoid massive recurrence expansions when startRecur is absent.
    const startRecurDate =
      frontmatter.startRecur ||
      DateTime.local().startOf('year').toISODate() ||
      DateTime.local().toISODate() ||
      '2025-01-01';
    let dtstart: DateTime;

    // 2  Build the local start-of-series DateTime
    if (frontmatter.allDay) {
      dtstart = DateTime.fromISO(startRecurDate, { zone: displayZone }).startOf('day'); // 00:00 in displayZone
    } else {
      const startTimeDt = parseTime(frontmatter.startTime);
      if (!startTimeDt) return null;

      dtstart = DateTime.fromISO(startRecurDate, { zone: displayZone }).set({
        hour: startTimeDt.hours,
        minute: startTimeDt.minutes,
        second: 0,
        millisecond: 0
      });
    }

    // 3  RRULE string (plus UNTIL if endRecur exists)
    // START REPLACEMENT
    let rruleString: string;
    const weekdays = { U: 'SU', M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA' };
    const rruleWeekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

    if (frontmatter.daysOfWeek?.length) {
      const byday = frontmatter.daysOfWeek.map((c: keyof typeof weekdays) => weekdays[c]);
      rruleString = `FREQ=WEEKLY;BYDAY=${byday.join(',')}`;
    } else if (frontmatter.repeatOn) {
      const byday = rruleWeekdays[frontmatter.repeatOn.weekday];
      const bysetpos = frontmatter.repeatOn.week;
      // Note: rrule.js seems to use BYSETPOS for this, which is correct.
      rruleString = `FREQ=MONTHLY;BYDAY=${byday};BYSETPOS=${bysetpos}`;
    } else if (frontmatter.month && frontmatter.dayOfMonth) {
      rruleString = `FREQ=YEARLY;BYMONTH=${frontmatter.month};BYMONTHDAY=${frontmatter.dayOfMonth}`;
    } else if (frontmatter.dayOfMonth) {
      rruleString = `FREQ=MONTHLY;BYMONTHDAY=${frontmatter.dayOfMonth}`;
    } else {
      console.error('FullCalendar: invalid recurring event frontmatter.', frontmatter);
      return null;
    }

    if (frontmatter.repeatInterval && frontmatter.repeatInterval > 1) {
      rruleString += `;INTERVAL=${frontmatter.repeatInterval}`;
    }
    // END REPLACEMENT

    if (frontmatter.endRecur) {
      const endLocal = DateTime.fromISO(frontmatter.endRecur, { zone: displayZone }).endOf('day');

      // Only add UNTIL if it occurs on/after the first generated instance
      const firstOccurDate = rrulestr(`RRULE:${rruleString}`, {
        dtstart: dtstart.toJSDate()
      }).after(dtstart.toJSDate(), true);

      if (firstOccurDate) {
        const firstOccur = DateTime.fromJSDate(firstOccurDate, { zone: displayZone });
        if (endLocal >= firstOccur.startOf('day')) {
          const until = endLocal.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
          rruleString += `;UNTIL=${until}`;
        }
      }
    }

    // 4  DTSTART – always include TZID to avoid floating-date bugs
    const dtstartString = `DTSTART;TZID=${displayZone}:${dtstart.toFormat("yyyyMMdd'T'HHmmss")}`;

    // 5  EXDATEs – also anchored to the same zone
    const exdateStrings = (frontmatter.skipDates || [])
      .map((skipDate: string) => {
        if (frontmatter.allDay) {
          const exDt = DateTime.fromISO(skipDate, { zone: displayZone }).startOf('day');
          return `EXDATE;TZID=${displayZone}:${exDt.toFormat("yyyyMMdd'T'HHmmss")}`;
        } else {
          const startTimeDt = parseTime(frontmatter.startTime);
          if (!startTimeDt) return null;

          const exDt = DateTime.fromISO(skipDate, { zone: displayZone }).set({
            hour: startTimeDt.hours,
            minute: startTimeDt.minutes,
            second: 0,
            millisecond: 0
          });
          return `EXDATE;TZID=${displayZone}:${exDt.toFormat("yyyyMMdd'T'HHmmss")}`;
        }
      })
      .filter(Boolean) as string[];

    // 6  Assemble the full iCalendar text
    baseEvent.rrule = [dtstartString, `RRULE:${rruleString}`, ...exdateStrings].join('\n');

    // 7  Duration for timed events
    if (!frontmatter.allDay && frontmatter.startTime && frontmatter.endTime) {
      const startTime = parseTime(frontmatter.startTime);
      const endTime = parseTime(frontmatter.endTime);
      if (startTime && endTime) {
        // Use Luxon to handle date math correctly, accounting for potential day crossing
        let startDt = DateTime.fromISO(
          combineDateTimeStrings(frontmatter.startRecur || '2025-01-01', frontmatter.startTime)!
        );
        let endDt = DateTime.fromISO(
          combineDateTimeStrings(
            frontmatter.endDate || frontmatter.startRecur || '2025-01-01',
            frontmatter.endTime
          )!
        );

        // If end time is logically before start time, it means it's on the next day
        if (endDt < startDt) {
          endDt = endDt.plus({ days: 1 });
        }

        const duration = endDt.diff(startDt);
        if (duration.as('milliseconds') > 0) {
          baseEvent.duration = duration.toFormat('hh:mm');
        }
      }
    }

    // 8  Misc. extended props
    baseEvent.extendedProps = {
      ...baseEvent.extendedProps,
      isTask: !!frontmatter.isTask
    };

    // Tell FullCalendar it’s all-day when relevant
    baseEvent.allDay = !!frontmatter.allDay;
  } else if (frontmatter.type === 'rrule') {
    const fm = frontmatter as any;

    // DEBUG: Log rrule event processing for the 123123 event
    const isDebugEvent = frontmatter.title === '123123';
    if (isDebugEvent) {
      console.log('[FC DEBUG] toEventInput processing rrule event "123123"');
      console.log('[FC DEBUG] Input frontmatter:', JSON.stringify(frontmatter, null, 2));
      console.log('[FC DEBUG] Settings displayTimezone:', settings.displayTimezone);
    }

    // Determine source and display timezones
    const sourceZone = frontmatter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const displayZone =
      settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (isDebugEvent) {
      console.log('[FC DEBUG] sourceZone:', sourceZone);
      console.log('[FC DEBUG] displayZone:', displayZone);
    }

    // Parse the event time in its source timezone first
    const dtstartStr = frontmatter.allDay
      ? null
      : combineDateTimeStrings(fm.startDate, fm.startTime);
    if (!frontmatter.allDay && !dtstartStr) {
      return null;
    }

    const dtInSource = frontmatter.allDay
      ? DateTime.fromISO(fm.startDate, { zone: sourceZone })
      : DateTime.fromISO(dtstartStr!, { zone: sourceZone });

    // Convert to display timezone to get the correct display time
    const dtInDisplay = dtInSource.setZone(displayZone);

    // Calculate the day offset: how many days the date shifts when converting timezones
    // This is CRITICAL for cross-timezone events that cross day boundaries
    const dayOffset =
      dtInDisplay.ordinal - dtInSource.ordinal + (dtInDisplay.year - dtInSource.year) * 365; // Approximate, but works for small offsets

    if (isDebugEvent) {
      console.log('[FC DEBUG] dtInSource:', dtInSource.toString());
      console.log('[FC DEBUG] dtInSource weekday:', dtInSource.weekdayLong);
      console.log('[FC DEBUG] dtInDisplay:', dtInDisplay.toString());
      console.log('[FC DEBUG] dtInDisplay weekday:', dtInDisplay.weekdayLong);
      console.log('[FC DEBUG] dayOffset:', dayOffset);
    }

    // Adjust BYDAY rules if the timezone conversion shifts the day
    let adjustedRrule = frontmatter.rrule;
    if (dayOffset !== 0 && adjustedRrule.includes('BYDAY=')) {
      // Map of weekday names
      const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

      // Extract BYDAY value
      const bydayMatch = adjustedRrule.match(/BYDAY=([A-Z,]+)/);
      if (bydayMatch) {
        const originalDays = bydayMatch[1].split(',');
        const adjustedDays = originalDays.map((day: string) => {
          const dayIndex = weekdays.indexOf(day);
          if (dayIndex === -1) return day;
          // Apply day offset (negative offset = earlier day)
          let newIndex = (dayIndex + dayOffset) % 7;
          if (newIndex < 0) newIndex += 7;
          return weekdays[newIndex];
        });
        adjustedRrule = adjustedRrule.replace(/BYDAY=[A-Z,]+/, `BYDAY=${adjustedDays.join(',')}`);

        if (isDebugEvent) {
          console.log('[FC DEBUG] Original BYDAY:', originalDays);
          console.log('[FC DEBUG] Adjusted BYDAY:', adjustedDays);
          console.log('[FC DEBUG] Adjusted rrule:', adjustedRrule);
        }
      }
    }

    // Use display timezone for DTSTART so times display correctly
    // The BYDAY has been adjusted to compensate for any day shift
    const dtstart = dtInDisplay;

    if (isDebugEvent) {
      console.log('[FC DEBUG] Final dtstart:', dtstart.toString());
      console.log('[FC DEBUG] dtstart weekday:', dtstart.weekdayLong);
    }

    // Construct exdates - these need to be in "fake UTC" format where the local time
    // in the display timezone is stored in UTC components (matching the monkeypatch behavior)
    const exdate = fm.skipDates
      .map((d: string) => {
        // Parse the skip date with the event's start time in the source timezone
        const exInSource = DateTime.fromISO(`${d}T${fm.startTime}`, { zone: sourceZone });
        // Convert to display timezone to get the local time
        const exInDisplay = exInSource.setZone(displayZone);
        // Create a "fake UTC" date where the local time is stored in UTC components
        // This matches how the monkeypatch stores times for FullCalendar
        const fakeUtc = new Date(
          Date.UTC(
            exInDisplay.year,
            exInDisplay.month - 1, // JS months are 0-indexed
            exInDisplay.day,
            exInDisplay.hour,
            exInDisplay.minute,
            exInDisplay.second,
            exInDisplay.millisecond
          )
        );
        return fakeUtc.toISOString();
      })
      .flatMap((d: string | null) => (d ? [d] : []));

    // Construct the rrule string with DISPLAY timezone and ADJUSTED BYDAY
    // This ensures the event displays at the correct time in the user's timezone
    const dtstartString = `DTSTART;TZID=${displayZone}:${dtstart.toFormat("yyyyMMdd'T'HHmmss")}`;
    const rruleString = adjustedRrule;

    if (isDebugEvent) {
      console.log('[FC DEBUG] dtstartString:', dtstartString);
      console.log('[FC DEBUG] rruleString (adjusted):', rruleString);
      console.log(
        '[FC DEBUG] Combined rrule for FullCalendar:',
        [dtstartString, rruleString].join('\n')
      );
      console.log('[FC DEBUG] exdates:', exdate);
    }

    baseEvent.rrule = [dtstartString, rruleString].join('\n');
    baseEvent.exdate = exdate;
    baseEvent.extendedProps = { ...baseEvent.extendedProps, isTask: !!frontmatter.isTask };

    if (!frontmatter.allDay) {
      // Calculate duration using the source timezone times (duration is timezone-independent)
      const startTime = parseTime(frontmatter.startTime);
      if (startTime && frontmatter.endTime) {
        const endTime = parseTime(frontmatter.endTime);
        if (endTime) {
          // Parse in source timezone to get correct duration
          let startDt = DateTime.fromISO(
            combineDateTimeStrings(frontmatter.startDate, frontmatter.startTime)!,
            { zone: sourceZone }
          );
          let endDt = DateTime.fromISO(
            combineDateTimeStrings(
              frontmatter.endDate || frontmatter.startDate,
              frontmatter.endTime
            )!,
            { zone: sourceZone }
          );

          if (endDt < startDt) {
            endDt = endDt.plus({ days: 1 });
          }

          const duration = endDt.diff(startDt);
          if (duration.as('milliseconds') > 0) {
            baseEvent.duration = duration.toISOTime({
              includePrefix: false,
              suppressMilliseconds: true,
              suppressSeconds: true
            });

            if (isDebugEvent) {
              console.log('[FC DEBUG] startDt (source):', startDt.toString());
              console.log('[FC DEBUG] endDt (source):', endDt.toString());
              console.log('[FC DEBUG] Calculated duration:', baseEvent.duration);
            }
          }
        }
      }
    }

    if (isDebugEvent) {
      console.log(
        '[FC DEBUG] Final baseEvent for FullCalendar:',
        JSON.stringify(baseEvent, null, 2)
      );
    }
  } else if (frontmatter.type === 'single') {
    if (!frontmatter.allDay) {
      const start = combineDateTimeStrings(frontmatter.date, frontmatter.startTime);
      if (!start) {
        return null;
      }
      let end: string | null | undefined = undefined;
      if (frontmatter.endTime) {
        end = combineDateTimeStrings(frontmatter.endDate || frontmatter.date, frontmatter.endTime);
        if (!end) {
          return null;
        }
      }

      baseEvent.start = start;
      baseEvent.end = end;
      baseEvent.extendedProps = {
        ...baseEvent.extendedProps,
        isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
        taskCompleted: frontmatter.completed
      };
    } else {
      let adjustedEndDate: string | undefined;

      if (frontmatter.endDate) {
        // OFCEvent has an inclusive endDate. FullCalendar needs an exclusive one.
        // Add one day to any multi-day all-day event's end date.
        adjustedEndDate =
          DateTime.fromISO(frontmatter.endDate).plus({ days: 1 }).toISODate() ?? undefined;
      }

      baseEvent.start = frontmatter.date;
      baseEvent.end = adjustedEndDate;
      baseEvent.extendedProps = {
        ...baseEvent.extendedProps,
        isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
        taskCompleted: frontmatter.completed
      };
    }
  }

  // REMOVED SHADOW EVENT LOGIC
  return baseEvent;
}

/**
 * Converts an `EventApi` object from FullCalendar back into an `OFCEvent`.
 * This is typically used after a user interaction, like dragging or resizing an event,
 * to get the new event data in a format that can be saved back to the cache and disk.
 *
 * @param event The `EventApi` object from FullCalendar.
 * @returns An `OFCEvent` object.
 */
export function fromEventApi(event: EventApi, newResource?: string): OFCEvent {
  let category: string | undefined = event.extendedProps.category;
  let subCategory: string | undefined = event.extendedProps.subCategory;

  // Check for resource ID safely - resource property may be added by FullCalendar resource plugin
  const resourceId =
    newResource ||
    (() => {
      const eventWithResource = event as EventApi & { resource?: { id: string } };
      return eventWithResource.resource?.id;
    })();

  if (resourceId) {
    const parts = resourceId.split('::');
    if (parts.length === 2) {
      // This is a sub-category resource, e.g., "Work::Project"
      category = parts[0];
      subCategory = parts[1] === '__NONE__' ? undefined : parts[1];
    } else {
      // This is a top-level category resource, e.g., "Work"
      category = resourceId;
      subCategory = undefined; // Dropped on a parent, so it has no sub-category.
    }
  }

  const isRecurring: boolean = event.extendedProps.daysOfWeek !== undefined;
  const startDate = getDate(event.start as Date);
  // Correctly calculate endDate for multi-day events.
  // FullCalendar's end date is exclusive, so we might need to subtract a day.
  const endDate = event.end ? getDate(new Date(event.end.getTime() - 1)) : startDate;

  return {
    uid: event.extendedProps.uid,
    title: event.extendedProps.cleanTitle || event.title,
    category,
    subCategory, // Add subCategory here
    recurringEventId: event.extendedProps.recurringEventId,
    ...(event.allDay
      ? { allDay: true }
      : {
          allDay: false,
          startTime: getTime(event.start as Date),
          endTime: getTime(event.end as Date)
        }),

    ...(isRecurring
      ? {
          type: 'recurring' as const,
          endDate: null,
          daysOfWeek: event.extendedProps.daysOfWeek.map((i: number) => DAYS[i]),
          startRecur: event.extendedProps.startRecur && getDate(event.extendedProps.startRecur),
          endRecur: event.extendedProps.endRecur && getDate(event.extendedProps.endRecur),
          skipDates: [], // Default to empty as exception info is unavailable
          isTask: event.extendedProps.isTask
        }
      : {
          type: 'single',
          date: startDate,
          ...(startDate !== endDate ? { endDate } : { endDate: null }),
          completed: event.extendedProps.isTask
            ? (event.extendedProps.taskCompleted ?? false)
            : event.extendedProps.taskCompleted
        })
  };
}
