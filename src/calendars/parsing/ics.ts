/**
 * @file ics.ts
 * @brief Provides functions for parsing iCalendar (ICS) data into OFCEvents.
 *
 * @description
 * This file serves as the primary data translation layer for the iCalendar
 * format. It uses the `ical.js` library to parse raw ICS text and converts
 * iCalendar components (Vevent) into the plugin's internal `OFCEvent` format.
 * It correctly handles single events, recurring events (RRULE), and
 * recurrence exceptions (EXDATE, RECURRENCE-ID).
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { rrulestr } from 'rrule';

import ical from 'ical.js';
import { OFCEvent, validateEvent } from '../../types';

/**
 * Converts an ical.js Time object into a Luxon DateTime object.
 * This version manually constructs the DateTime from components to avoid
 * the automatic local timezone conversion of .toJSDate().
 */
function icalTimeToLuxon(t: ical.Time): DateTime {
  const components = {
    year: t.year,
    month: t.month,
    day: t.day,
    hour: t.hour,
    minute: t.minute,
    second: t.second
  };
  // The components are parsed in the event's specified timezone.
  // If the timezone is 'Z' (UTC), we use 'utc'. Otherwise, we use the specified timezone.
  const zone = t.timezone === 'Z' ? 'utc' : t.timezone;
  return DateTime.fromObject(components, { zone });
}

/**
 * Extracts the time part (HH:mm) from a Luxon DateTime object.
 * We must specify the format string to ensure it's always 24-hour time.
 */
function getLuxonTime(dt: DateTime): string | null {
  return dt.toFormat('HH:mm');
}

// Keep the getLuxonDate function as is:
function getLuxonDate(dt: DateTime): string | null {
  return dt.toISODate();
}

// ====================================================================

function extractEventUrl(iCalEvent: ical.Event): string {
  let urlProp = iCalEvent.component.getFirstProperty('url');
  return urlProp ? urlProp.getFirstValue() : '';
}

function specifiesEnd(iCalEvent: ical.Event) {
  return (
    Boolean(iCalEvent.component.getFirstProperty('dtend')) ||
    Boolean(iCalEvent.component.getFirstProperty('duration'))
  );
}

// MODIFICATION: Remove settings parameter from icsToOFC
function icsToOFC(input: ical.Event): OFCEvent {
  const summary = input.summary || '';

  // Simplified: just use the title directly
  const eventData = { title: summary };

  const startDate = icalTimeToLuxon(input.startDate);
  const endDate = input.endDate ? icalTimeToLuxon(input.endDate) : startDate;
  const uid = input.uid;
  const isAllDay = input.startDate.isDate;

  const timezone = isAllDay
    ? undefined
    : input.startDate.timezone === 'Z'
      ? 'UTC'
      : input.startDate.timezone;

  if (input.isRecurring()) {
    const rrule = rrulestr(input.component.getFirstProperty('rrule').getFirstValue().toString());
    const exdates = input.component.getAllProperties('exdate').map(exdateProp => {
      const exdate = exdateProp.getFirstValue();
      return icalTimeToLuxon(exdate).toISODate();
    });

    return {
      type: 'rrule',
      uid,
      title: eventData.title,
      id: `ics::${uid}::${getLuxonDate(startDate)}::recurring`,
      rrule: rrule.toString(),
      skipDates: exdates.flatMap(d => (d ? [d] : [])),
      startDate: getLuxonDate(startDate)!,
      timezone,
      ...(isAllDay
        ? { allDay: true }
        : {
            allDay: false,
            startTime: getLuxonTime(startDate)!,
            endTime: getLuxonTime(endDate)!
          })
    };
  } else {
    const date = getLuxonDate(startDate);
    const finalEndDate = specifiesEnd(input) ? getLuxonDate(endDate) : undefined;

    return {
      type: 'single',
      uid,
      title: eventData.title,
      date: date!,
      endDate: date !== finalEndDate ? finalEndDate || null : null,
      timezone,
      ...(isAllDay
        ? { allDay: true }
        : {
            allDay: false,
            startTime: getLuxonTime(startDate)!,
            endTime: getLuxonTime(endDate)!
          })
    };
  }
}

// MODIFICATION: Remove settings parameter from getEventsFromICS
export function getEventsFromICS(text: string): OFCEvent[] {
  const jCalData = ical.parse(text);
  const component = new ical.Component(jCalData);

  const events: ical.Event[] = component
    .getAllSubcomponents('vevent')
    .map(vevent => new ical.Event(vevent))
    .filter(evt => {
      try {
        // Ensure start and end dates are valid before processing.
        evt.startDate.toJSDate();
        evt.endDate.toJSDate();
        return true;
      } catch (err) {
        // skipping events with invalid time
        return false;
      }
    });

  const baseEvents = Object.fromEntries(
    events.filter(e => e.recurrenceId === null).map(e => [e.uid, icsToOFC(e)])
  );

  const recurrenceExceptions = events
    .filter(e => e.recurrenceId !== null)
    .map((e): [string, OFCEvent] => [e.uid, icsToOFC(e)]);

  for (const [uid, event] of recurrenceExceptions) {
    const baseEvent = baseEvents[uid];
    if (!baseEvent) {
      continue;
    }

    if (baseEvent.type !== 'rrule' || event.type !== 'single') {
      console.warn('Recurrence exception was recurring or base event was not recurring', {
        baseEvent,
        recurrenceException: event
      });
      continue;
    }
    if (event.date) {
      baseEvent.skipDates.push(event.date);
    }
  }

  const allEvents = Object.values(baseEvents).concat(recurrenceExceptions.map(e => e[1]));

  return allEvents.map(validateEvent).flatMap(e => (e ? [e] : []));
}
