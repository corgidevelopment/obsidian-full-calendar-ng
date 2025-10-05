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
 * This version uses .toJSDate() to get a baseline moment in time and then
 * applies the original timezone from the iCal data.
 */
function icalTimeToLuxon(t: ical.Time): DateTime {
  const jsDate = t.toJSDate();
  // The timezone property on ical.Time is what we need.
  // It can be 'Z' for UTC or an IANA identifier like 'Asia/Kolkata'.
  // We use setZone to ensure the DateTime object has the correct zone,
  // without changing the underlying moment in time.
  const zone = t.timezone === 'Z' ? 'utc' : t.timezone;

  // Attempt to set the zone from the ICS file.
  const zonedDt = DateTime.fromJSDate(jsDate).setZone(zone);

  // Check if setting the zone resulted in an invalid DateTime.
  // If so, fall back to UTC, which is the old behavior.
  if (!zonedDt.isValid) {
    console.warn(
      `Full Calendar ICS Parser: Invalid timezone identifier "${zone}". Falling back to UTC.`
    );
    return DateTime.fromJSDate(jsDate, { zone: 'utc' });
  }

  return zonedDt;
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

  // The Luxon DateTime object now holds the correct zone from the ICS file.
  // Coalesce null to undefined to match the schema.
  const timezone = isAllDay ? undefined : startDate.zoneName || undefined;

  if (input.isRecurring()) {
    const rrule = rrulestr(input.component.getFirstProperty('rrule').getFirstValue().toString());
    const exdates = input.component.getAllProperties('exdate').map(exdateProp => {
      const exdate = exdateProp.getFirstValue();
      return icalTimeToLuxon(exdate).toISODate();
    });

    const startDateISO = getLuxonDate(startDate)!;
    const endDateISO = getLuxonDate(endDate)!;

    return {
      type: 'rrule',
      uid,
      title: eventData.title,
      id: `ics::${uid}::${startDateISO}::recurring`,
      rrule: rrule.toString(),
      skipDates: exdates.flatMap(d => (d ? [d] : [])),
      startDate: startDateISO,
      endDate: startDateISO !== endDateISO ? endDateISO : null,
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
    let finalEndDate: string | null | undefined = null;
    if (specifiesEnd(input)) {
      if (isAllDay) {
        // For all-day events, ICS end date is exclusive. Make it inclusive by subtracting one day.
        const inclusiveEndDate = endDate.minus({ days: 1 });
        finalEndDate = getLuxonDate(inclusiveEndDate);
      } else {
        finalEndDate = getLuxonDate(endDate);
      }
    }

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
  // FIX: Pre-process the text to explicitly mark all-day events with VALUE=DATE.
  // This prevents the ical.js parser from incorrectly interpreting them as
  // malformed date-time values (e.g., "2025-08-13T::").
  const correctedText = text.replace(/DTSTART:(\d{8})$/gm, 'DTSTART;VALUE=DATE:$1');

  const jCalData = ical.parse(correctedText); // Use the corrected text
  const component = new ical.Component(jCalData);
  const vevents = component.getAllSubcomponents('vevent');

  const events: ical.Event[] = vevents
    .map(vevent => new ical.Event(vevent))
    .filter(evt => {
      try {
        // Ensure start and end dates are valid before processing.
        evt.startDate.toJSDate();
        evt.endDate.toJSDate();
        return true;
      } catch (err) {
        let startDateJs;
        try {
          startDateJs = evt.startDate?.toJSDate();
        } catch (e) {
          startDateJs = `Error: ${e}`;
        }
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
