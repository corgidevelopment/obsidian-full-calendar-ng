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
 * Maps Windows timezone identifiers to IANA timezone identifiers.
 * Some ICS files (especially from Outlook/Exchange) use Windows timezone names
 * instead of IANA identifiers, which Luxon requires.
 */
function mapWindowsTimezoneToIANA(windowsTz: string): string | null {
  const windowsToIANA: Record<string, string> = {
    // Western Europe
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'E. Europe Standard Time': 'Europe/Bucharest',
    'Russian Standard Time': 'Europe/Moscow',
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Europe/London',
    // Americas
    'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Alaskan Standard Time': 'America/Anchorage',
    'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Atlantic Standard Time': 'America/Halifax',
    'Central America Standard Time': 'America/Guatemala',
    'Mexico Standard Time': 'America/Mexico_City',
    'SA Pacific Standard Time': 'America/Bogota',
    'SA Western Standard Time': 'America/Caracas',
    'SA Eastern Standard Time': 'America/Sao_Paulo',
    'Pacific SA Standard Time': 'America/Santiago',
    // Asia
    'Tokyo Standard Time': 'Asia/Tokyo',
    'Korea Standard Time': 'Asia/Seoul',
    'China Standard Time': 'Asia/Shanghai',
    'India Standard Time': 'Asia/Kolkata',
    'Singapore Standard Time': 'Asia/Singapore',
    'W. Australia Standard Time': 'Australia/Perth',
    'AUS Eastern Standard Time': 'Australia/Sydney',
    'New Zealand Standard Time': 'Pacific/Auckland',
    // Middle East
    'Arab Standard Time': 'Asia/Riyadh',
    'Israel Standard Time': 'Asia/Jerusalem',
    'Turkey Standard Time': 'Europe/Istanbul',
    // Africa
    'South Africa Standard Time': 'Africa/Johannesburg',
    'Egypt Standard Time': 'Africa/Cairo'
  };

  return windowsToIANA[windowsTz] || null;
}

/**
 * Normalizes a timezone identifier to an IANA timezone identifier.
 * Handles UTC ('Z'), Windows timezone identifiers, and IANA identifiers.
 */
function normalizeTimezone(zone: string | undefined | null): string {
  // Handle undefined, null, or empty strings
  if (!zone || zone.trim() === '') {
    return 'utc';
  }

  // Handle UTC
  if (zone === 'Z' || zone.toLowerCase() === 'utc') {
    return 'utc';
  }

  // Check if it's already a valid IANA timezone
  try {
    const testDt = DateTime.now().setZone(zone);
    if (testDt.isValid) {
      return zone;
    }
  } catch {
    // Not a valid IANA timezone, continue to Windows mapping
  }

  // Try to map Windows timezone to IANA
  const mapped = mapWindowsTimezoneToIANA(zone);
  if (mapped) {
    return mapped;
  }

  // Return original if no mapping found (will be handled by caller)
  return zone;
}

/**
 * Converts an iCal date string (YYYYMMDD or YYYYMMDDTHHMMSSZ) to ISO extended format.
 * This ensures FullCalendar receives dates in the format it expects.
 */
