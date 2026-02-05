import type { TRANSP } from "../shared/values";

export type Calendar = {
  href: string;
  displayName: string;
  supportsEvents: boolean;
  supportsTodos: boolean;
  calendarTimezone?: string;
  calendarDescription?: string;
  scheduleCalendarTransp?: TRANSP;
  calendarOrder?: number;
  calendarColor?: string;
  syncToken?: number;
};
