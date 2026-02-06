import { XMLParser } from "fast-xml-parser";
import type { Calendar } from "../../types/calendar/calendar";
import { type Appliance, makeAppliance, parseProps, type Updater } from "../parse";
import type { TRANSP } from "../../request/calendar";

function checkCalendar(cal: Object) {
  return (
    Object.entries(cal)
      .filter((arr) => arr.indexOf("d:propstat") > -1)
      .flat()
      .filter((el) => el.constructor === Array)
      .flat()
      .filter((obj) => obj["d:status"].includes("200 OK"))
      .flatMap((obj) => obj["d:prop"])
      .flatMap((obj) => obj["d:resourcetype"])
      .filter((obj) => obj["cal:calendar"] !== undefined).length !== 0
  );
}

const displayName: Updater<Calendar> = (calendar: Calendar, value: string): Calendar => ({ ...calendar, displayName: value });
const supportedCalendarComponentSet: Updater<Calendar> = (calendar: Calendar, value: any[]) => {
  let componentSet = value?.flatMap((obj) => obj && obj["cal:comp"]).map((obj) => obj["@_name"]);
  return {
    ...calendar,
    supportsEvents: componentSet.indexOf("VEVENT") > -1,
    supportsTodos: componentSet.indexOf("VTODO") > -1
  };
};
const calendarDescription: Updater<Calendar> = (calendar: Calendar, value: string) => ({ ...calendar, calendarDescription: value });
const calendarTimezone: Updater<Calendar> = (calendar: Calendar, value: string) => ({ ...calendar, calendarTimezone: value });

const calendarTransp: Updater<Calendar> = (calendar: Calendar, value: { "cal:opaque": "" | TRANSP }) => {
  if (value["cal:opaque"] === "") {
    return { ...calendar };
  }
  return {
    ...calendar,
    scheduleCalendarTransp: value["cal:opaque"]
  };
};

const calendarOrder: Updater<Calendar> = (calendar: Calendar, value: { "#text": number | "" }) => {
  if (value["#text"] === "") {
    return { ...calendar };
  }
  return { ...calendar, calendarOrder: value["#text"] };
};

const calendarColor: Updater<Calendar> = (calendar: Calendar, value: { "#text": string }) => {
  if (value["#text"] === "") {
    return { ...calendar };
  }
  return { ...calendar, calendarColor: value["#text"] };
};

const syncToken: Updater<Calendar> = (calendar: Calendar, value: number) => ({ ...calendar, syncToken: value });

const calendarAppliance: Appliance<Calendar> = makeAppliance({
  "d:displayname": displayName,
  "cal:supported-calendar-component-set": supportedCalendarComponentSet,
  "cal:calendar-description": calendarDescription,
  "cal:calendar-timezone": calendarTimezone,
  "cal:schedule-calendar-transp": calendarTransp,
  "x1:calendar-order": calendarOrder,
  "x1:calendar-color": calendarColor,
  "s:sync-token": syncToken
});

export function parseCalendars(body: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    allowBooleanAttributes: false,
    isArray: (jtag) => ["cal:supported-calendar-component-set", "d:collection", "cal:comp"].includes(jtag)
  });
  const parsed = parser.parse(body)["d:multistatus"]["d:response"];
  let results: Calendar[] = [];
  for (let cal of parsed) {
    if (checkCalendar(cal)) {
      const calHref = cal["d:href"] as string;
      let calendar: Calendar = {
        href: calHref,
        supportsTodos: false,
        supportsEvents: false
      };
      for (let stat of cal["d:propstat"]) {
        if (stat["d:status"].includes("200 OK")) {
          calendar = parseProps(stat["d:prop"], calendar, calendarAppliance);
        }
      }
      results.push(calendar);
    }
  }
  return results;
}
