import type { EventLocation } from "../types";
import type { AnyEvent } from "./Event";

export type EventResponse = {
  event: AnyEvent;
  location: EventLocation | null;
};

export type EditableEventResponse = Omit<EventResponse, "location"> & {
  location: EventLocation;
};
