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
import { FullCalendarSettings } from '../../types/settings';
import { parseTitle } from './categoryParser';

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

// MODIFICATION: Pass settings to icsToOFC
function icsToOFC(input: ical.Event, settings: FullCalendarSettings): OFCEvent {
  const summary = input.summary || '';

  let eventData: any = {};
  if (settings.enableAdvancedCategorization) {
    const { category, subCategory, title } = parseTitle(summary);
    eventData.title = title;
    eventData.category = category;
    eventData.subCategory = subCategory;
  } else {
    eventData.title = summary;
  }

  // The rest of the function now uses `eventData`
  const startDate = icalTimeToLuxon(input.startDate);
  const endDate = input.endDate ? icalTimeToLuxon(input.endDate) : startDate;
  const uid = input.uid; // Extract the UID here.
  const isAllDay = input.startDate.isDate;

  // Correctly determine the event's source timezone.
  // If the timezone is 'Z', it's UTC. Otherwise, use the specified timezone from the data.
  // All-day events do not have a timezone.
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
      uid, // Added
      title: eventData.title,
      category: eventData.category,
      subCategory: eventData.subCategory, // <-- ADD THIS
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
      uid, // Added
      title: eventData.title,
      category: eventData.category,
      subCategory: eventData.subCategory, // <-- AND ADD THIS
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

// MODIFICATION: Change signature of getEventsFromICS
export function getEventsFromICS(text: string, settings: FullCalendarSettings): OFCEvent[] {
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

  // Events with RECURRENCE-ID will have duplicated UIDs.
  // We need to modify the base event to exclude those recurrence exceptions.
  const baseEvents = Object.fromEntries(
    events.filter(e => e.recurrenceId === null).map(e => [e.uid, icsToOFC(e, settings)]) // <-- Pass settings
  );

  const recurrenceExceptions = events
    .filter(e => e.recurrenceId !== null)
    .map((e): [string, OFCEvent] => [e.uid, icsToOFC(e, settings)]); // <-- Pass settings

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
