import type { Vevent, VeventDtend, VeventDuration } from "./vevent";
import type { Alarm } from "../shared/alarm";
import type { Recurrence } from "../shared/recurrence";
import type { EVENT_STATUS, TRANSP } from "./values";

type VeventParams = {
  uid: string;
  dtstamp: string;
  dtstart: string;
};

export function durationVevent(p: (VeventParams & { duration: string }) | VeventDuration): VeventDuration {
  return { ...p };
}

export function dtendVevent(p: (VeventParams & { dtend: string }) | VeventDtend): VeventDtend {
  return { ...p };
}

export function withAlarm<T extends Vevent>(event: T, alarm: Alarm): T {
  return { ...event, alarm };
}

export function withRecurrence<T extends Vevent>(event: T, recurrence: Recurrence): T {
  return { ...event, recurrence: recurrence };
}

export function withStatus<T extends Vevent>(event: T, status: EVENT_STATUS): T {
  return { ...event, status };
}

export function withTransp<T extends Vevent>(event: T, transp: TRANSP): T {
  return { ...event, transp };
}
