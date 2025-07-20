import type { AnyEvent } from "./Event";
import type { DavEvent } from "./DavEvent";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";

export function anyEventToDavEvent({ e, timestamp, uid }: { e: AnyEvent; timestamp?: DateTime; uid?: string }): DavEvent {
  const { start, end, title } = e;
  const id = randomUUID();
  const filename = `${uid ?? id}.ics`;
  return {
    filename,
    end,
    start,
    uid: uid ?? id,
    summary: title,
    description: "",
    timestamp: timestamp ?? DateTime.now()
  };
}
