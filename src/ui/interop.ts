import type { EventApi, EventInput } from "@fullcalendar/core";

import { DateTime } from "luxon";
import { type AnyEvent, isEvent, isRecurring, isRRUle } from "../logic/Event";

export function dateEndpointsToFrontmatter(start: Date, end: Date, allDay: boolean): Partial<AnyEvent> {
  return {
    start: DateTime.fromJSDate(start),
    end: DateTime.fromJSDate(end),
    allDay
  };
}

export function toEventInput(id: string, anyEvent: AnyEvent): EventInput | null {
  const { title } = anyEvent;
  if (isRRUle(anyEvent)) {
    const { allDay, rrule, exDates, start } = anyEvent;
    return {
      title,
      id,
      allDay,
      rrule: rrule.options,
      exdate: exDates.map((e) => `${DateTime.fromJSDate(e).toISODate()}T${start.toJSDate().toISOString().split("T")[1]}`).flatMap((d) => (d ? d : []))
    };
  } else if (isRecurring(anyEvent)) {
    return {
      title,
      id,
      startRecur: anyEvent.start,
      endRecur: anyEvent.end,
      extendedProps: {
        isTask: false
      },
      daysOfWeek: anyEvent.daysOfWeek
    };
  } else if (isEvent(anyEvent)) {
    const { start, end } = anyEvent;
    return {
      title,
      id,
      start: start.toISO(),
      end: end.toISO(),
      extendedProps: {
        isTask: false
      }
    };
  }
  return null;
}

export function fromEventApi(event: EventApi): AnyEvent {
  const isRecurring = event.extendedProps.daysOfWeek !== undefined;
  const title = event.title;
  if (isRecurring) {
    const start = DateTime.fromJSDate(event.extendedProps.startRecur);
    const end = DateTime.fromJSDate(event.extendedProps.endRecur);
    return {
      title,
      daysOfWeek: event.extendedProps.daysOfWeek,
      start,
      end
    };
  } else {
    if (!event.start || !event.end) {
      throw new Error("unsupported EventApi object received!");
    }
    const start = DateTime.fromJSDate(event.start);
    const end = DateTime.fromJSDate(event.end);
    const allDay = event.allDay;
    return {
      title,
      start,
      end,
      allDay
    };
  }
}
