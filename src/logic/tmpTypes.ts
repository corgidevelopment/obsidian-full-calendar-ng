import type { HeadingCache } from "obsidian";
import type { EventLocation, OFCEvent } from "../types";
import type CalDAVCalendar from "../calendars/CalDAVCalendar";
import type DailyNoteCalendar from "../calendars/DailyNoteCalendar";
import type FullNoteCalendar from "../calendars/FullNoteCalendar";
import type ICSCalendar from "../calendars/ICSCalendar";

export const ID_SEPARATOR = "::";

export type EventResponse = {
  event: OFCEvent;
  location: EventLocation | null;
};

export type EditableEventResponse = Omit<EventResponse, "location"> & {
  location: EventLocation;
};

export type AddToHeadingProps = {
  page: string;
  heading: HeadingCache | undefined;
  item: OFCEvent;
  headingText: string;
};

export type Line = {
  text: string;
  lineNumber: number;
};

export type PrintableAtom = Array<number | string> | number | string | boolean;

export type UnknownCalendar = CalDAVCalendar | DailyNoteCalendar | FullNoteCalendar | ICSCalendar;
