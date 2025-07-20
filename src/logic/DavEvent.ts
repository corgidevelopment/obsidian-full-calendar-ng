import { DateTime } from "luxon";

export type DavEvent = {
  filename: string;
  uid: string;
  timestamp: DateTime;
  start: DateTime;
  end: DateTime;
  summary: string;
  description: string;
};

export function davEventToVCalString(d: DavEvent): string {
  const { uid, start, end, timestamp, summary, description } = d;
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ObsidianFullCalendarNG//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatDateAtUTC(timestamp)}Z
DTSTART;TZID=${formatTimezone(start)}:${formatDate(start)}
DTEND;TZID=${formatTimezone(start)}:${formatDate(end)}
SUMMARY:${summary}
DESCRIPTION:${description}
END:VEVENT
END:VCALENDAR`;
}

const format = "yyyyMMdd'T'HHmmss";

function formatDateAtUTC(d: DateTime): string {
  return d.toUTC().toFormat(format);
}

function formatDate(d: DateTime): string {
  return d.toFormat(format);
}

function formatTimezone(d: DateTime): string {
  return d.toFormat("z");
}
