import type { ACTION } from "./values";
import type { Alarm } from "./alarm";
import type { Recurrence } from "./recurrence";

type RecurrenceParams = {
  rrule: string;
  rdate: string;
  exdate: string;
};

type AlarmParams = {
  action: ACTION;
  description: string;
  trigger: string;
};

export function recurrence(p: RecurrenceParams): Recurrence {
  return { ...p };
}

export function alarm(p: AlarmParams): Alarm {
  return { ...p };
}
