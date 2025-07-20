import type CalDAVCalendar from "../calendars/CalDAVCalendar";
import type DailyNoteCalendar from "../calendars/DailyNoteCalendar";
import type FullNoteCalendar from "../calendars/FullNoteCalendar";
import type ICSCalendar from "../calendars/ICSCalendar";

export type UnknownCalendar = CalDAVCalendar | DailyNoteCalendar | FullNoteCalendar | ICSCalendar;