function convertICalDateToISO(dateStr: string, isDateOnly: boolean = false): string | null {
  // Handle YYYYMMDD format (date only)
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  // Handle YYYYMMDDTHHMMSSZ format (date-time with UTC)
  if (dateStr.length === 16 && dateStr.endsWith('Z') && /^\d{8}T\d{6}Z$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    const second = dateStr.substring(13, 15);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }

  // Handle YYYYMMDDTHHMMSS format (date-time without timezone)
  if (dateStr.length === 15 && /^\d{8}T\d{6}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    const second = dateStr.substring(13, 15);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  return null;
}

/**
 * Converts an ical.js Time object into a Luxon DateTime object.
 * This version uses .toJSDate() to get a baseline moment in time and then
 * applies the original timezone from the iCal data.
 * Handles Windows timezone identifiers by mapping them to IANA identifiers.
 * Added validation to handle invalid dates that might come from malformed iCal data.
 */
function icalTimeToLuxon(t: ical.Time): DateTime {
  // FAST PATH: Handle date-only (floating) values directly to avoid timezone conversion shifts.
  // We explicitly create the DateTime in UTC to preserve the exact date regardless of local system time.
  if (t.isDate) {
    return DateTime.fromObject(
      {
        year: t.year,
        month: t.month,
        day: t.day
      },
      { zone: 'utc' }
    );
  }

  let jsDate: Date;

  try {
    jsDate = t.toJSDate();

    // Validate the Date object - check if it's invalid
    if (isNaN(jsDate.getTime())) {
      // If the Date is invalid, try to parse the raw string value
      const rawValue = (t as unknown as { toString(): string }).toString();
      if (rawValue) {
        const isoDate = convertICalDateToISO(rawValue, t.isDate);
        if (isoDate) {
          // Parse the ISO date string with Luxon
          const parsed = DateTime.fromISO(isoDate, {
            zone: t.timezone === 'Z' ? 'utc' : t.timezone
          });
          if (parsed.isValid) {
            return parsed;
          }
        }
      }

      console.warn(
        `Full Calendar ICS Parser: Invalid date from ical.js Time object. Raw value: ${rawValue || 'unknown'}`
      );
      // Return a fallback invalid DateTime - this will be caught later
      return DateTime.invalid('Invalid date from ical.js');
    }
  } catch (err) {
    // If toJSDate() throws an error, try to parse the raw value
    const rawValue = (t as unknown as { toString(): string }).toString();
    const isoDate = convertICalDateToISO(rawValue, t.isDate);
    if (isoDate) {
      const parsed = DateTime.fromISO(isoDate, { zone: t.timezone === 'Z' ? 'utc' : t.timezone });
      if (parsed.isValid) {
        return parsed;
      }
    }

    console.warn(
      `Full Calendar ICS Parser: Error converting ical.js Time to Date. Raw value: ${rawValue || 'unknown'}`,
      err
    );
    return DateTime.invalid('Error converting ical.js Time');
  }

  // The timezone property on ical.Time is what we need.
  // It can be 'Z' for UTC, a Windows identifier like 'W. Europe Standard Time',
  // an IANA identifier like 'Asia/Kolkata', or undefined/null.
  const rawZone = t.timezone === 'Z' ? 'utc' : t.timezone || undefined;
  const zone = normalizeTimezone(rawZone);

  // Attempt to set the zone from the ICS file.
  const zonedDt = DateTime.fromJSDate(jsDate).setZone(zone);

  // Check if setting the zone resulted in an invalid DateTime.
  // If so, fall back to UTC, which is the old behavior.
  if (!zonedDt.isValid) {
    console.warn(
      `Full Calendar ICS Parser: Invalid timezone identifier "${rawZone}". Falling back to UTC.`
    );
    const utcDt = DateTime.fromJSDate(jsDate, { zone: 'utc' });
    if (!utcDt.isValid) {
      // If even UTC fails, try parsing the raw value
      const rawValue = (t as unknown as { toString(): string }).toString();
      const isoDate = convertICalDateToISO(rawValue, t.isDate);
      if (isoDate) {
        const parsed = DateTime.fromISO(isoDate, { zone: 'utc' });
        if (parsed.isValid) {
          return parsed;
        }
      }
      return DateTime.invalid('Invalid date after timezone conversion');
    }
    return utcDt;
  }

  // Log if we had to map a Windows timezone
  if (rawZone !== zone && rawZone !== 'utc') {
    console.debug(
      `Full Calendar ICS Parser: Mapped Windows timezone "${rawZone}" to IANA timezone "${zone}".`
    );
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
  const urlProp = iCalEvent.component.getFirstProperty('url');
  return urlProp ? String(urlProp.getFirstValue()) : '';
}

function specifiesEnd(iCalEvent: ical.Event) {
  return (
    Boolean(iCalEvent.component.getFirstProperty('dtend')) ||
    Boolean(iCalEvent.component.getFirstProperty('duration'))
  );
}

// MODIFICATION: Remove settings parameter from icsToOFC
function icsToOFC(input: ical.Event): OFCEvent | null {
  const summary = input.summary || '';

  // Simplified: just use the title directly
  const eventData = { title: summary };

  const description = String(
    input.component.getFirstProperty('description')?.getFirstValue() || ''
  );
  const location = String(input.component.getFirstProperty('location')?.getFirstValue() || '');
  // Use extractEventUrl helper or input.component.getFirstProperty('url')
  const url = extractEventUrl(input);

  const startDate = icalTimeToLuxon(input.startDate);

  // Validate start date - if invalid, skip this event
  if (!startDate.isValid) {
    console.warn(
      `Full Calendar ICS Parser: Skipping event "${summary}" due to invalid start date. Reason: ${startDate.invalidReason}`
    );
    return null;
  }

  const endDate = input.endDate ? icalTimeToLuxon(input.endDate) : startDate;

  // Validate end date - if invalid, use start date
  const validEndDate = endDate.isValid ? endDate : startDate;
  if (!endDate.isValid && input.endDate) {
    console.warn(
      `Full Calendar ICS Parser: Event "${summary}" has invalid end date, using start date instead.`
    );
  }

  const uid = input.uid;
  const isAllDay = input.startDate.isDate;

  // The Luxon DateTime object now holds the correct zone from the ICS file.
  // Coalesce null to undefined to match the schema.
  const timezone = isAllDay ? undefined : startDate.zoneName || undefined;

  if (input.isRecurring()) {
    // Cast getFirstValue() return to unknown, then string to string
    const rruleProp = input.component.getFirstProperty('rrule');
    const rruleVal = rruleProp ? String(rruleProp.getFirstValue()) : null;
    const rruleStr = rruleVal ? String(rruleVal) : '';
    const rrule = rrulestr(rruleStr);
    const exdates = input.component
      .getAllProperties('exdate')
      .map(exdateProp => {
        const exdate = ((t: unknown) => t as ical.Time)(exdateProp.getFirstValue());
        const exdateLuxon = icalTimeToLuxon(exdate);
        if (!exdateLuxon.isValid) {
          console.warn(`Full Calendar ICS Parser: Skipping invalid EXDATE for event "${summary}"`);
          return null;
        }
        return exdateLuxon.toISODate();
      })
      .filter((d): d is string => d !== null);

    const startDateISO = getLuxonDate(startDate);
    const endDateISO = getLuxonDate(validEndDate);

    // Ensure we have valid ISO dates
    if (!startDateISO) {
      console.warn(
        `Full Calendar ICS Parser: Could not convert start date to ISO for event "${summary}"`
      );
      return null;
    }

    return {
      type: 'rrule',
      uid,
      title: eventData.title,
      id: `ics::${uid}::${startDateISO}::recurring`,
      rrule: rrule.toString(),
      skipDates: exdates,
      startDate: startDateISO,
      endDate: endDateISO && startDateISO !== endDateISO ? endDateISO : null,
      timezone,
      ...(isAllDay
        ? { allDay: true }
        : {
            allDay: false,
            startTime: getLuxonTime(startDate)!,
            endTime: getLuxonTime(endDate)!
          }),
      description,
      url:
        url ||
        (location && typeof location === 'string' && location.startsWith('http')
          ? location
          : undefined)
    };
  } else {
    const date = getLuxonDate(startDate);

    // Ensure we have a valid date
    if (!date) {
      console.warn(
        `Full Calendar ICS Parser: Could not convert start date to ISO for event "${summary}"`
      );
      return null;
    }

    let finalEndDate: string | null | undefined = null;
    if (specifiesEnd(input)) {
      if (isAllDay) {
        // For all-day events, ICS end date is exclusive. Make it inclusive by subtracting one day.
        const inclusiveEndDate = validEndDate.minus({ days: 1 });
        finalEndDate = getLuxonDate(inclusiveEndDate);
      } else {
        finalEndDate = getLuxonDate(validEndDate);
      }
    }

    return {
      type: 'single',
      uid,
      title: eventData.title,
      date: date,
      endDate: date !== finalEndDate ? finalEndDate || null : null,
      timezone,
      ...(isAllDay
        ? { allDay: true }
        : {
            allDay: false,
            startTime: getLuxonTime(startDate)!,
            endTime: getLuxonTime(endDate)!
          }),
      description,
      url:
        url ||
        (location && typeof location === 'string' && location.startsWith('http')
          ? location
          : undefined)
    };
  }
}

/**
 * Pre-processes ICS text to normalize date formats.
 * Converts YYYYMMDD and YYYYMMDDTHHMMSSZ formats to ensure proper parsing.
 */
function preprocessICSText(text: string): string {
  let correctedText = text;

  // Handle DTSTART:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/DTSTART:(\d{8})(\r?\n|$)/gm, 'DTSTART;VALUE=DATE:$1$2');

  // Handle DTEND:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/DTEND:(\d{8})(\r?\n|$)/gm, 'DTEND;VALUE=DATE:$1$2');

  // Handle EXDATE:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/EXDATE[^:]*:(\d{8})(\r?\n|$)/gm, (match, date) => {
    // Preserve any parameters before the colon
    const prefix = match.substring(0, match.indexOf(':'));
    return `${prefix};VALUE=DATE:${date}${match.endsWith('\r\n') ? '\r\n' : match.endsWith('\n') ? '\n' : ''}`;
  });

  // Handle RECURRENCE-ID:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/RECURRENCE-ID[^:]*:(\d{8})(\r?\n|$)/gm, (match, date) => {
    const prefix = match.substring(0, match.indexOf(':'));
    return `${prefix};VALUE=DATE:${date}${match.endsWith('\r\n') ? '\r\n' : match.endsWith('\n') ? '\n' : ''}`;
  });

  // Note: YYYYMMDDTHHMMSSZ format should be handled correctly by ical.js,
  // but we ensure it's properly formatted if needed

  return correctedText;
}

// MODIFICATION: Remove settings parameter from getEventsFromICS
export function getEventsFromICS(text: string): OFCEvent[] {
  // Pre-process the text to normalize date formats
  // This ensures VALUE=DATE:YYYYMMDD and YYYYMMDDTHHMMSSZ formats are properly handled
  const correctedText = preprocessICSText(text);

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
      } catch {
        try {
          evt.startDate?.toJSDate();
        } catch {
          // start date failed parsing
        }
        // skipping events with invalid time
        return false;
      }
    });

  const baseEvents = Object.fromEntries(
    events
      .filter(e => e.recurrenceId === null)
      .map(e => [e.uid, icsToOFC(e)])
      .filter(([uid, event]) => event !== null) as [string, OFCEvent][]
  );

  const recurrenceExceptions = events
    .filter(e => e.recurrenceId !== null)
    .map((e): [string, OFCEvent | null] => [e.uid, icsToOFC(e)])
    .filter(([uid, event]) => event !== null) as [string, OFCEvent][];

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
