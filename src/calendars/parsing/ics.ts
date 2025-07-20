import ical from "ical.js";
import { DateTime } from "luxon";
import { rrulestr } from "rrule";
import type { AnyEvent } from "../../logic/Event";

function getDate(t: ical.Time): string {
  return DateTime.fromSeconds(t.toUnixTime(), { zone: "UTC" }).toISODate();
}

function icsToOFC(input: ical.Event): AnyEvent {
  if (input.isRecurring()) {
    const rrule = rrulestr(input.component.getFirstProperty("rrule").getFirstValue().toString());
    const allDay = input.startDate.isDate;

    return {
      id: `ics::${input.uid}::${getDate(input.startDate)}::recurring`,
      title: input.summary,
      rrule,
      allDay,
      exDates: input.component.getAllProperties("exdate").map((p) => p.getFirstValue()),
      start: DateTime.fromJSDate(input.startDate.convertToZone(ical.Timezone.utcTimezone).toJSDate()),
      end: DateTime.fromJSDate(input.endDate.convertToZone(ical.Timezone.utcTimezone).toJSDate())
    };
  } else {
    const date = DateTime.fromJSDate(input.startDate.convertToZone(ical.Timezone.utcTimezone).toJSDate());
    const endDate = DateTime.fromJSDate(input.endDate.convertToZone(ical.Timezone.utcTimezone).toJSDate());
    const allDay = input.startDate.isDate;
    return {
      id: `ics::${input.uid}::${date}::single`,
      title: input.summary,
      start: date,
      end: endDate,
      allDay
    };
  }
}

export function getEventsFromICS(text: string): AnyEvent[] {
  const jCalData = ical.parse(text);
  const component = new ical.Component(jCalData);

  // TODO: Timezone support
  // const tzc = component.getAllSubcomponents("vtimezone");
  // const tz = new ical.Timezone(tzc[0]);

  const events: ical.Event[] = component
    .getAllSubcomponents("vevent")
    .map((vevent) => new ical.Event(vevent))
    .filter((evt) => {
      evt.iterator;
      try {
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
  const baseEvents = Object.fromEntries(events.filter((e) => e.recurrenceId === null).map((e) => [e.uid, icsToOFC(e)]));
  const allEvents = Object.values(baseEvents);

  return allEvents.flatMap((e) => (e ? [e] : []));
}
