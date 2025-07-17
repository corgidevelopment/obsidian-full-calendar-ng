import { EventLocation, OFCEvent } from "../types";
import { EventPathLocation } from "../core/EventStore";

export interface IEditableCalendar {
  createEvent(event: OFCEvent): Promise<EventLocation>;
  deleteEvent(location: EventPathLocation): Promise<void>;
  modifyEvent(
    location: EventPathLocation,
    newEvent: OFCEvent,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void>;
}
