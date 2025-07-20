import type { EventLocation } from "../types";
import type { EventPathLocation } from "../core/EventStore";
import type { AnyEvent } from "../logic/Event";

export interface IEditableCalendar {
  createEvent(event: AnyEvent): Promise<EventLocation>;

  deleteEvent(location: EventPathLocation): Promise<void>;

  modifyEvent(location: EventPathLocation, newEvent: AnyEvent, updateCacheWithLocation: (loc: EventLocation) => void): Promise<void>;

  containsPath(path: string): boolean;
}
