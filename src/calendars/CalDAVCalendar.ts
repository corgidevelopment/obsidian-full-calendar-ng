import dav from "dav";
import * as transport from "./parsing/caldav/transport";
import type { Authentication, CalendarInfo, EventLocation, OFCEvent } from "src/types";
import { getEventsFromICS } from "src/calendars/parsing/ics";
import type { IEditableCalendar } from "./IEditableCalendar";
import type { IRemoteCalendar } from "./IRemoteCalendar";
import type { ICalendar } from "./ICalendar";
import type { EventPathLocation } from "src/core/EventStore";
import { type EditableEventResponse, ID_SEPARATOR } from "../logic/tmpTypes";

export default class CalDAVCalendar implements IRemoteCalendar, Omit<IEditableCalendar, "containsPath">, ICalendar {
  _name: string;
  credentials: Authentication;
  serverUrl: string;
  calendarUrl: string;
  id: string = `${this.type}${ID_SEPARATOR}${this.identifier}`;
  color: string;

  events: OFCEvent[] = [];

  constructor(color: string, name: string, credentials: Authentication, serverUrl: string, calendarUrl: string) {
    this.color = color;
    this._name = name;
    this.credentials = credentials;
    this.serverUrl = serverUrl;
    this.calendarUrl = calendarUrl;
  }

  createEvent(_: OFCEvent): Promise<EventLocation> {
    throw new Error("Method not implemented.");
  }

  deleteEvent(_: EventPathLocation): Promise<void> {
    throw new Error("Method not implemented.");
  }

  modifyEvent(_: EventPathLocation, __: OFCEvent, ___: (loc: EventLocation) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async revalidate(): Promise<void> {
    let xhr = new transport.Basic(
      new dav.Credentials({
        username: this.credentials.username,
        password: this.credentials.password
      })
    );
    let account = await dav.createAccount({
      xhr: xhr,
      server: this.serverUrl
    });
    let calendar = account.calendars.find((calendar) => calendar.url === this.calendarUrl);
    if (!calendar) {
      return;
    }
    let caldavEvents = await dav.listCalendarObjects(calendar, { xhr });
    this.events = caldavEvents.filter((vevent) => vevent.calendarData).flatMap((vevent) => getEventsFromICS(vevent.calendarData));
  }

  get type(): CalendarInfo["type"] {
    return "caldav";
  }

  get identifier(): string {
    return this.calendarUrl;
  }

  get name(): string {
    return this._name;
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    return this.events.map((e) => ({ event: e, location: { url: "" } }));
  }
}
