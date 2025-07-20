import type { EventResponse } from "../logic/EventResponse";

export interface ICalendar {
  color: string;
  type: string;
  identifier: string;
  name: string;
  id: string;

  getEvents(): Promise<EventResponse[]>;
}
