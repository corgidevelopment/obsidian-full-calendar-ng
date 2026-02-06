import type { TRANSP } from "../shared/values";

export type Calendar = {
  href: string;
  supportsEvents: boolean;
  supportsTodos: boolean;
  displayName?: string;
  calendarTimezone?: string;
  calendarDescription?: string;
  scheduleCalendarTransp?: TRANSP;
  calendarOrder?: number;
  calendarColor?: string;
  syncToken?: number;
};
