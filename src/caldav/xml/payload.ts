import { XMLBuilder } from "fast-xml-parser";

const ALL_CALS_PROPFIND = {
  "d:propfind": {
    "@_xmlns:d": "DAV:",
    "@_xmlns:cal": "urn:ietf:params:xml:ns:caldav",
    "@_xmlns:x1": "http://apple.com/ns/ical/",
    "@_xmlns:x2": "http://nextcloud.com/ns",
    "@_xmlns:s": "http://sabredav.org/ns",
    "d:prop": {
      "d:displayname": "",
      "d:resourcetype": "",
      "cal:supported-calendar-component-set": "",
      "cal:calendar-description": "",
      "cal:calendar-timezone": "",
      "cal:schedule-calendar-transp": "",
      "x1:calendar-order": "",
      "x1:calendar-color": "",
      "s:sync-token": ""
    }
  }
};

export function allCalendarsPropfindDocument() {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    suppressBooleanAttributes: false
  });
  return builder.build(ALL_CALS_PROPFIND);
}
