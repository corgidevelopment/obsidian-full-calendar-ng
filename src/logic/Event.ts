import type { DateTime } from "luxon";
import { RRule, RRuleSet } from "rrule";

type EventBase = {
  id?: string;
  title: string;
  start: DateTime;
  end: DateTime;
};

export type Event = EventBase & {
  allDay: boolean;
};

export type RecurringEvent = EventBase & {
  daysOfWeek: DaysOfWeek[];
};

export type RRuleEvent = Event & {
  rrule: RRule | RRuleSet;
  exDates: Date[];
};

export type AnyEvent = Event | RecurringEvent | RRuleEvent;

export function isEvent(e: AnyEvent): e is Event {
  return "allDay" in e && !("rrule" in e);
}

export function isNotAllDay(e: AnyEvent): e is Event & { allDay: false } {
  return "allDay" in e && !e.allDay;
}

export function isRecurring(e: AnyEvent): e is RecurringEvent {
  return "daysOfWeek" in e;
}

export function isRRUle(e: AnyEvent): e is RRuleEvent {
  return "rrule" in e;
}

export enum DaysOfWeek {
  MONDAY = "Monday",
  TUESDAY = "Tuesday",
  WEDNESDAY = "Wednesday",
  THURSDAY = "Thursday",
  FRIDAY = "Fridays",
  SATURDAY = "Saturday",
  SUNDAY = "Sunday"
}
