import type { EventResponse } from "../logic/tmpTypes";

export interface ICalendar {
  color: string;
  type: string;
  identifier: string;
  name: string;
  id: string;

  getEvents(): Promise<EventResponse[]>;
}
