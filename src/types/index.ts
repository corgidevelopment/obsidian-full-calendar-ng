import type { CalendarInfo } from "./calendar_settings";

export { makeDefaultPartialCalendarSource } from "./calendar_settings";
export type { CalendarInfo } from "./calendar_settings";

export const PLUGIN_SLUG = "full-calendar-plugin";

export type EventLocation =
  | {
      file: { path: string };
      lineNumber: number | undefined;
    }
  | { url: string };

export type Authentication = {
  type: "basic";
  username: string;
  password: string;
};

export type CalDAVSource = Extract<CalendarInfo, { type: "caldav" }>;
