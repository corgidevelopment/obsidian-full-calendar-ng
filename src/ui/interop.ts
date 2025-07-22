/**
 * @file interop.ts
 * @brief Provides data conversion functions between OFCEvent and FullCalendar's EventInput.
 *
 * @description
 * This file is a critical data-translation layer. It contains the logic for
 * converting the plugin's internal `OFCEvent` format into the `EventInput`
 * format that the FullCalendar.js library understands, and vice-versa. This
 * "interoperability" is essential for displaying events correctly and for
 * processing user interactions like dragging and resizing.
 *
 * @exports toEventInput
 * @exports toOFCEvent
 *
 * @license See LICENSE.md
 */

import { EventApi, EventInput } from '@fullcalendar/core';
import { OFCEvent } from '../types';

import { DateTime, Duration } from 'luxon';
import { rrulestr } from 'rrule';
import { FullCalendarSettings } from './settings';
import { getCalendarColors } from './view';

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
 * @param frontmatter The OFCEvent object, which has a CLEAN title.
 * @param settings The plugin settings, used for category coloring.
 * @returns An `EventInput` object, or `null` if the event data is invalid.
 */
export function toEventInput(
  id: string,
  frontmatter: OFCEvent,
  settings: FullCalendarSettings
): EventInput | null {
  let event: EventInput = {
    id,
    title: frontmatter.title, // Use the clean title for display
    allDay: frontmatter.allDay,
    extendedProps: {
      category: frontmatter.category
    }
  };

  if (settings.enableCategoryColoring && frontmatter.category) {
    const categorySetting = (settings.categorySettings || []).find(
      (c: any) => c.name === frontmatter.category
    );
    if (categorySetting) {
      const { color, textColor } = getCalendarColors(categorySetting.color);
      event.color = color;
      event.textColor = textColor;
    }
  }

  if (frontmatter.type === 'recurring') {
    event = {
      ...event,
      daysOfWeek: frontmatter.daysOfWeek.map(c => DAYS.indexOf(c)),
      startRecur: frontmatter.startRecur,
      endRecur: frontmatter.endRecur,
      extendedProps: { ...event.extendedProps, isTask: false }
    };
    if (!frontmatter.allDay) {
      event = {
        ...event,
        startTime: normalizeTimeString(frontmatter.startTime || ''),
        endTime: frontmatter.endTime ? normalizeTimeString(frontmatter.endTime) : undefined
      };
    }
  } else if (frontmatter.type === 'rrule') {
    const dtstart = (() => {
      if (frontmatter.allDay) {
        return DateTime.fromISO(frontmatter.startDate);
      } else {
        const dtstartStr = combineDateTimeStrings(frontmatter.startDate, frontmatter.startTime);

        if (!dtstartStr) {
          return null;
        }
        return DateTime.fromISO(dtstartStr);
      }
    })();
    if (dtstart === null) {
      return null;
    }
    // NOTE: how exdates are handled does not support events which recur more than once per day.
    const exdate = frontmatter.skipDates
      .map(d => {
        // Can't do date arithmetic because timezone might change for different exdates due to DST.
        // RRule only has one dtstart that doesn't know about DST/timezone changes.
        // Therefore, just concatenate the date for this exdate and the start time for the event together.
        const date = DateTime.fromISO(d).toISODate();
        const time = dtstart.toJSDate().toISOString().split('T')[1];

        return `${date}T${time}`;
      })
      .flatMap(d => (d ? d : []));

    event = {
      id,
      title: frontmatter.title,
      allDay: frontmatter.allDay,
      rrule: rrulestr(frontmatter.rrule, {
        dtstart: dtstart.toJSDate()
      }).toString(),
      exdate
    };

    if (!frontmatter.allDay) {
      const startTime = parseTime(frontmatter.startTime);
      if (startTime && frontmatter.endTime) {
        const endTime = parseTime(frontmatter.endTime);
        const duration = endTime?.minus(startTime);
        if (duration) {
          event.duration = duration.toISOTime({
            includePrefix: false,
            suppressMilliseconds: true,
            suppressSeconds: true
          });
        }
      }
    }
  } else if (frontmatter.type === 'single') {
    if (!frontmatter.allDay) {
      const start = combineDateTimeStrings(frontmatter.date, frontmatter.startTime);
      if (!start) {
        return null;
      }
      let end = undefined;
      if (frontmatter.endTime) {
        end = combineDateTimeStrings(frontmatter.endDate || frontmatter.date, frontmatter.endTime);
        if (!end) {
          return null;
        }
      }

      event = {
        ...event,
        start,
        end,
        extendedProps: {
          ...event.extendedProps,
          isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
          taskCompleted: frontmatter.completed
        }
      };
    } else {
      event = {
        ...event,
        start: frontmatter.date,
        end: frontmatter.endDate || undefined,
        extendedProps: {
          ...event.extendedProps,
          isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
          taskCompleted: frontmatter.completed
        }
      };
    }
  }

  return event;
}

/**
 * Converts an `EventApi` object from FullCalendar back into an `OFCEvent`.
 * This is typically used after a user interaction, like dragging or resizing an event,
 * to get the new event data in a format that can be saved back to the cache and disk.
 *
 * @param event The `EventApi` object from FullCalendar.
 * @returns An `OFCEvent` object.
 */
export function fromEventApi(event: EventApi): OFCEvent {
  // We need the category from the original event, as it's not stored on the EventApi object.
  // This is a limitation. We assume the category does not change on drag/resize.
  // The edit modal is the only place to change a category.
  const originalCategory = event.extendedProps.category;

  const isRecurring: boolean = event.extendedProps.daysOfWeek !== undefined;
  const startDate = getDate(event.start as Date);
  const endDate = getDate(event.end as Date);
  return {
    title: event.title,
    category: originalCategory, // Preserve the category
    ...(event.allDay
      ? { allDay: true }
      : {
          allDay: false,
          startTime: getTime(event.start as Date),
          endTime: getTime(event.end as Date)
        }),

    ...(isRecurring
      ? {
          type: 'recurring',
          daysOfWeek: event.extendedProps.daysOfWeek.map((i: number) => DAYS[i]),
          startRecur: event.extendedProps.startRecur && getDate(event.extendedProps.startRecur),
          endRecur: event.extendedProps.endRecur && getDate(event.extendedProps.endRecur)
        }
      : {
          type: 'single',
          date: startDate,
          ...(startDate !== endDate ? { endDate } : { endDate: null }),
          completed: event.extendedProps.taskCompleted
        })
  };
}
