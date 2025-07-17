import { request } from "obsidian";
import type { CalendarInfo } from "src/types";
import { getEventsFromICS } from "./parsing/ics";
import type { IRemoteCalendar } from "./IRemoteCalendar";
import type { ICalendar } from "./ICalendar";
import { type EventResponse, ID_SEPARATOR } from "../logic/tmpTypes";

const WEBCAL = "webcal";

export default class ICSCalendar implements IRemoteCalendar, ICalendar {
  url: string;
  color: string;
  id: string = `${this.type}${ID_SEPARATOR}${this.identifier}`;
  private response: string | null = null;

  constructor(color: string, url: string) {
    this.color = color;
    if (url.startsWith(WEBCAL)) {
      url = "https" + url.slice(WEBCAL.length);
    }
    this.url = url;
  }

  get type(): CalendarInfo["type"] {
    return "ical";
  }

  get identifier(): string {
    return this.url;
  }

  get name(): string {
    return this.url;
  }

  async revalidate(): Promise<void> {
    console.debug("revalidating ICS calendar " + this.name);
    this.response = await request({
      url: this.url,
      method: "GET"
    });
  }

  async getEvents(): Promise<EventResponse[]> {
    if (!this.response) {
      return [];
    }
    return getEventsFromICS(this.response).map((e) => ({ event: e, location: null }));
  }
}
