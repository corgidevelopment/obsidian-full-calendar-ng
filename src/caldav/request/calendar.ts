import type { HttpRequestInterface } from "./HttpRequestInterface";
import type { CaldavConfig } from "../types/config/config";
import { allCalendarsPropfindDocument } from "../xml/payload";
import type { Calendar } from "../types/calendar/calendar";

export type TRANSP = "OPAQUE" | "TRANSPARENT";

function calendarsPath(config: CaldavConfig): string {
  return `/calendars/${config.username}`;
}

function calendarsUrl(config: CaldavConfig): string {
  return `${config.davUrl}${calendarsPath(config)}`;
}

export async function findAllCalendars(requestGateway: HttpRequestInterface, config: CaldavConfig): Promise<Calendar[]> {
  const body = await requestGateway.request({
    host: config.host,
    path: calendarsPath(config),
    url: calendarsUrl(config),
    method: "PROPFIND",
    headers: {
      Accept: "application/json"
    },
    body: allCalendarsPropfindDocument()
  });
  if (body == null) {
    return [];
  }
  return [];
}
