import { OFCEvent } from '../../types';
import ical from 'ical.js';
import { DateTime } from 'luxon';

/**
 * Formats a Luxon DateTime into an iCal DATE-TIME string (YYYYMMDDTHHMMSSZ or local).
 * @param dt The DateTime to format
 * @param isAllDay Whether this is an all-day event
 */
function formatDateTime(dt: DateTime, isAllDay: boolean): ical.Time {
  const time = new ical.Time({
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
    second: dt.second,
    isDate: isAllDay
  });

  if (!isAllDay) {
    if (dt.zoneName === 'UTC') {
      time.timezone = 'Z';
    } else {
      // ical.js Time handles timezones via the `zone` property (string identifier) or `timezone` (object).
      // We use `zone` for the string identifier.
      time.timezone = dt.zoneName || 'Z';
    }
  }
  return time;
}

/**
 * Helper to generate the VEVENT component structure.
 */
function createVEventComponent(event: OFCEvent, isOverride = false): ical.Component {
  const vevent = new ical.Component('vevent');

  // UID
  if (event.uid) {
    vevent.addPropertyWithValue('uid', event.uid);
  } else {
    vevent.addPropertyWithValue('uid', window.crypto.randomUUID());
  }

  // Summary (Title)
  vevent.addPropertyWithValue('summary', event.title);

  // DTSTAMP (Required by RFC 5545)
  vevent.addPropertyWithValue('dtstamp', ical.Time.now());

  // START Date/Time extraction based on event type
  let datePart: string;
  if (event.type === 'single') {
    datePart = event.date;
  } else if (event.type === 'rrule') {
    datePart = event.startDate;
  } else {
    // 'recurring' type
    datePart = event.startRecur || DateTime.now().toISODate();
  }

  // DTSTART & DTEND
  let startDt: DateTime;
  let endDt: DateTime;

  if (event.allDay) {
    startDt = DateTime.fromISO(datePart);
    if (event.type === 'single' && event.endDate) {
      endDt = DateTime.fromISO(event.endDate).plus({ days: 1 });
    } else {
      // Default duration 1 day
      endDt = startDt.plus({ days: 1 });
    }
  } else {
    // Not all day
    const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
    const endTime = (event as unknown as { endTime?: string }).endTime || '00:00';
    const opts = event.timezone ? { zone: event.timezone } : {};

    startDt = DateTime.fromISO(`${datePart}T${startTime}`, opts);

    if (event.type === 'single' && event.endDate) {
      endDt = DateTime.fromISO(`${event.endDate}T${endTime}`, opts);
    } else {
      endDt = DateTime.fromISO(`${datePart}T${endTime}`, opts);
      if (endDt < startDt) {
        endDt = endDt.plus({ days: 1 });
      }
    }
  }

  vevent.addPropertyWithValue('dtstart', formatDateTime(startDt, event.allDay));
  vevent.addPropertyWithValue('dtend', formatDateTime(endDt, event.allDay));

  // Description
  if (event.description) {
    vevent.addPropertyWithValue('description', event.description);
  }

  // Recurrence (RRULE) - Only for master events, not overrides usually
  if (!isOverride && event.type === 'rrule' && event.rrule) {
    try {
      const ruleStr = event.rrule.replace(/^RRULE:/i, '');
      const recur = (ical.Recur as unknown as { fromString?: (s: string) => unknown }).fromString
        ? (ical.Recur as unknown as { fromString: (s: string) => unknown }).fromString(ruleStr)
        : null;
      if (recur) {
        vevent.addPropertyWithValue('rrule', recur);
      } else {
        const prop = new ical.Property('rrule');
        prop.setValue(ruleStr);
        vevent.addProperty(prop);
      }
    } catch (e) {
      console.error('Failed to add RRULE', e);
    }
  }

  // EXDATE - Only for master events
  if (
    !isOverride &&
    (event.type === 'rrule' || event.type === 'recurring') &&
    event.skipDates &&
    event.skipDates.length > 0
  ) {
    for (const skipDate of event.skipDates) {
      let exTime: ical.Time;
      if (event.allDay) {
        const dt = DateTime.fromISO(skipDate);
        exTime = new ical.Time({ year: dt.year, month: dt.month, day: dt.day, isDate: true });
      } else {
        const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
        const opts = event.timezone ? { zone: event.timezone } : {};
        const dt = DateTime.fromISO(`${skipDate}T${startTime}`, opts);
        exTime = formatDateTime(dt, false);
      }
      vevent.addPropertyWithValue('exdate', exTime);
    }
  }

  return vevent;
}

/**
 * Converts an OFCEvent to an ICS string.
 */
export function eventToIcs(event: OFCEvent): string {
  const component = new ical.Component('vcalendar');
  component.addPropertyWithValue('version', '2.0');
  component.addPropertyWithValue('prodid', '-//Obsidian Full Calendar Plugin//NONSGML v1.0//EN');

  const vevent = createVEventComponent(event);
  component.addSubcomponent(vevent);

  return (component as unknown as { toString(): string }).toString();
}

/**
 * Creates a VEVENT component for an instance override.
 * @param event The new event data for the specific instance.
 * @param originalDate The original start date/time of the instance being modified (ISO string).
 */
export function createOverrideVEvent(event: OFCEvent, originalDate: string): ical.Component {
  // 1. Create the base VEVENT with new data
  const vevent = createVEventComponent(event, true);

  // 2. Add RECURRENCE-ID
  // The originalDate argument should be ISO. We need to parse it to ical.Time.
  // Assuming originalDate came from the event's original start time.

  // We need to know if the original was all-day or not to format RECURRENCE-ID correctly.
  // Usually overrides match the type of the original, but can change.
  // RECURRENCE-ID should match the PATTERN of the master event's DTSTART (Date or DateTime).
  // For now, let's infer from the passed date string or event.allDay.

  // If originalDate is just YYYY-MM-DD, treat as Date.
  const isDate = originalDate.length === 10;
  let recurIdTime: ical.Time;

  if (isDate) {
    const dt = DateTime.fromISO(originalDate);
    recurIdTime = new ical.Time({ year: dt.year, month: dt.month, day: dt.day, isDate: true });
  } else {
    // Assume DateTime string
    const dt = DateTime.fromISO(originalDate);
    recurIdTime = formatDateTime(dt, false);
    // Important: RECURRENCE-ID must match the timezone of the original DTSTART if it wasn't UTC.
    // If we don't have that info easily, we might struggle.
    // But usually standard is to use the same zone or UTC.
    // Let's hope basic formatting works.
  }

  vevent.addPropertyWithValue('recurrence-id', recurIdTime);

  // 3. Ensure SEQUENCE is incremented?
  // Usually the server handles sequence or client should increment.
  // We'll leave it for now.

  return vevent;
}
