import type { EVENT_STATUS, TRANSP } from "./values";
import type { Recurrence } from "../shared/recurrence";
import type { Alarm } from "../shared/alarm";

type VeventBase = {
  readonly uid: string;
  readonly dtstamp: string;
  readonly dtstart: string;
  readonly recurrenceId?: string;
  readonly lastModified?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly location?: string;
  readonly categories?: string;
  readonly url?: string;
  readonly transp?: TRANSP;
  readonly status?: EVENT_STATUS;
  readonly recurrence?: Recurrence;
  readonly alarm?: Alarm;
};

export type VeventDuration = VeventBase & {
  readonly duration: string;
};

export type VeventDtend = VeventBase & {
  readonly dtend: string;
};

export type Vevent = VeventDuration | VeventDtend;
